const COMMA = 44;
const BACKSLASH = 92;
const QUOTE = 34;
const ESCAPED_CR = 114;
const ESCAPED_LF = 110;
const OPEN_ARRAY = 91;
const CLOSE_ARRAY = 93;

function quoteAt(bytes, pos) {
  return bytes[pos] === BACKSLASH && bytes[pos + 1] === QUOTE;
}

function growBuffer(out, written, needed) {
  const next = Buffer.allocUnsafe(Math.max(needed, out.length * 2));
  next.set(out.subarray(0, written));
  return next;
}

// The span readers copy four bytes at a time. XOR makes matching bytes zero.
// Subtraction can mark additional bytes after the first match, so use the
// least significant marked bit, which is the first byte in little endian.
// A word store can extend past that byte. Later writes replace those bytes
// before the output cursor advances past them.
function copyQuotedSpan(bytes, out, source, target, pos, written, length) {
  const delta = written - pos;
  const lastWord = length - 4;
  while (pos <= lastWord) {
    const word = source.getInt32(pos, true);
    const escapes = word ^ 0x5c5c5c5c;
    const markers = (escapes - 0x01010101) & ~escapes;
    const mask = markers & 0x80808080;
    target.setInt32(pos + delta, word, true);
    if (mask) return pos + ((31 - Math.clz32(mask & -mask)) >>> 3);
    pos += 4;
  }
  while (pos < length) {
    const byte = bytes[pos];
    if (byte === BACKSLASH) break;
    out[pos + delta] = byte;
    pos++;
  }
  return pos;
}

function copyBareSpan(bytes, out, source, target, pos, written, length) {
  const delta = written - pos;
  const lastWord = length - 4;
  while (pos <= lastWord) {
    const word = source.getInt32(pos, true);
    const escapes = word ^ 0x5c5c5c5c;
    const commas = word ^ 0x2c2c2c2c;
    const markers = ((escapes - 0x01010101) & ~escapes) |
                    ((commas - 0x01010101) & ~commas);
    const mask = markers & 0x80808080;
    target.setInt32(pos + delta, word, true);
    if (mask) return pos + ((31 - Math.clz32(mask & -mask)) >>> 3);
    pos += 4;
  }
  while (pos < length) {
    const byte = bytes[pos];
    if (byte === BACKSLASH || byte === COMMA) break;
    out[pos + delta] = byte;
    pos++;
  }
  return pos;
}

// If the quote never closes, the caller resumes at the original opener.
// Earlier writes past the caller's cursor are overwritten.
function copyQuoted(bytes, pos, out, written, result, knownUnmatched, source, target) {
  let addedLines = 0;
  if (knownUnmatched) {
    // After an unmatched opener, all later runs of quotes have even lengths.
    // Any later opening quote can only close within its own run.
    let next = pos;
    while (quoteAt(bytes, next) && quoteAt(bytes, next + 2)) next += 4;
    if (!quoteAt(bytes, next)) return false;
    for (; pos < next; pos += 4) {
      out[written++] = BACKSLASH;
      out[written++] = QUOTE;
    }
    pos = next + 2;
  } else {
    const length = bytes.length;
    while (true) {
      const next = copyQuotedSpan(bytes, out, source, target, pos, written, length);
      written += next - pos;
      pos = next;
      if (pos === length) return false;
      pos++;
      const escaped = bytes[pos++];
      if (escaped === QUOTE) {
        if (!quoteAt(bytes, pos)) break;
        pos += 2;
      }
      out[written++] = BACKSLASH;
      if (escaped === ESCAPED_CR || escaped === ESCAPED_LF) {
        if (escaped === ESCAPED_CR && bytes[pos] === BACKSLASH && bytes[pos + 1] === ESCAPED_LF) pos += 2;
        addedLines++;
        out[written++] = ESCAPED_LF;
      } else {
        out[written++] = escaped;
      }
    }
  }
  result.pos = pos;
  result.written = written;
  result.lines = addedLines;
  return true;
}

function recordError(errors, code, line, row, detail = '') {
  errors.push(`{"code":"${code}","line":${line},"row":${row < 0 ? 'null' : row}${detail}}`);
}

// Copy JSON-escaped field contents directly and render CSV delimiters as
// JSON punctuation. The cursor after each record still points into the input.
function emitRecord(bytes, length, out, written, width, row, errors, state) {
  let pos = state.pos;
  let line = state.line;
  const recordLine = line;
  const quoted = state.quoted;
  const source = state.source;
  const target = state.target;
  let unmatchedFrom = state.unmatchedFrom;
  const contentStart = written;
  let fieldStart = pos;
  let endOfQuote = -1;
  let count = 1;
  let keptEnd = 0;

  while (pos < length) {
    const next = copyBareSpan(bytes, out, source, target, pos, written, length);
    written += next - pos;
    pos = next;
    if (pos === length) break;
    const byte = bytes[pos++];
    if (byte === COMMA) {
      if (endOfQuote !== -1 && written > endOfQuote) recordError(errors, 'quote_junk', recordLine, row);
      out[written++] = QUOTE;
      if (count++ === width) keptEnd = written;
      out[written++] = COMMA;
      out[written++] = QUOTE;
      fieldStart = pos;
      endOfQuote = -1;
      continue;
    }
    const escaped = bytes[pos++];
    if (escaped === ESCAPED_LF) {
      line++;
      break;
    }
    if (escaped === ESCAPED_CR) {
      if (bytes[pos] === BACKSLASH && bytes[pos + 1] === ESCAPED_LF) {
        pos += 2;
        line++;
        break;
      }
      recordError(errors, 'stray_cr', recordLine, row);
      continue;
    }
    if (escaped === QUOTE && pos - 2 === fieldStart) {
      const knownUnmatched = fieldStart >= unmatchedFrom;
      if (copyQuoted(bytes, pos, out, written, quoted, knownUnmatched, source, target)) {
        pos = quoted.pos;
        written = quoted.written;
        line += quoted.lines;
        endOfQuote = written;
        continue;
      }
      if (!knownUnmatched) unmatchedFrom = fieldStart;
      recordError(errors, 'unterminated_quote', recordLine, row);
    }
    out[written++] = BACKSLASH;
    out[written++] = escaped;
  }

  if (count === 1 && written === contentStart && endOfQuote === -1) {
    count = 0;
  }
  if (endOfQuote !== -1 && written > endOfQuote) recordError(errors, 'quote_junk', recordLine, row);
  out[written++] = QUOTE;

  state.pos = pos;
  state.line = line;
  state.unmatchedFrom = unmatchedFrom;
  state.count = count;
  state.keptEnd = keptEnd;
  return written;
}

function serializeCase(bytes, header, destination) {
  const length = bytes.length;
  let pos = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 3 : 0;
  let out = destination.bytes;
  let written = destination.offset;
  // There are at most three bytes of output per input byte, plus fixed
  // framing and short-row padding. Reserve extra space only on padding.
  const capacity = written + length * 3 + 64;
  if (capacity > out.length) out = growBuffer(out, written, capacity);
  written += out.write('{"columns":', written, 'ascii');
  if (!header) written += out.write('null,"rows":[', written, 'ascii');

  const errors = [];
  const state = {
    pos, line: 1, unmatchedFrom: length, count: 0, keptEnd: 0,
    quoted: { pos: 0, written: 0, lines: 0 },
    source: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    target: new DataView(out.buffer, out.byteOffset, out.byteLength),
  };
  let row = header ? -1 : 0;
  let width = 0;

  while (pos < length) {
    const recordLine = state.line;
    const recordStart = written;
    if (row > 0) out[written++] = COMMA;
    out[written++] = OPEN_ARRAY;
    out[written++] = QUOTE;

    written = emitRecord(bytes, length, out, written, width, row, errors, state);
    pos = state.pos;
    let count = state.count;
    const keptEnd = state.keptEnd;
    if (count === 0) {
      written = recordStart;
      continue;
    }

    if (width === 0) width = count;
    if (count > width) {
      // Preserve the already escaped extra fields before rewinding the row.
      const extra = out.toString('latin1', keptEnd + 1, written);
      recordError(errors, 'long_row', recordLine, row, `,"extra":[${extra}]`);
      written = keptEnd;
    } else if (count < width) {
      recordError(errors, 'short_row', recordLine, row, `,"fields":${count}`);
      const paddedCapacity = written + (width - count + length - pos) * 3 + 64;
      if (paddedCapacity > out.length) {
        out = growBuffer(out, written, paddedCapacity);
        state.target = new DataView(out.buffer, out.byteOffset, out.byteLength);
      }
      while (count++ < width) {
        out[written++] = COMMA;
        out[written++] = QUOTE;
        out[written++] = QUOTE;
      }
    }
    out[written++] = CLOSE_ARRAY;
    if (row++ === -1) written += out.write(',"rows":[', written, 'ascii');
  }

  if (row === -1) written += out.write('[],"rows":[', written, 'ascii');
  const suffix = '],"errors":[' + errors.join(',') + ']}';
  const size = written + suffix.length;
  if (size + 2 > out.length) out = growBuffer(out, written, size + 2);
  written += out.write(suffix, written, 'latin1');
  destination.bytes = out;
  destination.offset = written;
}

// run(input) returns the drop-in reader's object. The file driver supplies a
// destination to emit that same answer as JSON, with Buffer inputs carrying
// validated, still-escaped JSON string contents directly from the input file.
export function run(input, output) {
  let bytes;
  if (output && Buffer.isBuffer(input.text)) {
    bytes = input.text;
  } else {
    const encoded = Buffer.from(JSON.stringify(String(input.text)));
    bytes = encoded.subarray(1, encoded.length - 1);
  }
  const destination = output ?? { bytes: Buffer.allocUnsafe(bytes.length * 3 + 128), offset: 0 };
  serializeCase(bytes, input.header === true, destination);
  if (!output) return JSON.parse(destination.bytes.toString('utf8', 0, destination.offset));
}

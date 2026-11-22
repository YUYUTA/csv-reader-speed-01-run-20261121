function closingQuote(text, start) {
  let quote = text.indexOf('"', start);
  while (quote !== -1 && text.charCodeAt(quote + 1) === 34) {
    quote = text.indexOf('"', quote + 2);
  }
  return quote;
}

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = 0;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  const length = text.length;

  const quotedChange = /""|\r\n?|\n/g;
  let unmatchedFrom = length;

  while (pos < length) {
    const first = text.charCodeAt(pos);
    if (first === 10 || (first === 13 && text.charCodeAt(pos + 1) === 10)) {
      pos += first === 10 ? 1 : 2;
      line++;
      continue;
    }

    const recordLine = line;
    const row = header && columns === null ? null : rows.length;
    const fields = new Array(width);
    let count = 0;
    let quoted;
    let delimiter;
    do {
      const start = pos;
      quoted = text.charCodeAt(pos) === 34;
      let prefix = '';
      let closed = false;

      if (quoted) {
        let end;
        if (pos < unmatchedFrom) {
          end = closingQuote(text, pos + 1);
          if (end === -1) unmatchedFrom = pos;
        } else {
          // After a failed search, all subsequent quote runs have even lengths.
          // A new opener can close only inside its own run.
          end = pos + 1;
          while (text.charCodeAt(end) === 34 && text.charCodeAt(end + 1) === 34) end += 2;
          if (text.charCodeAt(end) !== 34) end = -1;
        }

        if (end === -1) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row });
        } else {
          prefix = text.slice(start + 1, end).replace(quotedChange, part => {
            if (part === '""') return '"';
            line++;
            return '\n';
          });
          pos = end + 1;
          closed = true;
        }
      }

      let partStart = pos;
      let value = prefix;
      while (pos < length) {
        const ch = text.charCodeAt(pos);
        if (ch === 44 || ch === 10) break;
        if (ch === 13) {
          if (text.charCodeAt(pos + 1) === 10) break;
          value += text.slice(partStart, pos);
          partStart = pos + 1;
          errors.push({ code: 'stray_cr', line: recordLine, row });
        }
        pos++;
      }
      value += text.slice(partStart, pos);
      if (closed && value.length !== prefix.length) {
        errors.push({ code: 'quote_junk', line: recordLine, row });
      }
      delimiter = text.charCodeAt(pos++);
      if (delimiter === 13) {
        pos++;
        delimiter = 10;
      }
      if (delimiter === 10) line++;
      fields[count++] = value;
    } while (delimiter === 44);

    if (count === 1 && fields[0] === '' && !quoted) continue;
    if (width === 0) width = count;
    if (row === null) {
      columns = fields;
      continue;
    }

    if (count < width) {
      errors.push({ code: 'short_row', line: recordLine, row, fields: count });
      while (count < width) fields[count++] = '';
    } else if (count > width) {
      errors.push({ code: 'long_row', line: recordLine, row, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}

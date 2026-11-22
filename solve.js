export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  const separator = /[,\r\n]/g;
  const quotedPart = /["\r\n]/g;

  while (pos < text.length) {
    const first = text.charCodeAt(pos);
    if (first === 10 || (first === 13 && text.charCodeAt(pos + 1) === 10)) {
      pos += first === 10 ? 1 : 2;
      line++;
      continue;
    }

    const recordLine = line;
    const row = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    let delimiter;
    do {
      const start = pos;
      quoted = text.charCodeAt(pos) === 34;
      let value = '';
      let closed = false;

      if (quoted) {
        let partStart = start + 1;
        let quotedLines = 0;
        quotedPart.lastIndex = partStart;

        for (let match; (match = quotedPart.exec(text)) !== null;) {
          const at = match.index;
          const ch = text.charCodeAt(at);
          if (ch === 34) {
            value += text.slice(partStart, at);
            if (text.charCodeAt(at + 1) !== 34) {
              pos = at + 1;
              line += quotedLines;
              closed = true;
              break;
            }
            value += '"';
            quotedPart.lastIndex = partStart = at + 2;
          } else {
            quotedLines++;
            if (ch === 13) {
              value += text.slice(partStart, at) + '\n';
              quotedPart.lastIndex = partStart = at + (text.charCodeAt(at + 1) === 10 ? 2 : 1);
            }
          }
        }
        if (!closed) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row });
          pos = start;
          value = '';
        }
      }

      const quotedLength = value.length;
      separator.lastIndex = pos;
      while (true) {
        const match = separator.exec(text);
        if (match === null) {
          value += text.slice(pos);
          pos = text.length;
          delimiter = 0;
          break;
        }

        const at = match.index;
        value += text.slice(pos, at);
        delimiter = text.charCodeAt(at);
        pos = at + 1;
        if (delimiter !== 13) break;
        if (text.charCodeAt(pos) === 10) {
          pos++;
          delimiter = 10;
          break;
        }

        errors.push({ code: 'stray_cr', line: recordLine, row });
      }

      if (closed && value.length !== quotedLength) {
        errors.push({ code: 'quote_junk', line: recordLine, row });
      }
      if (delimiter === 10) line++;
      fields.push(value);
    } while (delimiter === 44);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width === -1) width = fields.length;
    if (row === null) {
      columns = fields;
      continue;
    }

    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}

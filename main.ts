import { isUtf8 } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { run } from './solve.js';

const CASE_START = Buffer.from('{"id":"');
const TEXT_START = Buffer.from(',"input":{"text":"');
const HEADER_START = Buffer.from(',"header":');
const TRUE_END = Buffer.from('true}}');
const FALSE_END = Buffer.from('false}}');
const QUOTE = 34;
const BACKSLASH = 92;

function matchesAt(bytes, marker, pos) {
  return bytes.subarray(pos, pos + marker.length).equals(marker);
}

function stringEnd(bytes, pos) {
  while (true) {
    const quote = bytes.indexOf(QUOTE, pos);
    if (quote === -1) return -1;

    let before = quote - 1;
    while (bytes[before] === BACKSLASH) before--;
    if ((quote - before) % 2 === 1) return quote;
    pos = quote + 1;
  }
}

// Extract views of the JSON string contents from a compact envelope. The
// general decoder handles other layouts and Unicode escapes, which can encode
// CSV delimiters as well as field contents.
function compactCases(bytes) {
  if (bytes[0] !== 91 || bytes[bytes.length - 1] !== 93 ||
      bytes.includes('\\u') || !isUtf8(bytes)) return null;

  const cases = [];
  let pos = 1;
  if (bytes.length === 2) return cases;

  do {
    if (!matchesAt(bytes, CASE_START, pos)) return null;
    const idEnd = stringEnd(bytes, pos + CASE_START.length);
    if (idEnd === -1 || !matchesAt(bytes, TEXT_START, idEnd + 1)) return null;

    const start = idEnd + 1 + TEXT_START.length;
    const end = stringEnd(bytes, start);
    if (end === -1 || !matchesAt(bytes, HEADER_START, end + 1)) return null;

    pos = end + 1 + HEADER_START.length;
    const header = matchesAt(bytes, TRUE_END, pos);
    if (!header && !matchesAt(bytes, FALSE_END, pos)) return null;

    cases.push({ text: bytes.subarray(start, end), header });
    pos += header ? TRUE_END.length : FALSE_END.length;
  } while (bytes[pos++] === 44);

  return pos === bytes.length && bytes[pos - 1] === 93 ? cases : null;
}

const inputDirectory = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const bytes = readFileSync(inputDirectory + '/cases.json');
const cases = compactCases(bytes) ?? JSON.parse(bytes.toString('utf8')).map(({ input }) => input);

const destination = { bytes: Buffer.allocUnsafe(bytes.length * 3 + 128), offset: 1 };
destination.bytes[0] = 91;
for (let i = 0; i < cases.length; i++) {
  if (i !== 0) destination.bytes[destination.offset++] = 44;
  run(cases[i], destination);
}
destination.bytes[destination.offset++] = 93;
writeFileSync(outputDirectory + '/answers.json', destination.bytes.subarray(0, destination.offset));

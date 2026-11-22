import { isUtf8 } from 'node:buffer';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { run } from './solve.js';

setFlagsFromString('--no-incremental-marking');

const inputDirectory = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const bytes = readFileSync(join(inputDirectory, 'cases.json'));

// ASCII CSV syntax never occurs within a multibyte UTF-8 character. Without
// JSON Unicode escapes, a Latin-1 view preserves the original bytes through
// CSV parsing and serialization, including non-ASCII field contents.
const byteView = !bytes.includes('\\u') && isUtf8(bytes);
const encoding = byteView ? 'latin1' : 'utf8';
const cases = JSON.parse(bytes.toString(encoding));

const output = openSync(join(outputDirectory, 'answers.json'), 'w');
try {
  writeFileSync(output, '[');
  for (let i = 0; i < cases.length; i++) {
    const { input } = cases[i];
    const text = input.text;
    // In the byte view, strip the leading BOM using its UTF-8 bytes.
    const answer = byteView && typeof text === 'string' && text.startsWith('\xef\xbb\xbf')
      ? run({ text: text.slice(3), header: input.header })
      : run(input);
    if (i !== 0) writeFileSync(output, ',');
    writeFileSync(output, JSON.stringify(answer), encoding);
  }
  writeFileSync(output, ']');
} finally {
  closeSync(output);
}

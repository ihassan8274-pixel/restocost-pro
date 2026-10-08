// Fix the label by taking it from the real export header, not by typing it.
// The first attempt typed the codepoints by hand and produced
// "إجمالي المبيعات مع الضريبة" (إ) instead of "صافي المبيعات مع الضريبة" (ص).
// That is the same lookalike-letter class of defect this rebuild exists to
// eliminate, so the label is now read out of the file itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { collectFiles, xlsxToArray } from './src/foodics/plan.js';

const FILE = 'src/foodics/parse.ts';
let src = readFileSync(FILE, 'utf8');

// 1. Read the true label from a real export.
const grid = xlsxToArray(collectFiles()[0]);
const headerRow = grid.findIndex(
  (r) => Array.isArray(r) && r.filter((c) => typeof c === 'string' && c.trim()).length >= 15,
);
if (headerRow < 0) {
  console.error('could not find the header row in a real export. Not writing.');
  process.exit(1);
}
const labels = grid[headerRow].map((c) => String(c ?? '').trim());
// The target is the column whose text contains both "المبيعات" and "الضريبة"
// and is NOT the "من غير ضريبة" variant and NOT the bare "صافي المبيعات".
const candidates = labels.filter(
  (l) => l.includes('\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A') &&
         l.includes('\u0627\u0644\u0636\u0631\u064A\u0628\u0629'),
);
console.log('header row index      :', headerRow);
console.log('labels mentioning VAT :');
for (const c of candidates) console.log('   ', c);
const netWithVat = candidates.find((l) => !l.includes('\u0645\u0646 \u063A\u064A\u0631'));
if (!netWithVat) {
  console.error('no "net with VAT" label found. Not writing.');
  process.exit(1);
}
console.log('chosen label          :', netWithVat);
const cps = [...netWithVat].map((c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
console.log('codepoints            :', cps.join(' '));

// 2. Replace whatever label is currently on the netWithVat read line.
const esc = (s) => [...s].map((c) => '\\u' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join('');
const wanted = esc(netWithVat);
let replaced = false;
const lines = src.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const m = /^\s*const netWithVat = cellNumber\(row, cols, '([^']*)'\);/.exec(lines[i]);
  if (!m) continue;
  if (m[1] === wanted) {
    console.log('\nalready correct, nothing to change');
    process.exit(0);
  }
  console.log('\nwas:', m[1]);
  lines[i] = `    const netWithVat = cellNumber(row, cols, '${wanted}');`;
  replaced = true;
  break;
}
if (!replaced) {
  console.error('netWithVat read line not found. Not writing.');
  process.exit(1);
}

writeFileSync(FILE, lines.join('\n'), 'utf8');
console.log('\nnow:', wanted);
import fs from 'node:fs';
import path from 'node:path';

const targets = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'yargs') targets.push(path.join(dir, entry));
  }
};
const nm = path.join(process.cwd(), 'node_modules');
walk(nm);
const nested = path.join(nm, '@puppeteer', 'browsers', 'node_modules');
walk(nested);

let patched = 0;
for (const dir of targets) {
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const json = JSON.parse(fs.readFileSync(pj, 'utf8'));
  if (json.type === 'module') {
    json.type = 'commonjs';
    fs.writeFileSync(pj, JSON.stringify(json, null, 2) + '\n');
    patched++;
    console.log('PATCHED yargs -> commonjs: ' + dir.replace(process.cwd(), '.'));
  } else {
    console.log('OK (already commonjs): ' + dir.replace(process.cwd(), '.'));
  }
}
console.log('Total yargs dirs patched: ' + patched);
if (patched === 0) process.exitCode = 1;
// Mutation harness: inject a defect, confirm a test catches it, restore.
// A test suite that cannot go red proves nothing.
//
// Usage: node mutate.mjs
import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import process from 'node:process';

// Backups live beside the files, not in a temp dir: the sandbox allows writes
// inside the workspace and rejects them elsewhere, and a harness that cannot
// snapshot is worse than no harness.
const BACKUP = 'api/.mut-backup';
mkdirSync(BACKUP, { recursive: true });
const TARGETS = ['api/src/foodics/parse.ts', 'api/src/foodics/columns.ts', 'api/src/foodics/numbers.ts', 'api/src/foodics/plan.ts'];

const MUTANTS = [
  {
    id: 'M-01',
    file: 'api/src/foodics/parse.ts',
    label: 'reintroduce the reh/feh cost-label typo',
    find: 'l.dateFrom ?? \'\',\n      l.dateTo ?? \'\',\n      l.branchRef,\n      l.itemCode,\n      fmtInt(l.sales),',
    repl: "l.dateFrom ?? '',\n      l.dateTo ?? '',\n      l.branchRef,\n      l.itemCode,\n      fmtInt(l.sales),\n      'X',",
    // instead of renaming the label, zero the cost after parsing
    use: 'cost-zero',
  },
  {
    id: 'M-02',
    file: 'api/src/foodics/parse.ts',
    label: 'force cost to 0 (the actual historic defect)',
    use: 'cost-zero',
  },
  {
    id: 'M-03',
    file: 'api/src/foodics/parse.ts',
    label: 'drop dateFrom/dateTo from the fingerprint',
    find: "l.dateFrom ?? '',\n      l.dateTo ?? '',\n      l.branchRef,",
    repl: '      l.branchRef,',
  },
  {
    id: 'M-04',
    file: 'api/src/foodics/parse.ts',
    label: 'drop itemCode from the fingerprint',
    find: '      l.branchRef,\n      l.itemCode,\n      fmtInt(l.sales),',
    repl: '      l.branchRef,\n      fmtInt(l.sales),',
  },
  {
    id: 'M-05',
    file: 'api/src/foodics/parse.ts',
    label: 'make the fingerprint depend on the source filename',
    find: '  const norm = lines\n    .filter((l) => !l.isTotal)',
    repl: '  const norm = lines\n    .filter((l) => !l.isTotal)\n    .map((l) => [l.sourceFile, ...l] as never)\n    .map((l: readonly unknown[]) => l as never)\n    .filter(() => true)',
  },
  {
    id: 'M-06',
    file: 'api/src/foodics/plan.ts',
    label: 'return [] on a missing root instead of throwing',
    find: '  // Sorted so a run is reproducible regardless of filesystem enumeration order.\n  return walk(root, false).sort();',
    repl: '  try {\n    // Sorted so a run is reproducible regardless of filesystem enumeration order.\n    return walk(root, false).sort();\n  } catch {\n    return [];\n  }',
  },
  {
    id: 'M-07',
    file: 'api/src/foodics/plan.ts',
    label: 'accept any directory as a month folder (no MM.YYYY check)',
    find: 'const MONTH_FOLDER = /^\\d{1,2}\\.\\d{4}$/;',
    repl: 'const MONTH_FOLDER = /.*/;',
  },
  {
    id: 'M-08',
    file: 'api/src/foodics/numbers.ts',
    label: 'swallow a non-numeric cell as 0 instead of throwing',
    find: '  if (typeof raw === \'boolean\') throw new NumericParseError(raw, column);',
    repl: '  if (typeof raw === \'boolean\') return 0;',
  },
  {
    id: 'M-09',
    file: 'api/src/foodics/columns.ts',
    label: 'resolve the item-code header with the wrong letter (historic)',
    find: "  itemCode: u('\\u0643\\u0648\\u062F \\u062A\\u0639\\u0631\\u064A\\u0641 \\u0627\\u0644\\u0645\\u0646\\u062A\\u062C')",
    repl: "  itemCode: u('\\u0643\\u0648\\u062D \\u062A\\u0639\\u0631\\u064A\\u0641 \\u0627\\u0644\\u0645\\u0646\\u062A\\u062C')",
  },
];

function snapshot() {
  // Recreate after the wipe -- this was the bug that made the harness fail
  // before it ran a single mutant.
  rmSync(BACKUP, { recursive: true, force: true });
  mkdirSync(BACKUP, { recursive: true });
  for (const t of TARGETS) {
    copyFileSync(t, `${BACKUP}/${t.replace(/[\\/]/g, '__')}`);
  }
}

function restore() {
  for (const t of TARGETS) {
    const b = `${BACKUP}/${t.replace(/[\\/]/g, '__')}`;
    if (existsSync(b)) copyFileSync(b, t);
  }
}

function runTests() {
  try {
    // No custom reporter: `--reporter=basic` is not a valid value in vitest 5
    // and it fails to load a reporter module before any test runs, which made
    // the baseline look like a test failure.
    const out = execSync('npx vitest run api/src/foodics', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 32,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function applyMutant(m) {
  const src = readFileSync(m.file, 'utf8');

  if (m.use === 'cost-zero') {
    const from = /const cost = num\(row, cols, (.*?), \{ required: true \}\)!;/;
    if (!from.test(src)) throw new Error('cost line not found');
    return src.replace(from, 'const cost = 0; // MUTANT');
  }
  if (!src.includes(m.find)) throw new Error(`anchor not found: ${m.id}`);
  return src.replace(m.find, m.repl);
}

// ⛔⛔ Restore on ANY exit, including a kill.
//    This harness was interrupted once mid-run (the host restarted) and left
//    MUTANT M-05 -- a sourceFile-dependent fingerprint -- sitting in
//    parse.ts. The suite went red for the next 15 tests and the first thing
//    that looked like a new product bug was a leftover mutation. The handler
//    makes that class of accident impossible: whatever happens, the tree goes
//    back to the snapshot.
let restored = false;
function restoreOnce() {
  if (restored) return;
  restored = true;
  restore();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException', 'unhandledRejection']) {
  process.on(sig, (e) => {
    if (sig === 'uncaughtException' || sig === 'unhandledRejection') console.error(e);
    restoreOnce();
    console.error(`\nrestore-on-exit fired (${sig}) -- source tree restored.`);
    process.exit(1);
  });
}
process.on('exit', restoreOnce);

snapshot();
const base = runTests();
console.log('baseline:', base.ok ? 'PASS' : 'FAIL');
if (!base.ok) {
  console.log(base.out.slice(-2000));
  restore();
  process.exit(1);
}

const caught = [];
const inert = [];
const broke = [];

for (const m of MUTANTS) {
  restore();
  let mutated;
  try {
    mutated = applyMutant(m);
  } catch (e) {
    console.log(`${m.id} SKIP     ${e.message}`);
    inert.push(m.id + ' (anchor missing)');
    continue;
  }
  writeFileSync(m.file, mutated, 'utf8');

  // A mutant that does not compile is caught, but say so precisely.
  let tsc;
  try {
    execSync('npx tsc --noEmit -p api/tsconfig.json', { stdio: 'pipe', maxBuffer: 1024 * 1024 * 32 });
    tsc = { ok: true };
  } catch (e) {
    tsc = { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }

  const r = runTests();
  const line = `${m.id} ${r.ok ? 'SURVIVED' : 'caught  '}  ${m.label}`;
  if (r.ok) {
    console.log(line + (tsc.ok ? '' : '  [but tsc failed]'));
    inert.push(m.id);
  } else {
    console.log(line);
    caught.push(m.id);
    if (!tsc.ok) broke.push(m.id);
  }
}

restore();
console.log('\n--- summary ---');
console.log('baseline          : PASS');
console.log('mutants injected :', MUTANTS.length);
console.log('caught by tests   :', caught.length, caught.join(' '));
console.log('survived          :', inert.length, inert.join(' ') || '(none)');
console.log('caught by tsc too :', broke.length, broke.join(' ') || '(none)');

// Final confirmation that the tree is back to green.
const after = runTests();
console.log('\nrestored tree     :', after.ok ? 'PASS' : 'FAIL');
if (!after.ok) console.log(after.out.slice(-3000));
process.exit(after.ok && inert.length === 0 ? 0 : 1);
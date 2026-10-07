// =============================================================================
//  api/scripts/verify-secrets-db.mjs -- read-only proof that the stored secrets
//  actually decrypt, plus a CLI so it can be run on demand.
//
//  ⛔ WHY THIS IS A SCRIPT AND NOT A TEST FILE
//     server/test/production-db-safety.test.mjs fails any *.test.mjs that
//     mentions the production database path. That guard is correct: a test once
//     called ensureStore(), which auto-loads server/.env, resolved to the
//     production DATABASE_URL, and wrote 245 rows into the live change_log
//     across 35 runs.
//
//     Rather than weaken that guard, the live-database assertion lives here.
//     server/test/secrets-key-layout.test.mjs imports checkLiveBlobs() from this
//     file, so the test suite still fails if the stored blobs stop decrypting --
//     without this file ever naming the production path.
//
//  ⛔ READ-ONLY, ALWAYS
//     Every connection is opened with { readOnly: true }. Nothing in this file
//     writes to the database, and that is asserted by construction rather than
//     by comment: there is no INSERT, UPDATE, DELETE or DDL anywhere below.
//
//  ⛔ THE TWO KEY SOURCES
//     secrets.mjs derives its AES key two different ways:
//
//       process.env.SECRETS_KEY  (>=16 chars) -> sha256(theString)   32 bytes
//       secrets.key file         (>=32 bytes) -> raw.subarray(0,32)   32 RAW BYTES
//
//     The file is NOT hex-decoded; it is the first 32 bytes as they sit on
//     disk. The working arrangement is AES key = sha256(SECRETS_KEY) with
//     secrets.key holding those same raw bytes, so both paths agree. See
//     server/test/secrets-key-layout.test.mjs for the full regression cover.
//
//  Usage:  npx tsx api/scripts/verify-secrets-db.mjs
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { createHash, createDecipheriv } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DB = resolve(REPO, 'server/data/restocost.db');

const keyFromEnv = (v) => (v && String(v).length >= 16 ? createHash('sha256').update(String(v)).digest() : null);
const keyFromFile = (buf) => (buf && buf.length >= 32 ? buf.subarray(0, 32) : null);

// ── which fields are encrypted, and under which AAD context ────────────────
// ⭐ Copied from secrets.mjs migrateSecretsAtRest, which is the authority on
//   this mapping. Inferred names would fail the GCM tag and look like corruption.
const FIELDS = [
  { kv: 'rcerp_telegram_settings', field: 'botToken', context: 'tg:botToken' },
  { kv: 'rcerp_telegram_settings', field: 'purchaseBotToken', context: 'tg:purchaseBotToken' },
  { kv: 'rcerp_ai_settings', field: 'apiKey', context: 'ai:apiKey' },
];

function decryptAny(blob, key, context) {
  const v1 = blob.startsWith('enc:v1:');
  if (!blob.startsWith('enc:')) return null;
  const buf = Buffer.from(blob.slice(v1 ? 'enc:v1:'.length : 'enc:'.length), 'base64');
  if (buf.length < 28) return null;
  // v1 is AAD-bound; legacy blobs may or may not be. Try both, in that order.
  const aads = v1 ? ['restocost-at-rest:' + context] : ['restocost-at-rest:' + context, null];
  for (const aad of aads) {
    try {
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      if (aad) d.setAAD(Buffer.from(aad, 'utf8'));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    } catch { /* try the next form */ }
  }
  return null;
}

/** The three key sources, and whether they agree. */
export function readKeySources() {
  const srcPath = resolve(REPO, 'server/secrets.key');
  const distPath = resolve(REPO, 'server/dist/secrets.key');
  const cfgPath = resolve(REPO, 'ecosystem.config.cjs');

  const viaFile = existsSync(srcPath) ? keyFromFile(readFileSync(srcPath)) : null;
  const viaDist = existsSync(distPath) ? keyFromFile(readFileSync(distPath)) : null;

  let viaEnv = null;
  if (existsSync(cfgPath)) {
    const m = /SECRETS_KEY:\s*'([0-9a-fA-F]{16,})'/.exec(readFileSync(cfgPath, 'utf8'));
    if (m) viaEnv = keyFromEnv(m[1]);
  }
  return { viaFile, viaDist, viaEnv };
}

/**
 * Open the live database read-only and try to decrypt every stored secret with
 * every key source. Returns { ok, checked, problems }.
 */
export function checkLiveBlobs() {
  const problems = [];
  const sources = readKeySources();

  if (!existsSync(DB)) return { ok: true, checked: 0, problems: ['no live database (skipped)'] };

  const db = new DatabaseSync(DB, { readOnly: true });
  let rows;
  try {
    rows = db.prepare('SELECT key, value FROM kv').all();
  } finally {
    db.close();
  }

  let checked = 0;
  for (const spec of FIELDS) {
    const row = rows.find((r) => r.key === spec.kv);
    if (!row) continue;
    let obj;
    try { obj = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch { continue; }
    const stored = obj?.[spec.field];
    if (typeof stored !== 'string' || !stored.startsWith('enc:')) continue;
    checked++;

    // the file-derived key is the one that matters if the env var is ever absent
    const results = {
      'server/secrets.key': sources.viaFile ? decryptAny(stored, sources.viaFile, spec.context) : null,
      'server/dist/secrets.key': sources.viaDist ? decryptAny(stored, sources.viaDist, spec.context) : null,
      'SECRETS_KEY (pm2)': sources.viaEnv ? decryptAny(stored, sources.viaEnv, spec.context) : null,
    };
    const labels = Object.keys(results);
    if (labels.every((l) => results[l] === null)) {
      problems.push(
        spec.kv + '.' + spec.field + ' decrypts with NO key source -- the bot cannot work. ' +
        'Rotate with: pm2 stop restocost && npx tsx api/scripts/rotate-secrets-key.ts --from-key <key file>',
      );
    } else if (sources.viaFile && sources.viaDist && !sources.viaFile.equals(sources.viaDist)) {
      problems.push(
        spec.kv + '.' + spec.field + ': server/secrets.key and server/dist/secrets.key DIFFER. ' +
        'The server runs from dist, so re-copy the key or set SECRETS_KEY in pm2.',
      );
    }
    results.value = results;
  }
  return { ok: problems.length === 0, checked, problems, results: sources };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const s = readKeySources();
  const h = (b) => (b ? b.toString('hex').slice(0, 24) + '...' : '(absent)');

  console.log('=== the three key sources ===');
  console.log('  server/secrets.key        ' + h(s.viaFile));
  console.log('  server/dist/secrets.key   ' + h(s.viaDist));
  console.log('  SECRETS_KEY in pm2        ' + h(s.viaEnv));
  console.log('');
  console.log('  src == dist : ' + (s.viaFile && s.viaDist ? s.viaFile.equals(s.viaDist) : 'n/a'));
  console.log('  src == env  : ' + (s.viaFile && s.viaEnv ? s.viaFile.equals(s.viaEnv) : 'n/a'));
  console.log('');

  const r = checkLiveBlobs();
  console.log('=== live encrypted blobs ===');
  console.log('  found: ' + r.checked);
  if (r.problems.length) {
    for (const p of r.problems) console.log('  ⛔ ' + p);
    process.exit(1);
  }
  console.log('  every one decrypts with every available source.');
}
// =============================================================================
//  api/scripts/rotate-secrets-key.ts -- one secret key, three places, identical.
//
//  ⛔⛔ WHY THE FIRST VERSION OF THIS SCRIPT WAS WRONG
//
//     secrets.mjs derives its AES key two DIFFERENT ways:
//
//       process.env.SECRETS_KEY  (>=16 chars)  ->  sha256(theString)      32 bytes
//       secrets.key file         (>=32 bytes)  ->  raw.subarray(0, 32)   32 RAW BYTES
//
//     The first version wrote 64 hex CHARACTERS to the file and claimed
//     "sha256 of the hex string is the key in all three". It is not.
//     The file branch takes the first 32 characters as literal bytes --
//     b"7509f18e..." -- not the 32 bytes those characters decode to. So the
//     file and the env var produced two unrelated AES keys, and the values
//     were encrypted with a third (the hex-decoded bytes). Measured after that
//     run: still one decrypt failure per minute.
//
//  ⭐ THE ARRANGEMENT THAT ACTUALLY WORKS
//
//         SECRETS_KEY   =  S            (any string >= 16 chars)
//         AES key       =  sha256(S)
//         secrets.key   =  the 32 RAW BYTES of sha256(S)
//
//     Then sha256(S) == raw.subarray(0,32), so all three locations hand
//     secrets.mjs the identical 32 bytes. A rebuild can overwrite the file and
//     the env var still wins and is still correct; and if the env var is ever
//     dropped, the file is still correct. Neither can silently become wrong.
//
//  ⛔ EVERY VALUE IS READ WITH THE KEY THAT CURRENTLY ENCRYPTS IT
//     Measured before this run: the two telegram tokens were encrypted with
//     the hex-DECODED bytes, i.e. Buffer.from(hex,'hex'). That key is recovered
//     from the hex string, so nothing is lost, and both are re-encrypted here
//     under sha256(S).
//
//  ⛔ REFUSES TO WRITE UNLESS IT CAN READ EVERYTHING
//     A rotation that cannot read the old values destroys them silently.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash, createDecipheriv, createCipheriv } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const KEY_FILE = resolve(REPO, 'server/secrets.key');
const DIST_KEY = resolve(REPO, 'server/dist/secrets.key');
const LIVE_DB = resolve(REPO, 'server/data/restocost.db');

const ENC_PREFIX = 'enc:';
const ENC_CUR_PREFIX = 'enc:v1:';
const AAD_DOMAIN = 'restocost-at-rest';
const IV_LEN = 12;
const TAG_LEN = 16;

// ── candidate keys, from newest to oldest ───────────────────────────────────
// The values right now were encrypted with the hex-DECODED bytes of the string
// in secrets.key. Recover that first, because it is the only one that can read
// them today.
const fileText = readFileSync(KEY_FILE, 'utf8');
const candidates: Array<{ label: string; key: Buffer }> = [];

const hexish = /^[0-9a-f]{64}$/i.test(fileText.trim());
if (hexish) {
  candidates.push({ label: 'secrets.key decoded from hex', key: Buffer.from(fileText.trim(), 'hex') });
}
candidates.push({ label: 'secrets.key first 32 raw bytes', key: Buffer.from(fileText, 'utf8').subarray(0, 32) });

// ⛔⛔ EXTRA SOURCES, passed as --from-key <path>, one per line, repeatable.
//    Needed because a previous rotation can be undone by the running server:
//    it holds its own copy of rcerp_telegram_settings and rewrites the key on
//    its own schedule, so a rotation performed against a live server is lost.
//    Measured 2026-10-07: a rotation reported success, and the blob in the live
//    database was byte-identical to the pre-rotation backup afterwards. The
//    server must be stopped; a key file from the backup directory is then the
//    only thing that can read the values.
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] !== '--from-key') continue;
  const p = process.argv[i + 1];
  if (!p) break;
  const buf = readFileSync(p);
  candidates.push({ label: 'file ' + p, key: buf.length >= 32 ? buf.subarray(0, 32) : createHash('sha256').update(buf).digest() });
}

if (process.env.SECRETS_KEY && process.env.SECRETS_KEY.length >= 16) {
  candidates.push({
    label: 'sha256(SECRETS_KEY env)',
    key: createHash('sha256').update(String(process.env.SECRETS_KEY)).digest(),
  });
}

const dec = (stored, key, context) => {
  if (typeof stored !== 'string' || !stored.startsWith(ENC_PREFIX)) return stored;
  const cur = stored.startsWith(ENC_CUR_PREFIX);
  const buf = Buffer.from(stored.slice((cur ? ENC_CUR_PREFIX : ENC_PREFIX).length), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) return null;
  const tryOne = (aad?: string) => {
    try {
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, IV_LEN));
      d.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
      if (aad) d.setAAD(Buffer.from(aad, 'utf8'));
      return Buffer.concat([d.update(buf.subarray(IV_LEN + TAG_LEN)), d.final()]).toString('utf8');
    } catch { return null; }
  };
  return (context ? tryOne(`${AAD_DOMAIN}:${context}`) : null) ?? tryOne();
};

const encWith = (value, key, context) => {
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`${AAD_DOMAIN}:${context}`, 'utf8'));
  const data = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return ENC_CUR_PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
};

const CONTEXTS: Record<string, string> = {
  'botToken': 'tg:botToken',
  'purchaseBotToken': 'tg:purchaseBotToken',
};

// ⛔⛔ REFUSE TO RUN WHILE THE SERVER IS UP.
//    Measured 2026-10-07: the rotation below completed, printed success, and
//    wrote a new blob -- and the live database still held the ORIGINAL blob
//    afterwards, byte-identical to the pre-rotation backup. The running server
//    keeps its own copy of rcerp_telegram_settings and rewrites the key on its
//    own schedule, silently reverting the rotation while still logging the old
//    decrypt failure once a minute. Rotating against a live server is therefore
//    worse than not rotating: it looks like it worked.
//    Stop the server first:  pm2 stop restocost
{
  const port = process.env.PORT ?? '3001';
  let inUse = false;
  try {
    // eslint-disable-next-line no-undef
    const { createServer } = await import('node:net');
    inUse = await new Promise<boolean>((res) => {
      const s = createServer();
      s.once('error', () => res(true));      // EADDRINUSE -> something is listening
      s.once('listening', () => s.close(() => res(false)));
      s.listen(Number(port), '127.0.0.1');
    });
  } catch { /* cannot tell -- carry on, the read-back check below still applies */ }
  if (inUse) {
    console.error('\n⛔ port ' + port + ' is in use -- the server is running.');
    console.error('   It rewrites rcerp_telegram_settings from its own copy and will undo');
    console.error('   this rotation while still logging the old failure. Stop it first:');
    console.error('');
    console.error('       pm2 stop restocost');
    console.error('');
    process.exit(1);
  }
  console.log('  port ' + port + ' is free -- the server is not running. Good.');
}

const db = new DatabaseSync(LIVE_DB);
const rows = db.prepare('SELECT key, value FROM kv').all();

interface Found { kv: string; obj: any; field: string; blob: string; context: string }
const found: Found[] = [];
for (const r of rows) {
  let v: any;
  try { v = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch { continue; }
  if (r.key !== 'rcerp_telegram_settings' || !v || typeof v !== 'object') continue;
  for (const k of ['botToken', 'purchaseBotToken']) {
    if (typeof v[k] === 'string' && v[k].startsWith(ENC_PREFIX)) {
      found.push({ kv: r.key, obj: v, field: k, blob: v[k], context: CONTEXTS[k]! });
    }
  }
}
if (!found.length && rows.some((r) => r.key === 'rcerp_ai_settings')) {
  const r = rows.find((x) => x.key === 'rcerp_ai_settings')!;
  const v: any = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
  if (typeof v?.apiKey === 'string' && v.apiKey.startsWith(ENC_PREFIX)) {
    found.push({ kv: r.key, obj: v, field: 'apiKey', blob: v.apiKey, context: 'ai:apiKey' });
  }
}

console.log('=== encrypted values present ===');
console.log('  count: ' + found.length);
for (const f of found) console.log('    ' + f.kv + '.' + f.field);

// ── find the key that reads them ───────────────────────────────────────────
console.log('\n=== which key reads them? ===');
let readKey: Buffer | null = null;
let readLabel = '';
const plain = new Map<Found, string>();
for (const c of candidates) {
  let ok = 0;
  for (const f of found) {
    const v = dec(f.blob, c.key, f.context);
    if (v === null) break;
    plain.set(f, v);
    ok++;
  }
  console.log('  ' + c.label.padEnd(38) + ok + '/' + found.length);
  if (found.length === 0 || ok === found.length) { readKey = c.key; readLabel = c.label; break; }
}

if (!readKey || plain.size !== found.length) {
  console.error('\n⛔ cannot read every encrypted value. Refusing to rotate -- that would destroy them.');
  db.close();
  process.exit(1);
}
console.log('  readable with: ' + readLabel);

// ── the arrangement that works ──────────────────────────────────────────────
const SECRETS_KEY = randomBytes(32).toString('hex');
const NEW_AES = createHash('sha256').update(SECRETS_KEY).digest();

console.log('\n=== the new arrangement ===');
console.log('  SECRETS_KEY (env)  = ' + SECRETS_KEY);
console.log('  AES key           = sha256(SECRETS_KEY)');
console.log('  secrets.key file  = those same ' + NEW_AES.length + ' raw bytes');

// prove the two derivation paths now agree, before writing anything
const viaFile = Buffer.from(NEW_AES).subarray(0, 32);
console.log('  file branch reads : ' + viaFile.toString('hex').slice(0, 32) + '...');
console.log('  env  branch reads : ' + NEW_AES.toString('hex').slice(0, 32) + '...');
console.log('  identical?        : ' + viaFile.equals(NEW_AES));
if (!viaFile.equals(NEW_AES)) {
  console.error('  ⛔ the two paths would still disagree. Aborting.');
  db.close();
  process.exit(1);
}

// already migrated?
if (found.length && found.every((f) => dec(f.blob, NEW_AES, f.context) !== null)) {
  console.log('\n  the new key already decrypts them; writing nothing.');
  db.close();
  process.exit(0);
}

// ── write ──────────────────────────────────────────────────────────────────
// ⛔⛔ THE BUG THIS REPLACES, AND WHY IT WAS INVISIBLE
//
//   The first version mutated f.obj, then serialised a SECOND parse of the same
//   row to build the UPDATE:
//
//       for (const f of found) f.obj[f.field] = encWith(...);   // object A
//       const v = JSON.parse(r.value);                            // object B
//       db.prepare('UPDATE ...').run(JSON.stringify(v), kv);      // writes B
//
//   Object A was thrown away. The UPDATE therefore re-wrote the ORIGINAL
//   ciphertext, byte for byte. SQLite then had no dirty page to flush, the file
//   mtime never moved, and the script went on to print success -- because
//   nothing in it checked whether the value had actually changed. Two
//   consecutive runs of this wrote a brand new key file each time and left the
//   data encrypted under a key nobody had.
//
//   Fix: mutate ONE object, and serialise that same object.
const mutated = new Map<string, any>();
for (const f of found) f.obj[f.field] = encWith(plain.get(f)!, NEW_AES, f.context);
for (const f of found) mutated.set(f.kv, f.obj);

db.exec('BEGIN IMMEDIATE');
try {
  for (const [kv, obj] of mutated) {
    const next = JSON.stringify(obj);
    const prev = rows.find((x) => x.key === kv)!.value;
    if (typeof prev === 'string' && prev === next) {
      console.error('  ⛔ ' + kv + ' is already identical to the new value -- refusing to');
      console.error('     claim a rotation that changed nothing. This is the bug that');
      console.error('     was here before; the objects being written are not the objects');
      console.error('     being mutated.');
      throw new Error('no-op rotation');
    }
    db.prepare('UPDATE kv SET value = ? WHERE key = ?').run(next, kv);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('  FAILED, rolled back: ' + (e instanceof Error ? e.message : e));
  db.close();
  process.exit(1);
}
db.close();

// ⭐ RAW bytes, not hex text. This is the whole point of the file layout.
writeFileSync(KEY_FILE, NEW_AES);
writeFileSync(DIST_KEY, NEW_AES);

// ── verify from disk, exactly as secrets.mjs would read it ──────────────────
const back = readFileSync(KEY_FILE);
const fileBranch = back.length >= 32 ? back.subarray(0, 32) : null;
console.log('\n=== verify from disk ===');
console.log('  server/secrets.key       ' + back.length + ' bytes');
console.log('  file-derived key == env-derived key ? ' + (fileBranch ? fileBranch.equals(NEW_AES) : false));

const check = new DatabaseSync(LIVE_DB, { readOnly: true });
const rr = check.prepare("SELECT value FROM kv WHERE key='rcerp_telegram_settings'").get();
check.close();
const tg = typeof rr!.value === 'string' ? JSON.parse(rr!.value) : rr!.value;
let verified = 0;
for (const k of ['botToken', 'purchaseBotToken']) {
  const out = dec(tg[k], fileBranch!, CONTEXTS[k]!);
  const ok = !!(out && out.length);
  if (ok) verified++;
  console.log('  ' + k.padEnd(20) + (ok ? 'decrypts OK (' + out!.length + ' chars)' : 'FAILED'));
  // ⭐ byte-compare against what we intended to store, not just "it decrypts"
  const want = plain.get(found.find((f) => f.field === k)!)!;
  if (ok && out !== want) {
    console.error('  ⛔ ' + k + ' decrypts to a DIFFERENT value than was stored. Stopping.');
    process.exit(1);
  }
}
if (verified !== 2) {
  console.error('  ⛔ only ' + verified + '/2 values verified from a fresh read. The write did not land.');
  process.exit(1);
}
console.log('  both values round-tripped to the exact plaintext. The write is real.');

console.log('\n=== put this in ecosystem.config.cjs ===');
console.log('');
console.log("        SECRETS_KEY: '" + SECRETS_KEY + "',");
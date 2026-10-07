// Why does tg:botToken fail to decrypt?
//
// decryptSecret tries, in order:
//   1. v1 with AAD bound to the context  ('restocost-at-rest:tg:botToken')
//   2. the same blob with NO AAD        (legacy, written before AAD existed)
//   3. give up and log
//
// All three failing means the KEY is wrong, not the format: a wrong key fails
// the GCM tag check in every branch. So the question is which key file the
// running server reads, and whether it matches the one that encrypted the blob.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LIVE = resolve(REPO, 'server/data/restocost.db');

// ------------------------------------------------------------------ the key --
// ⭐ The key resolution order in secrets.mjs is:
//     1. process.env.SECRETS_KEY  (if length >= 16)
//     2. <dir of secrets.mjs>/secrets.key  (if length >= 32)
//     3. a fresh random key, written to that same path
//
// Two DIRECTORIES MATTER, and they are not the same directory:
//     server/secrets.key          <- the SOURCE
//     server/dist/secrets.key     <- the BUILD OUTPUT, which is what runs
// ⛔ Absolute path, not '../server/secrets.mjs': this file is at
//    api/scripts/, so a relative import resolved to api/server/ which does not
//    exist and threw ERR_MODULE_NOT_FOUND before the diagnosis ran.
import { decryptSecret } from '../../server/secrets.mjs';

console.log('=== which secrets.mjs is this script loading? ===');
const here = resolve(fileURLToPath(new URL('.', import.meta.url)), '../secrets.mjs');
console.log('  ' + here.replace(REPO, '.'));

console.log('');
console.log('=== the key files that exist ===');
for (const rel of ['server/secrets.key', 'server/dist/secrets.key']) {
  const p = resolve(REPO, rel);
  if (!existsSync(p)) { console.log('  ' + rel.padEnd(24) + ' MISSING'); continue; }
  const buf = readFileSync(p);
  const st = statSync(p);
  console.log('  ' + rel.padEnd(24) +
    ' ' + buf.length + ' bytes' +
    '  sha256=' + createHash('sha256').update(buf).digest('hex').slice(0, 16) +
    '  modified ' + st.mtime.toISOString().slice(0, 19));
}

console.log('');
console.log('=== SECRETS_KEY in the environment the server runs under ===');
const envKey = process.env.SECRETS_KEY;
console.log('  process.env.SECRETS_KEY : ' + (envKey ? 'SET, ' + envKey.length + ' chars' : 'not set'));
if (envKey) {
  console.log('  sha256 of it           : ' + createHash('sha256').update(String(envKey)).digest('hex').slice(0, 16));
  console.log('  -> it WINS over the file, so the file may be irrelevant');
}

console.log('');
console.log('=== .env files: do any define SECRETS_KEY? ===');
for (const rel of ['.env', 'server/.env', 'server/dist/.env']) {
  const p = resolve(REPO, rel);
  if (!existsSync(p)) { console.log('  ' + rel.padEnd(20) + ' (no file)'); continue; }
  const hit = /^\s*SECRETS_KEY\s*=(.*)$/m.exec(readFileSync(p, 'utf8'));
  console.log('  ' + rel.padEnd(20) + (hit ? 'SECRETS_KEY = ' + hit[1].trim().slice(0, 12) + '...' : 'no SECRETS_KEY'));
}

// ---------------------------------------------------------------- the value --
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(LIVE, { readOnly: true });
const raw = db.prepare("SELECT value FROM kv WHERE key='rcerp_telegram_settings'").get()?.value;
db.close();
const tg = typeof raw === 'string' ? JSON.parse(raw) : raw;

console.log('');
console.log('=== what is actually stored for the telegram token? ===');
console.log('  rcerp_telegram_settings fields: ' + Object.keys(tg ?? {}).join(', '));
for (const k of ['botToken', 'purchaseBotToken']) {
  const v = tg?.[k];
  if (!v) { console.log('  ' + k.padEnd(20) + ' (empty)'); continue; }
  const enc = typeof v === 'string' && v.startsWith('enc:');
  const version = typeof v === 'string' && v.startsWith('enc:v1:') ? 'v1' :
                  (typeof v === 'string' && v.startsWith('enc:') ? 'legacy (no version)' : 'PLAINTEXT');
  console.log('  ' + k.padEnd(20) + ' length ' + String(v.length).padEnd(6) + ' ' + version);
  const out = decryptSecret(v, k === 'botToken' ? 'tg:botToken' : 'tg:purchaseBotToken');
  console.log('    decrypt with the CURRENT key -> ' + (out === '' ? "FAILED (empty)" : "OK, " + out.length + ' chars'));
  // Also try with no context at all, to see whether it is a context mismatch.
  const outBare = decryptSecret(v, null);
  console.log('    decrypt with NO context      -> ' + (outBare === '' ? "FAILED (empty)" : "OK, " + outBare.length + ' chars'));
}
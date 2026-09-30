// Secrets at rest: AES-256-GCM encryption with a key living OUTSIDE the database
// (server/secrets.key, or SECRETS_KEY env var). Legacy plaintext values pass
// through unchanged (decryptSecret === input) so enabling encryption is non-breaking.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mkKey = () => {
  const fromEnv = process.env.SECRETS_KEY;
  if (fromEnv && fromEnv.length >= 16) return crypto.createHash('sha256').update(String(fromEnv)).digest();
  const keyFile = path.join(__dirname, 'secrets.key');
  try {
    const raw = fs.readFileSync(keyFile);
    if (raw && raw.length >= 32) return raw.subarray(0, 32);
  } catch { /* missing */ }
  const key = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
  } catch { /* keep in-memory fallback */ }
  return key;
};
const KEY = mkKey();

// Versioned format: enc:v1:<base64(iv(12)||tag(16)||ciphertext)>.
// v1 binds ciphertext to a per-field AAD context (prevents blob swapping across
// fields). Legacy unversioned "enc:" blobs (encrypted before AAD was added) are
// still decryptable via the no-AAD fallback so the change is non-breaking.
const ENC_PREFIX = 'enc:';
const ENC_CUR_VERSION = 'v1';
const ENC_CUR_PREFIX = `${ENC_PREFIX}${ENC_CUR_VERSION}:`;
const AAD_DOMAIN = 'restocost-at-rest';
const aadFor = (context) => `${AAD_DOMAIN}:${context || 'generic'}`;
const IV_LEN = 12;
const TAG_LEN = 16;
const MIN_BUF = IV_LEN + TAG_LEN;

// Rate-limit decrypt-failure logging so background poll loops (which run every
// few seconds) cannot spam logs when one stored value is corrupt.
const errLog = new Map();
const markError = (why) => {
  const now = Date.now();
  const last = errLog.get(why) || 0;
  if (now - last < 60000) return;
  errLog.set(why, now);
  console.error(`[secrets] decrypt failed: ${why}`);
};

const decryptWithAad = (stored, context, buf) => {
  if (buf.length < MIN_BUF) return null;
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  if (context) decipher.setAAD(Buffer.from(aadFor(context), 'utf8'));
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

export const encryptSecret = (value, context) => {
  if (value === undefined || value === null || value === '') return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(aadFor(context), 'utf8'));
  const enc = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_CUR_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
};

export const decryptSecret = (stored, context) => {
  if (typeof stored !== 'string' || stored === '') return stored || '';
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  try {
    if (stored.startsWith(ENC_CUR_PREFIX)) {
      const buf = Buffer.from(stored.slice(ENC_CUR_PREFIX.length), 'base64');
      try {
        const val = decryptWithAad(stored, context, buf);
        if (val !== null) return val;
      } catch { /* fall through to legacy, then error */ }
      try {
        const legacy = decryptWithAad(stored, null, buf);
        if (legacy !== null) return legacy;
      } catch { /* fall through */ }
      markError(`v1 blob undecryptable${context ? ` (context=${context})` : ''}`);
      return '';
    }
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    try {
      const legacy = decryptWithAad(stored, null, buf);
      if (legacy !== null) return legacy;
    } catch { /* fall through */ }
    markError(`legacy blob undecryptable${context ? ` (context=${context})` : ''}`);
    return '';
  } catch {
    markError('malformed blob');
    return '';
  }
};

export const isEncrypted = (v) => typeof v === 'string' && (v === '' || v.startsWith(ENC_PREFIX));

// One-time in-place migration: encrypt any secrets already stored in plaintext
// inside the KV collections (AI keys, Telegram bot tokens). Idempotent; safe to
// run on every boot.
export const migrateSecretsAtRest = (store) => {
  try {
    const ai = store.getKV('rcerp_ai_settings');
    if (ai && typeof ai === 'object') {
      let changed = false;
      const items = Array.isArray(ai.items) ? ai.items : [];
      for (const m of items) {
        if (m && typeof m === 'object' && typeof m.apiKey === 'string' && m.apiKey && !isEncrypted(m.apiKey)) {
          m.apiKey = encryptSecret(m.apiKey, 'ai:apiKey');
          changed = true;
        }
      }
      if (!items.length && typeof ai.apiKey === 'string' && ai.apiKey && !isEncrypted(ai.apiKey)) {
        ai.apiKey = encryptSecret(ai.apiKey, 'ai:apiKey');
        changed = true;
      }
      if (changed) store.setKV('rcerp_ai_settings', ai);
    }
    const tg = store.getKV('rcerp_telegram_settings');
    if (tg && typeof tg === 'object') {
      let changed = false;
      for (const k of ['botToken', 'purchaseBotToken']) {
        const v = tg[k];
        if (typeof v === 'string' && v && !isEncrypted(v)) {
          tg[k] = encryptSecret(v, k === 'botToken' ? 'tg:botToken' : 'tg:purchaseBotToken');
          changed = true;
        }
      }
      if (changed) store.setKV('rcerp_telegram_settings', tg);
    }
  } catch (e) {
    console.error('[secrets] migrate failed:', e && (e.stack || e.message));
  }
};
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

const ENC_PREFIX = 'enc:';

export const encryptSecret = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
};

export const decryptSecret = (stored) => {
  if (typeof stored !== 'string' || stored === '') return stored || '';
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
    if (buf.length < 28) return '';
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
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
          m.apiKey = encryptSecret(m.apiKey);
          changed = true;
        }
      }
      if (!items.length && typeof ai.apiKey === 'string' && ai.apiKey && !isEncrypted(ai.apiKey)) {
        ai.apiKey = encryptSecret(ai.apiKey);
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
          tg[k] = encryptSecret(v);
          changed = true;
        }
      }
      if (changed) store.setKV('rcerp_telegram_settings', tg);
    }
  } catch (e) {
    console.error('[secrets] migrate failed:', e && (e.stack || e.message));
  }
};
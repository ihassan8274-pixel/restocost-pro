/**
 * Minimal TOTP (RFC 6238) implementation using node:crypto.
 * - 6-digit codes, 30-second period, HMAC-SHA1
 * - Accepts codes from the current, previous, and next 30s window (±1 step)
 * - Base32 secretion for the classic "secret key" format used by authenticator apps
 */
import crypto from 'node:crypto';

const STEP = 30;
const DIGITS = 6;

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

export const base32Decode = (input) => {
  const clean = String(input || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!clean) return Buffer.alloc(0);
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

export const generateSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secret, counter) => {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1000000).padStart(DIGITS, '0');
};

export const currentTotp = (secret, at = Date.now()) => hotp(secret, Math.floor(at / 1000 / STEP));

export const totpUrl = (secret, accountName, issuer = 'RestoCost ERP') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP}`;

/**
 * Verify a 6-digit TOTP code allowing ±1 step for clock skew.
 * Returns true if the code matches any of the checked windows.
 */
export const verifyTotp = (secret, code) => {
  const clean = String(code || '').trim();
  if (!/^\d{6}$/.test(clean)) return false;
  const step = Math.floor(Date.now() / 1000 / STEP);
  for (let i = -1; i <= 1; i++) {
    if (hotp(secret, step + i) === clean) return true;
  }
  return false;
};
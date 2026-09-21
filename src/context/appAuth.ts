// Client-side password utilities (offline login / PWA). Extracted from the
// monolithic AppContext so the provider only keeps React/state concerns.
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const LEGACY_SALT = '::restocost::salt';

const legacyHash = async (password: string): Promise<string> => {
  const data = new TextEncoder().encode(password + LEGACY_SALT);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const isBcryptHash = (h: string): boolean => typeof h === 'string' && (h.startsWith('$2a$') || h.startsWith('$2b$') || h.startsWith('$2y$'));

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (isBcryptHash(hashed)) return bcrypt.compare(plain, hashed);
  return (await legacyHash(plain)) === hashed;
}
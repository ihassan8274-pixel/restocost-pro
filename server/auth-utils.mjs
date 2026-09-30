/**
 * Password hashing, legacy compat, and password-policy helpers.
 * Extracted from server/index.js so they can be unit-tested in isolation.
 */
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

export const BCRYPT_ROUNDS = 10;
export const LEGACY_SALT = '::restocost::salt';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HISTORY_SIZE = 5;
export const PASSWORD_FORBIDDEN = ['admin123', 'password', '12345678', 'qwertyui'];

export const legacyHash = (p) => crypto.createHash('sha256').update(String(p) + LEGACY_SALT).digest('hex');

export const isBcryptHash = (h) => typeof h === 'string' && h.startsWith('$2b$');

export const hashPassword = async (p) => bcrypt.hash(String(p), BCRYPT_ROUNDS);

export const verifyPassword = async (plain, hashed) => {
  if (isBcryptHash(hashed)) return bcrypt.compare(String(plain), hashed);
  return legacyHash(plain) === hashed;
};

export const needsRehash = (hashed) => !isBcryptHash(hashed);

export const validatePassword = (pwd) => {
  const s = String(pwd || '');
  if (s.length < PASSWORD_MIN_LENGTH) return `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN_LENGTH} أحرف`;
  if (!/[a-z]/.test(s)) return 'كلمة المرور يجب أن تحتوي على حرف إنجليزي صغير';
  if (!/[A-Z]/.test(s)) return 'كلمة المرور يجب أن تحتوي على حرف إنجليزي كبير';
  if (!/[0-9]/.test(s)) return 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل';
  if (PASSWORD_FORBIDDEN.includes(s.toLowerCase())) return 'كلمة المرور سهلة جداً — اختر كلمة أقوى';
  return null;
};

export const recordPasswordHistory = (user, newHash) => {
  if (!Array.isArray(user.passwordHistory)) user.passwordHistory = [];
  user.passwordHistory.push(newHash);
  if (user.passwordHistory.length > PASSWORD_HISTORY_SIZE) user.passwordHistory.shift();
};

export const isPasswordReused = async (user, plain) => {
  const candidates = [user.passwordHash, ...(Array.isArray(user.passwordHistory) ? user.passwordHistory : [])].filter(Boolean);
  for (const c of candidates) {
    if (isBcryptHash(c) && bcrypt.compareSync(plain, c)) return true;
    if (legacyHash(plain) === c) return true;
  }
  return false;
};
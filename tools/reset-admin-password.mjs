/**
 * إعادة تعيين كلمة مرور مستخدم في قاعدة SQLite الحيّة (server/data/restocost.db)
 *
 * ⚠️ لازم السيرفر يكون واقف قبل ما تشغّل السكربت.
 *
 * لماذا؟ السيرفر يحتفظ بالبيانات في الذاكرة (in-memory kv cache).
 * لو عدّلت الملف مباشرة والخادم شغّال، أول ما السيرفر يكتب أي تعديل
 * (مثل lastLogin عند تسجيل الدخول) بيرجع يكتب نسخته القديمة من الذاكرة
 * فوق تعديلك — فتضيع كلمة المرور. هذا اللي صار قبل.
 *
 * الاستخدام:
 *   1) pm2 stop restocost        (أو أوقف السيرفر بأي طريقة)
 *   2) node tools/reset-admin-password.mjs <الإيميل> <كلمة المرور الجديدة>
 *   3) pm2 restart restocost
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import bcrypt from 'bcrypt';

const email = (process.argv[2] || 'admin@restocost.com').toLowerCase();
const newPassword = process.argv[3] || 'Admin@123';

if (process.env.RC_RESET_CONFIRM !== '1') {
  console.error('⛔ أوقف السيرفر أولاً، ثم أعد التشغيل مع:\n   $env:RC_RESET_CONFIRM="1"; node tools/reset-admin-password.mjs ' + email + ' "password"');
  process.exit(1);
}

const dbPath = path.join(process.cwd(), 'server', 'data', 'restocost.db');
const db = new DatabaseSync(dbPath);

const row = db.prepare("SELECT value FROM kv WHERE key = 'rcerp_users'").get();
if (!row) {
  console.error('❌ rcerp_users غير موجود — مسار خاطئ؟', dbPath);
  process.exit(1);
}

const users = JSON.parse(row.value);
const user = users.find((u) => String(u.email).toLowerCase() === email);
if (!user) {
  console.error(`❌ ${email} غير موجود. الموجودون: ${users.map((u) => u.email).join(', ')}`);
  process.exit(1);
}

const hash = await bcrypt.hash(newPassword, 12);
console.log('  old hash :', user.passwordHash);
user.passwordHash = hash;
console.log('  new hash :', hash);

db.prepare("UPDATE kv SET value = ? WHERE key = 'rcerp_users'").run(JSON.stringify(users));
db.prepare('DELETE FROM rate_limits').run();
db.close();

// تحقّق
const db2 = new DatabaseSync(dbPath, { readOnly: true });
const after = JSON.parse(db2.prepare("SELECT value FROM kv WHERE key = 'rcerp_users'").get().value);
const a = after.find((u) => String(u.email).toLowerCase() === email);
const ok = await bcrypt.compare(newPassword, a.passwordHash);
console.log('\n✅ verify bcrypt.compare =', ok);
console.log('   active =', a.isActive, '| role =', a.role, '| branch =', a.branchId);
db2.close();

if (!ok) process.exit(1);
console.log(`\n🎯 ${email} → ${newPassword}`);
console.log('   الآن: pm2 restart restocost');
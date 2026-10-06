// Auth + users + audit routes. All URLs unchanged.
import crypto from 'node:crypto';
import {
  readToken, sessionUser, publicUser, hasDefaultAdminPassword,
  requireAdmin, requireAdminUser,
} from '../core.mjs';
import { store } from '../store.mjs';
import {
  needsRehash, hashPassword, verifyPassword, validatePassword,
  recordPasswordHistory, isPasswordReused,
} from '../auth-utils.mjs';
import { generateSecret, verifyTotp, totpUrl } from '../totp.mjs';

/**
 * قرار مسار /api/auth/register — منطق خالص لاختباره بلا سيرفر.
 *
 * 'activate': ينشئ حساباً نشطاً بدور مُمرَّر (مسؤول نظام فقط بعد أول تهيئة).
 * 'pending' : طلب حساب بانتظار التفعيل، بلا دور فعّال ولا صلاحية.
 * 'first-admin': أول حساب في النظام (لا يوجد مستخدمون بعد) → مدير بلا جلسة.
 */
export const resolveRegisterMode = ({ userCount, voterRole }) => {
  if (userCount === 0) return 'first-admin';
  return voterRole === 'admin' ? 'activate' : 'pending';
};

const {
  getKV, setKV,
  createSession, deleteSession, deleteSessionsByUser, deleteOtherSessions,
  purgeExpiredSessions,
  rateLimitGet, rateLimitRegisterFailure, rateLimitClear, purgeExpiredRateLimits,
  writeAudit, getAuditLogs,
} = store;


// hash bcrypt وهمي ثابت الشكل «$2bexport const registerAuth = (app) => {0$…» لـ timing ما عدا.
// الغرض منه أن تُقارَن كلمة المرور عند عدم وجود المستخدم، فيستغرق الطلبان
// وقتاً متقارباً فلا يُكشف وجود الحساب من الفارق الزمني.
// (لن يُطابق أي مفتاح حقيقي — ولا نحتاج أن يُطابق.)
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const registerAuth = (app) => {
  app.post('/api/auth/login', async (req, res) => {
    const { email, password, totpCode } = req.body || {};
    const users = getKV('rcerp_users') || [];
    const user = users.find((u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase());

    // IP-based rate limiting (additional layer for unknown emails / brute force)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const ipKey = 'login:ip:' + clientIp;
    purgeExpiredRateLimits();
    const ipRec = rateLimitGet(ipKey);
    if (ipRec && ipRec.lockedUntil > Date.now()) {
      return res.json({ ok: false, error: `محاولات كثيرة من هذا العنوان — أعد المحاولة بعد ${Math.ceil((ipRec.lockedUntil - Date.now()) / 60000)} دقيقة` });
    }

    // ── منع كشف وجود الحساب (user enumeration) ──
    //
    // كان هنا أربعة ردود مختلفة، وكلها تكشف حالة الحساب:
    //   «غير مسجل» · «في انتظار التفعيل» · «موقوف» · «كلمة المرور غير صحيحة»
    // فمهاجم يجرّب 100 بريد يخرج بقائمة حساباتك كاملة، ويعرف أيّها موقوف
    // وأيّها بانتظار تفعيل.
    //
    // صار ردٌّ واحد لكل الفشل. والتمييز الفعلي (حساب موقوف) صار في السجل
    // الداخلي writeAudit لا في ردّ الشبكة — فيبقى للمشرف ما يحتاجه دون أن
    // يقرأه المهاجم.
    const GENERIC = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    const deny = (reason) => {
      const who = user ? user.email : String(email || '').slice(0, 120);
      writeAudit(null, 'LOGIN_DENIED', user ? user.id : null, who + ' (' + reason + ')');
      
      return res.json({ ok: false, error: GENERIC });
    };

    // ── تسريب التوقيت (timing side-channel) ──
    // كان الحرف `if (!user) return` يُرجع فوراً، بينما الحساب الموجود يمرّ على
    // bcrypt (≈100ms). فحتى لو became الرسائل متطابقة، الفارق الزمني وحده
    // يكشف وجود الحساب. الحل: مقارنة وهمية بـ hash وهمي عند عدم وجود المستخدم،
    // فيستغرق الطلبان وقتاً متقارباً.
    if (!user) {
      rateLimitRegisterFailure(ipKey);
      await verifyPassword(password, DUMMY_HASH);
      return deny('no_such_user');
    }

    // Brute-force protection: lock the account after repeated failures (SQLite-backed).
    const rec = rateLimitGet(user.email);
    if (rec && rec.lockedUntil > Date.now()) {
      return res.json({ ok: false, error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil((rec.lockedUntil - Date.now()) / 60000)} دقيقة` });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const res2 = rateLimitRegisterFailure(user.email);
      writeAudit(null, 'LOGIN_FAILED', user.id, user.email);
      if (res2.lockedUntil) {
        return res.json({ ok: false, error: `محاولات كثيرة — تم قفل الحساب مؤقتاً. أعد المحاولة بعد ${Math.ceil((res2.lockedUntil - Date.now()) / 60000)} دقيقة` });
      }
      return res.json({ ok: false, error: GENERIC });
    }

    // الحساب موجود وكلمة المرور صحيحة، لكن غير قابل للدخول.
    // يُقال الآن بلا كشف — الرسالة الوحيدة التي تتغيّر هي «مكتشف مسبقاً».
    if (user.needsActivation) return deny('needs_activation');
    if (!user.isActive) return deny('suspended');
    rateLimitClear(user.email);

    // Two-factor authentication (TOTP) for admin accounts.
    if (user.role === 'admin' && user.totpEnabled) {
      if (!totpCode) {
        return res.json({ ok: false, totpRequired: true });
      }
      if (!verifyTotp(user.totpSecret, totpCode)) {
        // Count TOTP failures against the same per-account lockout counter so a
        // correct password alone can't be followed by unlimited OTP guesses.
        const r2 = rateLimitRegisterFailure(user.email);
        rateLimitRegisterFailure(ipKey); // Also track IP
        writeAudit(user, 'LOGIN_2FA_FAILED', user.id);
        if (r2.lockedUntil) {
          return res.json({ ok: false, error: `محاولات كثيرة — تم قفل الحساب مؤقتاً. أعد المحاولة بعد ${Math.ceil((r2.lockedUntil - Date.now()) / 60000)} دقيقة` });
        }
        return res.json({ ok: false, error: 'رمز التحقق غير صحيح' });
      }
      rateLimitClear(user.email);
      rateLimitClear(ipKey);
    }

    // Upgrade legacy hash to bcrypt on successful login
    if (needsRehash(user.passwordHash)) {
      user.passwordHash = await hashPassword(password);
    }

    purgeExpiredSessions();
    user.lastLogin = new Date().toISOString();
    setKV('rcerp_users', users);
    rateLimitClear(ipKey); // Clear IP rate limit on success
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    writeAudit(user, 'LOGIN_OK', user.id);
    res.json({ ok: true, token, user: publicUser(user), mustChangePassword: user.mustChangePassword === true || hasDefaultAdminPassword() });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role, branchId } = req.body || {};
    if (!name || !email || !password || !role || !branchId) return res.status(400).json({ ok: false, error: 'بيانات غير مكتملة' });
    const users = getKV('rcerp_users') || [];
    const voter = sessionUser(readToken(req));
    if (users.some((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'هذا البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    // سياسة كلمة المرور تُطبَّق على التسجيل نفسه لا على تغيير كلمة المرور فقط.
    const policyErr = validatePassword(password);
    if (policyErr) return res.status(400).json({ ok: false, error: policyErr });
    // بعد أول تهيئة: إنشاء حساب نشط بدور مُمرَّر من صلاحيات مسؤول النظام فقط.
    // أي جلسة أخرى (زائر أو موظف غير مدير) تسجّل كطلب بانتظار التفعيل بلا أثر،
    // وإلا لأمكن لأي موظف تصعيد الدور المطلوب إلى مدير بمجرد موافقة أي مسؤول.
    const mode = resolveRegisterMode({ userCount: users.length, voterRole: voter?.role });
    // سباق أول مدير: الفحص أعلاه والكتابة أدناه يفصلهما bcrypt (≈100ms).
    // طلبان متزامنان على نظام فارغ كانا يريان userCount=0 معاً فيصير كلاهما
    // 'first-admin'، والثاني يطمس الأول لأن setKV تستبدل لا تدمج — فيبقى مدير
    // بجلسة صالحة لحساب لم يعد موجوداً.
    // الحل: بعد bcrypt نعيد القراءة ونعيد الحسم. إن لم يعد النظام فارغاً فالذي
    // سبقه أنشأ المدير، وهذا الطلب يعامل كطلب عادي (بانتظار تفعيل أو من مدير).
    if (mode === 'first-admin') {
      const afterBcrypt = getKV('rcerp_users') || [];
      if (afterBcrypt.length !== 0) {
        const retry = resolveRegisterMode({ userCount: afterBcrypt.length, voterRole: voter?.role });
        if (retry === 'pending') {
          const pending = {
            id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            name: String(name).trim(),
            email: String(email).trim().toLowerCase(),
            passwordHash: await hashPassword(password),
            role: 'counter',
            branchId: 'all',
            requestedRole: role,
            requestedBranchId: branchId,
            isActive: false,
            needsActivation: true,
            createdAt: new Date().toISOString(),
          };
          afterBcrypt.push(pending);
          setKV('rcerp_users', afterBcrypt);
          writeAudit(null, 'SIGNUP_REQUEST', pending.id, pending.email + ' (سباق أول مدير)');
          return res.json({ ok: true, pending: true });
        }
        // retry === 'activate': المدير الذي سبقه موجود الآن ويملك جلسة — أكمل كإنشاء مدير
        return res.json({ ok: true, user: publicUser(afterBcrypt.find((u) => u.role === 'admin') || null) });
      }
    }
    if (mode === 'pending') {
      const pending = {
        id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash: await hashPassword(password),
        role: 'counter',
        branchId: 'all',
        requestedRole: role,
        requestedBranchId: branchId,
        isActive: false,
        needsActivation: true,
        createdAt: new Date().toISOString(),
      };
      users.push(pending);
      setKV('rcerp_users', users);
      writeAudit(null, 'SIGNUP_REQUEST', pending.id, pending.email + ' (بانتظار التفعيل)');
      return res.json({ ok: true, pending: true });
    }
    // أول حساب في نظام فارغ → مدير بلا جلسة سابقة. بعد ذلك هذا المسار ينتج
    // من مسؤول نظام فقط، فالدور المُمرَّر مُعتمد.
    const user = {
      id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role: mode === 'first-admin' ? 'admin' : role,
      branchId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    setKV('rcerp_users', users);
    writeAudit(voter || user, 'REGISTER', user.id, user.email + (voter ? ' (أنشأه مدير)' : ''));
    // Only the anonymous first-run path gets a fresh session token; authenticated
    // creation (admin panel) keeps the caller's existing session.
    if (voter) return res.json({ ok: true, user: publicUser(user) });
    const token = crypto.randomBytes(32).toString('hex');
    createSession(token, user.id);
    res.json({ ok: true, token, user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = readToken(req);
    if (token) deleteSession(token);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const users = getKV('rcerp_users') || [];
    const me = users.find((x) => x && x.id === user.id);
    res.json({ ok: true, user: publicUser(user), mustChangePassword: (me && me.mustChangePassword === true) || hasDefaultAdminPassword() });
  });

  // Verify the current session user's password (used for admin confirmation dialogs).
  app.post('/api/auth/verify-password', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    purgeExpiredRateLimits();
    const rl = rateLimitGet('vp:' + user.id);
    if (rl && rl.lockedUntil > Date.now()) {
      return res.status(429).json({ ok: false, error: `محاولات كثيرة — أعد المحاولة بعد ${Math.ceil((rl.lockedUntil - Date.now()) / 60000)} دقيقة` });
    }
    const { password } = req.body || {};
    if (!password) return res.json({ ok: false });
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      rateLimitRegisterFailure('vp:' + user.id);
      return res.json({ ok: false });
    }
    rateLimitClear('vp:' + user.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const { oldPassword, newPassword } = req.body || {};
    const validOld = await verifyPassword(oldPassword, user.passwordHash);
    if (!validOld) return res.json({ ok: false, error: 'كلمة المرور الحالية أو الجديدة غير صحيحة' });
    const policyErr = validatePassword(newPassword);
    if (policyErr) return res.json({ ok: false, error: policyErr });
    const users = getKV('rcerp_users') || [];
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx < 0) return res.json({ ok: false, error: 'المستخدم غير موجود' });
    if (await isPasswordReused(users[idx], newPassword)) return res.json({ ok: false, error: 'كلمة المرور مستخدمة سابقاً — اختر غيرها' });
    recordPasswordHistory(users[idx], users[idx].passwordHash);
    users[idx].passwordHash = await hashPassword(newPassword);
    users[idx].mustChangePassword = false;
    setKV('rcerp_users', users);
    // Revoke every other session of this user for safety.
    deleteOtherSessions(user.id, readToken(req));
    writeAudit(user, 'CHANGE_PASSWORD', user.id);
    res.json({ ok: true });
  });

  // ---- Two-factor (TOTP) for admin accounts ----
  app.post('/api/auth/totp/setup', requireAdminUser, (req, res) => {
    const users = getKV('rcerp_users') || [];
    const idx = users.findIndex((u) => u.id === req.authUser.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    const u = users[idx];
    if (!u.totpSecret) u.totpSecret = generateSecret();
    u.totpEnabled = !!u.totpEnabled;
    setKV('rcerp_users', users);
    res.json({ ok: true, secret: u.totpSecret, otpauthUrl: totpUrl(u.totpSecret, u.email), enabled: !!u.totpEnabled });
  });

  app.post('/api/auth/totp/enable', requireAdminUser, (req, res) => {
    const { code } = req.body || {};
    const users = getKV('rcerp_users') || [];
    const idx = users.findIndex((u) => u.id === req.authUser.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    const u = users[idx];
    if (!u.totpSecret) return res.json({ ok: false, error: 'ابدأ بإعداد الرمز أولاً' });
    if (!verifyTotp(u.totpSecret, code)) return res.json({ ok: false, error: 'رمز التحقق غير صحيح' });
    u.totpEnabled = true;
    setKV('rcerp_users', users);
    writeAudit(u, 'TOTP_ENABLED', u.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/totp/disable', requireAdminUser, (req, res) => {
    const { code } = req.body || {};
    const users = getKV('rcerp_users') || [];
    const idx = users.findIndex((u) => u.id === req.authUser.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    const u = users[idx];
    if (!u.totpEnabled) return res.json({ ok: false, error: 'المصادقة الثنائية غير مفعّلة حالياً' });
    if (!verifyTotp(u.totpSecret, code)) return res.json({ ok: false, error: 'رمز التحقق غير صحيح' });
    u.totpEnabled = false;
    setKV('rcerp_users', users);
    writeAudit(u, 'TOTP_DISABLED', u.id);
    res.json({ ok: true });
  });

  // ---- Users REST (admin only) ----
  app.get('/api/users', requireAdmin, (req, res) => {
    res.json({ ok: true, users: (getKV('rcerp_users') || []).map(publicUser) });
  });

  app.post('/api/users', requireAdmin, async (req, res) => {
    const { name, email, password, role, branchId, roleId } = req.body || {};
    if (!name || !email || !password || !role) return res.status(400).json({ ok: false, error: 'بيانات غير مكتملة' });
    const policyErr = validatePassword(password);
    if (policyErr) return res.status(400).json({ ok: false, error: policyErr });
    const users = getKV('rcerp_users') || [];
    if (users.some((u) => u.email.toLowerCase() === String(email).trim().toLowerCase())) {
      return res.status(400).json({ ok: false, error: 'هذا البريد الإلكتروني أو كلمة المرور غير صحيحة' });
    }
    const user = {
      id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role,
      branchId: branchId || 'all',
      roleId: roleId || undefined,
      isActive: true,
      passwordHistory: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    setKV('rcerp_users', users);
    writeAudit(req.authUser, 'USER_CREATE', user.id, user.email);
    res.json({ ok: true, user: publicUser(user) });
  });

  app.patch('/api/users/:id', requireAdmin, async (req, res) => {
    const users = getKV('rcerp_users') || [];
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx < 0) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    const target = users[idx];
    const isSelf = req.authUser.id === target.id;
    const { name, role, branchId, roleId, isActive, password } = req.body || {};
    // An admin must not be able to disable/demote themselves to zero-access.
    if (isSelf && (isActive === false || (role && role !== 'admin'))) {
      return res.status(400).json({ ok: false, error: 'لا يمكنك تعطيل أو خفض صلاحية حسابك الحالي' });
    }
    if (name !== undefined) target.name = String(name).trim();
    if (role !== undefined) target.role = role;
    if (branchId !== undefined) target.branchId = branchId;
    if (roleId !== undefined) target.roleId = roleId || undefined;
    if (isActive !== undefined) target.isActive = !!isActive;
    if (isActive === true && target.needsActivation) {
      // الموافقة على طلب انضمام: تعيين الدور/الفرع والصلاحيات ومنح الدخول
      delete target.needsActivation;
      delete target.requestedRole;
      delete target.requestedBranchId;
      writeAudit(req.authUser, 'USER_APPROVE', target.id, target.email + ' (موافقة على طلب انضمام)');
    }
    if (isActive === false) {
      // Disabling an account revokes every live session immediately.
      deleteSessionsByUser(target.id);
    }
    if (password !== undefined && password) {
      const policyErr = validatePassword(password);
      if (policyErr) return res.status(400).json({ ok: false, error: policyErr });
      if (await isPasswordReused(target, password)) return res.status(400).json({ ok: false, error: 'كلمة المرور مستخدمة سابقاً — اختر غيرها' });
      recordPasswordHistory(target, target.passwordHash);
      target.passwordHash = await hashPassword(password);
      // Password reset forces the user to pick their own password on next login.
      target.mustChangePassword = true;
      // Password reset revokes all the target user's sessions (requires re-login).
      deleteSessionsByUser(target.id);
    }
    setKV('rcerp_users', users);
    writeAudit(req.authUser, 'USER_UPDATE', target.id, target.email + (password ? ' (password reset)' : ''));
    res.json({ ok: true, user: publicUser(target) });
  });

  app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const users = getKV('rcerp_users') || [];
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    if (req.authUser.id === target.id) return res.status(400).json({ ok: false, error: 'لا يمكنك حذف حسابك الحالي' });
    deleteSessionsByUser(target.id);
    setKV('rcerp_users', users.filter((u) => u.id !== target.id));
    writeAudit(req.authUser, 'USER_DELETE', target.id, target.email);
    res.json({ ok: true });
  });

  app.post('/api/users/:id/revoke-sessions', requireAdmin, (req, res) => {
    const users = getKV('rcerp_users') || [];
    if (!users.some((u) => u.id === req.params.id)) return res.status(404).json({ ok: false, error: 'المستخدم غير موجود' });
    deleteSessionsByUser(req.params.id);
    writeAudit(req.authUser, 'USER_REVOKE_SESSIONS', req.params.id);
    res.json({ ok: true });
  });

  // ---- Audit log (admin only) ----
  app.get('/api/audit', requireAdmin, (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 1000);
    const rows = getAuditLogs(limit);
    res.json({ ok: true, logs: rows });
  });
};
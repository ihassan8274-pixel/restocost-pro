// Core data endpoints: bootstrap snapshot, collection writes, instance/network
// identity, and the companies launcher.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  dataDir, COLLECTION_KEYS, instanceId, readToken, sessionUser, publicUser, readBindHost, portInUse,
} from '../core.mjs';
import { canWriteCollection, canPurgeTombstone } from '../permissions.mjs';
import { sanitizeCollectionForBroadcast } from '../sanitize.mjs';
import { store } from '../store.mjs';
import { PKG_VERSION, buildFingerprint, serverStamp } from '../version.mjs';
import { sendTelegram, sendTelegramDocument, buildNotificationText, testTelegram, getBotChatIds } from '../telegram.mjs';
import { encryptSecret, decryptSecret } from '../secrets.mjs';
import { learnItemAlias, learnBranchAlias, getAliases } from '../intake.mjs';
import { raiseFromInbox, rejectFromInbox, raiseAllFullyMatched, bindAndRaiseFromInbox } from '../intake-inbox.mjs';
import { generateDailyCountPdf, generatePurchaseDocumentPdf } from '../pdf.mjs';
import { publishCatalogUpdate } from '../tg-catalog.mjs';

// كاشف تلف النصوص العربية (mojibake): حين تُقرأ بايتات UTF-8 كصفحة CP437
// (عبر PowerShell/Console) تظهر محارف رسم خطوط U+2500–U+257F بدل العربية.
// البيانات السليمة (عربي/إنجليزي) لا تحتوي هذه المحارف إطلاقاً، لذا وجودها
// دليل قاطع على تلف. التلف هنا غير قابل للعكس (بعض البايتات مفقودة)، لذا
// نحمي البيانات النظيفة على السيرفر برفض الدفعات التالفة بدل تخزينها.
const BOX_CHARS = /[\u2500-\u257F]/;
function looksCorrupted(value, depth = 0) {
  if (depth > 8) return false;
  if (typeof value === 'string') return BOX_CHARS.test(value);
  if (Array.isArray(value)) return value.some((v) => looksCorrupted(v, depth + 1));
  if (value && typeof value === 'object') return Object.values(value).some((v) => looksCorrupted(v, depth + 1));
  return false;
}
import { mergeById, shouldRejectShrink } from '../mergeCore.mjs';
import { paginateCollection } from '../paginate.mjs';
import { dispatchWebhookEvent, EVENT_KEYS } from '../webhooks.mjs';
import { findPeriodViolation } from '../periodLock.mjs';

const { getKV, setKV, revState, cdcSince } = store;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const localIPs = () => {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push({ name, address: i.address });
    });
  });
  return out;
};

// مجموعات ثقيلة تُستثنى من bootstrap وتحمّل عند الطلب
const LAZY_KEYS = new Set([
  'rcerp_inventory_movements',
  'rcerp_audit',
  'rcerp_journal',
  'rcerp_batch_sales',
  'rcerp_grn',
  'rcerp_inventory',
  'rcerp_recipe_sections',
  'rcerp_inventory_batches',
  'rcerp_temp_logs',
  'rcerp_haccp_inspections',
  'rcerp_tasks',
  'rcerp_custom_reports',
  'rcerp_eod_closures',
]);

export const registerData = (app) => {
  app.get('/api/bootstrap', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const since = Number(req.query.since);
    const isDelta = Number.isFinite(since) && since >= 0;
    const data = {};
    const touchedKeys = [];
    COLLECTION_KEYS.forEach((key) => {
      if (LAZY_KEYS.has(key)) return;
      const v = getKV(key);
      if (v === null) return;
      if (isDelta) {
        const kvMeta = store.getKvMeta ? store.getKvMeta(key) : null;
        const lastMod = kvMeta?.lastModified || 0;
        if (lastMod <= since) return;
        touchedKeys.push(key);
      }
      data[key] = sanitizeCollectionForBroadcast(key, v);
    });
    const rev = revState ? revState() : { rev: 1, boot: 0 };
    const etag = `W/"${rev.rev}-${rev.boot}"`;
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ok: true, data, user: publicUser(user), version: PKG_VERSION, build: buildFingerprint, server: serverStamp, lazyKeys: [...LAZY_KEYS], rev: rev.rev, boot: rev.boot, delta: isDelta, touchedKeys: isDelta ? touchedKeys : undefined });
  });

  // ترقيم خفيف بالقائمة (cursor) لمفتاح واحد — مساعدة للمعاينة عند نمو قائمة
  // كبيرة (مثل Recipes) دون سحب الكل. نفس مصدر الحقيقة: getKV للقائمة.
  app.get('/api/collections/:key/paginated', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const { key } = req.params;
    if (!COLLECTION_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'مفتاح غير معروف' });
    const page = paginateCollection(getKV(key), String(req.query.cursor || ''), Number(req.query.limit));
    // نفس تعقيم bootstrap: صفحة rcerp_users كانت تصل خاماً فتسريب هاشات
    // كلمات المرور وأسرار TOTP لأي جلسة مصادَق عليها (حتى lowest role).
    res.json({ ok: true, key, ...page, items: sanitizeCollectionForBroadcast(key, page.items) });
  });

  // بصمة مراجعة خفيفة (بلا تنزيل بيانات): يعرف منها التطبيق إن تغيّر أي شيء على
  // الخادم ليقوم بسحب كامل فوري — الأساس في المزامنة شبه اللحظية بين الأجهزة.
  app.get('/api/sync-state', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    res.json({ ok: true, ...(revState ? revState() : { rev: 1, boot: 0 }) });
  });

  // CDC: سحب "ما تغيّر فقط" منذ آخر seq — يرفع كفاءة المزامنة بين الأجهزة
  // (الأجهزة التي تحمل seq قديماً تستعلم فتسحب المجموعات المتغيّرة بدل الكل).
  app.get('/api/sync/cdc', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const since = Number(req.query.since);
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const changes = Number.isFinite(since) && since >= 0 ? cdcSince(since, limit) : [];
    res.json({
      ok: true,
      since,
      changes,
      rev: revState().rev,
      windowed: true, // يغطي أحدث الأحداث فقط؛ الأجهزة المتأخرة جداً تسحب bootstrap كاملاً
    });
  });

  app.post('/api/collections/:key', (req, res) => {
    const saveStarted = Date.now();
    const saveUA = (req.headers['user-agent'] || '').slice(0, 50);
    const saveBytes = req.headers['content-length'] || '?';
    res.on('finish', () => {
      try {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | ${req.params.key} | ${res.statusCode} | ${saveBytes}b | ${Date.now() - saveStarted}ms | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
    });
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const { key } = req.params;
    if (!COLLECTION_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'مفتاح غير معروف' });

    // ---- تحقق صلاحيات على الخادم (مبني على الصلاحيات) ----
    const accessRoles = store.getKV('rcerp_access_roles') || [];
    const writeCheck = canWriteCollection(user, key, accessRoles);
    if (!writeCheck.ok) {
      return res.status(403).json({ ok: false, error: writeCheck.message });
    }

    // ---- حماية من تلف النصوص العربية ----
    // جهاز يحمل نسخة تالفة محلياً (كاشح بايتات CP437) سيدفعها كل بضعة ثوانٍ
    // فيطمس النسخة النظيفة. التلف غير قابل للإصلاح، فنرفض الدفعات التالفة
    // ونُبقي بيانات السيرفر. نعيد 200 عمداً ليُفرغ الجهاز طابور حفظه المعلق
    // ويجلب النسخة النظيفة بدل إعادة المحاولة بلا نهاية.
    if (looksCorrupted(req.body)) {
      try {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | REJECTED-CORRUPT ${key} | ${saveBytes}b | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
      return res.json({ ok: true, rejected: 'corrupt-payload-ignored' });
    }

    // ---- تزامن جذري: دمج على مستوى السجل بالمعرّف (id-based merge) ----
    // المشكلة الحقيقية: كل جهاز يدفع نسخته الكاملة، والسيرفر كان يستبدل الكل —
    // فآخر جهاز يكتب يطمس تعديلات الآخرين (تعارض التزامن).
    // الآن: ندمج كل مجموعة واردة مع الموجودة وفق المعرّف الفريد لكل سجل —
    // تُضاف السجلات الجديدة، وتُحدَّث السجلات الموجودة، ولا يُحذف سجل من جهاز آخر أبداً.
    // الحماية من بيانات العرض: سجل تجريبي صغير لن يحذف شيئاً بل سيُدمَج كما هو؛
    // ولضمان ألا تطمس نسخة تجريبية كاملة بيانات حقيقية، نرفض استبدالاً صارخاً (أصغر بكثير).
    let incomingData = req.body;
    // شاهد الحذف: قائمة معرّفات محذوفة نهائياً (مصفوفة سلاسل لا سجلات) —
    // تُجمَّع بالاتحاد (union) لا بالاستبدال كي لا يخسر جهازٌ حذفَ جهازٍ آخر،
    // وتُنقَّى منها كل المجموعات فوراً: أي سجل يدخل الشواهد لا يعود أبداً.
    if (key === 'rcerp_deleted_ids') {
      const existing = Array.isArray(getKV(key)) ? getKV(key) : [];
      const incoming = Array.isArray(incomingData) ? incomingData : [];
      const tomb = Array.from(new Set([...existing, ...incoming]));
      setKV(key, tomb);
      const tombSet = new Set(tomb);
      if (tombSet.size > 0) {
        for (const ck of COLLECTION_KEYS) {
          if (ck === 'rcerp_deleted_ids') continue;
          // شواهد الحذف سلاح ذو مصرف واسع: تقطع أي مجموعة فيها المعرّف.
          // لا يُحذف سجل من مجموعة لا يملك صاحب الجلسة صلاحية كتابتها،
          // ولا مستخدمون إطلاقاً (إلا بمسار users المحمي أدناه).
          if (ck === 'rcerp_users') continue;
          if (!canPurgeTombstone(user, ck, accessRoles)) continue;
          const arr = getKV(ck);
          if (Array.isArray(arr)) {
            const next = arr.filter((r) => !(r && r.id !== undefined && tombSet.has(r.id)));
            if (next.length !== arr.length) setKV(ck, next);
          }
        }
      }
      fs.appendFileSync(
        path.join(dataDir, 'savelog.txt'),
        `${new Date().toISOString()} | MERGED ${key} | ${saveBytes}b | ${saveUA}\n`
      );
      return res.json({ ok: true });
    }
    if (key !== 'rcerp_users' && key !== 'rcerp_ai_settings' && key !== 'rcerp_telegram_settings' && key !== 'rcerp_intake_inbox' && key !== 'rcerp_recent_docs') {
      const reject = shouldRejectShrink(getKV(key), incomingData);
      if (reject) {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | REJECTED ${key} | ${saveBytes}b(in=${reject.inLen}B ex=${reject.exLen}B) | ${saveUA}\n`
        );
        return res.status(409).json({
          ok: false,
          error: 'رفض الحفظ: محاولة استبدال بيانات موجودة ببيانات أصغر بكثير (نمط بيانات تجريبية). ' +
            'البيانات الحقيقية محفوظة على الخادم — حدّث الصفحة لاسترجاعها ولا تفتح نسخة تجريبية.',
          reason: 'shrink-overwrite-guard',
        });
      }
      // حماية إضافية: تفريغ مجموعة كبيرة إلى مصفوفة فارغة بلا شواهد حذف
      // (منع جهاز قديم/فارغ من محو المبيعات والفروع المستوردة). الحذف الصحيح
      // عبر rcerp_deleted_ids ما زال يعمل: تُصفّى الشواهد المجموعات فوراً.
      const exArr = getKV(key);
      const inArr = incomingData;
      if (Array.isArray(exArr) &&
          Array.isArray(inArr) &&
          inArr.length === 0 &&
          (() => {
            try { return JSON.stringify(exArr).length > 50000; } catch { return false; }
          })()) {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | REJECTED-EMPTY ${key} | ${saveBytes}b(ex=${exArr.length} مفتاح) | ${saveUA} | استخدم rcerp_deleted_ids للحذف النهائي\n`
        );
        return res.status(409).json({
          ok: false,
          error: 'رفض الحفظ: محاولة إفراغ مجموعة كبيرة بصفر سجلات. لا تُمسح المجموعات إلا عبر قائمة الحذف النهائي (rcerp_deleted_ids).',
          reason: 'empty-overwrite-guard',
        });
      }
    }
    // The user list is privileged data — only an admin may write it directly,
    // and even then every row must preserve a valid bcrypt/legacy hash.
    if (key === 'rcerp_users') {
      if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح لك بتعديل المستخدمين' });
      const incoming = Array.isArray(incomingData) ? incomingData : [];
      const existing = Array.isArray(getKV(key)) ? getKV(key) : [];
      const exMap = new Map(existing.filter((u) => u && u.id).map((u) => [u.id, u]));
      for (const u of incoming) {
        if (!u || typeof u !== 'object') continue;
        const ex = exMap.get(u.id);
        // الأجهزة لا تحمل الهاش بعد التعرية — نعيد تركيبه من الخادم حتى لا تُفقد كلمات المرور.
        if (!u.passwordHash && ex && (ex.passwordHash || (Array.isArray(ex.passwordHistory) && ex.passwordHistory.length))) {
          u.passwordHash = ex.passwordHash || '';
        }
        if (!u.totpSecret && ex && ex.totpSecret) u.totpSecret = ex.totpSecret;
        if (!Array.isArray(u.passwordHistory) && ex && Array.isArray(ex.passwordHistory)) u.passwordHistory = ex.passwordHistory;
      }
      for (const u of incoming) {
        if (u && !u.passwordHash) return res.status(400).json({ ok: false, error: 'لا يمكن حفظ مستخدم بدون كلمة مرور' });
      }
    }

    // إعدادات الذكاء الاصطناعي: لا تُحفظ بها أبداً مؤشرات التعرية، ويُحفظ المفتاح
    // مشفراً عند إدخال مفتاح جديد ويُحتفظ بالمفتاح الحالي إذا لم يُعد إدخال.
    // درع: أي شكل ورد غريب يجب ألا يهدم الخادم (كان يظهر 500 على عميل قديم) —
    // نرفضه برسالة واضحة ونسجّل السبب الحقيقي في سجل الحفظ للتشخيص.
    if (key === 'rcerp_ai_settings') {
      try {
        const normalize = incomingData && typeof incomingData === 'object' ? { ...incomingData } : {};
        const existing = getKV(key);
        const hasItems = Array.isArray(normalize.items);
        const items = hasItems ? normalize.items : [];
        const exItems = existing && typeof existing === 'object' && Array.isArray(existing.items) ? existing.items : [];
        const exMap = new Map(exItems.filter((m) => m && m.id).map((m) => [m.id, m]));
        for (const m of items) {
          if (!m || typeof m !== 'object') continue;
          if ('hasKey' in m) delete m.hasKey;
          const ex = exMap.get(m.id);
          const hasNew = typeof m.apiKey === 'string' && !!m.apiKey.trim();
          if (hasNew) {
            m.apiKey = encryptSecret(m.apiKey.trim(), 'ai:apiKey');
          } else if (ex && typeof ex.apiKey === 'string' && ex.apiKey) {
            m.apiKey = ex.apiKey;
          } else {
            delete m.apiKey;
          }
        }
        if (!hasItems) {
          if ('hasKey' in normalize) delete normalize.hasKey;
          if (typeof normalize.apiKey === 'string' && normalize.apiKey.trim()) {
            normalize.apiKey = encryptSecret(normalize.apiKey.trim(), 'ai:apiKey');
          } else if (existing && typeof existing === 'object' && typeof existing.apiKey === 'string' && existing.apiKey) {
            normalize.apiKey = existing.apiKey;
          } else {
            delete normalize.apiKey;
          }
        }
        incomingData = normalize;
      } catch (e) {
        try {
          fs.appendFileSync(
            path.join(dataDir, 'savelog.txt'),
            `${new Date().toISOString()} | AI_SETTINGS_NORMALIZE_ERROR | ${e && (e.stack || e.message)}\n`
          );
        } catch { /* تجاهل */ }
        return res.status(400).json({
          ok: false,
          error: 'بيانات إعدادات الذكاء الاصطناعي المرسلة غير صالحة — حدّث الصفحة لإعادة تحميل الإعدادات الحقيقية من الخادم.',
        });
      }
    }

    // توكنات تليجرام عند الحفظ العام (دفاعي — الكتابة المعتادة عبر /api/telegram/settings).
    // درع: أي شكل ورد غريب يجب ألا يهدم الخادم (500) — نرفضه برسالة واضحة ونُسجّل السبب.
    if (key === 'rcerp_telegram_settings') {
      try {
        const normalize = incomingData && typeof incomingData === 'object' ? { ...incomingData } : {};
        const existing = getKV(key);
        for (const k of ['botToken', 'purchaseBotToken']) {
          const hasNew = typeof normalize[k] === 'string' && !!normalize[k].trim();
          if (hasNew) {
            normalize[k] = encryptSecret(normalize[k].trim(), k === 'botToken' ? 'tg:botToken' : 'tg:purchaseBotToken');
          } else if (existing && typeof existing === 'object' && typeof existing[k] === 'string' && existing[k]) {
            normalize[k] = existing[k];
          } else if (k in normalize) {
            delete normalize[k];
          }
        }
        incomingData = normalize;
      } catch (e) {
        try {
          fs.appendFileSync(
            path.join(dataDir, 'savelog.txt'),
            `${new Date().toISOString()} | TELEGRAM_SETTINGS_NORMALIZE_ERROR | ${e && (e.stack || e.message)}\n`
          );
        } catch { /* تجاهل */ }
        return res.status(400).json({ ok: false, error: 'بيانات إعدادات تليجرام المرسلة غير صالحة — حدّث الصفحة لإعادة تحميل الإعدادات الحقيقية من الخادم.' });
      }
    }
if (key === 'rcerp_recent_docs') {
      try {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | RECENT_DOCS_INCOMING | ${JSON.stringify(incomingData).slice(0, 500)}\n`
        );
        const normalize = Array.isArray(incomingData) ? incomingData : [];
        // تساهل في التحقق: نسمح بالحقول الاختيارية ونولد المفقودة
        const normalized = normalize.map((d, idx) => {
          if (!d || typeof d !== 'object') return null;
          return {
            id: typeof d.id === 'string' ? d.id : `recent-${Date.now()}-${idx}`,
            type: typeof d.type === 'string' ? d.type : 'unknown',
            title: typeof d.title === 'string' ? d.title : 'بدون عنوان',
            tab: typeof d.tab === 'string' ? d.tab : 'unknown',
            at: typeof d.at === 'number' ? d.at : Date.now(),
};
        }).filter(Boolean);
        incomingData = normalized.slice(0, 20);
      } catch (e) {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | RECENT_DOCS_NORMALIZE_ERROR | ${e && (e.stack || e.message)}\n`
        );
        return res.status(400).json({ ok: false, error: 'بيانات المستندات الأخيرة غير صالحة — سيتم إعادة تحميلها من الخادم.' });
      }
    }
    // --- فرض إغلاق الفترات خادمياً: رفض أي كتابة لشهر/يوم مقفل ---
    const periodViolation = findPeriodViolation(key, incomingData, getKV(key), getKV);
    if (periodViolation) {
      try {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | REJECTED-PERIOD ${key} | ${periodViolation.kind} | ${periodViolation.date} | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
      return res.status(409).json({
        ok: false,
        error: 'الفترة مقفلة: لا يمكن إنشاء أو تعديل أو حذف مستندات في فترة مغلقة. افتح الفترة أولاً.',
        reason: 'period-lock',
        date: periodViolation.date,
        kind: periodViolation.kind,
      });
    }
    // --- دمج بالمعرّف بدل الاستبدال الكامل (أساس التزامن الصحيح بين الأجهزة) ---
    // نجمع المعرّفات الموجودة قبل الدمج لمعرفة السجلات "الجديدة" فقط (التنبيهات لا تُرسل للنفس).
    const idsBefore = new Set();
    const prevArr = getKV(key);
    if (Array.isArray(prevArr)) prevArr.forEach((r) => { if (r && r.id !== undefined) idsBefore.add(r.id); });
    const existingArr = getKV(key);
    if (Array.isArray(incomingData) && Array.isArray(existingArr)) {
      // قائمة "المحذوفة نهائياً": أي سجل موجود فيها لا نعيده مهما حاولت نسخة أخرى دفعه
      // (حماية من "تعود الشركة المحذوفة" بعد الحذف — الحذف نهائي عبر معرّف السجل).
      const tomb = new Set(Array.isArray(getKV('rcerp_deleted_ids')) ? getKV('rcerp_deleted_ids') : []);
      setKV(key, mergeById(existingArr, incomingData, tomb));
    } else {
      setKV(key, incomingData);
    }
    // ---- تحديث قالب تليجرام المرجعي عند أي تغيير في الفروع/الأصناف/الفئات ----
    if (key === 'rcerp_branches' || key === 'rcerp_raw_materials' || key === 'rcerp_material_categories') {
      publishCatalogUpdate();
    }
    // ---- تنبيهات تليجرام: سجلات جديدة بُثّت من جهاز (جرد من الجوال، مبيعات، هدر) ----
    const TG_HOOKS = {
      rcerp_daily_counts: 'daily_count',
      rcerp_batch_sales: 'batch_sales',
      rcerp_wastage: 'wastage',
    };
    const tgType = TG_HOOKS[key];
    if (tgType && Array.isArray(incomingData)) {
      const newRecs = incomingData.filter((r) => r && r.id !== undefined && !idsBefore.has(r.id));
      if (newRecs.length > 0) {
        const rec = newRecs[0];
        const branchName = (() => {
          const b = (getKV('rcerp_branches') || []).find((x) => x && x.id === rec.branchId);
          return b ? (b.nameAr || b.name || rec.branch || '—') : (rec.branch || '—');
        })();
        const text = buildNotificationText({
          type: tgType,
          branch: branchName,
          actor: rec.countedBy || rec.createdBy || user?.name || '—',
          date: rec.date || (rec.createdAt ? new Date(rec.createdAt).toLocaleDateString('ar-SA-u-nu-latn') : '—'),
          itemCount: Array.isArray(rec.items) ? rec.items.length : (rec.itemCount || 0),
          totalValue: rec.totalValue ?? rec.totalConsumedValue ?? rec.total ?? null,
          details: rec.reason || rec.notes || rec.batchNumber || null,
        });
        // إرسال غير متزامن — لا يبطئ استجابة الحفظ.
        sendTelegram(store, text).catch(() => {});
        // --- إرسال PDF الجرد كمرفق (إذا كان ممكّناً في الإعدادات) ---
        if (tgType === 'daily_count') {
          const tgSettings = store.getKV('rcerp_telegram_settings');
          const sendPdf = !tgSettings || tgSettings.sendPdf !== false;
          if (sendPdf) {
            generateDailyCountPdf(rec, branchName).then((buf) => {
              const fname = `جرد يومي-${rec.date || 'today'}.pdf`;
              const caption = `<b>📦 جرد يومي</b> — ${branchName}\n📅 ${rec.date || '—'}\n👤 ${rec.countedBy || user?.name || '—'}`;
              sendTelegramDocument(store, buf, fname, caption).catch(() => {});
            }).catch(() => {});
          }
        }
      }
    }
    // ---- Webhooks: بثّ أحداث لكل متكامل خارجي مشترك (طعام/توصيل/محاسبة) ----
    // غير متزامن (fire-and-forget) — لا يبطئ استجابة الحفظ إطلاقاً.
    const whEvent = EVENT_KEYS[key];
    if (whEvent && Array.isArray(incomingData)) {
      const newRecs = incomingData.filter((r) => r && r.id !== undefined && !idsBefore.has(r.id)).length;
      dispatchWebhookEvent(store, whEvent, {
        event: whEvent,
        collection: key,
        at: new Date().toISOString(),
        newRecords: newRecs,
        totalRecords: incomingData.length,
        actor: user?.name || '—',
        device: saveUA,
      }).catch(() => {});
    }
    // شاهد الحذف محفوظ في الكتلة المبكّرة أعلاه (اتحاد + تنقية فورية)؛
    // وهنا نطبّق الشواهد أيضاً على أي دمج قادم كي لا تُبعث سجلات محذوفة من أجهزة قديمة.
    fs.appendFileSync(
      path.join(dataDir, 'savelog.txt'),
      `${new Date().toISOString()} | MERGED ${key} | ${saveBytes}b | ${saveUA}\n`
    );
    res.json({ ok: true });
  });

  // ---- Instance identity (used by the desktop launcher to find THIS copy's server) ----
  // Requires an authenticated session — the id reveals which deployment this is.
  app.get('/api/instance', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    res.json({ ok: true, id: instanceId });
  });

  // ---- Internet export / network state ----
  app.get('/api/network', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const host = readBindHost();
    res.json({
      ok: true,
      host,
      public: host !== '127.0.0.1',
      port: Number(process.env.PORT || 3001),
      localIPs: localIPs(),
      httpsOnly: false,
    });
  });

  app.post('/api/network/set-host', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const { host } = req.body || {};
    if (host !== '0.0.0.0' && host !== '127.0.0.1') return res.json({ ok: false, error: 'قيمة غير صالحة' });
    try { fs.writeFileSync(path.join(__dirname, 'host.txt'), host); } catch { return res.json({ ok: false, error: 'تعذر كتابة الإعدادات' }); }
    res.json({ ok: true, host, requiresRestart: true });
  });

  // ---- Companies launcher: list independent company copies that live next to this one ----
  // Each company is its own folder under the parent directory. A folder is a company
  // if it contains server/index.js (i.e. it was created via "Create Company Copy.vbs").
  const parentDir = path.resolve(__dirname, '..', '..');
  const isCompanyDir = (dir) => fs.existsSync(path.join(dir, 'server', 'index.js'));

  app.get('/api/companies', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const list = [];
    try {
      for (const entry of fs.readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(parentDir, entry.name);
        if (!isCompanyDir(dir)) continue;
        let port = null;
        const portFile = path.join(dir, 'server', 'port.txt');
        if (fs.existsSync(portFile)) {
          try { port = Number(fs.readFileSync(portFile, 'utf8').trim()); } catch { port = null; }
        }
        let running = false;
        if (port && port > 0) running = await portInUse(port);
        const currentAppRoot = path.resolve(__dirname, '..');
        list.push({
          name: entry.name,
          dir: entry.name,
          port,
          running,
          isCurrent: path.resolve(dir) === currentAppRoot,
        });
      }
    } catch { /* ignore scan errors */ }
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json({ ok: true, companies: list });
  });

  // Start a company copy's server (spawn node server/index.js in that folder).
  app.post('/api/start-company', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const { dir } = req.body || {};
    if (!dir || typeof dir !== 'string') return res.status(400).json({ ok: false, error: 'اسم الشركة مطلوب' });
    const companyDir = path.join(parentDir, dir);
    if (!isCompanyDir(companyDir)) return res.status(400).json({ ok: false, error: 'نسخة شركة غير معروفة' });
    const portFile = path.join(companyDir, 'server', 'port.txt');
    let port = 3001;
    if (fs.existsSync(portFile)) {
      try { port = Number(fs.readFileSync(portFile, 'utf8').trim()) || 3001; } catch { port = 3001; }
    }
    if (!(await portInUse(port))) {
      try {
        const child = spawn(process.execPath, ['server/index.js'], { cwd: companyDir, detached: true, stdio: 'ignore' });
        child.unref();
      } catch { /* ignore */ }
    }
    res.json({ ok: true, port });
  });

  // ---- تنبيهات تليجرام: حفظ الإعدادات، الاختبار، وجلب معرّفات المحادثات ----
  app.post('/api/telegram/settings', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const body = req.body || {};
    if ('botToken' in body && typeof body.botToken === 'string' && body.botToken && !/^[0-9]+:[A-Za-z0-9_-]{30,}$/.test(body.botToken)) {
      return res.status(400).json({ ok: false, error: 'توكن غير صالح — انسخه كاملاً من BotFather' });
    }
    if ('purchaseBotToken' in body && typeof body.purchaseBotToken === 'string' && body.purchaseBotToken && !/^[0-9]+:[A-Za-z0-9_-]{30,}$/.test(body.purchaseBotToken)) {
      return res.status(400).json({ ok: false, error: 'توكن بوت المشتريات غير صالح — انسخه كاملاً من BotFather' });
    }
    const current = store.getKV('rcerp_telegram_settings') || {};
    const chatIds = Array.isArray(body.chatIds) ? body.chatIds.map(String).filter(Boolean) : (current.chatIds || []);
    const purchaseChatIds = Array.isArray(body.purchaseChatIds) ? body.purchaseChatIds.map(String).filter(Boolean) : (current.purchaseChatIds || []);
    const next = {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : (current.enabled ?? false),
      botToken: typeof body.botToken === 'string' && body.botToken ? encryptSecret(String(body.botToken).trim(), 'tg:botToken') : (current.botToken || ''),
      chatIds,
      purchaseEnabled: typeof body.purchaseEnabled === 'boolean' ? body.purchaseEnabled : (current.purchaseEnabled ?? false),
      purchaseBotToken: typeof body.purchaseBotToken === 'string' && body.purchaseBotToken ? encryptSecret(String(body.purchaseBotToken).trim(), 'tg:purchaseBotToken') : (current.purchaseBotToken || ''),
      purchaseChatIds,
      sendPdf: typeof body.sendPdf === 'boolean' ? body.sendPdf : (current.sendPdf ?? true),
    };
    store.setKV('rcerp_telegram_settings', next);
    fs.appendFileSync(
      path.join(dataDir, 'savelog.txt'),
      `${new Date().toISOString()} | TG-SETTINGS saved | enabled=${next.enabled} | chats=${next.chatIds.length} | purchase_bot=${next.purchaseEnabled ? 'on' : 'off'} | purchase_chats=${next.purchaseChatIds.length} | files=${next.sendPdf} | UA=${(req.headers['user-agent'] || '').slice(0, 50)}\n`
    );
    res.json({ ok: true, enabled: next.enabled, chatCount: next.chatIds.length, hasToken: !!next.botToken });
  });

  app.get('/api/telegram/settings', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const s = store.getKV('rcerp_telegram_settings') || {};
    res.json({
      ok: true,
      enabled: !!s.enabled,
      chatIds: s.chatIds || [],
      sendPdf: s.sendPdf !== false,
      hasToken: !!decryptSecret(s.botToken ?? '', 'tg:botToken'),
      maskedToken: (() => { const m = String(decryptSecret(s.botToken ?? '', 'tg:botToken')); return m ? `${m.slice(0, 6)}…${m.slice(-4)}` : ''; })(),
      purchaseEnabled: !!s.purchaseEnabled,
      purchaseChatIds: s.purchaseChatIds || [],
      purchaseHasToken: !!decryptSecret(s.purchaseBotToken ?? '', 'tg:purchaseBotToken'),
      purchaseMaskedToken: (() => { const m = String(decryptSecret(s.purchaseBotToken ?? '', 'tg:purchaseBotToken')); return m ? `${m.slice(0, 6)}…${m.slice(-4)}` : ''; })(),
    });
  });

  // إرسال رسالة يدوية من الشاشات (طلبات شراء / أوامر توريد مبدئية ...) —
  // channel: 'main' للمجموعة الرئيسية، 'purchase' لمجموعة المشتريات المخصصة
  app.post('/api/telegram/send', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const body = req.body || {};
    const text = String(body.text || '').trim();
    if (!text) return res.status(400).json({ ok: false, error: 'نص الرسالة فارغ' });
    const channel = body.channel === 'purchase' ? 'purchase' : 'main';
    const result = await sendTelegram(store, text, { channel });
    fs.appendFileSync(
      path.join(dataDir, 'savelog.txt'),
      `${new Date().toISOString()} | TG-SEND channel=${channel} | sent=${result.sent} | errors=${result.errors.length ? result.errors.join('; ') : 'none'} | by=${user.name} | UA=${(req.headers['user-agent'] || '').slice(0, 50)}\n`
    );
    res.json(result.ok ? { ok: true, sent: result.sent } : { ok: false, error: result.errors.join('; ') });
  });

  app.post('/api/telegram/get-chat-ids', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const channel = req.body?.channel === 'purchase' ? 'purchase' : 'main';
    const result = await getBotChatIds(store, channel);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    res.json({ ok: true, chats: result.chats });
  });

  app.post('/api/telegram/test', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const channel = req.body?.channel === 'purchase' ? 'purchase' : 'main';
    const result = await testTelegram(store, req.body?.chatId, channel);
    if (!result.ok) return res.json({ ok: false, error: result.error });
    res.json({ ok: true, chatId: result.chatId });
  });

  // إرسال مستند (PDF) يدوياً من الشاشات — channel: 'main' أو 'purchase'
  app.post('/api/telegram/send-document', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const body = req.body || {};
    const filename = String(body.filename || '').trim();
    const caption = String(body.caption || '');
    const base64Data = String(body.base64 || '');
    const channel = body.channel === 'purchase' ? 'purchase' : 'main';
    if (!filename) return res.status(400).json({ ok: false, error: 'اسم الملف فارغ' });
    if (!base64Data) return res.status(400).json({ ok: false, error: 'بيانات الملف فارغة' });
    // تنظيف base64 (إزالة data URL prefix إن وُجد)
    const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(raw) || raw.length < 100) {
      return res.status(400).json({ ok: false, error: 'بيانات base64 غير صالحة' });
    }
    let buffer;
    try {
      buffer = Buffer.from(raw, 'base64');
    } catch {
      return res.status(400).json({ ok: false, error: 'تعذر فك تشفير base64' });
    }
    // فحص PDF magic bytes
    if (buffer.length < 100 || !buffer.slice(0, 4).toString().startsWith('%PDF')) {
      return res.status(400).json({ ok: false, error: 'الملف ليس PDF صالح' });
    }
    if (buffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'حجم الملف يتجاوز 4 ميغابايت' });
    }
    // تنظيف اسم الملف من الأحرف الخطرة
    const safeName = filename.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, '_').slice(0, 80);
    const result = await sendTelegramDocument(store, buffer, safeName, caption, channel);
    fs.appendFileSync(
      path.join(dataDir, 'savelog.txt'),
      `${new Date().toISOString()} | TG-SEND-DOC channel=${channel} | doc=${safeName} | sent=${result.sent} | errors=${result.errors.length ? result.errors.join('; ') : 'none'} | by=${user.name}\n`
    );
    res.json(result.ok ? { ok: true, sent: result.sent } : { ok: false, error: result.errors.join('; ') });
  });

  // توليد وإرسال تقرير طلب شراء / أمر توريد مبدئي كـ PDF للبوت — التوليد على
  // الخادم عبر PyMuPDF (عربية RTL صحيحة)، والعميل يرسل البنية المكانية فقط.
  app.post('/api/telegram/send-report', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const body = req.body || {};
    const payload = body.payload;
    const filename = String(body.filename || '').trim();
    const caption = String(body.caption || '');
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'بيانات التقرير فارغة' });
    }
    if (!filename) return res.status(400).json({ ok: false, error: 'اسم الملف فارغ' });
    if (!Array.isArray(payload.columns) || !Array.isArray(payload.rows)) {
      return res.status(400).json({ ok: false, error: 'بنية تقرير غير صالحة' });
    }
    const safeName = filename.replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, '_').slice(0, 80);
    const pdf = await generatePurchaseDocumentPdf(payload);
    if (!pdf || pdf.length < 500) {
      return res.status(500).json({ ok: false, error: 'تعذر توليد ملف PDF' });
    }
    // إرسال غير متزامن (fire-and-forget) مثل نمط الجرد اليومي — توليد PDF سريع
    // يُردّ للعميل فوراً، لكن رفع الملف لتليجرام لا يُنتظر حتى لا تتجاوز مدة
    // استجابة الخادم مهلة العميل (30 ثانية) فيظهر «انتهت مهلة الاتصال بالخادم».
    sendTelegramDocument(store, pdf, safeName, caption, 'purchase').then((result) => {
      try {
        fs.appendFileSync(
          path.join(dataDir, 'savelog.txt'),
          `${new Date().toISOString()} | TG-SEND-REPORT | doc=${safeName} | bytes=${pdf.length} | sent=${result.sent} | errors=${result.errors.length ? result.errors.join('; ') : 'none'} | by=${user.name}\n`
        );
      } catch { /* تجاهل */ }
    }).catch(() => {});
    res.json({ ok: true, sent: 'queued' });
  });

  // ---- تعلم مرادفات صنف/فرع مما يكتبه المشاركون في البوت ----
  app.post('/api/telegram/alias', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const { kind, alias, id } = req.body || {};
    const clean = String(alias || '').trim();
    if (!clean) return res.status(400).json({ ok: false, error: 'المُرادف فارغ' });
    if (!id) return res.status(400).json({ ok: false, error: 'المعرف فارغ' });
    if (kind === 'item') {
      const exists = (store.getKV('rcerp_raw_materials') || []).some((m) => m && m.id === id);
      if (!exists) return res.status(404).json({ ok: false, error: 'الصنف غير موجود' });
      learnItemAlias(store, clean, id);
      const aliases = getAliases(store).items;
      res.json({ ok: true, count: aliases.length, message: `سُجّل المرادف «${clean}» للصنف` });
    } else if (kind === 'branch') {
      const exists = (store.getKV('rcerp_branches') || []).some((b) => b && b.id === id);
      if (!exists) return res.status(404).json({ ok: false, error: 'الفرع غير موجود' });
      learnBranchAlias(store, clean, id);
      const aliases = getAliases(store).branches;
      res.json({ ok: true, count: aliases.length, message: `سُجّل المرادف «${clean}» للفرع` });
    } else {
      res.status(400).json({ ok: false, error: 'نوع غير معروف — استخدم item أو branch' });
    }
  });

  // ---- صندوق التحقق قبل الرفع (استقبال التليجرام/الواتس) ----
  app.get('/api/intake-inbox', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const inbox = Array.isArray(getKV('rcerp_intake_inbox')) ? getKV('rcerp_intake_inbox') : [];
    res.json({ ok: true, items: inbox });
  });

  app.post('/api/intake-inbox/:id/raise', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const result = raiseFromInbox(store, String(req.params.id || ''));
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post('/api/intake-inbox/:id/bind-raise', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const result = bindAndRaiseFromInbox(store, String(req.params.id || ''), req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post('/api/intake-inbox/:id/reject', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const result = rejectFromInbox(store, String(req.params.id || ''), String((req.body || {}).reason || ''));
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post('/api/intake-inbox/raise-all-matched', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const results = raiseAllFullyMatched(store);
    res.json({ ok: true, raised: results.length, results });
  });

  // ---- تحميل PDF جرد محفوظ (نفس الملف الذي يُرسَل عبر تليجرام) ----
  app.get('/api/daily-count-pdf/:id', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const rec = (store.getKV('rcerp_daily_counts') || []).find((r) => r && r.id === req.params.id);
    if (!rec) return res.status(404).json({ ok: false, error: 'السجل غير موجود' });
    const branch = (store.getKV('rcerp_branches') || []).find((x) => x && x.id === rec.branchId);
    const branchName = branch ? (branch.nameAr || branch.name || rec.branch || '—') : (rec.branch || '—');
    try {
      const buf = await generateDailyCountPdf(rec, branchName);
      const fname = `جرد يومي-${rec.date || 'today'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
      res.send(buf);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'فشل توليد PDF' });
    }
  });

  // ---- نقطة صحة الإدارة (P1.6) ----
  app.get('/api/admin/health', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });
    const sessions = store.getKV('rcerp_sessions') || [];
    const changeLogCount = store.getChangeLogCount ? store.getChangeLogCount() : 0;
    const auditCount = (store.getKV('rcerp_audit') || []).length;
    const users = store.getKV('rcerp_users') || [];
    const branches = store.getKV('rcerp_branches') || [];
    const posOrders = store.getKV('rcerp_pos_orders') || [];
    const inventory = store.getKV('rcerp_inventory') || [];
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = posOrders.filter((o) => {
      const d = o.createdAt || o.date || '';
      return String(d).slice(0, 10) === today;
    }).length;
    const lowStockItems = inventory.filter((i) => {
      const rp = Number(i.reorderPoint || 0);
      return rp > 0 && (Number(i.quantity) || 0) < rp;
    }).length;
    res.json({
      ok: true,
      status: 'healthy',
      version: PKG_VERSION,
      build: buildFingerprint,
      server: serverStamp,
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      memory: process.memoryUsage(),
      sessions: sessions.length,
      users: users.length,
      branches: branches.length,
      todayOrders,
      lowStockItems,
      changeLogCount,
      auditCount,
      timestamp: new Date().toISOString(),
    });
  });

  // ---- رصد لحظي للملاك/الإدارة: ملخص خفيف يُسحَب كل 5 ثوانٍ (بند 67) ----
  app.get('/api/live', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const today = new Date().toISOString().slice(0, 10);
    const isToday = (s) => {
      if (!s) return false;
      return String(s).slice(0, 10) === today;
    };
    const pos = Array.isArray(getKV('rcerp_pos_orders')) ? getKV('rcerp_pos_orders') : [];
    const bs = Array.isArray(getKV('rcerp_batch_sales')) ? getKV('rcerp_batch_sales') : [];
    const inv = Array.isArray(getKV('rcerp_inventory')) ? getKV('rcerp_inventory') : [];
    const mats = Array.isArray(getKV('rcerp_raw_materials')) ? getKV('rcerp_raw_materials') : [];
    const transfers = Array.isArray(getKV('rcerp_stock_transfers')) ? getKV('rcerp_stock_transfers') : [];
    const wastage = Array.isArray(getKV('rcerp_wastage')) ? getKV('rcerp_wastage') : [];

    const posT = pos.filter((o) => isToday(o.createdAt) || isToday(o.date));
    const bsT = bs.filter((b) => isToday(b.date) || isToday(b.createdAt));
    const revenueToday = posT.reduce((s, o) => s + (Number(o.subtotal) || 0), 0)
      + bsT.reduce((s, b) => s + (Number(b.netRevenue) || Number(b.totalRevenue) / (1 + (Number(b.vatRate) || 0.15)) || 0), 0);
    const ordersToday = posT.length + bsT.length;
    const transfersToday = transfers.filter((t) => isToday(t.date)).length;
    const wastageToday = wastage.filter((w) => isToday(w.date) || isToday(w.createdAt))
      .reduce((s, w) => s + (Number(w.totalCostImpact) || 0), 0);

    // مخزون منخفض: مجموع كميات المادة عبر الفروع < حد إعادة الطلب
    const qtyByMat = {};
    inv.forEach((r) => { qtyByMat[r.rawMaterialId] = (qtyByMat[r.rawMaterialId] || 0) + (Number(r.quantity) || 0); });
    const lowStock = mats.filter((m) => {
      const rp = Number(m.reorderPoint || m.minStockLevel || 0);
      return rp > 0 && (qtyByMat[m.id] || 0) < rp;
    });
    const inventoryValue = inv.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.averageUnitCost) || Number(r.unitCost) || 0), 0);

    res.json({
      ok: true,
      at: new Date().toISOString(),
      today,
      revenueToday: Math.round(revenueToday),
      ordersToday,
      transfersToday,
      wastageToday: Math.round(wastageToday),
      inventoryValue: Math.round(inventoryValue),
      lowStockCount: lowStock.length,
      lowStock: lowStock.slice(0, 5).map((m) => ({ id: m.id, name: m.nameAr || m.name || m.id, qty: qtyByMat[m.id] || 0 })),
      openTransferCount: transfers.filter((t) => t.status === 'submitted' || t.status === 'draft').length,
    });
  });

  // ---- مزامنة يدوية شاملة (Admin فقط) ----
  // يجبر جميع الأجهزة المتصلة على سحب أحدث البيانات عبر bootstrap كامل
  // ---- سحب المستندات الأخيرة من الخادم وتطبيقها محلياً (PULL) ----
  app.post('/api/admin/pull-recent-docs', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    // هذا المسار للإدارة فقط
    if (user.role !== 'admin' && user.role !== 'executive' && user.role !== 'branch_manager' && user.role !== 'cost_controller') {
      return res.status(403).json({ ok: false, error: 'غير مصرح' });
    }

    try {
      const recentDocs = store.getKV('rcerp_recent_docs') || [];
      // التأكد من صلاحية البيانات
      const valid = Array.isArray(recentDocs) ? recentDocs.filter((d) => d && typeof d === 'object' && d.id && d.type && d.title && d.tab && d.at).slice(0, 20) : [];
      
      res.json({ ok: true, data: { rcerp_recent_docs: valid }, message: 'تم جلب المستندات الأخيرة من الخادم' });
    } catch (e) {
      res.status(500).json({ ok: false, error: `فشل جلب المستندات: ${e.message}` });
    }
  });

  app.post('/api/admin/sync-force', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح — للمدير فقط' });

    try {
      // 1) زيادة عداد التحديث لإجبار bootstrap كامل على جميع الأجهزة
      useSyncStore.getState().retryBootstrap();

      // 2) دفع أحدث نسخة من جميع المجموعات للأجهزة التي ستستعلم الآن
      // (الأجهزة ستحصل عليها في استدعاء /api/bootstrap التالي)

      // 3) تسجيل العملية
      fs.appendFileSync(
        path.join(dataDir, 'savelog.txt'),
        `${new Date().toISOString()} | FORCE-SYNC by ${user.name} (${user.id})\n`
      );

      res.json({
        ok: true,
        message: 'تم إرسال إشارة مزامنة شاملة — جميع الأجهزة ستسحب أحدث البيانات خلال ثوانٍ',
        timestamp: new Date().toISOString(),
        triggeredBy: user.name
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: `فشل المزامنة القسرية: ${e.message}` });
    }
  });

  // ---- مزامنة مجموعة محددة (Admin/Manager) ----
  app.post('/api/admin/sync-collection', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin' && user.role !== 'executive' && user.role !== 'branch_manager' && user.role !== 'cost_controller') return res.status(403).json({ ok: false, error: 'غير مصرح' });

    const { key } = req.body || {};
    if (!key || !COLLECTION_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'مفتاح مجموعة غير صالح' });

    try {
      // إجبار مزامنة فورية لهذه المجموعة
      const synced = await useSyncStore.getState().syncNow(key);

      fs.appendFileSync(
        path.join(dataDir, 'savelog.txt'),
        `${new Date().toISOString()} | SYNC-COLLECTION ${key} by ${user.name} | ${synced ? 'ok' : 'partial'}\n`
      );

      res.json({ ok: true, key, synced, message: synced ? 'تمت المزامنة بنجاح' : 'مزامنة جزئية — راجع السجلات' });
    } catch (e) {
      res.status(500).json({ ok: false, error: `فشل مزامنة ${key}: ${e.message}` });
    }
  });

  // ---- جلب أحدث بيانات من جميع الأجهزة (Bootstrap كامل) ----
  app.get('/api/admin/bootstrap-full', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });

    try {
      const data = {};
      COLLECTION_KEYS.forEach((key) => {
        const v = getKV(key);
        if (v !== null) data[key] = sanitizeCollectionForBroadcast(key, v);
      });

      fs.appendFileSync(
        path.join(dataDir, 'savelog.txt'),
        `${new Date().toISOString()} | BOOTSTRAP-FULL by ${user.name}\n`
      );

      res.json({ ok: true, data, count: Object.keys(data).length });
    } catch (e) {
      res.status(500).json({ ok: false, error: `فشل جلب البيانات: ${e.message}` });
    }
  });
};
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
import { canWriteCollection, canPurgeTombstone, canReadCollection, BRANCH_SCOPED_KEYS, scopeToBranches } from '../permissions.mjs';
import { sanitizeCollectionForBroadcast } from '../sanitize.mjs';
import { sanitizeRecords } from '../src/modules/utils/record-guard.js';
import { summarizeChange, summarizeDelete } from '../src/modules/utils/collection-audit.js';
import { validateCollectionBody } from '../schemas/collection-schemas.mjs';
import { store } from '../store.mjs';
import { PKG_VERSION, getBuildFingerprint, serverStamp } from '../version.mjs';
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

// حدّ أعلى لقائمة الشواهد: تنمو بلا سقف وبلا عمر، فكل شاهد قديم يرسله كل
// جهاز في كل مزامنة (قائمة 148 معرّفاً = كل طلب يمرّ على 148 فحصاً)، ومع
// تراكمها يرتفع احتمال رفض دفعة كاملة. الشاهد الذي تجاوز الحدّ لم يعد لسجله
// أي أثر (سجله محذوف أصلاً)، فحذفه لا يفقد بيانات.
//
// ⛔⛔ MOVEMENT_RETENTION WAS 5000, AND THAT DELETED INVENTORY HISTORY.
//
//   Measured on the live database on 2026-10-07:
//       rcerp_inventory_movements   18,331 rows  ->  5,000 rows
//       earliest surviving movement  2026-09-16 (21 days of history gone)
//
//   13,331 stock movements were deleted, silently, with no backup taken before
//   the deletion and no warning to anyone. The backup system saves the key
//   AFTER this runs, so every hourly backup since then has recorded the
//   truncated list as the truth.
//
//   The comment above it claimed "the cap is on old regions, never on recent
//   movements". That is true of WHICH rows are dropped and irrelevant to
//   WHETHER dropping them is acceptable: a stock ledger that keeps three weeks
//   cannot answer "what did this item cost on the 3rd of September", which is
//   precisely the question a food-cost report exists to answer.
//
//   ⭐ 90 DAYS, configurable. MOVEMENT_RETENTION_DAYS=0 disables the cap
//    entirely, which is the setting to use when the ledger must be complete.
//    500 movements a day is the measured ceiling across 12 branches, so 90 days
//    is roughly 45,000 rows -- about 2.5x the live ledger today.
const RETENTION_DAYS = Number(process.env.MOVEMENT_RETENTION_DAYS ?? 90);
const MOVEMENT_RETENTION = RETENTION_DAYS > 0 ? RETENTION_DAYS * 500 : Infinity;
// ⭐ rcerp_audit is a DEBUG list. Measured: it also had 18,331 rows and was
//   being cut at the same 5,000. Nothing reads it for reporting, so it is
//   capped hard and on purpose. rcerp_inventory_movements is the stock ledger
//   and is NOT in this set -- conflating the two is what made the ledger
//   disposable by accident.
const MOVEMENT_KEYS = new Set(['rcerp_audit']);
const AUDIT_RETENTION = 5000;

const applyRetention = (key, value) => {
  // ⛔ rcerp_inventory_movements is NOT in MOVEMENT_KEYS, so it is no longer
  //    touched here at all. The stock ledger grows. That is correct: it is the
  //    record of what happened to the stock, and a record that deletes itself
  //    is not a record.
  if (!MOVEMENT_KEYS.has(key) || !Array.isArray(value)) return value;
  const cap = key === 'rcerp_audit' ? AUDIT_RETENTION : MOVEMENT_RETENTION;
  if (value.length <= cap) return value;
  // الأحدث أولاً بـdate (الحركة تحمله)، ولا نُسقط ما لا يحمل تاريخاً كاملاً
  // إلا إذا كان الأقدم — نُبقي الأصناف بلا تاريخ في النهاية بأمان.
  const dated = value.filter((r) => r && typeof r.date === 'string' && r.date.length >= 10);
  const undated = value.filter((r) => !(r && typeof r.date === 'string' && r.date.length >= 10));
  if (dated.length <= cap) return value;
  dated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const kept = dated.slice(0, cap);
  const dropped = value.length - kept.length - undated.length;
  try {
    appendSavelog(
      `${new Date().toISOString()} | RETENTION ${key} | ${value.length}->${kept.length + undated.length} (dropped ${dropped} oldest)\n`
    );
  } catch { /* تجاهل */ }
  return [...kept, ...undated];
};


// كل تسجيل savelog استباقي: فشله (قرص ممتلئ/مسار مرفوض) لا يُسقط عملية حفظ
// ناجحة. كان سطر MERGED بلا حماية فتسقط بخطأ ENOENT بعد الدمج فترد 500، فيعيد
// العميل المحاولة كل 6 ثوانٍ إلى الأبد (حلقة الحفظ المتكرر).
const appendSavelog = (line) => {
  try { fs.appendFileSync(path.join(dataDir, 'savelog.txt'), line); } catch { /* تجاهل */ }
};

const MAX_TOMBSTONES = 2000;

export const registerData = (app) => {
  app.get('/api/bootstrap', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const since = Number(req.query.since);
    const isDelta = Number.isFinite(since) && since >= 0;
    const data = {};
    const touchedKeys = [];
    // تقييد القراءة: كل مجموعة تُفلتر حسب صلاحية الجلسة. لا نرفض الطلب
    // كله (كسر العميل)، بل نستبعد ما لا يحقّ للمستخدم رؤيته ونُعلمه بالمستبعد.
    const deniedKeys = [];
    const accessRoles = store.getKV('rcerp_access_roles') || [];
    const branches = store.getKV('rcerp_branches') || [];
    COLLECTION_KEYS.forEach((key) => {
      if (LAZY_KEYS.has(key)) return;
      const v = getKV(key);
      if (v === null) return;
      if (!canReadCollection(user, key, accessRoles).ok) { deniedKeys.push(key); return; }
      // قيد الفرع: الموظف غير الإداري لا يستقبل سجلات فروع غيره. نفس قاعدة
      // visibleBranchIdsFor في العميل، فيتطابق ما يراه مع ما يصله.
      const scoped = BRANCH_SCOPED_KEYS.has(key) ? scopeToBranches(v, user, branches) : v;
      if (isDelta) {
        const kvMeta = store.getKvMeta ? store.getKvMeta(key) : null;
        const lastMod = kvMeta?.lastModified || 0;
        if (lastMod <= since) return;
        touchedKeys.push(key);
      }
      data[key] = sanitizeCollectionForBroadcast(key, scoped);
    });
    const rev = revState ? revState() : { rev: 1, boot: 0 };
    const etag = `W/"${rev.rev}-${rev.boot}"`;
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ok: true, data, user: publicUser(user), version: PKG_VERSION, build: getBuildFingerprint(), server: serverStamp, lazyKeys: [...LAZY_KEYS], deniedKeys, rev: rev.rev, boot: rev.boot, delta: isDelta, touchedKeys: isDelta ? touchedKeys : undefined });
  });

  // ترقيم خفيف بالقائمة (cursor) لمفتاح واحد — مساعدة للمعاينة عند نمو قائمة
  // كبيرة (مثل Recipes) دون سحب الكل. نفس مصدر الحقيقة: getKV للقائمة.
  app.get('/api/collections/:key/paginated', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const { key } = req.params;
    if (!COLLECTION_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'مفتاح غير معروف' });
    // تقييد القراءة: هنا نرفض صراحةً (هذا مسار صفحة واحدة صريح، لا bootstrap
    // شامل) — فالمتصفح يعرف أنه لا يستطيع تحميل هذه المجموعة.
    const accessRoles = store.getKV('rcerp_access_roles') || [];
    if (!canReadCollection(user, key, accessRoles).ok) {
      return res.status(403).json({ ok: false, error: 'غير مصرح — هذه البيانات خارج نطاق صلاحياتك', reason: 'read_forbidden', key });
    }
    // قيد الفرع يُطبَّق هنا أيضاً: المجموعات الـlazy (inventory, journal,
    // movements...) تُسحب بعد bootstrap، فبلا قصّ she'd تعيد كل الفروع.
    const branches = store.getKV('rcerp_branches') || [];
    const source = BRANCH_SCOPED_KEYS.has(key)
      ? scopeToBranches(getKV(key), user, branches)
      : getKV(key);
    const page = paginateCollection(source, String(req.query.cursor || ''), Number(req.query.limit));
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
        appendSavelog(
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

    // ---- تحقق Zod للمجموعات المغطاة (الحقول المالية + المعرّفات) ----
    // لا نغطي كل المجموعات — المجموعات بلا مخطط تمرّ كما هي.
    // الخطأ 400 هنا يوقف الدفعة قبل الوصول للحراس اللاحقة.
    const validation = validateCollectionBody(key, req.body);
    if (!validation.success) {
      try {
        appendSavelog(
          `${new Date().toISOString()} | ZOD-REJECT ${key} | ${JSON.stringify(validation.error)} | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
      return res.status(400).json({ ok: false, error: 'بيانات غير صالحة', details: validation.error });
    }
    // نستخدم البيانات المنظّفة (زائدة الحقول تُسقط، التحويل يتم تلقائياً)
    let incomingData = validation.data;

    // ---- السجلات المصفّاة: تسجيل + إبلاغ العميل ----
    // القرار: "filter, never reject whole batch" — السجل الفاسد يسقط وحده
    // ويُسجَّل هنا، والدفعة كلها تنجح (200) فلا تدور في حلقة إعادة محاولة.
    const zodDropped = validation.dropped || [];
    if (zodDropped.length > 0) {
      try {
        appendSavelog(
          `${new Date().toISOString()} | ZOD-FILTER ${key} | dropped=${zodDropped.length}/${Array.isArray(req.body) ? req.body.length : '?'} | ${JSON.stringify(zodDropped.slice(0, 3))} | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
    }

    // ---- حماية من تلف النصوص العربية ----
    // جهاز يحمل نسخة تالفة محلياً (كاشح بايتات CP437) سيدفعها كل بضعة ثوانٍ
    // فيطمس النسخة النظيفة. التلف غير قابل للإصلاح، فنرفض الدفعات التالفة
    // ونُبقي بيانات السيرفر. نعيد 200 عمداً ليُفرغ الجهاز طابور حفظه المعلق
    // ويجلب النسخة النظيفة بدل إعادة المحاولة بلا نهاية.
    if (looksCorrupted(req.body)) {
      try {
        appendSavelog(
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
    // شاهد الحذف: قائمة معرّفات محذوفة نهائياً (مصفوفة سلاسل لا سجلات) —
    // تُجمَّع بالاتحاد (union) لا بالاستبدال كي لا يخسر جهازٌ حذفَ جهازٍ آخر،
    // وتُنقَّى منها كل المجموعات فوراً: أي سجل يدخل الشواهد لا يعود أبداً.
    if (key === 'rcerp_deleted_ids') {
      const existing = Array.isArray(getKV(key)) ? getKV(key) : [];
      const incoming = Array.isArray(incomingData) ? incomingData : [];

      // تصفية الشواهد الواردة — بلا رفض للدفعة:
      // كان رفض دفعة كاملة (400) يوقف مزامنة كل المجموعات، فتجمد حفظ الجرد
      // وكل تعديل آخر بسبب معرّف واحد مرفوض. الآن نقبل الصالح، ونُبلغ العميل
      // بما رُفض ليستبعده محلياً بدل إعادة إرساله إلى الأبد.
      //  - يُرفض ما ينتمي لمجموعة لا يملك المستخدم حق حذفها (admin-only/capped).
      //  - غير الموجود أصلاً (سجل جديد/محذوف سابقاً) يُقبل.
      const validIncoming = [];
      const rejectedIds = [];
      for (const id of incoming) {
        let forbidden = false;
        for (const col of COLLECTION_KEYS) {
          if (col === key || col === 'rcerp_deleted_ids' || col === 'rcerp_users') continue;
          const arr = getKV(col);
          if (!Array.isArray(arr)) continue;
          if (!arr.some(r => r && r.id !== undefined && r.id === id)) continue;
          if (!canPurgeTombstone(user, col, accessRoles)) { forbidden = true; }
          break; // أول مجموعة تحتوي المعرّف تحسمه (المعرّفات فريدة عملياً)
        }
        if (forbidden) rejectedIds.push(id);
        else validIncoming.push(id);
      }
      if (rejectedIds.length) {
        appendSavelog(
          `${new Date().toISOString()} | TOMBSTONE-REJECTED ${key} | ${rejectedIds.length}/${incoming.length} ids | ${saveUA}\n`
        );
      }

      const tomb = Array.from(new Set([...existing, ...validIncoming]));
      // الأحدث في الصدارة: الوارد الآن مقصود الآن، والم.weather-old من existing.
      // نبقي آخر MAX_TOMBSTONES معرّفاً فقط.
      const capped = tomb.length > MAX_TOMBSTONES
        ? tomb.slice(tomb.length - MAX_TOMBSTONES)
        : tomb;
      if (capped.length !== tomb.length) {
        appendSavelog(
          `${new Date().toISOString()} | TOMBSTONE-CAP ${key} | ${tomb.length}->${capped.length} | ${saveUA}\n`
        );
      }
      setKV(key, capped);
      const tombSet = new Set(capped);
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
      appendSavelog(
        `${new Date().toISOString()} | MERGED ${key} | ${saveBytes}b | ${saveUA}\n`
      );
      // نُبلغ العميل بالمرفوض ليُسقطها من قائمته المحلية — وإلا بقيت في
      // pendingSaves تُعاد إلى الأبد (هذه كانت حلقة التجميد).
      // الحذف النهائي هو أخطر عملية على البيانات — يُسجَّل دائماً بلا استثناء.
      const del = summarizeDelete({ key, ids: validIncoming });
      if (del) store.writeAudit(user, del.action, key, del.detail);
      return res.json({ ok: true, rejectedIds });
    }
    if (key !== 'rcerp_users' && key !== 'rcerp_ai_settings' && key !== 'rcerp_telegram_settings' && key !== 'rcerp_intake_inbox' && key !== 'rcerp_recent_docs') {
      const reject = shouldRejectShrink(getKV(key), incomingData);
      if (reject) {
        appendSavelog(
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
        appendSavelog(
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
          appendSavelog(
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
          appendSavelog(
            `${new Date().toISOString()} | TELEGRAM_SETTINGS_NORMALIZE_ERROR | ${e && (e.stack || e.message)}\n`
          );
        } catch { /* تجاهل */ }
        return res.status(400).json({ ok: false, error: 'بيانات إعدادات تليجرام المرسلة غير صالحة — حدّث الصفحة لإعادة تحميل الإعدادات الحقيقية من الخادم.' });
      }
    }
if (key === 'rcerp_recent_docs') {
      try {
        appendSavelog(
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
        appendSavelog(
          `${new Date().toISOString()} | RECENT_DOCS_NORMALIZE_ERROR | ${e && (e.stack || e.message)}\n`
        );
        return res.status(400).json({ ok: false, error: 'بيانات المستندات الأخيرة غير صالحة — سيتم إعادة تحميلها من الخادم.' });
      }
    }
    // --- فرض إغلاق الفترات خادمياً: رفض أي كتابة لشهر/يوم مقفل ---
    // المصفوفات المرفوضة بـ Zod تمرّ هنا أيضاً كي لا تُحسب حذفاً لفترة مقفلة
    // (الدمج التراكمي يبقيها على الخادم — ليست حذفاً).
    const zodDroppedIds = zodDropped.map((d) => d.id).filter((v) => v !== undefined);
    const periodViolation = findPeriodViolation(key, incomingData, getKV(key), getKV, zodDroppedIds);
    if (periodViolation) {
      try {
        appendSavelog(
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
    // --- حارس شكل السجلات عند حدّ الشبكة ---
    // قبل الدمج مباشرة. ما بعد هنا يصبح في المخزن الدائم، فما لم يُصحَّح هنا
    // يُصلَّح في ledger ولا يظهر في تقرير.
    // نُصفّي ولا نرفض: السجل الفاسد وحده يُسقَط ويُبلَّغ، وإلا تجمدت مزامنة
    // كل المجموعات بسبب معرّف واحد — وهو ما حدث فعلاً قبل شواهد الحذف.
    const guard = sanitizeRecords(incomingData);
    if (guard.clean !== incomingData) incomingData = guard.clean;
    if (guard.rejected.length || guard.coerced) {
      try {
        appendSavelog(
          `${new Date().toISOString()} | GUARD ${key} | dropped=${guard.rejected.length} reasons=${[...new Set(guard.rejected.map((r) => r.reason))].join(',')} | money-coerced=${guard.coerced} | ${saveUA}\n`
        );
      } catch { /* تجاهل */ }
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
      const merged = mergeById(existingArr, incomingData, tomb);
      // retention: سجلات الحركة تنمو بلا حدّ على الخادم (العميل يـ slice محلياً
      // فقط، والخادم يدمج فيراكم). بلا سقف تتحوّل إلى 3MB تُسحب في كل bootstrap.
      // نُبقي الأحدث دائماً: السقف على الأقل قديم، فلا يُسقط حركة حديثة.
      const retained = applyRetention(key, merged);
      setKV(key, retained);

      // ---- تدقيق الأعمال: سطر واحد لكل تغيير يستحق، لا لكل طلب ----
      // قبل كان كل هذا يمرّ بلا أثر: تعديل مبلغ على فاتورة لا يترك دليلاً،
      // والحذف النهائي لا يُسجَّل إلا في ملف الحفظ. الفرق هنا هو الحقيقة:
      // ما تغيّر في المخزن قبل وبعد الدمج، لا ما وصل في الطلب.
      const change = summarizeChange({ key, before: existingArr, after: retained });
      if (change) store.writeAudit(user, change.action, key, change.detail);
    } else {
      setKV(key, incomingData);
      // مسار الاستبدال الكامل (غير مصفوفة أو أول كتابة): يُسجَّل أيضاً
      const change = summarizeChange({ key, before: existingArr, after: incomingData });
      if (change) store.writeAudit(user, change.action, key, change.detail);
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
    appendSavelog(
      `${new Date().toISOString()} | MERGED ${key} | ${saveBytes}b | ${saveUA}\n`
    );
    // نبلّغ العميل بما سقط ليعيد جلب النسخة النظيفة — كما في مسار شواهد الحذف.
    // به يعرف أن Modification محلي لن يصل، لا أن يرسله إلى الأبد بصمت.
    // ملاحظة: هذا الرد ليس حلقة إعادة محاولة — 200 يعني نجاح الدفعة؛ المصفوف
    // الإضافي من ZOD-FILTER فقط يُظهر ما لم يصل من السجلات.
    const finalRejectedIds = [
      ...guard.rejected.map((r) => r.id),
      ...zodDropped.map((d) => d.id).filter(Boolean),
    ];
    res.json(finalRejectedIds.length ? { ok: true, rejectedIds: finalRejectedIds } : { ok: true });
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
    appendSavelog(
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
    appendSavelog(
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
    appendSavelog(
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
        appendSavelog(
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
    // نفس قيد الفرع المطبَّق على bootstrap: صندوق الفواتير يحوي فرع المصدر.
    const branches = store.getKV('rcerp_branches') || [];
    res.json({ ok: true, items: scopeToBranches(inbox, user, branches) });
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

  // تخصيص أرقام المستندات: الخادم المصدر الوحيد للحق. العميل كان يحسب
  // max+1 من نسخته المحلية ⇒ جهازان في اللحظة نفسها يأخذان رقماً واحداً.
  // POST /api/doc-seq {prefix, count, year?} ⇒ أرقام محجوزة لا تتكرر.
  app.post('/api/doc-seq', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    const prefix = String(req.body?.prefix || '');
    const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 50);
    const year = Number(req.body?.year) || new Date().getFullYear();
    if (!/^[A-Z]{2,4}$/.test(prefix)) {
      return res.status(400).json({ ok: false, error: 'بادئة غير صالحة (2-4 حروف كبيرة)' });
    }
    // الأدوار الإدارية فقط: تخصيص أرقام مستند رسمية.
    if (user.role !== 'admin' && user.role !== 'executive' && user.role !== 'branch_manager') {
      return res.status(403).json({ ok: false, error: 'غير مصرح — تخصيص أرقام المستندات للإدارة' });
    }
    const nums = store.reserveDocNumbers(prefix, count, year);
    res.json({ ok: true, prefix, year, numbers: nums });
  });

  // ---- نقطة صحة الإدارة (P1.6) ----
  app.get('/api/admin/health', async (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin') return res.status(403).json({ ok: false, error: 'غير مصرح' });

    // ⛔⛔ Three counters here used to be fiction, with no error anywhere:
    //    sessions      — getKV('rcerp_sessions') is never a KV key. Sessions live
    //                    in the sessions table (34 rows on production).
    //    changeLogCount— store.getChangeLogCount was never defined, so the guard
    //                    `store.getChangeLogCount ? ... : 0` produced 0 forever.
    //                    Real count on production: 8053.
    //    Both now come from store.sessionCount() / store.changeLogCount().
    //
    // ⭐ null, not 0, when a count cannot be taken: "could not count" must never
    //    look like "counted, and it is empty".
    const warnings = [];
    const safe = async (label, fn) => {
      try {
        const v = await fn();
        if (v === null || v === undefined) { warnings.push(`${label}: count unavailable`); return null; }
        return v;
      } catch (e) {
        warnings.push(`${label}: ${(e && e.message) || 'failed'}`);
        return null;
      }
    };

    const sessions = await safe('sessions', () => store.sessionCount());
    const changeLogCount = await safe('changeLogCount', () => store.changeLogCount());
    const auditLogCount = await safe('auditLogCount', () => store.auditLogCount());
    // auditCount counts the synced KV collection; auditLogCount counts the
    // server-side audit_log table. They are separate stores and differ.
    const auditCount = (store.getKV('rcerp_audit') || []).length;
    const users = store.getKV('rcerp_users') || [];
    const branches = store.getKV('rcerp_branches') || [];
    const posOrders = store.getKV('rcerp_pos_orders') || [];
    const inventory = store.getKV('rcerp_inventory') || [];
    // ⚠️ UTC day, not the Riyadh business day. See RiyadhDayWarning below.
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
      // ⛔ A counter we could not read is not "healthy". Report it.
      status: warnings.length ? 'degraded' : 'healthy',
      ...(warnings.length ? { warnings } : {}),
      version: PKG_VERSION,
      build: getBuildFingerprint(),
      server: serverStamp,
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
      memory: process.memoryUsage(),
      sessions,
      users: users.length,
      branches: branches.length,
      todayOrders,
      lowStockItems,
      changeLogCount,
      auditCount,
      auditLogCount,
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

  // ==========================================================================
  //  Food cost report -- cost comes from the RECIPE, never from the POS export.
  //
  //  ⛔ WHY THIS EXISTS SEPARATELY FROM /api/live
  //     /api/live answers "what happened today" and is scoped to the user's
  //     branch. This answers "what did the item cost" and is company-wide,
  //     because a food-cost percentage is meaningless for one branch: the same
  //     recipe is sold at all twelve, so a single branch's ratio only tells you
  //     about that branch's discounting, not about cost control.
  //
  //  ⛔ THE ONE RULE THIS ENFORCES
  //     revenue and cost are BOTH Foodics quantity x a recipe field. The
  //     export's own cost column is never used. It is returned separately as
  //     `foodicsCost` so the two can be compared, and the operator has confirmed
  //     the export column is wrong. Reading it here would be a silent
  //     regression the day someone trusted it.
  //
  //  ⛔ WHY THE COMPARISON COLUMN EXISTS
  //     Foodics prices are not uniform. Each delivery app carries its own price
  //     and its own discounts, so the charged price sits above or below the
  //     recipe price depending on volume and promotions. The variance is
  //     information, not a defect, and it is reported per branch rather than
  //     averaged away.
  //
  //  ⛔ READ-ONLY. No writes on this route, by construction.
  // ==========================================================================
  app.get('/api/report/food-cost', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });
    if (user.role !== 'admin' && user.role !== 'executive' && user.role !== 'branch_manager' && user.role !== 'cost_controller') {
      return res.status(403).json({ ok: false, error: 'غير مصرح' });
    }

    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    const branchFilter = typeof req.query.branch === 'string' && req.query.branch ? req.query.branch : null;

    const lines = Array.isArray(getKV('rcerp_pos_lines')) ? getKV('rcerp_pos_lines') : [];
    const recipes = Array.isArray(getKV('rcerp_recipes')) ? getKV('rcerp_recipes') : [];
    const batches = Array.isArray(getKV('rcerp_pos_batches')) ? getKV('rcerp_pos_batches') : [];
    const branches = Array.isArray(getKV('rcerp_branches')) ? getKV('rcerp_branches') : [];

    if (!lines.length) {
      return res.json({
        ok: true,
        empty: true,
        reason: 'لم يتم استيراد مبيعات Foodics بعد — لا توجد أسطر في rcerp_pos_lines',
        batches: batches.length,
      });
    }

    const branchName = new Map();
    for (const b of branches) if (b.ref) branchName.set(String(b.ref), b.nameAr || b.nameEn || '');

    // ---- accumulate both sides ----
    const blank = () => ({ qty: 0, revenue: 0, cost: 0, foodicsRevenue: 0, foodicsCost: 0 });
    const grand = blank();
    const byBranch = new Map();
    const byDay = new Map();
    // ⭐ Keyed by recipeId, not posItemId. Measured 2026-10-07: seven products
      //   each appeared TWICE in this table because Foodics carries them under
      //   two POS codes that both resolve to one recipe -- عصير ربيع as sk-0075
      //   and product-20, بيبسي as sk-0079 and product-15, and five more. Same
      //   recipe, same price, same cost ratio, split across two rows.
      //
      //   The totals were never wrong, because they sum lines rather than rows.
      //   The TABLE was wrong: it showed a duplicate product, which reads as
      //   either a data error or a second product, and it split that product's
      //   quantity so no single row could be trusted.
      //
      //   Fall back to the POS code only when no recipe resolved, so an
      //   unpriced line is still counted somewhere rather than vanishing.
      const byItem = new Map();
      // ⭐ volume vs margin. A beverage at 71.50% food cost is not a pricing
      //   failure -- it is a deliberate traffic driver that brings people in.
      //   The operator confirmed this on 2026-10-07, and the measured numbers
      //   back it up: beverages are 21.6% of the units sold but only 5.1% of
      //   revenue, at 46.06% food cost, while the food itself runs 26.54% on
      //   94.9% of revenue.
      //
      //   So the report must not average the two together and must not flag a
      //   drink as needing repricing. The default comes from the recipe's own
      //   `category` field, which is real data rather than a guess from the
      //   name; an operator override wins over it, stored per recipe.
      const ROLE_KEY = 'rcerp_food_cost_roles';
      const roleOverride = getKV(ROLE_KEY);
      const roleByRecipe = (roleOverride && typeof roleOverride === 'object' && !Array.isArray(roleOverride)) ? roleOverride : {};
      const recipeById = new Map(recipes.map((r) => [r.id, r]));
      const roleOf = (recipeId, posItemId) => {
        const override = roleByRecipe[recipeId];
        if (override === 'volume' || override === 'margin') return override;
        const cat = recipeById.get(recipeId)?.category;
        // ⛔ only `beverage` is treated as volume by default. Anything else --
        //   including an unknown category -- stays a margin item, so a product
        //   with a high food cost is never silently excused.
        return cat === 'beverage' ? 'volume' : 'margin';
      };
    let daysCovered = new Set();
    let unpricedRows = 0;
    let unpricedQty = 0;
    const unpricedNames = new Map();

    const acc = (map, key, name, price) => {
      let e = map.get(key);
      if (!e) { e = { ...blank(), name: name ?? '', price: price ?? 0 }; map.set(key, e); }
      return e;
    };

    for (const l of lines) {
      const day = String(l.businessDate || '').slice(0, 10);
      if (!day) { unpricedRows++; continue; }
      if (from && day < from) continue;
      if (to && day > to) continue;
      if (branchFilter && l.branchRef !== branchFilter) continue;
      daysCovered.add(day);

      const qty = Number(l.quantitySold) || 0;
      const revenue = Number(l.systemRevenue) || 0;   // already qty x recipe price
      const cost = Number(l.systemCost) || 0;        // already qty x recipe cost
      const fxRevenue = Number(l.foodicsRevenue) || 0;
      const fxCost = Number(l.foodicsCost) || 0;
      if (!l.recipeId) {
        unpricedRows++;
        unpricedQty += qty;
        unpricedNames.set(l.nameAr || l.posItemId, (unpricedNames.get(l.nameAr || l.posItemId) || 0) + qty);
      }

      for (const t of [grand, acc(byBranch, l.branchRef), acc(byDay, day)]) {
        t.qty += qty; t.revenue += revenue; t.cost += cost;
        t.foodicsRevenue += fxRevenue; t.foodicsCost += fxCost;
      }
      const e = acc(byItem, l.recipeId || ('code:' + l.posItemId), l.nameAr || l.nameEn || l.posItemId, Number(l.recipePrice) || 0);
      // ⭐ role is a property of the product, not of the POS code, so it is set
      //   once here rather than per line. rec() would otherwise keep whichever
      //   the first line happened to carry.
      e.role = roleOf(l.recipeId, l.posItemId);
      e.recipeId = l.recipeId || '';
      e.category = recipeById.get(l.recipeId)?.category || '';
      e.qty += qty; e.revenue += revenue; e.cost += cost;
      e.foodicsRevenue += fxRevenue; e.foodicsCost += fxCost;
    }

    const pct = (c, r) => (r > 0 ? c / r : 0);
    const round = (v) => Math.round(v * 100) / 100;

    const shape = (t) => ({
      qty: round(t.qty),
      revenue: round(t.revenue),
      cost: round(t.cost),
      grossProfit: round(t.revenue - t.cost),
      foodCostPct: round(pct(t.cost, t.revenue) * 100),
      grossMarginPct: round((1 - pct(t.cost, t.revenue)) * 100),
      foodicsRevenue: round(t.foodicsRevenue),
      foodicsCost: round(t.foodicsCost),
      varianceVsFoodics: round(t.revenue - t.foodicsRevenue),
      variancePct: round((t.foodicsRevenue > 0 ? (t.revenue - t.foodicsRevenue) / t.foodicsRevenue : 0) * 100),
    });

    // Branch rows, worst food-cost rate first: an average hides the branch
    // that is bleeding money.
    const branchRows = [...byBranch].map(([ref, t]) => ({
      ref, name: branchName.get(ref) || '', ...shape(t),
    })).sort((a, b) => b.foodCostPct - a.foodCostPct);

    // What closing the gap to the best branch is worth, in money.
    let savingIfBestRate = 0;
    if (branchRows.length > 1) {
      const bestRate = pct(branchRows[branchRows.length - 1].cost, branchRows[branchRows.length - 1].revenue);
      for (const r of branchRows) {
        const costAtBest = r.revenue * bestRate;
        if (r.cost > costAtBest) savingIfBestRate += r.cost - costAtBest;
      }
    }

    res.json({
      ok: true,
      empty: false,
      generatedAt: new Date().toISOString(),
      window: { from, to, days: daysCovered.size, branch: branchFilter },
      source: {
        sales: 'Foodics (branch, item, quantity, date)',
        price: 'recipe actualMenuPrice',
        cost: 'recipe totalCalculatedCost',
        note: 'The Foodics cost column is reported for comparison only and is never used for cost.',
      },
      totals: shape(grand),
      branchSpread: branchRows.length > 1 ? {
        best: branchRows[branchRows.length - 1].ref,
        worst: branchRows[0].ref,
        bestRate: branchRows[branchRows.length - 1].foodCostPct,
        worstRate: branchRows[0].foodCostPct,
        points: round(branchRows[0].foodCostPct - branchRows[branchRows.length - 1].foodCostPct),
        savingIfBestRate: round(savingIfBestRate),
      } : null,
      byBranch: branchRows,
      byDay: [...byDay].map(([day, t]) => ({ day, ...shape(t) })).sort((a, b) => a.day.localeCompare(b.day)),
      byItem: [...byItem].map(([code, t]) => ({ code, ...t, ...shape(t) }))
        .sort((a, b) => b.revenue - a.revenue),

        // ⭐⭐ THE SPLIT, and why the blended rate is no longer the headline.
        //
        //   A blended food-cost rate mixes two businesses. Measured on the live
        //   data across 36 days:
        //
        //       volume (beverages)   46.06%   21.6% of units   5.1% of revenue
        //       margin (food)        26.54%   78.4% of units  94.9% of revenue
        //       blended              27.53%
        //
        //   The 1.01-point difference between blended and margin is entirely
        //   the drinks. Blending hides two facts at once: it makes the drink
        //   rates look like failures, and it makes the food margin look worse
        //   than it is.
        //
        //   So the screen shows the margin rate as the headline -- that is the
        //   number a pricing decision should act on -- and the volume rate as
        //   information about a deliberate trade. `explain` carries the measured
        //   shares so the screen can say why the two differ instead of just
        //   asserting it.
        split: (() => {
          const mk = (role) => {
            const g = [...byItem.values()].filter((t) => t.role === role);
            const acc2 = blank();
            for (const t of g) {
              acc2.qty += t.qty; acc2.revenue += t.revenue; acc2.cost += t.cost;
              acc2.foodicsRevenue += t.foodicsRevenue; acc2.foodicsCost += t.foodicsCost;
            }
            return { products: g.length, ...shape(acc2) };
          };
          const margin = mk('margin');
          const volume = mk('volume');
          return {
            margin, volume,
            explain: {
              volumeQtySharePct: round(grand.qty > 0 ? volume.qty / grand.qty * 100 : 0),
              volumeRevenueSharePct: round(grand.revenue > 0 ? volume.revenue / grand.revenue * 100 : 0),
              marginRevenueSharePct: round(grand.revenue > 0 ? margin.revenue / grand.revenue * 100 : 0),
              blendedFoodCostPct: shape(grand).foodCostPct,
              marginRateGapPts: round(shape(grand).foodCostPct - margin.foodCostPct),
              note: 'Volume items are deliberate traffic drivers, not pricing failures. '
                + 'Their food cost is a cost of winning the customer; the margin rate is the number to act on.',
            },
          };
        })(),
      unpriced: {
        rows: unpricedRows, quantity: round(unpricedQty),
        names: [...unpricedNames].map(([name, qty]) => ({ name, quantity: round(qty) })),
      },
    });
  });

  // ---- food-cost role override ----
  // ⭐ The default role comes from the recipe's own `category`, so no seeding is
  //   needed and it follows the data. This endpoint exists for the cases the
  //   category cannot express: a drink that really is a margin item, or a food
  //   item deliberately sold as a loss leader to pull customers in.
  //
  // ⛔ It writes ONE key, not the whole collection, and it validates the recipe
  //   id against the live recipes. A typo would otherwise create a role for a
  //   product that does not exist, which reads as a silent no-op forever.
  app.post('/api/report/food-cost/role', (req, res) => {
    const user = sessionUser(readToken(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصرح' });
    if (user.role !== 'admin' && user.role !== 'executive' && user.role !== 'cost_controller') {
      return res.status(403).json({ ok: false, error: 'غير مسموح' });
    }
    const recipeId = typeof req.body?.recipeId === 'string' ? req.body.recipeId : '';
    const role = req.body?.role;
    if (!recipeId) return res.status(400).json({ ok: false, error: 'recipeId مطلوب' });
    if (role !== 'volume' && role !== 'margin' && role !== null) {
      return res.status(400).json({ ok: false, error: 'role يجب أن يكون volume أو margin أو null' });
    }
    const recipes = Array.isArray(getKV('rcerp_recipes')) ? getKV('rcerp_recipes') : [];
    if (!recipes.some((r) => r && r.id === recipeId)) {
      return res.status(400).json({ ok: false, error: 'الوصف غير موجود: ' + recipeId });
    }
    // ⭐ read, mutate, write -- and audit who decided, so a later reader can
    //   tell a deliberate choice from the category default.
    const prev = getKV(ROLE_KEY);
    const map = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? { ...prev } : {};
    if (role === null) delete map[recipeId];
    else map[recipeId] = role;
    try {
      setKV(ROLE_KEY, map);
      try { store.writeAudit(user, 'update', ROLE_KEY, { recipeId, role }); } catch { /* audit is best effort */ }
    } catch {
      return res.status(500).json({ ok: false, error: 'فشل الحفظ' });
    }
    res.json({ ok: true, recipeId, role, overrides: Object.keys(map).length });
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
      appendSavelog(
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

      appendSavelog(
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

      appendSavelog(
        `${new Date().toISOString()} | BOOTSTRAP-FULL by ${user.name}\n`
      );

      res.json({ ok: true, data, count: Object.keys(data).length });
    } catch (e) {
      res.status(500).json({ ok: false, error: `فشل جلب البيانات: ${e.message}` });
    }
  });
};
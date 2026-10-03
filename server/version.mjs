// Build identity, shared by /health, /ready and /api/bootstrap so every
// authenticated response carries the deployed client fingerprint. The client
// uses "build" to detect stale UI (version handshake / refresh banner).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PKG_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
})();

// بصمة البناء تُحسب عند كل استدعاء، لا مرة واحدة عند الإقلاع.
//
// كانت ثابتة (IIFE وقت الاستيراد): أي `npm run build` دون إعادة تشغيل السيرفر
// كان يُبقي /health يبلّغ عن البصمة القديمة، فيطابقها المتصفح مع ما خزّنه في
// localStorage ويختفي شريط «تم نشر تحديث» نهائياً — فيبقى المستخدم على واجهة
// قديمة بلا أي تنبيه، لأن الـAPI ما زال يعمل فلا يRlاحظ شيئاً.
// مخبأ بـ mtime: قراءة الستات reread مرة واحدة فقط عند تغيّر البناء.
let fpCache = { mtimeMs: -1, value: 'no-dist' };

export const getBuildFingerprint = () => {
  try {
    const file = path.join(__dirname, '..', 'dist', 'index.html');
    const { mtimeMs } = fs.statSync(file);
    if (mtimeMs !== fpCache.mtimeMs) {
      const html = fs.readFileSync(file, 'utf8');
      fpCache = { mtimeMs, value: crypto.createHash('sha256').update(html).digest('hex').slice(0, 10) };
    }
    return fpCache.value;
  } catch {
    return 'no-dist';
  }
};

// البصمة المخبوزة في الحزمة، كما كتبها بناء Vite إلى dist/build-stamp.txt.
// يقارنها العميل ببصمته المخبوزة (‎__BUILD_STAMP__‎) ليعرف أهو يعمل على بناء
// أقدم من المنشور. لا تعتمد على localStorage لأن قيمتها السابقة كتبها عميل
// لا يعرف ببصمته.
let stampCache = { mtimeMs: -1, value: '' };

export const getClientStamp = () => {
  try {
    const file = path.join(__dirname, '..', 'dist', 'build-stamp.txt');
    const { mtimeMs } = fs.statSync(file);
    if (mtimeMs !== stampCache.mtimeMs) {
      stampCache = { mtimeMs, value: fs.readFileSync(file, 'utf8').trim() };
    }
    return stampCache.value;
  } catch {
    return '';
  }
};

// kept for compatibility: the fingerprint *at boot time*.
export const buildFingerprint = getBuildFingerprint();

// بصمة السيرفر: تُحسب من كل ملفات الكود (الجذر + المسارات + الاختبارات) وقت
// الإقلاع. كان يقرأ جذر server/ وحده فلا يشمل server/routes/ — فأي تعديل في
// مسار (data.mjs مثلاً) كان يترك البصمة ثابتة ويوحيComprehensive بأنه لم يُحمّل
// كود جديد. أي مراقبة نشر تعتمد على /health كانت تفشل بصمت.
export const serverStamp = (() => {
  try {
    const h = crypto.createHash('sha256');
    const walk = (dir, depth) => {
      if (depth > 3) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name === 'node_modules' || e.name === 'data' || e.name === 'logs'
          || e.name === 'backups' || e.name === 'backup-archive' || e.name === 'lib') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (/\.(mjs|js|json)$/.test(e.name)) h.update(e.name + ':' + fs.statSync(full).mtimeMs);
      }
    };
    walk(__dirname, 0);
    return h.digest('hex').slice(0, 10);
  } catch { return '?'; }
})();
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

export const buildFingerprint = (() => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
    return crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);
  } catch { return 'no-dist'; }
})();

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
// Report rendering endpoint — محرك jsreport (lazy singleton، يعمل في-العملية).
// يدعم وضعين:
//   1) { title, header, rows } — جدول RTL تلقائي (مثل كل شاشات المنظومة).
//   2) { html, data, engine } — قالب HTML مخصص (handlebars) + بيانات.
// إذا لم تُثبَّت الحزمة يرجع 501 برسالة عربية، ولا يكسر الخادم أبداً.
import { existsSync } from 'node:fs';
import { readToken, sessionUser } from '../core.mjs';
import DOMPurify from 'dompurify';

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CHROME_CANDIDATES = [
  process.env.JSR_CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const findExecutable = (candidates) => {
  for (const p of candidates) {
    try { if (existsSync(p)) return p; } catch { /* تجاهل */ }
  }
  return null;
};

const buildHtml = ({ title = 'تقرير', header = [], rows = [], generatedAt } = {}) => `
<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 10px; color: #64748b; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #0f172a; color: #fff; padding: 6px 8px; text-align: right; }
  td { border: 1px solid #e2e8f0; padding: 5px 8px; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr:last-child td { background: #eef2ff; font-weight: bold; }
  .num { text-align: left; direction: ltr; }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">أنشئ بواسطة RestoCost ERP · ${escapeHtml(generatedAt)}</div>
  <table>
    <thead><tr>${header.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((r) => `<tr>${r.map((c) => `<td>${typeof c === 'number' ? `<span class="num">${c}</span>` : escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
</body></html>`;

let instancePromise = null;

const getInstance = () => {
  if (!instancePromise) {
    instancePromise = (async () => {
      const mod = await import('jsreport');
      const jsreport = mod.default || mod;
      const exe = findExecutable(CHROME_CANDIDATES);
      const cfg = { templatingEngines: { strategy: 'in-process' } };
      if (exe) {
        cfg.extensions = {
          'chrome-pdf': { launchOptions: { executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] } },
        };
      }
      const inst = jsreport(cfg);
      await inst.init();
      return inst;
    })().catch((e) => {
      instancePromise = null;
      throw e;
    });
  }
  return instancePromise;
};

const toBuffer = async (content) => {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === 'string') return Buffer.from(content);
  if (content && typeof content.on === 'function') {
    const chunks = [];
    for await (const c of content) chunks.push(c);
    return Buffer.concat(chunks);
  }
  throw new Error('مخرج غير معروف من jsreport');
};

export const registerReports = (app, { sessionUser: sessionUserFn = sessionUser, readToken: readTokenFn = readToken } = {}) => {
  app.post('/api/report', async (req, res) => {
    const user = sessionUserFn(readTokenFn(req));
    if (!user) return res.status(401).json({ ok: false, error: 'غير مصادق' });

    const { title, header, rows, html, data, engine = 'handlebars' } = req.body || {};
    const custom = typeof html === 'string' && html.trim().length > 0;
    if (custom) {
      if (data !== null && typeof data !== 'object') {
        return res.status(400).json({ ok: false, error: 'البيانات (data) يجب أن تكون كائناً' });
      }
    } else if (!Array.isArray(header) || !Array.isArray(rows)) {
      return res.status(400).json({ ok: false, error: 'بيانات تقرير غير صالحة — المطلوب header و rows أو html' });
    }
    if (!custom && rows.length > 8000) {
      return res.status(400).json({ ok: false, error: 'حجم التقرير كبير جداً (الحد الأقصى 8000 صف)' });
    }
    if (typeof engine !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(engine)) {
      return res.status(400).json({ ok: false, error: 'محرك قالب غير صالح' });
    }

    let instance;
    try {
      instance = await getInstance();
      const content = custom
        ? DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b','i','u','strong','em','p','br','table','thead','tbody','tr','td','th','span','div','h1','h2','h3','h4','ul','ol','li'], ALLOWED_ATTR: ['style','class','colspan','rowspan'] })
        : buildHtml({
            title: String(title ?? 'تقرير'),
            header: header.map(String),
            rows,
            generatedAt: new Date().toLocaleString('ar-SA-u-nu-latn'),
          });
      const rep = await instance.render({
        template: { content, engine, recipe: 'chrome-pdf', chrome: { scale: 1 } },
        data: data ?? {},
      });
      const buf = await toBuffer(rep.content);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report-${Date.now()}.pdf"`);
      res.setHeader('X-Robots-Tag', 'noindex');
      res.end(buf);
    } catch (e) {
      const msg = (e && (e.message || String(e))) || 'فشل توليد PDF';
      if (instance) {
        instancePromise = null;
        try { await instance.close(); } catch { /* تجاهل */ }
      }
      const chromiumHint = /chrom|puppeteer|browser|socket|spawn|executablePath|timeout/i.test(msg)
        ? ' — يبدو أن Chromium غير متاح لمعالجة PDF على الخادم (أو أنه بطيء). ثبّت Chrome أو اضبط JSR_CHROME_PATH في متغيرات البيئة'
        : '';
      res.status(500).json({ ok: false, error: msg.slice(0, 300) + chromiumHint });
    }
  });
};
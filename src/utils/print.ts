export interface PrintChart {
  title?: string;
  src: string;
}

export interface PrintBar {
  label: string;
  value: number;
  display: string;
}

export interface PrintBars {
  title?: string;
  max: number;
  items: PrintBar[];
}

export interface PrintTable {
  title?: string;
  header: string[];
  rows: (string | number)[][];
  // جدول مضغوط: خط أصغر ورؤوس أعمدة تلتف على سطرين — للتقارير ذات الأعمدة الكثيرة
  dense?: boolean;
  // أعمادة محددة بالنسب المئوية (مجموعها ≈ 100) — تمنع توزيع الأعمادة غير المتناسق وقسمة الكلمات
  colWidths?: string[];
}

export interface PrintCard {
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  tables?: PrintTable[];
  totals?: [string, string][];
}

export interface PrintDoc {
  title: string;
  subtitle?: string;
  meta?: [string, string][];
  tables?: PrintTable[];
  charts?: PrintChart[];
  bars?: PrintBars[];
  totals?: [string, string][];
  // بطاقات مستقلة (كل بطاقة وصفة/مستند صغير) تُطبع واحدة تلو الأخرى مع فاصل صفحات
  cards?: PrintCard[];
  qr?: string;
  footer?: string;
  watermark?: string;
  logo?: string;
  // اتجاه الصفحة — يُحدد تلقائياً أفقياً للجداول العريضة (9 أعمدة فأكثر)
  orientation?: 'portrait' | 'landscape';
  // وضع الورقة الواحدة: هوامش وخطوط مضغوطة لملاءمة التقرير في صفحة A4 واحدة
  compact?: boolean;
  // وضع الطباعة المباشرة للبطاقات: إخفاء رأس التقرير ومربعات الملخص — كأنه أمر طباعة لكل بطاقة منفردة
  bare?: boolean;
}

const esc = (v: string | number) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// توحيد عرض الكسور في الطباعة: الأعداد الصحيحة كما هي، وأي قيمة عشرية تُقرَّب لرقمين دائماً
const num = (v: string | number): string =>
  typeof v === 'number' && Number.isFinite(v)
    ? Number.isInteger(v) ? String(v) : v.toFixed(2)
    : String(v);

const cell = (v: string | number) => esc(num(v));

// شريط الهوية (الشعار + اسم النظام + تاريخ الإصدار) — يُستخدم أعلى التقرير وداخل كل بطاقة مستقلة
const brandHtml = (logo: string, today: string): string => {
  const logoHtml = logo
    ? `<img class="logo" src="${esc(logo)}" alt="شعار" />`
    : '<div class="logo">RC</div>';
  return `
    <div class="brand">
      ${logoHtml}
      <div>
        <h1>نظام إدارة المطاعم RestoCost</h1>
        <div class="sub">إدارة التكاليف · المخزون · المبيعات · الأرباح</div>
      </div>
      <div class="doc-no">تاريخ الإصدار<br /><strong>${today}</strong></div>
    </div>
    <div class="accent-bar"></div>`;
};

const tableHtml = (t: PrintTable): string => {
  const colGroup = t.colWidths?.length
    ? `<colgroup>${t.colWidths.slice(0, t.header.length).map((w) => {
        const num = parseFloat(w);
        const pct = Number.isFinite(num) ? Math.max(1, Math.min(60, num)) : null;
        return `<col style="width:${pct === null ? 'auto' : pct + '%'}" />`;
      }).join('')}</colgroup>`
    : '';
  return `
    <div class="block">
      ${t.title ? `<h3 class="block-title"><span class="bt-accent"></span>${esc(t.title)}</h3>` : ''}
      <table class="${[t.dense ? 'dense' : '', t.colWidths?.length ? 'fixed' : ''].filter(Boolean).join(' ')}">
        ${colGroup}
        <thead><tr>${t.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
};

const chartsHtml = (charts: PrintChart[] | undefined): string =>
  charts?.length
    ? `<div class="charts">${charts.map((c) => `
      <div class="chart-card">
        ${c.title ? `<h3 class="block-title"><span class="bt-accent"></span>${esc(c.title)}</h3>` : ''}
        <img class="chart-img" src="${c.src}" alt="رسم بياني" />
      </div>`).join('')}</div>`
    : '';

const barsHtml = (bars: PrintBars[] | undefined): string =>
  bars?.length
    ? bars.map((b) => `
      <div class="block">
        ${b.title ? `<h3 class="block-title"><span class="bt-accent"></span>${esc(b.title)}</h3>` : ''}
        <div class="bar-list">
          ${b.items.map((it) => {
            const pct = b.max > 0 ? Math.max(0, Math.round((it.value / b.max) * 100)) : 0;
            return `
          <div class="bar-row">
            <span class="bar-label">${esc(it.label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            <span class="bar-val">${cell(it.display)}</span>
          </div>`;
          }).join('')}
        </div>
      </div>`).join('')
    : '';

// تحويل كل رسوم recharts الظاهرة على الشاشة إلى صور PNG عالية الدقة لتضمينها في الطباعة
// تُرسم كل الصور على إطار قياسي موحد (نسبة ثابتة) حتى تتساوى الرسوم في كل التقارير
const CHART_STD_W = 1500;
const CHART_STD_H = 620;

const svgToPng = (svg: SVGSVGElement): Promise<string> =>
  new Promise((resolve) => {
    try {
      const own = svg.getBoundingClientRect();
      const wrapperEl = svg.closest('.recharts-wrapper') as HTMLElement | null;
      const fr = (wrapperEl ?? (svg.parentElement as HTMLElement | null) ?? svg).getBoundingClientRect();
      const src = own.width >= 40 && own.height >= 40 ? own : fr;
      if (src.width < 40 || src.height < 40) return resolve('');
      const w = Math.max(360, Math.ceil(src.width || 800));
      let h = Math.max(220, Math.ceil(src.height || 400));
      const clone = svg.cloneNode(true) as SVGSVGElement;
      let pendingLegend: SVGGElement | null = null;
      // ===== إمالة قيم المحور الأفقي المزدحمة لمنع تداخلها + تصغير خطها =====
      const xTicks = Array.from(clone.querySelectorAll<SVGTextElement>('.recharts-xAxis .tick text'));
      let extraBottom = 0;
      if (xTicks.length > 4) {
        xTicks.forEach((t) => {
          const x = t.getAttribute('x') || '0';
          const y = t.getAttribute('y') || '0';
          t.setAttribute('transform', `rotate(-32 ${x} ${y})`);
          t.setAttribute('text-anchor', 'end');
          t.setAttribute('font-size', '10');
        });
        extraBottom += Math.round(h * 0.22);
      }
      // ===== دليل منظم أسفل الرسم: شبكة صفوف ثابتة لا تتداخل مهما طالت الأسماء =====
      try {
        const legWrap = wrapperEl?.querySelector('.recharts-legend-wrapper');
        const items = legWrap
          ? Array.from(legWrap.querySelectorAll('.recharts-legend-item')).map((li) => ({
              name: (li.textContent || '').trim(),
              color: li.querySelector('svg path, svg rect, svg circle, svg')?.getAttribute('fill')
                || li.querySelector('svg path, svg rect, svg circle, svg')?.getAttribute('stroke') || '#94a3b8',
            })).filter((it) => it.name).slice(0, 12)
          : [];
        if (items.length) {
          const NS = 'http://www.w3.org/2000/svg';
          const cols = Math.max(1, Math.floor(w / 150));
          const rows = Math.ceil(items.length / cols);
          const rowH = 18;
          extraBottom += rows * rowH + 8;
          const colW = w / cols;
          const g = document.createElementNS(NS, 'g');
          items.forEach((it, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = 10 + col * colW;
            const y = h + 6 + row * rowH + 11;
            const r = document.createElementNS(NS, 'rect');
            r.setAttribute('x', String(x));
            r.setAttribute('y', String(y - 9));
            r.setAttribute('width', '10');
            r.setAttribute('height', '10');
            r.setAttribute('rx', '2');
            r.setAttribute('fill', it.color);
            g.appendChild(r);
            let nm = it.name;
            const maxChars = Math.max(6, Math.floor((colW - 30) / 6));
            if (nm.length > maxChars) nm = nm.slice(0, maxChars - 1) + '…';
            const t = document.createElementNS(NS, 'text');
            t.setAttribute('x', String(x + 15));
            t.setAttribute('y', String(y));
            t.setAttribute('font-size', '11');
            t.setAttribute('font-weight', '600');
            t.setAttribute('direction', 'rtl');
            t.setAttribute('fill', '#334155');
            t.textContent = nm;
            g.appendChild(t);
          });
          pendingLegend = g;
        }
      } catch { /* لا يوجد دليل — نتجاهل */ }
      const finalH = h + extraBottom;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      clone.setAttribute('width', String(w));
      clone.setAttribute('height', String(finalH));
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('width', String(w));
      bgRect.setAttribute('height', String(finalH));
      bgRect.setAttribute('fill', '#ffffff');
      clone.insertBefore(bgRect, clone.firstChild);
      if (pendingLegend) clone.appendChild(pendingLegend);
      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const done = (out: string) => { try { URL.revokeObjectURL(url); } catch { /* noop */ } resolve(out); };
      const img = new Image();
      img.onload = () => {
        try {
          // سقف التكبير البصري 1.6x حتى لا تتضخم عناصر الرسم (النصوص والمربعات)
          const scale = 2;
          const fitFrame = Math.min(CHART_STD_W / img.naturalWidth, CHART_STD_H / img.naturalHeight);
          const zoom = Math.min(fitFrame, 1.6);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.naturalWidth * zoom * scale);
          canvas.height = Math.round(img.naturalHeight * zoom * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) return done('');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          done(canvas.toDataURL('image/png'));
        } catch { done(''); }
      };
      img.onerror = () => done('');
      img.src = url;
    } catch { resolve(''); }
  });

export const captureCharts = async (rootSelector?: string): Promise<PrintChart[]> => {
  if (typeof document === 'undefined') return [];
  // مهلة قصيرة حتى تنتهي حركات الرسوم قبل الالتقاط
  await new Promise((r) => setTimeout(r, 180));
  // الالتقاط من الغلاف الرئيسي فقط: أيقونات الدليل هي svgs مستقلة صغيرة
  // كان التقاطها سابقاً ينتج مربعات عملاقة في الطباعة
  const scope: ParentNode = rootSelector ? document.querySelector(rootSelector) ?? document : document;
  const wrappers = Array.from(scope.querySelectorAll<HTMLElement>('.recharts-wrapper'));
  const mains = wrappers
    .map((wr) => wr.querySelector(':scope > svg'))
    .filter((s): s is SVGSVGElement => !!s);
  if (!mains.length) return [];
  const out: PrintChart[] = [];
  for (const svg of mains) {
    const src = await svgToPng(svg);
    if (!src) continue;
    let el: HTMLElement | null = svg.parentElement;
    let title: string | undefined;
    for (let i = 0; i < 6 && el && !title; i++) {
      const h = el.querySelector('h3, h4');
      if (h?.textContent?.trim()) title = h.textContent.trim();
      el = el.parentElement;
    }
    out.push({ title, src });
  }
  return out;
};

const metaHtmlOf = (meta: [string, string][] | undefined): string =>
  meta?.length
    ? `<div class="meta">${meta.slice(0, 10).map(([k, v]) => `<div class="meta-item"><span class="meta-k">${esc(k)}</span><span class="meta-v">${cell(v)}</span></div>`).join('')}</div>`
    : '';

const totalsHtmlOf = (totals: [string, string][] | undefined): string =>
  totals?.length
    ? `<div class="totals-band">${totals.map(([k, v]) => `<div class="total-item"><span>${esc(k)}</span><strong>${cell(v)}</strong></div>`).join('')}</div>`
    : '';

const tablesHtmlOf = (tables: PrintTable[] | undefined): string =>
  tables?.map(tableHtml).join('') || '';

// بطاقة مستقلة كاملة (عنوان + مؤشرات + جداول + إجماليات) — تُطبع على صفحة/كتلة منفصلة
const cardsHtml = (cards: PrintCard[] | undefined, logo: string, today: string): string =>
  cards?.length
    ? cards.map((c, i) => `
      <section class="print-card" ${i > 0 ? 'style="break-before: page; page-break-before: always;"' : ''}>
        <div class="card-brand">${brandHtml(logo, today)}</div>
        <div class="card-head">
          <h3>${esc(c.title)}</h3>
          ${c.subtitle ? `<span class="card-stamp">${esc(c.subtitle)}</span>` : ''}
        </div>
        ${metaHtmlOf(c.meta)}
        ${tablesHtmlOf(c.tables)}
        ${totalsHtmlOf(c.totals)}
      </section>`).join('')
    : '';

export const openPrintWindow = (doc: PrintDoc): void => {
  void (async () => {
  const activeCharts: PrintChart[] = doc.charts ?? await captureCharts();
  // System logo configured via Settings → stored on the server and mirrored to
  // localStorage so the standalone print window can reach it without React context.
  const logo = doc.logo || localStorage.getItem('rcerp_logo') || '';
  const today = new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  // بطاقات مستقلة (bare) تظهر الماركة داخل كل بطاقة — لذا نتجنب تكرارها في رأس الوثيقة
  const cardMode = !!doc.cards?.length && !!doc.bare;
  const topBrand = cardMode ? '' : brandHtml(logo, today);
  const metaHtml = metaHtmlOf(doc.meta);
  const totalsHtml = totalsHtmlOf(doc.totals);
  const tablesHtml = tablesHtmlOf(doc.tables);
  const cardsBlock = cardsHtml(doc.cards, logo, today);
  const qrBlock = doc.qr ? `<div class="qr-band"><img class="qr-img" src="${doc.qr}" alt="ZATCA QR" /><div class="qr-hint">رمز التحقق الضريبي</div></div>` : '';
  const chartsBlock = chartsHtml(activeCharts);
  const barsBlock = barsHtml(doc.bars);
  // اتجاه تلقائي: الجداول العريضة (9+ أعمدة) تُطبع أفقياً حتى لا تُقصّ الأعمدة
  const isLandscape = doc.orientation
    ? doc.orientation === 'landscape'
    : (doc.tables || []).some((t) => t.header.length >= 9);
  const pageRule = `@page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: ${isLandscape ? '10mm 9mm' : '11mm 10mm'}; }`;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>${esc(doc.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
<style>
  ${pageRule}
  ${doc.title.includes('ربحية الأطباق') || doc.compact ? `
  /* ===== وضع الصفحة الواحدة: تقرير ربحية الأطباق / التقارير المضغوطة ===== */
  .sheet { padding: 3.5mm 6mm 5mm !important; }
  .brand { padding: 3mm 5mm !important; }
  .brand .logo { width: 15mm !important; height: 15mm !important; }
  .accent-bar { margin-bottom: 2.5mm !important; }
  .doc-head { margin-bottom: 2.5mm !important; padding: 2.2mm 4mm !important; }
  .meta { gap: 1.8mm !important; margin-bottom: 2.5mm !important; }
  .meta-item { padding: 1.6mm 2mm !important; }
  .block-title { margin: 1.6mm 0 1mm !important; font-size: 9pt !important; }
  .block { margin-bottom: 2.5mm !important; }
  .chart-card { padding: 1.5mm !important; margin-bottom: 0 !important; }
  .chart-img { max-height: 40mm !important; width: auto !important; max-width: 100% !important; display: block; margin-inline: auto; }
  table { font-size: 7.8pt !important; }
  th, td { padding: 0.8mm 1.4mm !important; }
  .totals-band { margin-top: 2mm !important; padding: 1.8mm !important; gap: 1.8mm !important; }
  .total-item { padding: 0.8mm 2mm !important; }
  .total-item strong { font-size: 7.5pt !important; }
  .signatures { display: none !important; }
  .foot { margin-top: 1.5mm !important; padding-top: 1.5mm !important; }
  ` : ''}
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif; color: #182235; margin: 0; background: #f5f7fb; }
  .sheet { max-width: ${isLandscape ? '297mm' : '210mm'}; margin: 0 auto; padding: 7mm 8mm 9mm; position: relative; background: #fff; box-shadow: 0 1px 14px rgba(23,32,51,.10); }

  /* ===== الترويسة (هوية النظام: ذهبي فاتح بلا ألوان غامقة) ===== */
  .brand { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4mm; background: linear-gradient(120deg,#fff7df,#fdf3d1 55%,#ffe9a3); border: 1px solid #e9d493; border-radius: 14px 14px 0 0; padding: 5mm 6mm; }
  .brand .logo { width: 21mm; height: 21mm; border-radius: 12px; background: linear-gradient(135deg,#d7a928,#a97912); color: #fff; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 17pt; object-fit: contain; padding: 2px; box-shadow: 0 2px 8px rgba(215,169,40,.45); }
  .brand h1 { font-size: 14pt; margin: 0; color: #172033; letter-spacing: -.2px; }
  .brand .sub { font-size: 7.5pt; color: #a97912; font-weight: 700; margin-top: 1.5px; }
  .brand .doc-no { font-size: 7pt; color: #172033; font-weight: 800; text-align: left; line-height: 1.7; }
  .accent-bar { height: 2.2mm; border-radius: 0 0 14px 14px; background: linear-gradient(90deg,#a97912,#d7a928,#a97912); margin-bottom: 5mm; }

  /* ===== عنوان المستند ===== */
  .doc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4mm; background: linear-gradient(90deg,#fff7df,#fdf3d1); border: 1px solid #e9d493; border-radius: 10px; padding: 3.2mm 5mm; }
  .doc-head h2 { font-size: 12.5pt; margin: 0; color: #172033; }
  .doc-head .stamp { font-size: 8pt; font-weight: 800; color: #a97912; background: #ffffff; border: 1px solid #d7a928; border-radius: 999px; padding: 2px 12px; }
  .doc-head .date-chip { font-size: 7.5pt; color: #172033; font-weight: 700; direction: ltr; opacity: .75; }

  /* ===== مؤشرات رئيسية ===== */
  .meta { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.6mm; margin-bottom: 5mm; }
  .meta-item { background: linear-gradient(180deg,#ffffff,#f8fafc); border: 1px solid #e2e8f0; border-radius: 9px; padding: 2.4mm 2.8mm; box-shadow: inset 0 -2px 0 #fff7df; }
  .meta-k { display: block; font-size: 6.6pt; color: #a97912; font-weight: 800; margin-bottom: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta-v { font-size: 8.6pt; font-weight: 900; color: #172033; direction: ltr; text-align: right; }

  /* ===== الجداول ===== */
  .block { margin-bottom: 5mm; }
  .block-title { font-size: 9pt; color: #172033; font-weight: 900; margin: 0 0 2mm; display: flex; align-items: center; gap: 2mm; }
  .bt-accent { width: 3.2mm; height: 3.2mm; border-radius: 3px; background: linear-gradient(135deg,#a97912,#d7a928); display: inline-block; }
  table { width: 100%; border-collapse: collapse; font-size: 7.6pt; table-layout: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: #fdf3d1; color: #172033; font-weight: 800; padding: 2.1mm 2.2mm; border: 1px solid #e9d493; text-align: right; line-height: 1.3; vertical-align: middle; overflow-wrap: break-word; }
  td { padding: 1.9mm 2.2mm; border: 1px solid #e2e8f0; color: #334155; overflow-wrap: break-word; }
  tbody tr:nth-child(even) td { background: #fffBEC; }
  tbody tr:hover td { background: #fff7df; }
  /* جدول بأعمادة محددة النسب: توزيع متناسق ومنع قسمة الكلمات في منتصفها */
  table.fixed { table-layout: fixed; }
  table.fixed th { overflow-wrap: break-word; }
  table.fixed td { overflow-wrap: break-word; }
  table.fixed th, table.fixed td { white-space: normal; }
  /* الجدول المضغوط للتقارير ذات الأعمدة الكثيرة */
  table.dense { font-size: 6.8pt; table-layout: auto; }
  table.dense th { white-space: normal; padding: 1.6mm 1.4mm; line-height: 1.25; vertical-align: middle; }
  table.dense td { padding: 1.3mm 1.4mm; }

  /* ===== بطاقات مستقلة (طباعة بطاقة بكل وصفة) ===== */
  .print-card { border: 1.5px solid #d7a928; border-radius: 14px; padding: 5mm; margin-bottom: 5mm; background: #fff; break-inside: avoid; page-break-inside: avoid; box-shadow: 0 1px 6px rgba(23,32,51,.10); }
  .print-card:last-of-type { margin-bottom: 0; }
  /* الماركة داخل كل بطاقة (مصغرة لتناسب ورقة البطاقة) */
  .card-brand .brand { border-radius: 10px; padding: 2.6mm 4mm; gap: 3mm; margin-bottom: 3mm; }
  .card-brand .brand .logo { width: 12mm; height: 12mm; font-size: 11pt; }
  .card-brand .brand h1 { font-size: 10.5pt; }
  .card-brand .brand .sub { font-size: 6pt; }
  .card-brand .brand .doc-no { font-size: 6pt; }
  .card-brand .accent-bar { height: 1.6mm; margin-bottom: 3mm; border-radius: 0 0 8px 8px; }
  .card-head { display: flex; justify-content: space-between; align-items: center; gap: 4mm; padding: 2.6mm 4mm; margin-bottom: 3.5mm; background: linear-gradient(120deg,#fff7df,#fdf3d1,#f1dd9b); border: 1px solid #e9d493; border-radius: 10px; }
  .card-head h3 { font-size: 10.5pt; color: #172033; font-weight: 900; margin: 0; }
  .card-head .card-stamp { font-size: 7pt; font-weight: 800; color: #a97912; background: #ffffff; border: 1px solid #d7a928; border-radius: 999px; padding: 1.5px 10px; white-space: nowrap; }
  .print-card .meta { grid-template-columns: repeat(4, 1fr); }

  /* ===== الرسوم البيانية ===== */
  .charts { display: flex; flex-direction: column; gap: 5mm; margin-bottom: 6mm; }
  .chart-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 4mm 4mm 2mm; background: #fff; break-inside: avoid; page-break-inside: avoid; box-shadow: 0 1px 4px rgba(15,23,42,.07); }
  .chart-title { font-size: 11pt; font-weight: 800; color: #0f172a; margin: 0 0 3mm; padding-right: 8px; border-right: 3px solid #f59e0b; }
  /* ارتفاع موحد لكل الرسوم مع حفظ النسبة — الرسوم العريضة تملأ الصفحة والقصيرة تتمركز */
  .chart-img { max-width: 100%; height: 66mm; object-fit: contain; display: block; margin: 0 auto; background: #fff; border-radius: 8px; }

  /* ===== الأشرطة الأفقية (مخطط بسيط أسفل الجداول) ===== */
  .bar-list { display: flex; flex-direction: column; gap: 1.8mm; }
  .bar-row { display: grid; grid-template-columns: 30mm 1fr 34mm; align-items: center; gap: 2.5mm; }
  .bar-label { font-size: 7.6pt; font-weight: 800; color: #334155; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-track { height: 3.6mm; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg,#10b981,#34d399); border-radius: 999px; }
  .bar-val { font-size: 7.6pt; font-weight: 800; color: #0f172a; text-align: left; direction: ltr; font-family: 'Consolas', 'Courier New', monospace; white-space: nowrap; }

  /* ===== شريط الإجماليات ===== */
  .totals-band { display: flex; flex-wrap: wrap; gap: 2.5mm; justify-content: flex-start; margin-top: 4mm; background: linear-gradient(120deg,#fffBEC,#fff7df); border: 1px solid #e9d493; border-radius: 10px; padding: 3mm; break-inside: avoid; }
  .total-item { display: flex; align-items: baseline; gap: 2mm; background: #ffffff; border: 1px solid #d7a928; border-radius: 8px; padding: 1.4mm 3mm; }
  .total-item span { color: #a97912; font-weight: 800; font-size: 6.8pt; white-space: nowrap; }
  .total-item strong { font-size: 8.2pt; color: #172033; direction: ltr; unicode-bidi: embed; white-space: nowrap; }

  /* ===== رمز QR ZATCA ===== */
  .qr-band { margin-top: 6mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .qr-img { width: 42mm; height: 42mm; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2mm; background: #fff; }
  .qr-hint { font-size: 7pt; color: #64748b; font-weight: 700; margin-top: 2mm; }

  /* ===== التذييل والتواقيع ===== */
  .signatures { display: flex; justify-content: space-between; margin-top: 9mm; padding: 0 6mm; gap: 20mm; }
  .sig { flex: 1; text-align: center; font-size: 7.5pt; color: #475569; }
  .sig .line { margin-top: 11mm; border-top: 1.5px dotted #94a3b8; padding-top: 2mm; font-weight: 700; }
  .foot { margin-top: 6mm; padding-top: 3mm; border-top: 1.5px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 7.3pt; color: #94a3b8; }
  .foot .dot { color: #d7a928; }

  .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
  .watermark span { transform: rotate(-24deg); font-size: 54pt; font-weight: 900; color: rgba(148,163,184,.10); white-space: nowrap; letter-spacing: 6px; }

  .print-btn { position: fixed; top: 14px; left: 14px; z-index: 99; display: flex; gap: 8px; }
  .print-btn button { background: linear-gradient(135deg,#d7a928,#a97912); color: #172033; border: 0; border-radius: 10px; padding: 10px 22px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 14px rgba(215,169,40,.5); font-family: inherit; }
  .print-btn button.secondary { background: #172033; color: #d7a928; box-shadow: none; }

  @media print {
    .print-btn { display: none; }
    body { background: #fff; }
    .sheet { box-shadow: none; max-width: none; padding: 0; }
  }
</style>
</head>
<body>
  ${doc.watermark ? `<div class="watermark"><span>${esc(doc.watermark)}</span></div>` : ''}
  <div class="print-btn"><button onclick="window.print()">طباعة / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق</button></div>
  <div class="sheet">
    ${topBrand}

    ${doc.cards?.length && doc.bare ? '' : `
    <div class="doc-head">
      <h2>${esc(doc.title)}</h2>
      <span class="date-chip">${today}</span>
      ${doc.subtitle ? `<span class="stamp">${esc(doc.subtitle)}</span>` : ''}
    </div>
    `}

    ${doc.cards?.length && doc.bare ? '' : metaHtml}
    ${tablesHtml}
    ${cardsBlock}
    ${chartsBlock}
    ${barsBlock}
    ${totalsHtml}
    ${qrBlock}

    <div class="signatures">
      <div class="sig">المُعد<span class="line">الاسم والتوقيع</span></div>
      <div class="sig">المُراجع<span class="line">الاسم والتوقيع</span></div>
      <div class="sig">المدير المالي<span class="line">الاسم والتوقيع</span></div>
    </div>

    <div class="foot">
      <span>تاريخ الطباعة: <strong>${new Date().toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>
      <span>${esc(doc.footer || 'المستند مولّد آلياً')} <span class="dot">•</span> RestoCost ERP</span>
    </div>
  </div>
  <script>
    window.addEventListener('load', function () {
      if (window.frameElement) return;
      var fired = false;
      function go() { if (fired) return; fired = true; setTimeout(function () { window.print(); }, 350); }
      try {
        var imgs = Array.prototype.slice.call(document.images);
        var waits = imgs.map(function (im) {
          return (im.complete && im.naturalWidth > 0) ? Promise.resolve() : new Promise(function (r) { im.onload = r; im.onerror = r; });
        });
        Promise.all(waits).then(go, go);
      } catch (e: unknown) { }
      setTimeout(go, 2500);
    });
  </script>
</body>
</html>`;

  // معاينة داخل التطبيق: طبقة فوق النظام بدل نافذة منفصلة
  const hook = (window as unknown as { __rcerpPrintPreview?: (payload: { title: string; html: string }) => void }).__rcerpPrintPreview;
  if (hook) { hook({ title: doc.title, html }); return; }

  const win = window.open('', '_blank', 'width=960,height=720');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  })();
};

// تحميل طبقة المعاينة داخل التطبيق (بدون استيراد دائري)
void import('../components/ui/PrintPreviewHost');

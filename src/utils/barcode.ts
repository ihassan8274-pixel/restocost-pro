// ===== مولّد باركود CODE128 (SVG نصي بلا مكتبات خارجية) — للملصقات والطباعة =====
// مجموعة الأنماط القياسية لـ CODE128 (القيم 0–106).
const CODES: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0–9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10–19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20–29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30–39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40–49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50–59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60–69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70–79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80–89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90–99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100–106
];
const START_B = '211214'; // 104
const STOP = '2331112'; // 106

export interface BarcodeOptions {
  height?: number;
  barWidth?: number;
  quiet?: number;
}

/** إرجاع SVG باركود CODE128-B للنص المعطى */
export const code128Svg = (data: string, opts: BarcodeOptions = {}): string => {
  const plain = data.replace(/[^\x20-\x7E]/g, '').replace(/[|`]/g, '').slice(0, 48);
  if (!plain) return '';
  const height = opts.height ?? 42;
  const barWidth = opts.barWidth ?? 1;
  const quiet = opts.quiet ?? 9;
  let bits = START_B;
  let check = 104;
  for (let i = 0; i < plain.length; i++) {
    const v = plain.charCodeAt(i) - 32;
    if (v < 0 || v > 95) continue;
    bits += CODES[v];
    check = (check + v * (i + 1)) % 103;
  }
  bits += CODES[check];
  bits += STOP;
  let x = quiet;
  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    const w = Number(bits[i]) * barWidth;
    if (i % 2 === 0) rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
    x += w;
  }
  const width = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="barcode ${plain}"><rect width="100%" height="100%" fill="#fff"/><g fill="#0f172a">${rects}</g></svg>`;
};

/** تحويل SVG إلى Data-URI لاستخدامه داخل <img> (تناسب الطباعة والنوافذ المنفصلة) */
export const barcodeDataUri = (data: string, opts?: BarcodeOptions): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code128Svg(data, opts))}`;
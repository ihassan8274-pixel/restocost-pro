import type { RawMaterial } from '../types/inventory';

export const normalizeAr = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06FF\u0660-\u0669]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (s: string): string[] =>
  normalizeAr(s)
    .split(' ')
    .filter((t) => t.length > 0);

const bigrams = (s: string): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
};

const similarity = (a: string, b: string): number => {
  const na = normalizeAr(a);
  const nb = normalizeAr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokenize(na);
  const tb = tokenize(nb);
  if (ta.length && tb.length) {
    const sa = new Set(ta);
    const sb = new Set(tb);
    const common = [...sa].filter((t) => sb.has(t)).length;
    const jaccard = common / Math.max(sa.size, sb.size);
    if (common > 0) {
      const bigram = (() => {
        const ga = bigrams(na.replace(/ /g, ''));
        const gb = bigrams(nb.replace(/ /g, ''));
        const inter = [...ga].filter((g) => gb.has(g)).length;
        const union = new Set([...ga, ...gb]).size;
        return union ? inter / union : 0;
      })();
      return Math.max(jaccard, bigram);
    }
  }
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  return 0;
};

export interface ItemMatchResult {
  itemName: string;
  material: RawMaterial | null;
  score: number;
}

export const bestRawMaterialMatch = (name: string, rawMaterials: RawMaterial[], threshold = 0.55): ItemMatchResult => {
  let best: RawMaterial | null = null;
  let bestScore = 0;
  const hay = normalizeAr(name);
  if (!hay) return { itemName: name, material: null, score: 0 };
  for (const m of rawMaterials) {
    const s = Math.max(
      similarity(hay, m.nameAr),
      m.nameEn ? similarity(hay, m.nameEn) : 0,
    );
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return { itemName: name, material: bestScore >= threshold ? best : null, score: bestScore };
};

export const matchInvoiceItems = (names: string[], rawMaterials: RawMaterial[], threshold = 0.55): ItemMatchResult[] =>
  names.map((n) => bestRawMaterialMatch(n, rawMaterials, threshold));
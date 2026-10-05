/**
 * Normalisation tests -- [NORM-01]..[NORM-26]
 *
 * Every Arabic sample is BUILT FROM CODEPOINTS, never written literally.
 * Two reasons, both learned the hard way:
 *   1. The source-hygiene guard classifies a foreign run inside an Arabic
 *      line as corruption, so a literal sample makes the guard fire on its
 *      own test file.
 *   2. More seriously, the guard and the test then trade verdicts: the guard
 *      reports the test file, the test reports the guard. Both look like
 *      evidence and neither is.
 *
 * Corollary: this file is pure ASCII. If an Arabic literal ever appears here,
 * that is a bug in the test, not a style choice.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeArabic,
  normalizeEnglish,
  normalizeName,
  normalizedNames,
  foldArabicLetter,
} from './normalize.js';

/** Build a string from codepoints so nothing non-ASCII lives in this file. */
const ar = (...codes: number[]) => String.fromCodePoint(...codes);

// Letter pool, referenced by name so the assertions read as Arabic.
const BEH = 0x628, TEH = 0x62a, JEEM = 0x62c, HAAH = 0x62d;
const DAL = 0x62f, RAA = 0x631, SEEN = 0x633, SUU = 0x633, FEH = 0x641;
const QAF = 0x642, KAF = 0x643, NOON = 0x646, HEH = 0x647, WAW = 0x648;
const YAA = 0x64a, ALEF = 0x627, LAM = 0x644, TAH = 0x637, MEEM = 0x645;
const TATWEEL = 0x640, HAMZA = 0x621, HAMZA_ON_WAW = 0x624, HAMZA_ON_YAA = 0x626;
const ALEF_HAMZA = 0x623, ALEF_HAMZA_BELOW = 0x625, ALEF_MADDA = 0x622;
const ALEF_WASLA = 0x671, ALEF_MAQSURA = 0x649, TAA_MARBUTA = 0x629;
const FARSI_YAA = 0x6cc, FARSI_YEH = 0x6cb, KEHEH = 0x6a9, NGA = 0x6af;
const TCHEH = 0x686, JEH = 0x67e, TTEH = 0x679, DDAL = 0x688, RREH = 0x691;
const ARABIC_COMMA = 0x60c, LRM = 0x200e, RLM = 0x200f, ALM = 0x61c;

// Two spellings of one item, as Foodics actually emits them.
const GISHTAH = ar(QAF, 0x634, TAH, TAA_MARBUTA);        // ends in taa marbuta
const GISHTAH_ALT = ar(QAF, 0x634, TAH, HEH);             // same word, ends in haa
const SEVEN_UP_AR = ar(SEEN, FEH, NOON, 0x20, ALEF, BEH);     // three letters + space + alef + beh

describe('normalizeArabic', () => {
  it('[NORM-01] null, undefined and blank all return null -- never an empty string', () => {
    expect(normalizeArabic(null)).toBeNull();
    expect(normalizeArabic(undefined)).toBeNull();
    expect(normalizeArabic('')).toBeNull();
    expect(normalizeArabic('   ')).toBeNull();
  });

  it('[NORM-02] taa marbuta and haa converge', () => {
    expect(normalizeArabic(GISHTAH)).toBe(normalizeArabic(GISHTAH_ALT));
  });

  it('[NORM-03] the three alef-with-hamza forms and alef wasla all converge on alef', () => {
    const bare = normalizeArabic(ar(ALEF));
    expect(normalizeArabic(ar(ALEF_HAMZA))).toBe(bare);
    expect(normalizeArabic(ar(ALEF_HAMZA_BELOW))).toBe(bare);
    expect(normalizeArabic(ar(ALEF_MADDA))).toBe(bare);
    expect(normalizeArabic(ar(ALEF_WASLA))).toBe(bare);
  });

  it('[NORM-04] hamza-on-waw folds to waw, so it is NOT the bare-hamza case', () => {
    expect(normalizeArabic(ar(HAMZA_ON_WAW))).toBe(ar(WAW));
    expect(normalizeArabic(ar(HAMZA_ON_YAA))).toBe(ar(YAA));
    expect(normalizeArabic(ar(ALEF_MAQSURA))).toBe(ar(YAA));
  });

  it('[NORM-05] the BARE hamza survives, so near-misses do not collide', () => {
    const withBare = normalizeArabic(ar(SEEN, WAW, HAMZA, ALEF, LAM));
    const withWawHamza = normalizeArabic(ar(SEEN, HAMZA_ON_WAW, ALEF, LAM));
    expect(withBare).not.toBe(withWawHamza);
    expect(withBare).toContain(ar(HAMZA));
  });

  it('[NORM-06] harakat are removed', () => {
    const withFatha = ar(SEEN, FEH, 0x64e, NOON, 0x20, ALEF, BEH);
    expect(normalizeArabic(withFatha)).toBe(normalizeArabic(SEVEN_UP_AR));
  });

  it('[NORM-07] tatweel is removed', () => {
    const withTatweel = ar(SEEN, TATWEEL, FEH, NOON, 0x20, ALEF, BEH);
    expect(normalizeArabic(withTatweel)).toBe(normalizeArabic(SEVEN_UP_AR));
  });

  it('[NORM-08] repeated whitespace, NBSP and the three bidi marks all collapse', () => {
    // Codepoints are spelled inline on purpose. The module strips them (verified
    // by an out-of-band probe), so a failure here can only mean this file's
    // own constant drifted -- and an inline literal cannot drift silently.
    const messy = '  ' + ar(SEEN, FEH, NOON, 0xa0, ALEF, BEH) + ' ';
    expect(normalizeArabic(messy)).toBe(normalizeArabic(SEVEN_UP_AR));
    expect(normalizeArabic(ar(0x200f) + SEVEN_UP_AR + ar(0x200e)))
      .toBe(normalizeArabic(SEVEN_UP_AR));
    expect(normalizeArabic(ar(0x61c) + SEVEN_UP_AR)).toBe(normalizeArabic(SEVEN_UP_AR));
  });

  it('[NORM-09] Arabic-Indic and Extended-Arabic digits become ASCII digits', () => {
    // alef feh teh hah alef raa hah <U+0661 yeh>. The letters stay Arabic --
    // the word is Arabic, normalising digits must not transliterate it.
    const indic = ar(ALEF, FEH, TEH, HAAH, ALEF, RAA, HAAH, 0x661);
    expect(normalizeArabic(indic)).toBe(ar(ALEF, FEH, TEH, HAAH, ALEF, RAA, HAAH, 0x31));
    expect(normalizeArabic(indic)).toContain('1');
    expect(normalizeArabic(ar(ALEF, 0x6f1))).toBe(ar(ALEF, 0x31));
    // and the same word WITHOUT the digit is genuinely different
    expect(normalizeArabic(ar(ALEF, FEH, TEH, HAAH))).not.toBe(normalizeArabic(indic));
  });

  it('[NORM-10] imported letters converge on their Arabic counterparts', () => {
    expect(normalizeArabic(ar(KEHEH, ALEF, LAM))).toBe(normalizeArabic(ar(KAF, ALEF, LAM)));
    expect(normalizeArabic(ar(FARSI_YAA, ALEF, LAM))).toBe(normalizeArabic(ar(FEH, ALEF, LAM)));
    expect(normalizeArabic(ar(FARSI_YEH, ALEF, LAM))).toBe(normalizeArabic(ar(FEH, ALEF, LAM)));
    expect(normalizeArabic(ar(NGA, ALEF, LAM))).toBe(normalizeArabic(ar(KAF, ALEF, LAM)));
    expect(normalizeArabic(ar(TCHEH, ALEF, LAM))).toBe(normalizeArabic(ar(HAAH, ALEF, LAM)));
    expect(normalizeArabic(ar(JEH, ALEF, LAM))).toBe(normalizeArabic(ar(JEEM, ALEF, LAM)));
    expect(normalizeArabic(ar(TTEH, ALEF, LAM))).toBe(normalizeArabic(ar(BEH, ALEF, LAM)));
    expect(normalizeArabic(ar(DDAL, ALEF, LAM))).toBe(normalizeArabic(ar(BEH, ALEF, LAM)));
    expect(normalizeArabic(ar(RREH, ALEF, LAM))).toBe(normalizeArabic(ar(RAA, ALEF, LAM)));
  });

  it('[NORM-11] Arabic punctuation becomes a space, so no word is glued', () => {
    const withComma = ar(SEEN, FEH, NOON, ARABIC_COMMA, 0x20, ALEF, BEH);
    expect(normalizeArabic(withComma)).toBe(normalizeArabic(SEVEN_UP_AR));
  });

  it('[NORM-12] an all-punctuation input is null, not an empty string', () => {
    expect(normalizeArabic(ar(0x60c))).toBeNull();
  });
});

describe('foldArabicLetter -- one assertion per row', () => {
  it('[NORM-13] every fold row maps to the codepoint the table claims', () => {
    const cases: Array<[number, number, string]> = [
      [TAA_MARBUTA, 0x647, 'taa marbuta -> haa'],
      [ALEF_HAMZA, 0x627, 'alef+hamza -> alef'],
      [ALEF_HAMZA_BELOW, 0x627, 'alef+hamza below -> alef'],
      [ALEF_MADDA, 0x627, 'alef+madda -> alef'],
      [ALEF_WASLA, 0x627, 'alef wasla -> alef'],
      [ALEF_MAQSURA, 0x64a, 'alef maqsura -> yaa'],
      [HAMZA_ON_WAW, 0x648, 'hamza-on-waw -> waw'],
      [HAMZA_ON_YAA, 0x64a, 'hamza-on-yaa -> yaa'],
      [FARSI_YAA, 0x641, 'farsi yaa -> faa'],
      [FARSI_YEH, 0x641, 'farsi yeh -> faa'],
      [KEHEH, 0x643, 'keheh -> kaf'],
      [NGA, 0x643, 'nga -> kaf'],
      [TCHEH, 0x62d, 'tcheh -> hah'],
      [JEH, 0x62c, 'jeh -> jeem'],
      [TTEH, 0x628, 'tteh -> baa'],
      [DDAL, 0x628, 'ddal -> baa'],
      [RREH, 0x631, 'rreh -> raa'],
    ];
    const wrong = cases
      .filter(([from, to]) => foldArabicLetter(ar(from)).codePointAt(0) !== to)
      .map(([from, , label]) => label + ': got U+' + foldArabicLetter(ar(from)).codePointAt(0)!.toString(16));
    expect(wrong).toEqual([]);
  });

  it('[NORM-14] a codepoint absent from the table is returned untouched', () => {
    expect(foldArabicLetter(ar(HAMZA))).toBe(ar(HAMZA));
    expect(foldArabicLetter(ar(MEEM))).toBe(ar(MEEM));
    expect(foldArabicLetter('A')).toBe('A');
  });
});

describe('normalizeEnglish', () => {
  it('[NORM-15] null and blank return null, not an empty string', () => {
    expect(normalizeEnglish(null)).toBeNull();
    expect(normalizeEnglish('')).toBeNull();
    expect(normalizeEnglish('   ')).toBeNull();
    expect(normalizeEnglish('!!!')).toBeNull();
    expect(normalizeEnglish('---')).toBeNull();
  });

  it('[NORM-16] letter case is folded', () => {
    expect(normalizeEnglish('Pepsi')).toBe(normalizeEnglish('PEPSI'));
    expect(normalizeEnglish('Cola Zero')).toBe('cola zero');
  });

  it('[NORM-17] spacing around punctuation does not change the result', () => {
    expect(normalizeEnglish('Coca-Cola Zero')).toBe(normalizeEnglish('Coca Cola Zero'));
  });

  it('[NORM-18] the possessive is dropped', () => {
    expect(normalizeEnglish("Pepsi's")).toBe('pepsi');
    expect(normalizeEnglish('Pepsi\u2019s')).toBe('pepsi');
  });

  it('[NORM-19] ampersand becomes the word and', () => {
    expect(normalizeEnglish('Fish & Chips')).toBe('fish and chips');
  });

  it('[NORM-20] only letters and digits survive', () => {
    expect(normalizeEnglish('!!! 7UP !!!')).toBe('7up');
    expect(normalizeEnglish('50/50')).toBe('50 50');
  });

  it('[NORM-21] diacritics are NOT folded -- deliberate, documented, asserted', () => {
    // NFKC composes "e" + U+0301 into ONE precomposed letter, it does not
    // remove the accent. Both forms are asserted so nobody "fixes" this by
    // stripping accents and reintroduces the false-collision class.
    expect(normalizeEnglish('Cafe\u0301')).not.toBe('cafe');
    expect(normalizeEnglish('Cafe\u0301')).toBe('caf\u00e9');
  });

  it('[NORM-22] word order is preserved, never sorted', () => {
    expect(normalizeEnglish('Cola Coca')).not.toBe(normalizeEnglish('Coca Cola'));
  });
});

describe('normalizeName -- the mixed-script path', () => {
  it('[NORM-23] punctuation inside an Arabic name is stripped and letters survive', () => {
    const withParens = ar(MEEM, TAH, BEH, QAF, 0x20, 0x28, JEEM, BEH, NOON, 0x29);
    const r = normalizeName(withParens);
    expect(r).not.toBeNull();
    expect(r!.split(' ').length).toBe(2);
    expect(r).toContain(ar(MEEM));
  });

  it('[NORM-24] a Latin-only name goes down the English path and is lowercased', () => {
    expect(normalizeName('7UP')).toBe('7up');
    expect(normalizeName('Cola Zero')).toBe('cola zero');
  });

  it('[NORM-25] an Arabic name keeps its letters and does not become lowercase Latin', () => {
    const r = normalizeName(SEVEN_UP_AR);
    expect(r).toBe(normalizeArabic(SEVEN_UP_AR));
    expect(r).toContain(ar(SEEN));
  });

  it('[NORM-26] null in, null out, at every layer', () => {
    expect(normalizeName(null)).toBeNull();
    expect(normalizeName('!!!')).toBeNull();
  });
});

describe('normalizedNames -- the pair that carries the real risk', () => {
  it('[NORM-27] normNameEn stays NULL when there is no English name', () => {
    const r = normalizedNames(GISHTAH, '');
    expect(r.normNameEn).toBeNull();
    expect(r.normName).not.toBeNull();
  });

  it('[NORM-28] a missing English name is never backfilled with the Arabic one', () => {
    const r = normalizedNames(GISHTAH, null);
    expect(r.normNameEn).toBeNull();
    expect(r.normNameEn).not.toBe(r.normName);
  });

  it('[NORM-29] a real English name is normalised and kept', () => {
    const r = normalizedNames(GISHTAH, 'Cream');
    expect(r.normNameEn).toBe('cream');
  });

  it('[NORM-30] the two names are independent values', () => {
    const r = normalizedNames('7UP', 'Seven Up');
    expect(r.normName).toBe('7up');
    expect(r.normNameEn).toBe('seven up');
  });

  it('[NORM-31] a blank English name is treated as absent, whitespace included', () => {
    expect(normalizedNames(GISHTAH, '   ').normNameEn).toBeNull();
    expect(normalizedNames(GISHTAH, undefined).normNameEn).toBeNull();
  });
});

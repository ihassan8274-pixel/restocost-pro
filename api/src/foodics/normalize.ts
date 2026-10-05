/**
 *  NAME NORMALISATION -- the step that runs before matching.
 *
 *  Why not match on the raw string: Foodics emits the same item in more
 *  than one shape. Spacing, tatweel and harakat differ between two exports
 *  of the same day, so a literal comparison misses, and every variant lands
 *  in the unmatched queue for the operator to bind by hand, repeatedly, for
 *  what is one item.
 *
 *  THE GOVERNING RULE: normalisation never decides the match.
 *  We compute and store the normalised form; the decision belongs to the
 *  operator and to foodics_item_map.
 *
 *  ============================================================================
 *  WHY EVERY RANGE BELOW IS WRITTEN AS \uXXXX ESCAPES
 *  ============================================================================
 *  Practical, not stylistic. An Arabic character sitting inside a regex
 *  character class is invisible when you diff two revisions, so a range
 *  written one codepoint off (U+067F where U+0640 was meant) silently opens
 *  or closes characters with no error anywhere -- the regex still compiles,
 *  tsc is clean, and the corpus of user data decides how wrong it is.
 *
 *  Measured during this build: a hand-written range whose lower bound was
 *  transposed compiled cleanly, tsc reported nothing, and the failing tests
 *  blamed a *missing const* rather than a wrong range. The escape form makes
 *  the range reviewable and each bound independently assertable.
 */

const RE_DIACRITICS = /[\u064B-\u0670\u065F\u06D6-\u06ED]/g;
const RE_TATWEEL = /\u0640/g;
const RE_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const RE_ARABIC_LETTERS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const RE_ARABIC_BLOCK = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const RE_PUNCT_AR = /[\u060C\u061B\u061F\u066A-\u066D\u06D4\u00AB\u00BB\u2010-\u2027\u2030-\u205E]/g;
const RE_PUNCT_EN = /[!-\/:-@\[-`{-~]/g;
const RE_SYMBOLS = /[\u00A9\u00AE\u2122\u00B0\u00B1\u00D7\u00F7]/g;
const RE_BIDI_MARKS = /[\u200E\u200F\u061C]/g;
const RE_NON_ALNUM = /[^\p{L}\p{N}]+/gu;
const RE_WHITESPACE = /[\s\u00A0]+/g;

/**
 * Fold table for one Arabic letter, kept separate so it is testable alone.
 * A single wrong key here merges two different items, and only the data can
 * prove it -- so each row gets its own assertion.
 */
export function foldArabicLetter(d: string): string {
  switch (d.codePointAt(0)!) {
    case 0x0629: return '\u0647';                          // taa marbuta -> haa
    case 0x0623: case 0x0625: case 0x0622: case 0x0671:
      return '\u0627';                                    // alef variants -> alef
    case 0x0649: return '\u064A';                         // alef maqsura -> yaa
    case 0x0624: return '\u0648';                         // hamza-on-waw -> waw
    case 0x0626: return '\u064A';                         // hamza-on-yaa -> yaa
    case 0x06cc: case 0x06cb: return '\u0641';            // farsi yaa/yeh -> faa
    case 0x06a9: case 0x06af: return '\u0643';            // keheh/nga -> kaf
    case 0x0686: return '\u062D';                         // tcheh -> hah
    case 0x067e: return '\u062C';                         // jeh -> jeem
    case 0x0679: case 0x0688: return '\u0628';            // tteh/ddal -> baa
    case 0x0691: return '\u0631';                         // rreh -> raa
    default: return d;
  }
}

/**
 * Normalise an Arabic name.
 *
 * Folded on purpose:
 *   - taa marbuta -> haa, so one item matches its other spelling
 *   - the three alef-with-hamza forms plus alef wasla -> alef
 *   - alef maqsura -> yaa
 *   - hamza on waw -> waw, hamza on yaa -> yaa
 *   - imported letters: farsi yaa/yeh, kaf/keheh, tcheh, jeh, tteh, ddal, rreh
 *   - harakat and tatweel
 *   - repeated whitespace, and whitespace either side of punctuation
 *   - Arabic-Indic and Extended-Arabic digits -> ASCII digits
 *   - LRM / RLM / ALM
 *
 * NOT folded, on purpose:
 *   - the bare hamza. Two items that differ only by it stay distinct, because
 *     collapsing them creates a false collision: the first duplicate name
 *     would bind them together and silently corrupt both.
 *
 * THE ONE RULE: never return an empty string, only null. Blank means "there
 * is no name", and blank is stored as NULL. The two are not interchangeable
 * in SQL: ('' = '') is TRUE, (NULL = '') is NULL.
 */
export function normalizeArabic(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  if (s.trim() === '') return null;

  s = s.normalize('NFKC');
  // ⛔ ORDER IS LOAD-BEARING: digits first, harakat second.
  //    RE_DIACRITICS spans U+064B-U+0670, and U+0660-U+0669 (the
  //    Arabic-Indic digits) fall INSIDE that range. Strip harakat first
  //    and the digits are deleted before they are ever converted.
  //    Measured: "alef + U+0661" came back as just "alef" -- the digit
  //    vanished, so that item name collided with the same name carrying
  //    no number. "alef + U+06F1" survived, because U+06F0-U+06F9 sits
  //    outside the diacritic range. Two digit blocks, one of them eaten.
  s = s.replace(RE_INDIC_DIGITS, (d) => String(d.codePointAt(0)! & 0x0f));
  s = s.replace(RE_DIACRITICS, '');
  s = s.replace(RE_ARABIC_LETTERS, foldArabicLetter);
  s = s.replace(RE_SYMBOLS, ' ');
  s = s.replace(RE_TATWEEL, '');
  s = s.replace(RE_BIDI_MARKS, '');
  // Punctuation of BOTH scripts goes, so a trailing "(large)" cannot glue
  // itself onto the item name and make it look like a different item.
  s = s.replace(RE_NON_ALNUM, ' ');
  s = s.replace(RE_WHITESPACE, ' ').trim();

  return s === '' ? null : s;
}

/**
 * Normalise an English name.
 *
 * Folded: letter case, symbols and tatweel, all punctuation to a space,
 * repeated whitespace, the possessive 's, and & to "and".
 *
 * NOT folded, on purpose: diacritics. NFKC composes "e" + U+0301 into a
 * single precomposed letter, it does not remove the accent, so "cafe" with
 * an acute stays distinct from "cafe" without one. That is deliberate. The
 * bare-hamza rule exists for the same reason -- collapsing near-misses buys
 * a smaller queue and pays for it with a wrong binding that nothing catches.
 */
export function normalizeEnglish(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  let s = String(input);
  if (s.trim() === '') return null;

  s = s.normalize('NFKC');
  s = s.toLowerCase();
  s = s.replace(RE_BIDI_MARKS, '');
  s = s.replace(/[\u2019']s(?=$|[\s,.\-])/g, '');
  s = s.replace(RE_SYMBOLS, ' ');
  s = s.replace(/&/g, ' and ');
  s = s.replace(RE_PUNCT_AR, ' ');
  s = s.replace(RE_PUNCT_EN, ' ');
  s = s.replace(RE_NON_ALNUM, ' ');
  s = s.replace(RE_WHITESPACE, ' ').trim();

  return s === '' ? null : s;
}

/**
 * Normalise a mixed-script name.
 *
 * Foodics puts "7UP", a three-letter Arabic word and "Cola" in one column,
 * so neither the Arabic nor the English path alone is correct. Run the Arabic
 * pass first, then decide from what survives.
 *
 * NOT a translation and NOT a language switch. One comparable representation.
 */
export function normalizeName(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const ar = normalizeArabic(input);
  if (ar === null) return null;

  if (!RE_ARABIC_BLOCK.test(ar)) return normalizeEnglish(ar);

  const stripped = ar.replace(/\s+/g, ' ').trim();
  return stripped === '' ? null : stripped;
}

/** The pair of normalised names carried on every row. */
export interface NormalizedNames {
  normName: string | null;
  normNameEn: string | null;
}

/**
 * Compute both normalised names in one pass.
 *
 * norm_name_en stays NULL when there is no English name -- not '' and never
 * the Arabic one. Substituting the Arabic name here would give every
 * Arabic-only item a fake English name, and every subsequent English match
 * would then collide on one Arabic string.
 */
export function normalizedNames(
  name: string | null | undefined,
  nameEn: string | null | undefined,
): NormalizedNames {
  const enBlank = nameEn === null || nameEn === undefined || String(nameEn).trim() === '';
  return {
    normName: normalizeName(name),
    normNameEn: enBlank ? null : normalizeName(nameEn),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  كاشف التسلّل الغريب في المصدر — pure، بلا أي dependency.
//
//  ليش الملف ده موجود: توليد النصوص العربية ينزلق أحياناً فتخلط كلمة صينية
//  أو روسية أو حرف تحكّم داخل جملة عربية سليمة. الملف يبقى UTF-8 صحيحاً، و
//  tsc يمرّ، والاختبارات تمرّ — الخلل بيظهر على الشاشة أو في التقرير المطبوع.
//  فلا يلتقطه أي type-checker، ولا أي linter بيعرف عربي.
//
//  ⚠️ كل النطاقات هنا مكتوبة بـ \uXXXX لا بالحرف نفسه. لو كُتب الحرف الحرفي
//  لصار هذا الملف نفسه مخالفاً لقاعدته، والحارس يطلق على نفسه.
//
//  ⛔ خطأ اتعمل بالفعل الأول وصحّح: حُطّ يوناني (U+0394 و U+03A3) في النطاق لأنهم
//     مستعملين فعلاً في شاشات التقارير (فرق / مجموع) والحارس أطلق عليهم.
//     والسطر المكتوب بلغة أخرى بكامله ليس تسلّلاً، هو ملاحظة أسلوب.
//
//  لا يستورد شيئاً ولا يلمس قاعدة بيانات — يُستدعى من الاختبارات فقط.
// ─────────────────────────────────────────────────────────────────────────────

/** المحارف الممنوعة: صينية/يابانية/كورية + روسية. لا يوناني (U+0394 مستعمل). */
export const FOREIGN_RANGES = [
  [0x2e80, 0x2fdf], // radicals supplement
  [0x3005, 0x3007], // ideographic marks
  [0x3040, 0x30ff], // hiragana + katakana
  [0x3400, 0x4dbf], // unified ideographs extension A
  [0x4e00, 0x9fff], // unified ideographs
  [0xf900, 0xfaff], // compatibility ideographs
  [0x0400, 0x052f], // cyrillic + supplement
];

/**
 * محارف التحكّم: C0 كلها ما عدا \t (09) و \n (0A) و \r (0D)، و C1.
 * \r مسموح لأن الملفات على Windows بتتقفل بـ CRLF.
 */
export const CONTROL_RANGES = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
];

/** U+FFFD — المحرف البديل. وجوده يعني الملف اتقرا بترميز غلط وبيانات ضاعت. */
export const REPLACEMENT = 0xfffd;

// لا نُبنى regex من النطاقات: نُكتب الصنف مباشرة لأن matchAll يحتاج /\u/ form.
const FOREIGN_RUN =
  /[\u2E80-\u2FDF\u3005-\u3007\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u0400-\u052F]+/gu;

/** محارف عربية أو لاتينية — وجودها هو ما يحوّل "سطر بلغة أخرى" إلى "تسلّل". */
const PROSE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFA-Za-z]/;

function inRanges(cp, ranges) {
  for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/** أحرف تحكّم فعلية مكتوبة داخل الملف (مش الـ escape المكتوب هكذا). */
export function findControlChars(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const cp = src.codePointAt(i);
    if (cp !== undefined && inRanges(cp, CONTROL_RANGES)) {
      out.push({ line: lineOf(src, i), cp, text: String.fromCodePoint(cp) });
    }
  }
  return out;
}

/** محارف بديلة (U+FFFD). */
export function findReplacementChars(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (src.codePointAt(i) === REPLACEMENT) out.push({ line: lineOf(src, i) });
  }
  return out;
}

/**
 * كلمات من scripts غير مدعومة داخل سطر فيه نثر عربي/لاتيني.
 *
 * القاعدة: السطر المكتوب بلغة أجنبية بالكامل هو ملاحظة أسلوب وليس تلفاً، أما
 * كلمة أجنبية جالسة وسط جملة عربية فهي تسلّل — حتى لو كانت وحدها في مقطعها.
 * الاختيار على مستوى السطر لا على مستوى الكلمة.
 */
export function findForeignWords(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!PROSE.test(line)) return;
    for (const m of line.matchAll(FOREIGN_RUN)) {
      out.push({
        line: i + 1,
        word: m[0],
        foreign: [...m[0]].map((c) => c.codePointAt(0)),
        context: line.trim().slice(0, 100),
      });
    }
  });
  return out;
}

/**
 * تسرّب backtick بديل مكتوب حرفياً: خطأ حدث فعلاً — حرف r بين backtickَين كُتب
 * كنص داخل JSX فظهر على الشاشة. السبب أن PowerShell لا يفسّر backtick داخل
 * اقتباس مفرد. نطابق النمط البديل فقط (حرف أو رقم بين backtickَين) حتى لا
 * نمسّ template literal حقيقية ولا backtick سطري.
 */
const RAW_BACKTICK_ESCAPE = /`[rtn][0-9]*`/;

export function findRawBacktickEscapes(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (RAW_BACKTICK_ESCAPE.test(line)) out.push({ line: i + 1, text: line.trim().slice(0, 100) });
  });
  return out;
}

/**
 * كلمة لاتينية ملتصقة بحرف عربي داخل جملة — مثل «صار».
 *
 * النمط الذي فات findForeignWords: هو يبحث عن script *آخر* (صيني/روسي)،
 * لكن التلف الذي حدث كان لاتينياً ملتصقاً بعربية بلا فاصل، فلا يلتقطه.
 * وقد تكرر هذا التلف ثلاث مرات في يوم واحد — وهذا يثبت أن الأداة وحدها
 * لا تكفي، فصارت قاعدة في المستودع بدل مراجعة يدوية كل مرة.
 *
 * نتحقق أن السطر نصّ عربي، ثم نبحث عن حرفين لاتينيين متجاورين يلتصق
 * أحدهما بحرف عربي. ونستثني السطر إن بدا كوداً لا جملة (استيراد أو مسار)،
 * فـ«كل type-checker» جملة عربية تحيط بكلمة تقنية مشروحة، وليست تلفاً.
 */
// حرف عربي فقط — بلا علامات ترقيم (، ؛ ؟) ولا أرقام عربية-هندية.
// العلامات تسبب إنذاراً كاذباً: «ids،» تلتصق فيها اللاتينية بالعربية فتنطبق
// القاعدة على سطر سليم. الحرف وحده هو ما يعني "جملة عربية".
const ARABIC_LETTER = /[\u0620-\u064A\u066E-\u066F\u0671-\u06D3\u06EE-\u06FF\u064B-\u065F\u0670]/;
const ARABIC = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
const GLUED_LATIN = new RegExp(
  `(?:${ARABIC_LETTER.source}[A-Za-z]{3,}|[A-Za-z]{3,}${ARABIC_LETTER.source})`,
  'g'
);
// سطر فيه علامة كود — نعتبره كوداً لا نثراً، فنُسقطه.
// لا ندرج => هنا: أسهم الدوال تظهر في أسماء الاختبارات وفي JSX، واستبعادها
// كان يُسقط سطراً فيه التلف الحقيقي.
const CODE_LINE = /https?:\/\/|\bfrom ['"]|\bimport\b|\brequire\(/;

// ── قائمة بيضاء للمصطلحات التقنية ────────────────────────────────
// كلمات لاتينية تلازم العربية في هذا المشروع عن قصد: أسماء منتجات، أو
// معرّفات تُشرح في مكانها، أو أسماء مجموعات تُعداد. بدون هذه القائمة صار
// الحارس يطلق على كل تعليق فيه كلمة إنجليزية مشروحة — وهو ما حدث فعلاً
// في أول نسخة من الكاشف (87 إنذاراً، أكثرها سليم).
//
// القاعدة التي بُنيت عليها: المصطلح يُقبل إذا كان اسم منتج/مكتبة، أو معرّفاً
// برمجياً مذكوراً كما يُكتب في الكود، أو اسم مجموعة من مجموعات البيانات.
// لا نقبل كلمة إنجليزية عشوائية في وسط جملة عربية — تلك هي التلف.
const ALLOWED_GLUED = new Set([
  // منتجات ومكتبات — أسماء علم تُذكر كما تُكتب
  'PDF', 'Excel', 'Handlebars', 'jsreport', 'API', 'Bearer', 'assertValid',
  'stopPropagation', 'parser', 'fixtures', 'guard', 'compile', 'meta',
  // معرّفات برمجية تُشرح في مكانها — تُكتب كما في الكود بلا تغيير
  'props', 'set', 'date', 'null', 'year', 'tasks', 'waiter', 'storekeeper',
  'intake', 'haccp', 'monthly', 'inRange', 'groupCount', 'sumField', 'pct',
  'closedDays', 'eodClosures', 'closedMonths', 'lazy', 'backtick',
  // اسم متغير مركّب عربي-لاتيني مستعمل في الكود نفسه
  'Pct',
]);

/** هل الكلمة اللاتينية الملتصقة مصطلح تقني معروف في هذا المشروع؟ */
export const isAllowedGluedTerm = (word) => {
  const latin = word.match(/[A-Za-z]{3,}/g);
  if (!latin) return false;
  return latin.every((w) => ALLOWED_GLUED.has(w));
};

export function findGluedLatinWords(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!ARABIC.test(line) || !LATIN.test(line)) return;
    if (CODE_LINE.test(line)) return;
    for (const m of line.matchAll(GLUED_LATIN)) {
      if (isAllowedGluedTerm(m[0])) continue;
      out.push({ line: i + 1, word: m[0], context: line.trim().slice(0, 100) });
    }
  });
  return out;
}

/** كل الملاحظات دفعة واحدة — نفسها اللي بيستخدمها اختبار المستودع. */
export function scanSource(src) {
  const findings = [];
  for (const f of findRawBacktickEscapes(src)) {
    findings.push(`سطر ${f.line}: backtick بديل مكتوب حرفياً داخل الكود — ${f.text}`);
  }
  for (const f of findGluedLatinWords(src)) {
    findings.push(`سطر ${f.line}: كلمة لاتينية ملتصقة بعربية [${f.word}] — ${f.context}`);
  }
  for (const f of findForeignWords(src)) {
    const codes = [...new Set(f.foreign)]
      .map((c) => 'U+' + c.toString(16).toUpperCase())
      .join(' ');
    findings.push(`سطر ${f.line}: كلمة من script غير مدعوم [${codes}] — ${f.context}`);
  }
  for (const f of findControlChars(src)) {
    findings.push(`سطر ${f.line}: محرف تحكّم U+${f.cp.toString(16).toUpperCase()} مكتوب حرفياً داخل الملف`);
  }
  for (const f of findReplacementChars(src)) {
    findings.push(`سطر ${f.line}: محرف بديل U+FFFD — الملف اتقرا بترميز غلط`);
  }
  return findings;
}
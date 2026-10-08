import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findControlChars,
  findForeignWords,
  findGluedLatinWords,
  findRawBacktickEscapes,
  findReplacementChars,
  scanSource,
} from '../src/modules/utils/source-script.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ⛔ العيّنات التالفة بُنيت بـ code points لا بالحرف الحرفي، عن قصد:
//    لو كُتبت الحروف حرفياً لصار هذا الملف نفسه مخالفاً لـ [SCR-08]
//    والحارس يطلق على نفسه. الاختبار يوثّق المحارف الممنوعة بالرقم لا بالشكل.
const CJK_VERB = String.fromCodePoint(0x53ef, 0x7528, 0x4e8e);
const CJK_SENTENCE = String.fromCodePoint(0x8ba1, 0x7b97, 0x7cfb, 0x7edf, 0x5b8c, 0x5907, 0x5ea6);
const CJK_ONE = String.fromCodePoint(0x4e2d, 0x6587);
const JP_TILL = String.fromCodePoint(0x81f3);
const RU_WAS = String.fromCodePoint(0x431, 0x44b, 0x43b, 0x43e);

// ── ① عيّنات سلوكية: كل واحدة من التلف الذي شفناه فعلاً ─────────────────────

test('[SCR-01] كلمة صينية داخل جملة عربية تُكتشف', () => {
  const hits = findForeignWords(`// أي دور يملك صلاحية، وهو${CJK_VERB} تصعيد الصلاحيات.`);
  assert.equal(hits.length, 1);
  assert.match(hits[0].context, /تصعيد/);
  assert.equal(findForeignWords('// سليم تماماً.').length, 0);
});

test('[SCR-02] كلمة روسية داخل جملة عربية تُكتشف', () => {
  assert.equal(findForeignWords(`// الدور المحدود ${RU_WAS} يسحب القيود المالية.`).length, 1);
});

test('[SCR-03] حرف تحكّم مكتوب حرفياً يُكتشف، والـ escape المكتوب نصاً لا', () => {
  const literal = `const CTRL = /[${String.fromCodePoint(0)}-${String.fromCodePoint(8)}]/;`;
  assert.equal(findControlChars(literal).length, 2);
  assert.deepEqual(findControlChars('const CTRL = /[\\u0000-\\u0008]/;'), []);
});

test('[SCR-04] tab و LF و CR مسموحة، و U+FFFD مرصود', () => {
  assert.deepEqual(findControlChars('a\tb\nc\rd'), []);
  assert.equal(findReplacementChars('لا يوجد').length, 0);
  assert.equal(findReplacementChars(`نص${String.fromCodePoint(0xfffd)}مكسور`).length, 1);
});

test('[SCR-05] الإيموجي والأسهم والمحارف الاتجاهية لا تُصنَّف تسلّلاً', () => {
  // ⚠️ ضابط سلبي: لازم فيه مورد فعلي، وإلا الحارس يطلق على كل ملف بلا سبب
  const rlm = String.fromCodePoint(0x200f);
  const delta = String.fromCodePoint(0x394);
  const sigma = String.fromCodePoint(0x3a3);
  const clean = `// \u{1F4CB} دليل · \u{21D2} 240 · — ‏ «مدير» · café · \u{1F680} · ✅ · ﷺ`;
  assert.deepEqual(scanSource(clean + rlm), []);
  // U+0394 / U+03A3 مستعملة فعلاً في شاشات التقارير (فرق/مجموع) — حُذفت من النطاق
  const real = `<th>${delta}%</th><td>${sigma}</td>`;
  assert.deepEqual(scanSource(real), []);
});

test('[SCR-07] كلمة لاتينية ملتصقة بعربية تُكتشف — التلف الذي تكرر ثلاث مرات', () => {
  // ⚠️ هذا النمط فات findForeignWords: هو يبحث عن script آخر (صيني/روسي)،
  //    لكن التلف الحقيقي كان لاتينياً ملتصقاً بعربية بلا فاصل.
  //    تكرر في يوم واحد: «يُسجَّل» و«صار» و«لأ».
  // ⚠️ العيّنات التالفة تُبنى بـ code points لا بالحرف الحرفي، وإلا صار ملف
  //    الاختبار نفسه مخالفاً للحارس الذي يختبره — وهو ما حدث في أول نسخة.
  const LAT_A = String.fromCodePoint(0x61, 0x74, 0x79, 0x70, 0x65);   // atype
  const LAT_B = String.fromCodePoint(0x63, 0x69, 0x62, 0x6c, 0x79);   // cibly
  const LAT_C = String.fromCodePoint(0x43, 0x68, 0x72, 0x6f, 0x6e, 0x6f, 0x6c, 0x6f, 0x67, 0x69, 0x63, 0x61, 0x6c, 0x6c, 0x79);
  const glued = [
    `test('سجل جديد بلا مبلغ يُسجَّل${LAT_A} DATA_WRITE', () => {});`,
    `// لو حُسب الحذف هنا لأ${LAT_B}ملأ السجل بـ«حذف» كاذب`,
    `// نسخة نظيفة: ننسخ الحقول الصريحة فقط، فتختفي مفاتيح التسميم${LAT_C}.`,
  ];
  for (const line of glued) {
    const hits = findGluedLatinWords(line);
    assert.ok(hits.length >= 1, `لم يُكشف: ${line.slice(0, 50)}`);
  }
});

test('[SCR-08] مصطلحات تقنية مشروحة في جملة عربية لا تُكشف (ضابط سلبي)', () => {
  // ⚠️ لازم ضابط سلبي: لولا هذا لصار الحارس يطلق على كل تعليق فيه
  //    كلمة إنجليزية مشروحة — وهو ما حدث فعلاً في أول نسخة من الكاشف.
  const clean = [
    `//  كاشف التسلّل الغريب في المصدر — pure، بلا أي dependency.`,
    `//  فلا يلتقطه أي type-checker، ولا أي linter بيعرف عربي.`,
    `// ما لا نُسجّله هنا (الحذف) له مساره: rcerp_deleted_ids، ويُسجَّل هناك.`,
    `const x = 1; // سليم تماماً`,
  ];
  for (const line of clean) {
    assert.deepEqual(findGluedLatinWords(line), [], `إنذار كاذب: ${line.slice(0, 50)}`);
  }
});

test('[SCR-06] سطر كامل بلغة أخرى ليس تسلّلاً (الخلط هو التسلّل)', () => {
  assert.deepEqual(findForeignWords(`// ${CJK_SENTENCE}`), []);
  assert.equal(findForeignWords(`// ${CJK_ONE} mixed مع عربي`).length, 1);
});

test('[SCR-07] التسلّل داخل نصّ مستخدم (template literal) يُكتشف', () => {
  assert.equal(findForeignWords(`const lbl = \`من \${a}${JP_TILL} \${b}\`;`).length, 1);
  assert.equal(findForeignWords('const lbl = `من ${a} إلى ${b}`;').length, 0);
});

test('[SCR-07b] backtick بديل مكتوب حرفياً يُكتشف، والقالب الحقيقي لا', () => {
  // الخطأ الأصلي: PowerShell لا يفسّر backtick داخل اقتباس مفرد
  const bt = String.fromCodePoint(0x60);
  const broken = `      <button>طباعة${bt}r${bt}n</button>`;
  assert.equal(findRawBacktickEscapes(broken).length, 1);
  // قالب عادي فيه backtick في أول وآخر المقطع — سليم
  assert.deepEqual(findRawBacktickEscapes('const s = `a ${b} c`;'), []);
  assert.deepEqual(findRawBacktickEscapes('const s = "سطر\\nعادي";'), []);
});

// ── ② الفحص الحقيقي على المستودع ───────────────────────────────────────────

const SOURCE_ROOTS = ['src', 'server', 'control/src', 'control/public', 'scripts', 'config'];
const EXT = /\.(ts|tsx|mjs|cjs|js|json|ya?ml|html|css)$/;
const SKIP_DIR = /(node_modules|[\\/]dist[\\/]|[\\/]build[\\/]|server[\\/]data[\\/]|_backup|deploy_pkg|coverage)/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(full)) yield* walk(full);
    } else if (EXT.test(e.name) && !/^v-/.test(e.name) && !e.name.endsWith('.min.js')) {
      if (statSync(full).size < 3_000_000) yield full;
    }
  }
}

test('[SCR-08] لا تسلّل في مصدر المشروع المكتوب يدوياً', () => {
  const bad = [];
  let files = 0;
  for (const r of SOURCE_ROOTS) {
    for (const f of walk(path.join(ROOT, r))) {
      files++;
      const src = readFileSync(f, 'utf8');
      for (const line of scanSource(src)) bad.push(`${path.relative(ROOT, f)}  →  ${line}`);
    }
  }
  assert.ok(files > 100, `فُحص ${files} ملف فقط — الـ roots غلط؟`);
  assert.deepEqual(bad, [], 'تسرّل حروف غريبة إلى المصدر:\n' + bad.join('\n'));
});
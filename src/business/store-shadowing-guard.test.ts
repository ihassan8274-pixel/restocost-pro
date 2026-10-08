import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ⭐ حارس انحدار لأخطر عطل معماري مرّ على هذا المشروع.
//
// ما حدث: شجرة متجرين موازية. src/stores/* موصولة بالخادم عبر
// collectionSources، و src/context/domains/* غير موصولة إطلاقاً وبمفاتيح
// localStorage مختلفة ('rcerp-settings' مقابل 'rcerp_settings'). سبعة من أسماء
// المتاجر كانت متطابقة في الشجرتين، فالاستيراد من المسار الخطأ لا يُنتج خطأ
// مترجماً ولا تحذيراً — بل متجراً آخر تماماً، بصمت.
//
// النتيجة: App.tsx يحمّل DashboardViewMigrated (المسار الافتراضي default:)
// وهو يقرأ من domains/* ⇒ **الشاشة الأولى التي يراها المستخدم تعرض أرقاماً لا
// صلة لها بباقي النظام**: rawMaterials/branches/recipes/plSummaries كلها [].
//
// لا يمكن منع خطأ استيراد صامت بوقاية وقت كتابة — الاسم واحد والاثنان صحيحان
// نحوياً. لهذا يفحص هذا الحارس البنية لا السلوك.
//
// ⭐ مبادئ الحارس: (أ) يُزيل التعليقات قبل الفحص وإلا طابق نصاً تفسيرياً،
// (ب) يستثني ما هو موثّق بح-cause صريح، (ج) لا يخمّن أسماء — يقرأ الملفات.

const SRC = path.resolve(__dirname, '..');
const DOMAINS = path.join(SRC, 'context', 'domains');
const STORES = path.join(SRC, 'stores');

// ─────────────────────────────────────────────────────────────
// أدوات
// ─────────────────────────────────────────────────────────────
const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

/** يزيل تعليقات JS/TS — وإلا طابق الحارس نصاً تفسيرياً لا كوداً. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const readCode = (f: string) => stripComments(fs.readFileSync(f, 'utf8'));

const allSrc = walk(SRC);
const isTest = (f: string) => /\.test\.tsx?$/.test(f);

// أسماء المتاجر المُصدَّرة من مجلد
const storeExportsIn = (dir: string): Set<string> => {
  if (!fs.existsSync(dir)) return new Set();
  const names = new Set<string>();
  for (const f of walk(dir)) {
    for (const m of readCode(f).matchAll(/export const (use\w+Store)/g)) names.add(m[1]);
  }
  return names;
};

const domainsFiles = fs.existsSync(DOMAINS)
  ? fs.readdirSync(DOMAINS).filter((f) => f.endsWith('.ts'))
  : [];

/**
 * الاستثناء الوحيد الباقي: financial.ts حيّ لأنه مالك إعداد
 * "خصم المبيعات من المخزون" (يستورده useAppCompat). دمجه في src/stores
 * مهمة منفصلة لم تُنجَز بعد — ليست جزءاً من هذا الحارس.
 */
const ALLOWED_SHADOWS = new Set(['useFinancialStore']);

// ─────────────────────────────────────────────────────────────
// ١) مسار الاستيراد الافتراضي يقرأ من المتجر الموصول بالخادم
// ─────────────────────────────────────────────────────────────
describe('المسار الافتراضي يقرأ من المتجر الموصول بالخادم', () => {
  const app = readCode(path.join(SRC, 'App.tsx'));

  it('App.tsx لا يحمّل أي شاشة *Migrated', () => {
    expect(app.match(/import\(['"][^'"]*Migrated['"]\)/g) || []).toEqual([]);
  });

  it('App.tsx لا يستورد من context/domains', () => {
    expect(app.match(/from\s+'[^']*context\/domains/g) || []).toEqual([]);
  });

  it('لا يبقى ملف *Migrated في المشروع', () => {
    expect(allSrc.filter((f) => f.endsWith('Migrated.tsx')).map(rel)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// ٢) لا ازدواج في أسماء المتاجر (الاستيراد الصامت)
// ─────────────────────────────────────────────────────────────
describe('لا ازدواج في أسماء المتاجر بين الشجرتين', () => {
  it('الازدواج المتبقي هو الاستثناء الموثّق فقط', () => {
    const stores = storeExportsIn(STORES);
    const dup = [...storeExportsIn(DOMAINS)].filter((n) => stores.has(n));
    expect(dup.filter((n) => !ALLOWED_SHADOWS.has(n))).toEqual([]);
  });

  it('مفتاحا localStorage لا يتصادمان (شرطة عليا مقابل سفلية)', () => {
    // 'rcerp-settings' و 'rcerp_settings' مفتاحان مختلفان تماماً في المتصفح،
    // فالتصادم يمرّ بصمت: الشاشة تقرأ مساحة لم يكتبها أحد.
    const keysOf = (dir: string) => {
      if (!fs.existsSync(dir)) return new Set<string>();
      const k = new Set<string>();
      for (const f of walk(dir)) {
        for (const m of readCode(f).matchAll(/name:\s*'(rcerp[-_][a-z_]+)'/g)) k.add(m[1]);
      }
      return k;
    };
    const stores = keysOf(STORES);
    expect([...keysOf(DOMAINS)].filter((k) => stores.has(k))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// ٣) لا استيراد من شجرة غير الموصولة، وكل متجر موصول
// ─────────────────────────────────────────────────────────────
describe('سلامة ربط المتاجر بالخادم', () => {
  it('لا ملف إنتاجي يستورد من context/domains', () => {
    // استثناءان موثّقان، كلاهما لإعداد "خصم المبيعات من المخزون" وحده:
    //  - useAppCompat : يقرأ القيمة ويصدّر Setter (المالك للواجهة)
    //  - collectionSources : يربط سجل الخادم rcerp_deduct_sales بالمالك،
    //    وإلا كُتبت القيمة المرفوعة في legacy ولا تُحمَّل في المالك ⇒
    //    الزرّ لا يغيّر شيئاً مرئياً ولا يُفعّل الخصم.
    // دمج financial.ts في src/stores/ ينهي الاستثناءين معاً.
    const ALLOWED_FILES = new Set([
      'stores/hooks/useAppCompat.ts',
      'stores/collectionSources.ts',
    ]);
    const offenders: string[] = [];
    for (const f of allSrc) {
      if (rel(f).startsWith('context/domains/') || isTest(f)) continue;
      for (const m of readCode(f).matchAll(/from\s+'[^']*context\/domains\/([a-z]+)'/g)) {
        if (ALLOWED_FILES.has(rel(f))) continue;
        offenders.push(`${rel(f)} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('كل متجر بيانات في src/stores مُسجَّل في collectionSources', () => {
    // مطابقة بالملف لا بالاسم: تحويل useXStore ⇒ rcerp_x كان يخمّن خطأً.
    const registry = readCode(path.join(STORES, 'collectionSources.ts'));
    // لا مجموعات خادم لها (تفضيلات محلية/إعداد مزامنة/ذكاء اصطناعي)
    const LOCAL_ONLY = new Set(['aiSettingsStore', 'preferencesStore', 'collectionRegistry', 'collectionSources']);
    const unwired = fs.readdirSync(STORES)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .filter((n) => !LOCAL_ONLY.has(n))
      .filter((n) => !new RegExp(`[/']${n}'`).test(registry));
    expect(unwired).toEqual([]);
  });

  it('مجلد context/domains لم يعد يحمل إلا الاستثناء الموثّق', () => {
    expect(domainsFiles).toEqual(['financial.ts']);
  });
});
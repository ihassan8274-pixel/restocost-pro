import { OperatingExpenseCategory, ExpensePaymentStatus, ExpenseRecurrence, DEFAULT_MATERIAL_CATEGORIES } from '../types';
import type { MaterialCategoryDef } from '../types';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export { DEFAULT_MATERIAL_CATEGORIES };

// نظام الأرقام المعروضة: إنجليزية (123) أو عربية (١٢٣) — يُضبط من إعدادات النظام
export type NumeralSystem = 'en' | 'ar';
// قراءة من localStorage عند تحميل الـ module (fallback قبل تهيئة AppContext)
const initialNumerals = (typeof window !== 'undefined' && localStorage.getItem('rcerp_numerals') === 'ar') ? 'ar' : 'en';
let numeralSystem: NumeralSystem = initialNumerals;
export const getNumeralSystem = (): NumeralSystem => numeralSystem;
export const setNumeralSystem = (v: NumeralSystem) => { numeralSystem = v; };
const numLocale = () => (numeralSystem === 'ar' ? 'ar-SA' : 'en-US');

// التقويم الهجري (أم القرى): خيار من إعدادات النظام — يُطبَّق في كل التواريخ
const initialHijri = typeof window !== 'undefined' && localStorage.getItem('rcerp_hijri') === '1';
let hijriMode = initialHijri;
export const getHijriMode = () => hijriMode;
export const setHijriMode = (v: boolean) => { hijriMode = v; };
const hijriShort = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
const hijriLong = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });

// تحويل أي صيغة تاريخ (YYYY-MM-DD أو ISO كامل) إلى كائن Date — مع حماية المناطق الزمنية
export function parseDateLenient(value: string): Date | null {
  if (!value) return null;
  const v = value.length <= 10 ? `${value}T00:00:00` : value;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export interface DateSmart {
  display: string; // النتيجة المعروضة (هجري عند تفعيل الخيار، وإلا ميلادي قصير)
  title: string;   // تلميح يوضح التاريخين معاً
  gregorian: string;
  hijri: string;
}

export function formatDateSmart(value: string): DateSmart {
  const d = parseDateLenient(value);
  if (!d) return { display: value || '—', title: value || '', gregorian: value || '', hijri: '' };
  const y = d.getFullYear(); const m = d.getMonth() + 1; const day = d.getDate();
  const gShort = `${day}/${m}/${y}`;
  const hijri = hijriShort.format(d);
  const hijriL = hijriLong.format(d);
  const gregorian = d.toLocaleDateString('ar-SA');
  return {
    display: hijriMode ? hijri : gShort,
    title: `م ${gregorian} — هـ ${hijriL}`,
    gregorian,
    hijri,
  };
}

// العلامات العشرية الافتراضية (0‑4) — يُضبط من إعدادات النظام ويُطبَّق تلقائياً في كل الشاشات
const initialDecimals = typeof window !== 'undefined'
  ? Math.max(0, Math.min(4, Number(localStorage.getItem('rcerp_decimals')) || 2))
  : 2;
let defaultDecimals = initialDecimals;
export const getDefaultDecimals = () => defaultDecimals;
export const setDefaultDecimals = (v: number) => { defaultDecimals = Math.max(0, Math.min(4, Math.round(v))); };

// علامة الناقص الحقيقية (U+2212) — ثابتة لكل اللغات لتفادي علامة الواصلة الضيقة
const MINUS = '\u2212';

const toFixedStr = (n: number, digits: number) => {
  const s = Number(n).toLocaleString(numLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return s.startsWith('-') ? `${MINUS}${s.slice(1)}` : s;
};

// التنسيق الموحّد للنظام: يستخدم العلامات العشرية المحددة (أو Override صريح)
export const fmt = (n: number, digits: number = defaultDecimals) => toFixedStr(n, digits);

// حالات خاصة تحتاج دقة مختلفة (أسعار الصرف مثلاً) — defaultDigits يسابق الإعداد العام
export const fmtNum = (n: number, digits: number = defaultDecimals) => toFixedStr(n, digits);

export const fmtMoney = (n: number) => `${fmt(n)} ر.س`;

export const fmtCur = (n: number, symbol: string) => `${fmt(n)} ${symbol}`;

export const fmtQty = (n: number) => fmtNum(n);

export const fmtPct = (n: number) => `${fmtNum(n)}%`;

export const VAT_RATE = 0.15;
export const netOfGross = (gross: number, rate: number = VAT_RATE) => gross / (1 + rate);
export const vatOfGross = (gross: number, rate: number = VAT_RATE) => gross - gross / (1 + rate);

export const EMPLOYEE_ROLE_LABELS: Record<string, string> = {
  executive_chef: 'شيف تنفيذي', line_cook: 'طاهي خط', storekeeper: 'أمين مستودع',
  waiter: 'نادل', branch_manager: 'مدير فرع', cost_controller: 'مراقب تكاليف',
};

export const employeeRoleLabel = (role: string) => EMPLOYEE_ROLE_LABELS[role] || role;

export const today = () => new Date().toISOString().split('T')[0];

export const currentMonthKey = () => today().slice(0, 7);

export const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const idx = parseInt(m, 10) - 1;
  return `${names[idx] || ''} ${y}`;
};

export const EXPENSE_CATEGORY_LABELS: Record<OperatingExpenseCategory, string> = {
  rent: 'إيجارات', utilities: 'كهرباء وماء وغاز', internet_telecom: 'إنترنت واتصالات',
  maintenance_repairs: 'صيانة وإصلاحات', cleaning_supplies: 'مستلزمات تنظيف',
  marketing_advertising: 'تسويق وإعلانات', delivery_platform_commissions: 'عمولات منصات التوصيل',
  licensing_permits: 'تراخيص واشتراطات', software_subscriptions: 'اشتراكات برمجيات',
  insurance: 'تأمينات', misc: 'مصاريف أخرى',
};

export const EXPENSE_CATEGORY_COLORS: Record<OperatingExpenseCategory, string> = {
  rent: '#6366f1', utilities: '#f59e0b', internet_telecom: '#06b6d4', maintenance_repairs: '#f43f5e',
  cleaning_supplies: '#10b981', marketing_advertising: '#8b5cf6', delivery_platform_commissions: '#0ea5e9',
  licensing_permits: '#64748b', software_subscriptions: '#d946ef', insurance: '#84cc16', misc: '#94a3b8',
};

export const PAYMENT_STATUS_LABELS: Record<ExpensePaymentStatus, string> = {
  paid: 'مدفوع', pending: 'مستحق', overdue: 'متأخر',
};

export const RECURRENCE_LABELS: Record<ExpenseRecurrence, string> = {
  one_time: 'مرة واحدة', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي',
};

// ═══════════════════════════════════════════════════════════════════════════
// تصنيفات المواد — القيم الافتراضية الثمانية + المخصصة (dynaic)
// MATERIAL_CATEGORY_LABELS = الافتراضيات فقط (للتوافق مع الكود القديم)
// categoryLabel(key, customDefs) = يبحث أولاً في المخصصة ثم الافتراضي
// allCategoryLabels(customDefs) = القائمة الكاملة مدمجة + مرتبة
// ═══════════════════════════════════════════════════════════════════════════
export const MATERIAL_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_MATERIAL_CATEGORIES).map(([k, v]) => [k, v.labelAr])
);

/** تسمية التصنيف: يبحث أولاً في المخصصة المحفوظة ثم الافتراضي */
export const categoryLabel = (key: string, customDefs: MaterialCategoryDef[] = []): string => {
  const custom = customDefs.find((d) => d.key === key);
  if (custom) return custom.labelAr;
  return MATERIAL_CATEGORY_LABELS[key] || key;
};

/** مفتاح التصنيف من الاسم العربي */
export const categoryKeyByName = (labelAr: string, customDefs: MaterialCategoryDef[] = []): string => {
  const custom = customDefs.find((d) => d.labelAr === labelAr);
  if (custom) return custom.key;
  const def = Object.entries(DEFAULT_MATERIAL_CATEGORIES).find(([, v]) => v.labelAr === labelAr);
  return def?.[0] || labelAr;
};

/** قائمة مدمجة+مرتبة لكل التصنيفات (الافتراضية + المخصصة) */
export const allCategoryLabels = (customDefs: MaterialCategoryDef[] = []): Record<string, string> => {
  const merged: Record<string, string> = {};
  // أولاً: الافتراضية بترتيبها
  Object.entries(DEFAULT_MATERIAL_CATEGORIES)
    .sort((a, b) => a[1].order - b[1].order)
    .forEach(([k, v]) => { merged[k] = v.labelAr; });
  // ثانياً: المخصصة النشطة بترتيبها
  customDefs
    .filter((d) => d.isActive)
    .sort((a, b) => a.order - b.order)
    .forEach((d) => { merged[d.key] = d.labelAr; });
  return merged;
};

/** مصفوفة مرتّبة من القيم ([]) — تُستخدم في فلاتر البحث والقوائم المنسدلة */
export const allCategoryKeys = (customDefs: MaterialCategoryDef[] = []): string[] => Object.keys(allCategoryLabels(customDefs));

export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار التأكيد', confirmed: 'مؤكد', seated: 'جلس', completed: 'مكتمل', cancelled: 'ملغي', no_show: 'لم يحضر',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة', issued: 'صادرة', paid: 'مدفوعة', partially_paid: 'مدفوعة جزئياً', overdue: 'متأخرة', cancelled: 'ملغاة',
};

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة', submitted: 'مقدمة', approved: 'معتمدة', partially_received: 'استلام جزئي', received: 'مستلمة', cancelled: 'ملغاة', rejected: 'مرفوضة',
};

export const downloadCSV = (filename: string, header: string[], rows: (string | number)[][]) => {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const content = [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Linear regression forecast: input = [number,...], predicts next `periods` points
export const forecastSeries = (historical: number[], periods = 3): number[] => {
  if (historical.length < 2) return historical.map((v) => v);
  const n = historical.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  historical.forEach((y, i) => {
    sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
  });
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return Array.from({ length: periods }, (_, i) => Math.max(0, Math.round(slope * (n + i) + intercept)));
};

export const badge = (tone: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate' = 'slate') => {
  const tones = {
    indigo: 'bg-brand-50 text-brand-700 border border-brand-200',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border border-rose-200',
    slate: 'bg-slate-100 text-slate-700 border border-slate-200',
  };
  return `inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${tones[tone]}`;
};

// Move focus to the next input cell when Enter is pressed, so quantities and
// prices can be entered quickly cell-by-cell. Cells are marked with data-nav.
export const navOnEnter = (e: ReactKeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-nav], textarea[data-nav]'));
  const idx = inputs.indexOf(e.currentTarget as HTMLInputElement);
  if (idx < 0) return;
  const next = inputs[idx + 1];
  if (next) {
    e.preventDefault();
    next.focus();
    next.select();
  }
};
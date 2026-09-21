// ============ HACCP & FOOD SAFETY (سلامة الغذاء) ============

// قراءة درجة حرارة لوحدة تخزين/منطقة — لكل فرع
export interface TempLogEntry {
  id: string;
  date: string;
  branchId: string;
  location: string;        // اسم الثلاجة/المنطقة (مثال: ثلاجة اللحوم، غرفة التبريد)
  storageType: 'frozen' | 'chilled' | 'dry';
  temperature: number;     // درجة مئوية
  recordedBy: string;
  note?: string;
}

// نطاقات الحرارة الآمنة لكل نوع تخزين (حد مثالي/أقصى)
export const TEMP_RANGES: Record<TempLogEntry['storageType'], { ideal: number; max: number }> = {
  frozen: { ideal: -18, max: -12 },
  chilled: { ideal: 4, max: 8 },
  dry: { ideal: 22, max: 28 },
};

export type TempStatus = 'ok' | 'warning' | 'critical';

export const tempStatusOf = (entry: { storageType: TempLogEntry['storageType']; temperature: number }): TempStatus => {
  const r = TEMP_RANGES[entry.storageType];
  if (entry.temperature <= r.max) return 'ok';
  if (entry.temperature <= r.max + 5) return 'warning';
  return 'critical';
};

// بند فحص يومي في قائمة تدقيق السلامة (مثال: تسمية الدفعات، تسجيل الوارد، نظافة المنطقة)
export interface InspectionItem {
  key: string;
  label: string;
  passed: boolean;
  note?: string;
}

// تقرير تفتيش/تدقيق سلامة غذاء يومي أو دوري
export interface HaccpInspection {
  id: string;
  date: string;
  branchId: string;
  type: 'daily' | 'weekly' | 'monthly';
  inspector: string;
  items: InspectionItem[];
  overallPassed: boolean;
  notes?: string;
  createdAt: string;
}

// قالب بند تدقيق افتراضي
export const DEFAULT_INSPECTION_TEMPLATE: { key: string; label: string }[] = [
  { key: 'labels', label: 'تسمية جميع المنتجات والمدخلات (اسم/تاريخ/دفعة)' },
  { key: 'fifo', label: 'الترتيب الصحيح في التخزين وفق FEFO (الأقرب صلاحية بالأمام)' },
  { key: 'expired', label: 'لا توجد أصناف منتهية الصلاحية في الوحدات' },
  { key: 'cross', label: 'عدم تداخل الأطعمة النيئة والمطبوخة' },
  { key: 'temp', label: 'درجات حرارة وحدات التخزين ضمن النطاق الآمن' },
  { key: 'clean', label: 'نظافة وتعقيم الأسطح والمعدات' },
  { key: 'storage', label: 'رفع الأغذية عن الأرض وتخزينها بارتفاع مناسب' },
  { key: 'pests', label: 'خلو الموقع من علامات القوارض والحشرات' },
  { key: 'gloves', label: 'توفير القفازات وأدوات النظافة وسهولة الوصول' },
  { key: 'records', label: 'تحديث سجلات التفتيش بانتظام' },
];
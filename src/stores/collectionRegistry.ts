// سجل مركزي يربط مفاتيح المزامنة التاريخية (rcerp_*) بملحقي القراءة/الكتابة للستورات
// الحديثة. فُصل في وحدة خالصة لا تستيرد أي ستور حتى لا يحدث تدوير استيراد بين
// syncStore و collectionSources (كلاهما يستيردان هذه الوحدة فقط).
interface RegisteredSource {
  set: (v: unknown) => void;
  get: () => unknown;
}

const sources = new Map<string, RegisteredSource>();
const order: string[] = [];
const tombstoneKeys = new Set<string>();

export const registerCollection = (key: string, set: (v: unknown) => void, get: () => unknown, filterTombstones = false): void => {
  if (sources.has(key)) return;
  sources.set(key, { set, get });
  order.push(key);
  if (filterTombstones) tombstoneKeys.add(key);
};

// المجموعات المرتبطة سجلاتها بمعرّفات: عند التطبيق من الخادم تُصفّى السجلات التي
// يحمل معرفها شاهدَ حذف (rcerp_deleted_ids) حتى لا "يعود" المحذوف من أي جهاز آخر.
export const isTombstoneKey = (key: string): boolean => tombstoneKeys.has(key);

export const registeredKeys = (): string[] => order.slice();

export const getCollectionSetter = (key: string): ((v: unknown) => void) | undefined => sources.get(key)?.set;

export const getCollectionValue = (key: string): unknown => sources.get(key)?.get();

// علَم الشجرة الواحدة: أثناء تطبيق بيانات خادم صادرة (bootstrap / pull / reapply)
// يجب على اشتراكات الستورات ألا تعيد رفع نفس القيم إلى طابور الحفظ (منع الصدى).
let applying = false;
export const withApplying = (fn: () => void): void => {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
};
export const isApplying = (): boolean => applying;
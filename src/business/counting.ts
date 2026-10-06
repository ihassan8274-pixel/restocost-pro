import type { RawMaterial } from '../types';
import { stockPerPurchase, purchaseUnitName, purchaseUnitPrice } from './units';
import { mulMoney } from './money';

// إدخال الكمية بعمودين: p = وحدة الشراء (كرتون/صندوق)، s = وحدة المخزون (عدد/كغم)
export type CountEntry = { p: string; s: string };
export const blankCountEntry = (): CountEntry => ({ p: '', s: '' });

// تنظيف المدخلات: أرقام ونقطة عشرية فقط
export const cleanCountInput = (v: string): string => v.replace(/[^0-9.]/g, '');

// هل أُدخلت كمية (حتى لو 0) لهذا الصنف؟ — تُستخدم لعدّ الأصناف المعدودة
export const countFilled = (ce?: CountEntry): boolean => {
  if (!ce) return false;
  const p = ce.p?.trim();
  const s = ce.s?.trim();
  return (p !== '' && !Number.isNaN(Number(p))) || (s !== '' && !Number.isNaN(Number(s)));
};

// هيكل سطر الجرد (مطابق لـ DailyCountItem في schema)
export interface CountItem {
  rawMaterialId: string;
  itemName: string;
  unit: string;
  openingQty: number;
  purchasedQty: number;
  theoreticalQty: number;
  countedQty: number;
  theoreticalStorage: number;
  countedStorage: number;
  consumedQty: number;
  unitCost: number;
  consumedValue: number;
}

// بناء سطور الجرد: تحويل (وحدة الشراء × المعامل + المخزون) إلى كمية مخزونية
// وعدد بوحدة الشراء — مع تثبيت الأخطاء العشرية عند 3 خانات تقريباً.
// theoStorage: كمية المخزون النظرية لكل مادة (مجموع لوتات المخزون للفرع).
export const buildCountItems = (
  mats: Pick<RawMaterial, 'id' | 'nameAr' | 'purchaseUnit' | 'purchaseUnitConversion' | 'unit' | 'standardPrice' | 'purchaseUnitPrice'>[],
  counts: Record<string, CountEntry>,
  theoStorage: Record<string, number> = {},
): CountItem[] =>
  mats
    .filter((m) => {
      const ce = counts[m.id];
      return ce && (ce.p !== '' || ce.s !== '');
    })
    .map((m) => {
      const factor = stockPerPurchase(m);
      const ce = counts[m.id] || blankCountEntry();
      const pQty = Number(ce.p) || 0;
      const sQty = Number(ce.s) || 0;
      // إجمالي المخزون الفعلي = (كمية الشراء × معامل التحويل) + كمية المخزون
      const countedStorage = Number((sQty + pQty * factor).toFixed(3));
      // تُحفظ الكمية بوحدة الشراء (لتكون متوافقة مع schema السجلات القائمة)
      const countedQty = factor > 0 ? Number((countedStorage / factor).toFixed(3)) : countedStorage;
      const theoreticalStorage = Number((theoStorage[m.id] || 0).toFixed(3));
      const theoreticalQty = factor > 0 ? theoreticalStorage / factor : theoreticalStorage;
      const consumedQty = Math.max(0, theoreticalQty - countedQty);
      const unitCost = purchaseUnitPrice(m);
      return {
        rawMaterialId: m.id,
        itemName: m.nameAr,
        unit: purchaseUnitName(m),
        openingQty: theoreticalQty,
        purchasedQty: 0,
        theoreticalQty,
        countedQty,
        theoreticalStorage,
        countedStorage,
        consumedQty,
        unitCost,
        consumedValue: mulMoney(consumedQty, unitCost),
      };
    });

export const countProgress = (counts: Record<string, CountEntry>, total: number): number =>
  total ? Math.round((Object.values(counts).filter((ce) => countFilled(ce)).length / total) * 100) : 0;
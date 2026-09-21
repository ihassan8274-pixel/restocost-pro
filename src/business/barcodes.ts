import type { MaterialBarcode } from '../types/inventory';

// ==== منطق باركود المواد الخام (منطق نقي قابل للاختبار) ====
// المستخدمة في الشاشات (InventoryView) و Context (addMaterialBarcode...) — إعادة
// التطبيقات الجديدة هنا فقط والاستفادة من القواعد الموحدة.

// إضافة باركود مع حماية التكرار: نفس الرقم يمنع الإضافة لنفس المادة
export const canAddBarcode = (list: MaterialBarcode[], barcode: string, forMaterialId: string): { ok: boolean; error?: string } => {
  const code = String(barcode || '').trim();
  if (!code) return { ok: false, error: 'الباركود فارغ' };
  const dup = list.find((b) => b.barcode === code);
  if (dup && dup.rawMaterialId === forMaterialId) {
    return { ok: false, error: 'هذا الباركود مسجل بالفعل لنفس المادة' };
  }
  return { ok: true };
};

// إلغاء "الأساسي" عن كل باركودات المادة عند جعل واحد أساسياً (قاعدة واحدة أساسي لكل مادة)
export const setPrimary = (list: MaterialBarcode[], id: string, isPrimary: boolean): MaterialBarcode[] => {
  const target = list.find((b) => b.id === id);
  if (!target) return list;
  if (!isPrimary) {
    // عند إلغاء الأساسية: نعيد الأساسية لأول باركود آخر متاح
    const others = list.filter((b) => b.rawMaterialId === target.rawMaterialId && b.id !== id);
    return list.map((b) =>
      b.id === id ? { ...b, isPrimary: false }
        : (b.rawMaterialId === target.rawMaterialId && others.length > 0 ? { ...b, isPrimary: b === others[0] } : b)
    );
  }
  // عند التفعيل: كل باركودات نفس المادة تصبح غير أساسية ما عدا المُراد
  return list.map((b) => (b.rawMaterialId === target.rawMaterialId ? { ...b, isPrimary: b.id === id } : b));
};

// إنشاء باركود جديد مع الالتزام بقاعدة الأساسية الواحدة
export const upsertBarcode = (list: MaterialBarcode[], data: Omit<MaterialBarcode, 'id'>, existingId?: string): MaterialBarcode[] => {
  const entry: MaterialBarcode = { ...data, id: existingId || `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, barcode: String(data.barcode || '').trim() };
  const without = existingId ? list.filter((b) => b.id !== existingId) : list;
  const n = [...without, entry];
  return entry.isPrimary ? n.map((b) => (b.rawMaterialId === entry.rawMaterialId ? { ...b, isPrimary: b.id === entry.id } : b)) : n;
};

// هل هذا الباركود مرتبط بأي مادة حالياً؟ (منع التعارض عبر المواد إذا أُريد)
export const barcodeInUseByOther = (list: MaterialBarcode[], barcode: string, exceptId?: string): MaterialBarcode | undefined => {
  const code = String(barcode || '').trim();
  return list.find((b) => b.barcode === code && b.id !== exceptId);
};

export default { canAddBarcode, setPrimary, upsertBarcode, barcodeInUseByOther };
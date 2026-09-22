import { useState } from 'react';
import type { MaterialBarcode, RawMaterial, UnitOfMeasure } from '../types';
import { INITIAL_UNITS } from '../mockData';

// كبسولة «الوحدات والباركود» المستخرجة من AppProvider: الحالة الخاصة بالوحدات/الباركود
// + كل الموجّهات. تُحقن الاعتماديات خارجياً (logAudit، pushSnap للتراجع، مُسمّي المادة)،
// وتُقرأ قائمة الخامات rawMaterials للتحقق من الاستخدام قبل حذف وحدة.
interface UseUnitsAndBarcodesDeps {
  logAudit: (action: string, module: string, details?: string) => void;
  pushSnap: (label: string) => void;
  getRawMaterialName: (id: string) => string;
  rawMaterials: RawMaterial[];
}

export const useUnitsAndBarcodes = ({ logAudit, pushSnap, getRawMaterialName, rawMaterials }: UseUnitsAndBarcodesDeps) => {
  // loadState في الأصل تعيد البديل مباشرة — فالتطبيع هنا مطابق تماماً
  const [materialBarcodes, setMaterialBarcodes] = useState<MaterialBarcode[]>([]);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasure[]>(INITIAL_UNITS);

  const addMaterialBarcode = (data: Omit<MaterialBarcode, 'id'>) => {
    pushSnap('إضافة باركود');
    setMaterialBarcodes((prev) => [...prev, { ...data, id: `mb-${Date.now()}` }]);
    logAudit('إضافة باركود مادة', 'المخزون', `${getRawMaterialName(data.rawMaterialId)} — ${data.barcode}`);
  };
  const updateMaterialBarcode = (id: string, data: Partial<MaterialBarcode>) => {
    pushSnap('تعديل باركود');
    setMaterialBarcodes((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
  };
  const deleteMaterialBarcode = (id: string) => {
    pushSnap('حذف باركود');
    setMaterialBarcodes((prev) => prev.filter((b) => b.id !== id));
  };
  const barcodesForMaterial = (rawMaterialId: string) => materialBarcodes.filter((b) => b.rawMaterialId === rawMaterialId);
  const findByBarcode = (code: string) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return undefined;
    return materialBarcodes.find((b) => b.barcode === trimmed);
  };

  const addUnitOfMeasure = (data: Omit<UnitOfMeasure, 'id'>) => {
    pushSnap('إضافة وحدة قياس');
    setUnitsOfMeasure((prev) => [...prev, { ...data, id: `uom-${Date.now()}` }]);
    logAudit('إضافة وحدة قياس', 'وحدات القياس', data.nameAr);
  };
  const updateUnitOfMeasure = (id: string, data: Partial<UnitOfMeasure>) => {
    pushSnap('تعديل وحدة قياس');
    setUnitsOfMeasure((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
  };
  const deleteUnitOfMeasure = (id: string): { ok: boolean; error?: string } => {
    const usedBy = rawMaterials.some((m) => m.tradeUomId === id);
    if (usedBy) return { ok: false, error: 'لا يمكن الحذف — الوحدة مستخدمة بوحدة تداول لمادة خام واحدة على الأقل.' };
    pushSnap('حذف وحدة قياس');
    setUnitsOfMeasure((prev) => prev.filter((u) => u.id !== id));
    logAudit('حذف وحدة قياس', 'وحدات القياس', id);
    return { ok: true };
  };

  return {
    unitsOfMeasure, setUnitsOfMeasure, materialBarcodes, setMaterialBarcodes,
    addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode, barcodesForMaterial, findByBarcode,
    addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure,
  };
};
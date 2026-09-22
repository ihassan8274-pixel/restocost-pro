import { useState } from 'react';
import { tradeToStock } from '../business/units';
import { today } from '../utils/helpers';
import type { GoodsReceiptItem, InventoryBatch, InventoryMovementLog, InventoryRecord, RawMaterial } from '../types';
import { INITIAL_INVENTORY } from '../mockData';

// كبسولة «المخزون الأساسي» المستخرجة من AppProvider: رصيد المخزون + دفعات FEFO
// + سجل الحركات، مع موجّهات التعديل/الاستهلاك والاستعلامات. لا تعتمد إلا على
// قائمة الخامات (التحويل trade→stock) — كل الباقي داخلي/أدوات مستوردة.
interface UseInventoryCoreDeps {
  rawMaterials: RawMaterial[];
}

export const useInventoryCore = ({ rawMaterials }: UseInventoryCoreDeps) => {
  // loadState في الأصل تعيد البديل — فالتطبيع هنا مطابق تماماً
  const [inventory, setInventory] = useState<InventoryRecord[]>(INITIAL_INVENTORY);
  const [inventoryBatches, setInventoryBatches] = useState<InventoryBatch[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovementLog[]>([]);

  const adjustInventory = (branchId: string, rawMaterialId: string, delta: number, batchInfo?: { batchNumber?: string; expiryDate?: string }, reason?: { type: string; ref?: string }) => {
    // FEFO: أي خصم يُستهلك من الدُفعات الأقرب انتهاء صلاحية تلقائياً (إرشاد الاستهلاك)
    if (delta < 0) {
      const qty = -delta;
      setInventoryBatches((prev) => {
        const lots = prev
          .filter((b) => b.branchId === branchId && b.rawMaterialId === rawMaterialId && b.remainingQty > 1e-9 && (!batchInfo?.batchNumber || b.batchNumber === batchInfo.batchNumber))
          .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') || (a.receivedAt || '').localeCompare(b.receivedAt || ''));
        if (lots.length === 0) return prev;
        let remaining = qty;
        return prev.map((b) => {
          if (remaining <= 1e-9) return b;
          const lot = lots.find((l) => l.id === b.id);
          if (!lot) return b;
          const take = Math.min(remaining, lot.remainingQty);
          remaining -= take;
          return { ...b, remainingQty: Math.max(0, Number((b.remainingQty - take).toFixed(4))) };
        });
      });
    }
    setInventory((prev) => {
      const idx = prev.findIndex((i) => i.branchId === branchId && i.rawMaterialId === rawMaterialId);
      const next = [...prev];
      if (idx >= 0) {
        next[idx] = { ...next[idx], quantity: next[idx].quantity + delta, lastUpdated: today(), ...(batchInfo?.batchNumber ? { batchNumber: batchInfo.batchNumber } : {}), ...(batchInfo?.expiryDate ? { expiryDate: batchInfo.expiryDate } : {}) };
      } else {
        next.push({ id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, branchId, rawMaterialId, quantity: delta, lastUpdated: today(), batchNumber: batchInfo?.batchNumber, expiryDate: batchInfo?.expiryDate });
      }
      return next;
    });
    if (Math.abs(delta) > 1e-9) {
      setInventoryMovements((prev) => [
        { id: `mv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString(), branchId, rawMaterialId, delta: Math.round(delta * 10000) / 10000, type: reason?.type || 'تسوية', ref: reason?.ref },
        ...prev,
      ].slice(0, 5000));
    }
  };

  // كمية مكوّن وصفة (بوحدة التداول: لتر/كغم...) محوَّلة إلى وحدات المخزون الفعلية قبل الخصم
  const recipeStockQty = (matId: string, tradeQty: number) => tradeToStock(tradeQty, rawMaterials.find((m) => m.id === matId));

  // ---- دفعات الاستلام وترتيب الاستهلاك FEFO (الأقرب صلاحية أولاً) ----
  const addInventoryBatches = (grnId: string, branchId: string, items: GoodsReceiptItem[]) => {
    setInventoryBatches((prev) => {
      const next = [...prev];
      items.forEach((item) => {
        if (!item.batchNumber) return;
        next.push({
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          rawMaterialId: item.rawMaterialId,
          branchId,
          grnId,
          receivedQty: item.quantityReceived,
          remainingQty: item.quantityReceived,
          receivedAt: new Date().toISOString(),
          unitPrice: item.unitPrice,
        });
      });
      return next;
    });
  };

  // استهلاك دفعة (خصم من الرصيد المتبقي) — يُستخدم عند السحب من دفعة محددة
  const consumeInventoryBatch = (batchId: string, qty: number) => {
    setInventoryBatches((prev) => prev.map((b) => (b.id === batchId ? { ...b, remainingQty: Math.max(0, Number((b.remainingQty - qty).toFixed(4))) } : b)));
  };

  // دفع المواد الفعّالة فقط (باقي كمية > 0) لمنطقة/صنف، مرتبة FEFO: الأقرب انتهاء صلاحية
  const getFefoBatches = (branchId?: string, rawMaterialId?: string): InventoryBatch[] =>
    inventoryBatches
      .filter((b) => b.remainingQty > 1e-9 && (!branchId || b.branchId === branchId) && (!rawMaterialId || b.rawMaterialId === rawMaterialId))
      .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999') || (a.receivedAt || '').localeCompare(b.receivedAt || ''));

  // تنبيه الصلاحية: دفعات تنتهي خلال n أيام، والدُفعات منتهية الصلاحية (لم تُستهلك)
  const expiringBatches = (days: number): { expired: InventoryBatch[]; soon: InventoryBatch[] } => {
    const now = Date.now();
    const d = days * 86400000;
    const soon: InventoryBatch[] = [];
    const expired: InventoryBatch[] = [];
    inventoryBatches.forEach((b) => {
      if (b.remainingQty <= 1e-9 || !b.expiryDate) return;
      const diff = new Date(b.expiryDate).getTime() - now;
      if (diff < 0) expired.push(b);
      else if (diff <= d) soon.push(b);
    });
    return { expired, soon };
  };

  return {
    inventory, setInventory, inventoryBatches, setInventoryBatches, inventoryMovements, setInventoryMovements,
    adjustInventory, recipeStockQty, addInventoryBatches, consumeInventoryBatch, getFefoBatches, expiringBatches,
  };
};
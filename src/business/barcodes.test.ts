import { describe, it, expect } from 'vitest';
import { canAddBarcode, setPrimary, upsertBarcode, barcodeInUseByOther } from '../business/barcodes';
import type { MaterialBarcode } from '../types/inventory';

const bc = (over: Partial<MaterialBarcode> = {}): MaterialBarcode => ({
  id: over.id || `mb-${Math.random()}`,
  rawMaterialId: 'm1',
  barcode: over.barcode || '6291004004624',
  packagingLevel: 'unit',
  barcodeType: 'EAN13',
  isPrimary: over.isPrimary ?? false,
  notes: '',
  ...over,
});

describe('barcodes — باركودات المواد', () => {
  it('canAddBarcode: يرفض الفارغ', () => {
    expect(canAddBarcode([], '', 'm1').ok).toBe(false);
    expect(canAddBarcode([], '  ', 'm1').ok).toBe(false);
  });

  it('canAddBarcode: يرفض تكرار نفس المادة', () => {
    const list = [bc({ id: 'a', barcode: '111' })];
    const r = canAddBarcode(list, '111', 'm1');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('مسجل');
  });

  it('canAddBarcode: يسمح بنفس الرقم لمادة مختلفة او رقم جديد', () => {
    expect(canAddBarcode([bc({ id: 'a', barcode: '111' })], '111', 'm2').ok).toBe(true);
    expect(canAddBarcode([], '222', 'm1').ok).toBe(true);
  });

  it('setPrimary: تفعيل واحد يلغي كل الأساسيات الأخرى لنفس المادة', () => {
    const list = [bc({ id: 'a', isPrimary: true }), bc({ id: 'b' })];
    const out = setPrimary(list, 'b', true);
    expect(out.find((b) => b.id === 'a')?.isPrimary).toBe(false);
    expect(out.find((b) => b.id === 'b')?.isPrimary).toBe(true);
  });

  it('setPrimary: لا يمس باركودات مواد أخرى', () => {
    const other = bc({ id: 'z', rawMaterialId: 'm2', isPrimary: true });
    const list = [bc({ id: 'a', isPrimary: true }), other];
    const out = setPrimary(list, 'a', true); // re-affirm
    expect(out.find((b) => b.id === 'z')?.isPrimary).toBe(true);
  });

  it('setPrimary: إلغاء الأساسية يُفعل أول بديل متاح', () => {
    const list = [bc({ id: 'a', isPrimary: true }), bc({ id: 'b' })];
    const out = setPrimary(list, 'a', false);
    expect(out.find((b) => b.id === 'a')?.isPrimary).toBe(false);
    expect(out.find((b) => b.id === 'b')?.isPrimary).toBe(true);
  });

  it('upsertBarcode: عند الإضافة كأساسي، يُلغي الأساسي القائم', () => {
    const list = [bc({ id: 'a', isPrimary: true })];
    const out = upsertBarcode(list, { rawMaterialId: 'm1', barcode: '999', isPrimary: true });
    expect(out.find((b) => b.barcode === '999')?.isPrimary).toBe(true);
    expect(out.find((b) => b.id === 'a')?.isPrimary).toBe(false);
  });

  it('barcodeInUseByOther: يعيد المنافس من مادة أخرى فقط', () => {
    const a = bc({ id: 'a', barcode: '123', rawMaterialId: 'm1' });
    const b = bc({ id: 'b', barcode: '123', rawMaterialId: 'm2' });
    expect(barcodeInUseByOther([a, b], '123', 'b')).toBe(a);
    expect(barcodeInUseByOther([a, b], '123', 'a')).toBe(b);
    expect(barcodeInUseByOther([a, b], '00', 'a')).toBeUndefined();
  });
});
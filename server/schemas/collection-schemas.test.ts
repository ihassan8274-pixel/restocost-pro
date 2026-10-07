// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { COLLECTION_SCHEMAS, validateCollectionBody } from './collection-schemas.mjs';

describe('Zod validation for collections', () => {
  describe('GrnSchema', () => {
    it('accepts valid GRN with all money fields', () => {
      const validGrn = {
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: 1500.5,
        vatRate: 0.15,
        vatAmount: 225.075,
        items: [
          { rawMaterialId: 'rm1', quantityReceived: 10, unitPrice: 100, lineTotal: 1000 },
          { rawMaterialId: 'rm2', quantityReceived: 5, unitPrice: 100, lineTotal: 500 },
        ],
      };
      const result = COLLECTION_SCHEMAS.rcerp_grn.safeParse([validGrn]);
      expect(result.success).toBe(true);
    });

    it('rejects negative totalAmount', () => {
      const invalid = {
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: -100,
        items: [{ rawMaterialId: 'rm1', quantityReceived: 1, unitPrice: 100, lineTotal: 100 }],
      };
      const result = COLLECTION_SCHEMAS.rcerp_grn.safeParse([invalid]);
      expect(result.success).toBe(false);
    });

    it('rejects string totalAmount', () => {
      const invalid = {
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: '1500',
        items: [{ rawMaterialId: 'rm1', quantityReceived: 1, unitPrice: 100, lineTotal: 100 }],
      };
      const result = COLLECTION_SCHEMAS.rcerp_grn.safeParse([invalid]);
      expect(result.success).toBe(false);
    });

    it('rejects missing items', () => {
      const invalid = {
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: 1500,
        items: [],
      };
      const result = COLLECTION_SCHEMAS.rcerp_grn.safeParse([invalid]);
      expect(result.success).toBe(false);
    });

    it('rejects item with negative quantity', () => {
      const invalid = {
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: 1500,
        items: [{ rawMaterialId: 'rm1', quantityReceived: -5, unitPrice: 100, lineTotal: 100 }],
      };
      const result = COLLECTION_SCHEMAS.rcerp_grn.safeParse([invalid]);
      expect(result.success).toBe(false);
    });
  });

  describe('InventoryMovementSchema', () => {
    it('accepts negative delta for outgoing', () => {
      const valid = {
        rawMaterialId: 'rm1',
        delta: -50,
        type: 'تسوية',
        branchId: 'b1',
        date: '2026-10-06',
      };
      const result = COLLECTION_SCHEMAS.rcerp_inventory_movements.safeParse([valid]);
      expect(result.success).toBe(true);
    });

    it('rejects invalid type enum', () => {
      const invalid = {
        rawMaterialId: 'rm1',
        delta: 10,
        type: 'نوع غير موجود',
        branchId: 'b1',
        date: '2026-10-06',
      };
      const result = COLLECTION_SCHEMAS.rcerp_inventory_movements.safeParse([invalid]);
      expect(result.success).toBe(false);
    });
  });

  describe('PurchaseOrderSchema', () => {
    it('accepts valid PO', () => {
      const valid = {
        poNumber: 'PO-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        orderDate: '2026-10-06',
        expectedDate: '2026-10-10',
        items: [{ rawMaterialId: 'rm1', quantity: 100, unitPrice: 50 }],
      };
      const result = COLLECTION_SCHEMAS.rcerp_purchase_orders.safeParse([valid]);
      expect(result.success).toBe(true);
    });
  });

  describe('validateCollectionBody', () => {
    it('returns success for valid GRN', () => {
      const body = [{
        grnNumber: 'GRN-001',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: 1500,
        items: [{ rawMaterialId: 'rm1', quantityReceived: 10, unitPrice: 100, lineTotal: 1000 }],
      }];
      const result = validateCollectionBody('rcerp_grn', body);
      expect(result.success).toBe(true);
      expect(result.data[0].totalAmount).toBe(1500);
    });

    it('drops the invalid record but keeps the rest of the batch', () => {
      // القرار: "filter, never reject whole batch" — دفعة فيها سجل فاسد
      // تنجح بـ200 والسجل الفاسد يُستبعد ويُبلَّغ عنه، لا أن تُرفض كلها
      // (الرفض الكامل كان سبب حلقة الـ400 اللانهائية).
      const good = {
        id: 'grn-a',
        grnNumber: 'GRN-002',
        supplierId: 'sup-1',
        branchId: 'b1',
        date: '2026-10-06',
        totalAmount: 200,
        items: [{ rawMaterialId: 'rm1', quantityReceived: 2, unitPrice: 100, lineTotal: 200 }],
      };
      const bad = { ...good, id: 'grn-b', grnNumber: 'GRN-003', totalAmount: -100 };
      const result = validateCollectionBody('rcerp_grn', [good, bad]);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].grnNumber).toBe('GRN-002');
      expect(result.dropped ?? []).toHaveLength(1);
      expect(result.dropped?.[0]?.id).toBe('grn-b');
    });

    it('rejects only when the body itself is structurally wrong', () => {
      // ليس مصفوفة أصلاً — خلل في الطلب، لا في البيانات → 400 منطقي.
      const result = validateCollectionBody('rcerp_grn', { not: 'an array' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('passes through for unknown collection', () => {
      const body = { any: 'data' };
      const result = validateCollectionBody('unknown_collection', body);
      expect(result.success).toBe(true);
      expect(result.data).toBe(body);
    });
  });

  describe('EmployeeSchema', () => {
    it('accepts valid employee', () => {
      const valid = {
        empCode: 'EMP-001',
        nameAr: 'أحمد محمد',
        branchId: 'b1',
        role: 'chef',
        hireDate: '2026-01-01',
        baseSalary: 5000,
      };
      const result = COLLECTION_SCHEMAS.rcerp_employees.safeParse([valid]);
      expect(result.success).toBe(true);
    });

    it('rejects negative salary', () => {
      const invalid = {
        empCode: 'EMP-001',
        nameAr: 'أحمد',
        branchId: 'b1',
        role: 'chef',
        hireDate: '2026-01-01',
        baseSalary: -1000,
      };
      const result = COLLECTION_SCHEMAS.rcerp_employees.safeParse([invalid]);
      expect(result.success).toBe(false);
    });
  });

  describe('SupplierSchema', () => {
    it('accepts valid supplier', () => {
      const valid = {
        nameAr: 'مورد الاختبار',
        email: 'test@supplier.com',
        phone: '0501234567',
      };
      const result = COLLECTION_SCHEMAS.rcerp_suppliers.safeParse([valid]);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalid = {
        nameAr: 'مورد',
        email: 'not-an-email',
      };
      const result = COLLECTION_SCHEMAS.rcerp_suppliers.safeParse([invalid]);
      expect(result.success).toBe(false);
    });
  });

  describe('BranchSchema', () => {
    it('accepts valid branch', () => {
      const valid = { code: 'B01', nameAr: 'فرع الرياض' };
      const result = COLLECTION_SCHEMAS.rcerp_branches.safeParse([valid]);
      expect(result.success).toBe(true);
    });
  });
});
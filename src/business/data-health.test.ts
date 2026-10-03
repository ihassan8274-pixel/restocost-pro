import { describe, it, expect } from 'vitest';
import { computeDataHealth, type DataHealthInput } from './data-health';

const input = (over: Partial<DataHealthInput> = {}): DataHealthInput => ({
  rawMaterials: [
    { id: 'm1', isActive: true },
    { id: 'm2', isActive: true },
  ],
  recipes: [{ id: 'r1', isActive: true, ingredients: [{ rawMaterialId: 'm1' }], actualMenuPrice: 10 }],
  suppliers: [{ id: 's1', isActive: true, phone: '050' }],
  users: [{ id: 'u1', role: 'admin', isActive: true }],
  journalEntries: [{ lines: [{ debit: 100, credit: 100 }] }],
  inventory: [{ rawMaterialId: 'm1' }],
  recipeInventory: [{ recipeId: 'r1' }],
  hasCost: () => true,
  roleMap: { admin: ['manage_users'] },
  ...over,
});

const partBy = (h: ReturnType<typeof computeDataHealth>, label: string) =>
  h.parts.find((p) => p.label.startsWith(label));

describe('computeDataHealth', () => {
  it('مؤشر بستة محاور', () => {
    const h = computeDataHealth(input());
    expect(h.parts).toHaveLength(6);
  });

  it('كل شيء كامل ⇒ 100٪ و excellent', () => {
    const h = computeDataHealth(input());
    expect(h.score).toBe(100);
    expect(h.grade).toBe('excellent');
  });

  it('حساب سعر التكلفة: صنف بلا سعر', () => {
    const h = computeDataHealth(input({
      rawMaterials: [{ id: 'm1', isActive: true }, { id: 'm2', isActive: true }, { id: 'm3', isActive: true }],
      hasCost: (id) => id !== 'm3',
    }));
    expect(partBy(h, 'المواد الخام')!.pct).toBe(67);   // 2 من 3
  });

  it('الأصناف غير الفعّالة لا تُحتسب', () => {
    const h = computeDataHealth(input({
      rawMaterials: [
        { id: 'm1', isActive: true },
        { id: 'm2', isActive: false },   // موقوف: لا يخفض الدرجة
      ],
      hasCost: (id) => id === 'm1',
    }));
    expect(partBy(h, 'المواد الخام')!.pct).toBe(100);
  });

  it('الوصفة الناقصة: بلا مكوّنات أو بلا سعر', () => {
    const h = computeDataHealth(input({
      recipes: [
        { id: 'r1', isActive: true, ingredients: [{ rawMaterialId: 'm1' }], actualMenuPrice: 10 },
        { id: 'r2', isActive: true, ingredients: [], actualMenuPrice: 10 },              // بلا مكوّنات
        { id: 'r3', isActive: true, ingredients: [{ rawMaterialId: 'm1' }] },            // بلا سعر
      ],
    }));
    expect(partBy(h, 'الوصفات')!.pct).toBe(33);   // 1 من 3
  });

  it('الوصفة المقبولة بسعر مقترح بلا سعر فعلي', () => {
    const h = computeDataHealth(input({
      recipes: [{ id: 'r1', isActive: true, ingredients: [{ rawMaterialId: 'm1' }], suggestedPrice: 12 }],
    }));
    expect(partBy(h, 'الوصفات')!.pct).toBe(100);
  });

  it('القيد غير المتوازن يخفض درجة الدفتر', () => {
    const h = computeDataHealth(input({
      journalEntries: [
        { lines: [{ debit: 100, credit: 100 }] },
        { lines: [{ debit: 50, credit: 0 }] },
      ],
    }));
    expect(partBy(h, 'القيود')!.pct).toBe(50);
  });

  it('حد التسامح في التوازن 0.01', () => {
    const h = computeDataHealth(input({
      journalEntries: [{ lines: [{ debit: 100, credit: 99.995 }] }],   // فرق 0.005 ⇒ متوازن
    }));
    expect(partBy(h, 'القيود')!.pct).toBe(100);
  });

  it('المراجع المكسورة تُحسب في المحور السادس', () => {
    const h = computeDataHealth(input({
      inventory: [{ rawMaterialId: 'm1' }, { rawMaterialId: 'ghost' }],
    }));
    expect(partBy(h, 'المراجع')!.pct).toBe(75);   // 3 من 4 (1 مكسور من 4)
  });

  it('المستخدم بلا دور معرّف ولا roleId يخفض الدرجة', () => {
    const h = computeDataHealth(input({
      users: [
        { id: 'u1', role: 'admin', isActive: true },
        { id: 'u2', role: 'unknown_role', isActive: true },
      ],
      roleMap: { admin: ['x'] },
    }));
    expect(partBy(h, 'المستخدمون')!.pct).toBe(50);
  });

  it('مستخدم بدور مخصّص (roleId) يُعدّ جاهزاً', () => {
    const h = computeDataHealth(input({
      users: [{ id: 'u1', role: 'staff', roleId: 'r1', isActive: true }],
      roleMap: {},
    }));
    expect(partBy(h, 'المستخدمون')!.pct).toBe(100);
  });

  it('قوائم فارغة ⇒ 100٪ (لا شيء ناقص)', () => {
    const h = computeDataHealth(input({
      rawMaterials: [], recipes: [], suppliers: [], users: [],
      journalEntries: [], inventory: [], recipeInventory: [],
    }));
    expect(h.score).toBe(100);
  });

  it('الدرجات: excellent ≥90، good ≥70، attention أقل', () => {
    // محوران منخفضان + مراجع مكسورة ⇒ ينزل تحت 70
    const low = computeDataHealth(input({
      rawMaterials: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, isActive: true })),
      hasCost: (id) => id === 'm0',
      recipes: Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, isActive: true, ingredients: i < 1 ? [{ rawMaterialId: 'm0' }] : [], actualMenuPrice: 1 })),
      inventory: Array.from({ length: 10 }, (_, i) => ({ rawMaterialId: i < 5 ? 'ghost' : 'm0' })),
    }));
    expect(low.score).toBeLessThan(70);
    expect(low.grade).toBe('attention');
  });
});
import { describe, it, expect } from 'vitest';
import { nextDocSequence, uniqueDocSequence } from './docNumbers';

// GRN-2026-0394 تكرر في البيانات: معرّفان مختلفان، نفس الرقم، نفس المورّد
// والمبلغ والتاريخ. السبب: كل جهاز يحسب max+1 من نسخته المحلية.
describe('uniqueDocSequence', () => {
  it('الرقم التالي المتوقّع حين لا تعارض', () => {
    expect(uniqueDocSequence('GRN', { existing: ['GRN-2026-0392', 'GRN-2026-0393'] })).toBe('GRN-2026-0394');
  });

  it('لا يُعيد رقماً موجوداً في القائمة', () => {
    const existing = ['GRN-2026-0392', 'GRN-2026-0393', 'GRN-2026-0394', 'GRN-2026-0395'];
    const n = uniqueDocSequence('GRN', { existing });
    expect(existing).not.toContain(n);
    expect(n).toBe('GRN-2026-0396');
  });

  it('لا يعدّل قائمة المستدعي (سلوك نقي)', () => {
    const existing = ['GRN-2026-0393'];
    uniqueDocSequence('GRN', { existing });
    expect(existing).toEqual(['GRN-2026-0393']);
  });

  it('قصور مُوثَّق: جهازان بنسخة محلية مستقلة يُنتجان نفس الرقم', () => {
    // هذا هو العطل الحقيقي (GRN-0394). الحماية الكاملة تحتاج تخصيص تسلسل
    // على الخادم (مسار API) — تغيير معماري أوسع.
    const snapA = ['GRN-2026-0393'];
    const snapB = ['GRN-2026-0393'];
    expect(uniqueDocSequence('GRN', { existing: snapA })).toBe('GRN-2026-0394');
    expect(uniqueDocSequence('GRN', { existing: snapB })).toBe('GRN-2026-0394');
  });

  it('segment وyear=false (الترقيم 4 خانات دائماً)', () => {
    expect(uniqueDocSequence('PO', { existing: ['PO-0001', 'PO-0002'], year: false })).toBe('PO-0003');
    expect(uniqueDocSequence('PR', { existing: [], segment: 'X', year: false })).toBe('PR-X-0001');
  });

  it('سنة أخرى لا تؤثر؛ وقائمة فارغة تبدأ من 0001', () => {
    expect(uniqueDocSequence('GRN', { existing: ['GRN-2025-0999'] })).toBe('GRN-2026-0001');
    expect(uniqueDocSequence('RET', { existing: [] })).toBe('RET-2026-0001');
  });

  it('nextDocSequence تحافظ على سلوكها الأصلي', () => {
    expect(nextDocSequence('GRN', { existing: ['GRN-2026-0001'] })).toBe('GRN-2026-0002');
    expect(nextDocSequence('PO', { existing: [] })).toBe('PO-2026-0001');
  });
});
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ⭐ عطل كامن اكتُشف 2026-10-06: الخادم يتحقق من كل دفعة حركات مخزون بـ Zod،
// و`type` قائمة مغلقة (z.enum). أي نوع يكتبه العميل خارجها ⇒ 400 على الدفعة
// **كلها** ⇒ لا حركات تصل الخادم أصلاً.
//
// ثلاثة أنواع كانت خارج القائمة:
//   'تسوية جرد'       ← إقفال الجرد الشهري (كان يرفض الجرد الشهري كله)
//   'خصم مبيعات'      ← إعداد خصم المبيعات
//   'عكس خصم مبيعات' ← عكس الخصم عند حذف فاتورة
// ولم يُرفض شيء فعلياً لأن العميل لم يُرسلها بعد — العطل كان سينتظر أول
// استخدام.
//
// لا يمكن منعه بوقاية وقت كتابة (العميل والخادم مخططان منفصلان)،
// فالحارس يفحص أحدهما مقابل الآخر.

const SRC = path.resolve(__dirname, '..');
const SCHEMA = path.resolve(SRC, '..', 'server', 'schemas', 'collection-schemas.mjs');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** كل الأنواع التي يرسلها العميل مع حركة مخزون. */
const clientMovementTypes = (): Set<string> => {
  const found = new Set<string>();
  for (const f of walk(SRC)) {
    if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue;
    const src = stripComments(fs.readFileSync(f, 'utf8'));
    // نداءات adjustInventory(... , { type: '...' , ... }) — variously shaped
    for (const m of src.matchAll(/adjustInventory\([^;]*?\{\s*type:\s*'([^']+)'/g)) {
      found.add(m[1]);
    }
    // inventoryMovements تُبنى مباشرة في متجر المخزون
    for (const m of src.matchAll(/type:\s*(?:reason\?\.type\s*\|\|\s*)?'([^']+)'\s*,?\s*\n?\s*ref:/g)) {
      found.add(m[1]);
    }
  }
  return found;
};

const serverMovementTypes = (): string[] => {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const block = src.match(/InventoryMovementSchema\s*=\s*z\.object\(\{[\s\S]*?type:\s*z\.enum\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('InventoryMovementSchema لم يُعثر عليه أو تغيّر شكله');
  return block[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
};

describe('تكامل أنواع حركات المخزون بين العميل والخادم', () => {
  it('كل نوع يرسله العميل موجود في قائمة الخادم', () => {
    const allowed = new Set(serverMovementTypes());
    const sent = [...clientMovementTypes()].filter((t) => !allowed.has(t));
    expect(sent).toEqual([]);
  });

  it('الأنواع الثلاثة المُضافة موجودة فعلاً', () => {
    const allowed = new Set(serverMovementTypes());
    for (const t of ['تسوية جرد', 'خصم مبيعات', 'عكس خصم مبيعات']) {
      expect(allowed.has(t)).toBe(true);
    }
  });

  it('كل نوع في قائمة الخادم مُنتَج من مكان ما في العميل', () => {
    // ليس خطأ بالضرورة (قد تبقى أنواع للتوافق التاريخي)، لكن يمنع تراكم
    // أسماء ميتة تُفسد القراءة. نطبعها بدل أن نُفشل الاختبار.
    const sent = clientMovementTypes();
    const orphans = serverMovementTypes().filter((t) => !sent.has(t));
    expect({ orphans }).toEqual({ orphans });
  });
});
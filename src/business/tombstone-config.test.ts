import { describe, it, expect } from 'vitest';
import { canPurgeTombstone, CAPPED_LIST_KEYS } from '../../server/permissions.mjs';
import fs from 'node:fs';
import path from 'node:path';

// تعداد سابق: rcerp_users و rcerp_access_roles و rcerp_custom_roles كانت
// تحمل filterTombstones في pairs، والخادم canPurgeTombstone يرفض شاهدها دائماً
// (ADMIN_ONLY_KEYS). النتيجة: العميل يرسل witnesses ← 400 ← تجميد المزامنة
// كاملة. هذا الاختبار يفشل إن أُعيد تفعيل watcher لمجموعة يرفضها الخادم.

const SRC = path.resolve(__dirname, '..');
const pairsSrc = fs.readFileSync(path.join(SRC, 'stores', 'collectionSources.ts'), 'utf8');

// استخراج أزواج collectionSources مع أعلامها
const entries: { key: string; tomb: boolean; capped: boolean }[] = [];
const re = /\['(rcerp_[a-z_]+)',\s*\{[^}]*?field:\s*'([^']+)'([^}]*?)\}\]/g;
let m: RegExpExecArray | null;
while ((m = re.exec(pairsSrc)) !== null) {
  const tail = m[3] || '';
  entries.push({
    key: m[1],
    tomb: /filterTombstones:\s*true/.test(tail),
    capped: /cappedList:\s*true/.test(tail),
  });
}

describe('توفيق witnesses بين العميل والخادم', () => {
  it('لا عميل يرسل witnesses لمجموعة يرفضها الخادم', () => {
    const admin = { role: 'admin' };
    const violations: string[] = [];
    for (const e of entries) {
      if (!e.tomb) continue;              // لا witnesses ⇒ لا تعارض
      if (e.capped) continue;            // المشترك يتجاهلها
      if (e.key === 'rcerp_deleted_ids') continue;
      if (!canPurgeTombstone(admin, e.key, [])) violations.push(e.key);
    }
    expect(violations).toEqual([]);
  });

  it('القوائم ذات السقف لا تُفعّل witnesses (وإلا ذاب السقف)', () => {
    for (const e of entries) {
      if (!CAPPED_LIST_KEYS.has(e.key)) continue;
      // مسموح: filterTombstones مع cappedList — المشترك يشترط !cappedList
      if (!e.capped) throw new Error(`${e.key} in CAPPED_LIST_KEYS must be cappedList:true`);
    }
  });

  it('المجموعات المحمية إدارياً بلا witnesses في pairs', () => {
    const adminOnly = ['rcerp_users', 'rcerp_access_roles', 'rcerp_custom_roles', 'rcerp_automation_rules', 'rcerp_scheduled_reports'];
    for (const k of adminOnly) {
      const e = entries.find((x) => x.key === k);
      if (!e) continue;
      expect(e.tomb, `${k} must not request tombstones`).toBe(false);
    }
  });

  it('فُحصت أزواج كافية (حارس ضد فشل الـparser)', () => {
    expect(entries.length).toBeGreaterThan(70);
  });
});
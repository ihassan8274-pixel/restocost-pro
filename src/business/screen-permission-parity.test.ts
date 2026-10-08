import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canReadCollection, ROLE_PERMISSIONS, readableKeysFor } from '../../server/permissions.mjs';

// إصلاح بوابة القراءة (canReadCollection) أنتج شاشات فارغة: دور يملك صلاحية
// عرض كيان في القائمة (navigation.ts) لكن بياناته محجوبة (chef مع wastage
// وintake_inbox وhaccp وmonthly_inventory، وwaiter مع tasks).
// القاعدة الآن: من يملك صلاحية الشاشة يقرأ بياناتها (readableKeysFor).

const SRC = path.resolve(__dirname, '..');
const nav = fs.readFileSync(path.join(SRC, 'navigation.ts'), 'utf8');

// أي شاشة مرئية لدور، مع المفتاح الذي تقرأه
const SCREEN_KEY: Record<string, string> = {
  tasks: 'rcerp_tasks',
  wastage: 'rcerp_wastage',
  haccp: 'rcerp_haccp_inspections',
  monthly_inventory: 'rcerp_monthly_inventory',
  intake_inbox: 'rcerp_intake_inbox',
  attendance: 'rcerp_attendance',
  shifts: 'rcerp_shifts',
  employees: 'rcerp_employees',
  temp_logs: 'rcerp_temp_logs',
};

// استخراج (screenId, permission) من navigation.ts
const screens: { id: string; permission: string }[] = [];
for (const m of nav.matchAll(/\{\s*id:\s*'([a-z_]+)'[^}]*?permission:\s*'([a-z_]+)'[^}]*\}/g)) {
  screens.push({ id: m[1], permission: m[2] });
}

const ROLES = ['counter', 'waiter', 'chef', 'storekeeper', 'branch_manager', 'cost_controller', 'executive', 'admin'];

describe('تطابق صلاحية الشاشة مع صلاحية قراءة بياناتها', () => {
  it('فُحص عدد كافٍ من الشاشات (حارس ضد فشل الـparser)', () => {
    expect(screens.length).toBeGreaterThan(20);
  });

  for (const role of ROLES) {
    it(`${role}: كل شاشة يراها يقرأ بياناتها`, () => {
      const perms = ROLE_PERMISSIONS[role] || [];
      const broken: string[] = [];
      for (const s of screens) {
        if (!perms.includes(s.permission)) continue;  // لا يرى الشاشة أصلاً
        const key = SCREEN_KEY[s.id];
        if (!key) continue;                           // بلا بيانات مرتبطة معروفة
        if (!canReadCollection({ role }, key, []).ok) broken.push(`${s.id}→${key}`);
      }
      expect(broken, `شاشات مرئية ببيانات محجوبة: ${broken.join(', ')}`).toEqual([]);
    });
  }

  it('chef يقرأ wastage وintake_inbox وhaccp وmonthly_inventory وtasks', () => {
    for (const k of ['rcerp_wastage', 'rcerp_intake_inbox', 'rcerp_haccp_inspections', 'rcerp_monthly_inventory', 'rcerp_tasks']) {
      expect(canReadCollection({ role: 'chef' }, k, []).ok, k).toBe(true);
    }
  });

  it('waiter يقرأ tasks (لديه view_dashboard) لكن ليس الجرد', () => {
    expect(canReadCollection({ role: 'waiter' }, 'rcerp_tasks', []).ok).toBe(true);
    expect(canReadCollection({ role: 'waiter' }, 'rcerp_daily_counts', []).ok).toBe(false);
    expect(canReadCollection({ role: 'waiter' }, 'rcerp_wastage', []).ok).toBe(false);
  });

  it('counter لا يرى ش NONE (mobile_count فقط — بلا شاشة في القائمة)', () => {
    expect(readableKeysFor('counter').has('rcerp_tasks')).toBe(false);
    expect(readableKeysFor('counter').has('rcerp_wastage')).toBe(false);
    // لكن مخزونه وجرده متاح
    expect(canReadCollection({ role: 'counter' }, 'rcerp_inventory', []).ok).toBe(true);
    expect(canReadCollection({ role: 'counter' }, 'rcerp_daily_counts', []).ok).toBe(true);
  });

  it('حاجز: ما يمسّ المال يبقى محجوباً عن chef/waiter (لم تُفتح مع قاعدة الشاشة)', () => {
    for (const role of ['chef', 'waiter', 'counter', 'storekeeper']) {
      expect(canReadCollection({ role }, 'rcerp_journal', []).ok, role).toBe(false);
      expect(canReadCollection({ role }, 'rcerp_users', []).ok, role).toBe(false);
      expect(canReadCollection({ role }, 'rcerp_access_roles', []).ok, role).toBe(false);
    }
  });
});
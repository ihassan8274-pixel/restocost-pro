import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// كان المحرك الواحد (syncEngine) موجوداً بثلاث نسخ:
//   src/context/syncEngine.ts   ←Consumer (syncStore) + الاختبار
//   src/utils/syncEngine.ts     ← لا يستورده أحد (نسخة طبق الأصل، ميتة)
//   والاختبار كان يشير لنسخة context فنجحت تعديلات نسخة context بينما runtime
//  يستخدم فعلياً هي النسخة الأخرى.
// نُقل إلى src/business/syncEngine.ts (مصدر واحد). هذا الاختبار يفشل إن
// أُنشئت نسخة ثانية في أي مكان.

const SRC = path.resolve(__dirname, '..');

// دوال المحرك — أي تعريف ثانٍ لأي منها = ازدواج
const ENGINE_EXPORTS = ['decideFlush', 'runFlushQueue', 'sortEntriesBySize', 'mergeByIdLocal'];

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'data') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(full);
  }
  return acc;
};

describe('syncEngine single source', () => {
  const files = walk(SRC);

  it('لا توجد نسخة ثانية من محرّك المزامنة', () => {
    const definers: Record<string, string[]> = {};
    for (const f of files) {
      if (f.endsWith('syncEngine.test.ts')) continue;
      const src = fs.readFileSync(f, 'utf8');
      for (const name of ENGINE_EXPORTS) {
        // تعريف = "export const name =" أو "export function name" أو "function name"
        const re = new RegExp(`(?:export\\s+)?(?:const|function|async function)\\s+${name}\\b`);
        if (re.test(src)) (definers[name] ||= []).push(path.relative(SRC, f));
      }
    }
    const problems: string[] = [];
    for (const name of ENGINE_EXPORTS) {
      const where = definers[name] || [];
      const real = where.filter((w) => !w.includes('syncEngine.ts') || w === 'business\\syncEngine.ts');
      if (where.length !== 1) {
        problems.push(`${name} معرّف في ${where.length} مواضع: ${where.join(' | ') || '(لا يوجد)'}`);
      } else if (!where[0].endsWith(`business${path.sep}syncEngine.ts`)) {
        problems.push(`${name} معرّف في ${where[0]} بدل business/syncEngine.ts`);
      }
      void real;
    }
    expect(problems).toEqual([]);
  });

  it('لا ملف ميت باسم syncEngine خارج business/', () => {
    const strays = files
      .filter((f) => path.basename(f) === 'syncEngine.ts')
      .map((f) => path.relative(SRC, f));
    expect(strays).toEqual(['business\\syncEngine.ts']);
  });

  it('المستهلكون يستوردون من المصدر الواحد', () => {
    const store = fs.readFileSync(path.join(SRC, 'stores', 'syncStore.ts'), 'utf8');
    expect(store).toContain("from '../business/syncEngine'");
    expect(store).not.toContain('context/syncEngine');
    expect(store).not.toContain('utils/syncEngine');
  });
});
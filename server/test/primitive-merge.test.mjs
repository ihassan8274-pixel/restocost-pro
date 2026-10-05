import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeById } from '../mergeCore.mjs';

test('دمج القيم النصية يحترم الشواهد (حذف دور مخصص لا يعود)', () => {
  const existing = ['مدير', 'شيف', 'كاشير'];
  const incoming = ['مدير', 'كاشير'];
  // بدون شاهد: يعود الثلاثة كاملين (اتحاد)
  assert.deepEqual(mergeById(existing, incoming), ['مدير', 'شيف', 'كاشير']);
  // مع شاهد "شيف": لا يعود
  assert.deepEqual(mergeById(existing, incoming, new Set(['شيف'])), ['مدير', 'كاشير']);
});

test('الشاهد يطابق النص لا النوع (رقم مخزَّن كنص)', () => {
  // closedMonths مخزَّنة كنصوص — لو صار شاهد بالرقم/string يجب ألا يفصلهما
  assert.deepEqual(mergeById(['2026-01', '2026-02'], ['2026-01'], new Set(['2026-02'])), ['2026-01']);
  assert.deepEqual(mergeById(['2026-01'], ['2026-02'], new Set(['2026-02'])), ['2026-01']);
});

// حساب تعبير رياضي نصّي بأمان — بلا eval.
//
// الطلب: في حقل الكمية تكتب «5*48» فيضع 240. والأسعار عند الاستلام تكون
// بالكرتون لا بالوحدة، فالحقل-use case حقيقي: «2*24.5» و«120/4» و«10+5».
//
// نستبعد eval عمداً: نصٌّ من المستخدم داخل eval = تنفيذ شيفرة عشوائية.
// البديل مُحلِّل (shunting-yard) يقبل الأرقام والعمليات والأقواس فقط،
// وأي محرف آخر يُرفض — فيتعذّر تنفيذ شيفرة مهما كان الإدخال.

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

/**
 * يقيّم تعبيراً رياضياً. يعيد null إن كان غير صالح أو قسمة على صفر.
 *supported: 12 · 5*48 · 2*24.5 · 120/4 · (10+5)*3 · 10%2
 */
export function evalArithmetic(input: string): number | null {
  const s = String(input ?? '').trim().replace(/[,\u060C]/g, '');   // فاصلة عربية/إنجليزية
  if (!s) return null;

  const tokens: (string | number)[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      // «1.2.3» أو «1..2» ليست رقماً
      if ((num.match(/\./g) || []).length > 1) return null;
      const v = parseFloat(num);
      if (!Number.isFinite(v)) return null;
      tokens.push(v);
      continue;
    }
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
    if (ch in PREC) {
      // unary: «-5» في أول الموضع أو بعد عامل
      const prev = tokens[tokens.length - 1];
      const isUnary = (ch === '-' || ch === '+') &&
        (tokens.length === 0 || prev === '(' || typeof prev !== 'number');
      tokens.push(isUnary ? 'u' + ch : ch);
      i++;
      continue;
    }
    return null;   // محرف غير معروف ⇒ رفض
  }
  if (tokens.length === 0) return null;

  // shunt: مخرجات للقيم، معاملات للمعاملات
  const out: number[] = [];
  const ops: string[] = [];
  const prec = (op: string) => (op.startsWith('u') ? 3 : PREC[op] ?? 0);
  const applyOp = (op: string) => {
    if (op.startsWith('u')) {
      const b = out.pop();
      if (b === undefined) return false;
      out.push(op === 'u-' ? -b : b);
      return true;
    }
    const b = out.pop();
    const a = out.pop();
    if (a === undefined || b === undefined) return false;
    if (op === '+') out.push(a + b);
    else if (op === '-') out.push(a - b);
    else if (op === '*') out.push(a * b);
    else if (op === '/') { if (b === 0) return false; out.push(a / b); }
    else if (op === '%') { if (b === 0) return false; out.push(a % b); }
    else return false;
    return true;
  };

  for (const t of tokens) {
    if (typeof t === 'number') { out.push(t); continue; }
    if (t === '(') { ops.push(t); continue; }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') { if (!applyOp(ops.pop()!)) return null; }
      if (!ops.length) return null;                 // قوس زائد
      ops.pop();
      continue;
    }
    // معامل
    while (ops.length && ops[ops.length - 1] !== '(' && prec(ops[ops.length - 1]) >= prec(t)) {
      if (!applyOp(ops.pop()!)) return null;
    }
    ops.push(t);
  }
  while (ops.length) { if (!applyOp(ops.pop()!)) return null; }

  if (out.length !== 1) return null;
  const v = out[0];
  return Number.isFinite(v) ? v : null;
}

/** هل يبدو النص تعبيراً حسابياً (أي يحتوي عملية)؟ */
export const hasOperator = (s: string) => /[+\-*/%()]/.test(String(s ?? '').trim().replace(/^-/, ''));

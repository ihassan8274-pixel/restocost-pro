// server/record-guard.mjs — حارس شكل السجلات عند حدّ الشبكة.
//
// لماذا هذا الملف:
// نقطة الكتابة الوحيدة لكل بيانات الأعمال هي POST /api/collections/:key.
// كان أي عميل يستطيع دفع أي شكل: نصاً بدل رقم في حقل مبلغ، أو سجلاً بلا
// معرّف، أو مفتاح __proto__. والأخطر حسابياً: مبلغ يأتي نصاً "5000" فتصبح
//   "5000" + 100 === "500010"
// فيتلف المبلغ بصمت في سجل الحركات، ولا يرمي خطأً ولا يظهر في أي تقرير.
//
// قاعدة التصميم الحاسمة: نُفلتر ولا نرفض.
// رفض دفعة كاملة (400) يوقف مزامنة كل المجموعات — وقد أوقفت سابقاً حفظ
// الجرد نهائياً بسبب معرّف واحد رُفض. لذلك: السجل الفاسد يُسقَط وحده،
// ويُبلَّغ العميل بمعرّفه ليستبعده محلياً بدل إعادة إرساله إلى الأبد.
//
// كل القواعد هنا دوال خالصة بلا I/O، تُختبر وحدها (node --test).

// حقول المال: تُطبَّق عليها القاعدة العددية فقط. الاسم هو المُحدِّد
// (heuristic) وليست المخطط، لذا لا نرفض السجل أبداً بسببها — نُصلح أو
// نُسقط الحقل ونُبلّغ. رفض السجل الكامل لخقل نقدي يُفقد مستنداً كاملاً
// بأصنافه بسبب حقل واحد.
const MONEY = new Set([
  'amount', 'total', 'subtotal', 'totalAmount', 'totalValue', 'totalConsumedValue',
  'price', 'unitPrice', 'unitCost', 'cost', 'lineTotal', 'revenue', 'profit',
  'vat', 'vatAmount', 'tax', 'taxAmount', 'discount', 'balance', 'salary',
  'paid', 'paidAmount', 'costValue', 'sellingPrice', 'purchaseUnitPrice',
]);

// مفاتيح تُلوي سلسلة النماذج الأولية (prototype pollution). وجودها كمفتاح
// خاص في JSON يعني أن كوداً يعمل {...سجل} أو Object.assign سيغيّر
// Object.prototype لكل الطلب لا هذا السجل وحده.
const POISON = new Set(['__proto__', 'constructor', 'prototype']);

// نص يطابق رقماً بصرامة: بلافراغ ولا أرقام عربية ولا NaN ولا Infinity.
// أضيق من Number() عمداً: Number('')=0 و Number(' ')=0 و Number('1e9')=9e8 —
// لا نريد تحويل نص لا يشبه مبلغاً إلى مبلغ.
const NUMERIC_TEXT = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

const isPlainish = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const hasId = (v) => isPlainish(v) && v.id !== undefined && v.id !== null && String(v.id) !== '';

/**
 * ينظّف مصفوفة سجلات قادمة من العميل.
 * @returns {{ clean: any[], rejected: {id: string, reason: string}[], coerced: number }}
 *   rejected: معرّفات سُقطت مع سببها (pour le journal de sauvegarde)
 *   coerced: عدد الحقول المالية التي حُوِّلت نصاً ← رقماً
 */
export const sanitizeRecords = (records) => {
  if (!Array.isArray(records)) {
    return { clean: records, rejected: [], coerced: 0 };
  }

  // مصفوفة قيم بدائية (customRoles، closedMonths...): ليست سجلات، نمرّرها.
  // خلطها بسجلات ليس خطأً — mergeById يحسمها، والتدخل هنا يضرّ.
  if (!records.some((r) => isPlainish(r))) {
    return { clean: records, rejected: [], coerced: 0 };
  }

  const clean = [];
  const rejected = [];
  let coerced = 0;

  for (const rec of records) {
    // داخل مصفوفة سجلات: النص/الرقم ليس سجلاً — وأسفل الشيفرة
    // (grn.items.map) يسقط السجل الصامت ثم ينهار التطبيق. نُسقطه هنا ونُبلّغ.
    if (!isPlainish(rec)) {
      rejected.push({ id: String(rec).slice(0, 60), reason: 'not-an-object' });
      continue;
    }
    // بلا معرّف لا يدخل الدمج أصلاً (mergeById يسقطه) — نجعله مرئياً بدل أن يكون مفقوداً بصمت
    if (!hasId(rec)) {
      rejected.push({ id: '(بلا معرّف)', reason: 'missing-id' });
      continue;
    }

    // نسخة نظيفة: ننسخ الحقول الصريحة فقط، فتختفي مفاتيح التسميمChronologically.
    const out = {};
    for (const [k, v] of Object.entries(rec)) {
      if (POISON.has(k)) continue;

      if (MONEY.has(k)) {
        if (typeof v === 'number') {
          // لا يمكن تمثيل قسمة على صفر أو ما لا نهاية في JSON أصلاً: يُسقَط الحقل
          if (!Number.isFinite(v)) continue;
          out[k] = v;
          continue;
        }
        if (typeof v === 'string') {
          const t = v.trim();
          if (t === '') continue;                 // نص فارغ = لا قيمة
          if (NUMERIC_TEXT.test(t)) { out[k] = Number(t); coerced++; continue; }
          continue;                                 // ليس مبلغاً — نُسقطه ونُبلّغ
        }
        if (v === null || v === undefined) continue; // لا قيمة
        continue;                                    // منطقي/كائن/مصفوفة في حقل مبلغ — يُسقَط
      }

      out[k] = v;
    }
    clean.push(out);
  }

  return { clean, rejected, coerced };
};

export const isMoneyKey = (k) => MONEY.has(k);
export const moneyKeyCount = () => MONEY.size;

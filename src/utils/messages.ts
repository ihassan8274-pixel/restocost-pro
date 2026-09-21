// رسائل تلقائية (واتساب/بريد/نسخ) للموردين والعملاء.
// الروابط تفتح التطبيق مباشرة (wa.me / mailto) دون الحاجة لأي بوابات خارجية.

export interface MsgItem {
  name: string;
  qty: number;
  unit: string;
}

export const waLink = (phone: string, text: string): string => {
  const digits = (phone || '').replace(/[^\d]/g, '');
  if (!digits) return '#';
  const intl = digits.length <= 9 ? `966${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
};

export const mailLink = (email: string, subject: string, body: string): string =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const copyText = async (text: string): Promise<void> => {
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
};

const fmtN = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export const poMessage = (supplierName: string, poNumber: string, orderDate: string, expectedDate: string, items: MsgItem[], total: number): string =>
  `عزيزنا المورد ${supplierName}،
نود تأكيد طلب شراء رقم (${poNumber}) بتاريخ ${orderDate} والمتوقع تسليمه ${expectedDate}.
البنود:
${items.map((i) => `• ${i.name}: ${fmtN(i.qty)} ${i.unit}`).join('\n')}
إجمالي الطلب: ${fmtN(total)} ر.س
يرجى تأكيد استلام الطلب وتأكيد موعد التسليم. مع الشكر، إدارة المشتريات.`;

export const overdueInvoiceMessage = (customerName: string, invoiceNumber: string, amount: number, dueDate: string, days: number): string =>
  `عزيزنا ${customerName}،
نود تذكيركم بفاتورة رقم (${invoiceNumber}) بقيمة ${fmtN(amount)} ر.س المستحقة بتاريخ ${dueDate} (متأخرة ${days} يوم).
يرجى ترتيب السداد في أقرب وقت. شاكرين لكم، إدارة الحسابات.`;

export const reservationMessage = (customerName: string, reservationNumber: string, date: string, time: string, guests: number, branchName: string): string =>
  `عزيزنا ${customerName}،
تأكيد حجزكم رقم (${reservationNumber}) يوم ${date} الساعة ${time} لعدد ${guests} ضيوف في ${branchName}.
نتشرف باستقبالكم، ويمكنكم التواصل معنا لأي تعديل.`;

export const lowStockMessage = (supplierName: string, items: MsgItem[]): string =>
  `عزيزنا المورد ${supplierName}،
نحيطكم علماً بأن المخزون انخفض عن الحد الأدنى للأصناف التالية ونحتاج تجديدها:
${items.map((i) => `• ${i.name}: نحتاج ${fmtN(i.qty)} ${i.unit}`).join('\n')}
يرجى تجهيز الكميات وإبلاغنا بموعد التسليم. مع الشكر، إدارة المشتريات.`;
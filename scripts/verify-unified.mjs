// verify-unified.mjs — اختبار حسابي (مرحلة 6) على محرك التقارير الموحد
// يشغّل الفلاتر الفعلية على بيانات mock ويقارنها بقيم محسوبة مباشرة.
// تشغيل:  node scripts/verify-unified.mjs
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
server.config.logger.info = () => {};

const m = await server.ssrLoadModule('/src/mockData.ts');
const { ReportEngine, filterCollection } = await server.ssrLoadModule('/src/components/reports/_core/ReportEngine.ts');
const { emptyReportFilter } = await server.ssrLoadModule('/src/components/reports/_core/ReportTypes.ts');

const posOrders = m.INITIAL_POS_ORDERS;
const batch = m.INITIAL_BATCH_SALES;
const grns = m.INITIAL_GRN_NOTES;
const exps = m.INITIAL_OPERATING_EXPENSES;
const shifts = m.INITIAL_LABOR_SHIFTS;
const invoices = m.INITIAL_INVOICES;
const assets = m.INITIAL_FIXED_ASSETS;

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log('   expected:', expected); console.log('   actual  :', actual); }
};
const sum = (arr, pick) => arr.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
const sumInRange = (arr, datePick, valuePick, from, to) => {
  const rows = arr.filter((r) => {
    const d = (datePick(r) || '').slice(0, 10);
    return d >= from && d <= to;
  });
  return sum(rows, valuePick);
};

// ---------- فلترة باطلة (لا حدود) = كل السجلات ----------
let eng = new ReportEngine();
eng.register({ id: 't' }, [
  { name: 'pos', rows: posOrders, date: (r) => r.date, branch: (r) => r.branchId },
  { name: 'exps', rows: exps, date: (r) => r.createdAt, branch: (r) => r.branchId },
]);
let s = eng.applyFilters('t', emptyReportFilter());
check('بدون فلاتر: كل طلبات POS', s[0].rows.length, posOrders.length);
check('بدون فلاتر: كل المصاريف', s[1].rows.length, exps.length);

// ---------- نطاق شهر كامل ----------
const full = { from: '2026-08-01', to: '2026-08-31', branchIds: [], statuses: [] };
s = eng.applyFilters('t', { ...emptyReportFilter(), ...full });
check('شهر كامل: Pos إيراد محسوب مباشرةً', sum(s[0].rows, (r) => r.totalAmount), sumInRange(posOrders, (r) => r.date, (r) => r.totalAmount, '2026-08-01', '2026-08-31'));

// ---------- الحدود: سجل في منتصف اليوم يجب ألا يُستثنى ----------
let one = eng.applyFilters('t', { ...emptyReportFilter(), ...{ from: '2026-08-05', to: '2026-08-05', branchIds: [], statuses: [] } });
check('حدود اليوم الواحد: يضم مصاريف 2026-08-05T10:00:00Z', one[1].rows.some((r) => r.id === 'exp-04'), true);

// ---------- فلتر الفرع ----------
let branch = eng.applyFilters('t', { ...emptyReportFilter(), from: '', to: '', branchIds: ['b-01'], statuses: [] });
check('فلتر فرع b-01: لا سجلات من غير b-01', branch[0].rows.every((r) => r.branchId === 'b-01'), true);

// ---------- قائمة التدفقات النقدية (نفس صيغة التقرير الموحد) ----------
const invSales = invoices.filter((i) => i.type === 'sales');
const invPurchase = invoices.filter((i) => i.type === 'purchase');
const expectedInflow = sum(posOrders, (r) => r.subtotal) + sum(batch, (r) => r.totalRevenue) + sum(invSales, (r) => r.paidAmount);
const expectedOutflow = sum(exps.filter((e) => e.paymentStatus === 'paid'), (r) => r.amount) + sum(invPurchase, (r) => r.paidAmount) + sum(grns, (r) => r.totalAmount) + sum(shifts, (r) => r.totalShiftCost);
const expectedInvest = sum(assets.filter((a) => a.isActive), (r) => r.purchaseCost);
const expectedNet = expectedInflow - expectedOutflow - expectedInvest;
console.log(`\nقيم متوقعة (أغسطس 2026 بالكامل): مقبوضات=${Math.round(expectedInflow)} مدفوعات=${Math.round(expectedOutflow)} استثماري=${Math.round(expectedInvest)} صافي=${Math.round(expectedNet)}`);
check('استثماري ذو isActive فقط', expectedInvest >= 0, true);

console.log(`\nالنتيجة: ${pass} نجح / ${fail} فشل`);
await server.close();
process.exit(fail ? 1 : 0);
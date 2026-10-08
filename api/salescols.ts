// Which Foodics column is "total sales"? Six candidates, six different numbers.
// Measured over the deduplicated 34 days, so the choice is explicit rather than
// assumed -- picking the wrong one shifts every report by ~9%.
import { buildIngestPlan } from './src/foodics/plan.js';

const plan = buildIngestPlan();
const s = { gross: 0, netWithVat: 0, discount: 0, totalExVat: 0, net: 0, vat: 0, qty: 0 };
let rows = 0;
for (const d of plan.deduped) {
  for (const l of d.canonical.lines) {
    if (l.isTotal) continue;
    rows++;
    s.gross += l.sales;
    s.netWithVat += l.netWithVat ?? 0;
    s.discount += l.discount ?? 0;
    s.totalExVat += l.totalExVat ?? 0;
    s.net += l.netSales ?? 0;
    s.vat += l.vat ?? 0;
    s.qty += l.qty;
  }
}

const f = (v: number) => v.toFixed(2).padStart(15);
console.log('rows: ' + rows + '   quantity: ' + s.qty.toFixed(0));
console.log('');
console.log('col #   column                                 value        what it is');
console.log('  4   ' + '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A'.padEnd(38) + f(s.gross) + '   incl VAT, BEFORE discount');
console.log('  8   ' + '\u0645\u0628\u0644\u063A \u0627\u0644\u062E\u0635\u0645'.padEnd(38) + f(s.discount) + '   discounts granted');
console.log('  6   ' + '\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0639 \u0627\u0644\u0636\u0631\u064A\u0628\u0629'.padEnd(38) + f(s.netWithVat) + '   incl VAT, AFTER discount');
console.log('  9   ' + '\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0645\u0646 \u063A\u064A\u0631 \u0636\u0631\u064A\u0628\u0629'.padEnd(38) + f(s.totalExVat) + '   excl VAT, BEFORE discount');
console.log('  7   ' + '\u0627\u0644\u0636\u0631\u0627\u0626\u0628'.padEnd(38) + f(s.vat) + '   VAT collected');
console.log(' 10   ' + '\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A'.padEnd(38) + f(s.net) + '   excl VAT, AFTER discount');
console.log('');
const ck = (a: number, b: number, label: string) =>
  console.log('  ' + (Math.abs(a - b) < 0.01 ? 'HOLDS  ' : 'FAILS  ') + label + '  (' + (a - b).toFixed(4) + ')');
ck(s.gross - s.discount, s.netWithVat, 'gross - discount = netWithVat');
ck(s.gross - s.vat, s.totalExVat, 'gross - vat      = totalExVat');
ck(s.netWithVat - s.vat, s.net, 'netWithVat - vat = net');
console.log('');
console.log('  VAT as a share of netWithVat : ' + (s.vat / s.netWithVat * 100).toFixed(2) + '%');
console.log('  discount as share of gross   : ' + (s.discount / s.gross * 100).toFixed(2) + '%');
console.log('');
console.log('  per-unit average price:');
console.log('    gross / qty       : ' + (s.gross / s.qty).toFixed(4));
console.log('    netWithVat / qty   : ' + (s.netWithVat / s.qty).toFixed(4));
console.log('    net / qty          : ' + (s.net / s.qty).toFixed(4));
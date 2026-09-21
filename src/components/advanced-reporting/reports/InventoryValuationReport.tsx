import React, { useMemo, useState } from 'react';
import { Printer, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// تقييم المخزون (Inventory Valuation)
// الهوية (مستمدّة من شاشة (valuation) في v7.0):
//   قيمة المخزون = كمية الرصيد × تكلفة الوحدة (آخر سعر استلام GRN معتمد،
//   وإلا سعر المادة القياسي/سعر شراء الوحدة) — تجميع بالفرع والتصنيف
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface CatRow {
  categoryId: string;
  categoryName: string;
  items: number;
  qty: number;
  value: number;
}

interface BranchRow {
  branchId: string;
  branchName: string;
  items: number;
  qty: number;
  value: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const InventoryValuationReport: React.FC = () => {
  const { inventory, rawMaterials, grnNotes, branches, materialCategories, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventory.map((r) => (r.lastUpdated || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [inventory]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const matById = useMemo(() => new Map(rawMaterials.map((m) => [m.id, m])), [rawMaterials]);
  const catName = useMemo(
    () => (id: string) => materialCategories.find((c) => c.key === id)?.labelAr ?? id,
    [materialCategories]
  );

  const latestCost = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) {
      if (g.status !== 'approved') continue;
      for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    }
    for (const m of rawMaterials) {
      if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    }
    return map;
  }, [grnNotes, rawMaterials]);

  const rows = useMemo(() => {
    const out: { id: string; name: string; category: string; unit: string; branchId: string; qty: number; cost: number; value: number }[] = [];
    for (const r of inventory) {
      if (periodValue && (r.lastUpdated || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) continue;
      const m = matById.get(r.rawMaterialId);
      if (!m) continue;
      const cost = latestCost.get(r.rawMaterialId) ?? 0;
      out.push({
        id: r.id,
        name: m.nameAr,
        category: m.category,
        unit: m.purchaseUnit || m.unit,
        branchId: r.branchId,
        qty: r.quantity,
        cost,
        value: r.quantity * cost,
      });
    }
    return out;
  }, [inventory, periodValue, branchFilter, matById, latestCost]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const activeItems = rows.filter((r) => r.qty > 0).length;
  const stockBranches = new Set(rows.filter((r) => r.qty > 0).map((r) => r.branchId)).size;
  const zeroQty = rows.filter((r) => r.qty === 0).length;

  const byCat = useMemo<CatRow[]>(() => {
    const map = new Map<string, CatRow>();
    for (const r of rows) {
      const cur = map.get(r.category) ?? { categoryId: r.category, categoryName: catName(r.category), items: 0, qty: 0, value: 0 };
      cur.items += 1;
      cur.qty += r.qty;
      cur.value += r.value;
      map.set(r.category, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [rows, catName]);

  const byBranch = useMemo<BranchRow[]>(() => {
    const map = new Map<string, BranchRow>();
    for (const r of rows) {
      const cur = map.get(r.branchId) ?? { branchId: r.branchId, branchName: getBranchName(r.branchId), items: 0, qty: 0, value: 0 };
      cur.items += 1;
      cur.qty += r.qty;
      cur.value += r.value;
      map.set(r.branchId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [rows, getBranchName]);

  const chartData = byCat.map((c) => ({ name: c.categoryName, قيمة: Number(c.value.toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'تقييم المخزون (Inventory Valuation)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['إجمالي القيمة', fmtMoney(totalValue)],
        ['أصناف برصيد', `${activeItems} (${zeroQty} صفر)`],
        ['الكمية الإجمالية', fmt(totalQty)],
      ],
      tables: [
        {
          title: 'حسب التصنيف',
          header: ['التصنيف', 'الأصناف', 'الكمية', 'القيمة'],
          rows: [
            ...byCat.map((c) => [c.categoryName, c.items, fmt(c.qty), fmtMoney(c.value)]),
            ['الإجمالي', byCat.length, fmt(totalQty), fmtMoney(totalValue)],
          ],
          dense: true,
        },
        {
          title: 'حسب الفروع',
          header: ['الفرع', 'الأصناف', 'الكمية', 'القيمة', '%'],
          rows: byBranch.map((b) => [b.branchName, b.items, fmt(b.qty), fmtMoney(b.value), totalValue > 0 ? `${((b.value / totalValue) * 100).toFixed(1)}%` : '—']),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'حسب التصنيف',
      header: ['التصنيف', 'الأصناف', 'الكمية', 'القيمة'],
      rows: byCat.map((c) => [c.categoryName, c.items, c.qty, c.value.toFixed(2)]),
    },
    {
      name: 'حسب الفروع',
      header: ['الفرع', 'الأصناف', 'الكمية', 'القيمة', '%'],
      rows: byBranch.map((b) => [b.branchName, b.items, b.qty, b.value.toFixed(2), totalValue > 0 ? `${((b.value / totalValue) * 100).toFixed(1)}%` : '-']),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقييم المخزون (Inventory Valuation)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Wallet className="w-6 h-6 text-emerald-300" />}
        actions={
          <>
            <ViewToolbar filename={`Inventory_Valuation_${periodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                  {periods.map((p) => (
                    <option key={p} value={p}>{monthLabel(p)}</option>
                  ))}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.nameAr}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — التقييم بآخر سعر استلام معتمد (GRN)
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">إجمالي القيمة</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmtMoney(totalValue)}</strong>
          <span className="text-[10px] text-emerald-500 block">{totalQty.toFixed(0)} وحدة إجمالية</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">أصناف برصيد</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{activeItems}</strong>
          <span className="text-[10px] text-blue-500 block">من {rows.length} صف مخزون</span>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <span className="text-[10px] text-indigo-600 font-bold block">فروع مخزّنة</span>
          <strong className="text-lg font-extrabold text-indigo-800 font-mono block">{stockBranches}</strong>
          <span className="text-[10px] text-indigo-500 block">{zeroQty} صنف بصفر رصيد</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">أعلى تصنيف قيمة</span>
          <strong className="text-lg font-extrabold text-amber-800 block truncate">{byCat[0]?.categoryName ?? '—'}</strong>
          <span className="text-[10px] text-amber-500 block">{byCat[0] ? fmtMoney(byCat[0].value) : ''} ({byCat[0] && totalValue > 0 ? ((byCat[0].value / totalValue) * 100).toFixed(1) : 0}%)</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" /> قيمة المخزون حسب التصنيف
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" fontSize={10} tick={{ fill: '#475569' }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis fontSize={10} tickFormatter={(v: number) => fmtMoney(v)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => [fmtMoney(Number(v)), 'القيمة']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="قيمة" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3">الخلاصة حسب التصنيف</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">التصنيف</th>
                  <th className="p-2 text-center">الأصناف</th>
                  <th className="p-2 text-center">الكمية</th>
                  <th className="p-2 text-center">القيمة</th>
                  <th className="p-2 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byCat.map((c, i) => (
                  <tr key={c.categoryId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{c.categoryName}</td>
                    <td className="p-2 text-center font-mono">{c.items}</td>
                    <td className="p-2 text-center font-mono">{fmt(c.qty)}</td>
                    <td className="p-2 text-center font-mono text-emerald-700">{fmtMoney(c.value)}</td>
                    <td className="p-2 text-center font-mono">{totalValue > 0 ? ((c.value / totalValue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center font-mono">{byCat.length}</td>
                  <td className="p-2 text-center font-mono">{fmt(totalQty)}</td>
                  <td className="p-2 text-center font-mono text-lg text-emerald-700">{fmtMoney(totalValue)}</td>
                  <td className="p-2 text-center font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-lg mb-3">تقييم المخزون حسب الفرع</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold">
                  <th className="p-2 text-right">الفرع</th>
                  <th className="p-2 text-center">الأصناف</th>
                  <th className="p-2 text-center">الكمية</th>
                  <th className="p-2 text-center">القيمة</th>
                  <th className="p-2 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byBranch.map((b, i) => (
                  <tr key={b.branchId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{b.branchName}</td>
                    <td className="p-2 text-center font-mono">{b.items}</td>
                    <td className="p-2 text-center font-mono">{fmt(b.qty)}</td>
                    <td className="p-2 text-center font-mono text-blue-700">{fmtMoney(b.value)}</td>
                    <td className="p-2 text-center font-mono">{totalValue > 0 ? ((b.value / totalValue) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <td className="p-2">الإجمالي</td>
                  <td className="p-2 text-center font-mono">{byBranch.length}</td>
                  <td className="p-2 text-center font-mono">{fmt(totalQty)}</td>
                  <td className="p-2 text-center font-mono text-lg text-blue-700">{fmtMoney(totalValue)}</td>
                  <td className="p-2 text-center font-mono">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default InventoryValuationReport;
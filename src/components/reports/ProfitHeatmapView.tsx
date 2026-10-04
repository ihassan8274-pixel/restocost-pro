import React, { useState, useMemo } from 'react';
import { Grid3x3, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, PageHeader, Btn, inputCls, Field } from '../ui';
import { useApp } from '../../context/AppContext';
import { fmtMoney } from '../../utils/helpers';

export const ProfitHeatmapView: React.FC = () => {
  const { batchSalesRecords, posOrders, recipes, branches, visibleBranchIds, getBranchName } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metrics, setMetrics] = useState<'profit' | 'revenue' | 'margin'>('profit');

  const catOfRecipe = useMemo(() => {
    const m = new Map<string, string>();
    recipes.forEach((r) => m.set(r.id, r.category));
    return m;
  }, [recipes]);

  const rows = useMemo(() => {
    const out: { branchId: string; cat: string; revenue: number; cost: number }[] = [];
    batchSalesRecords
      .filter((b) => (!from || b.date >= from) && (!to || b.date <= to))
      .forEach((b) => {
        (b.items || []).forEach((it) => {
          out.push({ branchId: b.branchId, cat: it.category || 'أخرى', revenue: it.lineTotalRevenue || 0, cost: it.lineTotalCost || 0 });
        });
      });
    posOrders
      .filter((o) => (!from || o.date >= from) && (!to || o.date <= to))
      .forEach((o) => {
        (o.items || []).forEach((it) => {
          out.push({ branchId: o.branchId, cat: catOfRecipe.get(it.recipeId) || 'أخرى', revenue: it.lineTotal || 0, cost: it.unitCost * it.quantity || 0 });
        });
      });
    return out;
  }, [batchSalesRecords, posOrders, recipes, from, to, catOfRecipe]);

  const heat = useMemo(() => {
    const grid = new Map<string, Map<string, { revenue: number; cost: number }>>();
    rows.forEach((r) => {
      if (!grid.has(r.cat)) grid.set(r.cat, new Map());
      const byBranch = grid.get(r.cat)!;
      const cur = byBranch.get(r.branchId) || { revenue: 0, cost: 0 };
      cur.revenue += r.revenue;
      cur.cost += r.cost;
      byBranch.set(r.branchId, cur);
    });
    return grid;
  }, [rows]);

  const branchesIn = useMemo(() => branches.filter((b) => visibleBranchIds.includes(b.id)), [branches, visibleBranchIds]);

  const valueOf = (revenue: number, cost: number) => {
    const profit = revenue - cost;
    if (metrics === 'profit') return profit;
    if (metrics === 'revenue') return revenue;
    return revenue ? (profit / revenue) * 100 : 0;
  };

  const maxAbs = useMemo(() => {
    let mx = 1;
    heat.forEach((m) => m.forEach((v) => { const x = Math.abs(valueOf(v.revenue, v.cost)); if (x > mx) mx = x; }));
    return mx;
  }, [heat, metrics]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Grid3x3 className="w-5 h-5 text-amber-600" />}
        title="خريطة الربحية الحرارية"
        subtitle="فئة الصنف × الفرع × الفترة — لون أغمق يعني قيمة أكبر، والأخضر ربح والأحمر خسارة"
        actions={<>
          <div className="flex gap-1 text-[10px] font-black">
            {(['profit', 'revenue', 'margin'] as const).map((m) => (
              <button key={m} onClick={() => setMetrics(m)} className={`px-3 py-1.5 rounded-full border font-bold ${metrics === m ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                {m === 'profit' ? 'ربح' : m === 'revenue' ? 'إيراد' : 'هامش %'}
              </button>
            ))}
          </div>
        </>}
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
          <Btn tone="ghost" onClick={() => { setFrom(''); setTo(''); }}>مسح الفترة</Btn>
        </div>
      </Card>

      {heat.size > 0 ? (
        <Card className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-right font-black text-slate-500 text-[10px] border-b border-slate-100">الفئة</th>
                {branchesIn.map((b) => <th key={b.id} className="p-2 text-center font-black text-slate-500 text-[10px] border-b border-slate-100">{getBranchName(b.id)}</th>)}
                <th className="p-2 text-center font-black text-slate-700 text-[10px] border-b border-slate-100">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {[...heat.entries()].map(([cat, byBranch]) => {
                const totalV = branchesIn.reduce((s, b) => s + (byBranch.has(b.id)
                  ? valueOf(byBranch.get(b.id)!.revenue, byBranch.get(b.id)!.cost)
                  : 0), 0);
                return (
                  <tr key={cat}>
                    <td className="p-2 font-black text-slate-800 border-b border-slate-50 whitespace-nowrap">{cat}</td>
                    {branchesIn.map((b) => {
                      const cell = byBranch.get(b.id);
                      if (!cell) return <td key={b.id} className="p-1.5 border-b border-slate-50"></td>;
                      const v = valueOf(cell.revenue, cell.cost);
                      const pct = maxAbs ? Math.min(0.95, Math.abs(v) / maxAbs) : 0;
                      const positive = metrics === 'margin' ? v >= 0 : v >= 0;
                      const bg = positive
                        ? `rgba(16,185,129,${0.12 + pct * 0.5})`
                        : `rgba(244,63,94,${0.12 + pct * 0.5})`;
                      return (
                        <td key={b.id} className="p-1.5 border-b border-slate-50" style={{ backgroundColor: bg }}>
                          <div className="text-center font-mono font-bold text-slate-900">{metrics === 'margin' ? v.toFixed(1) + '%' : fmtMoney(v)}</div>
                          <div className="text-center text-[8px] text-slate-500 font-bold">{fmtMoney(cell.revenue - cell.cost)}</div>
                        </td>
                      );
                    })}
                    <td className="tnum p-2 text-left font-black text-slate-800 border-b border-slate-50">{metrics === 'margin' ? totalV.toFixed(1) + '%' : fmtMoney(totalV)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-3 text-[10px] font-bold text-slate-500">
            <span><TrendingUp className="w-3.5 h-3.5 inline text-emerald-600" /> ربح·إيراد موجب</span>
            <span><TrendingDown className="w-3.5 h-3.5 inline text-rose-600" /> خسارة/سالب</span>
            <span>شدة اللون = حجم القيمة المطلقة</span>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center text-xs text-slate-400 font-bold">لا توجد مبيعات في هذه الفترة — أضف مبيعات مجمعة أو طلبات POS لعرض الخريطة.</Card>
      )}
    </div>
  );
};
import React, { useMemo, useState } from 'react';
import { Sun, ChevronDown, ChevronUp, Flame, PackageX, TrendingUp, Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fmtMoney, netOfGross } from '../../utils/helpers';

const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export const MorningBriefingCard: React.FC = () => {
  const { batchSalesRecords, recipes, inventory, rawMaterials, closedDays } = useApp();
  const [open, setOpen] = useState(() => localStorage.getItem('rcerp_brief_seen') !== todayStr());

  const setSeen = (v: boolean) => {
    setOpen(v);
    if (!v) localStorage.setItem('rcerp_brief_seen', todayStr());
  };

  const yesterday = yesterdayStr();
  const daySales = useMemo(() => {
    const map = new Map<string, { name: string; gross: number; food: number; count: number }>();
    batchSalesRecords.filter((b) => b.date === yesterday).forEach((b) => {
      const cur = map.get(b.branchId) || { name: b.branchName, gross: 0, food: 0, count: 0 };
      cur.gross += b.totalRevenue; cur.food += b.totalFoodCost; cur.count += 1;
      map.set(b.branchId, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
  }, [batchSalesRecords, yesterday]);

  const fcStreak = useMemo(() => {
    const dates = Array.from(new Set(batchSalesRecords.map((b) => b.date))).sort((a, b) => b.localeCompare(a)).slice(0, 2);
    if (dates.length < 2 || dates[0] !== yesterday && dates[0] !== todayStr()) return null;
    const daily = dates.map((d) => {
      const recs = batchSalesRecords.filter((b) => b.date === d);
      const net = recs.reduce((s, b) => s + (b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? 0.15)), 0);
      const food = recs.reduce((s, b) => s + b.totalFoodCost, 0);
      return net ? (food / net) * 100 : 0;
    });
    return daily[0] > 35 && daily[1] > 35 ? daily : null;
  }, [batchSalesRecords, yesterday]);

  const depleting = useMemo(() => {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const usage = new Map<string, number>();
    batchSalesRecords.filter((b) => b.date >= cutoff).forEach((b) => b.items.forEach((it) => {
      const r = recipes.find((x) => x.id === it.recipeId);
      r?.ingredients.forEach((ing) => usage.set(ing.rawMaterialId, (usage.get(ing.rawMaterialId) || 0) + ing.quantity * (1 + (ing.wastagePercent || 0) / 100) * it.quantitySold));
    }));
    const stock = new Map<string, number>();
    inventory.forEach((i) => stock.set(i.rawMaterialId, (stock.get(i.rawMaterialId) || 0) + i.quantity));
    return Array.from(usage.entries())
      .map(([id, used]) => {
        const rate = used / 7;
        const left = stock.get(id) || 0;
        return { id, name: rawMaterials.find((m) => m.id === id)?.nameAr || id, daysLeft: rate > 0 ? left / rate : Infinity, left };
      })
      .filter((x) => x.daysLeft <= 3)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);
  }, [batchSalesRecords, recipes, inventory, rawMaterials]);

  const dayClosed = closedDays.includes(yesterday);
  const hasContent = daySales.length > 0 || fcStreak || depleting.length > 0;

  if (!hasContent) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white shadow-sm">
      <button onClick={() => setSeen(!open)} className="w-full flex items-center gap-2 p-4 text-right">
        <Sun className="w-5 h-5 text-amber-500" />
        <div className="flex-1">
          <h3 className="text-sm font-extrabold text-slate-800">الملخص الصباحي — أمس ({yesterday})</h3>
          <p className="text-[11px] text-slate-500">{daySales.length} فروع باعت أمس • {depleting.length} صنف قارب النفاد {dayClosed ? <span className="inline-flex items-center gap-0.5">• اليوم مغلق <Lock className="w-3 h-3" /></span> : ''}</p>
        </div>
        {fcStreak && <Flame className="w-4 h-4 text-rose-500" />}
        {depleting.length > 0 && <PackageX className="w-4 h-4 text-amber-500" />}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {daySales.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> مبيعات الأمس لكل فرع:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {daySales.map((b) => {
                  const net = netOfGross(b.gross, 0.15);
                  const fc = net ? (b.food / net) * 100 : 0;
                  return (
                    <div key={b.name} className="bg-white rounded-xl border border-slate-200 p-2.5">
                      <span className="text-[10px] font-bold text-slate-500 block truncate">{b.name}</span>
                      <strong className="text-sm font-mono text-emerald-700 block">{fmtMoney(b.gross)}</strong>
                      <span className={`text-[10px] font-bold ${fc > 35 ? 'text-rose-600' : 'text-emerald-600'}`}>FC {fc.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {fcStreak && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-[11px] font-bold flex items-center gap-2">
              <Flame className="w-4 h-4" /> تنبيه: نسبة تكلفة الطعام تجاوزت 35% يومين متتاليين ({fcStreak[0].toFixed(1)}% ثم {fcStreak[1].toFixed(1)}%) — راجع أسعار الشراء والهدر.
            </div>
          )}

          {depleting.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <div className="text-[11px] font-bold text-amber-800 mb-1">أصناف ستنفد خلال 3 أيام (حسب استهلاك آخر 7 أيام):</div>
              <div className="flex flex-wrap gap-1.5">
                {depleting.map((d) => (
                  <span key={d.id} className={`text-[10px] font-bold px-2 py-1 rounded-full ${d.daysLeft <= 1 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                    {d.name} — {d.daysLeft <= 0.5 ? 'نُفد تقريباً' : `${d.daysLeft.toFixed(1)} يوم`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
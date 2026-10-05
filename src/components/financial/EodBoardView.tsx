import React, { useState, useMemo } from 'react';
import { Lock, Unlock, TrendingUp, Wallet, Percent } from 'lucide-react';
import { Card, PageHeader, Btn, inputCls, Field } from '../ui';
import { useApp } from '../../context/AppContext';
import { fmtMoney } from '../../utils/helpers';

export const EodBoardView: React.FC = () => {
  const { eodClosures, closedDays, closeDay, reopenDay, getBranchName, can } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [onlyClosedWithNoRecord, setOnlyClosedWithNoRecord] = useState(false);

  const stats = useMemo(() => {
    const list = eodClosures
      .filter((c) => (!from || c.date >= from) && (!to || c.date <= to))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const revenue = list.reduce((s, c) => s + (c.revenue ?? 0), 0);
    const profit = list.reduce((s, c) => s + (c.profit ?? 0), 0);
    const foodCost = list.reduce((s, c) => s + (c.foodCost ?? 0), 0);
    const laborCost = list.reduce((s, c) => s + (c.laborCost ?? 0), 0);
    return { list, count: list.length, revenue, profit, foodCost, laborCost, margin: revenue ? (profit / revenue) * 100 : 0 };
  }, [eodClosures, from, to]);

  const closedDaysInRange = useMemo(
    () => closedDays.filter((d) => (!from || d >= from) && (!to || d <= to)).sort((a, b) => (a < b ? 1 : -1)),
    [closedDays, from, to]
  );
  const closedWithoutRecord = closedDaysInRange.filter((d) => !eodClosures.some((c) => c.date === d));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Lock className="w-5 h-5 text-amber-600" />}
        title="لوحة الإقفال اليومي الموحدة"
        subtitle="سجل إغلاق لكل فرع لحظة الإقفال: إيرادات، تكاليف طعام وعمالة ومصاريف وهوالك، وأرباح — عبر كل الفروع"
        actions={<Btn tone="ghost" onClick={() => { const d = new Date().toISOString().slice(0, 10); if (!closedDays.includes(d)) closeDay(d); }}><Unlock className="w-4 h-4" /> إقفال اليوم الآن</Btn>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-[10px] text-slate-500 font-black flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> سجلات الفترة</div><div className="mt-1 text-2xl font-black text-slate-900">{stats.count}</div></Card>
        <Card className="p-4"><div className="text-[10px] text-slate-500 font-black flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> إيرادات الفترة</div><div className="mt-1 text-2xl font-black text-emerald-700">{fmtMoney(stats.revenue)}</div></Card>
        <Card className="p-4"><div className="text-[10px] text-slate-500 font-black flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> صافي الربح</div><div className="mt-1 text-2xl font-black text-brand-700">{fmtMoney(stats.profit)}</div></Card>
        <Card className="p-4"><div className="text-[10px] text-slate-500 font-black flex items-center gap-1"><Percent className="w-3.5 h-3.5" /> هامش الربح</div><div className="mt-1 text-2xl font-black text-amber-600">{stats.margin.toFixed(1)}%</div></Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
          <label className="flex items-center gap-2 pb-2.5">
            <input type="checkbox" checked={onlyClosedWithNoRecord} onChange={(e) => setOnlyClosedWithNoRecord(e.target.checked)} className="accent-amber-600" />
            <span className="text-xs font-bold text-slate-600">إظهار الأيام المغلقة بلا سجل</span>
          </label>
        </div>
      </Card>

      {(onlyClosedWithNoRecord || stats.list.length > 0) && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">سجل الإقفالات ({stats.list.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500 border-b border-slate-100 text-[10px]">
                <tr>
                  <th className="text-right p-2 font-bold">التاريخ</th>
                  <th className="text-right p-2 font-bold">الفرع</th>
                  <th className="text-right p-2 font-bold">الإيرادات</th>
                  <th className="text-right p-2 font-bold">تكلفة الطعام</th>
                  <th className="text-right p-2 font-bold">العمالة</th>
                  <th className="text-right p-2 font-bold">المصاريف</th>
                  <th className="text-right p-2 font-bold">الهوالك</th>
                  <th className="text-right p-2 font-bold">الربح</th>
                  <th className="text-right p-2 font-bold">الهامش</th>
                  <th className="text-right p-2 font-bold">بواسطة</th>
                  <th className="text-right p-2 font-bold">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.list.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="tnum text-left p-2 font-bold text-slate-800">{c.date}</td>
                    <td className="p-2 font-bold">{getBranchName(c.branchId)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmtMoney(c.revenue ?? 0)}</td>
                    <td className="tnum text-left p-2">{fmtMoney(c.foodCost ?? 0)}</td>
                    <td className="tnum text-left p-2">{fmtMoney(c.laborCost ?? 0)}</td>
                    <td className="tnum text-left p-2">{fmtMoney(c.operatingCost ?? 0)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmtMoney(c.wastageCost ?? 0)}</td>
                    <td className={`p-2 font-mono font-black ${(c.profit ?? 0) >= 0 ? 'text-brand-700' : 'text-rose-700'}`}>{fmtMoney(c.profit ?? 0)}</td>
                    <td className={`p-2 font-mono font-bold ${(c.marginPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{c.marginPct ?? 0}%</td>
                    <td className="p-2 text-slate-500 font-bold">{c.closedBy}<span className="block text-[9px] text-slate-400">{new Date(c.closedAt).toLocaleString()}</span></td>
                    <td className="p-2">
                      {can('manage_accounting') ? (
                        <button onClick={() => reopenDay(c.date)} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg" title="إعادة فتح اليوم"><Unlock className="w-4 h-4" /></button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {stats.list.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-400 font-bold">لا توجد سجلات في هذه الفترة</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {onlyClosedWithNoRecord && closedWithoutRecord.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1"><Unlock className="w-4 h-4 text-amber-600" /> أيام مغلقة بلا سجل ({closedWithoutRecord.length})</h3>
          <div className="flex flex-wrap gap-2">
            {closedWithoutRecord.map((d) => (
              <div key={d} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-800 flex items-center gap-2">
                {d}
                <button onClick={() => reopenDay(d)} className="text-amber-700 hover:text-rose-700" title="إعادة فتح">✕</button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400 font-bold">هذه الأيام أُغلقت قبل تفعيل سجل الإقفالات — بإمكانك أن تُعيد فتح اليوم ثم تُغلقه من جديد لإنشاء سجل كامل.</p>
        </Card>
      )}
    </div>
  );
};
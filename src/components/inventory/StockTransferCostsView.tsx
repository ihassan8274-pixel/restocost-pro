import React, { useState, useMemo } from 'react';
import { GitCompare, Truck, ArrowRightLeft } from 'lucide-react';
import { Card, PageHeader, inputCls, Field, StatusPill } from '../ui';
import { useApp } from '../../context/AppContext';
import { fmtMoney } from '../../utils/helpers';

export const StockTransferCostsView: React.FC = () => {
  const { stockTransfers, getBranchName } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(() => {
    const filtered = stockTransfers
      .filter((t) => (showAll || t.status === 'approved' || t.status === 'submitted') && (!from || (t.date || '').slice(0, 10) >= from) && (!to || (t.date || '').slice(0, 10) <= to))
      .sort((a, b) => (String(b.date) < String(a.date) ? -1 : 1));
    return filtered;
  }, [stockTransfers, from, to, showAll]);

  const totals = useMemo(() => {
    const transport = list.reduce((s, t) => s + (Number(t.transportCost) || 0), 0);
    const qty = list.reduce((s, t) => s + (Number(t.transportCost) || 0) > 0 ? 1 : 0, 0);
    const noNote = list.filter((t) => !Number(t.transportCost));
    return { transport, withCostCount: qty, noNote: noNote.length };
  }, [list]);

  const byFromBranch = useMemo(() => {
    const m = new Map<string, { count: number; cost: number }>();
    list.forEach((t) => {
      const k = t.fromBranchId || '—';
      const cur = m.get(k) || { count: 0, cost: 0 };
      cur.count += 1;
      cur.cost += Number(t.transportCost) || 0;
      m.set(k, cur);
    });
    return [...m.entries()];
  }, [list]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<GitCompare className="w-5 h-5 text-indigo-600" />}
        title="مقارنة تكاليف التحويل/النقل"
        subtitle="تتبع تكلفة النقل لكل تحويل بين الفروع + ملاحظة الناقل والموافقات — لتكتشف أين تتسرب تكاليف النقل"
        actions={<StatusPill status="approved" map={{ approved: `إجمالي تكلفة النقل: ${fmtMoney(totals.transport)}` }} />}
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
          <Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
          <label className="flex items-center gap-2 pb-2.5">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-indigo-600" />
            <span className="text-xs font-bold text-slate-600">كذلك المسودات والمرفوضة</span>
          </label>
        </div>
      </Card>

      {totals.noNote > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <Truck className="w-4 h-4" /> {totals.noNote} تحويل بدون تكلفة نقل مسجلة — يُنصح بتعبئة حقل "تكلفة النقل" عند إنشاء التحويل ليظهر هنا.
        </div>
      )}

      {byFromBranch.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">تكلفة النقل حسب فرع الإرسال</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {byFromBranch.map(([b, v]) => (
              <div key={b} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-black text-slate-800 text-xs">{getBranchName(b)}</div>
                  <div className="text-[9px] text-slate-400 font-bold">{v.count} تحويل</div>
                </div>
                <div className="font-mono font-black text-indigo-700">{fmtMoney(v.cost)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">التحويلات ({list.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-500 border-b border-slate-100 text-[10px]">
              <tr>
                <th className="text-right p-2 font-bold">التاريخ</th>
                <th className="text-right p-2 font-bold">المسار</th>
                <th className="text-right p-2 font-bold">الحالة</th>
                <th className="text-right p-2 font-bold">الأصناف</th>
                <th className="text-right p-2 font-bold">تكلفة النقل</th>
                <th className="text-right p-2 font-bold">ملاحظة الناقل/النقل</th>
                <th className="text-right p-2 font-bold">اعتمدها</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="tnum text-left p-2 font-bold text-slate-800 whitespace-nowrap">{String(t.date).slice(0, 10)}</td>
                  <td className="p-2 font-bold"><ArrowRightLeft className="w-3.5 h-3.5 inline text-slate-400" /> {getBranchName(t.fromBranchId)} ← {getBranchName(t.toBranchId)}</td>
                  <td className="p-2"><StatusPill status={t.status} map={{ draft: 'مسودة', submitted: 'مقدمة', approved: 'معتمدة', rejected: 'مرفوضة' }} /></td>
                  <td className="tnum text-left p-2">{t.items?.reduce((s, i) => s + i.quantity, 0) || 0}</td>
                  <td className={`p-2 font-mono font-black ${Number(t.transportCost) > 0 ? 'text-indigo-700' : 'text-slate-400'}`}>{t.transportCost ? fmtMoney(Number(t.transportCost)) : '—'}</td>
                  <td className="p-2 text-slate-500 font-bold">{t.transportNote || '—'}</td>
                  <td className="p-2 text-slate-500 font-bold">{t.approvedBy || '—'}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">لا توجد تحويلات في هذه الفترة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
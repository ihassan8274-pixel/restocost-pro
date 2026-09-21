import React, { useState } from 'react';
import { PackageSearch, AlertTriangle, Clock, Printer, Search, Layers, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { fmt } from '../../utils/helpers';
import { openLabelsWindow } from '../../utils/labels';

const daysUntil = (date?: string): number | null => {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
};

export const BatchesFEFOView: React.FC = () => {
  const { inventoryBatches, getFefoBatches, expiringBatches, branches, rawMaterials, getBranchName, getRawMaterialName, showToast } = useApp();
  const [branchFilter, setBranchFilter] = useState('');
  const [search, setSearch] = useState('');

  const mName = (id: string) => getRawMaterialName(id);
  const unit = (id: string) => rawMaterials.find((m) => m.id === id)?.unit || '';
  const counts = expiringBatches(14);
  const ordered = getFefoBatches(branchFilter || undefined).filter((b) => {
    if (!search.trim()) return true;
    const q = search.trim();
    return (b.batchNumber || '').toLowerCase().includes(q.toLowerCase()) || mName(b.rawMaterialId).includes(q);
  });

  const printLabels = (ids: string[]) => {
    const items = ids.map((id) => {
      const b = inventoryBatches.find((x) => x.id === id);
      return b ? {
        materialName: mName(b.rawMaterialId),
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        qty: b.remainingQty,
        unit: unit(b.rawMaterialId),
        branchName: getBranchName(b.branchId),
      } : undefined;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    if (items.length === 0) { showToast('لا توجد دفعات للطباعة'); return; }
    openLabelsWindow(`ملصقات المستودع ${items.length ? `(${items.length})` : ''}`, items);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="دفعات الاستلام (FEFO)" subtitle="ترتيب استهلاك دفعات المواد بالأقرب صلاحية أولاً، وطباعة ملصقات باركود من إشعارات الاستلام" icon={<PackageSearch className="w-6 h-6 text-amber-500" />}
        actions={<>
          <Btn tone="ghost" onClick={() => printLabels(ordered.map((b) => b.id))}><Printer className="w-4 h-4" /> طباعة ملصقات الكل ({ordered.length})</Btn>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-amber-600"><Layers className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">دفعات نشطة</span></div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2 font-mono">{inventoryBatches.length}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">إجمالي الدُفعات المسجلة</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-rose-500"><AlertTriangle className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">منتهية الصلاحية</span></div>
          <p className="text-2xl font-extrabold text-rose-600 mt-2 font-mono">{counts.expired.length}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">يجب استهلاكها فوراً أو إتلافها</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-amber-500"><Clock className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">تنتهي خلال 14 يوم</span></div>
          <p className="text-2xl font-extrabold text-amber-600 mt-2 font-mono">{counts.soon.length}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">تحتاج إرشاد استهلاك أولاً</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="w-4 h-4" /><span className="text-xs font-extrabold text-slate-500">كمية متبقية كاملة</span></div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2 font-mono">{fmt(inventoryBatches.reduce((s, b) => s + b.remainingQty, 0), 1)}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1">وحدات مخزون موزعة على الدُفعات</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">كل الفروع</option>
          {branches.filter((b) => b.id !== 'b-ck').map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالصنف أو رقم الدفعة..." className={inputCls + ' pr-9'} />
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm">الدفعات المرتبة FEFO (الأقرب صلاحية أولاً)</h3>
          <span className="text-[10px] font-bold text-slate-400">{ordered.length} دفعة</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-bold">الأولوية</th>
                <th className="pb-2 font-bold">الصنف</th>
                <th className="pb-2 font-bold">الفرع</th>
                <th className="pb-2 font-bold">رقم الدفعة</th>
                <th className="pb-2 font-bold">الصلاحية</th>
                <th className="pb-2 font-bold">المتبقي</th>
                <th className="pb-2 font-bold">الحالة</th>
                <th className="pb-2 font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((b, i) => {
                const d = daysUntil(b.expiryDate);
                const status = d === null ? '—' : d < 0 ? 'منتهية' : d === 0 ? 'تنتهي اليوم' : d <= 14 ? `خلال ${d} أيام` : `${d} يوم`;
                const tone = d === null ? 'bg-slate-50 text-slate-500' : d < 0 ? 'bg-rose-100 text-rose-700' : d <= 3 ? 'bg-rose-50 text-rose-600' : d <= 14 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';
                return (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-2.5">
                      <span className={`w-7 h-7 inline-flex items-center justify-center rounded-full font-mono font-extrabold text-[11px] ${i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span>
                    </td>
                    <td className="py-2.5"><span className="text-xs font-bold text-slate-800">{mName(b.rawMaterialId)}</span><span className="block text-[10px] text-slate-400 font-mono">({unit(b.rawMaterialId)})</span></td>
                    <td className="py-2.5 text-xs text-slate-600 font-bold">{getBranchName(b.branchId)}</td>
                    <td className="py-2.5"><span className="font-mono text-xs font-extrabold text-indigo-700" dir="ltr">{b.batchNumber}</span></td>
                    <td className="py-2.5"><span className="font-mono text-xs font-bold text-slate-600">{b.expiryDate ? b.expiryDate.slice(0, 10) : '—'}</span></td>
                    <td className="py-2.5 font-mono text-xs font-extrabold text-slate-800">{fmt(b.remainingQty, 2)}</td>
                    <td className="py-2.5"><span className={`text-[10px] font-extrabold px-2 py-1 rounded-full ${tone}`}>{status}</span></td>
                    <td className="py-2.5"><button onClick={() => printLabels([b.id])} className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1"><Printer className="w-3 h-3" /> ملصق</button></td>
                  </tr>
                );
              })}
              {ordered.length === 0 && (
                <tr><td colSpan={8} className="py-10 text-center text-slate-400 text-xs font-bold">لا توجد دفعات — سجّل مواد ذات أرقام دفعات وصلاحيات من إشعارات الاستلام (GRN)</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
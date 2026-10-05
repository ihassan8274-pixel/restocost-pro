import React, { useMemo, useState } from 'react';
import { Printer, Truck } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// المشتريات حسب المورد (Purchases by Supplier)
//   من سندات استلام البضائع المعتمدة (GRN status=approved):
//   مورد → عدد السندات / القيمة (شامل/خارج الضريبة) / الحصة% / متوسط السند / أطراف فريدة
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface SupplierRow {
  id: string;
  name: string;
  count: number;
  gross: number;
  net: number;
  vat: number;
  sharePct: number;
  avgPerNote: number;
  uniqueMaterials: number;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const PurchasesBySupplierReport: React.FC = () => {
  const { grnNotes, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(grnNotes.map((g) => (g.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [grnNotes]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const notes = useMemo(
    () =>
      grnNotes.filter((g) => {
        if (g.status !== 'approved') return false;
        if ((g.date || '').slice(0, 7) !== periodValue) return false;
        if (branchFilter !== 'all' && g.branchId !== branchFilter) return false;
        return true;
      }),
    [grnNotes, periodValue, branchFilter]
  );
  const totalGross = notes.reduce((s, g) => s + (g.totalAmount || 0), 0);

  const rows = useMemo<SupplierRow[]>(() => {
    const map = new Map<string, { row: SupplierRow; mats: Set<string> }>();
    for (const g of notes) {
      const cur = map.get(g.supplierId) ?? {
        row: {
          id: g.supplierId,
          name: g.supplierName || 'غير معروف',
          count: 0,
          gross: 0,
          net: 0,
          vat: 0,
          sharePct: 0,
          avgPerNote: 0,
          uniqueMaterials: 0,
        },
        mats: new Set<string>(),
      };
      cur.row.count += 1;
      cur.row.gross += g.totalAmount || 0;
      cur.row.net += (g.vatInclusive ? g.totalAmount - (g.vatAmount || 0) : g.totalAmount) || 0;
      cur.row.vat += g.vatAmount || 0;
      for (const it of g.items) cur.mats.add(it.rawMaterialId);
      map.set(g.supplierId, cur);
    }
    const out = Array.from(map.values())
      .map((c) => ({ ...c.row, uniqueMaterials: c.mats.size }))
      .sort((a, b) => b.gross - a.gross);
    for (const r of out) {
      r.sharePct = totalGross > 0 ? (r.gross / totalGross) * 100 : 0;
      r.avgPerNote = r.count > 0 ? r.gross / r.count : 0;
    }
    return out;
  }, [notes, totalGross]);

  const top = rows[0];
  const suppliersCount = rows.length;
  const topShare = totalGross > 0 && top ? (top.gross / totalGross) * 100 : 0;

  const chartData = rows.slice(0, 8).map((r) => ({ name: r.name.slice(0, 14), 'القيمة': Number(r.gross.toFixed(0)) }));
  const tooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

  const printReport = () => {
    openPrintWindow({
      title: 'المشتريات حسب المورد (Purchases by Supplier)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['عدد الموردين', `${suppliersCount}`],
        ['إجمالي المشتريات', fmtMoney(totalGross)],
        ['أكبر مورد', top ? `${top.name} (${topShare.toFixed(1)}%)` : '—'],
      ],
      tables: [
        {
          title: 'الموردون',
          header: ['المورد', 'السندات', 'القيمة (شامل الضريبة)', 'ضريبة', 'القيمة (خارج الضريبة)', 'متوسط السند', 'أطراف فريدة', 'الحصة%'],
          rows: rows.map((r) => [r.name, `${r.count}`, fmtMoney(r.gross), fmtMoney(r.vat), fmtMoney(r.net), fmtMoney(r.avgPerNote), `${r.uniqueMaterials}`, `${r.sharePct.toFixed(1)}%`]),
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'الموردون',
      header: ['المورد', 'السندات', 'القيمة (شامل الضريبة)', 'ضريبة', 'القيمة (خارج الضريبة)', 'متوسط السند', 'أطراف فريدة', 'الحصة%'],
      rows: rows.map((r) => [r.name, r.count, Number(r.gross.toFixed(2)), Number(r.vat.toFixed(2)), Number(r.net.toFixed(2)), Number(r.avgPerNote.toFixed(2)), r.uniqueMaterials, Number(r.sharePct.toFixed(1))]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="المشتريات حسب المورد (Purchases by Supplier)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<Truck className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Purchases_By_Supplier_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {notes.length} سنداً معتمداً بقيمة {fmtMoney(totalGross)}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <span className="text-[10px] text-emerald-600 font-bold block">إجمالي المشتريات</span>
          <strong className="text-lg font-extrabold text-emerald-800 font-mono block">{fmtMoney(totalGross)}</strong>
          <span className="text-[10px] text-emerald-500 block">{notes.length} سنداً معتمداً</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <span className="text-[10px] text-blue-600 font-bold block">عدد الموردين</span>
          <strong className="text-lg font-extrabold text-blue-800 font-mono block">{suppliersCount}</strong>
          <span className="text-[10px] text-blue-500 block">موردون نشطون</span>
        </div>
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <span className="text-[10px] text-brand-600 font-bold block">أكبر مورد</span>
          <strong className="text-sm font-extrabold text-brand-800 block">{top ? top.name : '—'}</strong>
          <span className="text-[10px] text-brand-500 block">{topShare.toFixed(0)}% من المشتريات</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">متوسط السند</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{notes.length ? fmtMoney(totalGross / notes.length) : '—'}</strong>
          <span className="text-[10px] text-amber-500 block">لكل سند معتمد</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-600" /> حصة الموردين (أعلى 8)
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="w-full h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" fontSize={9} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" width={140} fontSize={10} tick={{ fill: '#475569' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtMoney(Number(v))} />
              <Bar dataKey="القيمة" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={['#10b981', '#34d399', '#6ee7b7', '#059669', '#10b981', '#a7f3d0', '#34d399', '#059669'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-lg mb-3">تفاصيل الموردين ({rows.length})</h3>
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">المورد</th>
                <th className="p-2 text-center">السندات</th>
                <th className="p-2 text-center">القيمة (شامل الضريبة)</th>
                <th className="p-2 text-center">ضريبة</th>
                <th className="p-2 text-center">القيمة (خارج الضريبة)</th>
                <th className="p-2 text-center">متوسط السند</th>
                <th className="p-2 text-center">أطراف فريدة</th>
                <th className="p-2 text-center">الحصة%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.name}</td>
                  <td className="tnum p-2 text-left">{r.count}</td>
                  <td className="tnum p-2 text-left font-bold text-emerald-700">{fmtMoney(r.gross)}</td>
                  <td className="tnum p-2 text-left text-slate-400">{fmtMoney(r.vat)}</td>
                  <td className="tnum p-2 text-left text-slate-600">{fmtMoney(r.net)}</td>
                  <td className="tnum p-2 text-left text-slate-500">{fmtMoney(r.avgPerNote)}</td>
                  <td className="tnum p-2 text-left">{r.uniqueMaterials}</td>
                  <td className="p-2 text-center">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(r.sharePct, 100)}%` }} />
                      </div>
                      <span className="font-mono text-slate-500 w-10 text-left">{r.sharePct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">لا توجد سندات معتمدة في الفترة</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default PurchasesBySupplierReport;
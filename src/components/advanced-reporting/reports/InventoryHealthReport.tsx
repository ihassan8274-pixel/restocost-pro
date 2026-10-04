import React, { useMemo, useState } from 'react';
import { Printer, ShieldCheck } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmt, monthLabel } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

// ═══════════════════════════════════════════════════════════════════════════
// صحة بيانات المخزون (Inventory Health)
// الهوية (مستمدّة من شاشة (سلامة) في v7.0):
//   فحص السلامة: أرصدة سالبة، أصناف يتيمة (بلا تعريف)، تكرار صفوف (فرع×مادة)،
//   مواد بلا سعر تكلفة، وحركات لمادة يتيمة — كلها تُحصى بعناوين قابلة للتنفيذ
// فلاتر: شهر + فرع
// ═══════════════════════════════════════════════════════════════════════════

interface Issue {
  kind: string;
  severity: 'critical' | 'warning' | 'info';
  branch: string;
  material: string;
  detail: string;
}

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const InventoryHealthReport: React.FC = () => {
  const { inventory, inventoryMovements, rawMaterials, grnNotes, branches, getBranchName } = useApp();
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const periods = useMemo(
    () => Array.from(new Set(inventory.map((r) => (r.lastUpdated || '').slice(0, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a)),
    [inventory]
  );
  const periodValue = currentPeriod || periods[0] || '';
  const periodLabel = periodValue ? monthLabel(periodValue) : 'غير محدد';
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);

  const matIds = useMemo(() => new Set(rawMaterials.map((m) => m.id)), [rawMaterials]);
  const matName = (id: string) => rawMaterials.find((m) => m.id === id)?.nameAr ?? id;

  const priced = useMemo(() => {
    const map = new Map<string, number>();
    const sorted = grnNotes.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const g of sorted) if (g.status === 'approved') for (const it of g.items) map.set(it.rawMaterialId, it.unitPrice || 0);
    for (const m of rawMaterials) if (!map.has(m.id)) map.set(m.id, m.purchaseUnitPrice || m.standardPrice || 0);
    return map;
  }, [grnNotes, rawMaterials]);

  const inv = useMemo(
    () => inventory.filter((r) => {
      if (periodValue && (r.lastUpdated || '').slice(0, 7) !== periodValue) return false;
      if (branchFilter !== 'all' && r.branchId !== branchFilter) return false;
      return true;
    }),
    [inventory, periodValue, branchFilter]
  );

  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    const seen = new Set<string>();
    for (const r of inv) {
      const key = `${r.branchId}|${r.rawMaterialId}`;
      const dup = seen.has(key);
      seen.add(key);
      if (!matIds.has(r.rawMaterialId)) {
        out.push({ kind: 'أصناف يتيمة', severity: 'critical', branch: getBranchName(r.branchId), material: r.rawMaterialId, detail: 'صف مخزون يخص مادة غير معرّفة في قائمة المواد' });
        continue;
      }
      const c = priced.get(r.rawMaterialId) ?? 0;
      if (r.quantity < 0) out.push({ kind: 'رصيد سالب', severity: 'critical', branch: getBranchName(r.branchId), material: matName(r.rawMaterialId), detail: `الكمية ${fmt(r.quantity)} — يجب تصفير/تسوية` });
      if (dup) out.push({ kind: 'صفوف مكررة', severity: 'warning', branch: getBranchName(r.branchId), material: matName(r.rawMaterialId), detail: 'توجد أكثر من صف لذات الفرع+المادة — يُدمج' });
      if (c <= 0) out.push({ kind: 'بلا سعر تكلفة', severity: 'warning', branch: getBranchName(r.branchId), material: matName(r.rawMaterialId), detail: 'لا يوجد سعر استلام أو قياسي — التقييم ناقص' });
    }
    for (const m of inventoryMovements) {
      if (periodValue && (m.date || '').slice(0, 7) !== periodValue) continue;
      if (branchFilter !== 'all' && m.branchId !== branchFilter) continue;
      if (!matIds.has(m.rawMaterialId)) {
        out.push({ kind: 'حركات لصف يتيم', severity: 'critical', branch: getBranchName(m.branchId), material: m.rawMaterialId, detail: `حركة ${m.type} لمادة غير معرّفة (${m.delta})` });
      }
    }
    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  }, [inv, inventoryMovements, periodValue, branchFilter, matIds, priced, getBranchName, matName]);

  const negativeCount = issues.filter((i) => i.kind === 'رصيد سالب').length;
  const orphanCount = issues.filter((i) => i.kind === 'أصناف يتيمة' || i.kind === 'حركات لصف يتيم').length;
  const dupCount = issues.filter((i) => i.kind === 'صفوف مكررة').length;
  const noPriceCount = issues.filter((i) => i.kind === 'بلا سعر تكلفة').length;
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const healthScore = Math.max(0, Math.round((1 - issues.length / Math.max(inv.length, 1)) * 100));

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) {
      const arr = map.get(i.kind) ?? [];
      arr.push(i);
      map.set(i.kind, arr);
    }
    return Array.from(map.entries());
  }, [issues]);

  const printReport = () => {
    openPrintWindow({
      title: 'صحة بيانات المخزون (Inventory Health)',
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}`,
      meta: [
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
        ['درجة السلامة', `${healthScore}/100`],
        ['المشاكل الحرجة', `${criticalCount}`],
      ],
      tables: [
        {
          title: 'المشاكل',
          header: ['النوع', 'الأثر', 'الفرع', 'المادة', 'التفاصيل'],
          rows: issues.map((i) => [i.kind, i.severity === 'critical' ? 'حرج' : i.severity === 'warning' ? 'تحذير' : 'معلومة', i.branch, i.material, i.detail]),
          dense: true,
        },
      ],
      footer: `${COMPANY} — ${periodLabel}`,
    });
  };

  const excelSheets = [
    {
      name: 'المشاكل',
      header: ['النوع', 'الأثر', 'الفرع', 'المادة', 'التفاصيل'],
      rows: issues.map((i) => [i.kind, i.severity, i.branch, i.material, i.detail]),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="صحة بيانات المخزون (Inventory Health)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}`}
        icon={<ShieldCheck className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <ViewToolbar filename={`Inventory_Health_${periodValue}`} sheets={excelSheets} />
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
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel} — {inv.length} صف مخزون مفحوص
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <span className="text-[11px] text-slate-500 font-bold block">درجة السلامة الشاملة</span>
        <strong className={`text-5xl font-extrabold font-mono ${healthScore >= 90 ? 'text-emerald-600' : healthScore >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>{healthScore}</strong>
        <span className="text-[11px] text-slate-400 block">من 100 — {issues.length} مشكلة من {inv.length} صف</span>
        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${criticalCount ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>حرجة: {criticalCount}</span>
          <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">تحذيرية: {issues.length - criticalCount}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">أرصدة سالبة</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono block">{negativeCount}</strong>
          <span className="text-[10px] text-rose-500 block">بحاجة تسوية فورية</span>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <span className="text-[10px] text-orange-600 font-bold block">أصناف/حركات يتيمة</span>
          <strong className="text-lg font-extrabold text-orange-800 font-mono block">{orphanCount}</strong>
          <span className="text-[10px] text-orange-500 block">بلا تعريف في المواد</span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">صفوف مكررة</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono block">{dupCount}</strong>
          <span className="text-[10px] text-amber-500 block">فرع×مادة أكثر من مرة</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <span className="text-[10px] text-slate-600 font-bold block">بلا سعر تكلفة</span>
          <strong className="text-lg font-extrabold text-slate-800 font-mono block">{noPriceCount}</strong>
          <span className="text-[10px] text-slate-500 block">يعطّل التقييم</span>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> سجل المشاكل ({issues.length})
          </h3>
          <Btn tone="ghost" onClick={printReport}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        {grouped.map(([kind, list]) => (
          <div key={kind} className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 mb-2">{kind} <span className="text-slate-400 text-xs">({list.length})</span></h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    <th className="p-2 text-center">الأثر</th>
                    <th className="p-2 text-right">الفرع</th>
                    <th className="p-2 text-right">المادة</th>
                    <th className="p-2 text-right">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((i, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${i.severity === 'critical' ? 'bg-rose-100 text-rose-700' : i.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{i.severity === 'critical' ? 'حرج' : 'تحذير'}</span>
                      </td>
                      <td className="p-2">{i.branch}</td>
                      <td className="p-2">{i.material}</td>
                      <td className="p-2 text-slate-600">{i.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!issues.length && <p className="text-center text-slate-400 py-6">لا توجد مشاكل — بيانات المخزون سليمة</p>}
      </Card>
    </div>
  );
};

export default InventoryHealthReport;
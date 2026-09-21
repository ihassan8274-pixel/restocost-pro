import React, { useMemo, useState } from 'react';
import {
  Boxes, Gauge, Activity, AlertTriangle, Scale, ArrowRightLeft,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader } from '../ui';
import { fmt, fmtMoney, downloadCSV, categoryLabel } from '../../utils/helpers';
import { renderProReport, type ProReportSpec, type ProTable } from '../../utils/pdf';
import { SharedReportCard, type ReportExhibit } from './SharedReportCard';

type Exhibit = ReportExhibit;

export const ERPInventoryReportsView: React.FC = () => {
  const {
    inventory, rawMaterials, branches, stockTransfers, wastageLogs,
    productionRuns, physicalCounts, posOrders, posReturns, batchSalesRecords,
    getBranchName, getRawMaterialName, getBranchAverageUnitCost, materialCategories,
  } = useApp();

  const [branch, setBranch] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  const branchFilter = (b: string) => branch === 'all' || b === branch;

  // ===================== التكلفة المرجحة (WAC) لكل فرع =====================
  const wacRows = useMemo(() => {
    const map = new Map<string, { branch: string; mat: typeof rawMaterials[0]; qty: number; value: number; wac: number }>();
    inventory.forEach((inv) => {
      if (!branchFilter(inv.branchId)) return;
      const mat = rawMaterials.find((r) => r.id === inv.rawMaterialId);
      if (!mat || !mat.isActive) return;
      const key = inv.branchId + '|' + inv.rawMaterialId;
      const existing = map.get(key);
      const wac = getBranchAverageUnitCost(inv.branchId, inv.rawMaterialId);
      const value = inv.quantity * wac;
      if (existing) { existing.qty += inv.quantity; existing.value += value; }
      else map.set(key, { branch: inv.branchId, mat, qty: inv.quantity, value, wac });
    });
    return Array.from(map.values())
      .filter((r) => r.qty > 0.0001)
      .map((r) => ({ branch: r.branch, code: r.mat.code, name: r.mat.nameAr, cat: categoryLabel(r.mat.category, materialCategories), unit: r.mat.unit, qty: r.qty, wac: r.wac, value: r.value }))
      .sort((a, b) => b.value - a.value);
  }, [inventory, rawMaterials, branch, getBranchAverageUnitCost]);

  // ===================== استهلاك المواد (نظري vs فعلي) =====================
  const usageRows = useMemo(() => {
    const rows: { branch: string; code: string; name: string; cat: string; theoretical: number; actual: number; variance: number; variancePct: number }[] = [];
    const theoreticalMap = new Map<string, number>();
    posOrders.forEach((o) => {
      if (!branchFilter(o.branchId)) return;
      o.items.forEach((it) => {
        const key = o.branchId + '|' + it.recipeId;
        theoreticalMap.set(key, (theoreticalMap.get(key) || 0) + it.quantity);
      });
    });
    batchSalesRecords.forEach((b) => {
      if (!branchFilter(b.branchId)) return;
      b.items.forEach((it) => {
        const key = b.branchId + '|' + it.recipeId;
        theoreticalMap.set(key, (theoreticalMap.get(key) || 0) + it.quantitySold);
      });
    });
    posReturns.forEach((r) => {
      if (!branchFilter(r.branchId)) return;
      r.items.forEach((it) => {
        const key = r.branchId + '|' + it.recipeId;
        theoreticalMap.set(key, (theoreticalMap.get(key) || 0) - it.quantity);
      });
    });
    // استهلاك وصفة -> مواد (استخدام BOM للوصفات)
    // بسيط: نحسب من productionRuns للمواد مباشرة
    const actualMap = new Map<string, number>();
    productionRuns.filter((p) => p.status === 'completed' && branchFilter(p.branchId)).forEach((p) => {
      p.items.forEach((it) => {
        const key = p.branchId + '|' + it.rawMaterialId;
        actualMap.set(key, (actualMap.get(key) || 0) + it.requiredQty);
      });
    });
    // إضافة الهالك
    wastageLogs.filter((w) => branchFilter(w.branchId)).forEach((w) => {
      const key = w.branchId + '|' + w.rawMaterialId;
      actualMap.set(key, (actualMap.get(key) || 0) + w.quantity);
    });
    // جرد الفروقات
    physicalCounts.filter((pc) => branchFilter(pc.branchId)).forEach((pc) => {
      pc.items.forEach((it) => {
        const key = pc.branchId + '|' + it.rawMaterialId;
        actualMap.set(key, (actualMap.get(key) || 0) + it.varianceQty);
      });
    });
    // تجميع لكل مادة لكل فرع
    const combined = new Map<string, { branch: string; mat: typeof rawMaterials[0]; theoretical: number; actual: number }>();
    Array.from(theoreticalMap.entries()).forEach(([k, v]) => {
      const [bid, rid] = k.split('|');
      const mat = rawMaterials.find((r) => r.id === rid);
      if (!mat) return;
      const e = combined.get(k) || { branch: bid, mat, theoretical: 0, actual: 0 };
      e.theoretical += v;
      combined.set(k, e);
    });
    Array.from(actualMap.entries()).forEach(([k, v]) => {
      const [bid, rid] = k.split('|');
      const mat = rawMaterials.find((r) => r.id === rid);
      if (!mat) return;
      const e = combined.get(k) || { branch: bid, mat, theoretical: 0, actual: 0 };
      e.actual += v;
      combined.set(k, e);
    });
    Array.from(combined.values())
      .filter((r) => r.theoretical !== 0 || r.actual !== 0)
      .forEach((r) => {
        const variance = r.actual - r.theoretical;
        const pct = r.theoretical !== 0 ? (variance / r.theoretical) * 100 : 0;
        rows.push({ branch: r.branch, code: r.mat.code, name: r.mat.nameAr, cat: categoryLabel(r.mat.category, materialCategories), theoretical: r.theoretical, actual: r.actual, variance, variancePct: pct });
      });
    return rows.sort((a, b) => b.variance - a.variance);
  }, [posOrders, batchSalesRecords, posReturns, productionRuns, wastageLogs, physicalCounts, rawMaterials, branch]);

  // ===================== تعديلات المخزون =====================
  const adjRows = useMemo(() => {
    return physicalCounts.filter((pc) => branchFilter(pc.branchId))
      .flatMap((pc) => pc.items.filter((it) => it.varianceQty !== 0).map((it) => {
        const mat = rawMaterials.find((r) => r.id === it.rawMaterialId);
        return ({
          date: pc.date, branch: pc.branchId, code: it.rawMaterialId, name: getRawMaterialName(it.rawMaterialId),
          cat: mat ? categoryLabel(mat.category, materialCategories) : '', counted: it.actualQty, system: it.theoreticalQty, variance: it.varianceQty, varianceCost: it.varianceCost, user: pc.countedBy,
        });
      }));
  }, [physicalCounts, rawMaterials, branch, getRawMaterialName]);

  // ===================== تغطية المخزون (أيام) =====================
  const coverRows = useMemo(() => {
    const dailyUsage = new Map<string, number>();
    const days = 30;
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    productionRuns.filter((p) => p.status === 'completed' && p.date >= start && branchFilter(p.branchId)).forEach((p) => {
      p.items.forEach((it) => {
        const key = p.branchId + '|' + it.rawMaterialId;
        dailyUsage.set(key, (dailyUsage.get(key) || 0) + it.requiredQty);
      });
    });
    wastageLogs.filter((w) => w.date >= start && branchFilter(w.branchId)).forEach((w) => {
      const key = w.branchId + '|' + w.rawMaterialId;
      dailyUsage.set(key, (dailyUsage.get(key) || 0) + w.quantity);
    });
    const rows = new Map<string, { branch: string; mat: typeof rawMaterials[0]; onHand: number; dailyAvg: number; coverDays: number }>();
    inventory.filter((inv) => branchFilter(inv.branchId) && inv.quantity > 0).forEach((inv) => {
      const mat = rawMaterials.find((r) => r.id === inv.rawMaterialId);
      if (!mat) return;
      const key = inv.branchId + '|' + inv.rawMaterialId;
      const daily = (dailyUsage.get(key) || 0) / days;
      const cover = daily > 0 ? inv.quantity / daily : 999;
      rows.set(key, { branch: inv.branchId, mat, onHand: inv.quantity, dailyAvg: daily, coverDays: cover });
    });
    return Array.from(rows.values())
      .map((r) => ({ branch: r.branch, code: r.mat.code, name: r.mat.nameAr, cat: categoryLabel(r.mat.category, materialCategories), unit: r.mat.unit, onHand: r.onHand, dailyAvg: r.dailyAvg, coverDays: r.coverDays }))
      .sort((a, b) => a.coverDays - b.coverDays);
  }, [inventory, rawMaterials, productionRuns, wastageLogs, branch]);

  // ===================== تحويلات المخزون =====================
  const transferRows = useMemo(() => {
    return stockTransfers.filter((t) => t.status === 'approved' && (branchFilter(t.fromBranchId) || branchFilter(t.toBranchId)))
      .flatMap((t) => t.items.map((it) => ({
        date: t.date, from: getBranchName(t.fromBranchId), to: getBranchName(t.toBranchId),
        code: it.rawMaterialId || it.recipeId || '', name: it.itemName || it.materialName || '',
        type: it.itemType === 'recipe' ? 'صنف مصنّع' : 'مخزني',
        qty: it.quantity, unit: it.unit, cost: it.unitCost, value: it.quantity * it.unitCost, ref: t.transferNumber,
      })));
  }, [stockTransfers, branch, getBranchName]);

  const toProSpec = (title: string, tables: ProTable[], kpis?: { label: string; value: string }[], subtitle?: string): ProReportSpec => ({
    title,
    subtitle,
    orientation: tables.some((t) => t.columns.length >= 9) ? 'landscape' : 'portrait',
    meta: { 'الفرع / مركز التكلفة': branch === 'all' ? 'كل الفروع' : getBranchName(branch), 'تاريخ الإصدار': new Date().toLocaleDateString('ar-SA-u-nu-latn') },
    summaryKpis: kpis,
    tables,
    footer: 'تقارير المخزون والمواد — RestoCost ERP Pro (بمعايير Oracle Material Control)',
  });

  const download = async (name: string, spec: ProReportSpec) => {
    setBusy(name);
    try {
      const blob = await renderProReport(spec);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      flash(`تم تصدير «${name}» كملف PDF احترافي`);
    } catch { flash('تعذر تصدير PDF'); }
    finally { setBusy(null); }
  };

  const csv = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(`${name}.csv`, header, rows);
    flash(`تم تصدير ${name} CSV`);
  };

  const exhibits: Exhibit[] = [
    {
      id: 'wac', icon: <Scale className="w-5 h-5 text-indigo-500" />,
      title: 'التكلفة المرجحة (WAC) لكل فرع', subtitle: 'متوسط تكلفة الوحدة الحالية لكل مادة في كل فرع مع القيمة الإجمالية',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' }, { key: 'cat', label: 'المجموعة' },
        { key: 'unit', label: 'الوحدة' }, { key: 'qty', label: 'الرصيد', type: 'num' }, { key: 'wac', label: 'التكلفة المرجحة', type: 'money' }, { key: 'value', label: 'القيمة الإجمالية', type: 'money' },
      ],
      rows: wacRows.map((r) => ({ ...r })),
      csvHeader: ['الفرع', 'الرمز', 'الصنف', 'المجموعة', 'الوحدة', 'الرصيد', 'التكلفة المرجحة', 'القيمة الإجمالية'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'الرمز' }, { title: 'الصنف' }, { title: 'المجموعة' }, { title: 'الوحدة' }, { title: 'الرصيد', type: 'num' }, { title: 'التكلفة المرجحة', type: 'money' }, { title: 'القيمة الإجمالية', type: 'money' }],
          rows: wacRows.map((r) => [r.branch, r.code, r.name, r.cat, r.unit, r.qty, r.wac, r.value]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', '', wacRows.reduce((s, r) => s + r.qty, 0), '', wacRows.reduce((s, r) => s + r.value, 0)];
        return toProSpec('التكلفة المرجحة (WAC)', [pro], [{ label: 'عدد الأصناف', value: String(wacRows.length) }, { label: 'إجمالي قيمة المخزون', value: fmtMoney(wacRows.reduce((s, r) => s + r.value, 0)) }]);
      },
    },
    {
      id: 'usage_variance', icon: <Activity className="w-5 h-5 text-sky-500" />,
      title: 'انحراف استهلاك المواد (Theoretical vs Actual)', subtitle: 'مقارنة الاستهلاك النظري (من المبيعات/الوصفات) بالفعلي (إنتاج/هالك/جرد)',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' }, { key: 'cat', label: 'المجموعة' },
        { key: 'theoretical', label: 'النظري', type: 'num' }, { key: 'actual', label: 'الفعلي', type: 'num' }, { key: 'variance', label: 'الانحراف', type: 'num' }, { key: 'variancePct', label: 'الانحراف %', type: 'pct' },
      ],
      rows: usageRows.map((r) => ({ ...r })),
      csvHeader: ['الفرع', 'الرمز', 'الصنف', 'المجموعة', 'النظري', 'الفعلي', 'الانحراف', 'الانحراف %'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'الرمز' }, { title: 'الصنف' }, { title: 'المجموعة' }, { title: 'النظري', type: 'num' }, { title: 'الفعلي', type: 'num' }, { title: 'الانحراف', type: 'num' }, { title: 'الانحراف %', type: 'pct' }],
          rows: usageRows.map((r) => [r.branch, r.code, r.name, r.cat, r.theoretical, r.actual, r.variance, r.variancePct]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', usageRows.reduce((s, r) => s + r.theoretical, 0), usageRows.reduce((s, r) => s + r.actual, 0), usageRows.reduce((s, r) => s + r.variance, 0), ''];
        return toProSpec('انحراف استهلاك المواد', [pro], [{ label: 'إجمالي الانحراف', value: fmt(usageRows.reduce((s, r) => s + r.variance, 0)) }]);
      },
    },
    {
      id: 'adjustments', icon: <AlertTriangle className="w-5 h-5 text-rose-500" />,
      title: 'تعديلات المخزون (Inventory Adjustments)', subtitle: 'كل فروقات الجرد الفعلي (Physical Count) مع الأثر المالي',
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'branch', label: 'الفرع' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' },
        { key: 'cat', label: 'المجموعة' }, { key: 'counted', label: 'المحصى', type: 'num' }, { key: 'system', label: 'النظام', type: 'num' }, { key: 'variance', label: 'الفارق', type: 'num' }, { key: 'varianceCost', label: 'الأثر المالي', type: 'money' }, { key: 'user', label: 'المستخدم' },
      ],
      rows: adjRows.map((r) => ({ ...r })),
      csvHeader: ['التاريخ', 'الفرع', 'الرمز', 'الصنف', 'المجموعة', 'المحصى', 'النظام', 'الفارق', 'الأثر المالي', 'المستخدم'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'التاريخ', type: 'date' }, { title: 'الفرع' }, { title: 'الرمز' }, { title: 'الصنف' }, { title: 'المجموعة' }, { title: 'المحصى', type: 'num' }, { title: 'النظام', type: 'num' }, { title: 'الفارق', type: 'num' }, { title: 'الأثر المالي', type: 'money' }, { title: 'المستخدم' }],
          rows: adjRows.map((r) => [r.date, r.branch, r.code, r.name, r.cat, r.counted, r.system, r.variance, r.varianceCost, r.user]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', '', adjRows.reduce((s, r) => s + r.counted, 0), adjRows.reduce((s, r) => s + r.system, 0), adjRows.reduce((s, r) => s + r.variance, 0), adjRows.reduce((s, r) => s + r.varianceCost, 0), ''];
        return toProSpec('تعديلات المخزون', [pro], [{ label: 'عدد التعديلات', value: String(adjRows.length) }, { label: 'إجمالي الأثر المالي', value: fmtMoney(adjRows.reduce((s, r) => s + r.varianceCost, 0)) }]);
      },
    },
    {
      id: 'stock_cover', icon: <Gauge className="w-5 h-5 text-emerald-500" />,
      title: 'تغطية المخزون (Days of Supply)', subtitle: 'أيام التغطية بناءً على معدل الاستهلاك اليومي (آخر 30 يوم)',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' }, { key: 'cat', label: 'المجموعة' },
        { key: 'unit', label: 'الوحدة' }, { key: 'onHand', label: 'الرصيد الحالي', type: 'num' }, { key: 'dailyAvg', label: 'المعدل اليومي', type: 'num' }, { key: 'coverDays', label: 'أيام التغطية', type: 'num' },
      ],
      rows: coverRows.map((r) => ({ ...r })),
      csvHeader: ['الفرع', 'الرمز', 'الصنف', 'المجموعة', 'الوحدة', 'الرصيد الحالي', 'المعدل اليومي', 'أيام التغطية'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'الرمز' }, { title: 'الصنف' }, { title: 'المجموعة' }, { title: 'الوحدة' }, { title: 'الرصيد الحالي', type: 'num' }, { title: 'المعدل اليومي', type: 'num' }, { title: 'أيام التغطية', type: 'num' }],
          rows: coverRows.map((r) => [r.branch, r.code, r.name, r.cat, r.unit, r.onHand, r.dailyAvg, r.coverDays]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', '', coverRows.reduce((s, r) => s + r.onHand, 0), '', ''];
        return toProSpec('تغطية المخزون', [pro], [{ label: 'أصناف تحتاج إعادة طلب (< 7 أيام)', value: String(coverRows.filter((r) => r.coverDays < 7 && r.coverDays < 999).length) }]);
      },
    },
    {
      id: 'transfers', icon: <ArrowRightLeft className="w-5 h-5 text-violet-500" />,
      title: 'تحويلات المخزون بين الفروع', subtitle: 'سجل كل التحويلات (مخزنية ومصنّعة) مع القيمة',
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'from', label: 'من' }, { key: 'to', label: 'إلى' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الصنف' },
        { key: 'type', label: 'النوع' }, { key: 'qty', label: 'الكمية', type: 'num' }, { key: 'unit', label: 'الوحدة' }, { key: 'cost', label: 'التكلفة/وحدة', type: 'money' }, { key: 'value', label: 'القيمة', type: 'money' }, { key: 'ref', label: 'المرجع' },
      ],
      rows: transferRows.map((r) => ({ ...r })),
      csvHeader: ['التاريخ', 'من', 'إلى', 'الرمز', 'الصنف', 'النوع', 'الكمية', 'الوحدة', 'التكلفة/وحدة', 'القيمة', 'المرجع'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'التاريخ', type: 'date' }, { title: 'من' }, { title: 'إلى' }, { title: 'الرمز' }, { title: 'الصنف' }, { title: 'النوع' }, { title: 'الكمية', type: 'num' }, { title: 'الوحدة' }, { title: 'التكلفة/وحدة', type: 'money' }, { title: 'القيمة', type: 'money' }, { title: 'المرجع' }],
          rows: transferRows.map((r) => [r.date, r.from, r.to, r.code, r.name, r.type, r.qty, r.unit, r.cost, r.value, r.ref]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', '', '', transferRows.reduce((s, r) => s + r.qty, 0), '', '', transferRows.reduce((s, r) => s + r.value, 0), ''];
        return toProSpec('تحويلات المخزون', [pro], [{ label: 'عدد التحويلات', value: String(transferRows.length) }, { label: 'إجمالي القيمة المحوّلة', value: fmtMoney(transferRows.reduce((s, r) => s + r.value, 0)) }]);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقارير المخزون والمواد (بمعايير Oracle Material Control)"
        subtitle="التكلفة المرجحة (WAC)، انحراف الاستهلاك (Theoretical vs Actual)، تعديلات الجرد، تغطية المخزون (أيام)، وتحويلات الفروع — مع تصدير PDF احترافي و CSV"
        icon={<Boxes className="w-6 h-6 text-indigo-300" />}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">الفرع:</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-800 !w-56">
              <option value="all">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{getBranchName(b.id)}</option>)}
            </select>
          </div>
        }
      />
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{msg}</div>}
      <div className="space-y-6">
        {exhibits.map((ex) => (
          <SharedReportCard
            key={ex.id}
            ex={{ ...ex, printMeta: [['الفرع', branch === 'all' ? 'كل الفروع' : getBranchName(branch)]], printFooter: 'تقارير المخزون والمواد — RestoCost ERP Pro (بمعايير Oracle Material Control)' }}
            busy={busy}
            onDownload={download}
            onCsv={csv}
          />
        ))}
      </div>
    </div>
  );
};
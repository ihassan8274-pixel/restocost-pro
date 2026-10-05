import React, { useMemo, useState } from 'react';
import { Printer, TrendingUp, Target, AlertTriangle, BarChart3 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../../ui';
import { ViewToolbar } from '../../ui/ViewToolbar';
import { fmtMoney, monthLabel, VAT_RATE, netOfGross } from '../../../utils/helpers';
import { openPrintWindow } from '../../../utils/print';

interface BranchMarginRow {
  branchId: string;
  branchName: string;
  netRevenue: number;
  foodCost: number;
  laborCost: number;
  opexCost: number;
  wastageCost: number;
  variableCost: number;
  fixedCost: number;
  cmPct: number;
  breakEven: number;
  beOk: boolean;
  safetyMargin: number;
  profit: number;
}

interface BranchMarginTotals extends Omit<BranchMarginRow, 'branchId' | 'branchName'> {
  branches: number;
}

const safetyColor = (v: number) =>
  v >= 20 ? 'text-emerald-700' : v >= 10 ? 'text-amber-600' : 'text-rose-700';

const profitColor = (v: number) =>
  v >= 0 ? 'text-emerald-700' : 'text-rose-600';

const COMPANY = 'شركة معصوب حليب لتقديم الوجبات';

export const MarginAnalysisReport: React.FC = () => {
  const {
    batchSalesRecords, shifts, operatingExpenses, wastageLogs,
    branches, getBranchName,
  } = useApp();

  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [scenarioFoodPct, setScenarioFoodPct] = useState<number | null>(null);
  const [scenarioFixedAdjPct, setScenarioFixedAdjPct] = useState<number>(0);

  const periods = useMemo(
    () => Array.from(new Set(batchSalesRecords.map((b) => (b.date || '').slice(0, 7)))).sort((a, b) => b.localeCompare(a)),
    [batchSalesRecords]
  );

  const currentPeriodValue = useMemo(
    () => currentPeriod || periods[0] || new Date().toISOString().slice(0, 7),
    [currentPeriod, periods]
  );

  const filteredRecords = useMemo(
    () => batchSalesRecords.filter((b) =>
      (b.date || '').startsWith(currentPeriodValue) &&
      (branchFilter === 'all' || b.branchId === branchFilter)
    ),
    [batchSalesRecords, currentPeriodValue, branchFilter]
  );

  const branchData = useMemo(() => {
    const acc = new Map<string, {
      net: number; food: number; labor: number; opex: number; wastage: number;
    }>();
    const ensure = (id: string) => {
      let a = acc.get(id);
      if (!a) { a = { net: 0, food: 0, labor: 0, opex: 0, wastage: 0 }; acc.set(id, a); }
      return a;
    };

    filteredRecords.forEach((b) => {
      const a = ensure(b.branchId);
      const netRev = b.netRevenue ?? netOfGross(b.totalRevenue, b.vatRate ?? VAT_RATE);
      a.net += netRev;
      a.food += b.totalFoodCost;
    });

    shifts.filter((s) =>
      (branchFilter === 'all' || s.branchId === branchFilter) &&
      (s.date || '').startsWith(currentPeriodValue)
    ).forEach((s) => {
      ensure(s.branchId).labor += s.totalShiftCost;
    });

    operatingExpenses.filter((e) =>
      (branchFilter === 'all' || e.branchId === branchFilter) &&
      (e.paymentStatus === 'paid')
    ).forEach((e) => {
      ensure(e.branchId).opex += e.amount;
    });

    wastageLogs.filter((w) =>
      (branchFilter === 'all' || w.branchId === branchFilter) &&
      (w.date || '').startsWith(currentPeriodValue)
    ).forEach((w) => {
      ensure(w.branchId).wastage += w.totalCostImpact;
    });

    const adjustFixed = 1 + (scenarioFixedAdjPct / 100);

    const rows: BranchMarginRow[] = Array.from(acc.entries()).map(([branchId, v]) => {
      const foodAdj = scenarioFoodPct !== null && v.net > 0
        ? v.net * (scenarioFoodPct / 100)
        : v.food;
      const variable = foodAdj + v.wastage;
      const fixed = (v.labor + v.opex) * adjustFixed;
      const net = v.net;
      const cmPct = net > 0 ? ((net - variable) / net) * 100 : 0;
      const cmRatio = net > 0 ? (net - variable) / net : 0;
      const beRaw = cmRatio > 0 ? fixed / cmRatio : Infinity;
      const breakEven = Number.isFinite(beRaw) ? beRaw : 0;
      const beOk = Number.isFinite(beRaw);
      const safetyMargin = beOk && net > 0 ? ((net - beRaw) / net) * 100 : 0;
      const profit = net - variable - fixed;

      return {
        branchId,
        branchName: getBranchName(branchId),
        netRevenue: net,
        foodCost: foodAdj,
        laborCost: v.labor,
        opexCost: v.opex,
        wastageCost: v.wastage,
        variableCost: variable,
        fixedCost: fixed,
        cmPct,
        breakEven,
        beOk,
        safetyMargin,
        profit,
      };
    }).sort((a, b) => b.netRevenue - a.netRevenue);

    const total = rows.reduce<BranchMarginTotals>((acc, r) => ({
      netRevenue: acc.netRevenue + r.netRevenue,
      foodCost: acc.foodCost + r.foodCost,
      laborCost: acc.laborCost + r.laborCost,
      opexCost: acc.opexCost + r.opexCost,
      wastageCost: acc.wastageCost + r.wastageCost,
      variableCost: acc.variableCost + r.variableCost,
      fixedCost: acc.fixedCost + r.fixedCost,
      cmPct: 0,
      breakEven: 0,
      beOk: false,
      safetyMargin: 0,
      profit: 0,
      branches: acc.branches + 1,
    }), {
      netRevenue: 0, foodCost: 0,
      laborCost: 0, opexCost: 0, wastageCost: 0, variableCost: 0,
      fixedCost: 0, cmPct: 0, breakEven: 0, beOk: false, safetyMargin: 0,
      profit: 0, branches: 0,
    });

    total.cmPct = total.netRevenue > 0
      ? ((total.netRevenue - total.variableCost) / total.netRevenue) * 100
      : 0;
    const totalCmRatio = total.netRevenue > 0
      ? (total.netRevenue - total.variableCost) / total.netRevenue
      : 0;
    const totalBeRaw = totalCmRatio > 0 ? total.fixedCost / totalCmRatio : Infinity;
    total.breakEven = Number.isFinite(totalBeRaw) ? totalBeRaw : 0;
    total.beOk = Number.isFinite(totalBeRaw);
    total.safetyMargin = total.beOk && total.netRevenue > 0
      ? ((total.netRevenue - totalBeRaw) / total.netRevenue) * 100
      : 0;
    total.profit = total.netRevenue - total.variableCost - total.fixedCost;

    return { rows, total };
  }, [filteredRecords, shifts, operatingExpenses, wastageLogs, branchFilter, currentPeriodValue, getBranchName, scenarioFoodPct, scenarioFixedAdjPct]);

  const periodLabel = monthLabel(currentPeriodValue);
  const branchLabel = branchFilter === 'all' ? 'جميع الفروع' : getBranchName(branchFilter);
  const { total } = branchData;

  const scenarioLabel = scenarioFoodPct !== null || scenarioFixedAdjPct !== 0
    ? `سيناريو: تكلفة طعام ${scenarioFoodPct !== null ? scenarioFoodPct.toFixed(0) + '%' : 'أصلي'} — ثابتة ${scenarioFixedAdjPct >= 0 ? '+' : ''}${scenarioFixedAdjPct}%`
    : '';

  const printReport = (tab: 'breakeven' | 'contribution' | 'scenario') => {
    const titles: Record<string, string> = {
      breakeven: 'تحليل هامش المساهمة ونقطة التعادل',
      contribution: 'هامش المساهمة حسب الفرع',
      scenario: 'سيناريو تحليلي',
    };

    const t = titles[tab];
    const headers = ['الفرع', 'الإيراد الصافي', 'متغيرة', 'ثابتة', 'CM %', 'نقطة التعادل', 'الأمان %', 'الربح'];

    openPrintWindow({
      title: `تقرير ${t}`,
      subtitle: `${COMPANY} — ${periodLabel} — ${branchLabel}${scenarioLabel ? ` — ${scenarioLabel}` : ''}`,
      meta: [
        ['التاريخ', new Date().toLocaleDateString('ar-SA')],
        ['الفترة', periodLabel],
        ['الفرع', branchLabel],
      ],
      tables: [{
        title: t,
        header: headers,
        rows: [
          ...branchData.rows.map((r) => [
            r.branchName, fmtMoney(r.netRevenue), fmtMoney(r.variableCost), fmtMoney(r.fixedCost),
            `${r.cmPct.toFixed(1)}%`, r.beOk ? fmtMoney(r.breakEven) : '—', `${r.safetyMargin.toFixed(1)}%`,
            r.profit >= 0 ? `+${fmtMoney(r.profit)}` : fmtMoney(r.profit),
          ]),
          ['الإجمالي', fmtMoney(total.netRevenue), fmtMoney(total.variableCost), fmtMoney(total.fixedCost),
           `${total.cmPct.toFixed(1)}%`, total.beOk ? fmtMoney(total.breakEven) : '—',
           `${total.safetyMargin.toFixed(1)}%`, total.profit >= 0 ? `+${fmtMoney(total.profit)}` : fmtMoney(total.profit)],
        ],
        dense: true,
      }],
      footer: `${COMPANY} — ${t}`,
    });
  };

  const excelSheets = [
    {
      name: 'التعادل بالفروع',
      header: ['الفرع', 'الإيراد الصافي', 'متغيرة', 'ثابتة', 'CM %', 'نقطة التعادل', 'الأمان %', 'الربح'],
      rows: [
        ...branchData.rows.map((r) => [
          r.branchName, r.netRevenue.toFixed(2), r.variableCost.toFixed(2), r.fixedCost.toFixed(2),
          r.cmPct.toFixed(2), r.beOk ? r.breakEven.toFixed(2) : '—', r.safetyMargin.toFixed(2),
          r.profit.toFixed(2),
        ]),
        ['الإجمالي', total.netRevenue.toFixed(2), total.variableCost.toFixed(2), total.fixedCost.toFixed(2),
         total.cmPct.toFixed(2), total.beOk ? total.breakEven.toFixed(2) : '—',
         total.safetyMargin.toFixed(2), total.profit.toFixed(2)],
      ],
    },
    {
      name: 'التكاليف التفصيلية',
      header: ['الفرع', 'إيراد صافي', 'تكلفة طعام', 'عمالة', 'مصاريف تشغيلية', 'هالك', 'ثابتة', 'متغيرة'],
      rows: [
        ...branchData.rows.map((r) => [
          r.branchName, r.netRevenue.toFixed(2), r.foodCost.toFixed(2), r.laborCost.toFixed(2),
          r.opexCost.toFixed(2), r.wastageCost.toFixed(2), r.fixedCost.toFixed(2), r.variableCost.toFixed(2),
        ]),
        ['الإجمالي', total.netRevenue.toFixed(2), total.foodCost.toFixed(2), total.laborCost.toFixed(2),
         total.opexCost.toFixed(2), total.wastageCost.toFixed(2), total.fixedCost.toFixed(2), total.variableCost.toFixed(2)],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحليل هامش المساهمة ونقطة التعادل (Contribution Margin / Break-even)"
        subtitle={`${COMPANY} — ${periodLabel} — ${branchLabel}${scenarioLabel ? ` — ${scenarioLabel}` : ''}`}
        icon={<TrendingUp className="w-6 h-6 text-rose-600" />}
        actions={
          <>
            <ViewToolbar filename={`Margin_Analysis_${currentPeriodValue}`} sheets={excelSheets} />
            <div className="flex items-center gap-2">
              <Field label="الفترة">
                <select value={currentPeriod} onChange={(e) => setCurrentPeriod(e.target.value)} className={inputCls + ' !w-44'}>
                  {periods.map((p) => <option key={p} value={p}>{monthLabel(p)}</option>)}
                </select>
              </Field>
              <Field label="الفرع">
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-44'}>
                  <option value="all">جميع الفروع</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                </select>
              </Field>
            </div>
          </>
        }
      />

      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-[11px] font-bold text-rose-800">
        {COMPANY} — تاريخ التقرير: {new Date().toLocaleDateString('ar-SA')} — الفترة: {periodLabel} — {branchLabel}
        {scenarioLabel && <> — <span className="text-rose-600">{scenarioLabel}</span></>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
          <span className="text-[10px] text-brand-600 font-bold block">المبيعات الصافية</span>
          <strong className="text-lg font-extrabold text-brand-800 font-mono">{fmtMoney(total.netRevenue)}</strong>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <span className="text-[10px] text-rose-600 font-bold block">تكاليف متغيرة</span>
          <strong className="text-lg font-extrabold text-rose-800 font-mono">{fmtMoney(total.variableCost)}</strong>
          <span className="text-[10px] text-rose-500 block">
            (طعام {total.netRevenue > 0 ? ((total.foodCost / total.netRevenue) * 100).toFixed(1) : 0}%
            + هالك {total.netRevenue > 0 ? ((total.wastageCost / total.netRevenue) * 100).toFixed(1) : 0}%)
          </span>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-[10px] text-amber-600 font-bold block">تكاليف ثابتة</span>
          <strong className="text-lg font-extrabold text-amber-800 font-mono">{fmtMoney(total.fixedCost)}</strong>
          <span className="text-[10px] text-amber-500 block">
            (عمالة {fmtMoney(total.laborCost)} + تشغيل {fmtMoney(total.opexCost)})
          </span>
        </div>
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <span className="text-[10px] text-sky-600 font-bold block">هامش المساهمة %</span>
          <strong className="text-lg font-extrabold text-sky-800 font-mono">{total.cmPct.toFixed(1)}%</strong>
          <span className="text-[10px] text-sky-500 block">{total.cmPct >= 60 ? 'ممتاز' : total.cmPct >= 45 ? 'جيد' : 'يحتاج تحسين'}</span>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <span className="text-[10px] text-purple-600 font-bold block">نقطة التعادل (إيراد)</span>
          <strong className="text-lg font-extrabold text-purple-800 font-mono">
            {total.beOk ? fmtMoney(total.breakEven) : '—'}
          </strong>
          <span className="text-[10px] text-purple-500 block">
            {total.beOk && total.netRevenue > 0 ? `${((total.breakEven / total.netRevenue) * 100).toFixed(0)}% من الإيراد الحالي` : ''}
          </span>
        </div>
        <div className={`${total.profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-100 border-rose-300'} border rounded-xl p-4`}>
          <span className={`text-[10px] font-bold block ${total.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>هامش الأمان %</span>
          <strong className={`text-lg font-extrabold font-mono ${safetyColor(total.safetyMargin)}`}>
            {total.safetyMargin.toFixed(1)}%
          </strong>
          <span className={`text-[10px] block ${total.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {total.safetyMargin >= 20 ? 'آمن' : total.safetyMargin >= 10 ? 'محاذير' : 'تحت التعادل'}
          </span>
        </div>
      </div>

      {/* Main table */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-600" /> تحليل التعادل حسب الفرع
          </h3>
          <Btn tone="ghost" onClick={() => printReport('breakeven')}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-center">الإيراد الصافي</th>
                <th className="p-2 text-center">متغيرة</th>
                <th className="p-2 text-center">ثابتة</th>
                <th className="p-2 text-center">CM %</th>
                <th className="p-2 text-center">نقطة التعادل</th>
                <th className="p-2 text-center">الأمان %</th>
                <th className="p-2 text-center">الربح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchData.rows.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-2 font-bold text-slate-800">{r.branchName}</td>
                  <td className="tnum p-2 text-left text-brand-700">{fmtMoney(r.netRevenue)}</td>
                  <td className="tnum p-2 text-left text-rose-600">{fmtMoney(r.variableCost)}</td>
                  <td className="tnum p-2 text-left text-amber-600">{fmtMoney(r.fixedCost)}</td>
                  <td className={`p-2 text-center font-mono font-bold ${r.cmPct >= 60 ? 'text-emerald-700' : r.cmPct >= 45 ? 'text-sky-700' : 'text-rose-700'}`}>
                    {r.cmPct.toFixed(1)}%
                  </td>
                  <td className="tnum p-2 text-left font-bold text-purple-700">
                    {r.beOk ? fmtMoney(r.breakEven) : '—'}
                  </td>
                  <td className={`p-2 text-center font-mono font-bold ${safetyColor(r.safetyMargin)}`}>
                    {r.safetyMargin.toFixed(1)}%
                  </td>
                  <td className={`p-2 text-center font-mono font-bold ${profitColor(r.profit)}`}>
                    {r.profit >= 0 ? '+' : ''}{fmtMoney(r.profit)}
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                <td className="p-2">الإجمالي</td>
                <td className="tnum p-2 text-left text-brand-700">{fmtMoney(total.netRevenue)}</td>
                <td className="tnum p-2 text-left text-rose-600">{fmtMoney(total.variableCost)}</td>
                <td className="tnum p-2 text-left text-amber-600">{fmtMoney(total.fixedCost)}</td>
                <td className="tnum p-2 text-left text-sky-700 text-lg">{total.cmPct.toFixed(1)}%</td>
                <td className="tnum p-2 text-left text-purple-700 text-lg">
                  {total.beOk ? fmtMoney(total.breakEven) : '—'}
                </td>
                <td className={`p-2 text-center font-mono font-bold ${safetyColor(total.safetyMargin)} text-lg`}>
                  {total.safetyMargin.toFixed(1)}%
                </td>
                <td className={`p-2 text-center font-mono font-bold ${profitColor(total.profit)} text-lg`}>
                  {total.profit >= 0 ? '+' : ''}{fmtMoney(total.profit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Scenario analysis */}
      <Card className="p-4 border-purple-200 bg-purple-50/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-purple-800 text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-700" /> سيناريو تحليلي — ماذا لو تغيرت النسب؟
          </h3>
          {(scenarioFoodPct !== null || scenarioFixedAdjPct !== 0) && (
            <Btn tone="ghost" onClick={() => { setScenarioFoodPct(null); setScenarioFixedAdjPct(0); }}>
              مسح السيناريو
            </Btn>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-bold text-purple-700 block mb-1">
              نسبة تكلفة الطعام: {scenarioFoodPct !== null ? `${scenarioFoodPct.toFixed(0)}%` : 'الأصلية'}
            </label>
            <input
              type="range"
              min={15}
              max={50}
              step={0.5}
              value={scenarioFoodPct ?? (total.netRevenue > 0 ? (total.foodCost / total.netRevenue) * 100 : 30)}
              onChange={(e) => setScenarioFoodPct(parseFloat(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-[10px] text-purple-500 mt-1">
              <span>15% (ممتاز)</span>
              <span>35% (مرتفع)</span>
              <span>50%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-purple-700 block mb-1">
              تعديل التكاليف الثابتة: {scenarioFixedAdjPct >= 0 ? '+' : ''}{scenarioFixedAdjPct}%
            </label>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={scenarioFixedAdjPct}
              onChange={(e) => setScenarioFixedAdjPct(parseInt(e.target.value))}
              className="w-full accent-purple-600"
            />
            <div className="flex justify-between text-[10px] text-purple-500 mt-1">
              <span>−50% (خفض)</span>
              <span>0%</span>
              <span>+50% (زيادة)</span>
            </div>
          </div>
        </div>

        {(scenarioFoodPct !== null || scenarioFixedAdjPct !== 0) && (
          <div className="bg-white rounded-xl p-4 border border-purple-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center">
                <span className="text-[10px] text-purple-500 block">CM % جديد</span>
                <strong className={`text-sm font-extrabold font-mono ${total.cmPct >= 55 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {total.cmPct.toFixed(1)}%
                </strong>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-purple-500 block">نقطة التعادل الجديدة</span>
                <strong className="text-sm font-extrabold font-mono text-purple-700">
                  {total.beOk ? fmtMoney(total.breakEven) : 'غير قابلة'}
                </strong>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-purple-500 block">هامش الأمان الجديد</span>
                <strong className={`text-sm font-extrabold font-mono ${safetyColor(total.safetyMargin)}`}>
                  {total.safetyMargin.toFixed(1)}%
                </strong>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-purple-500 block">الربح الصافي</span>
                <strong className={`text-sm font-extrabold font-mono ${profitColor(total.profit)}`}>
                  {total.profit >= 0 ? '+' : ''}{fmtMoney(total.profit)}
                </strong>
              </div>
            </div>
            {total.safetyMargin < 10 && (
              <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="text-xs text-rose-700 font-bold">
                  هامش الأمان منخفض ({total.safetyMargin.toFixed(1)}%) — يُنصح بخفض التكاليف أو رفع الأسعار
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Cost breakdown detail */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-600" /> تفصيل بنية التكاليف
          </h3>
          <Btn tone="ghost" onClick={() => printReport('contribution')}>
            <Printer className="w-4 h-4" /> طباعة
          </Btn>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold">
                <th className="p-2 text-right">الفرع</th>
                <th className="p-2 text-center">إيراد صافي</th>
                <th className="p-2 text-center">طعام</th>
                <th className="p-2 text-center">عمالة</th>
                <th className="p-2 text-center">مصاريف تشغيلية</th>
                <th className="p-2 text-center">هالك</th>
                <th className="p-2 text-center">% طعام</th>
                <th className="p-2 text-center">% ثابتة</th>
                <th className="p-2 text-center">Prime Cost %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchData.rows.map((r, i) => {
                const foodPct = r.netRevenue > 0 ? (r.foodCost / r.netRevenue) * 100 : 0;
                const fixedPct = r.netRevenue > 0 ? (r.fixedCost / r.netRevenue) * 100 : 0;
                const primePct = foodPct + (r.netRevenue > 0 ? (r.laborCost / r.netRevenue) * 100 : 0);
                return (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="p-2 font-bold text-slate-800">{r.branchName}</td>
                    <td className="tnum p-2 text-left text-brand-700">{fmtMoney(r.netRevenue)}</td>
                    <td className="tnum p-2 text-left text-rose-600">{fmtMoney(r.foodCost)}</td>
                    <td className="tnum p-2 text-left text-amber-600">{fmtMoney(r.laborCost)}</td>
                    <td className="tnum p-2 text-left text-amber-600">{fmtMoney(r.opexCost)}</td>
                    <td className="tnum p-2 text-left text-rose-500">{fmtMoney(r.wastageCost)}</td>
                    <td className={`p-2 text-center font-mono font-bold ${foodPct <= 30 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {foodPct.toFixed(1)}%
                    </td>
                    <td className="tnum p-2 text-left">{fixedPct.toFixed(1)}%</td>
                    <td className={`p-2 text-center font-mono font-bold ${primePct <= 55 ? 'text-emerald-700' : primePct <= 65 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {primePct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default MarginAnalysisReport;

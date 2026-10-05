import React, { useMemo, useState } from 'react';
import { TrendingUp, ShoppingCart, PackagePlus, CalendarRange, Sparkles, Trophy, AlertTriangle, Zap, Factory } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, today } from '../../utils/helpers';
import { lastSupplierIdFor } from '../../business/purchaseRequests';
import {
  SEASON_PRESETS, SeasonKey, collectMonthlySales, computeSeasonality, forecastByRecipe,
  materialDemandFromForecast, buildSeasonalSuggestions,
  SeasonalSuggestion,
} from '../../utils/forecast';

const MONTH_LABELS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const SeasonalForecastView: React.FC = () => {
  const {
    recipes, rawMaterials, posOrders, batchSalesRecords, deliverySales, inventory, purchaseOrders,
    suppliers, branches, visibleBranchIds, addPurchaseOrder, grnNotes,
  } = useApp();

  const [targetDays, setTargetDays] = useState(30);
  const [coverageDate, setCoverageDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [season, setSeason] = useState<SeasonKey>('ramadan');
  const [scopeBranch, setScopeBranch] = useState('all');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [smartMode, setSmartMode] = useState(true);

  const onCoverageDateChange = (v: string) => {
    setCoverageDate(v);
    const ms = new Date(v).getTime() - new Date(today()).getTime();
    setTargetDays(Math.max(1, Math.round(ms / 86400000)));
  };
  const daysToCoverage = Math.max(1, Math.round((new Date(coverageDate).getTime() - new Date(today()).getTime()) / 86400000));

  const scopeBranches = scopeBranch === 'all' ? visibleBranchIds : [scopeBranch];
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const { seasonality, forecast, suggestions, predictedUnits } = useMemo(() => {
    const collector = collectMonthlySales(posOrders, batchSalesRecords, deliverySales, scopeBranches);
    const seasonality = computeSeasonality(collector, recipes.filter((r) => r.isActive));
    const forecast = forecastByRecipe(seasonality, targetDays, season);
    const demand = materialDemandFromForecast(forecast, recipes);
    const suggestions = buildSeasonalSuggestions(demand, rawMaterials, inventory, purchaseOrders, scopeBranches, seasonality);
    const predictedUnits = Object.values(forecast).reduce((a, b) => a + b, 0);
    return { seasonality, forecast, suggestions, predictedUnits };
  }, [recipes, rawMaterials, posOrders, batchSalesRecords, deliverySales, inventory, purchaseOrders, targetDays, season, scopeBranches]);

  const topSeasonal = useMemo(() => seasonality.filter((s) => s.active && s.peakRatio >= 1.3).sort((a, b) => b.peakRatio - a.peakRatio).slice(0, 6), [seasonality]);
  const topForecast = useMemo(() => {
    return Object.entries(forecast).map(([id, qty]) => {
      const r = recipes.find((x) => x.id === id);
      return { id, qty, name: r?.nameAr || id, monthly: seasonality.find((s) => s.recipeId === id)?.monthly || [] };
    }).filter((x) => x.qty >= 1).sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [forecast, recipes, seasonality]);

  // أكثر الوصفات توقعاً: أعلى 3 + آفد 3 مواد
  const insightRecipes = seasonality.filter((s) => s.active && s.avg > 0)
    .sort((a, b) => b.peakRatio - a.peakRatio).slice(0, 5);

  const totalSuggested = suggestions.length;
  const effQty = (r: SeasonalSuggestion) => smartMode ? r.smartSuggested : r.baseSuggested;
  const totalQty = suggestions.reduce((s, r) => s + effQty(r), 0);
  const puConv = (r: SeasonalSuggestion) => r.material.purchaseUnitConversion && r.material.purchaseUnitConversion > 0 ? r.material.purchaseUnitConversion : 1;
  const poCost = (r: SeasonalSuggestion) => {
    const q = effQty(r);
    if (q <= 0) return 0;
    const c = puConv(r);
    const pu = c > 1 && !!r.material.purchaseUnit && !!r.material.purchaseUnitPrice;
    return pu ? (q / c) * (r.material.purchaseUnitPrice || 0) : q * (r.material.standardPrice || 0);
  };
  const totalCost = suggestions.reduce((s, r) => s + poCost(r), 0);
  const effPurchaseUnits = (r: SeasonalSuggestion) => {
    const q = effQty(r);
    const c = puConv(r);
    return c > 1 && q > 0 ? q / c : 0;
  };
  const allSelected = suggestions.length > 0 && suggestions.every((r) => selected[r.material.id]);
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    suggestions.forEach((r) => { next[r.material.id] = !allSelected; });
    setSelected(next);
  };
  const selectedRows = suggestions.filter((r) => selected[r.material.id] && effQty(r) > 0);

  const createOrders = () => {
    if (selectedRows.length === 0) { setMsg('حدد أصنافاً أولاً'); setTimeout(() => setMsg(''), 3000); return; }
    const bySupplier: Record<string, typeof selectedRows> = {};
    selectedRows.forEach((r) => {
      const sid = lastSupplierIdFor(grnNotes, r.material.id, r.material.supplierId) || suppliers[0]?.id || '';
      (bySupplier[sid] = bySupplier[sid] || []).push(r);
    });
    const branchId = visibleBranchIds.includes('b-ck') ? 'b-ck' : visibleBranchIds[0] || '';
    const today = new Date().toISOString().split('T')[0];
    Object.entries(bySupplier).forEach(([sid, items]) => {
      const supplier = suppliers.find((s) => s.id === sid);
      const poItems = items.map((r) => {
        const qty = effQty(r);
        const c = r.material.purchaseUnitConversion && r.material.purchaseUnitConversion > 0 ? r.material.purchaseUnitConversion : 1;
        const pu = c > 1 && !!r.material.purchaseUnit && !!r.material.purchaseUnitPrice;
        return {
          rawMaterialId: r.material.id, materialName: r.material.nameAr,
          quantity: qty, unit: r.material.unit,
          purchaseUnit: pu ? r.material.purchaseUnit : undefined,
          purchaseUnitConversion: pu ? c : undefined,
          purchaseQty: pu ? qty / c : undefined,
          unitPrice: pu ? (r.material.purchaseUnitPrice || r.material.standardPrice) : r.material.standardPrice,
          lineTotal: pu ? (qty / c) * (r.material.purchaseUnitPrice || 0) : qty * r.material.standardPrice,
        };
      });
      addPurchaseOrder({
        supplierId: sid, supplierName: supplier?.name || sid, branchId, orderDate: today,
        expectedDate: coverageDate, status: 'draft', items: poItems,
        totalAmount: poItems.reduce((s, i) => s + i.lineTotal, 0),
        requestedBy: 'التوقعات الموسمية', notes: `توليد من التنبؤ الكمّي (${SEASON_PRESETS[season].label}) — تغطية حتى ${coverageDate} (${targetDays} يوم)${smartMode ? ' — كمية ذكية (طلب الذروة × معامل موسمي)' : ''}`,
      });
    });
    setMsg(`تم إنشاء ${Object.keys(bySupplier).length} أمر شراء من ${selectedRows.length} صنف${smartMode ? ' بكميات ذكية (ذروة + موسمية)' : ''}`);
    setTimeout(() => setMsg(''), 4000);
    setSelected({});
  };

  const maxMonthly = (monthly: number[]) => Math.max(1, ...monthly);

  return (
    <div className="space-y-6">
      <PageHeader title="التوقعات الموسمية واقتراحات الشراء" subtitle="تحليل أنماط مبيعات 12 شهراً وتوقع الطلب (رمضان/الصيف/الشتاء) وتحويله لكميات شراء ذكية (طلب الذروة × معامل موسمي) في أوامر الشراء"
        icon={<TrendingUp className="w-6 h-6 text-emerald-500" />}
        actions={
          <ViewToolbar
            filename="التوقعات_الموسمية"
            sheets={[
              {
                name: 'الطلب المتوقع', header: ['الوصفة', 'الموسم', 'تاريخ التغطية', 'الأيام', 'الوحدات المتوقعة'],
                rows: Object.entries(forecast).filter(([, q]) => q >= 1).map(([id, q]) => [recipes.find((r) => r.id === id)?.nameAr || id, SEASON_PRESETS[season].label, coverageDate, targetDays, Math.round(q)]),
              },
              {
                name: 'خطة المطبخ المركزي', header: ['الوصفة', 'النافذة', 'بطبق/يوم', 'تاريخ التسليم'],
                rows: topForecast.map((t) => [t.name, fmt(Math.round(t.qty), 0), fmt(Math.max(1, Math.round(t.qty / daysToCoverage)), 0), coverageDate]),
              },
              {
                name: 'اقتراح الشراء', header: ['الصنف', 'الطلب المتوقع', 'المخزون', 'أوامر مفتوحة', 'اقتراح (ذكي)', 'اقتراح (عادي)', 'معامل الذروة', 'الوحدة', 'التكلفة'],
                rows: suggestions.map((r) => [r.material.nameAr, fmt(r.demand, 1), fmt(r.onHand, 1), fmt(r.onOrder, 1), fmt(r.smartSuggested, 0), fmt(r.baseSuggested, 0), `×${r.peakFactor}`, r.material.unit, fmt(poCost(r))]),
              },
            ]}
          />
        } />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <Field label="الموسم / سيناريو التوقع">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(Object.keys(SEASON_PRESETS) as SeasonKey[]).map((k) => (
                <button key={k} type="button" onClick={() => setSeason(k)}
                  className={`px-3 py-1.5 font-extrabold transition-colors ${season === k ? 'bg-emerald-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {SEASON_PRESETS[k].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="أيام التغطية المطلوبة">
            <input type="number" min="1" max="120" value={targetDays} onChange={(e) => { const d = parseInt(e.target.value, 10) || 30; setTargetDays(d); const dt = new Date(); dt.setDate(dt.getDate() + d); setCoverageDate(dt.toISOString().split('T')[0]); }} className={inputCls + ' !w-28'} />
          </Field>
          <Field label="تاريخ التغطية (أوامر الشراء والمطبخ المركزي)">
            <input type="date" min={today()} value={coverageDate} onChange={(e) => onCoverageDateChange(e.target.value)} className={inputCls + ' !w-40'} />
          </Field>
          <Field label="نطاق الفروع">
            <select value={scopeBranch} onChange={(e) => setScopeBranch(e.target.value)} className={inputCls + ' !w-64'}>
              <option value="all">جميع الفروع المتاحة</option>
              {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Field>
          <div className="w-full text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            {SEASON_PRESETS[season].desc} — التوقع يغطي {targetDays} أيام حتى {coverageDate} (≈ {fmt(daysToCoverage, 0)} يوم)
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">الطلب المتوقع (أطباق)</span>
          <strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(predictedUnits, 0)}</strong>
          <span className="text-[10px] text-slate-400 font-bold">خلال {targetDays} يوم — {SEASON_PRESETS[season].label}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">مواد تحتاج شراء</span>
          <strong className="text-lg font-extrabold font-mono text-brand-700 block mt-1">{totalSuggested}</strong>
          <span className="text-[10px] text-slate-400 font-bold">أصناف {totalQty > 0 && `(${fmt(totalQty, 0)} وحدة)`}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">قيمة الشراء التقديرية</span>
          <strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmt(totalCost)}</strong>
          <span className="text-[10px] text-slate-400 font-bold">{smartMode ? 'بكميات ذكية (ذروة + موسمي)' : 'بكميات مباشرة'}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-slate-500 text-[11px] block">وصفات توقعات (≥ وحدة)</span>
          <strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{Object.values(forecast).filter((q) => q >= 1).length}</strong>
          <span className="text-[10px] text-slate-400 font-bold">من {recipes.filter((r) => r.isActive).length} وصفة نشطة</span>
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-3"><CalendarRange className="w-4 h-4 text-emerald-500" /> نمط المبيعات الشهري — أكثر الوصفات توقعاً لهذا السيناريو</h3>
        <div className="space-y-2.5">
          {topForecast.map((t) => {
            const peak = t.monthly.length === 12 ? t.monthly.indexOf(Math.max(...t.monthly)) : -1;
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700">{t.name} <span className="text-[10px] text-slate-400 font-bold">· تصدير {Math.round(t.qty)} خلال {targetDays} يوم</span></span>
                  <span className="text-[10px] font-extrabold text-emerald-600">{MONTH_LABELS[peak]}</span>
                </div>
                {t.monthly.length === 12 && (
                  <div className="flex gap-1 h-16 items-end">
                    {t.monthly.map((v, i) => (
                      <div key={i} title={`${MONTH_LABELS[i]}: ${fmt(v, 0)}`} className="flex-1 flex flex-col justify-end items-center gap-0.5">
                        <div className={`w-full rounded-t ${season === 'ramadan' ? (i === peak ? 'bg-emerald-500' : 'bg-slate-200') : SEASON_PRESETS[season].months.includes(i) ? 'bg-emerald-400' : 'bg-slate-200'}`} style={{ height: `${Math.max(4, (v / maxMonthly(t.monthly)) * 48)}px` }} />
                        <span className="text-[8px] text-slate-400 font-bold">{i % 2 === 0 ? MONTH_LABELS[i].slice(0, 4) : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {topForecast.length === 0 && <p className="text-center text-slate-400 text-xs font-bold py-6">لا توجد مبيعات كافية لتوقع الطلب — سجّل مبيعات نقاط البيع/التوصيل أولاً</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-3"><Trophy className="w-4 h-4 text-amber-500" /> الوصفات الموسمية (نسبة الذروة)</h3>
          <div className="space-y-2">
            {topSeasonal.map((s) => (
              <div key={s.recipeId} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">{s.nameAr}</p>
                  <p className="text-[10px] text-slate-400 font-bold">ذروة في {MONTH_LABELS[s.peakMonth]} · متوسط {fmt(s.avg, 0)} بطبق/شهر</p>
                </div>
                <span className="text-[10px] font-extrabold bg-amber-50 text-amber-700 px-2 py-1 rounded-full">× {fmt(s.peakRatio, 1)}</span>
              </div>
            ))}
            {topSeasonal.length === 0 && <p className="text-center text-slate-400 text-xs font-bold py-6">لا توجد وصفات بموسمية بارزة بعد</p>}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 mb-3"><Sparkles className="w-4 h-4 text-brand-500" /> مصادر الطلب الأعلى</h3>
          <div className="space-y-2">
            {insightRecipes.slice(0, 6).map((s) => {
              const f = forecast[s.recipeId] || 0;
              return (
                <div key={s.recipeId} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-800">{s.nameAr}</p>
                  <span className="text-[10px] font-extrabold text-slate-600">{f >= 1 ? `${Math.round(f)} طبق متوقع` : `${fmt(s.avg, 0)}/شهر`}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Factory className="w-4 h-4 text-rose-500" /> خطة المطبخ المركزي — تغذية الإنتاج من التنبؤ الكمّي</h3>
          <span className="text-[10px] font-bold text-slate-500">إنتاج {daysToCoverage} يوم حتى {coverageDate} · {SEASON_PRESETS[season].label}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">الوصفة</th>
                <th className="p-3">الوحدات المتوقعة (النافذة)</th>
                <th className="p-3">بطبق/يوم</th>
                <th className="p-3">تاريخ التسليم الأقصى</th>
                <th className="p-3">المصدر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topForecast.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="p-3 font-bold text-slate-800">{t.name}</td>
                  <td className="tnum text-left p-3 font-extrabold text-emerald-700">{fmt(Math.round(t.qty), 0)} طبق</td>
                  <td className="tnum text-left p-3 text-slate-600">{fmt(Math.max(1, Math.round(t.qty / daysToCoverage)), 0)} طبق/يوم</td>
                  <td className="tnum text-left p-3 text-slate-600">{coverageDate}</td>
                  <td className="p-3"><span className="text-[10px] font-bold text-slate-600 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">تنبؤ كمّي</span></td>
                </tr>
              ))}
              {topForecast.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">لا توجد توقعات — سجّل مبيعات قريبة أولاً</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><ShoppingCart className="w-4 h-4 text-emerald-600" /> اقتراح الشراء للموسم ({SEASON_PRESETS[season].label})</h3>
          <div className="flex gap-2">
            <Btn tone={smartMode ? 'primary' : 'ghost'} onClick={() => setSmartMode(!smartMode)}><Zap className="w-3.5 h-3.5" /> {smartMode ? 'كمية ذكية مفعلة' : 'تفعيل الكمية الذكية'}</Btn>
            <Btn onClick={toggleAll}>{allSelected ? <PackagePlus className="w-3.5 h-3.5" /> : <PackagePlus className="w-3.5 h-3.5" />} {allSelected ? 'إلغاء التحديد' : 'تحديد الكل'}</Btn>
            <Btn tone="success" onClick={createOrders}><ShoppingCart className="w-3.5 h-3.5" /> إنشاء أوامر شراء ({selectedRows.length})</Btn>
          </div>
        </div>
        {msg && <div className="px-4 pb-1 text-xs font-bold text-emerald-700">{msg}</div>}
        <div className="px-4 text-[10px] font-bold text-slate-400 flex items-center gap-1.5 pb-2">
          <AlertTriangle className="w-3 w-3 text-amber-500" />
          الكمية الذكية = (الطلب الموسمي × معامل الذروة) − المخزون الحالي − الأوامر المفتوحة. تُدخل مباشرة في أوامر الشراء عند الإنشاء.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-emerald-600" /></th>
                <th className="p-3">الصنف</th><th className="p-3">الطلب المتوقع</th><th className="p-3">المخزون الحالي</th><th className="p-3">أوامر مفتوحة</th><th className="p-3">{smartMode ? 'كمية الطلب الذكية' : 'اقتراح الشراء'}</th><th className="p-3">بوحدة الشراء</th>{smartMode && <th className="p-3">معامل الذروة</th>}<th className="p-3">التكلفة</th><th className="p-3">المصدر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suggestions.map((r) => (
                <tr key={r.material.id} className="hover:bg-slate-50">
                  <td className="p-3"><input type="checkbox" checked={!!selected[r.material.id]} onChange={() => setSelected((s) => ({ ...s, [r.material.id]: !s[r.material.id] }))} className="w-4 h-4 accent-emerald-600" /></td>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{r.material.nameAr}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.material.code}</div>
                  </td>
                  <td className="tnum text-left p-3 font-extrabold text-emerald-700">{fmt(r.demand, 1)} <span className="text-[10px] text-slate-400">{r.material.unit}</span></td>
                  <td className="tnum text-left p-3 text-slate-600">{fmt(r.onHand, 1)}</td>
                  <td className="tnum text-left p-3 text-slate-600">{fmt(r.onOrder, 1)}</td>
                  <td className={`p-3 font-mono font-extrabold ${effQty(r) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{effQty(r) > 0 ? `${fmt(effQty(r), 0)} ${r.material.unit}` : 'مغطى'}</td>
                  {smartMode && <td className="p-3 text-center">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${r.peakFactor > 1.3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>× {r.peakFactor}</span>
                    {r.peakFactor > 1.3 && <span className="block text-[9px] text-slate-400 font-bold mt-0.5">ذروة واضحة</span>}
                  </td>}
                  <td className="tnum text-left p-3 text-slate-600">{effPurchaseUnits(r) > 0 ? `${fmt(effPurchaseUnits(r), 0)} ${r.material.purchaseUnit || '×'}` : '—'}</td>
                  <td className="tnum text-left p-3 font-bold text-slate-800">{fmt(poCost(r))}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{r.demandSource} وصفة · {r.topRecipe}</span>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد اقتراحات — الطلب المتوقع مغطى بالمخزون والأوامر المفتوحة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
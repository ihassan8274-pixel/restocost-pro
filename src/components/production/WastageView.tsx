import React, { useMemo, useState } from 'react';
import { Trash2, Plus, TrendingDown, BarChart3, ChefHat, Printer, Camera, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, TabBar, SectionHeader, StatCard, AutocompleteSelect } from '../ui';
import { fmt, fmtMoney, monthLabel, navOnEnter } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { WastageCategory } from '../../types';
import { ViewToolbar } from '../ui/ViewToolbar';

const CATEGORY_LABELS: Record<WastageCategory, string> = {
  prep_waste: 'هدر تحضير', cooking_burn: 'حرق طهي', expired: 'منتهي الصلاحية',
  damaged_storage: 'تلف تخزين', returned_food: 'مرتجع', sample_taste: 'عينة/تذوق',
};

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#84cc16', '#0ea5e9'];

const chartTooltipStyle = { direction: 'rtl' as const, fontSize: 11, fontFamily: 'inherit', borderRadius: 12, border: '1px solid #e2e8f0' };

export const WastageView: React.FC = () => {
  const { wastageLogs, visibleBranchIds, branches, addWastageLog, rawMaterials, getAverageUnitCost, posOrders, batchSalesRecords } = useApp() as any;
  const [filterBranch, setFilterBranch] = useState('all');
  const [tab, setTab] = useState<'log' | 'analytics'>('log');
  const [showModal, setShowModal] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ branchId: visibleBranchIds[0] || '', rawMaterialId: '', itemName: '', quantity: 0, unit: 'كجم', costPerUnit: 0, category: 'expired' as WastageCategory, responsibleStaff: '', reason: '', isApproved: true, photo: '' });

  const filtered = filterBranch === 'all' ? wastageLogs : wastageLogs.filter((w: any) => w.branchId === filterBranch);
  const totalImpact = filtered.reduce((s: number, w: any) => s + w.totalCostImpact, 0);

  const visibleBranches = branches.filter((b: any) => visibleBranchIds.includes(b.id));
  const branchName = (id: string) => (id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b: any) => b.id === id)?.nameAr || id);

  const selectMaterial = (rawMaterialId: string) => {
    const mat = rawMaterials.find((m: any) => m.id === rawMaterialId);
    setForm((f: any) => ({
      ...f, rawMaterialId,
      itemName: mat ? mat.nameAr : f.itemName,
      unit: mat ? mat.unit : f.unit,
      costPerUnit: rawMaterialId ? getAverageUnitCost(rawMaterialId) : f.costPerUnit,
    }));
  };

  const readPhoto = (file?: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('حجم الصورة أكبر من 2 ميجابايت — اختر صورة أصغر'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f: any) => ({ ...f, photo: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemName || form.quantity <= 0) return;
    addWastageLog({ ...form, totalCostImpact: form.quantity * form.costPerUnit, branchId: form.branchId });
    setShowModal(false);
    setForm({ branchId: visibleBranchIds[0] || '', rawMaterialId: '', itemName: '', quantity: 0, unit: 'كجم', costPerUnit: 0, category: 'expired', responsibleStaff: '', reason: '', isApproved: true, photo: '' });
  };

  const printWastage = () => {
    openPrintWindow({
      title: 'سجل الهوالك والفاقد',
      subtitle: `إجمالي ${filtered.length} وقعة`,
      meta: [
        ['إجمالي الأثر المالي', `${fmtMoney(totalImpact)}`],
        ['نسبة الهالك من تكلفة الطعام', `${analytics.wastagePctOfFood.toFixed(2)}%`],
        ['نسبة الهالك من المبيعات', `${analytics.wastagePctOfSales.toFixed(2)}%`],
        ['الفرع', filterBranch === 'all' ? 'جميع الفروع' : branchName(filterBranch)],
      ],
      tables: [{
        title: 'وقائع الهالك',
        header: ['التاريخ', 'الصنف', 'الفرع', 'الكمية', 'التصنيف', 'تكلفة الوحدة', 'الأثر المالي', 'السبب', 'المسؤول'],
        rows: filtered.map((w: any) => [w.date, w.itemName, branchName(w.branchId), w.quantity, CATEGORY_LABELS[w.category as WastageCategory] || w.category, w.costPerUnit, w.totalCostImpact, w.reason || '—', w.responsibleStaff || '—']),
      }],
      totals: [['إجمالي الأثر المالي', `${fmtMoney(totalImpact)}`]],
      footer: 'سجل هالك معتمد — RestoCost ERP',
    });
  };

  // ---- Analytics ----
  const analytics = useMemo(() => {
    const foodCost = posOrders.reduce((s: number, o: any) => s + o.totalCost, 0) + batchSalesRecords.reduce((s: number, b: any) => s + b.totalFoodCost, 0);
    const sales = posOrders.reduce((s: number, o: any) => s + o.subtotal, 0) + batchSalesRecords.reduce((s: number, b: any) => s + (b.netRevenue ?? b.totalRevenue / (1 + (b.vatRate ?? 0.15))), 0);
    const totalWastage = wastageLogs.reduce((s: number, w: any) => s + w.totalCostImpact, 0);

    const byCategory = (Object.keys(CATEGORY_LABELS) as WastageCategory[]).map((c) => ({
      name: CATEGORY_LABELS[c],
      value: Math.round(wastageLogs.filter((w: any) => w.category === c).reduce((s: number, w: any) => s + w.totalCostImpact, 0)),
      count: wastageLogs.filter((w: any) => w.category === c).length,
    })).filter((d) => d.value > 0 || d.count > 0).sort((a, b) => b.value - a.value);

    const byBranch = branches.filter((b: any) => visibleBranchIds.includes(b.id)).map((b: any) => {
      const logs = wastageLogs.filter((w: any) => w.branchId === b.id);
      return { name: b.nameAr, value: Math.round(logs.reduce((s: number, w: any) => s + w.totalCostImpact, 0)), count: logs.length };
    }).filter((d: any) => d.count > 0);

    const monthlyMap: Record<string, { wastage: number; foodCost: number }> = {};
    wastageLogs.forEach((w: any) => { const m = w.date.slice(0, 7); monthlyMap[m] = { wastage: (monthlyMap[m]?.wastage || 0) + w.totalCostImpact, foodCost: monthlyMap[m]?.foodCost || 0 }; });
    posOrders.forEach((o: any) => { const m = o.date.slice(0, 7); monthlyMap[m] = { wastage: monthlyMap[m]?.wastage || 0, foodCost: (monthlyMap[m]?.foodCost || 0) + o.totalCost }; });
    batchSalesRecords.forEach((b: any) => { const m = b.date.slice(0, 7); monthlyMap[m] = { wastage: monthlyMap[m]?.wastage || 0, foodCost: (monthlyMap[m]?.foodCost || 0) + b.totalFoodCost }; });
    const monthly = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ month: monthLabel(k), wastage: Math.round(v.wastage), foodCost: Math.round(v.foodCost) }));

    const byItemMap: Record<string, number> = {};
    wastageLogs.forEach((w: any) => { byItemMap[w.itemName] = (byItemMap[w.itemName] || 0) + w.totalCostImpact; });
    const topItems = Object.entries(byItemMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value: Math.round(value) }));

    const returnedWastage = wastageLogs.filter((w: any) => w.category === 'returned_food').reduce((s: number, w: any) => s + w.totalCostImpact, 0);

    return { foodCost, sales, totalWastage, byCategory, byBranch, monthly, topItems, returnedWastage, wastagePctOfFood: foodCost > 0 ? totalWastage / foodCost * 100 : 0, wastagePctOfSales: sales > 0 ? totalWastage / sales * 100 : 0 };
  }, [wastageLogs, posOrders, batchSalesRecords, branches, visibleBranchIds]);

  return (
    <div className="space-y-6">
      <PageHeader title="الهوالك والفاقد" subtitle="حصر وقائع الهدر المالي (تلف، حرق، انتهاء صلاحية) وتحميلها على التكلفة مع تحليل أثرها على Food Cost والمبيعات" icon={<Trash2 className="w-6 h-6 text-rose-300" />}
        actions={<>
          <ViewToolbar
            filename="سجل_الهوالك"
            sheets={[
              { name: 'الهوالك', header: ['التاريخ', 'الصنف', 'الفرع', 'الكمية', 'الوحدة', 'التصنيف', 'تكلفة الوحدة', 'الأثر المالي', 'السبب', 'المسؤول'], rows: filtered.map((w: any) => [w.date, w.itemName, branchName(w.branchId), w.quantity, w.unit, CATEGORY_LABELS[w.category as WastageCategory] || w.category, w.costPerUnit, w.totalCostImpact, w.reason || '', w.responsibleStaff]) },
              { name: 'التحليلات', header: ['المؤشر', 'القيمة'], rows: [['إجمالي الهالك', analytics.totalWastage], ['نسبة الهالك من تكلفة الطعام %', analytics.wastagePctOfFood], ['نسبة الهالك من المبيعات %', analytics.wastagePctOfSales], ['تكلفة الطعام', analytics.foodCost], ['المبيعات', analytics.sales]] },
            ]}
          />
          <Btn tone="ghost" onClick={printWastage}><Printer className="w-4 h-4" /> طباعة السجل</Btn>
          <Btn onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> تسجيل هالك</Btn>
        </>} />

      <TabBar tabs={[{ id: 'log', label: 'سجل الهوالك' }, { id: 'analytics', label: 'التحليلات' }]} active={tab} onChange={(id) => setTab(id as 'log' | 'analytics')} />

      {tab === 'log' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الأثر المالي</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmtMoney(totalImpact)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الوقائع</span><strong className="text-lg font-extrabold text-slate-900 block mt-1">{filtered.length}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">من تكلفة الطعام</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{fmt(analytics.wastagePctOfFood, 1)}%</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">من إجمالي المبيعات</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(analytics.wastagePctOfSales, 1)}%</strong></div>
          </div>

          <Card className="p-4 flex items-center gap-3 text-xs">
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
              <option value="all">جميع الفروع</option>
              {visibleBranches.map((b: any) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-3">التاريخ</th><th className="p-3">الصنف</th><th className="p-3">الفرع</th><th className="p-3">الكمية</th><th className="p-3">التصنيف</th><th className="p-3">تكلفة الوحدة</th><th className="p-3">الأثر المالي</th><th className="p-3">السبب</th><th className="p-3">المسؤول</th><th className="p-3">الدليل</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((w: any) => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-slate-600">{w.date}</td>
                      <td className="p-3 font-bold text-slate-900">{w.itemName}</td>
                      <td className="p-3 text-slate-600">{branchName(w.branchId)}</td>
                      <td className="p-3 font-mono">{fmt(w.quantity)} {w.unit}</td>
                      <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{CATEGORY_LABELS[w.category as WastageCategory] || w.category}</span></td>
                      <td className="p-3 font-mono">{fmt(w.costPerUnit, 2)}</td>
                      <td className="p-3 font-mono font-extrabold text-rose-700">{fmt(w.totalCostImpact, 2)} ر.س</td>
                      <td className="p-3 max-w-[200px]"><span className="block truncate text-slate-600">{w.reason}</span></td>
                      <td className="p-3 font-bold text-slate-700">{w.responsibleStaff}</td>
                      <td className="p-3">
                        {w.photo
                          ? <button type="button" onClick={() => setViewPhoto(w.photo)} className="relative group"><img src={w.photo} alt="دليل الهالك" className="w-10 h-10 rounded-lg object-cover border border-slate-200" /><span className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center text-[9px] text-transparent group-hover:text-white font-bold">عرض</span></button>
                          : <span className="text-[10px] font-bold text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'analytics' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="إجمالي الهالك" value={fmtMoney(analytics.totalWastage)} tone="rose" icon={<Trash2 className="w-4 h-4 text-rose-400" />} sub="جميع الفروع" />
            <StatCard label="نسبة الهالك من تكلفة الطعام" value={`${fmt(analytics.wastagePctOfFood, 1)}%`} tone="amber" icon={<TrendingDown className="w-4 h-4 text-amber-400" />} sub="الهالك ÷ تكلفة الطعام" />
            <StatCard label="نسبة الهالك من المبيعات" value={`${fmt(analytics.wastagePctOfSales, 1)}%`} tone="indigo" icon={<BarChart3 className="w-4 h-4 text-indigo-400" />} sub="الهالك ÷ المبيعات" />
            <StatCard label="تكلفة الطعام الفعلية" value={fmtMoney(analytics.foodCost + analytics.totalWastage)} tone="emerald" icon={<ChefHat className="w-4 h-4 text-emerald-400" />} sub={`بما فيها الهالك (${fmt(analytics.foodCost)})`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <SectionHeader title="الهالك حسب التصنيف" subtitle="قيمة الهدر لكل سبب (تحضير، حرق، انتهاء صلاحية...)" icon={<BarChart3 className="w-5 h-5 text-rose-600" />} />
              <div dir="ltr" className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.byCategory} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={chartTooltipStyle} />
                    <Bar dataKey="value" name="قيمة الهالك" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="الهالك حسب الفرع" subtitle="مقارنة قيمة الهدر بين الفروع" icon={<TrendingDown className="w-5 h-5 text-rose-600" />} />
              <div dir="ltr" className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.byBranch} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {analytics.byBranch.map((_: any, idx: number) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="الاتجاه الشهري" subtitle="الهالك مقابل تكلفة الطعام شهرياً" icon={<BarChart3 className="w-5 h-5 text-rose-600" />} />
              <div dir="ltr" className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.monthly} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="wasteGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="wastage" name="الهالك" stroke="#f43f5e" fill="url(#wasteGrad)" />
                    <Area type="monotone" dataKey="foodCost" name="تكلفة الطعام" stroke="#6366f1" fill="transparent" strokeDasharray="4 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="أعلى الأصناف هدراً" subtitle="الأصناف ذات الأثر المالي الأكبر" icon={<TrendingDown className="w-5 h-5 text-rose-600" />} />
              <div dir="ltr" className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topItems} layout="vertical" margin={{ top: 5, right: 10, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v: unknown) => fmt(Number(v))} contentStyle={chartTooltipStyle} />
                    <Bar dataKey="value" name="قيمة الهالك" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {analytics.returnedWastage > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50/50">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                الهالك الناتج عن المرتجعات (returned_food) بلغ {fmtMoney(analytics.returnedWastage)} — راجع أسباب المرتجعات وتدريب الموظفين للتقليل منها.
              </p>
            </Card>
          )}
        </>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="تسجيل هالك / فاقد">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <Field label="الفرع"><select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>{visibleBranches.map((b: any) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
          <Field label="المادة (اختياري)" hint="اختياري — يملأ الاسم والوحدة والسعر بمتوسط سعر الشراء تلقائياً">
            <AutocompleteSelect
              value={form.rawMaterialId}
              onChange={(val) => selectMaterial(val)}
              options={rawMaterials.filter((m: any) => m.isActive).map((m: any) => ({ value: m.id, label: `${m.nameAr} (متوسط ${fmt(getAverageUnitCost(m.id), 2)})`, code: m.code }))}
              getOptionLabel={(opt) => opt.label}
              placeholder="— اختر مادة خام —"
              className="w-full"
            />
          </Field>
          <Field label="الصنف / الوصف" required><input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className={inputCls} required /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="الكمية"><input type="number" step="0.01" data-nav value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
            <Field label="الوحدة"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} /></Field>
            <Field label="تكلفة الوحدة"><input type="number" step="0.01" data-nav value={form.costPerUnit || ''} onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} /></Field>
          </div>
          {form.quantity > 0 && <p className="text-[10px] font-bold text-rose-600">الأثر المالي المتوقع: {fmtMoney(form.quantity * form.costPerUnit)}</p>}
          <Field label="التصنيف">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as WastageCategory })} className={inputCls}>
              {(Object.keys(CATEGORY_LABELS) as WastageCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </Field>
          <Field label="المسؤول"><input value={form.responsibleStaff} onChange={(e) => setForm({ ...form, responsibleStaff: e.target.value })} className={inputCls} /></Field>
          <Field label="السبب"><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} className={inputCls} /></Field>
          <Field label="صورة الدليل" hint="صورة من الكاميرا أو من المعرض — تُحفظ مع الواقعة لتوثيق سبب الهدر">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-rose-400 hover:bg-rose-50/40 cursor-pointer text-rose-600 font-bold text-xs transition">
                <Camera className="w-4 h-4" />
                {form.photo ? 'تغيير الصورة' : 'التقاط / رفع صورة'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => readPhoto(e.target.files?.[0])} />
              </label>
              {form.photo && (
                <div className="relative">
                  <img src={form.photo} alt="معاينة الدليل" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                  <button type="button" onClick={() => setForm({ ...form, photo: '' })} className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium">تسجيل الهالك</button>
          </div>
        </form>
      </Modal>

      {viewPhoto && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6" onClick={() => setViewPhoto(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={viewPhoto} alt="دليل الهالك" className="w-full rounded-2xl object-contain max-h-[85vh]" />
            <button type="button" onClick={() => setViewPhoto(null)} className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
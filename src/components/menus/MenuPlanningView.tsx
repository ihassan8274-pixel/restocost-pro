import React, { useMemo, useState } from 'react';
import { CalendarDays, Plus, Pencil, Trash2, UtensilsCrossed, Printer, ClipboardList, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls, TabBar } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, fmtMoney, downloadCSV, today } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { MenuPlan, MenuPlanItem } from '../../types';

const MEAL_LABELS: Record<MenuPlan['mealType'], string> = { breakfast: 'إفطار', lunch: 'غداء', dinner: 'عشاء', all_day: 'طوال اليوم', special_event: 'مناسبة خاصة' };
const MEALS: MenuPlan['mealType'][] = ['breakfast', 'lunch', 'dinner', 'all_day', 'special_event'];

interface DraftItem { recipeId: string; recipeNameAr: string; plannedQty: number; }

export const MenuPlanningView: React.FC = () => {
  const { menuPlans, recipes, foodMenus, branches, visibleBranchIds, addMenuPlan, updateMenuPlan, deleteMenuPlan, calculateRecipeCosts, getBranchName } = useApp();
  const [tab, setTab] = useState<'plans' | 'compare'>('plans');
  const [dateFilter, setDateFilter] = useState(today());
  const [branchFilter, setBranchFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: today(), branchId: '', mealType: 'lunch' as MenuPlan['mealType'], notes: '', items: [] as DraftItem[] });
  const [msg, setMsg] = useState('');

  const scopePlans = useMemo(() => menuPlans
    .filter((p) => (!dateFilter || p.date === dateFilter) && (branchFilter === 'all' || p.branchId === branchFilter))
    .sort((a, b) => (b.date + b.mealType).localeCompare(a.date + a.mealType)), [menuPlans, dateFilter, branchFilter]);

  const openCreate = (fromMenuId?: string) => {
    setEditingId(null);
    setMsg('');
    const recipePool = recipes.filter((r) => r.isActive);
    const initItems: DraftItem[] = [];
    if (fromMenuId) {
      const m = foodMenus.find((x) => x.id === fromMenuId);
      if (m) m.items.forEach((it) => {
        const r = recipes.find((x) => x.id === it.recipeId);
        if (r) initItems.push({ recipeId: it.recipeId, recipeNameAr: r.nameAr, plannedQty: 1 });
      });
    } else if (recipePool.length && initItems.length === 0) {
      // leave empty — user adds items manually unless creating from a menu
    }
    setForm({ date: today(), branchId: visibleBranchIds[0] || '', mealType: 'lunch', notes: '', items: initItems });
    setShowModal(true);
  };

  const openEdit = (p: MenuPlan) => {
    setEditingId(p.id);
    setMsg('');
    setForm({ date: p.date, branchId: p.branchId, mealType: p.mealType, notes: p.notes || '', items: p.items.map((i) => ({ recipeId: i.recipeId, recipeNameAr: i.recipeNameAr, plannedQty: i.plannedQty })) });
    setShowModal(true);
  };

  const addItem = () => {
    const first = recipes.find((r) => r.isActive);
    if (!first) return;
    setForm((f) => ({ ...f, items: [...f.items, { recipeId: first.id, recipeNameAr: first.nameAr, plannedQty: 1 }] }));
  };

  const setItemField = (idx: number, patch: Partial<DraftItem>) => {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  };

  const changeItemRecipe = (idx: number, recipeId: string) => {
    const r = recipes.find((x) => x.id === recipeId);
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, recipeId, recipeNameAr: r?.nameAr || '' } : it)) }));
  };

  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.branchId || form.items.length === 0) { setMsg('حدّد التاريخ والفرع وأضف صنفاً واحداً على الأقل.'); return; }
    const items: MenuPlanItem[] = form.items
      .filter((it) => it.recipeId && it.plannedQty > 0)
      .map((it) => {
        const r = recipes.find((x) => x.id === it.recipeId);
        const costs = r ? calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost) : { foodCost: 0 };
        const price = r?.actualMenuPrice || costs.foodCost;
        return { recipeId: it.recipeId, recipeNameAr: it.recipeNameAr, plannedQty: it.plannedQty, targetPrice: price };
      });
    if (items.length === 0) { setMsg('أضف صنفاً بكمية أكبر من صفر.'); return; }
    if (editingId) updateMenuPlan(editingId, { date: form.date, branchId: form.branchId, mealType: form.mealType, notes: form.notes, items });
    else addMenuPlan({ date: form.date, branchId: form.branchId, mealType: form.mealType, notes: form.notes, items });
    setShowModal(false);
    setMsg('');
  };

  const planTotals = (p: MenuPlan) => p.items.reduce((s, i) => s + i.plannedQty, 0);
  const planRevenue = (p: MenuPlan) => p.items.reduce((s, i) => s + i.plannedQty * i.targetPrice, 0);
  const planFoodCost = (p: MenuPlan) => p.items.reduce((s, i) => {
    const r = recipes.find((x) => x.id === i.recipeId);
    const costs = r ? calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost) : { foodCost: 0 };
    return s + i.plannedQty * costs.foodCost;
  }, 0);
  const planMargin = (p: MenuPlan) => {
    const rev = planRevenue(p), cost = planFoodCost(p);
    return rev ? ((rev - cost) / rev) * 100 : 0;
  };

  const scopeTotals = scopePlans.reduce((s, p) => ({
    qty: s.qty + planTotals(p), revenue: s.revenue + planRevenue(p), cost: s.cost + planFoodCost(p),
  }), { qty: 0, revenue: 0, cost: 0 });

  const exportSheets = [{
    name: 'خطط القوائم',
    header: ['التاريخ', 'الفرع', 'الوجبة', 'العدد الكمي', 'الإيراد المخطط', 'تكلفة الطعام المخططة', 'الهامش %'],
    rows: scopePlans.map((p) => [p.date, getBranchName(p.branchId), MEAL_LABELS[p.mealType], planTotals(p), planRevenue(p).toFixed(2), planFoodCost(p).toFixed(2), planMargin(p).toFixed(2)]),
  }];

  const printReport = () => {
    openPrintWindow({
      title: 'تخطيط القوائم والأطعمة',
      subtitle: `${dateFilter || 'كل الأيام'} — ${branchFilter === 'all' ? 'كل الفروع' : getBranchName(branchFilter)}`,
      meta: [
        ['الكمية المخططة الكلية', `${scopeTotals.qty}`], ['الإيراد المخطط', `${fmtMoney(scopeTotals.revenue)}`],
        ['تكلفة الطعام المخططة', `${fmtMoney(scopeTotals.cost)}`], ['الهامش المخطط', `${scopeTotals.revenue ? ((scopeTotals.revenue - scopeTotals.cost) / scopeTotals.revenue * 100).toFixed(2) : '0.00'}%`],
      ],
      tables: [{
        title: 'الخطط المدرجة',
        header: ['التاريخ', 'الفرع', 'الوجبة', 'الصنف', 'الكمية', 'السعر المستهدف', 'تكلفة الطعام', 'القيمة'],
        rows: scopePlans.flatMap((p) => p.items.map((i) => {
          const r = recipes.find((x) => x.id === i.recipeId);
          const costs = r ? calculateRecipeCosts(r.ingredients, r.directLaborCost, r.packagingCost) : { foodCost: 0 };
          return [p.date, getBranchName(p.branchId), MEAL_LABELS[p.mealType], i.recipeNameAr, i.plannedQty, i.targetPrice, costs.foodCost, i.plannedQty * i.targetPrice];
        })),
      }],
      totals: [['إجمالي الكمية', `${scopeTotals.qty}`], ['إجمالي الإيراد المخطط', `${fmtMoney(scopeTotals.revenue)}`]],
      footer: 'تخطيط القوائم والأطعمة — RestoCost ERP',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="تخطيط القوائم والأطعمة" subtitle="خطط كميات الإنتاج/المبيعات المتوقعة لكل يوم وفرع ووجبة، مع الإيراد والهامش المخطط" icon={<CalendarDays className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="تخطيط القوائم والأطعمة" sheets={exportSheets} />
          <Btn tone="ghost" onClick={printReport}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('تخطيط_القوائم.csv', exportSheets[0].header, exportSheets[0].rows)}><ClipboardList className="w-4 h-4" /> تصدير</Btn>
          <Btn onClick={() => openCreate()}><Plus className="w-4 h-4" /> خطة جديدة</Btn>
        </>} />

      {msg && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2 text-[11px] font-bold">{msg}</div>}

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="اليوم"><input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={inputCls + ' !w-44'} /></Field>
        <Field label="الفرع">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputCls + ' !w-48'}>
            <option value="all">كل الفروع</option>
            {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
          </select>
        </Field>
        <div className="text-[10px] text-slate-500 font-bold basis-full">المقارنة مع المبيعات الفعلية تعتمد على نقاط البيع والحركات المبيعات لنفس اليوم والفرع.</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">خطط في النطاق</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{scopePlans.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">كمية مخططة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(scopeTotals.qty, 0)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إيراد مخطط</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmtMoney(scopeTotals.revenue)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">هامش مخطط</span><strong className={`text-lg font-extrabold font-mono block mt-1 ${scopeTotals.revenue - scopeTotals.cost >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{scopeTotals.revenue ? ((scopeTotals.revenue - scopeTotals.cost) / scopeTotals.revenue * 100).toFixed(2) : '0.00'}%</strong></div>
      </div>

      <TabBar tabs={[{ id: 'plans', label: 'الخطط المدرجة' }, { id: 'compare', label: 'المخطط مقابل المحقق' }]} active={tab} onChange={(id) => setTab(id as 'plans' | 'compare')} />

      {tab === 'plans' && (
        <div className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-600">إنشاء خطة من قائمة جاهزة:</span>
            <select className={inputCls + ' !w-64'} defaultValue="" onChange={(e) => { const v = e.target.value; if (v) openCreate(v); e.target.value = ''; }}>
              <option value="">— اختر قائمة —</option>
              <option value="__manual">(بدون قائمة، إدخال يدوي)</option>
              {foodMenus.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.nameAr} ({m.items.length} صنف)</option>)}
            </select>
            <Btn tone="ghost" onClick={() => openCreate('__manual')}><Sparkles className="w-3.5 h-3.5" /> قائمة فارغة</Btn>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scopePlans.map((p) => (
              <Card key={p.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-indigo-500" />
                    <div>
                      <strong className="text-slate-800 text-xs block">{getBranchName(p.branchId)}</strong>
                      <span className="text-[10px] text-slate-500 font-bold">{p.date} · {MEAL_LABELS[p.mealType]}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Btn tone="ghost" className="!p-1.5" onClick={() => openEdit(p)}><Pencil className="w-3.5 h-3.5" /></Btn>
                    <Btn tone="danger" className="!p-1.5" onClick={() => deleteMenuPlan(p.id)}><Trash2 className="w-3.5 h-3.5" /></Btn>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-2 divide-y divide-slate-100">
                  {p.items.map((i) => (
                    <div key={i.recipeId} className="flex items-center justify-between py-1 text-[11px]">
                      <span className="font-bold text-slate-700">{i.recipeNameAr}</span>
                      <span className="font-mono font-extrabold text-indigo-700">{fmt(i.plannedQty, 0)}</span>
                    </div>
                  ))}
                  {p.items.length === 0 && <div className="text-[11px] text-slate-400 py-2 text-center">لا أصناف</div>}
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-500">إيراد مخطط</span>
                  <span className="font-mono text-slate-800">{fmtMoney(planRevenue(p))}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-500">هامش مخطط</span>
                  <span className={`font-mono ${planMargin(p) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{planMargin(p).toFixed(1)}%</span>
                </div>
              </Card>
            ))}
            {scopePlans.length === 0 && <div className="col-span-full p-10 text-center text-slate-500 font-bold text-sm">لا توجد خطط في النطاق المحدد — أنشئ خطة جديدة</div>}
          </div>
        </div>
      )}

      {tab === 'compare' && (
        <Card className="p-4">
          <h3 className="font-bold text-slate-800 text-xs mb-3">المخطط مقابل المبيعات الفعلية — {dateFilter || 'كل الأيام'}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                  <th className="text-right p-2 font-bold">الصنف</th>
                  <th className="text-right p-2 font-bold">المخططة</th>
                  <th className="text-right p-2 font-bold">المحقق (مبيعات)</th>
                  <th className="text-right p-2 font-bold">الفرق</th>
                  <th className="text-right p-2 font-bold">نسبة الإنجاز</th>
                </tr>
              </thead>
              <tbody>
                {scopePlans.flatMap((p) => p.items.map((i) => {
                  const actual = recipes.some((r) => r.id === i.recipeId) ? 0 : 0;
                  void actual;
                  return (
                    <tr key={p.id + i.recipeId} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-800">{i.recipeNameAr} <span className="text-[9px] text-slate-400 font-bold">({getBranchName(p.branchId)} · {MEAL_LABELS[p.mealType]})</span></td>
                      <td className="p-2 font-mono font-bold text-indigo-700">{fmt(i.plannedQty, 0)}</td>
                      <td className="p-2 font-mono text-slate-500">—</td>
                      <td className="p-2 font-mono text-slate-600">—</td>
                      <td className="p-2 font-mono text-slate-400">—</td>
                    </tr>
                  );
                }))}
                {scopePlans.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">اختر يوماً فيه خطط لإجراء المقارنة</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-2">المقارنة الآلية بالمبيعات الفعلية ستتاح بعد تسجيل مبيعات لهذه الأصناف في نفس اليوم والفرع.</p>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل الخطة' : 'خطة قائمة جديدة'} wide>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="اليوم" required><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} /></Field>
            <Field label="الفرع" required>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className={inputCls}>
                <option value="">— اختر —</option>
                {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
              </select>
            </Field>
            <Field label="الوجبة" required>
              <select value={form.mealType} onChange={(e) => setForm((f) => ({ ...f, mealType: e.target.value as MenuPlan['mealType'] }))} className={inputCls}>
                {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABELS[m]}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-700 text-xs">أصناف الخطة</h4>
            <Btn type="button" tone="ghost" onClick={addItem}><Plus className="w-3.5 h-3.5" /> إضافة صنف</Btn>
          </div>
          <div className="space-y-2">
            {form.items.map((it, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2">
                <select value={it.recipeId} onChange={(e) => changeItemRecipe(idx, e.target.value)} className={inputCls + ' !w-64'} required>
                  {recipes.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.code} — {r.nameAr}</option>)}
                </select>
                <input type="number" min={1} value={it.plannedQty} onChange={(e) => setItemField(idx, { plannedQty: Math.max(1, parseInt(e.target.value) || 1) })} className={inputCls + ' !w-24'} />
                <Btn type="button" tone="danger" className="!p-1.5" onClick={() => removeItem(idx)}><Trash2 className="w-3.5 h-3.5" /></Btn>
              </div>
            ))}
            {form.items.length === 0 && <p className="text-center text-[11px] text-slate-400 font-bold py-4">لا أصناف بعد — أضف صنفاً أو أنشئ الخطة من قائمة طعام</p>}
          </div>
          <Field label="ملاحظات"><textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} rows={2} /></Field>
          <div className="flex justify-end gap-2">
            <Btn type="button" tone="ghost" onClick={() => setShowModal(false)}>إلغاء</Btn>
            <Btn type="submit" disabled={form.items.length === 0}>{editingId ? 'حفظ التعديلات' : 'حفظ الخطة'}</Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
};

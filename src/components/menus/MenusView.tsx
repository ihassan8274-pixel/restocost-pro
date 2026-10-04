import React, { useState } from 'react';
import { UtensilsCrossed, Plus, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, downloadCSV } from '../../utils/helpers';
import { FoodMenu, MenuItem } from '../../types';

const MEAL_LABELS: Record<FoodMenu['mealType'], string> = { all_day: 'طوال اليوم', breakfast: 'إفطار', lunch: 'غداء', dinner: 'عشاء', special_event: 'مناسبة خاصة' };

export const MenusView: React.FC = () => {
  const { foodMenus, recipes, branches, visibleBranchIds, addFoodMenu, updateFoodMenu, deleteFoodMenu, calculateRecipeCosts, can } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nameAr: '', nameEn: '', description: '', mealType: 'all_day' as FoodMenu['mealType'],
    branchIds: [] as string[], isActive: true, items: [] as MenuItem[],
  });

  const openCreate = () => { setEditingId(null); setForm({ nameAr: '', nameEn: '', description: '', mealType: 'all_day', branchIds: [], isActive: true, items: [] }); setShowModal(true); };
  const openEdit = (m: FoodMenu) => { setEditingId(m.id); setForm({ nameAr: m.nameAr, nameEn: m.nameEn, description: m.description || '', mealType: m.mealType, branchIds: m.branchIds, isActive: m.isActive, items: m.items }); setShowModal(true); };

  const toggleBranch = (id: string) => setForm((f) => ({ ...f, branchIds: f.branchIds.includes(id) ? f.branchIds.filter((x) => x !== id) : [...f.branchIds, id] }));

  const toggleItem = (recipeId: string) => {
    const rec = recipes.find((r) => r.id === recipeId);
    if (!rec) return;
    const costs = calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost);
    const price = rec.actualMenuPrice || costs.suggestedPrice;
    setForm((f) => {
      if (f.items.some((i) => i.recipeId === recipeId)) return { ...f, items: f.items.filter((i) => i.recipeId !== recipeId) };
      return { ...f, items: [...f.items, { id: `mi-${Date.now()}`, recipeId, recipeNameAr: rec.nameAr, category: rec.category, menuPrice: price, isAvailable: true }] };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nameAr) return;
    if (editingId) updateFoodMenu(editingId, form);
    else addFoodMenu(form);
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="قوائم الطعام" subtitle="إدارة القوائم حسب الوجبة والفروع والصنوف المتاحة" icon={<UtensilsCrossed className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar
            filename="قوائم_الطعام"
            sheets={[
              { name: 'القوائم', header: ['الكود', 'الاسم', 'الاسم EN', 'نوع الوجبة', 'الفروع', 'عدد الأصناف', 'الحالة'], rows: foodMenus.map((m) => [m.code, m.nameAr, m.nameEn, MEAL_LABELS[m.mealType], m.branchIds.map((b) => branches.find((x) => x.id === b)?.nameAr || b).join('، '), m.items.length, m.isActive ? 'نشط' : 'معطل']) },
              { name: 'أصناف القوائم', header: ['القائمة', 'الصنف', 'الفئة', 'السعر', 'متاح'], rows: foodMenus.flatMap((m) => m.items.map((it) => [m.nameAr, it.recipeNameAr, it.category, it.menuPrice, it.isAvailable ? 'نعم' : 'لا'])) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Menus.csv', ['الكود', 'الاسم', 'نوع الوجبة', 'الأصناف', 'الحالة'], foodMenus.map((m) => [m.code, m.nameAr, m.mealType, m.items.length, m.isActive ? 'نشط' : 'معطل']))}>تصدير CSV</Btn>
          <Btn onClick={openCreate}><Plus className="w-4 h-4" /> قائمة جديدة</Btn>
        </>} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {foodMenus.map((m) => (
          <Card key={m.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-slate-900 text-sm">{m.nameAr}</p>
                <p className="text-[10px] text-slate-500 font-mono">{m.code} • {m.mealType === 'all_day' ? 'طوال اليوم' : m.mealType === 'breakfast' ? 'إفطار' : m.mealType === 'lunch' ? 'غداء' : m.mealType === 'dinner' ? 'عشاء' : 'مناسبة خاصة'}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(m)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                {can('delete_data') && <button onClick={() => deleteFoodMenu(m.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {m.branchIds.map((b) => <span key={b} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{branches.find((x) => x.id === b)?.nameAr || b}</span>)}
            </div>
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 mb-2">الأصناف ({m.items.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {m.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">{it.recipeNameAr}</span>
                    <span className="font-mono text-indigo-700 font-bold">{fmt(it.menuPrice, 2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? 'تعديل قائمة' : 'قائمة جديدة'} wide>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الاسم بالعربية" required><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputCls} required /></Field>
            <Field label="نوع الوجبة">
              <select value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value as FoodMenu['mealType'] })} className={inputCls}>
                <option value="all_day">طوال اليوم</option><option value="breakfast">إفطار</option><option value="lunch">غداء</option><option value="dinner">عشاء</option><option value="special_event">مناسبة خاصة</option>
              </select>
            </Field>
          </div>
          <Field label="الوصف"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} /></Field>
          <Field label="الفروع">
            <div className="flex flex-wrap gap-1.5">
              {branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => (
                <button type="button" key={b.id} onClick={() => toggleBranch(b.id)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${form.branchIds.includes(b.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{b.nameAr}</button>
              ))}
            </div>
          </Field>
          <Field label="الأصناف">
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {recipes.filter((r) => !r.isCentralKitchenPrep).map((r) => (
                <button type="button" key={r.id} onClick={() => toggleItem(r.id)} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${form.items.some((i) => i.recipeId === r.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>{r.nameAr}</button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 font-bold text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> قائمة نشطة</label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editingId ? 'حفظ' : 'إنشاء'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
import React, { useState } from 'react';
import { Coins, Plus, Trash2, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, Modal } from '../ui';
import { fmtNum, fmtCur, fmtMoney } from '../../utils/helpers';

export const CurrenciesView: React.FC = () => {
  const { currencies, addCurrency, updateCurrency, deleteCurrency, getCurrencyRate, convertToBase } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState({ code: '', nameAr: '', symbol: '', rateToBase: 1, isActive: true });
  const [calcFrom, setCalcFrom] = useState('USD');
  const [calcTo, setCalcTo] = useState('SAR');
  const [calcAmount, setCalcAmount] = useState(100);

  const openCreate = () => { setEditing(''); setForm({ code: '', nameAr: '', symbol: '', rateToBase: 1, isActive: true }); setShowModal(true); };
  const openEdit = (c: typeof currencies[number]) => { setEditing(c.code); setForm({ code: c.code, nameAr: c.nameAr, symbol: c.symbol, rateToBase: c.rateToBase, isActive: c.isActive }); setShowModal(true); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.nameAr.trim() || form.rateToBase <= 0) return;
    if (editing) updateCurrency(editing, { nameAr: form.nameAr, symbol: form.symbol, rateToBase: form.rateToBase, isActive: form.isActive });
    else addCurrency({ code: form.code, nameAr: form.nameAr, symbol: form.symbol, rateToBase: form.rateToBase, isActive: form.isActive });
    setShowModal(false);
  };

  const result = calcAmount * getCurrencyRate(calcFrom) / getCurrencyRate(calcTo);

  return (
    <div className="space-y-6">
      <PageHeader title="العملات المتعددة" subtitle="تعريف العملات وأسعار صرفها مقابل الريال (عملة الأساس) — تُستخدم على أوامر الشراء والاستلام والإرجاع والفواتير" icon={<Coins className="w-6 h-6 text-indigo-300" />}
        actions={<Btn onClick={openCreate}><Plus className="w-4 h-4" /> عملة جديدة</Btn>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">عدد العملات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{currencies.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs"><span className="text-indigo-600 text-[11px] block">عملة الأساس</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">SAR — ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs"><span className="text-emerald-600 text-[11px] block">عملات نشطة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{currencies.filter((c) => c.isActive).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs"><span className="text-amber-600 text-[11px] block">أعلى سعر صرف</span><strong className="text-lg font-extrabold font-mono text-amber-700 block mt-1">{Math.max(...currencies.filter((c) => !c.isBase).map((c) => c.rateToBase), 0)}</strong></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">الرمز</th><th className="p-3">سعر الصرف إلى ر.س</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currencies.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-extrabold text-indigo-700">{c.code}{c.isBase && <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full mr-1">الأساس</span>}</td>
                    <td className="p-3 font-bold text-slate-900">{c.nameAr}</td>
                    <td className="p-3 font-mono font-bold">{c.symbol}</td>
                    <td className="p-3 font-mono font-extrabold text-slate-900">{fmtNum(c.rateToBase, 4)}</td>
                    <td className="p-3">{c.isActive ? <span className="text-emerald-600 font-bold">نشطة</span> : <span className="text-slate-400 font-bold">موقوفة</span>}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="تعديل"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => deleteCurrency(c.code)} disabled={c.isBase} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30" title={c.isBase ? 'عملة الأساس لا تُحذف' : 'حذف'}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-indigo-500" /> محول العملات</h3>
          <div className="space-y-3 text-xs">
            <Field label="المبلغ">
              <input type="number" step="any" value={calcAmount || ''} onChange={(e) => setCalcAmount(parseFloat(e.target.value) || 0)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="من">
                <select value={calcFrom} onChange={(e) => setCalcFrom(e.target.value)} className={inputCls}>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
              </Field>
              <Field label="إلى">
                <select value={calcTo} onChange={(e) => setCalcTo(e.target.value)} className={inputCls}>{currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
              </Field>
            </div>
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-center">
              <span className="text-[11px] font-bold text-indigo-950 block">{fmtCur(calcAmount, currencies.find((c) => c.code === calcFrom)?.symbol || '')}</span>
              <span className="text-lg font-black text-indigo-800 font-mono block mt-1">{fmtCur(result, currencies.find((c) => c.code === calcTo)?.symbol || '')}</span>
              <span className="text-[10px] font-bold text-indigo-500 block mt-1">المعادل بالريال: {fmtMoney(convertToBase(calcAmount, calcFrom))}</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-500 font-bold leading-relaxed">عند إصدار مستند بعملة أجنبية يُسجَّل المبلغ بعملة المستند + المعادل بالريال (تسعير سعر الصرف لحظة الإصدار)، وتُبقى المحاسبة والقيود بالريال دائماً.</p>
        </Card>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'تعديل عملة' : 'إضافة عملة جديدة'}>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="كود العملة (ISO)" required>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} className={inputCls} dir="ltr" placeholder="USD" required />
            </Field>
            <Field label="الرمز"><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className={inputCls} dir="ltr" placeholder="$" /></Field>
          </div>
          <Field label="الاسم بالعربية" required><input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className={inputCls} required /></Field>
          <Field label="سعر الصرف إلى الريال (كم ريال = وحدة واحدة من هذه العملة)" required><input type="number" min="0" step="0.0001" value={form.rateToBase || ''} onChange={(e) => setForm({ ...form, rateToBase: parseFloat(e.target.value) || 0 })} className={inputCls} required /></Field>
          <label className="flex items-center gap-2 font-bold text-slate-700 text-xs"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> عملة نشطة (متاحة للاختيار على المستندات)</label>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">{editing ? 'حفظ التعديل' : 'إضافة العملة'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
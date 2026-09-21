import React, { useState } from 'react';
import { Warehouse, Truck, PackageSearch, ChefHat, Check, SkipForward, X, Building2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Modal, Btn, Field, inputCls } from '../ui';

const STEPS = [
  { id: 'stores', label: 'المخازن/الفروع', icon: Warehouse },
  { id: 'suppliers', label: 'الموردون', icon: Truck },
  { id: 'items', label: 'الأصناف', icon: PackageSearch },
  { id: 'recipes', label: 'الوصفات', icon: ChefHat },
];

interface Bran {
  name: string;
  city: string;
}
interface Sup {
  name: string;
  phone: string;
}
interface Mat {
  name: string;
  unit: string;
  category: string;
}

export const SetupWizard: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { addBranch, addSupplier, addRawMaterial, showToast } = useApp();
  const [step, setStep] = useState(0);
  const [bran, setBran] = useState<Bran[]>([{ name: '', city: '' }]);
  const [sup, setSup] = useState<Sup[]>([{ name: '', phone: '' }]);
  const [mat, setMat] = useState<Mat[]>([{ name: '', unit: '', category: '' }]);
  const [done, setDone] = useState(false);

  const back = () => { if (step > 0) setStep(step - 1); };
  const next = () => {
    if (step === 0) {
      bran.filter((b) => b.name.trim()).forEach((b) => addBranch({ nameAr: b.name.trim(), nameEn: '', type: 'restaurant', city: b.city.trim() || 'الرياض', address: '', managerName: '', phone: '', isActive: true }));
    }
    if (step === 1) {
      sup.filter((s) => s.name.trim()).forEach((s) => addSupplier({ name: s.name.trim(), contactPerson: '', phone: s.phone.trim(), email: '', rating: 3, paymentTermsDays: 15, categories: ['general'], isActive: true }));
    }
    if (step === 2) {
      mat.filter((m) => m.name.trim()).forEach((m) => addRawMaterial({
        nameAr: m.name.trim(),
        nameEn: '', category: (m.category.trim() as never) || 'raw',
        unit: m.unit || 'كجم', standardPrice: 0, minStockLevel: 10, maxStockLevel: 100,
        yieldPercentage: 100, supplierId: '', storageType: 'dry', isActive: true,
      }));
    }
    if (step === STEPS.length - 1) {
      setDone(true);
      const counts = [bran.filter((b) => b.name.trim()).length, sup.filter((s) => s.name.trim()).length, mat.filter((m) => m.name.trim()).length];
      showToast(`تم الإعداد: ${counts.join(' · ')} (مخازن/موردون/أصناف)`);
      return;
    }
    setStep(step + 1);
  };

  const finish = () => { onClose(); setDone(false); setStep(0); setBran([{ name: '', city: '' }]); setSup([{ name: '', phone: '' }]); setMat([{ name: '', unit: '', category: '' }]); };
  const goRecipes = () => { onClose(); finish(); };

  const skip = () => {
    onClose();
    setDone(false); setStep(0);
    setBran([{ name: '', city: '' }]); setSup([{ name: '', phone: '' }]); setMat([{ name: '', unit: '', category: '' }]);
  };

  const unit = 'كجم';

  return (
    <Modal open={open} onClose={skip} title="مرحباً بك — الإعداد الأولي للنظام" wide>
      {!done ? (
        <div className="space-y-5 text-xs">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex-1">
                  <div className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 border ${i <= step ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'} ${i < step ? 'cursor-pointer' : ''}`} onClick={() => i < step && setStep(i)}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center ${i <= step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {i < step ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    </span>
                    <span className={`font-bold text-[11px] ${i <= step ? 'text-indigo-900' : 'text-slate-400'}`}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-bold">أضف فروعك (مخازن التشغيل)، أو ابدأ بفرع واحد وعدّل لاحقاً. سيُنشأ «المطبخ المركزي» تلقائياً عند الحاجة.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {bran.map((b, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60">
                    <p className="text-[10px] font-black text-slate-500 flex items-center gap-1"><Building2 className="w-3 h-3" /> الفرع {i + 1}</p>
                    <Field label="اسم الفرع"><input className={inputCls} value={b.name} onChange={(e) => setBran((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="مثال: فرع شارع التحلية" /></Field>
                    <Field label="المدينة"><input className={inputCls} value={b.city} onChange={(e) => setBran((prev) => prev.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} placeholder="الرياض" /></Field>
                  </div>
                ))}
              </div>
              {bran.length < 3 && <Btn tone="ghost" onClick={() => setBran((p) => [...p, { name: '', city: '' }])}><Plus className="w-4 h-4" /> إضافة فرع</Btn>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-bold">أضف مورديك الأساسيين (أعشاب، لحوم، خضار...). يمكن استيراد قائمة كاملة من Excel لاحقاً.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {sup.map((s, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60">
                    <p className="text-[10px] font-black text-slate-500">المورد {i + 1}</p>
                    <Field label="الاسم"><input className={inputCls} value={s.name} onChange={(e) => setSup((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="مثال: مؤسسة نجد" /></Field>
                    <Field label="الهاتف"><input className={inputCls} value={s.phone} onChange={(e) => setSup((prev) => prev.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="05xxxxxxxx" dir="ltr" /></Field>
                  </div>
                ))}
              </div>
              {sup.length < 4 && <Btn tone="ghost" onClick={() => setSup((p) => [...p, { name: '', phone: '' }])}><Plus className="w-4 h-4" /> إضافة مورد</Btn>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-bold">أضف أهم الأصناف الخام (لحم، خبز، زيت...). حدد الوحدة ونوع التصنيف.</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {mat.map((m, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60">
                    <p className="text-[10px] font-black text-slate-500">الصنف {i + 1}</p>
                    <Field label="الاسم"><input className={inputCls} value={m.name} onChange={(e) => setMat((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="مثال: صدور دجاج" /></Field>
                    <Field label="الوحدة">
                      <input className={inputCls} value={m.unit} onChange={(e) => setMat((prev) => prev.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} placeholder={unit} />
                    </Field>
                    <Field label="التصنيف">
                      <select className={inputCls} value={m.category} onChange={(e) => setMat((prev) => prev.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}>
                        <option value="">—</option>
                        <option value="raw">خام</option>
                        <option value="meat">لحوم</option>
                        <option value="produce">خضروات</option>
                        <option value="dry">جافة</option>
                        <option value="dairy">ألبان</option>
                      </select>
                    </Field>
                  </div>
                ))}
              </div>
              {mat.length < 6 && <Btn tone="ghost" onClick={() => setMat((p) => [...p, { name: '', unit: '', category: '' }])}><Plus className="w-4 h-4" /> إضافة صنف</Btn>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-bold">الخطوة الأخيرة. الإعداد الأساسي اكتمل — اختر ما تفعله الآن:</p>
              <div className="space-y-2">
                <button onClick={() => { onClose(); setDone(false); setStep(0); setBran([{ name: '', city: '' }]); setSup([{ name: '', phone: '' }]); setMat([{ name: '', unit: '', category: '' }]); }} className="w-full text-right flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 hover:bg-slate-100 transition-colors">
                  <span className="mt-0.5 text-indigo-600"><ChefHat className="w-5 h-5" /></span>
                  <span>
                    <span className="block font-black text-slate-800 text-xs">فتح شاشة الوصفات وبناء قائمتك</span>
                    <span className="block text-slate-500 text-[11px] mt-0.5">أنشئ الوصفات خطوة بخطوة مع حساب التكلفة التلقائي، أو استورد من Excel.</span>
                  </span>
                </button>
                <button onClick={() => setDone(true)} className="w-full text-right flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 hover:bg-slate-100 transition-colors">
                  <span className="mt-0.5 text-emerald-600"><Check className="w-5 h-5" /></span>
                  <span>
                    <span className="block font-black text-slate-800 text-xs">إنهاء الإعداد الآن</span>
                    <span className="block text-slate-500 text-[11px] mt-0.5">استكشف النظام أولاً وعد للوصفات لاحقاً.</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {step !== STEPS.length - 1 && (
            <div className="flex justify-between pt-3 border-t border-slate-100">
              <Btn tone="ghost" onClick={back} disabled={step === 0}><Warehouse className="w-4 h-4" /> السابق</Btn>
              <div className="flex gap-2">
                <Btn tone="ghost" onClick={skip}><SkipForward className="w-4 h-4" /> تخطي كامل</Btn>
                <Btn onClick={next} tone="primary"><Check className="w-4 h-4" /> التالي</Btn>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 pt-1">
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Check className="w-6 h-6" /></span>
            <div>
              <p className="font-black text-emerald-900 text-sm">تم إعداد النظام بنجاح</p>
              <p className="text-[11px] text-emerald-700 font-bold">يمكنك الآن البدء بإنشاء طلبات الشراء والتكاليف. عدّل القوائم الكاملة في شاشات الإعداد في أي وقت.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Btn tone="ghost" onClick={goRecipes}><ChefHat className="w-4 h-4" /> فتح الوصفات</Btn>
            <Btn tone="success" onClick={finish}><X className="w-4 h-4" /> إنهاء</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};
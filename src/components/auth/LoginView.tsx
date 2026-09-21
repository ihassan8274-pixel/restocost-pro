import React, { useState } from 'react';
import {
  UtensilsCrossed, Lock, Mail, User as UserIcon, Eye, EyeOff, ShieldCheck, KeyRound,
  Sparkles, TrendingUp, ChefHat, Boxes, LayoutDashboard, CheckCircle2, Hourglass,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserRole, ROLE_LABELS } from '../../types';

export const LoginView: React.FC = () => {
  const { login, register, logo } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('branch_manager');
  const [branchId, setBranchId] = useState('b-01');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [totpStep, setTotpStep] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const { branches } = useApp();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    if (mode === 'login') {
      const res = await login(email, password, totpStep ? totpCode : undefined);
      if (res.totpRequired) { setTotpStep(true); setBusy(false); return; }
      if (!res.ok) setError(res.error || 'فشل تسجيل الدخول');
    } else {
      const res = await register(name, email, password, role, branchId);
      if (res.ok && res.pending) {
        // طلب انضمام أُرسل — بانتظار تفعيل مسؤول النظام
        setNotice('تم إرسال طلب الانضمام إلى مسؤول النظام. سيتم تفعيل حسابك بعد تحديد دورك وصلاحياتك — أعد المحاولة لاحقاً.');
        setMode('login');
        setName(''); setPassword(''); setTotpStep(false); setTotpCode('');
      } else if (res.ok) {
        const loginRes = await login(email, password);
        if (!loginRes.ok) setError(loginRes.error || '');
      } else {
        setError(res.error || 'فشل إنشاء الحساب');
      }
    }
    setBusy(false);
  };

  const fillDemo = (mail: string, pass: string) => {
    setMode('login');
    setEmail(mail);
    setPassword(pass);
    setError('');
    setNotice('');
  };

  const demoAccounts = [
    { label: 'مسؤول النظام', email: 'admin@restocost.com', pass: 'admin123' },
    { label: 'محاسب التكاليف', email: 'cost@restocost.com', pass: 'cost123' },
    { label: 'مدير فرع', email: 'saud@restocost.com', pass: 'saud123' },
    { label: 'الشيف', email: 'chef@restocost.com', pass: 'chef123' },
    { label: 'أمين المخزن', email: 'store@restocost.com', pass: 'store123' },
  ];

  const features = [
    { icon: <TrendingUp className="w-4 h-4" />, label: 'تتبع محاسبة التكاليف' },
    { icon: <ChefHat className="w-4 h-4" />, label: 'إدارة فروع وموظفين' },
    { icon: <Boxes className="w-4 h-4" />, label: 'تحكم بالمخزون والمشتريات' },
    { icon: <LayoutDashboard className="w-4 h-4" />, label: 'تقارير ذكية شاملة' },
  ];

  const field =
    'w-full border border-stone-300 rounded-xl p-2.5 pr-9 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-400 transition-all bg-stone-50/50';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1c1308] via-slate-900 to-[#2b1a0e] relative overflow-hidden flex items-center justify-center p-4">
      {/* خلفية زخرفية — هوية معصوبي الذهبية */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-tr from-amber-600/10 to-rose-600/10 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-6xl relative z-10 grid lg:grid-cols-2 gap-8 items-center">
        {/* العمود التعريفي */}
        <div className="hidden lg:block text-white">
          <div className="flex items-center gap-3 mb-6">
            {logo ? (
              <img src={logo} alt="شعار النظام" className="w-14 h-14 rounded-2xl object-contain bg-white/90 border border-amber-300/30 shadow-2xl" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/40">
                <UtensilsCrossed className="w-7 h-7 text-stone-950" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-black tracking-tight">RestoCost ERP Pro</h1>
              <p className="text-amber-300 text-sm font-bold">نظام متقدم لإدارة تكاليف المطاعم</p>
            </div>
          </div>

          <h2 className="text-4xl font-black leading-tight mb-4">
            تحكم كامل في التكاليف
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">
              واتخاذ قرارات أذكى
            </span>
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-8 max-w-md">
            منصة متكاملة تجمع محاسبة التكاليف، إدارة المخزون، المبيعات، المشتريات، والعمالة
            في واجهة واحدة سهلة تسهّل عليك إدارة مطعمك من أي مكان.
          </p>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2.5 transition-colors">
                <span className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">{f.icon}</span>
                <span className="text-xs font-bold text-slate-200">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* بطاقة الدخول */}
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-7 space-y-4 backdrop-blur">
            {/* شعار للجوال */}
            <div className="lg:hidden flex flex-col items-center mb-2">
              {logo ? (
                <img src={logo} alt="شعار النظام" className="w-14 h-14 rounded-2xl object-contain bg-white border border-amber-200 mb-2" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-stone-950 mb-2">
                  <UtensilsCrossed className="w-7 h-7" />
                </div>
              )}
              <h1 className="text-lg font-black text-stone-900">RestoCost ERP Pro</h1>
              <p className="text-[11px] text-stone-500 font-bold">نظام متقدم لإدارة تكاليف المطاعم</p>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-xl text-xs font-bold">
              <button onClick={() => { setMode('login'); setNotice(''); setError(''); }}
                className={`flex-1 py-2.5 rounded-lg transition-all ${mode === 'login' ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-800'}`}>
                تسجيل الدخول
              </button>
              <button onClick={() => { setMode('register'); setNotice(''); setError(''); }}
                className={`flex-1 py-2.5 rounded-lg transition-all ${mode === 'register' ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-800'}`}>
                حساب جديد
              </button>
            </div>

            {mode === 'register' && (
              <p className="flex items-start gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <Hourglass className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                بعد تعبئة بياناتك سيصل طلبك إلى مسؤول النظام الذي يفعّل حسابك ويحدد دورك وصلاحياتك.
              </p>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label className="block font-bold text-stone-700 mb-1 text-xs">الاسم الكامل</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="الاسم الكامل" className={field} />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-stone-700 mb-1 text-xs">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.com" dir="ltr" className={field} />
                </div>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1 text-xs">كلمة المرور</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className={field} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'login' && totpStep && (
                <div>
                  <label className="block font-bold text-stone-700 mb-1 text-xs">رمز التحقق الثنائي</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input inputMode="numeric" autoComplete="one-time-code" value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required placeholder="6 أرقام"
                      dir="ltr" className="text-center tracking-[0.4em] w-full border border-stone-300 rounded-xl p-2.5 pr-9 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-amber-500" />
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1">أدخل الرمز من تطبيق المصادقة (Google Authenticator أو ما شابه).</p>
                </div>
              )}

              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-stone-700 mb-1 text-xs">الدور الوظيفي (المرغوب)</label>
                    <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full border border-stone-300 rounded-xl p-2 text-sm text-stone-800">
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-stone-700 mb-1 text-xs">الفرع</label>
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full border border-stone-300 rounded-xl p-2 text-sm text-stone-800">
                      <option value="all">جميع الفروع</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {error && <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</p>}
              {notice && (
                <p className="flex items-start gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {notice}
                </p>
              )}

              <button type="submit" disabled={busy}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 font-bold py-2.5 rounded-xl text-sm shadow-sm shadow-amber-500/30 transition-all disabled:opacity-50">
                {busy ? 'جارٍ التحقق...' : totpStep ? 'تأكيد الرمز' : mode === 'login' ? 'دخول إلى النظام' : 'إرسال طلب الانضمام'}
              </button>
            </form>

            <div className="pt-2 border-t border-stone-100">
              <p className="text-[11px] font-bold text-stone-500 text-center mb-2 flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> دخول سريع — حسابات تجريبية
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {demoAccounts.map((acc) => (
                  <button key={acc.email} onClick={() => fillDemo(acc.email, acc.pass)}
                    className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors">
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-amber-200/70 mt-4 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> كلمات المرور تُخزّن مشفّرة (bcrypt) — المصادقة الثنائية متاحة لحساب المسؤول
          </p>
        </div>
      </div>
    </div>
  );
};
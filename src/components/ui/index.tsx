import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Permission } from '../../types';
import { fmt, formatDateSmart, getHijriMode } from '../../utils/helpers';

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-surface rounded-2xl border border-line shadow-card ${className}`}>{children}</div>
);

export const SectionHeader: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; extra?: React.ReactNode }> = ({ title, subtitle, icon, extra }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <h3 className="font-extrabold text-slate-900 text-base">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {extra}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string; sub?: string; tone?: 'default' | 'emerald' | 'amber' | 'rose' | 'indigo'; icon?: React.ReactNode }> = ({ label, value, sub, tone = 'default', icon }) => {
  const tones = {
    default: 'text-slate-900', emerald: 'text-emerald-700', amber: 'text-primary-700', rose: 'text-rose-700', indigo: 'text-indigo-700',
  };
  return (
    <div className="bg-surface p-4 rounded-xl border border-line shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-slate-500 text-[11px] block">{label}</span>
        {icon}
      </div>
      <strong className={`text-lg font-extrabold tnum block mt-1 ${tones[tone]}`}>{value}</strong>
      {sub && <span className="text-[10px] font-bold text-slate-500">{sub}</span>}
    </div>
  );
};

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; xl?: boolean; closeOnOverlayClick?: boolean }> = ({ open, onClose, title, children, wide, xl, closeOnOverlayClick = true }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-warm-950/60 backdrop-blur-xs" onClick={closeOnOverlayClick ? onClose : undefined}>
      <div className={`bg-surface relative overflow-hidden rounded-2xl ${xl ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-lg'} w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-line`} onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-gradient-to-br from-amber-400/25 via-amber-500/15 to-primary-600/25 blur-2xl" />
        <div className="flex items-center justify-between border-b border-line pb-3 sticky top-0 bg-surface z-10">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// 136 شاشة تستدعي هذا المكوّن. كان شريطاً متدرّجاً داكناً
// (from-primary-800 via-primary-700 to-amber-600) بنصّ أبيض — أي مظهر
// Oracle-Forms الكلاسيكي، وهو ما رُفض صراحةً في بداية التصميم.
// النظام المعتمد (docs/design/02 و03) ترويسة بيضاء ذات حدّ.
//
// الحل لم يكن Adapter يلصق 136 استدعاء، بل تعديل هذا المكوّن نفسه: موضع
// واحد، صفر مخاطرة، ويصلح 136 شاشة دفعة واحدة. والـprops بقيت كما هي عمداً
// حتى لا يحتاج أي مستدعٍ تغييراً.
export const PageHeader: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; actions?: React.ReactNode; subtitleNoWrap?: boolean }> = ({ title, subtitle, icon, actions, subtitleNoWrap }) => (
  <div className="bg-surface rounded-2xl border border-line shadow-card px-6 py-5">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="w-11 h-11 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center shrink-0">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="font-bold text-slate-900 text-xl tracking-tight">{title}</h1>
          {subtitle && (
            <p className={`text-xs text-slate-500 mt-0.5 ${subtitleNoWrap ? 'whitespace-nowrap' : ''}`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </div>
);

export const Btn: React.FC<{ onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; tone?: 'primary' | 'ghost' | 'danger' | 'dark' | 'success'; className?: string; type?: 'button' | 'submit'; disabled?: boolean }> = ({ onClick, children, tone = 'primary', className = '', type = 'button', disabled = false }) => {
  const tones = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-card',
    dark: 'bg-slate-900 hover:bg-slate-800 text-white',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    // ghost كان شبه-شفاف مخصّصاً لوضعه فوق PageHeader الداكنة (bg-white/10
    // ونصّ أبيض). الترويسة صارت بيضاء، فصار زرٌّ شبه-شفاف بلا أثر — لون
    // نصّي داكن يناسب الخلفية الجديدة.
    ghost: 'bg-surface text-slate-700 border border-line hover:bg-slate-50',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-colors ${tones[tone]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  );
};

export const Field: React.FC<{ label: string; children: React.ReactNode; required?: boolean; hint?: string }> = ({ label, children, required, hint }) => (
  <div>
    <label className="block font-bold text-slate-700 mb-1 text-xs">{label}{required && <span className="text-rose-500"> *</span>}</label>
    {children}
    {hint && <p className="block text-[9px] text-slate-400 mt-1 font-medium">{hint}</p>}
  </div>
);

export const inputCls = 'w-full border border-line-strong rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-surface transition-shadow';

// Currency picker for documents; carries the symbol + rate for the selected code
export const CurrencySelect: React.FC<{ value: string; onChange: (code: string) => void; className?: string }> = ({ value, onChange, className = inputCls }) => {
  const { currencies } = useApp();
  const active = currencies.filter((c) => c.isActive);
  return (
    <select value={value || 'SAR'} onChange={(e) => onChange(e.target.value)} className={className}>
      {active.map((c) => (
        <option key={c.code} value={c.code}>{c.code} — {c.nameAr} ({c.symbol}) {c.isBase ? '· الأساس' : `بسعر ${c.rateToBase}`}</option>
      ))}
    </select>
  );
};

export const TabBar: React.FC<{ tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="bg-surface-ter p-1.5 rounded-2xl flex items-center gap-1 overflow-x-auto text-xs font-bold">
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`px-3.5 py-2.5 rounded-xl transition-all shrink-0 ${active === t.id ? 'bg-surface text-primary-700 shadow-card' : 'text-slate-600 hover:text-primary-700'}`}>
        {t.label}
      </button>
    ))}
  </div>
);

// Wrap a view or control; blocks render if the user lacks the permission
export const PermissionGuard: React.FC<{ permission: Permission; children: React.ReactNode; fallback?: React.ReactNode }> = ({ permission, children, fallback }) => {
  const { can } = useApp();
  if (!can(permission)) {
    return fallback ? <>{fallback}</> : (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-10 text-center">
        <Lock className="w-8 h-8 text-rose-400 mx-auto" />
        <p className="font-extrabold text-rose-700 mt-2">لا تملك صلاحية الوصول لهذه الوحدة</p>
        <p className="text-xs text-rose-500 mt-1">يرجى التواصل مع مدير النظام لطلب الصلاحيات</p>
      </div>
    );
  }
  return <>{children}</>;
};

export const StatusPill: React.FC<{ status: string; map: Record<string, string>; toneMap?: Record<string, string> }> = ({ status, map, toneMap }) => {
  const defaultTone: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    pending: 'bg-amber-50 text-amber-800 border-amber-200',
    overdue: 'bg-rose-50 text-rose-800 border-rose-200',
    completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    confirmed: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    approved: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    received: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    seated: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  };
  const tone = toneMap?.[status] || defaultTone[status] || 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${tone}`}>{map[status] || status}</span>;
};

export { AutocompleteSelect } from './AutocompleteSelect';
export { DocumentFingerprint } from './DocumentFingerprint';

// خلية عملة موحدة داخل الجداول المالية — محاذاة ثابتة في RTL مع علامة ناقص حقيقية
export const AmountCell: React.FC<{ value: number; digits?: number; tone?: 'default' | 'up' | 'down' | 'muted' }> = ({ value, digits, tone = 'default' }) => {
  const text = digits != null ? fmt(value, digits) : fmt(value);
  const cls = tone === 'up' ? 'text-emerald-700' : tone === 'down' ? 'text-rose-700' : tone === 'muted' ? 'text-slate-400' : 'text-slate-800';
  return <td className={`p-2 text-left whitespace-nowrap ${cls}`}><span className="tnum" dir="ltr">{text}</span></td>;
};

// Sparkline: خط اتجاه مصغّر (SVG) داخل بطاقات KPI
export const Sparkline: React.FC<{ data: number[]; color?: string; width?: number; height?: number }> = ({ data, color = '#d97706', width = 52, height = 20 }) => {
  if (!data.length) return <div className="w-[52px] h-[20px]" />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Skeleton: هيكل تحميل بألوان الهوية
export const Skeleton: React.FC<{ h?: number; className?: string }> = ({ h = 16, className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-stone-200/80 dark:bg-stone-700/60 ${className}`} style={{ height: h }} />
);

export const EmptyState: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; compact?: boolean }> = ({ title, subtitle, icon, compact }) => (
  <div className={`text-center bg-surface-ter/60 rounded-2xl border border-dashed border-line-strong ${compact ? 'py-8 px-4' : 'py-12 px-6'}`}>
    {icon && <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-3 shadow-card">{icon}</div>}
    <p className="font-extrabold text-stone-700 text-sm">{title}</p>
    {subtitle && <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{subtitle}</p>}
  </div>
);

// تاريخ موحّد: صيغة يوم/شهر/سنة (رموز غربية) محاذاة RTL — والعنوان بالملادي الكامل للتوسيع
// يدعم الإعداد «التقويم الهجري» من الضبط (يبقى العنوان يوضح التاريخين معاً)
export const DateText: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => {
  if (!value) return <span className={className}>—</span>;
  const smart = formatDateSmart(value);
  return <span className={`tnum ${className}`} dir={getHijriMode() ? 'rtl' : 'ltr'} title={smart.title}>{smart.display}</span>;
};
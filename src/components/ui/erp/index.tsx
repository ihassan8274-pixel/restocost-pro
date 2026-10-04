import React from 'react';

// ============ نظام ERP الموحّد ============
// مبني على رموز التصميم القائمة (bg-surface / text-line / text-primary) لا على
// ألوان ثابتة — فيتبع Theming الموجود ويبقى متسقاً مع بقية النظام.
//
// القواعد المعتمدة (docs/design/):
//  - الجداول <table> حقيقية — لا شبكات div (المحاذاة تبقى ثابتة).
//  - أعمدة الإجراءات: نصّ بارز (طباعة · تفاصيل) + أيقونات للثانوي.
//  - فتح السجل بزر «تفاصيل» — الصف لا يفتح بالنقر (سلوك Oracle).
//  - الأرقام: tnum + dir=ltr + محاذاة يسار.
//  - الألوان: slate + primary + دلالات (emerald/amber/rose).

type Tone = 'default' | 'emerald' | 'amber' | 'rose' | 'primary' | 'indigo';

const TONE_CHIP: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  primary: 'bg-primary-50 text-primary-700 border-primary-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

// ---------------------------------------------------------------- الأزرار
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md';

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-xs',
  secondary: 'bg-surface text-slate-700 border border-line hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: 'text-[11px] px-2.5 py-1 rounded-md gap-1',
  md: 'text-xs px-3.5 py-2 rounded-lg gap-1.5',
};

export const ErpButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}> = ({ children, onClick, variant = 'secondary', size = 'md', disabled, title, type = 'button', className = '' }) => (
  <button
    type={type}
    title={title}
    onClick={onClick}
    disabled={disabled}
    className={`inline-flex items-center font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------- الحقول
export const ErpField: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, className = '', children }) => (
  <div className={className}>
    <label className="block text-[11px] font-bold text-slate-500 mb-1">
      {label} {required && <span className="text-rose-600">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

export const erpInputCls =
  'w-full border border-line rounded-lg px-3 py-2 text-xs bg-surface outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-50 disabled:text-slate-500';

export const ErpInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`${erpInputCls} ${props.className || ''}`} />
);

export const ErpSelect = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`${erpInputCls} ${props.className || ''}`} />
);

// ---------------------------------------------------------------- الحالات
export const ErpChip: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string }> = ({ tone = 'default', children, className = '' }) => (
  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${TONE_CHIP[tone]} ${className}`}>
    {children}
  </span>
);

// ---------------------------------------------------------------- الإحصاء
export const ErpKpi: React.FC<{
  label: string;
  value: string;
  sub?: string;
  subTone?: 'up' | 'down' | 'flat';
  highlight?: boolean;
  className?: string;
}> = ({ label, value, sub, subTone = 'flat', highlight, className = '' }) => {
  const subCls = subTone === 'up' ? 'text-emerald-600' : subTone === 'down' ? 'text-rose-600' : 'text-slate-400';
  return (
    <div className={`bg-surface border rounded-xl p-3.5 ${highlight ? 'border-primary-200 bg-primary-50/40' : 'border-line'} ${className}`}>
      <p className="text-[10px] font-bold text-slate-500 mb-1">{label}</p>
      <p className="tnum text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className={`text-[10px] font-bold mt-1 ${subCls}`}>{sub}</p>}
    </div>
  );
};

// ---------------------------------------------------------------- شريط المعاملات
export const ErpQueryBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-50 border border-line rounded-xl p-3.5 ${className}`}>
    <div className="flex flex-wrap items-end gap-3">{children}</div>
  </div>
);

// ---------------------------------------------------------------- مرشّحات سريعة
export const ErpQuickFilters: React.FC<{
  items: string[];
  active?: string[];
  onToggle?: (f: string) => void;
}> = ({ items, active = [], onToggle }) => (
  <div className="flex flex-wrap items-center gap-2 mt-2.5">
    <span className="text-[11px] font-bold text-slate-500">مرشّحات جاهزة:</span>
    {items.map((f) => {
      const on = active.includes(f);
      return (
        <span
          key={f}
          onClick={() => onToggle?.(f)}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
            on ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-surface text-slate-600 border-line hover:border-slate-300'
          }`}
        >
          {f}
        </span>
      );
    })}
  </div>
);

// ---------------------------------------------------------------- الإجراءات (في الصف)
export const ErpRowActions: React.FC<{
  /** نصّ بارز — الإجراء الرئيسي (تفاصيل) */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** إجراءات أخرى كنصّ بارز (طباعة) */
  secondaryLabels?: { label: string; onClick: () => void }[];
  /** إجراءات أخرى كنصّ بارز (طباعة) */
  iconActions?: { icon: React.ReactNode; title: string; onClick: () => void }[];
}> = ({ primaryLabel, onPrimary, secondaryLabels = [], iconActions = [] }) => (
  <span className="inline-flex items-center gap-2 justify-center">
    {iconActions.map((a, i) => (
      <button key={i} title={a.title} onClick={a.onClick}
        className="w-6 h-6 inline-flex items-center justify-center text-slate-500 hover:text-primary-600 transition-colors">
        {a.icon}
      </button>
    ))}
    {secondaryLabels.map((a) => (
      <button key={a.label} onClick={a.onClick}
        className="text-[11px] font-bold text-primary-600 hover:underline">
        {a.label}
      </button>
    ))}
    {primaryLabel && (
      <button onClick={onPrimary}
        className="text-[11px] font-bold text-primary-600 hover:underline">
        {primaryLabel}
      </button>
    )}
  </span>
);

// ---------------------------------------------------------------- الجدول
export interface ErpColumn<T> {
  key: string;
  header: string;
  /** محاذاة — الأرقام دائماً left */
  align?: 'right' | 'left' | 'center';
  /** خلية رقمية: tnum + dir=ltr */
  numeric?: boolean;
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
}

export const ErpTable = <T,>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  emptyMessage = 'لا توجد سجلات',
  footer,
  actionsColumn,
}: {
  columns: ErpColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** انقر الصف (اختياري — الافتراضي لا يفتح) */
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
  /**
   * عمود الإجراءات. دالة أو عقدة واحدة تُعاد في كل صف.
   * كان عقدة واحدة فقط، فكل الصفوف كانت تعرض *نفس* الأزرار — أي زر «تفاصيل»
   * يفتح أول سجل في القائمة لا الذي أمامك.
   */
  actionsColumn?: React.ReactNode | ((row: T, index: number) => React.ReactNode);
}) => {
  const cellAlign = (c: ErpColumn<T>) =>
    c.align === 'left' ? 'text-left' : c.align === 'center' ? 'text-center' : 'text-right';
  const cellCls = (c: ErpColumn<T>) =>
    `px-3.5 py-3 text-xs border-b border-line/60 ${cellAlign(c)} ${c.numeric ? 'tnum' : ''}`;
  const actionsFor = (row: T, i: number) =>
    typeof actionsColumn === 'function' ? actionsColumn(row, i) : actionsColumn;
  const hasActions = actionsColumn !== undefined && actionsColumn !== null;

  return (
    <table className="w-full">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ width: c.width }} className={cellCls(c) + ' bg-slate-50 text-slate-500 font-bold text-[11px] whitespace-nowrap border-b border-line'}>
              {c.header}
            </th>
          ))}
          {hasActions && <th className="px-3.5 py-3 text-center text-[11px] font-bold text-slate-500 border-b border-line">إجراءات</th>}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">{emptyMessage}</td></tr>
        )}
        {rows.map((row, i) => {
          const k = rowKey(row);
          const sel = selectedKey === k;
          return (
            <tr key={k}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`transition-colors ${sel ? 'bg-primary-50/50' : 'hover:bg-slate-50'} ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={cellCls(c)}>
                  {c.render(row, i)}
                </td>
              ))}
              {hasActions && <td className="px-3.5 py-3 text-center">{actionsFor(row, i)}</td>}
            </tr>
          );
        })}
      </tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  );
};

// ---------------------------------------------------------------- الترقيم
export const ErpPagination: React.FC<{
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  rangeLabel?: string;
  totalLabel?: string;
}> = ({ page, pageCount, onPage, rangeLabel, totalLabel }) => (
  <div className="px-4 py-3 bg-slate-50 border-t border-line flex items-center justify-between">
    <span className="text-[11px] font-semibold text-slate-500">{totalLabel || rangeLabel}</span>
    <span className="flex items-center gap-1">
      <ErpButton size="sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>السابق</ErpButton>
      {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => i + 1).map((n) => (
        <ErpButton key={n} size="sm" variant={n === page ? 'primary' : 'secondary'} onClick={() => onPage(n)}>{n}</ErpButton>
      ))}
      <ErpButton size="sm" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>التالي</ErpButton>
    </span>
  </div>
);

// ---------------------------------------------------------------- مسار Approval
export const ErpApprovalPath: React.FC<{
  steps: { label: string; state: 'done' | 'now' | 'todo' }[];
}> = ({ steps }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    {steps.map((s, i) => (
      <React.Fragment key={i}>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          s.state === 'done' ? 'bg-slate-100 text-slate-500'
          : s.state === 'now' ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-400'
        }`}>
          {s.label}
        </span>
        {i < steps.length - 1 && <span className="text-slate-300">→</span>}
      </React.Fragment>
    ))}
  </div>
);

// ---------------------------------------------------------------- ترويسة الصفحة
export const ErpPageHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, icon, actions }) => (
  <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
    <div className="flex items-center gap-3">
      {icon && (
        <span className="w-11 h-11 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center text-xl">
          {icon}
        </span>
      )}
      <div>
        <h1 className="font-bold text-slate-900 text-xl">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
  </div>
);

// ---------------------------------------------------------------- الحاوية
export const ErpPanel: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`bg-surface rounded-2xl border border-line shadow-card overflow-hidden ${className}`}>
    {children}
  </div>
);

// ---------------------------------------------------------------- تبويبات
export const ErpTabs: React.FC<{
  tabs: { id: string; label: string; badge?: number }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="border-b border-line px-6 flex gap-1 overflow-x-auto">
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
          t.id === active ? 'text-primary-600 border-primary-600' : 'text-slate-500 hover:text-slate-700 border-transparent'
        }`}>
        {t.label} {t.badge !== undefined && <span className="tnum">({t.badge})</span>}
      </button>
    ))}
  </div>
);

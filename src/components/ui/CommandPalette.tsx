import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FilePlus2, FileDown, CornerDownLeft, X, ScanSearch } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NAV_SECTIONS } from '../../navigation';

type PaletteMode = 'search' | 'new' | 'export';

interface CommandPaletteProps {
  open: boolean;
  mode: PaletteMode;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

const NEW_IDS = [
  'purchase_orders', 'purchase_requests', 'preliminary_supply_orders', 'requisitions',
  'goods_receiving', 'supplier_returns', 'recipes', 'manufacturing', 'batch_sales',
  'menus', 'menu_planning', 'inventory', 'stock_transfers', 'daily_inventory',
  'monthly_inventory', 'suppliers', 'wastage', 'tasks',
];

const EXPORT_IDS = [
  'reports_dashboard', 'reports_center', 'reporting_module', 'detailed_reports',
  'reports_analytics', 'advanced_analytics', 'monthly_branch_report', 'multi_branch_reports',
  'pl_statement', 'cash_flow', 'inventory_movement', 'inventory_valuation', 'cost_reports',
  'food_cost_category', 'management_ratios', 'cost_center_comparison', 'stock_cover',
  'sales_ledger', 'purchase_variance', 'sales_excel_import', 'cost_analysis',
  'advanced_reporting', 'true_cost', 'supplier_scorecard', 'consumption_matrix',
  'theoretical_consumption', 'potential_usage', 'backup_center',
];

const PLACEHOLDERS: Record<PaletteMode, string> = {
  search: 'ابحث عن شاشة... (// للبحث في كل النظام)',
  new: 'ما الذي تريد إنشاءه أو إضافته الآن؟',
  export: 'ماذا تريد تصدير أو طباعة؟',
};

const MODE_LABEL: Record<PaletteMode, string> = {
  search: 'الانتقال السريع',
  new: 'إنشاء جديد',
  export: 'تصدير وطباعة',
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, mode, onClose, onNavigate }) => {
  const { can, screenCan, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open, mode]);

  const items = useMemo(() => {
    const qn = q.trim().toLowerCase();
    const pool = NAV_SECTIONS.flatMap((s) => s.items.map((it) => ({ item: it, section: s.title })));
    const ids = mode === 'new' ? NEW_IDS : mode === 'export' ? EXPORT_IDS : null;
    const list = ids ? pool.filter(({ item }) => ids.includes(item.id)) : pool;
    return list.filter(({ item }) =>
      (can(item.permission) || screenCan(item.id, 'view')) &&
      (isAdmin || !item.adminOnly) &&
      (!qn || item.label.toLowerCase().includes(qn) || item.id.toLowerCase().includes(qn))
    );
  }, [q, mode, can, screenCan, isAdmin]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = items[sel]; if (it) { onNavigate(it.item.id); onClose(); } }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, sel, onNavigate, onClose]);

  useEffect(() => {
    if (open && inputRef.current) {
      const el = document.getElementById('cmd-palette-input') as HTMLInputElement | null;
      if (el) { el.focus(); el.select(); }
    }
  }, [open, mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center pt-24 px-4" dir="rtl">
      <div className="absolute inset-0 bg-warm-950/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line bg-slate-50/60">
          {mode === 'search' && <Search className="w-4 h-4 text-primary-600 shrink-0" />}
          {mode === 'new' && <FilePlus2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {mode === 'export' && <FileDown className="w-4 h-4 text-amber-600 shrink-0" />}
          <input
            id="cmd-palette-input"
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder={PLACEHOLDERS[mode]}
            className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-900 placeholder:text-slate-400"
          />
          <span className="shrink-0 text-[10px] font-extrabold text-slate-400 bg-white border border-slate-200 rounded-lg px-2 py-1">{MODE_LABEL[mode]}</span>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-2">
              <ScanSearch className="w-8 h-8 text-stone-300" />
              <p className="text-xs font-bold text-stone-400">لا توجد نتائج لـ «{q}»</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from(new Set(items.map((it) => it.section))).map((section) => (
                <div key={section}>
                  <p className="px-3 py-1 text-[10px] font-extrabold text-stone-400 uppercase tracking-wider border-r-[3px] border-primary-500">{section}</p>
                  {items.filter((it) => it.section === section).map(({ item }) => {
                    const Icon = item.icon;
                    const active = items.findIndex((it) => it.item.id === item.id) === sel;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onNavigate(item.id); onClose(); }}
                        onMouseEnter={() => setSel(items.findIndex((it) => it.item.id === item.id))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary-50 text-primary-700' : 'text-stone-600 hover:bg-stone-50'}`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary-100 text-primary-700' : 'bg-stone-100 text-stone-400'}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 text-right font-bold">{item.label}</span>
                        {item.badge && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-primary-100 text-primary-700">{item.badge}</span>}
                        {mode === 'new' && <CornerDownLeft className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-line bg-slate-50/60 text-[10px] font-bold text-stone-400">
          <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono">↑↓</kbd> تنقل</span>
          <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono">Enter</kbd> فتح</span>
          <span className="flex items-center gap-1"><kbd className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono">Esc</kbd> إغلاق</span>
          <span className="flex-1 text-left text-stone-400">اختصارات: <kbd>/</kbd> بحث · <kbd>N</kbd> جديد · <kbd>E</kbd> تصدير</span>
        </div>
      </div>
    </div>
  );
};
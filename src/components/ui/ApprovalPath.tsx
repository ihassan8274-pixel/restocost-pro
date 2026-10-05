import React from 'react';
import { Check, X, Ban } from 'lucide-react';

export interface ApprovalStepDef {
  id: string;
  label: string;
}

export type ApprovalTerminalType = 'rejected' | 'cancelled';

interface ApprovalPathBarProps {
  steps: ApprovalStepDef[];
  current: string;
  statusLabel?: string;
  terminal?: { type: ApprovalTerminalType; label: string };
  actions?: React.ReactNode;
  caption?: string;
  compact?: boolean;
}

// بند 41 — شريط مسار الموافقة أعلى كل مستند: مسودة → مراجعة → اعتماد → ترحيل
// يعرض خطوات السير (دائرية) + الحالة الحالية + حالة نهاية جانبية (مرفوض/ملغى) + أزرار انتقال
export const ApprovalPathBar: React.FC<ApprovalPathBarProps> = ({ steps, current, statusLabel, terminal, actions, caption, compact }) => {
  const idx = steps.findIndex((s) => s.id === current);
  const termOn = !!(terminal && current === terminal.type);

  const stepContent = (done: boolean, active: boolean) => {
    if (done) return <Check className="w-4 h-4" />;
    if (active) return <span className="w-2 h-2 bg-white rounded-full" />;
    return <span className="w-2 h-2 bg-slate-200 rounded-full" />;
  };

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl ${compact ? 'px-4 py-2.5' : 'p-4'} w-full`}>
      {caption && <p className="text-[10px] font-bold text-slate-400 mb-2 flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-400" /> {caption}</p>}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = !termOn && i < idx;
          const active = !termOn && i === idx;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <div className={`flex-1 h-0.5 mx-1 rounded-full min-w-2 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={`flex items-center justify-center rounded-full border-2 w-8 h-8 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : active ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-600/30' : 'bg-white border-slate-200 ' + (termOn ? 'text-slate-300' : 'text-slate-300')}`}>
                  {stepContent(done, active)}
                </div>
                <span className={`text-[10px] font-bold whitespace-nowrap ${active ? 'text-brand-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
        {terminal && (
          <>
            <div className={`flex-1 h-0.5 mx-1 rounded-full min-w-2 ${termOn ? 'bg-rose-300' : 'bg-slate-200'}`} />
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={`flex items-center justify-center rounded-full border-2 w-8 h-8 ${termOn ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-200 text-slate-300'}`}>
                {terminal.type === 'rejected' ? <Ban className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] font-bold whitespace-nowrap ${termOn ? 'text-rose-700' : 'text-slate-400'}`}>{terminal.label}</span>
            </div>
          </>
        )}
        {actions && <div className="mr-auto flex items-center gap-2 pr-3">{actions}</div>}
      </div>
      {statusLabel && (
        <div className={`mt-2 text-center text-[11px] font-bold rounded-lg py-1 ${termOn ? 'bg-rose-50 text-rose-700' : idx < 0 ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-700'}`}>
          الحالة الحالية: {statusLabel}
        </div>
      )}
    </div>
  );
};

export default ApprovalPathBar;
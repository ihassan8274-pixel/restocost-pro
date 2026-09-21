import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Fingerprint, FilePlus2, Pencil, CheckCircle2, Trash2, History, Send, RotateCcw, Download, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface DocumentFingerprintProps {
  entityType: string;
  entityId: string;
  title?: string;
  collapsible?: boolean;
}

const ICONS: Record<string, React.ReactNode> = {
  'إضافة': <FilePlus2 className="w-3.5 h-3.5 text-emerald-600" />,
  'إنشاء': <FilePlus2 className="w-3.5 h-3.5 text-emerald-600" />,
  'إدخال': <FilePlus2 className="w-3.5 h-3.5 text-emerald-600" />,
  'تسجيل': <FilePlus2 className="w-3.5 h-3.5 text-emerald-600" />,
  'اعتماد': <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />,
  'تحديث حالة': <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />,
  'إرسال': <Send className="w-3.5 h-3.5 text-sky-600" />,
  'تعديل': <Pencil className="w-3.5 h-3.5 text-amber-600" />,
  'إرجاع': <RotateCcw className="w-3.5 h-3.5 text-orange-600" />,
  'إعادة ترحيل': <Download className="w-3.5 h-3.5 text-orange-600" />,
  'حذف': <Trash2 className="w-3.5 h-3.5 text-rose-600" />,
  'رفض': <XCircle className="w-3.5 h-3.5 text-rose-600" />,
};

const iconFor = (action: string): React.ReactNode => {
  for (const key of Object.keys(ICONS)) {
    if (action.startsWith(key)) return ICONS[key];
  }
  return <History className="w-3.5 h-3.5 text-slate-500" />;
};

export const DocumentFingerprint: React.FC<DocumentFingerprintProps> = ({ entityType, entityId, title, collapsible }) => {
  const { auditLogs } = useApp();
  const events = useMemo(
    () => auditLogs
      .filter((e) => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [auditLogs, entityType, entityId],
  );
  const [open, setOpen] = useState(collapsible ? false : true);

  if (events.length === 0 && collapsible) return null;

  const Header = (
    <button
      onClick={() => collapsible && setOpen((v) => !v)}
      className={`w-full flex items-center justify-between gap-2 text-right ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
        <Fingerprint className="w-3.5 h-3.5 text-indigo-500" />
        {title || 'بصمة المستند'}
        <span className="text-[10px] font-mono font-bold text-slate-400">{events.length} حدث</span>
      </span>
      {collapsible && (open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />)}
    </button>
  );

  if (!open) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/30">
        {Header}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950/30">
      {Header}
      {events.length === 0 ? (
        <p className="mt-2 text-[11px] font-bold text-slate-400">لا يوجد سجل لهذه الوثيقة بعد</p>
      ) : (
        <ul className="mt-2 space-y-1.5 max-h-44 overflow-y-auto pl-1">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">{iconFor(e.action)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {e.action}
                  <span className="text-[10px] font-bold text-slate-400 mx-1">·</span>
                  <span className="text-[10px] font-bold text-slate-500">{e.userName}</span>
                </p>
                {(e.details || e.module) && (
                  <p className="text-[10px] font-bold text-slate-500 truncate">
                    {e.details || ''}{e.details && e.module ? ' — ' : ''}{e.module}
                  </p>
                )}
                <p className="text-[10px] font-mono text-slate-400">{new Date(e.timestamp).toLocaleString('ar-SA-u-nu-latn')}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
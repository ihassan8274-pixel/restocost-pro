import React from 'react';
import { CheckCircle2, WifiOff, RefreshCw, AlertTriangle, CloudUpload } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const SyncStrip: React.FC = () => {
  const { offline, offlineSince, saveFailed, authExpired, pendingSavesCount, saveErrorDetail, retryBootstrap, syncNow } = useApp();

  const syncing = pendingSavesCount > 0 && !saveFailed && !offline;
  const showStrip = offline || saveFailed || authExpired || syncing || (saveFailed && pendingSavesCount > 0);

  if (!showStrip) {
    return (
      <div className="hidden lg:flex items-center justify-end gap-1 px-3 py-0.5 bg-warm-50/60 border-b border-line-soft">
        <span className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700">
          <CheckCircle2 className="w-3 h-3" /> متصل
        </span>
      </div>
    );
  }

  const mainTone = offline ? 'amber' : saveFailed ? (authExpired ? 'rose' : 'amber') : 'emerald';

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-extrabold border-b ${
      mainTone === 'emerald' ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200'
      : mainTone === 'rose' ? 'bg-rose-50/70 text-rose-800 border-rose-200'
      : 'bg-amber-50/70 text-amber-800 border-amber-200'
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        {offline && (
          <span className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" /> دون اتصال
            {offlineSince && <span className="text-[10px] opacity-70">{new Date(offlineSince).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={retryBootstrap} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 transition-colors">
              <RefreshCw className="w-3 h-3" /> إعادة المحاولة
            </button>
          </span>
        )}
        {saveFailed && !offline && (
          <span className="flex items-center gap-1.5">
            {authExpired ? <AlertTriangle className="w-3.5 h-3.5" /> : <CloudUpload className="w-3.5 h-3.5" />}
            {authExpired ? 'انتهت صلاحية الجلسة' : 'فشل حفظ التغييرات على الخادم'} — {pendingSavesCount} عملية بانتظار المزامنة
            {saveErrorDetail && <span className="text-[10px] opacity-70">({saveErrorDetail})</span>}
            {authExpired && <button onClick={retryBootstrap} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 transition-colors"><RefreshCw className="w-3 h-3" /> تسجيل الدخول مجدداً</button>}
          </span>
        )}
        {syncing && !offline && (
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> جارٍ المزامنة… {pendingSavesCount} عملية
          </span>
        )}
      </div>
      {!offline && pendingSavesCount > 0 && !authExpired && (
        <button onClick={() => syncNow()} className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 transition-colors">
          <CloudUpload className="w-3 h-3" /> مزامنة الآن
        </button>
      )}
    </div>
  );
};
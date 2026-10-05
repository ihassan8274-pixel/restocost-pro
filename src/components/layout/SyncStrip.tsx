import React, { useMemo } from 'react';
import { CheckCircle2, WifiOff, RefreshCw, AlertTriangle, CloudUpload, RotateCcw, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useSyncStore } from '@stores/syncStore';

export const SyncStrip: React.FC = () => {
  const { offline, offlineSince, saveFailed, authExpired, pendingSavesCount, saveErrorDetail, retryBootstrap, syncNow, currentUser, showToast } = useApp();
  const applyData = useSyncStore((s) => s.applyData);

  const syncing = pendingSavesCount > 0 && !saveFailed && !offline;
  const isAdmin = currentUser?.role === 'admin';
  // 403 = نقص صلاحية على البيانات، لا انتهاء جلسة. messages خطأ الخادم كانت تصلنا
  // كنص "rcerp_x→صلاحية غير كافية (403)" فنقرأها لنعرض رسالة مفيدة بدل إخراج المستخدم.
  const deniedKeys = useMemo(() => {
    const out: string[] = [];
    (saveErrorDetail || '').split('·').forEach((part) => {
      const m = part.trim().match(/^(\S+)\s*→\s*(.*403.*)$/);
      if (m) out.push(m[2].trim());
    });
    return out;
  }, [saveErrorDetail]);
  const hasPermissionIssue = deniedKeys.length > 0;
  const showStrip = offline || saveFailed || authExpired || syncing || (saveFailed && pendingSavesCount > 0) || isAdmin;

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

  const forceSyncAll = async () => {
    try {
      await fetch('/api/admin/sync-force', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('rcerp_token')}` },
      });
    } catch { /* ignore */ }
  };

  const forceSyncRecentDocs = async () => {
    try {
      const res = await fetch('/api/admin/pull-recent-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('rcerp_token')}` },
      });
      const json = await res.json();
      if (json.ok && json.data) {
        applyData(json.data);
        showToast('تم جلب المستندات الأخيرة من الخادم ✓');
      } else {
        showToast(`فشل: ${json.error || 'غير معروف'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
      showToast(`خطأ: ${msg}`);
    }
  };

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
        {saveFailed && !offline && hasPermissionIssue && !authExpired && (
          <span className="flex items-center gap-1.5" title="حسابك لا يملك صلاحية حفظ هذه البيانات — راجع مسؤول النظام لمنحك الصلاحية">
            <ShieldAlert className="w-3.5 h-3.5" />
            صلاحيات غير كافية للحفظ — بياناتك محفوظة على هذا الجهاز
            <span className="text-[10px] opacity-70">({Array.from(new Set(deniedKeys)).slice(0, 2).join(' · ')})</span>
          </span>
        )}
        {saveFailed && !offline && !hasPermissionIssue && (
          <span className="flex items-center gap-1.5">
            {authExpired ? <AlertTriangle className="w-3.5 h-3.5" /> : <CloudUpload className="w-3.5 h-3.5" />}
            {authExpired ? 'انتهت صلاحية الجلسة' : 'فشل حفظ التغييرات على الخادم'} — {pendingSavesCount} عملية بانتظار المزامنة
            {saveErrorDetail && <span className="text-[10px] opacity-70">({saveErrorDetail})</span>}
            {authExpired && <button onClick={retryBootstrap} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 transition-colors"><RotateCcw className="w-3 h-3" /> تسجيل الدخول مجدداً</button>}
          </span>
        )}
        {syncing && !offline && (
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> جارٍ المزامنة… {pendingSavesCount} عملية
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {!offline && pendingSavesCount > 0 && !authExpired && (
          <button onClick={() => syncNow()} className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 transition-colors">
            <CloudUpload className="w-3 h-3" /> مزامنة الآن
          </button>
        )}
        {isAdmin && (
          <>
            <button onClick={forceSyncRecentDocs} title="جلب المستندات الأخيرة من الخادم" className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-100 border border-brand-300 hover:bg-brand-200 text-brand-800 transition-colors">
              <RotateCcw className="w-3 h-3" /> Recent Docs
            </button>
            <button onClick={forceSyncAll} title="مزامنة قسرية شاملة لجميع الأجهزة" className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 border border-amber-300 hover:bg-amber-200 text-amber-800 transition-colors">
              <RotateCcw className="w-3 h-3" /> مزامنة شاملة
            </button>
          </>
        )}
      </div>
    </div>
  );
};
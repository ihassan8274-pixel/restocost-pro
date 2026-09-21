import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu, ShieldCheck, Building2, Moon, Sun, BellRing, AlertTriangle, PackageSearch, Clock4, FileText, Wallet, CalendarClock, CloudOff, RefreshCw, KeyRound, Lock, ListChecks } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ROLE_LABELS, SystemNotification } from '../../types';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface HeaderProps {
  setActiveTab: (tab: string) => void;
  onToggleMobileMenu: () => void;
  openAlerts: () => void;
}

const TYPE_META: Record<SystemNotification['type'], { icon: React.ReactNode; label: string }> = {
  low_stock: { icon: <PackageSearch className="w-4 h-4" />, label: 'نقص مخزون' },
  expiry: { icon: <Clock4 className="w-4 h-4" />, label: 'انتهاء صلاحية' },
  overdue_invoice: { icon: <FileText className="w-4 h-4" />, label: 'فاتورة متأخرة' },
  expense_due: { icon: <Wallet className="w-4 h-4" />, label: 'مصروف متأخر' },
  cost_alert: { icon: <AlertTriangle className="w-4 h-4" />, label: 'انحراف تكلفة' },
  report_due: { icon: <CalendarClock className="w-4 h-4" />, label: 'تقرير مستحق' },
  task_assigned: { icon: <ListChecks className="w-4 h-4" />, label: 'مهمة مسنَدة' },
};

export const Header: React.FC<HeaderProps> = ({ setActiveTab, onToggleMobileMenu, openAlerts }) => {
  const { currentUser, getFoodCostAlerts, getBranchName, theme, toggleTheme, getNotifications, logo, saveFailed, authExpired, saveErrorDetail } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const alerts = getFoodCostAlerts();
  const unackCount = alerts.filter((a) => !a.isAcknowledged).length;
  const notes = getNotifications();
  const criticalCount = notes.filter((n) => n.severity === 'critical').length;
  const warningCount = notes.filter((n) => n.severity === 'warning').length;

  const [openNotes, setOpenNotes] = useState(false);
  const [openPass, setOpenPass] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (noteRef.current && !noteRef.current.contains(e.target as Node)) setOpenNotes(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Desktop notifications for critical alerts (browser Notification API).
  const [desktopEnabled, setDesktopEnabled] = useState(() => localStorage.getItem('rcerp_desktop_notify') === '1');
  const [permHint, setPermHint] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRunRef = useRef(true);

  const toggleDesktop = async () => {
    const next = !desktopEnabled;
    setDesktopEnabled(next);
    localStorage.setItem('rcerp_desktop_notify', next ? '1' : '0');
    if (next) {
      if (typeof Notification === 'undefined' || !('Notification' in window)) { setPermHint(true); return; }
      const p = await Notification.requestPermission();
      setPermHint(p !== 'granted');
    }
  };

  useEffect(() => {
    if (!desktopEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (firstRunRef.current) {
      firstRunRef.current = false;
      notes.forEach((n) => seenRef.current.add(n.id));
      return;
    }
    notes.forEach((n) => {
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);
      if (n.severity === 'critical') {
        try { new Notification(n.title, { body: n.description, tag: `rcerp-${n.id}` }); } catch { /* ignore */ }
      }
    });
  });

  // Live badge in the browser tab title.
  useEffect(() => {
    document.title = criticalCount > 0 ? `(${criticalCount}) RestoCost ERP Pro` : 'RestoCost ERP Pro';
  }, [criticalCount]);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-line sticky top-0 z-30 shadow-2xs">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <button onClick={onToggleMobileMenu} className="lg:hidden p-2 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors" title="القائمة">
              <Menu className="w-6 h-6" />
            </button>
            <button onClick={() => setActiveTab('dashboard')} className="flex items-center gap-2 cursor-pointer">
              {logo ? (
                <img src={logo} alt="شعار النظام" className="w-9 h-9 rounded-xl object-contain bg-white border border-line dark:border-slate-700" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-primary-700 flex items-center justify-center text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              )}
              <div className="text-right">
                <span className="text-base font-bold text-stone-900 leading-none block">RestoCost ERP Pro</span>
                <span className="text-[10px] text-stone-500">نظام متقدم لإدارة تكاليف وسلاسل إمداد المطاعم</span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {saveFailed && authExpired && (
              <button
                onClick={() => { localStorage.removeItem('rcerp_token'); location.reload(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-400 text-amber-800 hover:bg-amber-100 transition-colors"
                title="انتهت صلاحية جلسة الدخول. تغييراتك محفوظة على هذا الجهاز وستُرسل تلقائياً فور تسجيل الدخول من جديد."
              >
                <KeyRound className="w-4 h-4" />
                <span className="text-[11px] font-extrabold">انتهت الجلسة — اضغط لتسجيل الدخول وحفظ التغييرات</span>
              </button>
            )}
            {saveFailed && !authExpired && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 cursor-help"
                title={`${saveErrorDetail ? 'خطأ: ' + saveErrorDetail + ' — ' : ''}المصدر: ${typeof location !== 'undefined' ? location.hostname : ''} — الساعة ${new Date().toLocaleTimeString('ar-SA-u-nu-latn')}`}>
                <CloudOff className="w-4 h-4 shrink-0" />
                <div className="leading-tight">
                  <div className="text-[11px] font-extrabold hidden sm:inline">تعذر الحفظ — جارٍ إعادة المحاولة</div>
                  {saveErrorDetail && (
                    <div className="text-[9px] font-bold max-w-[320px] truncate" dir="ltr" title={saveErrorDetail}>{typeof location !== 'undefined' ? location.hostname : ''} | {saveErrorDetail}</div>
                  )}
                </div>
                <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
              </div>
            )}
            <button onClick={toggleTheme} className="p-2 text-stone-700 hover:text-amber-500 hover:bg-amber-50 border border-line rounded-xl transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-700" title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button onClick={() => setOpenPass(true)} className="p-2 text-stone-700 hover:text-primary-600 hover:bg-primary-50 border border-line rounded-xl transition-colors dark:text-slate-300 dark:hover:bg-slate-800 dark:border-slate-700" title="تغيير كلمة المرور">
              <Lock className="w-4 h-4" />
            </button>

            {currentUser && (
              <div className="hidden md:flex items-center gap-2 bg-surface-sec border border-line/90 rounded-xl px-3 py-1.5">
                <Building2 className="w-4 h-4 text-stone-500" />
                <span className="text-xs font-bold text-stone-800 max-w-[160px] truncate">
                  {getBranchName(currentUser.branchId)}
                </span>
              </div>
            )}

            <span className="hidden lg:inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              {currentUser ? ROLE_LABELS[currentUser.role] : ''}
            </span>

            {isAdmin && (
              <div className="relative" ref={noteRef}>
              <button onClick={() => setOpenNotes((v) => !v)} className="relative p-2 text-stone-700 hover:text-primary-600 hover:bg-primary-50 border border-line rounded-xl transition-colors" title="مركز التنبيهات">
                <BellRing className="w-4 h-4" />
                {notes.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {notes.length}
                  </span>
                )}
              </button>

              {openNotes && (
                <div className="absolute left-0 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-white border border-line rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <BellRing className="w-4 h-4 text-primary-600" />
                      <span className="font-bold text-xs text-stone-900">مركز التنبيهات</span>
                    </div>
                    <div className="flex gap-1.5 text-[9px] font-extrabold">
                      {criticalCount > 0 && <span className="bg-rose-100 text-rose-700 rounded-full px-2 py-0.5">{criticalCount} حرج</span>}
                      {warningCount > 0 && <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">{warningCount} تحذير</span>}
                    </div>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-stone-100">
                    {notes.length === 0 && (
                      <div className="p-8 text-center text-xs font-bold text-stone-400">لا توجد تنبيهات — كل شيء تحت السيطرة</div>
                    )}
                    {notes.map((n) => (
                      <button key={n.id} onClick={() => { setOpenNotes(false); if (n.tab) setActiveTab(n.tab); }}
                        className={`w-full text-right px-4 py-3 hover:bg-stone-50 transition-colors flex items-start gap-3 ${n.severity === 'critical' ? 'border-r-4 border-r-rose-500' : n.severity === 'warning' ? 'border-r-4 border-r-amber-400' : ''}`}>
                        <span className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${n.severity === 'critical' ? 'bg-rose-50 text-rose-600' : n.severity === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-stone-50 text-stone-500'}`}>
                          {TYPE_META[n.type].icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[11px] text-stone-900 truncate">{n.title}</span>
                            <span className={`shrink-0 text-[9px] font-extrabold rounded-full px-1.5 py-0.5 ${n.severity === 'critical' ? 'bg-rose-100 text-rose-700' : n.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>{TYPE_META[n.type].label}</span>
                          </span>
                          <span className="block text-[10px] text-stone-500 mt-0.5 leading-snug">{n.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-[11px] text-stone-800">إشعارات سطح المكتب</p>
                      <p className="text-[10px] text-stone-500">{permHint && desktopEnabled ? 'المتصفح يمنع الإشعارات — اسمح لها من إعدادات المتصفح' : 'تنبيهات حرجة تظهر حتى خارج النظام'}</p>
                    </div>
                    <button type="button" onClick={toggleDesktop} title="تفعيل إشعارات سطح المكتب" className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${desktopEnabled ? 'bg-primary-600' : 'bg-stone-300'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${desktopEnabled ? 'left-0.5' : 'left-[22px]'}`} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {isAdmin && (
              <button onClick={openAlerts} className="relative p-2 text-stone-700 hover:text-rose-600 hover:bg-rose-50 border border-line rounded-xl transition-colors" title="تنبيهات انحراف التكلفة">
                <Bell className="w-4 h-4" />
                {unackCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-xs">
                    {unackCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <ChangePasswordModal open={openPass} onClose={() => setOpenPass(false)} />
    </header>
  );
};
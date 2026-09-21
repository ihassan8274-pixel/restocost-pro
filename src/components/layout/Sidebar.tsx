import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UtensilsCrossed, X, ChevronLeft, Pin, PinOff, LogOut, Search, ScanSearch, Sparkles, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NAV_SECTIONS } from '../../navigation';
import { ROLE_LABELS } from '../../types';
import { Modal } from '../ui';

const WHATS_NEW = [
  { v: 'v2.2 — المرحلة V4', items: ['شريط مسار الموافقة أعلى كل مستند (مسودة → مراجعة → اعتماد → ترحيل)', 'معاينة استيراد Excel قبل التنفيذ مع أخطاء صف-بصف (اسحب الملف)', 'اختصارات كيبورد شاملة: / للبحث · N لإنشاء جديد · E للتصدير · Esc للإغلاق', 'مؤشر صحة النسخ الاحتياطي في إعدادات النظام مع عمر آخر نسخة'] },
  { v: 'v2.1 — المرحلة V3', items: ['وضع تابلت لشاشة الجرد اليومي من الجوال', 'نسخ وصفة مع فرق التكلفة والاعتماد المرن (مسودة)', 'رؤية متعددة الفروع بتقارير موحّدة', 'توقعات موسمية، ذكاء أسعار الموردين، FEFO، مخطط المنيو، تخطيط الإنتاج'] },
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

const OPEN_SECTION_KEY = 'rcerp_nav_open_section';

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpenMobile, onCloseMobile }) => {
  const { can, screenCan, currentUser, logout, getBranchName, logo } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  // سلوك الأكورديون: فتح قسم يطوي الآخر تلقائياً
  const [openSection, setOpenSection] = useState<string | null>(() => {
    try { return localStorage.getItem(OPEN_SECTION_KEY); } catch { return null; }
  });

  // بحث سريع في القائمة
  const [query, setQuery] = useState('');
  const [showWhatNew, setShowWhatNew] = useState(false);

  // الترويسة العائمة: مخفية افتراضياً، تظهر فقط عند الإشارة إليها بالماوس أو عند تثبيتها.
  // ثابتة الموضع (fixed) — لا تحجز من الشاشة ولا تتحرك مع محتوى الصفحة إطلاقاً.
  const [pinned, setPinned] = useState<boolean>(false);
  const [peek, setPeek] = useState<boolean>(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = pinned || peek;

  const enterMenu = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setPeek(true);
  };
  const leaveMenu = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setPeek(false), 280);
  };
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  const toggleSection = (title: string) => {
    setOpenSection((prev) => {
      const next = prev === title ? null : title;
      try {
        if (next) localStorage.setItem(OPEN_SECTION_KEY, next);
        else localStorage.removeItem(OPEN_SECTION_KEY);
      } catch { /* ignore */ }
      return next;
    });
  };

  const go = (id: string) => { setActiveTab(id); onCloseMobile(); setQuery(''); };

  // عمليات البحث: عند وجود بحث، نجمع كل العناصر المطابقة عبر كل الأقسام
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matches: { section: string; item: import('../../navigation').NavItem }[] = [];
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (!can(item.permission) || !screenCan(item.id, 'view')) continue;
        if (item.adminOnly && !isAdmin) continue;
        if (item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) {
          matches.push({ section: section.title, item });
        }
      }
    }
    return matches;
  }, [query, can, screenCan]);

  const navContent = (
    <div className="flex flex-col h-full bg-white text-stone-700 w-72 border-l border-line">
      <div className="p-4 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-card-hover ${logo ? '' : 'bg-gradient-to-br from-amber-400 via-amber-500 to-primary-600'}`}>
              {logo ? <img src={logo} alt="شعار النظام" className="w-10 h-10 rounded-xl object-contain" /> : <UtensilsCrossed className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-primary-800 text-sm tracking-tight truncate">RestoCost ERP</h2>
              <p className="text-[10px] text-stone-400 truncate">نظام إدارة المخزون والمشتريات</p>
            </div>
          </div>
          <button onClick={onCloseMobile} className="lg:hidden p-1 text-stone-400 hover:text-stone-700 rounded-md">
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentUser && (
          <div className="mt-3 p-2.5 rounded-xl bg-surface-sec border border-line flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-primary-600 flex items-center justify-center text-white text-xs font-black shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-stone-800 truncate">{currentUser.name}</p>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] text-primary-700 font-bold">{ROLE_LABELS[currentUser.role]}</span>
                <span className="text-[10px] text-stone-400 truncate">{getBranchName(currentUser.branchId)}</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setPinned((p) => !p)}
          className={`hidden lg:flex mt-3 w-full items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${pinned ? 'bg-primary-100 text-primary-700 hover:bg-primary-200' : 'bg-surface-sec text-stone-500 hover:text-primary-700 hover:bg-primary-50 border border-line'}`}
          title={pinned ? 'إلغاء التثبيت — تعود القائمة للظهور عند الإشارة فقط' : 'تثبيت القائمة مفتوحة دائماً'}
        >
          {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          {pinned ? 'مثبتة — اضغط للفك' : 'تثبيت القائمة'}
        </button>
      </div>

      {/* شريط البحث السريع */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث سريع عن شاشة..."
            className="w-full bg-surface-sec border border-line rounded-xl pl-8 pr-9 py-2 text-xs text-stone-700 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
        {results ? (
          results.length === 0 ? (
            <div className="py-10 text-center">
              <ScanSearch className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-xs text-stone-400 font-bold">لا توجد نتائج لـ «{query}»</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(new Set(results.map((r) => r.section))).map((sectionTitle) => (
                <div key={sectionTitle}>
                  <p className="px-3 py-1 text-[10px] font-extrabold text-stone-400 uppercase tracking-wider border-r-[3px] border-primary-500">{sectionTitle}</p>
                  <div className="space-y-1">
                    {results.filter((r) => r.section === sectionTitle).map(({ item }) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button key={item.id} onClick={() => go(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-150 relative ${
                            isActive
                              ? 'bg-primary-50 text-primary-700 font-semibold before:absolute before:right-[-12px] before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-primary-600'
                              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800'
                          }`}>
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-600' : 'text-stone-400'}`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => can(item.permission) && screenCan(item.id, 'view') && (isAdmin || !item.adminOnly));
            if (visibleItems.length === 0) return null;
            const isOpen = openSection === section.title;
            return (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-colors group ${
                    isOpen ? 'bg-primary-50 text-primary-700' : 'text-stone-400 hover:text-primary-700 hover:bg-primary-50'
                  }`}
                  title={isOpen ? 'طي القسم' : 'توسيع القسم'}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-1 h-3 bg-primary-500 rounded-full" />
                    {section.title}
                    <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${isOpen ? 'bg-primary-100 text-primary-700' : 'bg-stone-100 text-stone-400'}`}>{visibleItems.length}</span>
                  </span>
                  <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'} text-stone-300 group-hover:text-primary-500`} />
                </button>
                {isOpen && (
                  <div className="relative mt-1 mr-2 pr-1 space-y-1 border-r border-line">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => go(item.id)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg font-medium text-sm transition-all duration-150 relative ${
                            isActive
                              ? 'bg-primary-50 text-primary-700 font-semibold before:absolute before:right-[-13px] before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-primary-600'
                              : item.highlight
                              ? 'bg-primary-100/60 text-primary-700 hover:bg-primary-100 border border-primary-200'
                              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isActive ? 'bg-primary-100' : item.highlight ? 'bg-primary-200/60' : 'bg-stone-100'}`}>
                              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-700' : item.highlight ? 'text-primary-700' : 'text-stone-400'}`} />
                            </span>
                            <span className="truncate">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {item.badge && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${isActive ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'}`}>
                                {item.badge}
                              </span>
                            )}
                            {isActive && <ChevronLeft className="w-4 h-4 text-primary-600 shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div className="p-3 border-t border-line space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            onClick={() => setShowWhatNew(true)}
            className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary-700 hover:text-primary-900 hover:bg-primary-50 rounded-lg px-2 py-1.5 transition-colors"
            title="استعراض أحدث المزايا"
          >
            <Sparkles className="w-3.5 h-3.5" /> ما الجديد؟
          </button>
          <p className="text-center text-[10px] text-stone-400">RestoCost ERP Pro v2.2</p>
        </div>
        <button
          onClick={() => { logout(); onCloseMobile(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-xs border border-rose-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* فاصل في تدفق الصفحة بعرض العمود المدمج حتى لا يختفي المحتوى تحته */}
      <div className="hidden lg:block shrink-0 w-[60px]" />

      {/* العمود المدمج: ظاهر دائماً — ثابت لا يتحرك مع تمرير الصفحة */}
      <div
        onMouseEnter={enterMenu}
        className="hidden lg:flex fixed top-0 bottom-0 right-0 w-[60px] z-30 flex-col items-center bg-white border-l border-line py-3 gap-1 overflow-y-auto"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-primary-600 flex items-center justify-center text-white shrink-0 shadow-card-hover">
          {logo ? <img src={logo} alt="الشعار" className="w-9 h-9 rounded-full object-contain" /> : <UtensilsCrossed className="w-4 h-4" />}
        </div>
        <div className={`w-7 border-t border-line my-1 ${pinned ? 'opacity-40' : ''}`} title={pinned ? 'القائمة مثبتة مفتوحة' : 'مرّر المؤشر للتوسيع'} />
        {NAV_SECTIONS.map((section) => {
          const railItems = section.items.filter((item) => can(item.permission) && screenCan(item.id, 'view') && (isAdmin || !item.adminOnly));
          if (railItems.length === 0) return null;
          return (
            <React.Fragment key={section.title}>
              {railItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.id)}
                    title={`${section.title} — ${item.label}`}
                    className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-br from-amber-500 to-primary-600 text-white shadow-md shadow-amber-500/30'
                        : item.highlight
                        ? 'text-primary-600 hover:bg-primary-100'
                        : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700'
                    }`}
                  >
                    <Icon className="w-[18px] h-[18px]" />
                  </button>
                );
              })}
              <div className="w-7 border-t border-line my-1 shrink-0" />
            </React.Fragment>
          );
        })}
        <div className="mt-auto pt-2">
          <button
            onClick={() => { logout(); onCloseMobile(); }}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 transition-colors"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* القائمة الكاملة: تنزلق فوق المحتوى عند الإشارة أو التثبيت */}
      <aside
        onMouseEnter={enterMenu}
        onMouseLeave={leaveMenu}
        className={`hidden lg:block fixed top-0 bottom-0 right-0 z-40 transition-transform duration-200 ease-out ${
          visible ? 'translate-x-0 shadow-2xl shadow-stone-950/50' : 'translate-x-full pointer-events-none'
        }`}
      >
        {navContent}
      </aside>

      {/* الجوال: نفس السلوك السابق */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-10">{navContent}</div>
        </div>
      )}

      <Modal open={showWhatNew} onClose={() => setShowWhatNew(false)} title="ما الجديد في RestoCost ERP؟">
        <div className="space-y-4">
          <p className="text-xs font-bold text-slate-500">ملخص أبرز المزايا في الإصدارات الأخيرة — يُحدَّث مع كل مرحلة.</p>
          {WHATS_NEW.map((group) => (
            <div key={group.v}>
              <p className="flex items-center gap-1.5 text-[11px] font-black text-primary-700 mb-2"><Sparkles className="w-3.5 h-3.5" /> {group.v}</p>
              <ul className="space-y-1.5">
                {group.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" /> {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-2 flex justify-end">
          <button onClick={() => setShowWhatNew(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium text-xs">إغلاق</button>
        </div>
      </Modal>
    </>
  );
};

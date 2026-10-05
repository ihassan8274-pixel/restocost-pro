import React, { useMemo, useState, useEffect } from 'react';
import { Search, Save, CheckCircle2, Smartphone, RotateCcw, ClipboardCheck, History, Eye, Package, FileDown, MessageCircle, Printer, Filter, Download, Shield, Pencil, CalendarDays, Store, Plus, Minus, UserCircle2, Tablet, DownloadCloud, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useSyncStore } from '@stores/syncStore';
import { stockPerPurchase, purchaseUnitName } from '../../business/units';
import { CountEntry, blankCountEntry, cleanCountInput, countFilled, buildCountItems } from '../../business/counting';
import { downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';
import { useAdminDelete, AdminDeleteModal } from '../../hooks';
import { PageHeader, TabBar, Btn, inputCls, StatCard } from '../ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const draftKey = (branchId: string) => `rcerp_mobile_count_draft_${branchId}`;

// إدخال الكمية بعمودين: p = وحدة الشراء (كرتون/صندوق)، s = وحدة المخزون (عدد/كغم)
// (النوع ودوال البناء مستخرجة في src/business/counting.ts لاختبارها)

type Tab = 'count' | 'log';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const fmtDateLong = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return d || '';
  const [, y, mo, day] = m;
  return `${Number(day)} ${MONTHS_AR[Number(mo) - 1] || ''} ${y}`;
};

const MobileCountView: React.FC = () => {
  const { branches, rawMaterials, inventory, dailyCounts, addDailyCount, updateDailyCount, deleteDailyCount, getBranchName, currentUser, showToast, can, syncNow } = useApp();
  const { saveErrorDetail } = useSyncStore();
  const adminDelete = useAdminDelete();
  const activeBranches = branches.filter((b) => b.isActive);
  const [branchId, setBranchId] = useState<string>(() => {
    const mine = activeBranches.find((b) => b.id === currentUser?.branchId);
    return mine?.id || activeBranches[0]?.id || '';
  });
  const [tab, setTab] = useState<Tab>('count');
  const [countDate, setCountDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, CountEntry>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  // وضع التابلت للجرد الميداني: صفوف وأزرار ضخمة (بند 38)
  const [tablet, setTablet] = useState<boolean>(() => localStorage.getItem('rcerp_tablet_count') === '1');
  useEffect(() => { localStorage.setItem('rcerp_tablet_count', tablet ? '1' : '0'); }, [tablet]);

  // PWA install prompt (بند 69)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);
  const installApp = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') { showToast('تم تثبيت التطبيق ✓'); setShowInstall(false); setDeferredPrompt(null); }
  };

  // Log filters
  const [logBranch, setLogBranch] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!branchId) return;
    try {
      const raw = JSON.parse(localStorage.getItem(draftKey(branchId)) || '{}') as Record<string, unknown>;
      const next: Record<string, CountEntry> = {};
      for (const [k, v] of Object.entries(raw)) {
        next[k] = typeof v === 'string' ? { p: v, s: '' } : { p: (v as CountEntry)?.p || '', s: (v as CountEntry)?.s || '' };
      }
      setCounts(next);
    } catch { setCounts({}); }
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    try { localStorage.setItem(draftKey(branchId), JSON.stringify(counts)); } catch { /* ignore */ }
  }, [counts, branchId]);

  const theoMap = useMemo(() => {
    const m: Record<string, number> = {};
    inventory.forEach((lot) => {
      if (lot.branchId !== branchId) return;
      m[lot.rawMaterialId] = (m[lot.rawMaterialId] || 0) + lot.quantity;
    });
    return m;
  }, [inventory, branchId]);

  const mats = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rawMaterials
      .filter((m) => m.isActive)
      .filter((m) => !q || m.nameAr.toLowerCase().includes(q) || (m.nameEn || '').toLowerCase().includes(q) || (m.code || '').toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [rawMaterials, search]);

  const countedCount = Object.values(counts).filter((ce) => countFilled(ce)).length;
  const progress = mats.length ? Math.round((countedCount / mats.length) * 100) : 0;

  const setCountField = (mid: string, which: 'p' | 's', v: string) => {
    const clean = cleanCountInput(v);
    setCounts((prev) => {
      const cur = prev[mid] || blankCountEntry();
      return { ...prev, [mid]: { ...cur, [which]: clean } };
    });
  };

  const bumpCount = (mid: string, which: 'p' | 's', delta: number) => {
    const cur = Number(counts[mid]?.[which]) || 0;
    setCountField(mid, which, String(Math.max(0, cur + delta)));
  };

  const buildItems = () => buildCountItems(mats, counts, theoMap);

  // نموذج جرد فارغ مطابق لـ printCurrentCount: الكود، الصنف، الوحدة،
  // المعدود، ملاحظات — بلا رصيد نظامي ولا فرق.
  const printBlankSheet = () => {
    if (!branchId) { showToast('اختر الفرع أولاً'); return; }
    const branchMats = mats;
    const rows = branchMats.map((m) => [
      m.id,
      m.nameAr,
      m.unit || '',
      '',
      '',
    ]);
    openPrintWindow({
      title: `نموذج جرد فارغ — ${getBranchName(branchId)}`,
      subtitle: `${fmtDateLong(countDate)} — العداد: ${currentUser?.name || '—'}`,
      meta: [
        ['الفرع', getBranchName(branchId)],
        ['التاريخ', fmtDateLong(countDate)],
        ['القائم بالجرد', currentUser?.name || '—'],
        ['عدد الأصناف', String(branchMats.length)],
        ['ملاحظة', 'عبّئ خانة «المعدود» يدوياً ثم أدخل الأرقام في التطبيق'],
      ],
      tables: [{
        title: 'تفاصيل الجرد',
        header: ['الكود', 'الصنف', 'الوحدة', 'المعدود', 'ملاحظات'],
        rows,
      }],
      footer: `نموذج جرد فارغ — RestoCost ERP Pro (${branchMats.length} صنفاً)`,
    });
  };

  // طباعة تفاصيل الجرد المُدخَل: الكود، الصنف، الوحدة، المعدود، ملاحظات.
  // بلا رصيد نظامي ولا فرق — النموذج ورقي يُملأ ثم تُدخَل أرقامه، وعرض النظامي
  // يميل العدّاد للمطابقة بدل العدّ المستقل.
  const printCurrentCount = () => {
    if (!branchId) { showToast('اختر الفرع أولاً'); return; }
    const items = buildItems();
    if (!items.length) { showToast('لا توجد أصناف معدة للطباعة'); return; }
    const rows = items.map((i) => [
      i.rawMaterialId,
      i.itemName,
      i.unit,
      i.countedStorage.toFixed(2),   // الكمية بوحدة المخزون
      '',
    ]);
    openPrintWindow({
      title: `تفاصيل الجرد — ${getBranchName(branchId)}`,
      subtitle: `${fmtDateLong(countDate)} — العداد: ${currentUser?.name || '—'}`,
      meta: [
        ['الفرع', getBranchName(branchId)],
        ['التاريخ', fmtDateLong(countDate)],
        ['القائم بالجرد', currentUser?.name || '—'],
        ['عدد الأصناف', String(items.length)],
        ['ملاحظة', 'عبّئ خانة «المعدود» يدوياً ثم أدخل الأرقام في التطبيق'],
      ],
      tables: [{
        title: 'تفاصيل الجرد',
        header: ['الكود', 'الصنف', 'الوحدة', 'المعدود', 'ملاحظات'],
        rows,
      }],
      footer: 'نموذج جرد ميداني — RestoCost ERP Pro',
    });
  };

  // سجل جرد محفوظ — بنفس أعمدة نموذج الجرد الميداني:
  // الكود، الصنف، الوحدة، المعدود، ملاحظات. بلا النظامي ولا الفرق ولا الهدر،
  // اتساقاً مع printCurrentCount/printBlankSheet.
  const printRecord = (rec: typeof dailyCounts[number]) => {
    const rows = rec.items.map((it) => [
      it.rawMaterialId,
      it.itemName,
      it.unit,
      it.countedQty.toFixed(2),
      '',
    ]);
    openPrintWindow({
      title: `تفاصيل الجرد — ${getBranchName(rec.branchId)}`,
      subtitle: `${fmtDateLong(rec.date)} — العداد: ${rec.countedBy || '—'}`,
      meta: [
        ['الفرع', getBranchName(rec.branchId)],
        ['التاريخ', fmtDateLong(rec.date)],
        ['القائم بالجرد', rec.countedBy || '—'],
        ['عدد الأصناف', String(rec.items.length)],
      ],
      tables: [{
        title: 'تفاصيل الجرد',
        header: ['الكود', 'الصنف', 'الوحدة', 'المعدود', 'ملاحظات'],
        rows,
      }],
      footer: 'جرد — RestoCost ERP Pro',
    });
  };

  const saveCount = async () => {
    if (!branchId) { showToast('اختر الفرع أولاً'); return; }
    if (!countDate) { showToast('اختر تاريخ الجرد'); return; }
    const items = buildItems();
    if (!items.length) { showToast('لم تُدخل أي كمية معدودة بعد'); return; }
    const payload = {
      branchId,
      date: countDate,
      countedBy: currentUser?.name || '—',
      status: 'saved' as const,
      items,
      totalConsumedQty: Number(items.reduce((s, i) => s + i.consumedQty, 0).toFixed(3)),
      totalConsumedValue: Number(items.reduce((s, i) => s + i.consumedValue, 0).toFixed(2)),
    };
    if (editingId) {
      updateDailyCount(editingId, payload);
      showToast(`تم تحديث الجرد (${items.length} صنفاً) ✓`);
    } else {
      addDailyCount(payload);
      showToast(`تم حفظ جرد ${items.length} صنفاً ✓`);
    }
    setCounts({});
    setEditingId(null);
    setTab('log');
    // مزامنة فورية مع الخادم مع إعادة محاولة
    let synced = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      synced = await syncNow('rcerp_daily_counts');
      if (synced) break;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    const saveError = saveErrorDetail;
    showToast(synced
      ? 'تم الحفظ والمزامنة مع الخادم ✓'
      : `فشل المزامنة: ${saveError || 'غير معروف'} — اضغط "مزامنة الآن" في الشريط العلوي`);
  };

  const cancelEdit = () => {
    if (editingId) { setEditingId(null); setCounts({}); showToast('تم إلغاء التعديل'); }
  };

  const branchLogs = useMemo(() => {
    let filtered = dailyCounts;
    if (logBranch !== 'all') filtered = filtered.filter((d) => d.branchId === logBranch);
    if (logDateFrom) filtered = filtered.filter((d) => d.date >= logDateFrom);
    if (logDateTo) filtered = filtered.filter((d) => d.date <= logDateTo);
    if (logSearch) {
      const q = logSearch.toLowerCase();
      filtered = filtered.filter((d) =>
        d.countedBy?.toLowerCase().includes(q) ||
        getBranchName(d.branchId).toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.items.some((it) => it.itemName.toLowerCase().includes(q))
      );
    }
    return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [dailyCounts, logBranch, logDateFrom, logDateTo, logSearch, getBranchName]);

  const viewingRecord = viewId ? dailyCounts.find((d) => d.id === viewId) : null;

  const openEdit = (rec: typeof dailyCounts[number]) => {
    setBranchId(rec.branchId);
    setCountDate(rec.date);
    setCounts(Object.fromEntries(rec.items.map((it) => [it.rawMaterialId, { p: String(it.countedQty), s: '' }])));
    setEditingId(rec.id);
    setViewId(null);
    setTab('count');
  };

  const resetFilters = () => { setLogSearch(''); setLogDateFrom(''); setLogDateTo(''); setLogBranch('all'); };

  const handleDeleteRecord = (recId: string) => {
    adminDelete.requestDelete(() => {
      deleteDailyCount(recId);
      showToast('تم حذف سجل الجرد');
      setViewId(null);
    });
  };

  // Admin Delete Modal - shared
  const adminDeleteModal = (
    <AdminDeleteModal
      isOpen={adminDelete.isModalOpen}
      onClose={adminDelete.cancelDelete}
      onConfirm={adminDelete.confirmDelete}
      password={adminDelete.password}
      setPassword={adminDelete.setPassword}
      title="تأكيد حذف سجل الجرد"
      message="سيتم حذف سجل الجرد نهائياً. هذا الإجراء يتطلب صلاحية مسؤول النظام."
    />
  );

  // ================= LOG TAB =================
  if (tab === 'log') {
    const totalRecords = branchLogs.length;
    const totalItems = branchLogs.reduce((s, r) => s + r.items.length, 0);

    return (
      <div className="max-w-4xl mx-auto pb-10">
        <PageHeader
          title="سجل الجرد"
          subtitle="تتبع شامل لجميع الجردات بكل الفروع — الفرع، التاريخ، القائم بالجرد"
          icon={<History className="w-6 h-6" />}
          actions={
            <>
              <Btn tone="primary" onClick={() => { setTab('count'); setEditingId(null); setCounts({}); }}><ClipboardCheck className="w-4 h-4" /> جرد جديد</Btn>
              <Btn tone="ghost" onClick={() => setShowFilters(!showFilters)}><Filter className="w-4 h-4" /> فلاتر</Btn>
            </>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 mt-4">
          <StatCard label="السجلات" value={String(totalRecords)} icon={<History className="w-4 h-4 text-slate-400" />} />
          <StatCard label="إجمالي الأصناف" value={String(totalItems)} icon={<Package className="w-4 h-4 text-slate-400" />} />
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mt-4 shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="بحث: الفرع، القائم بالجرد، الصنف، رقم السجل..." className={`${inputCls} pr-9`} />
          </div>
          {showFilters && (
            <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">الفرع</span>
                <select value={logBranch} onChange={(e) => setLogBranch(e.target.value)} className={inputCls}>
                  <option value="all">كل الفروع</option>
                  {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={logDateFrom} onChange={(e) => setLogDateFrom(e.target.value)} className={inputCls} />
                <input type="date" value={logDateTo} onChange={(e) => setLogDateTo(e.target.value)} className={inputCls} />
              </div>
              <button onClick={resetFilters} className="text-xs text-brand-600 font-bold underline">مسح كل الفلاتر</button>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[11px] font-bold text-slate-500">{branchLogs.length} نتيجة</span>
            {branchLogs.length > 0 && (
              <button onClick={() => {
                const allItems = branchLogs.flatMap((r) => r.items.map((it) => ({
                  التاريخ: r.date,
                  الفرع: getBranchName(r.branchId),
                  المعد: r.countedBy,
                  الصنف: it.itemName,
                  النظامي: it.theoreticalQty,
                  المعدود: it.countedQty,
                  الفرق: it.countedQty - it.theoreticalQty,
                  الوحدة: it.unit,
                  تكلفة_الوحدة: it.unitCost,
                  قيمة_الاستهلاك: it.consumedValue,
                })));
                downloadCSV(`سجل_الجرد_${new Date().toISOString().slice(0, 10)}.csv`, ['التاريخ', 'الفرع', 'المعد', 'الصنف', 'النظامي', 'المعدود', 'الفرق', 'الوحدة', 'تكلفة_الوحدة', 'قيمة_الاستهلاك'], allItems.map((i) => [i.التاريخ, i.الفرع, i.المعد, i.الصنف, i.النظامي, i.المعدود, i.الفرق, i.الوحدة, i.تكلفة_الوحدة, i.قيمة_الاستهلاك]));
              }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-200 transition-all">
                <Download className="w-3.5 h-3.5" /> تصدير Excel
              </button>
            )}
          </div>
        </div>

        {viewingRecord ? (
          <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
              <button onClick={() => setViewId(null)} className="text-sm font-bold text-brand-600 flex items-center gap-1">← العودة للسجل</button>
              <span className="text-xs font-bold text-slate-500">{fmtDateLong(viewingRecord.date)}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded-xl p-2"><p className="text-[10px] text-slate-500">الفرع</p><p className="font-extrabold text-slate-800 text-sm truncate">{getBranchName(viewingRecord.branchId)}</p></div>
              <div className="bg-slate-50 rounded-xl p-2"><p className="text-[10px] text-slate-500">القائم بالجرد</p><p className="font-extrabold text-slate-800 text-sm truncate">{viewingRecord.countedBy || '—'}</p></div>
              <div className="bg-slate-50 rounded-xl p-2"><p className="text-[10px] text-slate-500">الأصناف</p><p className="font-extrabold text-slate-800">{viewingRecord.items.length}</p></div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Btn tone="dark" onClick={() => printRecord(viewingRecord)}><Printer className="w-4 h-4" /> PDF</Btn>
              <Btn tone="ghost" onClick={() => downloadCSV(`جرد_${viewingRecord.date}.csv`, ['الصنف', 'النظامي', 'المعدود', 'الفرق', 'الوحدة', 'تكلفة الوحدة', 'قيمة الاستهلاك'], viewingRecord.items.map((it) => [it.itemName, it.theoreticalQty, it.countedQty, it.countedQty - it.theoreticalQty, it.unit, it.unitCost, it.consumedValue]))}><FileDown className="w-4 h-4" /> Excel</Btn>
              <Btn tone="success" onClick={() => {
                const txt = `جرد يومي — ${getBranchName(viewingRecord.branchId)}\nالتاريخ: ${fmtDateLong(viewingRecord.date)}\nالقائم بالجرد: ${viewingRecord.countedBy || '—'}\n\nالأصناف: ${viewingRecord.items.length}\n\n${'─'.repeat(30)}\n${viewingRecord.items.map((it) => {
                  const d = it.countedQty - it.theoreticalQty;
                  return `${it.itemName}\n   نظامي: ${it.theoreticalQty.toFixed(2)} ← معدود: ${it.countedQty.toFixed(2)} (${d > 0 ? '+' : ''}${d.toFixed(2)}) ${it.unit}`;
                }).join('\n\n')}\n\n${'─'.repeat(30)}\nRestoCost ERP Pro`;
                if (navigator.share) { navigator.share({ title: `جرد ${viewingRecord.date}`, text: txt }); } else { navigator.clipboard.writeText(txt); showToast('تم النسخ للحافظة — الصق في الواتساب'); }
              }}><MessageCircle className="w-4 h-4" /> واتساب</Btn>
              {can('delete_data') && (
                <Btn tone="danger" onClick={() => handleDeleteRecord(viewingRecord.id)}><Shield className="w-4 h-4" /> حذف (مسؤول)</Btn>
              )}
            </div>
            <div className="flex justify-end">
              <Btn tone="primary" onClick={() => openEdit(viewingRecord)}><Pencil className="w-4 h-4" /> فتح وتعديل هذا الجرد</Btn>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {viewingRecord.items.map((it) => {
                const diff = it.countedQty - it.theoreticalQty;
                return (
                  <div key={it.rawMaterialId} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{it.itemName}</p>
                      <p className="text-[10px] text-slate-400">نظامي: {it.theoreticalQty.toFixed(2)} | معدود: {it.countedQty.toFixed(2)} {it.unit}</p>
                    </div>
                    <span className={`text-xs font-extrabold px-2 py-1 rounded-lg ${diff > 0 ? 'bg-sky-50 text-sky-700' : diff < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {branchLogs.length === 0 && (
              <div className="text-center py-14 text-slate-400">
                <Package className="w-14 h-14 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold">لا توجد سجلات جرد مطابقة</p>
                <p className="text-xs mt-1">ابدأ بالجرد من تبويب "جرد جديد"</p>
              </div>
            )}
            {branchLogs.map((rec) => (
              <div key={rec.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-brand-200 transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-slate-800 text-sm">{getBranchName(rec.branchId)}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${rec.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-brand-50 text-brand-700 border border-brand-200'}`}>
                          {rec.status === 'approved' ? 'معتمد' : 'محفوظ'}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{fmtDateLong(rec.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                      <UserCircle2 className="w-3.5 h-3.5" />
                      <span className="font-bold">القائم بالجرد: <span className="text-slate-700">{rec.countedBy || '—'}</span></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[11px] font-bold">
                      <span className="text-slate-500"><Package className="w-3 h-3 inline ml-1" />{rec.items.length} صنفاً</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => setViewId(rec.id)} className="p-2 rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-100" title="عرض التفاصيل">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => printRecord(rec)} className="p-2 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100" title="طباعة الجرد">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(rec)} className="p-2 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100" title="فتح وتعديل">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {can('delete_data') && (
                      <button onClick={() => handleDeleteRecord(rec.id)} className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-100" title="حذف (مسؤول النظام)">
                        <Shield className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {adminDeleteModal}
      </div>
    );
  }

  // ================= COUNT TAB =================
  return (
    <div className="max-w-3xl mx-auto pb-32">
      <PageHeader
        title={editingId ? 'تعديل جرد قائم' : 'جرد سريع من الجوال'}
        subtitle={`${fmtDateLong(countDate)} — ${getBranchName(branchId)} ${currentUser?.name ? `· القائم بالجرد: ${currentUser.name}` : ''}`}
        icon={editingId ? <Pencil className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
        actions={
          <>
            <Btn tone={tablet ? 'primary' : 'ghost'} onClick={() => setTablet((t) => !t)}><Tablet className="w-4 h-4" /> {tablet ? 'وضع التابلت مفعّل' : 'وضع التابلت'}</Btn>
            <Btn tone="ghost" onClick={printBlankSheet}><Printer className="w-4 h-4" /> نموذج فارغ</Btn>
            <Btn tone="ghost" onClick={printCurrentCount}><Printer className="w-4 h-4" /> طباعة الجرد</Btn>
            <TabBar
              tabs={[
                { id: 'count', label: editingId ? 'تعديل' : 'جرد جديد' },
                { id: 'log', label: `السجل (${dailyCounts.length})` },
              ]}
              active={tab}
              onChange={(t) => setTab(t as Tab)}
            />
          </>
        }
      />

      {/* PWA Install Prompt (بند 69) */}
      {showInstall && deferredPrompt && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <DownloadCloud className="w-6 h-6 text-amber-600" />
            <div>
              <p className="font-bold text-amber-800 text-sm">ثبت التطبيق على جهازك</p>
              <p className="text-amber-700 text-[11px]">أضف RestoCost ERP للشاشة الرئيسية للوصول السريع والعمل بدون إنترنت</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Btn onClick={installApp} tone="primary"><DownloadCloud className="w-3.5 h-3.5" /> تثبيت</Btn>
            <button onClick={() => setShowInstall(false)} className="p-2 text-amber-500 hover:bg-amber-100 rounded-lg" aria-label="إغلاق"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Meta: branch, date, counter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs mt-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 block mb-1"><Store className="w-3.5 h-3.5 inline ml-1" />الفرع</span>
            <select value={branchId} onChange={(e) => { if (!editingId) setBranchId(e.target.value); }} disabled={!!editingId} className={`${inputCls} ${editingId ? 'bg-slate-50 text-slate-500' : ''}`}>
              {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 block mb-1"><CalendarDays className="w-3.5 h-3.5 inline ml-1" />تاريخ الجرد</span>
            <input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 block mb-1"><UserCircle2 className="w-3.5 h-3.5 inline ml-1" />القائم بالجرد</span>
            <div className={`${inputCls} bg-slate-50 text-slate-700 font-bold`}>{currentUser?.name || '—'}</div>
          </label>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن صنف بالاسم أو الكود..." className={`${inputCls} pr-9`} inputMode="search" />
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
          <ClipboardCheck className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1">
            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${progress === 100 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
          <span className="text-[11px] font-extrabold text-slate-600 shrink-0">{countedCount} / {mats.length}</span>
          {editingId ? (
            <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-white" title="إلغاء التعديل"><RotateCcw className="w-4 h-4" /></button>
          ) : (
            <button onClick={() => setCounts({})} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-white" title="مسح كل المدخلات"><RotateCcw className="w-4 h-4" /></button>
          )}
        </div>
      </div>

      {/* Count items */}
      <div className="mt-3 space-y-3">
        {mats.map((m) => {
          const ce = counts[m.id] || blankCountEntry();
          const pVal = ce.p;
          const sVal = ce.s;
          const done = pVal !== '' || sVal !== '';
          const factor = stockPerPurchase(m);
          const pQty = Number(pVal) || 0;
          const sQty = Number(sVal) || 0;
          // وضع عمودي وحدة الشراء (كرتون/صندوق) + وحدة المخزون (عدد) عند وجود معامل تحويل فعلي
          const twoCols = !!m.purchaseUnit && m.purchaseUnit.trim() !== '' && factor > 1;
          const countedStorage = Number((sQty + pQty * factor).toFixed(3));
          const unit = m.unit || 'وحدة';
          const pUnit = purchaseUnitName(m) || unit;
          return (
            <div key={m.id} className={`bg-white border rounded-2xl transition-colors ${done ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'} ${tablet ? 'p-5' : 'p-3'}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`font-bold text-slate-800 truncate ${tablet ? 'text-2xl' : 'text-sm'}`}>{m.nameAr}</p>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-bold whitespace-nowrap ${tablet ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>{pUnit}</span>
                    {twoCols && factor > 1 && (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold whitespace-nowrap ${tablet ? 'text-sm px-3 py-1' : 'text-[10px]'}`}>1 {pUnit} = {factor} {unit}</span>
                    )}
                  </div>
                </div>
                {!twoCols && (
                  <div className={`flex items-center gap-1 shrink-0 ${tablet ? 'gap-2.5' : ''}`}>
                    <button onClick={() => bumpCount(m.id, 'p', -1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-16 h-16 text-3xl rounded-2xl' : 'w-9 h-11 text-lg'}`}><Minus className={tablet ? 'w-7 h-7' : 'w-4 h-4'} /></button>
                    <input
                      value={pVal}
                      onChange={(e) => setCountField(m.id, 'p', e.target.value)}
                      inputMode="decimal"
                      placeholder="0"
                      className={`text-center font-extrabold font-mono rounded-xl border-2 outline-none ${done ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 focus:border-brand-400'} ${tablet ? 'w-36 h-16 text-3xl rounded-2xl' : 'w-20 h-11 text-lg'}`}
                    />
                    <button onClick={() => bumpCount(m.id, 'p', 1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-16 h-16 text-3xl rounded-2xl' : 'w-9 h-11 text-lg'}`}><Plus className={tablet ? 'w-7 h-7' : 'w-4 h-4'} /></button>
                  </div>
                )}
              </div>

              {/* عمودا الكمية: وحدة الشراء + وحدة المخزون */}
              {twoCols && (
                <div className={`mt-3 grid grid-cols-2 gap-2 ${tablet ? 'gap-3' : ''}`}>
                  <div>
                    <p className={`text-[10px] font-extrabold text-slate-400 mb-1 ${tablet ? 'text-sm mb-1.5' : ''}`}>وحدة الشراء ({pUnit})</p>
                    <div className={`flex items-center gap-1 ${tablet ? 'gap-2' : ''}`}>
                      <button type="button" onClick={() => bumpCount(m.id, 'p', -1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-14 h-14 text-2xl' : 'w-8 h-10 text-base'}`}><Minus className={tablet ? 'w-6 h-6' : 'w-3.5 h-3.5'} /></button>
                      <input
                        value={pVal}
                        onChange={(e) => setCountField(m.id, 'p', e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className={`text-center font-extrabold font-mono rounded-xl border-2 outline-none ${done ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 focus:border-brand-400'} ${tablet ? 'w-full h-14 text-2xl' : 'w-full h-10 text-base'}`}
                      />
                      <button type="button" onClick={() => bumpCount(m.id, 'p', 1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-14 h-14 text-2xl' : 'w-8 h-10 text-base'}`}><Plus className={tablet ? 'w-6 h-6' : 'w-3.5 h-3.5'} /></button>
                    </div>
                    <p className={`text-[10px] text-slate-400 mt-1 ${tablet ? 'text-sm mt-1.5' : ''}`}>= <strong className="font-mono text-brand-600">{(pQty * factor).toFixed(2)}</strong> {unit}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] font-extrabold text-slate-400 mb-1 ${tablet ? 'text-sm mb-1.5' : ''}`}>وحدة المخزون ({unit})</p>
                    <div className={`flex items-center gap-1 ${tablet ? 'gap-2' : ''}`}>
                      <button type="button" onClick={() => bumpCount(m.id, 's', -1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-14 h-14 text-2xl' : 'w-8 h-10 text-base'}`}><Minus className={tablet ? 'w-6 h-6' : 'w-3.5 h-3.5'} /></button>
                      <input
                        value={sVal}
                        onChange={(e) => setCountField(m.id, 's', e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className={`text-center font-extrabold font-mono rounded-xl border-2 outline-none ${done ? 'border-emerald-400 text-emerald-700' : 'border-slate-200 focus:border-brand-400'} ${tablet ? 'w-full h-14 text-2xl' : 'w-full h-10 text-base'}`}
                      />
                      <button type="button" onClick={() => bumpCount(m.id, 's', 1)} className={`rounded-xl bg-slate-100 active:bg-slate-200 flex items-center justify-center font-bold text-slate-600 ${tablet ? 'w-14 h-14 text-2xl' : 'w-8 h-10 text-base'}`}><Plus className={tablet ? 'w-6 h-6' : 'w-3.5 h-3.5'} /></button>
                    </div>
                    <p className={`text-[10px] text-slate-400 mt-1 ${tablet ? 'text-sm mt-1.5' : ''}`}>{sQty} {unit}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between bg-white rounded-xl border border-slate-200 px-3 py-2">
                    <span className="text-[11px] font-bold text-slate-500">الكمية الإجمالية</span>
                    <span className="font-extrabold font-mono text-emerald-700 text-sm">
                      {countedStorage.toFixed(2)} {unit}
                      {pQty > 0 && <span className="text-slate-400 text-[10px] font-normal mr-1">(≈ {(countedStorage / factor).toFixed(2)} {pUnit})</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!mats.length && <p className="text-center text-sm text-slate-400 py-8">لا نتائج للبحث</p>}
      </div>

      {/* Bottom save bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:right-[60px] bg-white/95 backdrop-blur border-t border-slate-200 z-30">
        <div className={`mx-auto flex items-center gap-3 ${tablet ? 'max-w-5xl p-4' : 'max-w-3xl p-3'}`}>
          <div className={`flex-1 font-bold text-slate-500 ${tablet ? 'text-base' : 'text-xs'}`}>
            {countedCount > 0 ? (
              <>جاهز {editingId ? 'لتحديث' : 'لحفظ'} <strong className="text-slate-800">{countedCount}</strong> صنفاً لفرع <strong className="text-brand-600">{getBranchName(branchId)}</strong> — {fmtDateLong(countDate)}</>
            ) : 'عدّ الأصناف ثم اضغط حفظ'}
          </div>
          <button
            onClick={saveCount}
            disabled={!countedCount}
            className={`flex items-center gap-2 rounded-2xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-sm shadow-lg shadow-brand-600/25 transition-all active:scale-95 ${tablet ? 'px-10 py-5 text-xl rounded-3xl' : 'px-6 py-3.5'}`}
          >
            {countedCount > 0 ? <CheckCircle2 className={tablet ? 'w-7 h-7' : 'w-5 h-5'} /> : <Save className={tablet ? 'w-7 h-7' : 'w-5 h-5'} />}
            {editingId ? 'حفظ التعديل' : 'حفظ الجرد'}
          </button>
        </div>
      </div>

      {adminDeleteModal}
    </div>
  );
};

export default MobileCountView;
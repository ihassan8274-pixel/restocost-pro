import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bike, ClipboardList, Pencil, PlusCircle, Printer, Settings2, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../../context/AppContext';
import { Btn, Card, Field, PageHeader, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { openPrintWindow } from '../../utils/print';
import { downloadCSV, fmt, fmtMoney, fmtNum, monthLabel, netOfGross, navOnEnter } from '../../utils/helpers';
import { DeliverySale, DeliverySaleItem } from '../../types';

const COLORS = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
const pctFmt = (n: number) => `${n.toFixed(1)}%`;
const todayStr = () => new Date().toISOString().slice(0, 10);

type TabId = 'dashboard' | 'branches' | 'prices' | 'dishes' | 'records' | 'entry' | 'settings';

interface EntryRow { recipeId: string; quantitySold: string; unitPrice: string; }

const TABS = [
  { id: 'dashboard', label: 'لوحة المنصات' },
  { id: 'branches', label: 'تقارير الفروع' },
  { id: 'prices', label: 'أسعار التطبيقات' },
  { id: 'dishes', label: 'تحليل الأطباق والعمولة' },
  { id: 'records', label: 'سجل المبيعات المستوردة' },
  { id: 'entry', label: 'استيراد مبيعات من تطبيق توصيل' },
  { id: 'settings', label: 'إعدادات المنصات' },
];

const thCls = 'p-2 text-right font-bold text-slate-600 border-b border-slate-200 bg-slate-50 whitespace-nowrap';

const DeliveryIntegrationsView: React.FC = () => {
  const {
    recipes, branches, visibleBranchIds,
    deliveryApps, addDeliveryApp, updateDeliveryApp, deleteDeliveryApp,
    deliverySales, addDeliverySale, updateDeliverySale, deleteDeliverySale,
    calculateRecipeCosts, showToast,
  } = useApp();

  const myBranches = branches.filter((b) => visibleBranchIds.includes(b.id));

  const [tab, setTab] = useState<TabId>('dashboard');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platformSel, setPlatformSel] = useState('');
  const [customPlatform, setCustomPlatform] = useState('');
  const [branchSel, setBranchSel] = useState(myBranches[0]?.id ?? '');
  const [dateStr, setDateStr] = useState(todayStr());
  const [ordersCount, setOrdersCount] = useState('');
  const [commissionPct, setCommissionPct] = useState(String(deliveryApps.find((a) => a.isActive)?.commissionPercent ?? 25));
  const [rows, setRows] = useState<EntryRow[]>([{ recipeId: '', quantitySold: '', unitPrice: '' }]);
  const [recSearch, setRecSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [lastSaved, setLastSaved] = useState<DeliverySale | null>(null);
  const [priceAppSel, setPriceAppSel] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [newAppName, setNewAppName] = useState('');
  const [newAppPct, setNewAppPct] = useState('25');

  // سعر القائمة المعتمد للطبق على تطبيق معين: سعر التطبيق ثم سعر الصالة
  const appPriceFor = (appId: string, recipeId: string): number => {
    const app = deliveryApps.find((a) => a.id === appId);
    const fromApp = app?.prices?.[recipeId];
    if (fromApp && fromApp > 0) return fromApp;
    const rec = recipes.find((r) => r.id === recipeId);
    return rec?.actualMenuPrice ?? 0;
  };

  // الأصناف القابلة للبيع فقط: نشطة وليست تحضير مركزي ومسعّرة (سعر تطبيق أو سعر منيو)
  const saleableRecipes = recipes.filter((rc) => {
    if (rc.isCentralKitchenPrep || !rc.isActive) return false;
    const hasAppPrice = platformSel && platformSel !== 'custom' ? ((deliveryApps.find((a) => a.id === platformSel)?.prices?.[rc.id] || 0) > 0) : false;
    return hasAppPrice || (rc.actualMenuPrice ?? 0) > 0;
  });

  // تحميل الأصناف المسعّرة فقط تلقائياً بأسعار التطبيق عند تحديد المنصة والفرع والتاريخ
  React.useEffect(() => {
    if (editingId || !recipes.length || platformSel === 'custom') {
      if (!editingId && platformSel === 'custom') {
        setRows(recipes.filter((rc) => !rc.isCentralKitchenPrep && rc.isActive && (rc.actualMenuPrice ?? 0) > 0).map((rc) => ({ recipeId: rc.id, quantitySold: '', unitPrice: String(rc.actualMenuPrice) })));
      }
      return;
    }
    if (!platformSel) { setRows([{ recipeId: '', quantitySold: '', unitPrice: '' }]); return; }
    const app = deliveryApps.find((a) => a.id === platformSel);
    const priced = recipes.filter((rc) => !rc.isCentralKitchenPrep && rc.isActive && (((app?.prices?.[rc.id] || 0) > 0) || ((rc.actualMenuPrice ?? 0) > 0)));
    setRows(
      priced.map((rc) => ({
        recipeId: rc.id,
        quantitySold: '',
        unitPrice: appPriceFor(platformSel, rc.id) ? String(appPriceFor(platformSel, rc.id)) : '',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformSel, editingId, recipes.length]);

  const items: DeliverySaleItem[] = rows.flatMap((r) => {
    const rec = recipes.find((x) => x.id === r.recipeId);
    if (!rec || !(Number(r.quantitySold) > 0)) return [];
    const effPrice = Number(r.unitPrice) || rec.actualMenuPrice || 0;
    if (effPrice <= 0) return [];
    return [{
      recipeId: rec.id,
      recipeNameAr: rec.nameAr,
      category: String(rec.category),
      quantitySold: Number(r.quantitySold),
      unitPrice: effPrice,
      unitCost: calculateRecipeCosts(rec.ingredients, rec.directLaborCost, rec.packagingCost, rec.subPrepIngredients, rec.yieldPieces).totalCost,
    }];
  });

  const grossRevenue = items.reduce((s, i) => s + i.quantitySold * i.unitPrice, 0);
  const netBeforeVat = netOfGross(grossRevenue);
  const vatAmount = grossRevenue - netBeforeVat;
  const pctNum = Number(commissionPct) || 0;
  const commissionAmt = (netBeforeVat * pctNum) / 100;
  const payoutAmt = netBeforeVat - commissionAmt;

  // فلترة السجلات بالفترة الزمنية والبحث — قبل أي حسابات تعتمد عليها
  const filteredRecords = deliverySales
    .filter((s) => (!fromDate || s.date >= fromDate) && (!toDate || s.date <= toDate))
    .filter((s) => !recSearch || s.platformName.includes(recSearch) || s.branchName.includes(recSearch) || s.date.includes(recSearch))
    .sort((a, b) => b.date.localeCompare(a.date));

  const periodLabel = fromDate || toDate ? `من ${fromDate || 'البداية'} إلى ${toDate || 'اليوم'}` : 'عن كامل الفترة';

  const platformRows = useMemo(() => {
    const m = new Map<string, { name: string; gross: number; vat: number; net: number; comm: number; payout: number; orders: number; records: number }>();
    filteredRecords.forEach((s) => {
      const cur = m.get(s.platformName) ?? { name: s.platformName, gross: 0, vat: 0, net: 0, comm: 0, payout: 0, orders: 0, records: 0 };
      cur.gross += s.grossRevenue; cur.vat += s.vatAmount; cur.net += s.netRevenue;
      cur.comm += s.commissionAmount; cur.payout += s.payoutAmount;
      cur.orders += s.ordersCount; cur.records += 1;
      m.set(s.platformName, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filteredRecords]);

  const chartData = useMemo(() => {
    const months = Array.from(new Set(filteredRecords.map((s) => s.date.slice(0, 7)))).sort();
    return months.map((mo) => {
      const row: Record<string, string | number> = { name: monthLabel(mo) };
      platformRows.forEach((p) => { row[p.name] = 0; });
      filteredRecords.filter((s) => s.date.slice(0, 7) === mo).forEach((s) => { row[s.platformName] = ((row[s.platformName] as number) || 0) + s.payoutAmount; });
      return row;
    });
  }, [filteredRecords, platformRows]);

  const dishRows = useMemo(() => {
    const m = new Map<string, { id: string; name: string; category: string; qty: number; gross: number; cost: number; comm: number; payout: number }>();
    filteredRecords.forEach((s) => {
      const factor = s.grossRevenue > 0 ? s.netRevenue / s.grossRevenue : 1;
      s.items.forEach((it) => {
        // مفتاح تجميع آمن: المعرّف إن وجد، وإلا الاسم نفسه — حتى لا تندمج
        // الأصناف غير المرتبطة بوصفة (مثل sub_prep أو المستوردة) في صف واحد
        const gkey = it.recipeId || `name:${(it.recipeNameAr || '').trim()}`;
        const displayName = it.recipeNameAr || recipes.find((r) => r.id === it.recipeId)?.nameAr || 'صنف بدون اسم';
        const cur = m.get(gkey) ?? { id: gkey, name: displayName, category: it.category, qty: 0, gross: 0, cost: 0, comm: 0, payout: 0 };
        if (!cur.name) cur.name = displayName;
        const lineGross = it.quantitySold * it.unitPrice;
        const lineNet = lineGross * factor;
        const lineComm = lineNet * (s.commissionPercent / 100);
        cur.qty += it.quantitySold;
        cur.gross += lineGross;
        cur.cost += it.quantitySold * it.unitCost;
        cur.comm += lineComm;
        cur.payout += lineNet - lineComm;
        m.set(gkey, cur);
      });
    });
    return Array.from(m.values())
      .map((a) => {
        const q = a.qty || 1;
        const avgPrice = a.gross / q;
        const unitCost = a.cost / q;
        const unitPayout = a.payout / q;
        const unitComm = a.comm / q;
        const dine = recipes.find((r) => r.id === a.id)?.actualMenuPrice ?? 0;
        return { ...a, avgPrice, unitCost, unitPayout, unitComm, marginAfter: unitPayout - unitCost, dinePrice: dine, priceGapPct: dine > 0 ? ((avgPrice - dine) / dine) * 100 : null as number | null };
      })
      .sort((x, y) => y.payout - x.payout);
  }, [filteredRecords, recipes]);

  // تفصيل التقرير: إجمالي كل فرع على مدار كامل الفترة (بدون تاريخ)
  const branchTotals = useMemo(() => {
    const m = new Map<string, { name: string; records: number; orders: number; gross: number; vat: number; net: number; comm: number; payout: number }>();
    filteredRecords.forEach((s) => {
      const k = s.branchId || s.branchName;
      let g = m.get(k);
      if (!g) { g = { name: s.branchName || s.branchId || '—', records: 0, orders: 0, gross: 0, vat: 0, net: 0, comm: 0, payout: 0 }; m.set(k, g); }
      g.records += 1;
      g.orders += s.ordersCount || 0;
      g.gross += s.grossRevenue; g.vat += s.vatAmount; g.net += s.netRevenue;
      g.comm += s.commissionAmount; g.payout += s.payoutAmount;
    });
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filteredRecords]);

  // مبيعات كل منصة مفصولة حسب الفرع مع إجمالي لكل منصة
  const platformBranchGroups = useMemo(() => {
    const m = new Map<string, Map<string, { orders: number; gross: number; vat: number; net: number; comm: number; payout: number }>>();
    filteredRecords.forEach((s) => {
      let pm = m.get(s.platformName);
      if (!pm) { pm = new Map(); m.set(s.platformName, pm); }
      const bk = s.branchName || s.branchId || '—';
      const cur = pm.get(bk) ?? { orders: 0, gross: 0, vat: 0, net: 0, comm: 0, payout: 0 };
      cur.orders += s.ordersCount || 0;
      cur.gross += s.grossRevenue; cur.vat += s.vatAmount; cur.net += s.netRevenue;
      cur.comm += s.commissionAmount; cur.payout += s.payoutAmount;
      pm.set(bk, cur);
    });
    // ترتيب المنصات حسب حجم المبيعات مثل الملخص
    const order = new Map(platformRows.map((p, i) => [p.name, i]));
    return Array.from(m.entries()).sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
  }, [filteredRecords, platformRows]);

  const tGross = filteredRecords.reduce((s, x) => s + x.grossRevenue, 0);
  const tNet = filteredRecords.reduce((s, x) => s + x.netRevenue, 0);
  const tComm = filteredRecords.reduce((s, x) => s + x.commissionAmount, 0);
  const tPayout = filteredRecords.reduce((s, x) => s + x.payoutAmount, 0);
  const tOrders = filteredRecords.reduce((s, x) => s + x.ordersCount, 0);
  const avgCommPct = tNet ? (tComm / tNet) * 100 : 0;

  const resetForm = () => {
    setEditingId(null);
    setPlatformSel('');
    setCustomPlatform('');
    setDateStr(todayStr());
    setOrdersCount('');
    setCommissionPct(String(deliveryApps.find((a) => a.isActive)?.commissionPercent ?? 25));
    setRows([{ recipeId: '', quantitySold: '', unitPrice: '' }]);
  };

  const saveEntry = () => {
    if (!items.length) { showToast('أضف صنفاً واحداً على الأقل بكمية أكبر من صفر'); return; }
    if (!platformSel) { showToast('اختر منصة التوصيل'); return; }
    if (platformSel === 'custom' && !customPlatform.trim()) { showToast('اكتب اسم المنصة الخارجية'); return; }
    if (!branchSel) { showToast('اختر الفرع'); return; }
    if (!dateStr) { showToast('حدد تاريخ المبيعات'); return; }
    const platformName = platformSel === 'custom' ? customPlatform.trim() : deliveryApps.find((a) => a.id === platformSel)?.name || platformSel;
    const branchName = branches.find((b) => b.id === branchSel)?.nameAr || '';
    const payload = {
      platformId: platformSel,
      platformName,
      branchId: branchSel,
      branchName,
      date: dateStr,
      ordersCount: Math.max(0, Math.round(Number(ordersCount) || 0)),
      items,
      grossRevenue,
      vatAmount,
      netRevenue: netBeforeVat,
      commissionPercent: pctNum,
      commissionAmount: commissionAmt,
      payoutAmount: payoutAmt,
      createdAt: new Date().toISOString(),
    };
    const rec: DeliverySale = { id: editingId || `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...payload };
    if (editingId) updateDeliverySale(rec.id, rec); else addDeliverySale(rec);
    setLastSaved(rec);
    showToast(editingId ? 'تم تحديث سجل المبيعات المستوردة' : `تم حفظ مبيعات ${platformName} — الصافي المستلم ${fmtMoney(payoutAmt)}`);
    resetForm();
    setTab('records');
  };

  const editRecord = (id: string) => {
    const s = deliverySales.find((x) => x.id === id);
    if (!s) return;
    const known = deliveryApps.some((a) => a.id === s.platformId);
    setEditingId(s.id);
    setPlatformSel(known ? s.platformId : 'custom');
    setCustomPlatform(known ? '' : s.platformName);
    setBranchSel(s.branchId);
    setDateStr(s.date);
    setOrdersCount(s.ordersCount ? String(s.ordersCount) : '');
    setCommissionPct(String(s.commissionPercent));
    setRows(s.items.length ? s.items.map((it) => ({ recipeId: it.recipeId, quantitySold: String(it.quantitySold), unitPrice: String(it.unitPrice) })) : [{ recipeId: '', quantitySold: '', unitPrice: '' }]);
    setTab('entry');
  };

  const deleteRecord = (id: string) => {
    if (!window.confirm('حذف سجل المبيعات المستورد؟')) return;
    deleteDeliverySale(id);
    showToast('تم حذف السجل');
  };

  const printSaleRecord = (s: DeliverySale) => {
    const factor = s.grossRevenue > 0 ? s.netRevenue / s.grossRevenue : 1;
    openPrintWindow({
      title: 'سجل مبيعات توصيل مستورد',
      subtitle: `${s.platformName} — ${s.branchName} — ${s.date}`,
      meta: [
        ['عدد الطلبات', fmtNum(s.ordersCount, 0)],
        ['نسبة العمولة', pctFmt(s.commissionPercent)],
        ['الإجمالي شامل الضريبة', fmtMoney(s.grossRevenue)],
        ['المستلم للفرع', fmtMoney(s.payoutAmount)],
      ],
      tables: [{
        title: 'الأصناف المباعة عبر المنصة',
        header: ['الصنف', 'الكمية', 'سعر الوحدة', 'الإجمالي (شامل الضريبة)', 'الصافي بعد الضريبة'],
        rows: s.items.map((it) => {
          const g = it.quantitySold * it.unitPrice;
          return [it.recipeNameAr, it.quantitySold, it.unitPrice, Number(g.toFixed(2)), Number((g * factor).toFixed(2))];
        }),
      }],
      totals: [
        ['الإجمالي شامل الضريبة', fmtMoney(s.grossRevenue)],
        ['ضريبة القيمة المضافة', fmtMoney(s.vatAmount)],
        ['الصافي قبل العمولة', fmtMoney(s.netRevenue)],
        [`عمولة ${s.platformName} (${pctFmt(s.commissionPercent)})`, `- ${fmtMoney(s.commissionAmount)}`],
        ['المستلم للفرع', fmtMoney(s.payoutAmount)],
      ],
      charts: [],
      footer: `سجل مبيعات ${s.platformName} — ${s.date} — RestoCost ERP Pro`,
    });
  };

  const updRow = (i: number, patch: Partial<EntryRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // ===== أسعار التطبيقات =====
  React.useEffect(() => {
    const app = deliveryApps.find((a) => a.id === priceAppSel);
    setPriceDrafts(
      app
        ? Object.fromEntries(recipes.map((rc) => [rc.id, String(app.prices?.[rc.id] ?? '')]))
        : {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceAppSel]);

  const setPrice = (rid: string, v: string) => setPriceDrafts((p) => ({ ...p, [rid]: v }));

  const commitPrice = (rid: string) => {
    const app = deliveryApps.find((a) => a.id === priceAppSel);
    if (!app) return;
    const val = Number(priceDrafts[rid]) || 0;
    if ((app.prices?.[rid] ?? 0) === val) return;
    updateDeliveryApp(app.id, { prices: { ...(app.prices || {}), [rid]: val } });
  };

  const fillEmptyWithDine = () => {
    const app = deliveryApps.find((a) => a.id === priceAppSel);
    if (!app) return;
    const next = { ...(app.prices || {}) };
    let n = 0;
    recipes.forEach((rc) => {
      const cur = Number(priceDrafts[rc.id]) || next[rc.id] || 0;
      if (!cur && (rc.actualMenuPrice ?? 0) > 0) { next[rc.id] = rc.actualMenuPrice; n++; }
    });
    if (!n) { showToast('لا توجد فراغات — كل الأصناف لها سعر'); return; }
    updateDeliveryApp(app.id, { prices: next });
    setPriceDrafts((p) => ({ ...p, ...Object.fromEntries(recipes.map((rc) => [rc.id, String(next[rc.id] ?? p[rc.id] ?? '')])) }));
    showToast(`تم نسخ سعر الصالة إلى ${n} صنفاً`);
  };

  // حفظ تعديل السعر من شاشة الإدخال مباشرة في قائمة التطبيق
  const commitEntryPrice = (recipeId: string, rawVal: string) => {
    if (!platformSel || platformSel === 'custom' || !recipeId) return;
    const app = deliveryApps.find((a) => a.id === platformSel);
    if (!app) return;
    const val = Number(rawVal) || 0;
    if (val <= 0 || val === (app.prices?.[recipeId] ?? 0)) return;
    updateDeliveryApp(app.id, { prices: { ...(app.prices || {}), [recipeId]: val } });
  };

  const printPlatforms = () => {
    openPrintWindow({
      title: 'تقرير مبيعات تطبيقات التوصيل',
      subtitle: `${platformRows.length} منصة — ${periodLabel}`,
      meta: [
        ['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')],
        ['الفترة', periodLabel],
        ['المبيعات شامل الضريبة', fmtMoney(tGross)],
        ['إجمالي العمولات', `${fmtMoney(tComm)} (${pctFmt(avgCommPct)})`],
        ['الصافي المستلم', fmtMoney(tPayout)],
      ],
      tables: [
        {
          title: 'ملخص المنصات',
          header: ['المنصة', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'العمولة', 'متوسط %', 'المستلم'],
          rows: platformRows.map((p) => [
            p.name, fmtNum(p.orders, 0), fmt(p.gross), fmt(p.vat), fmt(p.net), fmt(p.comm),
            pctFmt(p.net ? (p.comm / p.net) * 100 : 0), fmt(p.payout),
          ]),
        },
        {
          title: `إجمالي الفروع — ${periodLabel}`,
          header: ['الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'عمولة %', 'قيمة العمولة', 'المستلم'],
          rows: branchTotals.map((g) => [
            g.name, fmtNum(g.orders, 0), fmt(g.gross), fmt(g.vat), fmt(g.net),
            pctFmt(g.net ? (g.comm / g.net) * 100 : 0), fmt(g.comm), fmt(g.payout),
          ]),
        },
        // كل منصة في جدول مستقل مع إجماليها الخاص
        ...platformBranchGroups.map(([platform, pm]) => {
          const entries = Array.from(pm.entries());
          const t = entries.reduce(
            (a, [, v]) => ({ orders: a.orders + v.orders, gross: a.gross + v.gross, vat: a.vat + v.vat, net: a.net + v.net, comm: a.comm + v.comm, payout: a.payout + v.payout }),
            { orders: 0, gross: 0, vat: 0, net: 0, comm: 0, payout: 0 },
          );
          return {
            title: `مبيعات منصة ${platform} حسب الفرع`,
            header: ['الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'قيمة العمولة', 'المستلم'],
            rows: [
              ...entries.map(([bk, v]) => [bk, fmtNum(v.orders, 0), fmt(v.gross), fmt(v.vat), fmt(v.net), fmt(v.comm), fmt(v.payout)]),
              [`إجمالي ${platform}`, fmtNum(t.orders, 0), fmt(t.gross), fmt(t.vat), fmt(t.net), fmt(t.comm), fmt(t.payout)],
            ] as (string | number)[][],
          };
        }),
      ].map((t) => ({ ...t, dense: true })),
      footer: 'تقرير مبيعات تطبيقات التوصيل والعمولات — RestoCost ERP',
    });
  };

  const printDishes = () => {
    openPrintWindow({
      title: 'تحليل عمولة المنصات لكل طبق',
      subtitle: `${dishRows.length} طبق عبر ${deliverySales.length} سجل مستورد`,
      meta: [['تاريخ الطباعة', new Date().toLocaleDateString('ar-SA-u-nu-latn')], ['متوسط عمولة المنصات', pctFmt(avgCommPct)]],
      tables: [{
        title: 'الأطباق مرتبة حسب المساهمة الصافية بعد العمولة',
        header: ['الطبق', 'الفئة', 'الكمية', 'سعر المنصة', 'سعر الصالة', 'فرق السعر', 'تكلفة الوحدة', 'عمولة المنصة/وحدة', 'صافي الوحدة بعد العمولة', 'هامش الوحدة', 'المساهمة'],
        rows: dishRows.map((d) => [
          d.name, d.category, fmtNum(d.qty, 0), fmt(d.avgPrice), d.dinePrice > 0 ? fmt(d.dinePrice) : '—',
          d.priceGapPct != null ? pctFmt(d.priceGapPct) : '—', fmt(d.unitCost), fmt(d.unitComm), fmt(d.unitPayout), fmt(d.marginAfter), fmt(d.payout),
        ]),
        dense: true,
      }],
      footer: 'تحليل عمولة التطبيقات لكل طبق — RestoCost ERP',
    });
  };

  const exportDishesCSV = () => {
    downloadCSV(
      'تحليل_اعماد_التطبيقات_لكل_طبق.csv',
      ['الطبق', 'الفئة', 'الكمية', 'متوسط سعر المنصة', 'سعر الصالة', 'تكلفة الوحدة', 'عمولة المنصة/وحدة', 'صافي الوحدة بعد العمولة', 'هامش الوحدة', 'المساهمة الكلية'],
      dishRows.map((d) => [d.name, d.category, Math.round(d.qty), Number(d.avgPrice.toFixed(2)), Number(d.dinePrice.toFixed(2)), Number(d.unitCost.toFixed(2)), Number(d.unitComm.toFixed(2)), Number(d.unitPayout.toFixed(2)), Number(d.marginAfter.toFixed(2)), Number(d.payout.toFixed(2))]),
    );
  };

  const excelSheets = [
    {
      name: 'ملخص المنصات',
      header: ['المنصة', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي', 'العمولة', 'متوسط %', 'المستلم'],
      rows: platformRows.map((p) => [p.name, p.orders, Number(p.gross.toFixed(2)), Number(p.vat.toFixed(2)), Number(p.net.toFixed(2)), Number(p.comm.toFixed(2)), Number((p.net ? (p.comm / p.net) * 100 : 0).toFixed(1)), Number(p.payout.toFixed(2))]),
    },
    {
      name: 'تحليل الأطباق',
      header: ['الطبق', 'الفئة', 'الكمية', 'متوسط سعر المنصة', 'سعر الصالة', 'تكلفة الوحدة', 'عمولة المنصة/وحدة', 'صافي الوحدة بعد العمولة', 'الهامش بعد العمولة', 'المساهمة الكلية'],
      rows: dishRows.map((d) => [d.name, d.category, Math.round(d.qty), Number(d.avgPrice.toFixed(2)), Number(d.dinePrice.toFixed(2)), Number(d.unitCost.toFixed(2)), Number(d.unitComm.toFixed(2)), Number(d.unitPayout.toFixed(2)), Number(d.marginAfter.toFixed(2)), Number(d.payout.toFixed(2))]),
    },
    {
      name: 'سجل المبيعات',
      header: ['التاريخ', 'المنصة', 'الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي', 'العمولة %', 'قيمة العمولة', 'المستلم'],
      rows: filteredRecords.map((s) => [s.date, s.platformName, s.branchName, s.ordersCount, Number(s.grossRevenue.toFixed(2)), Number(s.vatAmount.toFixed(2)), Number(s.netRevenue.toFixed(2)), s.commissionPercent, Number(s.commissionAmount.toFixed(2)), Number(s.payoutAmount.toFixed(2))]),
    },
  ];

  const addNewApp = () => {
    const name = newAppName.trim();
    if (!name) { showToast('اكتب اسم المنصة'); return; }
    addDeliveryApp({ name, commissionPercent: Number(newAppPct) || 0, isActive: true });
    showToast(`تمت إضافة منصة ${name}`);
    setNewAppName('');
    setNewAppPct('25');
  };

  const kpis = [
    { label: 'المبيعات شامل الضريبة', value: fmtMoney(tGross), cls: 'text-slate-900' },
    { label: 'الصافي قبل العمولة', value: fmtMoney(tNet), cls: 'text-brand-700' },
    { label: `عمولات المنصات (${pctFmt(avgCommPct)})`, value: fmtMoney(tComm), cls: 'text-rose-600' },
    { label: 'الصافي المستلم', value: fmtMoney(tPayout), cls: 'text-emerald-700' },
    { label: 'عدد الطلبات', value: fmtNum(tOrders, 0), cls: 'text-slate-900' },
  ];

  const noData = !deliverySales.length;

  const printBranchReports = () => {
    openPrintWindow({
      title: 'تقرير مبيعات التوصيل حسب الفرع',
      subtitle: periodLabel,
      meta: [
        ['عدد السجلات', `${filteredRecords.length}`],
        ['إجمالي شامل الضريبة', fmtMoney(tGross)],
        ['الصافي قبل العمولة', fmtMoney(tNet)],
        ['المستلم للفروع', fmtMoney(tPayout)],
      ],
      tables: [
        {
          title: `إجمالي الفروع ${periodLabel}`,
          header: ['الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'عمولة %', 'قيمة العمولة', 'المستلم'],
          rows: branchTotals.map((g) => [g.name, g.orders, g.gross, g.vat, g.net, g.net ? Number(((g.comm / g.net) * 100).toFixed(2)) : 0, g.comm, g.payout]),
        },
        ...platformBranchGroups.map(([platform, pm]) => {
          const rowsArr = Array.from(pm.entries());
          const tot = rowsArr.reduce((a, [, v]) => ({ orders: a.orders + v.orders, gross: a.gross + v.gross, vat: a.vat + v.vat, net: a.net + v.net, comm: a.comm + v.comm, payout: a.payout + v.payout }), { orders: 0, gross: 0, vat: 0, net: 0, comm: 0, payout: 0 });
          return {
            title: `مبيعات منصة ${platform} حسب الفرع`,
            header: ['الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'قيمة العمولة', 'المستلم'],
            rows: [
              ...rowsArr.map(([bk, v]) => [bk, v.orders, v.gross, v.vat, v.net, v.comm, v.payout]),
              ['الإجمالي', tot.orders, tot.gross, tot.vat, tot.net, tot.comm, tot.payout],
            ],
          };
        }),
      ],
      charts: [],
      footer: `تقرير مبيعات التوصيل — ${periodLabel} — RestoCost ERP Pro`,
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={<Bike className="w-8 h-8 text-emerald-600" />} title="تكامل تطبيقات التوصيل" subtitle="استيراد مبيعات جاهز وهنقرستيشن وكيك وتحليل عمولة كل طبق" />

      <TabBar tabs={TABS} active={tab} onChange={(t) => setTab(t as TabId)} />

      {noData && tab !== 'entry' && tab !== 'prices' && tab !== 'settings' && (
        <Card className="border-dashed bg-slate-50 p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-500 mb-3">لا توجد مبيعات مستوردة من تطبيقات التوصيل بعد</p>
          <Btn onClick={() => setTab('entry')}>ابدأ الاستيراد</Btn>
        </Card>
      )}

      {tab === 'branches' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
            <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
            {(fromDate || toDate) && <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح الفترة</Btn>}
            <div className="grow" />
            <Btn tone="dark" onClick={printBranchReports}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
          </Card>

          <Card className="overflow-x-auto">
            <div className="p-4 pb-2 flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-extrabold text-slate-800 text-sm">إجمالي الفروع — {periodLabel}</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr>{['الفرع', 'السجلات', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'عمولة %', 'قيمة العمولة', 'المستلم'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {branchTotals.map((g) => (
                  <tr key={g.name} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="p-2 font-bold text-slate-800">{g.name}</td>
                    <td className="tnum text-left p-2">{fmtNum(g.records, 0)}</td>
                    <td className="tnum text-left p-2">{fmtNum(g.orders, 0)}</td>
                    <td className="tnum text-left p-2">{fmt(g.gross)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(g.vat)}</td>
                    <td className="tnum text-left p-2 text-brand-700">{fmt(g.net)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{g.net ? pctFmt((g.comm / g.net) * 100) : '—'}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmt(g.comm)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(g.payout)}</td>
                  </tr>
                ))}
                {branchTotals.length > 1 && (
                  <tr className="bg-slate-100 font-extrabold">
                    <td className="p-2">الإجمالي العام</td>
                    <td className="tnum text-left p-2">{fmtNum(filteredRecords.length, 0)}</td>
                    <td className="tnum text-left p-2">{fmtNum(tOrders, 0)}</td>
                    <td className="tnum text-left p-2">{fmt(tGross)}</td>
                    <td className="tnum text-left p-2">{fmt(tGross - tNet)}</td>
                    <td className="tnum text-left p-2 text-brand-700">{fmt(tNet)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{pctFmt(avgCommPct)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmt(tComm)}</td>
                    <td className="tnum text-left p-2 text-emerald-700">{fmt(tPayout)}</td>
                  </tr>
                )}
                {!branchTotals.length && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا توجد سجلات في هذه الفترة</td></tr>}
              </tbody>
            </table>
          </Card>

          {platformBranchGroups.map(([platform, pm]) => {
            const rowsArr = Array.from(pm.entries());
            const tot = rowsArr.reduce((a, [, v]) => ({ orders: a.orders + v.orders, gross: a.gross + v.gross, vat: a.vat + v.vat, net: a.net + v.net, comm: a.comm + v.comm, payout: a.payout + v.payout }), { orders: 0, gross: 0, vat: 0, net: 0, comm: 0, payout: 0 });
            return (
              <Card key={platform} className="overflow-x-auto">
                <div className="p-4 pb-2 font-extrabold text-slate-800 text-sm">مبيعات منصة {platform} حسب الفرع — {periodLabel}</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr>{['الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي قبل العمولة', 'قيمة العمولة', 'المستلم'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rowsArr.map(([bk, v]) => (
                      <tr key={bk} className="hover:bg-slate-50 border-b border-slate-100">
                        <td className="p-2 font-bold text-slate-800">{bk}</td>
                        <td className="tnum text-left p-2">{fmtNum(v.orders, 0)}</td>
                        <td className="tnum text-left p-2">{fmt(v.gross)}</td>
                        <td className="tnum text-left p-2 text-slate-500">{fmt(v.vat)}</td>
                        <td className="tnum text-left p-2 text-brand-700">{fmt(v.net)}</td>
                        <td className="tnum text-left p-2 text-rose-600">{fmt(v.comm)}</td>
                        <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(v.payout)}</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50 font-extrabold">
                      <td className="p-2">إجمالي {platform}</td>
                      <td className="tnum text-left p-2">{fmtNum(tot.orders, 0)}</td>
                      <td className="tnum text-left p-2">{fmt(tot.gross)}</td>
                      <td className="tnum text-left p-2">{fmt(tot.vat)}</td>
                      <td className="tnum text-left p-2 text-brand-700">{fmt(tot.net)}</td>
                      <td className="tnum text-left p-2 text-rose-600">{fmt(tot.comm)}</td>
                      <td className="tnum text-left p-2 text-emerald-700">{fmt(tot.payout)}</td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            );
          })}
        </>
      )}

      {tab === 'dashboard' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <Field label="من تاريخ">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="إلى تاريخ">
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </Field>
            {(fromDate || toDate) && (
              <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}><X className="w-4 h-4" /> مسح الفترة</Btn>
            )}
            <div className="grow" />
            <p className="text-[11px] text-slate-500 font-bold">الفترة المطبقة: {periodLabel}</p>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
                <span className="text-[11px] text-slate-500 block">{k.label}</span>
                <strong className={`font-mono text-sm block mt-1 ${k.cls}`}>{k.value}</strong>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-4">
              <h3 className="font-extrabold text-slate-800 text-sm mb-3">الصافي المستلم شهرياً حسب المنصة</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {platformRows.map((p, i) => (
                    <Bar key={p.name} dataKey={p.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-4">
              <h3 className="font-extrabold text-slate-800 text-sm mb-3">توزيع الصافي المستلم</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={platformRows.map((p) => ({ name: p.name, value: Number(p.payout.toFixed(2)) }))} dataKey="value" nameKey="name" outerRadius={90}>
                    {platformRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="overflow-x-auto">
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="font-extrabold text-slate-800 text-sm">ملخص المنصات</h3>
              <Btn tone="dark" onClick={printPlatforms}><Printer className="w-4 h-4" /> طباعة التقرير</Btn>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr>{['المنصة', 'السجلات', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي', 'العمولة', 'متوسط %', 'المستلم'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {platformRows.map((p) => (
                  <tr key={p.name} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="p-2 font-bold text-slate-800">{p.name}</td>
                    <td className="tnum text-left p-2">{fmtNum(p.records, 0)}</td>
                    <td className="tnum text-left p-2">{fmtNum(p.orders, 0)}</td>
                    <td className="tnum text-left p-2">{fmt(p.gross)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(p.vat)}</td>
                    <td className="tnum text-left p-2">{fmt(p.net)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmt(p.comm)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{pctFmt(p.net ? (p.comm / p.net) * 100 : 0)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(p.payout)}</td>
                  </tr>
                ))}
                {!platformRows.length && <tr><td colSpan={9} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'prices' && (
        <>
          <Card className="p-4 flex flex-wrap items-end gap-3">
            <Field label="التطبيق" required>
              <select value={priceAppSel} onChange={(e) => setPriceAppSel(e.target.value)} className={inputCls}>
                <option value="">— اختر التطبيق —</option>
                {deliveryApps.map((a) => <option key={a.id} value={a.id}>{a.name}{a.isActive ? '' : ' (موقوف)'}</option>)}
                {!deliveryApps.length && <option value="">أضف تطبيقات من إعدادات المنصات أولاً</option>}
              </select>
            </Field>
            <Btn tone="ghost" onClick={fillEmptyWithDine}><PlusCircle className="w-4 h-4" /> نسخ أسعار الصالة للفراغات</Btn>
            <div className="grow" />
            <p className="text-[11px] text-slate-500 font-bold">الأسعار هنا تُملأ تلقائياً في شاشة الاستيراد، وتعديل السعر هناك يُحدّثها هنا</p>
          </Card>

          {priceAppSel ? (
            <Card className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>{['الطبق', 'الفئة', 'سعر الصالة', `السعر على ${deliveryApps.find((a) => a.id === priceAppSel)?.name || ''}`].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {recipes.map((rc) => (
                    <tr key={rc.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="p-2 font-bold text-slate-800">{rc.nameAr}</td>
                      <td className="p-2 text-slate-500">{String(rc.category)}</td>
                      <td className="tnum text-left p-2 text-slate-500">{rc.actualMenuPrice ? fmt(rc.actualMenuPrice) : '—'}</td>
                      <td className="p-2 w-44">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={priceDrafts[rc.id] ?? ''}
                          onChange={(e) => setPrice(rc.id, e.target.value)}
                          onBlur={() => commitPrice(rc.id)}
                          placeholder={rc.actualMenuPrice ? String(rc.actualMenuPrice) : 'أدخل السعر'}
                          className={`${inputCls} font-mono`}
                        />
                      </td>
                    </tr>
                  ))}
                  {!recipes.length && <tr><td colSpan={4} className="p-4 text-center text-slate-400">لا توجد أصناف</td></tr>}
                </tbody>
              </table>
            </Card>
          ) : (
            <Card className="border-dashed bg-slate-50 p-6 text-center">
              <p className="text-sm font-bold text-slate-500">اختر تطبيقاً لعرض وتعديل قائمة أسعاره — هذه الأسعار تُستخدم تلقائياً عند استيراد مبيعات يوم كامل</p>
            </Card>
          )}
        </>
      )}

      {tab === 'dishes' && (
        <Card className="overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-emerald-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">تحليل العمولة لكل طبق (مجمّع عبر المنصات)</h3>
            </div>
            <div className="flex gap-2">
              <Btn tone="ghost" onClick={exportDishesCSV}>تصدير CSV</Btn>
              <Btn tone="dark" onClick={printDishes}><Printer className="w-4 h-4" /> طباعة التحليل</Btn>
            </div>
          </div>

          {dishRows.length > 0 && (
            <div className="px-4 pb-3">
              <ResponsiveContainer width="100%" height={Math.max(240, dishRows.slice(0, 10).length * 34)}>
                <BarChart data={dishRows.slice(0, 10).map((d) => ({ name: d.name, value: Number(d.payout.toFixed(2)) }))} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                  <Bar dataKey="value" name="المساهمة الصافية بعد العمولة" radius={[0, 4, 4, 0]}>
                    {dishRows.slice(0, 10).map((d, i) => <Cell key={i} fill={d.marginAfter >= 0 ? '#059669' : '#dc2626'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <table className="w-full text-xs">
            <thead>
              <tr>{['الطبق', 'الفئة', 'الكمية', 'متوسط سعر المنصة', 'سعر الصالة', 'فرق السعر', 'تكلفة الوحدة', 'صافي الوحدة بعد العمولة', 'هامش الوحدة', 'المساهمة الكلية'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {dishRows.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 border-b border-slate-100">
                  <td className="p-2 font-bold text-slate-800 whitespace-nowrap">
                    {d.name}
                    {d.marginAfter < 0 && (
                      <span className="inline-flex items-center gap-1 mr-2 text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full align-middle">
                        <AlertTriangle className="w-3 h-3" /> خاسر على المنصة
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-slate-500 whitespace-nowrap">{d.category}</td>
                  <td className="tnum text-left p-2">{fmtNum(d.qty, 0)}</td>
                  <td className="tnum text-left p-2">{fmt(d.avgPrice)}</td>
                  <td className="tnum text-left p-2 text-slate-500">{d.dinePrice > 0 ? fmt(d.dinePrice) : '—'}</td>
                  <td className={`p-2 font-mono font-bold ${(d.priceGapPct ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{d.priceGapPct != null ? pctFmt(d.priceGapPct) : '—'}</td>
                  <td className="tnum text-left p-2">{fmt(d.unitCost)}</td>
                  <td className="tnum text-left p-2">{fmt(d.unitPayout)}</td>
                  <td className={`p-2 font-mono font-bold ${d.marginAfter >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmt(d.marginAfter)}</td>
                  <td className="tnum text-left p-2 font-bold text-slate-900">{fmt(d.payout)}</td>
                </tr>
              ))}
              {!dishRows.length && <tr><td colSpan={10} className="p-4 text-center text-slate-400">لا توجد بيانات</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'records' && (
        <>
          <Card className="p-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-brand-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">سجل المبيعات المستوردة ({filteredRecords.length})</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} max-w-[150px]`} title="من تاريخ" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} max-w-[150px]`} title="إلى تاريخ" />
              {(fromDate || toDate) && (
                <button onClick={() => { setFromDate(''); setToDate(''); }} className="text-[11px] font-bold text-slate-500 hover:text-slate-700 underline">مسح الفترة</button>
              )}
              <div className="flex flex-wrap items-end gap-2">
              <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
              <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
              <Field label="بحث">
                <input value={recSearch} onChange={(e) => setRecSearch(e.target.value)} placeholder="منصة أو فرع أو تاريخ..." className={`${inputCls} max-w-xs`} />
              </Field>
              {(fromDate || toDate) && <Btn tone="ghost" onClick={() => { setFromDate(''); setToDate(''); }}>مسح الفترة</Btn>}
            </div>
            </div>
          </Card>
          <ViewToolbar filename="مبيعات_تطبيقات_التوصيل" sheets={excelSheets} />
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>{['التاريخ', 'المنصة', 'الفرع', 'الطلبات', 'شامل الضريبة', 'الضريبة', 'الصافي', 'العمولة %', 'قيمة العمولة', 'المستلم', 'إجراءات'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredRecords.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="tnum text-left p-2 whitespace-nowrap">{s.date}</td>
                    <td className="p-2 font-bold text-slate-800 whitespace-nowrap">{s.platformName}</td>
                    <td className="p-2 whitespace-nowrap">{s.branchName}</td>
                    <td className="tnum text-left p-2">{fmtNum(s.ordersCount, 0)}</td>
                    <td className="tnum text-left p-2">{fmt(s.grossRevenue)}</td>
                    <td className="tnum text-left p-2 text-slate-500">{fmt(s.vatAmount)}</td>
                    <td className="tnum text-left p-2">{fmt(s.netRevenue)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{pctFmt(s.commissionPercent)}</td>
                    <td className="tnum text-left p-2 text-rose-600">{fmt(s.commissionAmount)}</td>
                    <td className="tnum text-left p-2 font-bold text-emerald-700">{fmt(s.payoutAmount)}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button onClick={() => printSaleRecord(s)} className="p-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600" title="طباعة السجل"><Printer className="w-3.5 h-3.5" /></button>
                        <button onClick={() => editRecord(s.id)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="تعديل"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteRecord(s.id)} className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRecords.length && <tr><td colSpan={11} className="p-4 text-center text-slate-400">لا توجد سجلات</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'entry' && (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-slate-800 text-sm">{editingId ? 'تعديل سجل مبيعات مستوردة' : 'استيراد مبيعات يوم كامل من تطبيق توصيل'}</h3>
              </div>
              <div className="flex gap-2">
                {editingId && deliverySales.some((x) => x.id === editingId) && (
                  <Btn tone="ghost" onClick={() => { const s = deliverySales.find((x) => x.id === editingId); if (s) printSaleRecord(s); }}><Printer className="w-4 h-4" /> طباعة السجل</Btn>
                )}
                {lastSaved && !editingId && (
                  <Btn tone="ghost" onClick={() => printSaleRecord(lastSaved)}><Printer className="w-4 h-4" /> طباعة آخر سجل ({lastSaved.platformName})</Btn>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Field label="المنصة" required>
                <select
                  value={platformSel}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPlatformSel(v);
                    const app = deliveryApps.find((a) => a.id === v);
                    if (app) setCommissionPct(String(app.commissionPercent));
                  }}
                  className={inputCls}
                >
                  <option value="">— اختر —</option>
                  {deliveryApps.filter((a) => a.isActive).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="custom">منصة أخرى…</option>
                </select>
              </Field>
              {platformSel === 'custom' && (
                <Field label="اسم المنصة" required>
                  <input value={customPlatform} onChange={(e) => setCustomPlatform(e.target.value)} className={inputCls} placeholder="مثال: كيك (Keek)" />
                </Field>
              )}
              <Field label="الفرع" required>
                <select value={branchSel} onChange={(e) => setBranchSel(e.target.value)} className={inputCls}>
                  {myBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                </select>
              </Field>
              <Field label="التاريخ" required>
                <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className={inputCls} />
              </Field>
              <Field label="عدد الطلبات" hint="اختياري">
                <input type="number" min={0} value={ordersCount} onChange={(e) => setOrdersCount(e.target.value)} className={inputCls} placeholder="مثال: 42" />
              </Field>
              <Field label="عمولة المنصة %" required>
                <input type="number" min={0} max={100} step={0.5} value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-700 text-xs">الأصناف المباعة عبر المنصة</h4>
                <Btn tone="ghost" onClick={() => setRows([...rows, { recipeId: '', quantitySold: '', unitPrice: '' }])}><PlusCircle className="w-4 h-4" /> إضافة صنف</Btn>
              </div>
              {saleableRecipes.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-[11px] font-bold">
                  لا توجد أصناف مسعّرة لهذه المنصة بعد — أسعّر أصنافك من تبويب «قوائم أسعار التطبيقات» أعلى الشاشة، وستظهر هنا تلقائياً (تُستثنى الأصناف الخدمية وغير المسعّرة).
                </div>
              )}
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={r.recipeId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const price = v && platformSel ? appPriceFor(platformSel, v) : 0;
                      updRow(i, { recipeId: v, unitPrice: price ? String(price) : r.unitPrice });
                    }}
                    className={`${inputCls} col-span-6`}
                  >
                    <option value="">— اختر الطبق —</option>
                    {saleableRecipes.map((rc) => <option key={rc.id} value={rc.id}>{rc.nameAr} — {fmt(appPriceFor(platformSel, rc.id) || rc.actualMenuPrice)}</option>)}
                  </select>
                  <input type="number" min={0} data-nav value={r.quantitySold} onChange={(e) => updRow(i, { quantitySold: e.target.value })} onKeyDown={navOnEnter} placeholder="الكمية" className={`${inputCls} col-span-2`} />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    data-nav
                    value={r.unitPrice}
                    onChange={(e) => updRow(i, { unitPrice: e.target.value })}
                    onBlur={() => commitEntryPrice(r.recipeId, r.unitPrice)}
                    onKeyDown={navOnEnter}
                    placeholder="سعر القائمة على المنصة"
                    title="تعديل السعر هنا يُحدّث قائمة أسعار التطبيق تلقائياً"
                    className={`${inputCls} col-span-3`}
                  />
                  <button onClick={() => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : [{ recipeId: '', quantitySold: '', unitPrice: '' }])} className="col-span-1 mx-auto p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500" title="إزالة"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 border-t border-slate-200 pt-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 block">المبيعات شامل الضريبة</span>
                <strong className="font-mono text-sm block mt-0.5 text-slate-800">{fmtMoney(grossRevenue)}</strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 block">ضريبة القيمة المضافة</span>
                <strong className="font-mono text-sm block mt-0.5 text-slate-800">{fmtMoney(vatAmount)}</strong>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 block">الصافي قبل العمولة</span>
                <strong className="font-mono text-sm block mt-0.5 text-slate-800">{fmtMoney(netBeforeVat)}</strong>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 block">عمولة المنصة ({pctFmt(pctNum)})</span>
                <strong className="font-mono text-sm block mt-0.5 text-rose-700">{fmtMoney(commissionAmt)}</strong>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <span className="text-[10px] text-slate-500 block">الصافي المستلم فعلياً</span>
                <strong className="font-mono text-sm block mt-0.5 text-emerald-700">{fmtMoney(payoutAmt)}</strong>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Btn onClick={saveEntry}>{editingId ? 'حفظ التعديل' : 'حفظ الاستيراد'}</Btn>
              <Btn tone="ghost" onClick={resetForm}>تفريغ النموذج</Btn>
            </div>
          </Card>

          <Card className="p-4 bg-brand-50/60 border-brand-200 text-xs text-brand-800 leading-relaxed">
            <strong>طريقة الاحتساب:</strong> أسعار قوائم التطبيقات شاملة الضريبة ← يُستخرج الصافي قبل الضريبة ← تُحسب عمولة المنصة على الصافي ← والباقي هو المستلم فعلياً في حسابك. تكلفة كل طبق تُسحب تلقائياً من الوصفات لاحتساب الهامش الحقيقي بعد العمولة، مع مقارنة سعر المنصة بسعر الصالة.
          </Card>
        </>
      )}

      {tab === 'settings' && (
        <>
          <Card className="overflow-x-auto">
            <div className="flex items-center gap-2 p-4 pb-2">
              <Settings2 className="w-5 h-5 text-slate-600" />
              <h3 className="font-extrabold text-slate-800 text-sm">منصات التوصيل المعرفة ونسب العمولات</h3>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr>{['اسم المنصة', 'العمولة %', 'الحالة', 'إجراءات'].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {deliveryApps.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-2"><input value={a.name} onChange={(e) => updateDeliveryApp(a.id, { name: e.target.value })} className={inputCls} /></td>
                    <td className="p-2 w-32"><input type="number" min={0} max={100} step={0.5} value={a.commissionPercent} onChange={(e) => updateDeliveryApp(a.id, { commissionPercent: Number(e.target.value) || 0 })} className={inputCls} /></td>
                    <td className="p-2">
                      <Btn tone={a.isActive ? 'success' : 'ghost'} onClick={() => updateDeliveryApp(a.id, { isActive: !a.isActive })}>{a.isActive ? 'نشطة' : 'موقوفة'}</Btn>
                    </td>
                    <td className="p-2 w-14">
                      <button onClick={() => { if (window.confirm(`حذف منصة ${a.name}؟`)) deleteDeliveryApp(a.id); }} className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600" title="حذف"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {!deliveryApps.length && <tr><td colSpan={4} className="p-4 text-center text-slate-400">أضف أول منصة أدناه</td></tr>}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <h4 className="font-extrabold text-slate-700 text-xs mb-2">إضافة منصة جديدة</h4>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-48">
                <Field label="اسم المنصة">
                  <input value={newAppName} onChange={(e) => setNewAppName(e.target.value)} className={inputCls} placeholder="مثال: كيك (Keek)" />
                </Field>
              </div>
              <div className="w-32">
                <Field label="العمولة %">
                  <input type="number" min={0} max={100} step={0.5} value={newAppPct} onChange={(e) => setNewAppPct(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Btn onClick={addNewApp}><PlusCircle className="w-4 h-4" /> إضافة</Btn>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default DeliveryIntegrationsView;

import React, { useMemo, useState } from 'react';
import {
  Scale, NotebookPen, BookOpen, Landmark, FileText, Truck, Users,
  Layers, Receipt,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader } from '../ui';
import { fmtMoney, downloadCSV } from '../../utils/helpers';
import { renderProReport, type ProReportSpec, type ProTable } from '../../utils/pdf';
import { SharedReportCard, type ReportExhibit } from './SharedReportCard';

type Exhibit = ReportExhibit;

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات',
};

export const ERPFinancialReportsView: React.FC = () => {
  const { accounts, journalEntries, invoices, fixedAssets, branches, getBranchName, posOrders, grnNotes } = useApp();
  const [branch, setBranch] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  // ===================== حساب أرصدة الحسابات من القيود =====================
  // لكل حساب: مجموع المدين، مجموع الدائن، و الرصيد (حسب طبيعة الحساب)
  const accountBalances = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    accounts.forEach((a) => { if (a.isActive) map.set(a.id, { debit: 0, credit: 0 }); });
    journalEntries.forEach((je) => {
      je.lines.forEach((l) => {
        if (!map.has(l.accountId)) return;
        const e = map.get(l.accountId)!;
        e.debit += l.debit; e.credit += l.credit;
      });
    });
    const rows = Array.from(map.entries()).map(([id, e]) => {
      const acc = accounts.find((a) => a.id === id)!;
      const isDebitNormal = acc.type === 'asset' || acc.type === 'expense';
      const balance = isDebitNormal ? e.debit - e.credit : e.credit - e.debit;
      return { acc, debit: e.debit, credit: e.credit, balance };
    });
    rows.sort((a, b) => a.acc.code.localeCompare(b.acc.code));
    return rows;
  }, [accounts, journalEntries]);

  // ===================== دفتر اليومية =====================
  const journalRows = useMemo(() => journalEntries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.entryNumber.localeCompare(a.entryNumber)),
  [journalEntries]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  // ===================== أستاذ الأصول الثابتة =====================
  const assetRows = useMemo(() => {
    return fixedAssets.filter((a) => a.isActive).map((a) => {
      const nbv = Math.max(0, a.purchaseCost - a.accumulatedDepreciation);
      const remaining = Math.max(0, a.usefulLifeYears * 12);
      const monthly = a.usefulLifeYears > 0 ? (a.purchaseCost - a.salvageValue) / a.usefulLifeYears / 12 : 0;
      return { code: a.code, name: a.name, cat: a.category, branch: getBranchName(a.branchId), cost: a.purchaseCost, salvage: a.salvageValue, accDep: a.accumulatedDepreciation, nbv, monthly, remaining };
    });
  }, [fixedAssets, getBranchName]);

  // ===================== ضريبة القيمة المضافة =====================
  const vatRows = useMemo(() => {
    const rows: { period: string; branch: string; salesVat: number; purVat: number; due: number }[] = [];
    const map = new Map<string, { branch: string; salesVat: number; purVat: number }>();
    posOrders.forEach((o) => {
      const k = o.date.slice(0, 7);
      const e = map.get(k) || { branch: branch === 'all' ? o.branchId : branch, salesVat: 0, purVat: 0 };
      if (branch === 'all' || o.branchId === branch) e.salesVat += o.vatAmount || 0;
      map.set(k, e);
    });
    invoices.forEach((iv) => {
      const k = iv.date.slice(0, 7);
      if (branch !== 'all' && iv.branchId !== branch) return;
      const e = map.get(k) || { branch, salesVat: 0, purVat: 0 };
      if (iv.type === 'purchase') e.purVat += iv.vatAmount || 0;
      else e.salesVat += iv.vatAmount || 0;
      map.set(k, e);
    });
    grnNotes.filter((g) => g.status === 'approved').forEach((g) => {
      const k = g.date.slice(0, 7);
      if (branch !== 'all' && g.branchId !== branch) return;
      const e = map.get(k) || { branch, salesVat: 0, purVat: 0 };
      e.purVat += g.vatAmount || 0;
      map.set(k, e);
    });
    Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([period, e]) => {
      rows.push({ period, branch: e.branch, salesVat: e.salesVat, purVat: e.purVat, due: e.salesVat - e.purVat });
    });
    return rows;
  }, [posOrders, invoices, grnNotes, branch]);

  // ===================== Aging القبض / الدفع =====================
  const arAging = useMemo(() => {
    const rows: { party: string; current: number; d30: number; d60: number; d90: number; total: number }[] = [];
    const today = new Date(Date.now() - (new Date().getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
    const map = new Map<string, { current: number; d30: number; d60: number; d90: number }>();
    invoices.filter((iv) => iv.type === 'sales' && iv.currencyCode !== 'purchase').forEach((iv) => {
      const bal = iv.totalAmount - iv.paidAmount;
      if (bal <= 0) return;
      const due = iv.dueDate || iv.date;
      const days = Math.max(0, (Date.parse(today) - Date.parse(due)) / 86400000);
      const e = map.get(iv.partyName) || { current: 0, d30: 0, d60: 0, d90: 0 };
      if (iv.status === 'paid') return;
      if (days <= 0) e.current += bal;
      else if (days <= 30) e.d30 += bal;
      else if (days <= 60) e.d60 += bal;
      else e.d90 += bal;
      map.set(iv.partyName, e);
    });
    Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([party, e]) => {
      rows.push({ party, current: e.current, d30: e.d30, d60: e.d60, d90: e.d90, total: e.current + e.d30 + e.d60 + e.d90 });
    });
    return rows;
  }, [invoices]);

  const apAging = useMemo(() => {
    const rows: { party: string; current: number; d30: number; d60: number; d90: number; total: number }[] = [];
    const today = new Date(Date.now() - (new Date().getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
    const map = new Map<string, { current: number; d30: number; d60: number; d90: number }>();
    invoices.filter((iv) => iv.type === 'purchase').forEach((iv) => {
      const bal = iv.totalAmount - iv.paidAmount;
      if (bal <= 0 || iv.status === 'paid') return;
      const due = iv.dueDate || iv.date;
      const days = Math.max(0, (Date.parse(today) - Date.parse(due)) / 86400000);
      const e = map.get(iv.partyName) || { current: 0, d30: 0, d60: 0, d90: 0 };
      if (days <= 0) e.current += bal;
      else if (days <= 30) e.d30 += bal;
      else if (days <= 60) e.d60 += bal;
      else e.d90 += bal;
      map.set(iv.partyName, e);
    });
    Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([party, e]) => {
      rows.push({ party, current: e.current, d30: e.d30, d60: e.d60, d90: e.d90, total: e.current + e.d30 + e.d60 + e.d90 });
    });
    return rows;
  }, [invoices]);

  // ===================== الميزانية العمومية =====================
  const balanceSheet = useMemo(() => {
    const byType = (t: string) => accountBalances.filter((r) => r.acc.type === t).filter((r) => Math.abs(r.balance) > 0.009)
      .map((r) => ({ name: r.acc.name, balance: r.balance }))
      .sort((a, b) => b.balance - a.balance);
    const assets = byType('asset');
    const liabilities = byType('liability');
    const equity = byType('equity');
    const ta = assets.reduce((s, r) => s + r.balance, 0);
    const tl = liabilities.reduce((s, r) => s + r.balance, 0);
    const te = equity.reduce((s, r) => s + r.balance, 0);
    const netIncome = accountBalances.filter((r) => r.acc.type === 'revenue' || r.acc.type === 'expense').reduce((s, r) => s + (r.acc.type === 'revenue' ? r.balance : -r.balance), 0);
    return { assets, liabilities, equity, netIncome, ta, tl, te, total: ta - (tl + te + netIncome) };
  }, [accountBalances]);

  // ===================== الاهتلاك الشهري الإجمالي =====================
  const totalMonthlyDep = assetRows.reduce((s, r) => s + r.monthly, 0);

  const toProSpec = (title: string, tables: ProTable[], kpis?: { label: string; value: string }[], subtitle?: string): ProReportSpec => ({
    title,
    subtitle,
    orientation: tables.some((t) => t.columns.length >= 9) ? 'landscape' : 'portrait',
    meta: { 'الفرع / مركز التكلفة': branch === 'all' ? 'كل الفروع' : getBranchName(branch), 'تاريخ الإصدار': new Date().toLocaleDateString('ar-SA-u-nu-latn') },
    summaryKpis: kpis,
    tables,
    footer: 'مكتبة التقارير المالية — RestoCost ERP Pro (بمعايير ERP / QuickBooks)',
  });

  const download = async (name: string, spec: ProReportSpec) => {
    setBusy(name);
    try {
      const blob = await renderProReport(spec);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${name}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      flash(`تم تصدير «${name}» كملف PDF احترافي`);
    } catch { flash('تعذر تصدير PDF'); }
    finally { setBusy(null); }
  };

  const csv = (name: string, header: string[], rows: (string | number)[][]) => {
    downloadCSV(`${name}.csv`, header, rows);
    flash(`تم تصدير ${name} CSV`);
  };

  const tbRows = accountBalances.map((r) => ({ code: r.acc.code, name: r.acc.name, type: ACCOUNT_TYPE_LABELS[r.acc.type] || r.acc.type, debit: r.debit, credit: r.credit, balance: r.balance }));
  const tbDebit = accountBalances.reduce((s, r) => s + r.debit, 0);
  const tbCredit = accountBalances.reduce((s, r) => s + r.credit, 0);

  const exhibits: Exhibit[] = [
    // ============ ميزان المراجعة ============
    {
      id: 'trial_balance', icon: <Scale className="w-5 h-5 text-brand-500" />,
      title: 'ميزان المراجعة (Trial Balance)', subtitle: 'أرصدة كل الحسابات (مدين/دائن) من دفتر الأستاذ العام',
      columns: [
        { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الحساب' }, { key: 'type', label: 'النوع' },
        { key: 'debit', label: 'مدين', type: 'money' }, { key: 'credit', label: 'دائن', type: 'money' }, { key: 'balance', label: 'الرصيد', type: 'money' },
      ],
      rows: tbRows.map((r) => ({ ...r })),
      csvHeader: ['الرمز', 'الحساب', 'النوع', 'مدين', 'دائن', 'الرصيد'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الرمز' }, { title: 'الحساب' }, { title: 'النوع' }, { title: 'مدين', type: 'money' }, { title: 'دائن', type: 'money' }, { title: 'الرصيد', type: 'money' }],
          rows: tbRows.map((r) => [r.code, r.name, r.type, r.debit, r.credit, r.balance]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', tbDebit, tbCredit, ''];
        return toProSpec('ميزان المراجعة', [pro], [{ label: 'عدد الحسابات', value: String(accountBalances.length) }, { label: 'إجمالي المدين', value: fmtMoney(tbDebit) }]);
      },
    },
    // ============ دفتر اليومية ============
    {
      id: 'journal', icon: <NotebookPen className="w-5 h-5 text-sky-500" />,
      title: 'دفتر اليومية (Journal Register)', subtitle: 'سجل كل القيود المحاسبية مع تفاصيل الأطراف (مدين/دائن)',
      columns: [
        { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'num', label: 'الرقم' }, { key: 'desc', label: 'البيان' }, { key: 'src', label: 'المصدر' },
        { key: 'account', label: 'الحساب' }, { key: 'debit', label: 'مدين', type: 'money' }, { key: 'credit', label: 'دائن', type: 'money' },
      ],
      rows: journalRows.flatMap((je) => je.lines.map((l) => ({ date: je.date, num: je.entryNumber, desc: je.description, src: je.source === 'auto' ? 'تلقائي' : 'يدوي', account: accountName(l.accountId), debit: l.debit, credit: l.credit }))),
      csvHeader: ['التاريخ', 'الرقم', 'البيان', 'المصدر', 'الحساب', 'مدين', 'دائن'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'التاريخ', type: 'date' }, { title: 'الرقم' }, { title: 'البيان' }, { title: 'المصدر' }, { title: 'الحساب' }, { title: 'مدين', type: 'money' }, { title: 'دائن', type: 'money' }],
          rows: journalRows.flatMap((je) => je.lines.map((l) => [je.date, je.entryNumber, je.description, je.source === 'auto' ? 'تلقائي' : 'يدوي', accountName(l.accountId), l.debit, l.credit])),
        };
        const td = journalRows.reduce((s, je) => s + je.lines.reduce((x, l) => x + l.debit, 0), 0);
        const tc = journalRows.reduce((s, je) => s + je.lines.reduce((x, l) => x + l.credit, 0), 0);
        pro.totalsLabel = 'الإجمالي'; pro.totals = ['', '', '', '', '', td, tc];
        return toProSpec('دفتر اليومية', [pro], [{ label: 'عدد القيود', value: String(journalRows.length) }]);
      },
    },
    // ============ دفتر الأستاذ العام ============
    {
      id: 'general_ledger', icon: <BookOpen className="w-5 h-5 text-violet-500" />,
      title: 'دفتر الأستاذ العام (General Ledger)', subtitle: 'حركة كل حساب مع الرصيد الجاري التراكمي',
      columns: [
        { key: 'code', label: 'الرمز' }, { key: 'account', label: 'الحساب' }, { key: 'debit', label: 'مدين', type: 'money' }, { key: 'credit', label: 'دائن', type: 'money' }, { key: 'balance', label: 'الرصيد', type: 'money' },
      ],
      rows: tbRows.map((r) => ({ ...r })),
      csvHeader: ['الرمز', 'الحساب', 'مدين', 'دائن', 'الرصيد'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الرمز' }, { title: 'الحساب' }, { title: 'مدين', type: 'money' }, { title: 'دائن', type: 'money' }, { title: 'الرصيد', type: 'money' }],
          rows: tbRows.filter((r) => Math.abs(r.balance) > 0.009).map((r) => [r.code, r.name, r.debit, r.credit, r.balance]),
        };
        pro.totalsLabel = 'الإجمالي'; pro.totals = ['', tbRows.length, tbDebit, tbCredit, ''];
        return toProSpec('دفتر الأستاذ العام', [pro], [{ label: 'عدد الحسابات النشطة', value: String(tbRows.length) }]);
      },
    },
    // ============ الميزانية العمومية ============
    {
      id: 'balance_sheet', icon: <Landmark className="w-5 h-5 text-emerald-500" />,
      title: 'الميزانية العمومية (Balance Sheet)', subtitle: 'الأصول = الخصوم + حقوق الملكية (+ صافي الدخل)',
      columns: [
        { key: 'name', label: 'البند' }, { key: 'typeLabel', label: 'التصنيف' }, { key: 'balance', label: 'القيمة', type: 'money' },
      ],
      rows: [
        { _group: true, key: 'group', name: 'الأصول', typeLabel: '', balance: '' },
        ...balanceSheet.assets.map((r) => ({ name: r.name, typeLabel: 'أصول', balance: r.balance })),
        { _total: true, key: 't', name: 'إجمالي الأصول', typeLabel: '', balance: balanceSheet.ta },
        { _group: true, key: 'group2', name: 'الخصوم', typeLabel: '', balance: '' },
        ...balanceSheet.liabilities.map((r) => ({ name: r.name, typeLabel: 'خصوم', balance: r.balance })),
        { _total: true, key: 't2', name: 'إجمالي الخصوم', typeLabel: '', balance: balanceSheet.tl },
        { _group: true, key: 'group3', name: 'حقوق الملكية', typeLabel: '', balance: '' },
        ...balanceSheet.equity.map((r) => ({ name: r.name, typeLabel: 'حقوق ملكية', balance: r.balance })),
        { _total: true, key: 't3', name: 'صافي الدخل (المرحل)', typeLabel: '', balance: balanceSheet.netIncome },
      ],
      csvHeader: ['البند', 'التصنيف', 'القيمة'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'البند' }, { title: 'التصنيف' }, { title: 'القيمة', type: 'money' }],
          rows: [
            ['الأصول', '', ''],
            ...balanceSheet.assets.map((r) => [r.name, 'أصول', r.balance]),
            ['إجمالي الأصول', '', balanceSheet.ta],
            ['الخصوم', '', ''],
            ...balanceSheet.liabilities.map((r) => [r.name, 'خصوم', r.balance]),
            ['إجمالي الخصوم', '', balanceSheet.tl],
            ['حقوق الملكية', '', ''],
            ...balanceSheet.equity.map((r) => [r.name, 'حقوق ملكية', r.balance]),
            ['صافي الدخل (المرحل)', '', balanceSheet.netIncome],
          ],
        };
        return toProSpec('الميزانية العمومية', [pro], [{ label: 'إجمالي الأصول', value: fmtMoney(balanceSheet.ta) }, { label: 'الفرق', value: fmtMoney(balanceSheet.total) }]);
      },
    },
    // ============ الأصول الثابتة والاهتلاك ============
    {
      id: 'fixed_assets', icon: <Layers className="w-5 h-5 text-amber-500" />,
      title: 'الأصول الثابتة والاهتلاك (Fixed Assets & Depreciation)', subtitle: 'التكلفة، الاهتلاك المتراكم، القيمة الدفترية، وقسط الاهتلاك الشهري',
      columns: [
        { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الأصل' }, { key: 'cat', label: 'التصنيف' }, { key: 'branch', label: 'الفرع' },
        { key: 'cost', label: 'التكلفة', type: 'money' }, { key: 'salvage', label: 'قيمة الخردة', type: 'money' },
        { key: 'accDep', label: 'الاهتلاك المتراكم', type: 'money' }, { key: 'nbv', label: 'القيمة الدفترية', type: 'money' },
        { key: 'monthly', label: 'القسط الشهري', type: 'money' },
      ],
      rows: assetRows.map((r) => ({ ...r })),
      csvHeader: ['الرمز', 'الأصل', 'التصنيف', 'الفرع', 'التكلفة', 'قيمة الخردة', 'الاهتلاك المتراكم', 'القيمة الدفترية', 'القسط الشهري'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الرمز' }, { title: 'الأصل' }, { title: 'التصنيف' }, { title: 'الفرع' }, { title: 'التكلفة', type: 'money' }, { title: 'قيمة الخردة', type: 'money' }, { title: 'الاهتلاك المتراكم', type: 'money' }, { title: 'القيمة الدفترية', type: 'money' }, { title: 'القسط الشهري', type: 'money' }],
          rows: assetRows.map((r) => [r.code, r.name, r.cat, r.branch, r.cost, r.salvage, r.accDep, r.nbv, r.monthly]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', assetRows.reduce((s, r) => s + r.cost, 0), '', assetRows.reduce((s, r) => s + r.accDep, 0), assetRows.reduce((s, r) => s + r.nbv, 0), totalMonthlyDep];
        return toProSpec('الأصول الثابتة والاهتلاك', [pro], [{ label: 'عدد الأصول', value: String(assetRows.length) }, { label: 'إجمالي القيمة الدفترية', value: fmtMoney(assetRows.reduce((s, r) => s + r.nbv, 0)) }, { label: 'قسط الاهتلاك الشهري', value: fmtMoney(totalMonthlyDep) }]);
      },
    },
    // ============ ضريبة القيمة المضافة ============
    {
      id: 'vat', icon: <Receipt className="w-5 h-5 text-rose-500" />,
      title: 'تقرير ضريبة القيمة المضافة (VAT)', subtitle: 'ضريبة المبيعات، ضريبة المشتريات، وصافي الضريبة المستحقة شهرياً',
      columns: [
        { key: 'period', label: 'الفترة' }, { key: 'branch', label: 'الفرع' }, { key: 'salesVat', label: 'ضريبة المبيعات', type: 'money' }, { key: 'purVat', label: 'ضريبة المشتريات', type: 'money' }, { key: 'due', label: 'صافي المستحق', type: 'money' },
      ],
      rows: vatRows.map((r) => ({ ...r })),
      csvHeader: ['الفترة', 'الفرع', 'ضريبة المبيعات', 'ضريبة المشتريات', 'صافي المستحق'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفترة' }, { title: 'الفرع' }, { title: 'ضريبة المبيعات', type: 'money' }, { title: 'ضريبة المشتريات', type: 'money' }, { title: 'صافي المستحق', type: 'money' }],
          rows: vatRows.map((r) => [r.period, r.branch, r.salesVat, r.purVat, r.due]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', vatRows.reduce((s, r) => s + r.salesVat, 0), vatRows.reduce((s, r) => s + r.purVat, 0), vatRows.reduce((s, r) => s + r.due, 0)];
        return toProSpec('تقرير ضريبة القيمة المضافة', [pro], [{ label: 'صافي الضريبة المستحقة', value: fmtMoney(vatRows.reduce((s, r) => s + r.due, 0)) }]);
      },
    },
    // ============ Aging القبض ============
    {
      id: 'ar_aging', icon: <Users className="w-5 h-5 text-sky-500" />,
      title: 'حسابات القبض — تحليل الأعمار (AR Aging)', subtitle: 'مستحقات العملاء حسب المدة (حالي / 30 / 60 / 90+ يوم)',
      columns: [
        { key: 'party', label: 'العميل' }, { key: 'current', label: 'حالي', type: 'money' }, { key: 'd30', label: '1-30 يوم', type: 'money' }, { key: 'd60', label: '31-60 يوم', type: 'money' }, { key: 'd90', label: '60+ يوم', type: 'money' }, { key: 'total', label: 'الإجمالي', type: 'money' },
      ],
      rows: arAging.map((r) => ({ ...r })),
      csvHeader: ['العميل', 'حالي', '1-30 يوم', '31-60 يوم', '60+ يوم', 'الإجمالي'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'العميل' }, { title: 'حالي', type: 'money' }, { title: '1-30 يوم', type: 'money' }, { title: '31-60 يوم', type: 'money' }, { title: '60+ يوم', type: 'money' }, { title: 'الإجمالي', type: 'money' }],
          rows: arAging.map((r) => [r.party, r.current, r.d30, r.d60, r.d90, r.total]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', arAging.reduce((s, r) => s + r.current, 0), arAging.reduce((s, r) => s + r.d30, 0), arAging.reduce((s, r) => s + r.d60, 0), arAging.reduce((s, r) => s + r.d90, 0), arAging.reduce((s, r) => s + r.total, 0)];
        return toProSpec('حسابات القبض — تحليل الأعمار', [pro], [{ label: 'إجمالي المستحقات', value: fmtMoney(arAging.reduce((s, r) => s + r.total, 0)) }]);
      },
    },
    // ============ Aging الدفع ============
    {
      id: 'ap_aging', icon: <Truck className="w-5 h-5 text-violet-500" />,
      title: 'حسابات الدفع — تحليل الأعمار (AP Aging)', subtitle: 'مستحقات الموردين حسب المدة (حالي / 30 / 60 / 90+ يوم)',
      columns: [
        { key: 'party', label: 'المورد' }, { key: 'current', label: 'حالي', type: 'money' }, { key: 'd30', label: '1-30 يوم', type: 'money' }, { key: 'd60', label: '31-60 يوم', type: 'money' }, { key: 'd90', label: '60+ يوم', type: 'money' }, { key: 'total', label: 'الإجمالي', type: 'money' },
      ],
      rows: apAging.map((r) => ({ ...r })),
      csvHeader: ['المورد', 'حالي', '1-30 يوم', '31-60 يوم', '60+ يوم', 'الإجمالي'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'المورد' }, { title: 'حالي', type: 'money' }, { title: '1-30 يوم', type: 'money' }, { title: '31-60 يوم', type: 'money' }, { title: '60+ يوم', type: 'money' }, { title: 'الإجمالي', type: 'money' }],
          rows: apAging.map((r) => [r.party, r.current, r.d30, r.d60, r.d90, r.total]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', apAging.reduce((s, r) => s + r.current, 0), apAging.reduce((s, r) => s + r.d30, 0), apAging.reduce((s, r) => s + r.d60, 0), apAging.reduce((s, r) => s + r.d90, 0), apAging.reduce((s, r) => s + r.total, 0)];
        return toProSpec('حسابات الدفع — تحليل الأعمار', [pro], [{ label: 'إجمالي المستحقات', value: fmtMoney(apAging.reduce((s, r) => s + r.total, 0)) }]);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير المالية والمحاسبية (بمعايير ERP / QuickBooks)"
        subtitle="ميزان المراجعة، دفتر اليومية، الأستاذ العام، الميزانية العمومية، الأصول الثابتة والاهتلاك، ضريبة القيمة المضافة، وتحليلات أعمار القبض والدفع — مع تصدير PDF احترافي و CSV لكل تقرير"
        icon={<FileText className="w-6 h-6 text-brand-600" />}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">الفرع:</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-brand-500 bg-slate-800 !w-56">
              <option value="all">كل الفروع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{getBranchName(b.id)}</option>)}
            </select>
          </div>
        }
      />
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{msg}</div>}
      <div className="space-y-6">
        {exhibits.map((ex) => (
          <SharedReportCard
            key={ex.id}
            ex={{ ...ex, printMeta: [['الفرع', branch === 'all' ? 'كل الفروع' : getBranchName(branch)]], printFooter: 'مكتبة التقارير المالية — RestoCost ERP Pro (بمعايير ERP / QuickBooks)' }}
            busy={busy}
            onDownload={download}
            onCsv={csv}
          />
        ))}
      </div>
    </div>
  );
};

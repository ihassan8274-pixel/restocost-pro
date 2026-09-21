import React, { useMemo, useState } from 'react';
import { BookOpenText, Scale, Landmark, ListOrdered, Plus, Trash2, BadgeCheck, CircleAlert, Receipt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls, Modal, TabBar, SectionHeader } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, navOnEnter } from '../../utils/helpers';
import type { AccountType, JournalLine } from '../../types';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'أصل', liability: 'التزام', equity: 'حقوق ملكية', revenue: 'إيراد', expense: 'مصروف',
};

const accountTypeTone = (t: AccountType) => {
  switch (t) {
    case 'asset': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'liability': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'equity': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'revenue': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'expense': return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const AccountingView: React.FC = () => {
  const { accounts, journalEntries, addAccount, addJournalEntry, can, posOrders, posReturns, invoices, grnNotes, visibleBranchIds } = useApp();
  const canManage = can('manage_accounting');
  const [tab, setTab] = useState('journal');
  const [entryModal, setEntryModal] = useState(false);
  const [accountModal, setAccountModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [ledgerAccountId, setLedgerAccountId] = useState(accounts[0]?.id || '');

  // manual entry form
  const [fDate, setFDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fDesc, setFDesc] = useState('');
  const [fLines, setFLines] = useState<JournalLine[]>([{ accountId: accounts[0]?.id || '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);

  // account form
  const [accCode, setAccCode] = useState('');
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('asset');

  const accountTotals = useMemo(() => {
    const map: Record<string, { debit: number; credit: number }> = {};
    accounts.forEach((a) => { map[a.id] = { debit: 0, credit: 0 }; });
    journalEntries.forEach((e) => e.lines.forEach((l) => {
      if (!map[l.accountId]) map[l.accountId] = { debit: 0, credit: 0 };
      map[l.accountId].debit += l.debit;
      map[l.accountId].credit += l.credit;
    }));
    return map;
  }, [accounts, journalEntries]);

  const totalDebit = journalEntries.reduce((s, e) => s + e.lines.reduce((a, l) => a + l.debit, 0), 0);
  const totalCredit = journalEntries.reduce((s, e) => s + e.lines.reduce((a, l) => a + l.credit, 0), 0);

  // Balance sheet: net account balance per type
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || 'حساب محذوف';
  const balanceOfAccount = (id: string) => {
    const t = accountTotals[id] || { debit: 0, credit: 0 };
    const a = accounts.find((x) => x.id === id);
    if (!a) return 0;
    // debit-nature types (asset, expense) balance = debit - credit; credit-nature = credit - debit
    return (a.type === 'asset' || a.type === 'expense') ? t.debit - t.credit : t.credit - t.debit;
  };
  const bsSections = useMemo(() => {
    const assets = accounts.filter((a) => a.type === 'asset').map((a) => ({ account: a, balance: balanceOfAccount(a.id) }));
    const liabilities = accounts.filter((a) => a.type === 'liability').map((a) => ({ account: a, balance: balanceOfAccount(a.id) }));
    const equity = accounts.filter((a) => a.type === 'equity').map((a) => ({ account: a, balance: balanceOfAccount(a.id) }));
    return { assets, liabilities, equity };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, accountTotals]);
  const bsTotals = {
    assets: bsSections.assets.reduce((s, x) => s + x.balance, 0),
    liabilities: bsSections.liabilities.reduce((s, x) => s + x.balance, 0),
    equity: bsSections.equity.reduce((s, x) => s + x.balance, 0),
  };
  // Retained earnings = net revenue - net expenses (drives balance sheet to balance)
  const netRevenue = accounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + balanceOfAccount(a.id), 0);
  const netExpenses = accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + balanceOfAccount(a.id), 0);
  const retainedEarnings = netRevenue - netExpenses;
  const bsDiff = bsTotals.assets - (bsTotals.liabilities + bsTotals.equity + retainedEarnings);

  const submitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addJournalEntry({ date: fDate, description: fDesc, lines: fLines });
    if (!res.ok) { setMsg(res.error || 'خطأ'); setTimeout(() => setMsg(''), 3000); return; }
    setMsg('تم إضافة القيد بنجاح');
    setTimeout(() => setMsg(''), 3000);
    setEntryModal(false);
    setFDesc(''); setFLines([{ accountId: accounts[0]?.id || '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
  };

  const submitAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCode.trim() || !accName.trim()) return;
    addAccount({ code: accCode.trim(), name: accName.trim(), type: accType, isActive: true });
    setAccountModal(false); setAccCode(''); setAccName('');
  };

  const ledgerLines = useMemo(() => {
    if (!ledgerAccountId) return [];
    return journalEntries
      .filter((e) => e.lines.some((l) => l.accountId === ledgerAccountId))
      .sort((a, b) => a.date.localeCompare(b.date) || a.entryNumber.localeCompare(b.entryNumber))
      .flatMap((e) => e.lines.filter((l) => l.accountId === ledgerAccountId).map((l) => ({ entry: e, line: l })));
  }, [journalEntries, ledgerAccountId]);

  const ledgerBalance = (() => {
    let bal = 0;
    return ledgerLines.map(({ entry, line }) => {
      bal += line.debit - line.credit;
      return { entry, line, running: bal };
    });
  })();

  const newLine = { accountId: accounts[0]?.id || '', debit: 0, credit: 0 };
  const setLine = (idx: number, patch: Partial<JournalLine>) => setFLines(fLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const exportRows = {
    journal: {
      sheets: [{
        name: 'القيود اليومية', header: ['الرقم', 'التاريخ', 'البيان', 'الحساب', 'مدين', 'دائن', 'المصدر'],
        rows: journalEntries.flatMap((e) => e.lines.map((l) => [e.entryNumber, e.date, e.description, accountName(l.accountId), l.debit, l.credit, e.source === 'auto' ? 'ترحيل تلقائي' : 'يدوي'])),
      }],
      filename: 'القيود_اليومية',
    },
    trial: {
      sheets: [{
        name: 'ميزان المراجعة', header: ['الكود', 'الحساب', 'النوع', 'إجمالي مدين', 'إجمالي دائن', 'الرصيد'],
        rows: accounts.map((a) => [a.code, a.name, ACCOUNT_TYPE_LABELS[a.type], accountTotals[a.id]?.debit || 0, accountTotals[a.id]?.credit || 0, (accountTotals[a.id]?.debit || 0) - (accountTotals[a.id]?.credit || 0)]),
      }],
      filename: 'ميزان_المراجعة',
    },
    balance: {
      sheets: [{
        name: 'الميزانية العمومية', header: ['القسم', 'الحساب', 'الرصيد'],
        rows: [
          ...bsSections.assets.map((x) => ['أصول', x.account.name, x.balance]),
          ['أصول', 'إجمالي الأصول', bsTotals.assets],
          ...bsSections.liabilities.map((x) => ['التزامات', x.account.name, x.balance]),
          ['التزامات', 'إجمالي الالتزامات', bsTotals.liabilities],
          ...bsSections.equity.map((x) => ['حقوق ملكية', x.account.name, x.balance]),
          ['حقوق ملكية', 'إجمالي حقوق الملكية', bsTotals.equity],
          ['حقوق ملكية', 'أرباح محتجزة (صافي)', retainedEarnings],
        ],
      }],
      filename: 'الميزانية_العمومية',
    },
  };

  // ---- VAT computations ----
  const vatRows = useMemo(() => {
    const monthly: Record<string, { output: number; input: number; outputCount: number; inputCount: number }> = {};
    const monthOf = (d: string) => d.slice(0, 7);
    const scopedPos = posOrders.filter((o) => visibleBranchIds.includes(o.branchId));
    const scopedInv = invoices.filter((i) => visibleBranchIds.includes(i.branchId));
    const add = (key: string, patch: Partial<{ output: number; input: number; outputCount: number; inputCount: number }>) => {
      if (!monthly[key]) monthly[key] = { output: 0, input: 0, outputCount: 0, inputCount: 0 };
      monthly[key] = { ...monthly[key], ...patch };
    };
    scopedPos.forEach((o) => add(monthOf(o.date), { output: (monthly[monthOf(o.date)]?.output || 0) + o.vatAmount, outputCount: (monthly[monthOf(o.date)]?.outputCount || 0) + 1 }));
    scopedInv.forEach((i) => {
      const m = monthOf(i.date);
      if (i.type === 'sales') add(m, { output: (monthly[m]?.output || 0) + i.vatAmount, outputCount: (monthly[m]?.outputCount || 0) + 1 });
      else add(m, { input: (monthly[m]?.input || 0) + i.vatAmount, inputCount: (monthly[m]?.inputCount || 0) + 1 });
    });
    // returns reduce output VAT (credit notes)
    posReturns.filter((r) => visibleBranchIds.includes(r.branchId)).forEach((r) => add(monthOf(r.date), { output: (monthly[monthOf(r.date)]?.output || 0) - r.vatAmount }));
    // GRN purchases input VAT (15%)
    grnNotes.filter((g) => visibleBranchIds.includes(g.branchId)).forEach((g) => {
      if (g.status === 'approved' && (g.vatAmount || 0) > 0) add(monthOf(g.date), { input: (monthly[monthOf(g.date)]?.input || 0) + (g.vatAmount || 0), inputCount: (monthly[monthOf(g.date)]?.inputCount || 0) + 1 });
    });
    return Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0]));
  }, [posOrders, invoices, posReturns, grnNotes, visibleBranchIds]);

  const vatTotalOutput = vatRows.reduce((s, [, v]) => s + v.output, 0);
  const vatTotalInput = vatRows.reduce((s, [, v]) => s + v.input, 0);
  const vatTotalNet = vatTotalOutput - vatTotalInput;

  const vatTransactions = useMemo(() => {
    const rows: { date: string; ref: string; party: string; dir: 'output' | 'input'; vat: number }[] = [];
    posOrders.filter((o) => visibleBranchIds.includes(o.branchId)).forEach((o) => rows.push({ date: o.date.slice(0, 10), ref: o.orderNumber, party: o.cashierName, dir: 'output', vat: o.vatAmount }));
    posReturns.filter((r) => visibleBranchIds.includes(r.branchId)).forEach((r) => rows.push({ date: r.date, ref: r.returnNumber, party: 'مرتجع/إشعار دائن', dir: 'output', vat: -r.vatAmount }));
    invoices.filter((i) => visibleBranchIds.includes(i.branchId)).forEach((i) => rows.push({ date: i.date, ref: i.invoiceNumber, party: i.partyName, dir: i.type === 'sales' ? 'output' : 'input', vat: i.vatAmount }));
    grnNotes.filter((g) => visibleBranchIds.includes(g.branchId) && g.status === 'approved' && (g.vatAmount || 0) > 0).forEach((g) => rows.push({ date: g.date, ref: g.grnNumber, party: g.supplierName, dir: 'input', vat: g.vatAmount || 0 }));
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  }, [posOrders, posReturns, invoices, grnNotes, visibleBranchIds]);

  const exportVatRows = {
    sheets: [
      { name: 'تقرير ضريبة القيمة المضافة', header: ['الشهر', 'ضريبة المبيعات (خرج)', 'عدد المعاملات', 'ضريبة المشتريات (دخل)', 'عدد المعاملات', 'صافي الضريبة المستحقة'], rows: vatRows.map(([m, v]) => [m, v.output, v.outputCount, v.input, v.inputCount, v.output - v.input]) },
      { name: 'تفاصيل المعاملات', header: ['التاريخ', 'المرجع', 'الطرف', 'الاتجاه', 'قيمة الضريبة'], rows: vatTransactions.map((t) => [t.date, t.ref, t.party, t.dir === 'output' ? 'ضريبة خرج (مبيعات)' : 'ضريبة دخل (مشتريات)', t.vat]) },
    ],
    filename: 'تقرير_ضريبة_القيمة_المضافة',
  };

  return (
    <div className="space-y-6">
      <PageHeader title="المحاسبة والقيود المالية" subtitle="دليل الحسابات، القيود اليومية، ميزان المراجعة وكشف الحساب — مع ترحيل تلقائي للمبيعات والمشتريات والمصروفات" icon={<BookOpenText className="w-6 h-6 text-amber-300" />}
        actions={
          <ViewToolbar
filename={tab === 'vat' ? exportVatRows.filename : tab === 'trial_balance' ? exportRows.trial.filename : tab === 'balance_sheet' ? exportRows.balance.filename : exportRows.journal.filename}
        sheets={tab === 'vat' ? exportVatRows.sheets : tab === 'trial_balance' ? exportRows.trial.sheets : tab === 'balance_sheet' ? exportRows.balance.sheets : exportRows.journal.sheets}
          />
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي القيود</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{journalEntries.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المدين</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(totalDebit)}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي الدائن</span><strong className="text-lg font-extrabold font-mono text-rose-700 block mt-1">{fmt(totalCredit)}</strong></div>
        <div className={`p-4 rounded-xl border shadow-xs ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <span className="text-slate-500 text-[11px] block">حالة التوازن</span>
          {Math.abs(totalDebit - totalCredit) < 0.01
            ? <strong className="text-lg font-extrabold flex items-center gap-1.5 text-emerald-700 block mt-1"><BadgeCheck className="w-5 h-5" /> متوازن</strong>
            : <strong className="text-lg font-extrabold flex items-center gap-1.5 text-rose-700 block mt-1"><CircleAlert className="w-5 h-5" /> فرق {fmt(Math.abs(totalDebit - totalCredit))}</strong>}
        </div>
      </div>

      <TabBar tabs={[{ id: 'journal', label: 'القيود اليومية' }, { id: 'trial_balance', label: 'ميزان المراجعة' }, { id: 'balance_sheet', label: 'الميزانية العمومية' }, { id: 'chart', label: 'دليل الحسابات' }, { id: 'ledger', label: 'كشف حساب' }, { id: 'vat', label: 'ضريبة القيمة المضافة' }]} active={tab} onChange={setTab} />

      {msg && <div className={`rounded-xl p-3 font-bold text-xs border ${msg.includes('نجاح') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{msg}</div>}

      {/* ============ JOURNAL ============ */}
      {tab === 'journal' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="سجل القيود اليومية" subtitle="جميع القيود المالية بما فيها الترحيلات التلقائية من المبيعات والمشتريات والمصروفات" icon={<ListOrdered className="w-5 h-5 text-indigo-600" />} />
            {canManage && <Btn onClick={() => setEntryModal(true)}><Plus className="w-3.5 h-3.5" /> قيد جديد</Btn>}
          </div>
          <div className="divide-y divide-slate-100">
            {journalEntries.map((e) => {
              const d = e.lines.reduce((s, l) => s + l.debit, 0);
              const c = e.lines.reduce((s, l) => s + l.credit, 0);
              const balanced = Math.abs(d - c) < 0.01;
              return (
                <div key={e.id} className="p-4 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-indigo-700 text-xs">{e.entryNumber}</span>
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{e.date}</span>
                      {e.source === 'auto' ? <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">ترحيل تلقائي</span> : <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">قيد يدوي</span>}
                      {balanced ? <BadgeCheck className="w-4 h-4 text-emerald-600" /> : <CircleAlert className="w-4 h-4 text-rose-600" />}
                    </div>
                    <span className="text-xs font-bold text-slate-700">{e.description}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {e.lines.map((l, idx) => (
                      <div key={idx} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${l.debit > 0 ? 'bg-emerald-50/60' : 'bg-rose-50/60'}`}>
                        <span className="font-bold text-slate-800">{accountName(l.accountId)}</span>
                        <span className={`font-mono font-extrabold ${l.debit > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{l.debit > 0 ? `مدين ${fmt(l.debit)}` : `دائن ${fmt(l.credit)}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {journalEntries.length === 0 && <p className="p-8 text-center text-slate-500 font-bold text-xs">لا توجد قيود يومية</p>}
          </div>
        </Card>
      )}

      {/* ============ TRIAL BALANCE ============ */}
      {tab === 'trial_balance' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="ميزان المراجعة" subtitle="ملخص أرصدة الحسابات (مدين/دائن) حتى تاريخه" icon={<Scale className="w-5 h-5 text-indigo-600" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">الحساب</th><th className="p-3">النوع</th><th className="p-3">إجمالي مدين</th><th className="p-3">إجمالي دائن</th><th className="p-3">الرصيد</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => {
                  const t = accountTotals[a.id] || { debit: 0, credit: 0 };
                  const bal = t.debit - t.credit;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-indigo-700">{a.code}</td>
                      <td className="p-3 font-bold text-slate-800">{a.name}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${accountTypeTone(a.type)}`}>{ACCOUNT_TYPE_LABELS[a.type]}</span></td>
                      <td className="p-3 font-mono text-emerald-700">{fmt(t.debit) || '-'}</td>
                      <td className="p-3 font-mono text-rose-700">{fmt(t.credit) || '-'}</td>
                      <td className={`p-3 font-mono font-extrabold ${bal >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{fmt(bal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                <tr><td colSpan={3} className="p-3 text-slate-700">الإجمالي</td><td className="p-3 font-mono text-emerald-700">{fmt(totalDebit)}</td><td className="p-3 font-mono text-rose-700">{fmt(totalCredit)}</td><td className="p-3 font-mono">{fmt(totalDebit - totalCredit)}</td></tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ============ BALANCE SHEET ============ */}
      {tab === 'balance_sheet' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="الميزانية العمومية" subtitle="ملخص المركز المالي: الأصول مقابل الالتزامات وحقوق الملكية" icon={<Landmark className="w-5 h-5 text-indigo-600" />} extra={Math.abs(bsDiff) < 0.01 ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">متوازنة ✓</span> : <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">فرق {fmt(Math.abs(bsDiff))}</span>} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            {[
              { title: 'الأصول', tone: 'text-emerald-700', rows: bsSections.assets, total: bsTotals.assets, bg: 'bg-emerald-50/40' },
              { title: 'الالتزامات', tone: 'text-rose-700', rows: bsSections.liabilities, total: bsTotals.liabilities, bg: 'bg-rose-50/40' },
              { title: 'حقوق الملكية', tone: 'text-indigo-700', rows: [...bsSections.equity, { account: { id: 'retained', code: '', name: 'الأرباح المحتجزة (صافي)', type: 'equity' as const, isActive: true }, balance: retainedEarnings }], total: bsTotals.equity + retainedEarnings, bg: 'bg-indigo-50/40' },
            ].map((section) => (
              <div key={section.title}>
                <div className={`p-3 ${section.bg}`}>
                  <h3 className={`font-extrabold text-xs ${section.tone}`}>{section.title}</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {section.rows.map((x) => (
                    <div key={x.account.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="font-bold text-slate-700">{x.account.name}</span>
                      <span className="font-mono font-bold text-slate-900">{fmt(x.balance)}</span>
                    </div>
                  ))}
                  {section.rows.length === 0 && <p className="px-3 py-2 text-[10px] text-slate-400 font-bold">لا توجد حسابات</p>}
                </div>
                <div className={`p-3 ${section.bg} border-t border-slate-200`}>
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span className={section.tone}>إجمالي {section.title}</span>
                    <span className={`font-mono ${section.tone}`}>{fmt(section.total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-600">معادلة الميزانية: الأصول = الالتزامات + حقوق الملكية</span>
            <span className="font-mono font-extrabold text-slate-800">
              {fmt(bsTotals.assets)} = {fmt(bsTotals.liabilities)} + {fmt(bsTotals.equity + retainedEarnings)}
              {Math.abs(bsDiff) < 0.01 ? ' ✓' : ` (فرق ${fmt(Math.abs(bsDiff))})`}
            </span>
          </div>
        </Card>
      )}

      {/* ============ CHART OF ACCOUNTS ============ */}
      {tab === 'chart' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="دليل الحسابات" subtitle="الحسابات المالية المعتمدة في النظام" icon={<Landmark className="w-5 h-5 text-indigo-600" />} />
            {canManage && <Btn onClick={() => setAccountModal(true)}><Plus className="w-3.5 h-3.5" /> حساب جديد</Btn>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">اسم الحساب</th><th className="p-3">النوع</th><th className="p-3">الرصيد الحالي</th><th className="p-3">الحالة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.map((a) => {
                  const t = accountTotals[a.id] || { debit: 0, credit: 0 };
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-indigo-700">{a.code}</td>
                      <td className="p-3 font-bold text-slate-800">{a.name}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${accountTypeTone(a.type)}`}>{ACCOUNT_TYPE_LABELS[a.type]}</span></td>
                      <td className="p-3 font-mono font-extrabold text-slate-900">{fmt(t.debit - t.credit)}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.isActive ? 'نشط' : 'موقوف'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============ LEDGER ============ */}
      {tab === 'ledger' && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <SectionHeader title="كشف حساب" subtitle="حركة حساب واحد مع الرصيد المتناقص" icon={<ListOrdered className="w-5 h-5 text-indigo-600" />} />
            <select value={ledgerAccountId} onChange={(e) => setLedgerAccountId(e.target.value)} className={`${inputCls} max-w-sm`}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">التاريخ</th><th className="p-3">رقم القيد</th><th className="p-3">البيان</th><th className="p-3">مدين</th><th className="p-3">دائن</th><th className="p-3">الرصيد</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerBalance.map(({ entry, line, running }, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-600">{entry.date}</td>
                    <td className="p-3 font-mono font-bold text-indigo-700">{entry.entryNumber}</td>
                    <td className="p-3 text-slate-700">{entry.description}</td>
                    <td className="p-3 font-mono text-emerald-700">{line.debit ? fmt(line.debit) : '-'}</td>
                    <td className="p-3 font-mono text-rose-700">{line.credit ? fmt(line.credit) : '-'}</td>
                    <td className={`p-3 font-mono font-extrabold ${running >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>{fmt(running)}</td>
                  </tr>
                ))}
                {ledgerBalance.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500 font-bold">لا توجد حركات على هذا الحساب</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ============ VAT ============ */}
      {tab === 'vat' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ضريبة المبيعات (خرج)</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(vatTotalOutput)}</strong></div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ضريبة المشتريات (دخل)</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(vatTotalInput)}</strong></div>
            <div className={`p-4 rounded-xl border shadow-xs ${vatTotalNet > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <span className="text-slate-500 text-[11px] block">صافي الضريبة المستحقة</span>
              <strong className={`text-lg font-extrabold font-mono block mt-1 ${vatTotalNet > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(vatTotalNet)}</strong>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي المعاملات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{vatTransactions.length}</strong></div>
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <SectionHeader title="تقرير ضريبة القيمة المضافة الشهري" subtitle="ضريبة الخرج (مبيعات POS + فواتير المبيعات) مقابل ضريبة الدخل (فواتير المشتريات) — المرتجعات تُخصم من ضريبة الخرج" icon={<Receipt className="w-5 h-5 text-indigo-600" />} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-3">الشهر</th><th className="p-3">ضريبة الخرج</th><th className="p-3">معاملات الخرج</th><th className="p-3">ضريبة الدخل</th><th className="p-3">معاملات الدخل</th><th className="p-3">صافي المستحق</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vatRows.map(([m, v]) => (
                    <tr key={m} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-indigo-700">{m}</td>
                      <td className="p-3 font-mono font-bold text-indigo-700">{fmt(v.output)}</td>
                      <td className="p-3 font-mono text-slate-600">{v.outputCount}</td>
                      <td className="p-3 font-mono font-bold text-emerald-700">{fmt(v.input)}</td>
                      <td className="p-3 font-mono text-slate-600">{v.inputCount}</td>
                      <td className={`p-3 font-mono font-extrabold ${v.output - v.input > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(v.output - v.input)}</td>
                    </tr>
                  ))}
                  {vatRows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500 font-bold">لا توجد بيانات ضريبية بعد</td></tr>}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr><td className="p-3 text-slate-700">الإجمالي</td><td className="p-3 font-mono text-indigo-700">{fmt(vatTotalOutput)}</td><td className="p-3"></td><td className="p-3 font-mono text-emerald-700">{fmt(vatTotalInput)}</td><td className="p-3"></td><td className={`p-3 font-mono ${vatTotalNet > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(vatTotalNet)}</td></tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <SectionHeader title="تفاصيل معاملات الضريبة" subtitle="كل عملية ساهمت في الضريبة (مبيعات / مرتجعات / فواتير)" icon={<ListOrdered className="w-5 h-5 text-indigo-600" />} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr><th className="p-3">التاريخ</th><th className="p-3">المرجع</th><th className="p-3">الطرف</th><th className="p-3">الاتجاه</th><th className="p-3">قيمة الضريبة</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vatTransactions.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-slate-600">{t.date}</td>
                      <td className="p-3 font-mono font-bold text-indigo-700">{t.ref}</td>
                      <td className="p-3 text-slate-700">{t.party}</td>
                      <td className="p-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.dir === 'output' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{t.dir === 'output' ? 'خرج (مبيعات)' : 'دخل (مشتريات)'}</span></td>
                      <td className={`p-3 font-mono font-extrabold ${t.vat < 0 ? 'text-rose-700' : t.dir === 'output' ? 'text-indigo-700' : 'text-emerald-700'}`}>{t.vat < 0 ? `(${fmt(Math.abs(t.vat))})` : fmt(t.vat)}</td>
                    </tr>
                  ))}
                  {vatTransactions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">لا توجد معاملات ضريبية</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============ ADD JOURNAL ENTRY MODAL ============ */}
      <Modal open={entryModal} onClose={() => setEntryModal(false)} title="قيد يومية جديد" wide>
        <form onSubmit={submitEntry} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="التاريخ" required>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls} required />
            </Field>
            <Field label="البيان" required>
              <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)} className={inputCls} placeholder="مثال: قيد تعديل رصيد" required />
            </Field>
          </div>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_36px] gap-2 px-3 py-2 bg-slate-50 text-[10px] font-bold text-slate-500">
              <span>الحساب</span><span>مدين</span><span>دائن</span><span></span>
            </div>
            {fLines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_120px_120px_36px] gap-2 px-3 py-2 items-center">
                <select value={l.accountId} onChange={(e) => setLine(idx, { accountId: e.target.value })} className={inputCls}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
                </select>
                <input type="number" min="0" step="0.01" data-nav value={l.debit || ''} onChange={(e) => setLine(idx, { debit: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="مدين" />
                <input type="number" min="0" step="0.01" data-nav value={l.credit || ''} onChange={(e) => setLine(idx, { credit: parseFloat(e.target.value) || 0 })} onKeyDown={navOnEnter} className={inputCls} placeholder="دائن" />
                <button type="button" onClick={() => setFLines(fLines.filter((_, i) => i !== idx))} disabled={fLines.length <= 2} className="text-rose-500 hover:bg-rose-50 rounded-lg p-1 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Btn onClick={() => setFLines([...fLines, newLine])}><Plus className="w-3.5 h-3.5" /> سطر إضافي</Btn>
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-600">مدين: <span className="font-mono text-emerald-700">{fmt(fLines.reduce((s, l) => s + l.debit, 0))}</span></span>
              <span className="font-bold text-slate-600">دائن: <span className="font-mono text-rose-700">{fmt(fLines.reduce((s, l) => s + l.credit, 0))}</span></span>
              <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs">حفظ القيد</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ============ ADD ACCOUNT MODAL ============ */}
      <Modal open={accountModal} onClose={() => setAccountModal(false)} title="حساب جديد">
        <form onSubmit={submitAccount} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الكود" required>
              <input type="text" value={accCode} onChange={(e) => setAccCode(e.target.value)} className={inputCls} placeholder="مثال: 6001" required />
            </Field>
            <Field label="النوع" required>
              <select value={accType} onChange={(e) => setAccType(e.target.value as AccountType)} className={inputCls}>
                {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="اسم الحساب" required>
            <input type="text" value={accName} onChange={(e) => setAccName(e.target.value)} className={inputCls} placeholder="مثال: مصاريف النقل والتوصيل" required />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs">إضافة الحساب</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
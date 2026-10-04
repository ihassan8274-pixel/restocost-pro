import React, { useMemo, useState } from 'react';
import {
  Users, Clock, CreditCard, PieChart, TrendingUp, Building2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader } from '../ui';
import { fmtMoney, downloadCSV } from '../../utils/helpers';
import { renderProReport, type ProReportSpec, type ProTable } from '../../utils/pdf';
import { SharedReportCard, type ReportExhibit } from './SharedReportCard';

type Exhibit = ReportExhibit;

export const ERPHROperationsReportsView: React.FC = () => {
  const {
    employees, shifts, posOrders, branches, getBranchName, invoices,
    operatingExpenses, expenseBudgets, posReturns,
  } = useApp();

  const [branch, setBranch] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2600); };

  const branchFilter = (b: string) => branch === 'all' || b === branch;

  // ===================== تقرير تكلفة العمالة =====================
  const laborRows = useMemo(() => {
    const rows: { branch: string; emp: typeof employees[0]; shiftsCount: number; hours: number; overtime: number; cost: number }[] = [];
    const activeEmployees = employees.filter((e) => e.isActive && branchFilter(e.branchId));
    activeEmployees.forEach((emp) => {
      const empShifts = shifts.filter((s) => s.employeeId === emp.id && branchFilter(s.branchId));
      const hours = empShifts.reduce((sum, s) => sum + s.hoursWorked, 0);
      const overtime = empShifts.reduce((sum, s) => sum + s.overtimeHours, 0);
      const cost = empShifts.reduce((sum, s) => sum + s.totalShiftCost, 0);
      rows.push({ branch: emp.branchId, emp, shiftsCount: empShifts.length, hours, overtime, cost });
    });
    return rows.sort((a, b) => b.cost - a.cost);
  }, [employees, shifts, branch]);

  // ===================== تحليل الورديات =====================
  const shiftRows = useMemo(() => {
    const rows: { branch: string; date: string; employee: string; hours: number; overtime: number; cost: number; orders: number }[] = [];
    shifts.filter((s) => branchFilter(s.branchId)).forEach((s) => {
      rows.push({ branch: s.branchId, date: s.date, employee: s.employeeName, hours: s.hoursWorked, overtime: s.overtimeHours, cost: s.totalShiftCost, orders: s.ordersHandled });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [shifts, branch]);

  // ===================== المبيعات حسب القناة =====================
  const channelRows = useMemo(() => {
    const map = new Map<string, { branch: string; channel: string; count: number; revenue: number; cost: number; avgTicket: number }>();
    posOrders.filter((o) => branchFilter(o.branchId)).forEach((o) => {
      const key = o.branchId + '|' + o.orderType;
      const e = map.get(key) || { branch: o.branchId, channel: o.orderType, count: 0, revenue: 0, cost: 0, avgTicket: 0 };
      e.count += 1; e.revenue += o.totalAmount; e.cost += o.totalCost;
      map.set(key, e);
    });
    return Array.from(map.values())
      .map((r) => ({ ...r, avgTicket: r.count > 0 ? r.revenue / r.count : 0, profit: r.revenue - r.cost, marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [posOrders, branch]);

  // ===================== Sales Mix (منتجات) =====================
  const mixRows = useMemo(() => {
    const map = new Map<string, { branch: string; recipeId: string; name: string; qty: number; revenue: number; cost: number; count: number }>();
    posOrders.filter((o) => branchFilter(o.branchId)).forEach((o) => {
      o.items.forEach((it) => {
        const key = o.branchId + '|' + it.recipeId;
        const e = map.get(key) || { branch: o.branchId, recipeId: it.recipeId, name: it.recipeName, qty: 0, revenue: 0, cost: 0, count: 0 };
        e.qty += it.quantity; e.revenue += it.lineTotal; e.cost += it.quantity * it.unitCost; e.count += 1;
        map.set(key, e);
      });
    });
    posReturns.filter((r) => branchFilter(r.branchId)).forEach((r) => {
      r.items.forEach((it) => {
        const key = r.branchId + '|' + it.recipeId;
        const e = map.get(key);
        if (e) { e.qty -= it.quantity; e.revenue -= it.lineTotal; e.cost -= it.quantity * it.unitCost; e.count = Math.max(0, e.count - 1); }
      });
    });
    return Array.from(map.values())
      .filter((r) => r.qty > 0)
      .map((r) => ({ ...r, margin: r.revenue - r.cost, marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [posOrders, posReturns, branch]);

  // ===================== المصاريف التشغيلية =====================
  const expenseRows = useMemo(() => {
    const rows: { branch: string; category: string; period: string; budgeted: number; actual: number; variance: number }[] = [];
    const actualMap = new Map<string, { branch: string; category: string; period: string; actual: number }>();
    operatingExpenses.filter((e) => branchFilter(e.branchId) && e.paymentStatus === 'paid').forEach((e) => {
      const period = e.dueDate.slice(0, 7);
      const key = e.branchId + '|' + e.category + '|' + period;
      const a = actualMap.get(key) || { branch: e.branchId, category: e.category, period, actual: 0 };
      a.actual += e.amount; actualMap.set(key, a);
    });
    expenseBudgets.filter((b) => branchFilter(b.branchId)).forEach((bud) => {
      bud.items.forEach((it) => {
        const key = bud.branchId + '|' + it.category + '|' + bud.month;
        const a = actualMap.get(key) || { branch: bud.branchId, category: it.category, period: bud.month, actual: 0 };
        rows.push({ branch: bud.branchId, category: it.category, period: bud.month, budgeted: it.budgetedAmount, actual: a.actual, variance: a.actual - it.budgetedAmount });
      });
    });
    return rows.sort((a, b) => b.variance - a.variance);
  }, [operatingExpenses, expenseBudgets, branch]);

  // ===================== الفواتير (AR/AP) ملخص =====================
  const invoiceRows = useMemo(() => {
    const salesInv = invoices.filter((iv) => iv.type === 'sales' && branchFilter(iv.branchId));
    const purInv = invoices.filter((iv) => iv.type === 'purchase' && branchFilter(iv.branchId));
    return {
      salesCount: salesInv.length,
      salesTotal: salesInv.reduce((s, iv) => s + iv.totalAmount, 0),
      salesPaid: salesInv.reduce((s, iv) => s + iv.paidAmount, 0),
      salesOutstanding: salesInv.reduce((s, iv) => s + iv.totalAmount - iv.paidAmount, 0),
      purCount: purInv.length,
      purTotal: purInv.reduce((s, iv) => s + iv.totalAmount, 0),
      purPaid: purInv.reduce((s, iv) => s + iv.paidAmount, 0),
      purOutstanding: purInv.reduce((s, iv) => s + iv.totalAmount - iv.paidAmount, 0),
    };
  }, [invoices, branch]);

  const toProSpec = (title: string, tables: ProTable[], kpis?: { label: string; value: string }[], subtitle?: string): ProReportSpec => ({
    title,
    subtitle,
    orientation: tables.some((t) => t.columns.length >= 9) ? 'landscape' : 'portrait',
    meta: { 'الفرع / مركز التكلفة': branch === 'all' ? 'كل الفروع' : getBranchName(branch), 'تاريخ الإصدار': new Date().toLocaleDateString('ar-SA-u-nu-latn') },
    summaryKpis: kpis,
    tables,
    footer: 'تقارير الموارد البشرية والعمليات — RestoCost ERP Pro',
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

  const exhibits: Exhibit[] = [
    {
      id: 'labor_cost', icon: <Users className="w-5 h-5 text-indigo-500" />,
      title: 'تكلفة العمالة (Labor Cost)', subtitle: 'إجمالي ساعات العمل، الإضافي، والتكلفة لكل موظف',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'empCode', label: 'كود الموظف' }, { key: 'empName', label: 'اسم الموظف' }, { key: 'role', label: 'الدور' },
        { key: 'shiftsCount', label: 'عدد الورديات', type: 'num' }, { key: 'hours', label: 'الساعات', type: 'num' }, { key: 'overtime', label: 'الإضافي', type: 'num' }, { key: 'cost', label: 'التكلفة', type: 'money' },
      ],
      rows: laborRows.map((r) => ({ branch: getBranchName(r.branch), empCode: r.emp.code, empName: r.emp.name, role: r.emp.role, shiftsCount: r.shiftsCount, hours: r.hours, overtime: r.overtime, cost: r.cost })),
      csvHeader: ['الفرع', 'كود الموظف', 'اسم الموظف', 'الدور', 'عدد الورديات', 'الساعات', 'الإضافي', 'التكلفة'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'كود الموظف' }, { title: 'اسم الموظف' }, { title: 'الدور' }, { title: 'عدد الورديات', type: 'num' }, { title: 'الساعات', type: 'num' }, { title: 'الإضافي', type: 'num' }, { title: 'التكلفة', type: 'money' }],
          rows: laborRows.map((r) => [getBranchName(r.branch), r.emp.code, r.emp.name, r.emp.role, r.shiftsCount, r.hours, r.overtime, r.cost]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', '', laborRows.reduce((s, r) => s + r.shiftsCount, 0), laborRows.reduce((s, r) => s + r.hours, 0), laborRows.reduce((s, r) => s + r.overtime, 0), laborRows.reduce((s, r) => s + r.cost, 0)];
        return toProSpec('تكلفة العمالة', [pro], [{ label: 'إجمالي الموظفين', value: String(laborRows.length) }, { label: 'إجمالي تكلفة العمالة', value: fmtMoney(laborRows.reduce((s, r) => s + r.cost, 0)) }]);
      },
    },
    {
      id: 'shifts', icon: <Clock className="w-5 h-5 text-sky-500" />,
      title: 'سجل الورديات (Shift Details)', subtitle: 'تفاصيل كل وردية: ساعات، إضافي، تكلفة، وعدد الطلبات',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'date', label: 'التاريخ', type: 'date' }, { key: 'employee', label: 'الموظف' },
        { key: 'hours', label: 'الساعات', type: 'num' }, { key: 'overtime', label: 'الإضافي', type: 'num' }, { key: 'cost', label: 'التكلفة', type: 'money' }, { key: 'orders', label: 'الطلبات', type: 'num' },
      ],
      rows: shiftRows.map((r) => ({ branch: getBranchName(r.branch), date: r.date, employee: r.employee, hours: r.hours, overtime: r.overtime, cost: r.cost, orders: r.orders })),
      csvHeader: ['الفرع', 'التاريخ', 'الموظف', 'الساعات', 'الإضافي', 'التكلفة', 'الطلبات'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'التاريخ', type: 'date' }, { title: 'الموظف' }, { title: 'الساعات', type: 'num' }, { title: 'الإضافي', type: 'num' }, { title: 'التكلفة', type: 'money' }, { title: 'الطلبات', type: 'num' }],
          rows: shiftRows.map((r) => [getBranchName(r.branch), r.date, r.employee, r.hours, r.overtime, r.cost, r.orders]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', shiftRows.reduce((s, r) => s + r.hours, 0), shiftRows.reduce((s, r) => s + r.overtime, 0), shiftRows.reduce((s, r) => s + r.cost, 0), shiftRows.reduce((s, r) => s + r.orders, 0)];
        return toProSpec('سجل الورديات', [pro], [{ label: 'إجمالي الورديات', value: String(shiftRows.length) }, { label: 'إجمالي التكلفة', value: fmtMoney(shiftRows.reduce((s, r) => s + r.cost, 0)) }]);
      },
    },
    {
      id: 'channels', icon: <PieChart className="w-5 h-5 text-violet-500" />,
      title: 'المبيعات حسب القناة (Sales by Channel)', subtitle: 'dine_in / takeaway / delivery_app — عدد الطلبات، الإيرادات، التكلفة، الهامش',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'channel', label: 'القناة' }, { key: 'count', label: 'عدد الطلبات', type: 'num' }, { key: 'revenue', label: 'الإيرادات', type: 'money' }, { key: 'cost', label: 'التكلفة', type: 'money' }, { key: 'avgTicket', label: 'متوسط الفاتورة', type: 'money' }, { key: 'profit', label: 'الربح', type: 'money' }, { key: 'marginPct', label: 'الهامش %', type: 'pct' },
      ],
      rows: channelRows.map((r) => ({ branch: getBranchName(r.branch), channel: r.channel === 'dine_in' ? 'تناول في المطعم' : r.channel === 'takeaway' ? 'استلام' : 'توصيل', count: r.count, revenue: r.revenue, cost: r.cost, avgTicket: r.avgTicket, profit: r.profit, marginPct: r.marginPct })),
      csvHeader: ['الفرع', 'القناة', 'عدد الطلبات', 'الإيرادات', 'التكلفة', 'متوسط الفاتورة', 'الربح', 'الهامش %'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'القناة' }, { title: 'عدد الطلبات', type: 'num' }, { title: 'الإيرادات', type: 'money' }, { title: 'التكلفة', type: 'money' }, { title: 'متوسط الفاتورة', type: 'money' }, { title: 'الربح', type: 'money' }, { title: 'الهامش %', type: 'pct' }],
          rows: channelRows.map((r) => [getBranchName(r.branch), r.channel === 'dine_in' ? 'تناول في المطعم' : r.channel === 'takeaway' ? 'استلام' : 'توصيل', r.count, r.revenue, r.cost, r.avgTicket, r.profit, r.marginPct]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', channelRows.reduce((s, r) => s + r.count, 0), channelRows.reduce((s, r) => s + r.revenue, 0), channelRows.reduce((s, r) => s + r.cost, 0), '', channelRows.reduce((s, r) => s + r.profit, 0), ''];
        return toProSpec('المبيعات حسب القناة', [pro], [{ label: 'إجمالي الطلبات', value: String(channelRows.reduce((s, r) => s + r.count, 0)) }, { label: 'إجمالي الإيرادات', value: fmtMoney(channelRows.reduce((s, r) => s + r.revenue, 0)) }]);
      },
    },
    {
      id: 'sales_mix', icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
      title: 'Sales Mix (مزيج المبيعات)', subtitle: 'كمية، إيرادات، تكلفة، وهامش لكل صنف مباع',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'name', label: 'الصنف' }, { key: 'qty', label: 'الكمية المباعة', type: 'num' }, { key: 'revenue', label: 'الإيرادات', type: 'money' }, { key: 'cost', label: 'التكلفة', type: 'money' }, { key: 'margin', label: 'الربح', type: 'money' }, { key: 'marginPct', label: 'الهامش %', type: 'pct' },
      ],
      rows: mixRows.slice(0, 100).map((r) => ({ branch: getBranchName(r.branch), name: r.name, qty: r.qty, revenue: r.revenue, cost: r.cost, margin: r.margin, marginPct: r.marginPct })),
      csvHeader: ['الفرع', 'الصنف', 'الكمية المباعة', 'الإيرادات', 'التكلفة', 'الربح', 'الهامش %'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'الصنف' }, { title: 'الكمية المباعة', type: 'num' }, { title: 'الإيرادات', type: 'money' }, { title: 'التكلفة', type: 'money' }, { title: 'الربح', type: 'money' }, { title: 'الهامش %', type: 'pct' }],
          rows: mixRows.slice(0, 100).map((r) => [getBranchName(r.branch), r.name, r.qty, r.revenue, r.cost, r.margin, r.marginPct]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', mixRows.reduce((s, r) => s + r.qty, 0), mixRows.reduce((s, r) => s + r.revenue, 0), mixRows.reduce((s, r) => s + r.cost, 0), mixRows.reduce((s, r) => s + r.margin, 0), ''];
        return toProSpec('Sales Mix', [pro], [{ label: 'أصناف فريدة', value: String(mixRows.length) }, { label: 'إجمالي الإيرادات', value: fmtMoney(mixRows.reduce((s, r) => s + r.revenue, 0)) }]);
      },
    },
    {
      id: 'expenses', icon: <CreditCard className="w-5 h-5 text-rose-500" />,
      title: 'تحليل المصاريف التشغيلية vs الميزانية', subtitle: 'ميزاني vs فعلي لكل فئة مصاريف وشهر',
      columns: [
        { key: 'branch', label: 'الفرع' }, { key: 'category', label: 'فئة المصاريف' }, { key: 'period', label: 'الفترة' },
        { key: 'budgeted', label: 'الميزاني', type: 'money' }, { key: 'actual', label: 'الفعلي', type: 'money' }, { key: 'variance', label: 'الانحراف', type: 'money' },
      ],
      rows: expenseRows.map((r) => ({ branch: getBranchName(r.branch), category: r.category, period: r.period, budgeted: r.budgeted, actual: r.actual, variance: r.variance })),
      csvHeader: ['الفرع', 'فئة المصاريف', 'الفترة', 'الميزاني', 'الفعلي', 'الانحراف'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'الفرع' }, { title: 'فئة المصاريف' }, { title: 'الفترة' }, { title: 'الميزاني', type: 'money' }, { title: 'الفعلي', type: 'money' }, { title: 'الانحراف', type: 'money' }],
          rows: expenseRows.map((r) => [getBranchName(r.branch), r.category, r.period, r.budgeted, r.actual, r.variance]),
        };
        pro.totalsLabel = 'الإجمالي';
        pro.totals = ['', '', '', expenseRows.reduce((s, r) => s + r.budgeted, 0), expenseRows.reduce((s, r) => s + r.actual, 0), expenseRows.reduce((s, r) => s + r.variance, 0)];
        return toProSpec('تحليل المصاريف vs الميزانية', [pro], [{ label: 'إجمالي الانحراف', value: fmtMoney(expenseRows.reduce((s, r) => s + r.variance, 0)) }]);
      },
    },
    {
      id: 'invoices_summary', icon: <Building2 className="w-5 h-5 text-amber-500" />,
      title: 'ملخص الفواتير (AR/AP)', subtitle: 'إجمالي فواتير المبيعات والمشتريات، المحصل، والمستحق',
      columns: [
        { key: 'metric', label: 'المؤشر' }, { key: 'value', label: 'القيمة', type: 'money' },
      ],
      rows: [
        { metric: 'فواتير المبيعات (عدد)', value: invoiceRows.salesCount },
        { metric: 'إجمالي المبيعات', value: invoiceRows.salesTotal },
        { metric: 'المحصل من المبيعات', value: invoiceRows.salesPaid },
        { metric: 'مستحقات العملاء (AR)', value: invoiceRows.salesOutstanding },
        { metric: '', value: '' },
        { metric: 'فواتير المشتريات (عدد)', value: invoiceRows.purCount },
        { metric: 'إجمالي المشتريات', value: invoiceRows.purTotal },
        { metric: 'المدفوع للمشتريات', value: invoiceRows.purPaid },
        { metric: 'مستحقات الموردين (AP)', value: invoiceRows.purOutstanding },
      ],
      csvHeader: ['المؤشر', 'القيمة'],
      spec: () => {
        const pro: ProTable = {
          columns: [{ title: 'المؤشر' }, { title: 'القيمة', type: 'money' }],
          rows: [
            ['فواتير المبيعات (عدد)', invoiceRows.salesCount],
            ['إجمالي المبيعات', invoiceRows.salesTotal],
            ['المحصل من المبيعات', invoiceRows.salesPaid],
            ['مستحقات العملاء (AR)', invoiceRows.salesOutstanding],
            ['', ''],
            ['فواتير المشتريات (عدد)', invoiceRows.purCount],
            ['إجمالي المشتريات', invoiceRows.purTotal],
            ['المدفوع للمشتريات', invoiceRows.purPaid],
            ['مستحقات الموردين (AP)', invoiceRows.purOutstanding],
          ],
        };
        return toProSpec('ملخص الفواتير (AR/AP)', [pro], [{ label: 'صافي التدفق (AR - AP)', value: fmtMoney(invoiceRows.salesOutstanding - invoiceRows.purOutstanding) }]);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقارير الموارد البشرية والعمليات"
        subtitle="تكلفة العمالة، سجل الورديات، المبيعات حسب القناة، Sales Mix، تحليل المصاريف vs الميزانية، ملخص الفواتير — مع تصدير PDF احترافي و CSV"
        icon={<Users className="w-6 h-6 text-indigo-600" />}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">الفرع:</span>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-800 !w-56">
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
            ex={{ ...ex, printMeta: [['الفرع', branch === 'all' ? 'كل الفروع' : getBranchName(branch)]], printFooter: 'تقارير الموارد البشرية والعمليات — RestoCost ERP Pro' }}
            busy={busy}
            onDownload={download}
            onCsv={csv}
          />
        ))}
      </div>
    </div>
  );
};
import React, { useMemo, useState } from 'react';
import { MessageSquare, Phone, Mail, Copy, Check, AlertTriangle, ShoppingCart, FileText, CalendarCheck, PackageSearch, Send } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, SectionHeader, StatCard } from '../ui';
import { waLink, mailLink, copyText, poMessage, overdueInvoiceMessage, reservationMessage, lowStockMessage } from '../../utils/messages';

type Tab = 'po' | 'overdue' | 'reservations' | 'lowstock';

interface MsgRow {
  id: string;
  recipientName: string;
  phone?: string;
  email?: string;
  message: string;
  subject: string;
  kind: string;
}

const ActionButtons: React.FC<{ row: MsgRow; copiedId: string | null; onCopy: (id: string, text: string) => void }> = ({ row, copiedId, onCopy }) => (
  <div className="flex flex-wrap gap-1.5">
    {row.phone ? (
      <a href={waLink(row.phone, row.message)} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
        <Phone className="w-3 h-3" /> واتساب
      </a>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
        <AlertTriangle className="w-3 h-3" /> لا يوجد رقم
      </span>
    )}
    {row.email ? (
      <a href={mailLink(row.email, row.subject, row.message)} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
        <Mail className="w-3 h-3" /> بريد
      </a>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
        <AlertTriangle className="w-3 h-3" /> لا يوجد بريد
      </span>
    )}
    <button onClick={() => onCopy(row.id, row.message)}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
      {copiedId === row.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copiedId === row.id ? 'تم النسخ' : 'نسخ'}
    </button>
  </div>
);

export const MessagesCenterView: React.FC = () => {
  const {
    purchaseOrders, invoices, reservations, rawMaterials, inventory, suppliers, customers,
    getBranchName, getStockLevelsFor,
  } = useApp();
  const [tab, setTab] = useState<Tab>('po');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    copyText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const rows = useMemo<Record<Tab, MsgRow[]>>(() => {
    const poRows: MsgRow[] = purchaseOrders
      .filter((p) => ['submitted', 'approved', 'partially_received'].includes(p.status))
      .map((p) => {
        const supplier = suppliers.find((s) => s.id === p.supplierId);
        const msg = poMessage(
          p.supplierName, p.poNumber, p.orderDate, p.expectedDate,
          p.items.map((i) => ({ name: i.materialName, qty: i.purchaseQty || i.quantity, unit: i.purchaseUnit || i.unit })),
          p.totalAmount,
        );
        return { id: `po-${p.id}`, recipientName: p.supplierName, phone: supplier?.phone, email: supplier?.email, message: msg, subject: `تأكيد طلب شراء ${p.poNumber}`, kind: `أمر شراء ${p.poNumber}` };
      });

    const overdueRows: MsgRow[] = invoices
      .filter((i) => i.type === 'sales' && i.status === 'overdue')
      .map((i) => {
        const customer = customers.find((c) => c.id === i.partyId);
        const days = Math.max(1, Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000));
        const msg = overdueInvoiceMessage(i.partyName, i.invoiceNumber, i.totalAmount, i.dueDate, days);
        return { id: `inv-${i.id}`, recipientName: i.partyName, phone: customer?.phone, email: customer?.email, message: msg, subject: `تذكير بسداد فاتورة ${i.invoiceNumber}`, kind: `فاتورة ${i.invoiceNumber} متأخرة ${days} يوم` };
      });

    const resRows: MsgRow[] = reservations
      .filter((r) => (r.status === 'pending' || r.status === 'confirmed') && r.date >= todayStr)
      .slice(0, 100)
      .map((r) => {
        const customer = r.customerId ? customers.find((c) => c.id === r.customerId) : undefined;
        const msg = reservationMessage(r.customerName, r.reservationNumber, r.date, r.time, r.guests, getBranchName(r.branchId));
        return { id: `res-${r.id}`, recipientName: r.customerName, phone: customer?.phone || r.phone, email: customer?.email, message: msg, subject: `تأكيد حجز ${r.reservationNumber}`, kind: `حجز ${r.reservationNumber} — ${r.date} ${r.time}` };
      });

    const lowStock: { supplierId: string; name: string; items: { name: string; qty: number; unit: string }[] }[] = [];
    // نقص المخزون حسب حدود كل فرع الفعلية (المخصصة أو الافتراضي العام)
    const needByMat = new Map<string, number>();
    inventory.forEach((i) => {
      const mat = rawMaterials.find((m) => m.id === i.rawMaterialId);
      if (!mat || !mat.isActive || !mat.supplierId) return;
      const lv = getStockLevelsFor(mat.id, i.branchId);
      const triggered = lv.alwaysOrderFullMax || (lv.minStockLevel > 0 && i.quantity <= lv.minStockLevel);
      if (!triggered) return;
      const need = lv.alwaysOrderFullMax ? Math.max(0, lv.maxStockLevel) : Math.max(0, Math.ceil(lv.maxStockLevel - i.quantity));
      if (need <= 0) return;
      needByMat.set(i.rawMaterialId, (needByMat.get(i.rawMaterialId) || 0) + need);
    });
    needByMat.forEach((need, matId) => {
      const mat = rawMaterials.find((m) => m.id === matId);
      if (!mat || !mat.supplierId) return;
      const g = lowStock.find((x) => x.supplierId === mat.supplierId);
      const entry = { name: mat.nameAr, qty: need, unit: mat.unit };
      if (g) g.items.push(entry);
      else lowStock.push({ supplierId: mat.supplierId, name: suppliers.find((s) => s.id === mat.supplierId)?.name || mat.supplierId, items: [entry] });
    });
    const lowRows: MsgRow[] = lowStock.map((g, idx) => {
      const sup = suppliers.find((s) => s.id === g.supplierId);
      const msg = lowStockMessage(g.name, g.items);
      return { id: `low-${idx}`, recipientName: g.name, phone: sup?.phone, email: sup?.email, message: msg, subject: 'طلبات تجديد مخزون', kind: `${g.items.length} صنف تحت الحد الأدنى` };
    });

    return { po: poRows, overdue: overdueRows, reservations: resRows, lowstock: lowRows };
  }, [purchaseOrders, invoices, reservations, inventory, rawMaterials, suppliers, customers, getBranchName, getStockLevelsFor, todayStr]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'po', label: 'أوامر الشراء (للموردين)', icon: <ShoppingCart className="w-4 h-4" />, count: rows.po.length },
    { id: 'overdue', label: 'فواتير متأخرة (لعملاء)', icon: <FileText className="w-4 h-4" />, count: rows.overdue.length },
    { id: 'reservations', label: 'حجوزات قادمة (لعملاء)', icon: <CalendarCheck className="w-4 h-4" />, count: rows.reservations.length },
    { id: 'lowstock', label: 'نقص مخزون (للموردين)', icon: <PackageSearch className="w-4 h-4" />, count: rows.lowstock.length },
  ];
  const activeRows = rows[tab];
  const totalCount = tabs.reduce((s, t) => s + t.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="مركز الرسائل التلقائية" subtitle="رسائل جاهزة للموردين والعملاء تُرسل عبر واتساب أو البريد أو النسخ — تعمل على الهاتف مباشرة" icon={<MessageSquare className="w-5 h-5" />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="رسائل جاهزة" value={`${totalCount}`} sub="إجمالي الرسائل المجهزة" tone="indigo" icon={<Send className="w-4 h-4 text-indigo-500" />} />
        <StatCard label="للموردين" value={`${rows.po.length + rows.lowstock.length}`} sub="أوامر شراء + تجديد مخزون" tone="emerald" icon={<ShoppingCart className="w-4 h-4 text-emerald-500" />} />
        <StatCard label="للعملاء" value={`${rows.overdue.length + rows.reservations.length}`} sub="متأخرات + حجوزات" tone="amber" icon={<FileText className="w-4 h-4 text-amber-500" />} />
        <StatCard label="بدون وسيلة تواصل" value={`${activeRows.filter((r) => !r.phone && !r.email).length}`} sub="في العرض الحالي" tone="rose" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors ${tab === t.id ? 'bg-amber-400 text-amber-950 border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            {t.icon} {t.label}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${tab === t.id ? 'bg-amber-950/15' : 'bg-slate-100'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <SectionHeader title={tabs.find((t) => t.id === tab)?.label || ''} subtitle="اضغط واتساب لفتح المحادثة مباشرة، أو بريد لفتح التطبيق، أو نسخ لإرسالها في أي وسيلة" icon={<Send className="w-4 h-4 text-amber-600" />} />
        </div>
        <div className="divide-y divide-slate-100">
          {activeRows.length === 0 && (
            <div className="p-10 text-center text-slate-400 font-bold text-sm">لا توجد رسائل في هذه المجموعة حالياً</div>
          )}
          {activeRows.map((row) => (
            <div key={row.id} className="p-4 flex flex-col lg:flex-row lg:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-slate-900 text-sm">{row.recipientName}</span>
                  <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{row.kind}</span>
                  <span className="text-[10px] font-mono text-slate-400 dir-ltr" dir="ltr">{row.phone || '—'} · {row.email || '—'}</span>
                </div>
                <pre className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap font-sans" dir="rtl">{row.message}</pre>
              </div>
              <div className="shrink-0 flex flex-row lg:flex-col items-start gap-1.5">
                <ActionButtons row={row} copiedId={copiedId} onCopy={handleCopy} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
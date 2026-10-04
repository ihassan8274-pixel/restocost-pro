import React, { useMemo, useState } from 'react';
import { BadgeCheck, PackageCheck, CalendarClock, Scale, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, downloadCSV } from '../../utils/helpers';
import type { PurchaseOrder } from '../../types';

interface SupplierScore {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  rating: number;
  grnCount: number;
  poCount: number;
  totalAmount: number;
  quality: number | null;
  onTime: number | null;
  accuracy: number | null;
  priceDev: number | null;
  score: number;
  grade: string;
  gradeTone: string;
}

const gradeOf = (score: number): { grade: string; tone: string } => {
  if (score >= 85) return { grade: 'ممتاز', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (score >= 70) return { grade: 'جيد', tone: 'bg-sky-100 text-sky-700 border-sky-200' };
  if (score >= 55) return { grade: 'متوسط', tone: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { grade: 'ضعيف', tone: 'bg-rose-100 text-rose-700 border-rose-200' };
};

export const SupplierScorecardView: React.FC = () => {
  const { suppliers, grnNotes, purchaseOrders } = useApp();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const inDate = (d: string) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const rows = useMemo<SupplierScore[]>(() => {
    const poById = new Map<string, PurchaseOrder>();
    const poByNumber = new Map<string, PurchaseOrder>();
    purchaseOrders.forEach((po) => { poById.set(po.id, po); poByNumber.set(po.poNumber, po); });

    const map: Record<string, SupplierScore> = {};
    suppliers.forEach((s) => {
      map[s.id] = {
        id: s.id, name: s.name, contactPerson: s.contactPerson, phone: s.phone, rating: s.rating,
        grnCount: 0, poCount: 0, totalAmount: 0, quality: null, onTime: null, accuracy: null, priceDev: null, score: 0, grade: '', gradeTone: '',
      };
    });

    const acc: Record<string, { qPass: number; qTotal: number; onTime: number; deliver: number; accSum: number; accCount: number; devSum: number; devCount: number }> = {};
    const initAcc = (id: string) => { if (!acc[id]) acc[id] = { qPass: 0, qTotal: 0, onTime: 0, deliver: 0, accSum: 0, accCount: 0, devSum: 0, devCount: 0 }; };

    grnNotes.forEach((g) => {
      if (!inDate(g.date)) return;
      const row = map[g.supplierId];
      if (!row) return;
      row.grnCount += 1;
      row.totalAmount += g.totalAmount;
      initAcc(g.supplierId);
      const po = (g.purchaseOrderId && poById.get(g.purchaseOrderId)) || (g.poNumber && poByNumber.get(g.poNumber)) || null;
      if (po) {
        acc[g.supplierId].deliver += 1;
        if (g.date <= po.expectedDate) acc[g.supplierId].onTime += 1;
      }
      g.items.forEach((i) => {
        acc[g.supplierId].qTotal += 1;
        if (i.qualityPassed) acc[g.supplierId].qPass += 1;
        if (!po) return;
        const poItem = po.items.find((x) => x.rawMaterialId === i.rawMaterialId);
        if (!poItem || poItem.quantity <= 0) return;
        acc[g.supplierId].accSum += Math.max(0, 1 - Math.abs(i.quantityReceived - poItem.quantity) / poItem.quantity);
        acc[g.supplierId].accCount += 1;
        if (poItem.unitPrice > 0) {
          acc[g.supplierId].devSum += (i.unitPrice - poItem.unitPrice) / poItem.unitPrice;
          acc[g.supplierId].devCount += 1;
        }
      });
    });

    purchaseOrders.forEach((po) => {
      if (!inDate(po.orderDate)) return;
      const row = map[po.supplierId];
      if (row) row.poCount += 1;
    });

    const result = Object.values(map).map((r) => {
      const a = acc[r.id];
      if (a && a.qTotal > 0) r.quality = (a.qPass / a.qTotal) * 100;
      if (a && a.deliver > 0) r.onTime = (a.onTime / a.deliver) * 100;
      if (a && a.accCount > 0) r.accuracy = (a.accSum / a.accCount) * 100;
      if (a && a.devCount > 0) r.priceDev = (a.devSum / a.devCount) * 100;
      let score = 0;
      if (r.grnCount === 0) {
        score = (r.rating / 5) * 100;
      } else {
        const parts: [number, number][] = [
          [r.quality ?? 0, 30],
          [r.onTime ?? 0, 25],
          [r.accuracy ?? 0, 25],
          [r.priceDev === null ? 50 : Math.max(0, 100 - Math.max(0, r.priceDev) * 100), 20],
        ];
        score = parts.reduce((s, [v, w]) => s + v * w, 0) / 100;
      }
      const g = gradeOf(score);
      r.score = Math.round(score);
      r.grade = g.grade;
      r.gradeTone = g.tone;
      return r;
    });

    return result.sort((a, b) => b.score - a.score || b.totalAmount - a.totalAmount);
  }, [suppliers, grnNotes, purchaseOrders, fromDate, toDate]);

  const avg = (fn: (r: SupplierScore) => number | null) => {
    const vals = rows.map(fn).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };

  const exportSheets = [
    { name: 'بطاقة أداء الموردين', header: ['المورد', 'جهة الاتصال', 'الجوال', 'عدد الاستلامات GRN', 'عدد أوامر الشراء', 'قيمة المشتريات', 'الجودة %', 'الالتزام بالمواعيد %', 'دقة الكميات %', 'انحراف الأسعار %', 'التقييم', 'التصنيف'], rows: rows.map((r) => [r.name, r.contactPerson, r.phone, r.grnCount, r.poCount, r.totalAmount, r.quality === null ? '' : r.quality.toFixed(2), r.onTime === null ? '' : r.onTime.toFixed(2), r.accuracy === null ? '' : r.accuracy.toFixed(2), r.priceDev === null ? '' : (r.priceDev * 100).toFixed(2), r.score, r.grade]) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="بطاقة أداء الموردين" subtitle="تقييم الموردين حسب الجودة، الالتزام بالمواعيد، دقة الكميات، وانحراف الأسعار عن أوامر الشراء" icon={<BadgeCheck className="w-6 h-6 text-emerald-600" />}
        actions={<>
          <ViewToolbar filename="أداء الموردين" sheets={exportSheets} />
          <Btn tone="ghost" onClick={() => downloadCSV('أداء_الموردين.csv', exportSheets[0].header, exportSheets[0].rows)}><PackageCheck className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <Card className="p-4 flex flex-wrap items-end gap-3 text-xs">
        <Field label="من تاريخ"><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} /></Field>
        <Field label="إلى تاريخ"><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} /></Field>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">الموردون المقيمون</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{rows.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي قيمة المشتريات</span><strong className="text-lg font-extrabold font-mono text-indigo-700 block mt-1">{fmt(rows.reduce((s, r) => s + r.totalAmount, 0))} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متوسط الجودة</span><strong className="text-lg font-extrabold font-mono text-emerald-700 block mt-1">{fmt(avg((r) => r.quality), 1)}%</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">متوسط الالتزام بالمواعيد</span><strong className="text-lg font-extrabold font-mono text-sky-700 block mt-1">{fmt(avg((r) => r.onTime), 1)}%</strong></div>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-slate-800 text-xs mb-3">تقييم الموردين — مرتب من الأعلى أداءً</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1000px]">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 text-[10px]">
                <th className="text-right p-2 font-bold">المورد</th>
                <th className="text-right p-2 font-bold">الاستلامات (GRN)</th>
                <th className="text-right p-2 font-bold">قيمة المشتريات</th>
                <th className="text-right p-2 font-bold text-emerald-700">الجودة</th>
                <th className="text-right p-2 font-bold text-sky-700">المواعيد</th>
                <th className="text-right p-2 font-bold text-indigo-700">دقة الكميات</th>
                <th className="text-right p-2 font-bold text-amber-700">انحراف الأسعار</th>
                <th className="text-right p-2 font-bold">التقييم</th>
                <th className="text-right p-2 font-bold">التصنيف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="p-2">
                    <p className="font-bold text-slate-800">{r.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{r.contactPerson} — {r.phone}</p>
                  </td>
                  <td className="tnum text-left p-2 text-slate-600">{r.grnCount} / {r.poCount} PO</td>
                  <td className="tnum text-left p-2 font-bold text-slate-700">{fmt(r.totalAmount)} ر.س</td>
                  <td className="tnum text-left p-2 font-bold text-emerald-700">{r.quality === null ? '—' : `${fmt(r.quality, 1)}%`}</td>
                  <td className="tnum text-left p-2 font-bold text-sky-700">{r.onTime === null ? '—' : `${fmt(r.onTime, 1)}%`}</td>
                  <td className="tnum text-left p-2 font-bold text-indigo-700">{r.accuracy === null ? '—' : `${fmt(r.accuracy, 1)}%`}</td>
                  <td className={`p-2 font-mono font-bold ${r.priceDev === null ? 'text-slate-400' : (r.priceDev || 0) > 0.001 ? 'text-rose-600' : 'text-emerald-700'}`}>{r.priceDev === null ? '—' : `${(r.priceDev! * 100).toFixed(2)}%`}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-indigo-500" style={{ width: `${r.score}%` }} /></div>
                      <span className="font-mono font-extrabold text-slate-800 text-xs">{r.score}</span>
                    </div>
                  </td>
                  <td className="p-2"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.gradeTone}`}>{r.grade}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا يوجد موردون</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 font-bold">
          <Scale className="w-3.5 h-3.5 text-amber-500" /> انحراف الأسعار يُحتسب (سعر الاستلام − سعر أمر الشراء) ÷ سعر أمر الشراء — سالب = أرخص
          <CalendarClock className="w-3.5 h-3.5 text-sky-500 mr-2" /> الالتزام بالمواعيد: الاستلام قبل أو في الموعد المتوقع لأمر الشراء
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 mr-2" /> التقييم: 30% جودة + 25% مواعيد + 25% دقة كميات + 20% أسعار
        </div>
      </Card>
    </div>
  );
};
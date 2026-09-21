import React, { useState } from 'react';
import { CalendarPlus, Check, X, Clock, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, Field, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { downloadCSV } from '../../utils/helpers';
import { ReservationStatus } from '../../types';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'قيد الانتظار', confirmed: 'مؤكد', seated: 'بالجلسة', completed: 'مكتمل', cancelled: 'ملغي', no_show: 'لم يحضر',
};

export const ReservationsView: React.FC = () => {
  const { reservations, visibleBranchIds, branches, addReservation, updateReservationStatus, deleteReservation, getBranchName } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ branchId: visibleBranchIds[0] || '', customerName: '', phone: '', guests: 2, date: new Date().toISOString().slice(0, 10), time: '20:00', tableNumber: '', specialRequest: '' });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName) return;
    addReservation({ ...form, status: 'pending', createdBy: 'المستخدم' });
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الحجوزات والطاولات" subtitle="إدارة الحجوزات، حالات الطاولات، ومتابعة الحضور" icon={<CalendarPlus className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="الحجوزات"
            sheets={[
              { name: 'الحجوزات', header: ['الرقم', 'العميل', 'الهاتف', 'الضيوف', 'التاريخ', 'الوقت', 'الطاولة', 'الفرع', 'الحالة', 'طلب خاص'], rows: reservations.map((r) => [r.reservationNumber, r.customerName, r.phone, r.guests, r.date, r.time, r.tableNumber || '', getBranchName(r.branchId), STATUS_LABELS[r.status], r.specialRequest || '']) },
              { name: 'الملخص', header: ['الحالة', 'العدد'], rows: (Object.keys(STATUS_LABELS) as ReservationStatus[]).map((s) => [STATUS_LABELS[s], reservations.filter((r) => r.status === s).length]) },
            ]}
          />
          <Btn tone="ghost" onClick={() => downloadCSV('Reservations.csv', ['الرقم', 'العميل', 'الهاتف', 'الضيوف', 'التاريخ', 'الوقت', 'الحالة'], reservations.map((r) => [r.reservationNumber, r.customerName, r.phone, r.guests, r.date, r.time, r.status]))}>تصدير CSV</Btn>
          <Btn onClick={() => setShowModal(true)}><CalendarPlus className="w-4 h-4" /> حجز جديد</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">حجوزات قادمة</span><strong className="text-lg font-extrabold text-indigo-700 block mt-1">{reservations.filter((r) => r.status === 'confirmed').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">في الانتظار</span><strong className="text-lg font-extrabold text-amber-600 block mt-1">{reservations.filter((r) => r.status === 'pending').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">بالجلسة الآن</span><strong className="text-lg font-extrabold text-emerald-700 block mt-1">{reservations.filter((r) => r.status === 'seated').length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">لم يحضروا</span><strong className="text-lg font-extrabold text-rose-700 block mt-1">{reservations.filter((r) => r.status === 'no_show').length}</strong></div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">الرقم</th><th className="p-3">العميل</th><th className="p-3">الهاتف</th><th className="p-3">الضيوف</th><th className="p-3">التاريخ / الوقت</th><th className="p-3">الطاولة</th><th className="p-3">الفرع</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservations.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono font-bold text-indigo-700">{r.reservationNumber}</td>
                  <td className="p-3 font-bold text-slate-900">{r.customerName}</td>
                  <td className="p-3 font-mono text-slate-600" dir="ltr">{r.phone}</td>
                  <td className="p-3 font-mono">{r.guests}</td>
                  <td className="p-3 font-mono text-slate-600"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{r.date} {r.time}</span></td>
                  <td className="p-3 text-slate-600">{r.tableNumber || '-'}</td>
                  <td className="p-3 text-slate-600">{getBranchName(r.branchId)}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{STATUS_LABELS[r.status]}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {r.status === 'pending' && <button onClick={() => updateReservationStatus(r.id, 'confirmed')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="تأكيد"><Check className="w-4 h-4" /></button>}
                      {r.status === 'confirmed' && <button onClick={() => updateReservationStatus(r.id, 'seated')} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="بالجلسة">بالجلسة</button>}
                      {(r.status === 'pending' || r.status === 'confirmed') && <button onClick={() => updateReservationStatus(r.id, 'cancelled')} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="إلغاء"><X className="w-4 h-4" /></button>}
                      {r.status === 'seated' && <button onClick={() => updateReservationStatus(r.id, 'completed')} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg" title="إكمال">مكتمل</button>}
                      <button onClick={() => {
                        if (!window.confirm(`حذف الحجز ${r.reservationNumber}؟ سيُحذف السجل نهائياً.`)) return;
                        deleteReservation(r.id);
                      }} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="حذف"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-500 font-bold">لا توجد حجوزات</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="حجز جديد">
        <form onSubmit={submit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Field label="الفرع"><select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputCls}>{branches.filter((b) => visibleBranchIds.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}</select></Field>
            <Field label="الضيوف"><input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: parseInt(e.target.value) || 1 })} className={inputCls} /></Field>
          </div>
          <Field label="اسم العميل" required><input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className={inputCls} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الهاتف"><input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} /></Field>
            <Field label="الطاولة"><input value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} className={inputCls} placeholder="مثال: T4" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="التاريخ"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
            <Field label="الوقت"><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="طلب خاص"><textarea value={form.specialRequest} onChange={(e) => setForm({ ...form, specialRequest: e.target.value })} rows={2} className={inputCls} /></Field>
          <div className="pt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">تأكيد الحجز</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
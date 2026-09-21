import React, { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, WifiOff, AlertTriangle, PackageSearch, Wallet, ArrowRightLeft, Trash2, Layers, ArrowLeftRight } from 'lucide-react';
import { Card, PageHeader, Btn, StatusPill } from '../ui';
import { fmtMoney } from '../../utils/helpers';

interface LivePayload {
  generatedAt: string;
  isBotServer: boolean;
  revenueToday: number;
  ordersToday: number;
  posOrdersToday: number;
  batchNetRevenue: number;
  transfersToday: number;
  wastageToday: number;
  inventoryValue: number;
  lowStockCount: number;
  lowStockQtyByMat: { materialId: string; quantity: number }[];
  openTransferCount: number;
  pairs: { id: string; total: number }[];
}

export const OwnerLiveView: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('rcerp_token');
    try {
      const res = await fetch('/api/live', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) { const d = await res.json(); setPayload(d); setOk(true); setError(''); }
      else { setOk(false); setError('الخادم غير متاح'); }
    } catch { setOk(false); setError('تعذر الاتصال بالخادم'); }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Activity className="w-5 h-5 text-emerald-600" />}
        title="لوحة المالك اللحظية (Live)"
        subtitle="أرقام مباشرة من الخادم تتحدث كل 5 ثوانٍ — للمالك والإدارة العليا"
        actions={<>
          <StatusPill status={ok === true ? 'approved' : ok === false ? 'rejected' : 'pending'} map={{ approved: 'مباشر الآن', rejected: 'غير متصل', pending: 'جاري الاتصال…' }} />
          <Btn tone="ghost" onClick={refresh}><RefreshCw className="w-4 h-4" /> تحديث</Btn>
        </>}
      />

      {error && ok === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
          <WifiOff className="w-4 h-4" /> {error} — تأكد من أن الخادم يعمل (`npm start` في مجلد server) وتحدّث يدوياً.
        </div>
      )}

      {payload && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-emerald-700"><Wallet className="w-4 h-4" /><span className="text-[10px] font-black">إيرادات اليوم</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{fmtMoney(payload.revenueToday)}</div>
              <div className="text-[9px] text-slate-400 font-bold mt-1">POS: {fmtMoney(payload.posOrdersToday)} + إجمالي: {fmtMoney(payload.batchNetRevenue)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-indigo-700"><Activity className="w-4 h-4" /><span className="text-[10px] font-black">طلبات اليوم</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{payload.ordersToday}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-amber-700"><ArrowRightLeft className="w-4 h-4" /><span className="text-[10px] font-black">تحويلات اليوم</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{payload.transfersToday}</div>
              <div className="text-[9px] text-slate-400 font-bold mt-1">{payload.openTransferCount} تحويل مفتوح بانتظار الموافقة</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-rose-700"><Trash2 className="w-4 h-4" /><span className="text-[10px] font-black">هوالك اليوم</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{fmtMoney(payload.wastageToday)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-700"><Layers className="w-4 h-4" /><span className="text-[10px] font-black">قيمة المخزون</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{fmtMoney(payload.inventoryValue)}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-rose-700"><AlertTriangle className="w-4 h-4" /><span className="text-[10px] font-black">مواد دون الحد الأدنى</span></div>
              <div className="mt-2 text-xl font-black text-slate-900">{payload.lowStockCount}</div>
              <div className="text-[9px] text-slate-400 font-bold mt-1">دون تغطية آمنة</div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(payload.lowStockQtyByMat || []).length > 0 && (
              <Card className="p-4">
                <h3 className="font-bold text-slate-800 text-xs mb-3">أكثر المواد انخفاضاً عن الحد الأدنى</h3>
                <div className="space-y-2">
                  {payload.lowStockQtyByMat.slice(0, 6).map((r) => (
                    <div key={r.materialId} className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <PackageSearch className="w-4 h-4 text-rose-600" />
                        <span className="font-black text-slate-800">{r.materialId}</span>
                      </div>
                      <span className="font-mono font-bold text-rose-600">ناقص {Math.abs(r.quantity)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 text-xs mb-3">آخر طلبات POS المسجلة <span className="text-[9px] text-slate-400">(أزواج اليوم)</span></h3>
              <div className="space-y-2">
                {(payload.pairs || []).slice(0, 6).map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-xs">
                    <span className="font-bold text-slate-600">{r.id}</span>
                    <span className="font-mono font-bold text-emerald-700">{fmtMoney(r.total)}</span>
                  </div>
                ))}
                {(!payload.pairs || payload.pairs.length === 0) && <p className="text-center text-slate-400 font-bold py-4 text-xs">لا توجد طلبات بعد</p>}
              </div>
            </Card>
          </div>

          <Card className="p-4 flex items-center justify-between">
            <span className="text-[9px] text-slate-400 font-bold">آخر تحديث: {payload.generatedAt} · من {payload.isBotServer ? 'خادم المعصوبي الحي' : 'الخادم'}</span>
            <Btn tone="ghost" onClick={() => onNavigate('dashboard')}>الذهاب للوحة التحكم <ArrowLeftRight className="w-4 h-4" /></Btn>
          </Card>
        </>
      )}

      {ok === null && <p className="text-center text-slate-400 font-bold py-10 text-xs">جارٍ تحميل البيانات اللحظية…</p>}
    </div>
  );
};
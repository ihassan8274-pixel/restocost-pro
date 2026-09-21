import React, { useEffect, useState, useCallback } from 'react';
import { Link2, Plus, Trash2, Send, Power, RefreshCw } from 'lucide-react';
import { Card, PageHeader, Btn, inputCls, Field, Modal, StatusPill } from '../ui';
import { useApp } from '../../context/AppContext';

interface WebhookStatus { consecutiveFailures?: number; lastStatus?: string; lastAt?: string; }
interface Webhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  status?: WebhookStatus;
}

const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: '*', label: 'كل الأحداث (*)' },
  { value: 'sales', label: 'المبيعات' },
  { value: 'purchase', label: 'المشتريات' },
  { value: 'inventory', label: 'المخزون' },
  { value: 'transfer', label: 'التحويلات' },
  { value: 'expense', label: 'المصروفات' },
  { value: 'wastage', label: 'الهوالك' },
];

export const WebhooksView: React.FC = () => {
  const { currentUser } = useApp();
  const [list, setList] = useState<Webhook[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(false);
  const [needAuth] = useState(() => !!localStorage.getItem('rcerp_token'));
  const [form, setForm] = useState({ id: '', name: '', url: '', secret: '', events: [] as string[] });
  const [msg, setMsg] = useState('');

  const headers = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('rcerp_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/webhooks', { headers: headers() });
    if (res.ok) { const d = await res.json(); setList(d.webhooks || []); setMsg(''); }
    else setMsg('تعذر التحميل من الخادم');
  }, [headers]);

  useEffect(() => { if (needAuth) load(); }, [needAuth, load]);

  const save = async () => {
    const one: Webhook = { id: form.id || `wh-${Date.now()}`, name: form.name, url: form.url.trim(), secret: form.secret, events: form.events, enabled: true };
    const next = form.id ? list.map((w) => (w.id === form.id ? one : w)) : [...list, one];
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ webhooks: next }),
    });
    if (res.ok) { const d = await res.json(); setList(next.slice(0, d.count)); setShowForm(false); setForm({ id: '', name: '', url: '', secret: '', events: [] }); load(); }
    else setMsg('فشل الحفظ على الخادم');
  };

  const toggle = (w: Webhook) => {
    const next = list.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x));
    fetch('/api/webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ webhooks: next }) }).then(() => setList(next));
  };

  const remove = (id: string) => {
    const next = list.filter((x) => x.id !== id);
    fetch('/api/webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ webhooks: next }) }).then(() => setList(next));
  };

  const testOne = async (w: Webhook) => {
    setTesting(true); setMsg('');
    const res = await fetch('/api/webhooks/test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers() }, body: JSON.stringify({ id: w.id, url: w.url, secret: w.secret }) });
    const d = await res.json().catch(() => ({ ok: false, error: 'استجابة غير صالحة' }));
    setMsg(d.ok ? `تم الإرسال الكشفي بنجاح (HTTP ${d.status})` : `فشل الاختبار: ${d.error || '—'}`);
    setTesting(false); load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Link2 className="w-5 h-5 text-indigo-600" />}
        title="ويب هوك الأحداث (Webhooks)"
        subtitle="إرسال أحداث النظام (مبيعات/مشتريات/مخزون/…) إلى أنظمة خارجية عبر HTTP — مُدار على الخادم ومحمي"
        actions={<>
          {currentUser?.role === 'admin' && <Btn onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> إضافة ويب هوك</Btn>}
          <Btn tone="ghost" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Btn>
        </>}
      />

      {!needAuth && <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-bold">يجب تسجيل الدخول لمشاهدة الإعدادات.</div>}
      {msg && <div className={`rounded-xl p-3 text-xs font-bold ${msg.includes('نجاح') ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>{msg}</div>}

      {list.length === 0 && needAuth && (
        <Card className="p-8 text-center">
          <Link2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-bold">لا توجد ويب هوك بعد — أضف نقطة نهاية خارجية لتلقي أحداث النظام لحظة حدوثها.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map((w) => {
          const failures = w.status?.consecutiveFailures || 0;
          return (
            <Card key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-800 text-sm">{w.name || 'ويب هوك بدون اسم'}</span>
                    <StatusPill status={failures >= 3 ? 'rejected' : failures > 0 ? 'pending' : 'approved'} map={{ rejected: 'متعطل', pending: `فشل ${failures}`, approved: 'يعمل' }} />
                  </div>
                  <div dir="ltr" className="text-left text-[10px] text-slate-500 font-mono mt-1 break-all">{w.url}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {w.events.map((e) => <span key={e} className="text-[9px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{e}</span>)}
                    {w.secret && <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono font-bold" dir="ltr">{w.secret}</span>}
                  </div>
                  {w.status?.lastAt && <div className="text-[9px] text-slate-400 font-bold mt-2">آخر فحص: {new Date(w.status.lastAt).toLocaleString()} · الحالة: <span dir="ltr">{w.status.lastStatus}</span></div>}
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => toggle(w)} title={w.enabled ? 'إيقاف' : 'تشغيل'} className={`p-2 rounded-lg ${w.enabled ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'}`}><Power className="w-4 h-4" /></button>
                  <button onClick={() => { setForm({ id: w.id, name: w.name, url: w.url, secret: '', events: w.events }); setShowForm(true); }} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
                  <button onClick={() => testOne(w)} disabled={testing} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="اختبار إرسال"><Send className="w-4 h-4" /></button>
                  <button onClick={() => remove(w.id)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {showForm && (
        <Modal open={showForm} title={form.id ? 'تعديل ويب هوك' : 'إضافة ويب هوك'} onClose={() => setShowForm(false)}>
          <div className="space-y-3 text-xs">
            <Field label="الاسم"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: نظام المحاسبة الخارجي" className={inputCls} /></Field>
            <Field label="رابط النهاية (URL)" required>
              <input dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://api.example.com/hooks/restocost" className={`${inputCls} text-left`} />
            </Field>
            <Field label="المفتاح السري (اختياري) — يُرسل في رأس X-RC-Webhook-Secret">
              <input dir="ltr" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="اتركه فارغاً لإبقاء المفتاح الحالي" className={`${inputCls} text-left`} />
            </Field>
            <Field label="الأحداث (Event)" required>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={form.events.includes(o.value)} onChange={() => setForm({ ...form, events: o.value === '*' ? ['*'] : form.events.includes(o.value) ? form.events.filter((x) => x !== o.value) : [...form.events.filter((x) => x !== '*'), o.value] })} className="accent-indigo-600" />
                    <span className="font-bold">{o.label}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Btn onClick={save} className="w-full">{form.id ? 'حفظ التعديل' : 'إضافة'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};
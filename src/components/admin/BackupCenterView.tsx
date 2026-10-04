import React, { useEffect, useState } from 'react';
import {
  DatabaseBackup, HardDriveDownload, HardDriveUpload, ArchiveRestore, Trash2, Loader2, Check,
  AlertTriangle, Settings2, Clock, History, Save, RefreshCw, FolderOpen, Tag, XCircle, ShieldCheck, Search,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, SectionHeader, StatCard } from '../ui';

interface BackupMeta {
  id: string;
  fileName: string;
  size: number;
  createdAt: string | null;
  createdBy: string | null;
  type: 'auto' | 'manual' | 'restore_point' | 'unknown';
  label: string;
  units: number;
  records: number;
}

interface BackupSettings {
  enabled: boolean;
  intervalHours: number;
  retention: number;
  verifyAfterBackup: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface VerifyLogEntry {
  backupFile: string;
  createdAt: string;
  allMatch: boolean;
  results: { key: string; status: string; backupRecords: number; liveRecords: number }[];
  verifiedAt: string;
  totalKeys: number;
  mismatchedKeys: number;
}

const TYPE_LABEL: Record<string, string> = {
  auto: 'تلقائي مجدول',
  manual: 'يدوي',
  restore_point: 'نقطة استعادة',
  unknown: 'غير محدد',
};
const TYPE_TONE: Record<string, string> = {
  auto: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  manual: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  restore_point: 'bg-amber-100 text-amber-700 border-amber-200',
  unknown: 'bg-slate-100 text-slate-600 border-slate-200',
};

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('ar-SA-u-nu-latn')} ${d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
};

export const BackupCenterView: React.FC = () => {
  const { can, currentUser } = useApp();
  const canManage = can('reset_system');

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [settings, setSettings] = useState<BackupSettings>({ enabled: true, intervalHours: 1, retention: 72, verifyAfterBackup: true, lastRunAt: null, nextRunAt: null });
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [backupDir, setBackupDir] = useState('');

  const [createLabel, setCreateLabel] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupMeta | null>(null);
  const [filePreview, setFilePreview] = useState<{ fileName: string; createdAt: string; createdBy?: string; counts: Record<string, number> } | null>(null);
  const [fileData, setFileData] = useState<unknown>(null);
  const [typedWord, setTypedWord] = useState('');
  const [verifyLog, setVerifyLog] = useState<VerifyLogEntry[]>([]);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyLogEntry | null>(null);

  const token = localStorage.getItem('rcerp_token');
  const headers = { Authorization: `Bearer ${token}` };

  const notify = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 4500);
  };

  const loadAll = async () => {
    try {
      const res = await fetch('/api/backups', { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل التحميل');
      setBackups(json.backups || []);
      setSettings(json.settings);
      setTotalSize(json.totalSize || 0);
      setBackupDir(json.dir || '');
      const vRes = await fetch('/api/backups/verify-log', { headers });
      const vJson = await vRes.json();
      if (vJson.ok) setVerifyLog(vJson.log || []);
    } catch (e) {
      notify(`تعذر تحميل النسخ: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/backups/settings', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل الحفظ');
      setSettings(json.settings);
      notify(settings.enabled ? 'تم حفظ الإعدادات — النسخ التلقائي مفعّل' : 'تم حفظ الإعدادات — النسخ التلقائي متوقف');
    } catch (e) {
      notify(`تعذر حفظ الإعدادات: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setBusy(false);
    }
  };

  const createNow = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: createLabel }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل الإنشاء');
      setCreateLabel('');
      notify('تم إنشاء النسخة الاحتياطية بنجاح');
      await loadAll();
    } catch (e) {
      notify(`تعذر إنشاء النسخة: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setBusy(false);
    }
  };

  const openBackupFolder = async () => {
    try {
      const res = await fetch('/api/backups/open-folder', { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل فتح المجلد');
      notify('تم فتح مجلد النسخ الاحتياطي في مستكشف الملفات');
    } catch (e) {
      notify(`تعذر فتح المجلد: ${e instanceof Error ? e.message : 'خطأ'}`);
    }
  };

  const verifyNow = async () => {
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/backups/verify-now', { method: 'POST', headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل التحقق');
      setVerifyResult(json.verification);
      if (json.verification.allMatch) notify('التحقق ناجح — جميع البيانات متطابقة مع النسخة الاحتياطية');
      else notify(`التحقق: تم اكتشاف ${json.verification.mismatchedKeys} عدم تطابق`);
      await loadAll();
    } catch (e) {
      notify(`تعذر التحقق: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setVerifyBusy(false);
    }
  };

  const download = async (b: BackupMeta) => {
    try {
      const res = await fetch(`/api/backups/${b.id}`, { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل التنزيل');
      const blob = new Blob([JSON.stringify(json.backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = b.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notify(`تم تنزيل النسخة: ${b.fileName}`);
    } catch (e) {
      notify(`تعذر التنزيل: ${e instanceof Error ? e.message : 'خطأ'}`);
    }
  };

  const doRestore = async () => {
    if (typedWord.trim() !== 'تأكيد' || !restoreTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/backups/${restoreTarget.id}/restore`, { method: 'POST', headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشلت الاستعادة');
      notify(`تمت الاستعادة (${json.restored} وحدة). سيتم إعادة تحميل النظام...`);
      setRestoreTarget(null);
      setTypedWord('');
      setTimeout(() => window.location.reload(), 1300);
    } catch (e) {
      notify(`تعذرت الاستعادة: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/backups/${deleteTarget.id}`, { method: 'DELETE', headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشل الحذف');
      notify('تم حذف النسخة');
      setDeleteTarget(null);
      await loadAll();
    } catch (e) {
      notify(`تعذر الحذف: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
          notify('ملف غير صالح: يجب أن يحتوي على مفتاح data يحتوي كامل البيانات.');
          return;
        }
        setFileData(obj);
        setFilePreview({
          fileName: file.name,
          createdAt: obj.createdAt || 'غير معروف',
          createdBy: obj.createdBy,
          counts: obj.counts || {},
        });
        setTypedWord('');
      } catch {
        notify('تعذر قراءة الملف: ليس ملف JSON صالحاً.');
      }
    };
    reader.readAsText(file, 'utf-8');
    const input = document.getElementById('restore-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const doRestoreFile = async () => {
    if (typedWord.trim() !== 'تأكيد' || !fileData) return;
    setBusy(true);
    try {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: fileData }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'فشلت الاستعادة');
      notify(`تمت استعادة ${json.restored} وحدة. سيتم إعادة تحميل النظام...`);
      setFilePreview(null);
      setFileData(null);
      setTypedWord('');
      setTimeout(() => window.location.reload(), 1300);
    } catch (e) {
      notify(`تعذرت الاستعادة: ${e instanceof Error ? e.message : 'خطأ'}`);
    } finally {
      setBusy(false);
    }
  };

  const lastBackup = backups.length ? backups[0] : null;
  const autoEnabled = settings.enabled;

  const resetWord = (cb: () => void) => () => { cb(); setTypedWord(''); };

  return (
    <div className="space-y-6">
      <PageHeader title="مركز النسخ الاحتياطي المتطور" subtitle="نسخ تلقائية مجدولة، سياسة احتفاظ، نقط استعادة تلقائية، وإدارة كاملة لإصدارات البيانات" icon={<DatabaseBackup className="w-6 h-6 text-emerald-600" />}
        actions={
          <>
            <Btn tone="success" onClick={createNow} disabled={!canManage || busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />} إنشاء نسخة الآن
            </Btn>
            <Btn onClick={openBackupFolder} disabled={busy}><FolderOpen className="w-4 h-4" /> فتح مجلد النسخ</Btn>
            <Btn onClick={() => { loadAll(); notify('تم تحديث القائمة'); }} disabled={busy}><RefreshCw className="w-4 h-4" /> تحديث</Btn>
          </>
        } />

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl p-3">{msg}</div>}

      {loading ? (
        <Card className="p-10 flex items-center justify-center text-slate-400 font-bold text-sm"><Loader2 className="w-5 h-5 animate-spin ml-2" /> جارٍ تحميل النسخ الاحتياطية...</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="النسخ المخزنة" value={String(backups.length)} tone="indigo" icon={<DatabaseBackup className="w-4 h-4 text-indigo-400" />} sub="آخرها محدّث تلقائياً" />
            <StatCard label="مساحة التخزين" value={fmtSize(totalSize)} tone="default" icon={<HardDriveDownload className="w-4 h-4 text-slate-400" />} sub={`${settings.retention} نسخة كحد أقصى`} />
            <StatCard label="آخر نسخة" value={fmtDate(lastBackup?.createdAt || null)} tone="emerald" icon={<Clock className="w-4 h-4 text-emerald-400" />} sub={lastBackup ? TYPE_LABEL[lastBackup.type] : 'لا توجد نسخ بعد'} />
            <StatCard label="النسخة التالية" value={autoEnabled ? fmtDate(settings.nextRunAt) : 'معطلة'} tone="amber" icon={<Clock className="w-4 h-4 text-amber-400" />} sub={autoEnabled ? `كل ${settings.intervalHours} ساعة` : 'فعّل النسخ التلقائي'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Settings */}
            <Card className="p-5">
              <SectionHeader title="إعدادات النسخ التلقائي" subtitle="جدولة إنشاء النسخ تلقائياً مع سياسة احتفاظ محددة" icon={<Settings2 className="w-5 h-5 text-indigo-600" />} />
              <div className="mt-4 space-y-4 text-xs">
                <label className={`flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-colors ${autoEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <p className="font-extrabold text-slate-800">{autoEnabled ? 'النسخ التلقائي مفعّل' : 'النسخ التلقائي متوقف'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">يُنشئ النظام نسخة كاملة تلقائياً حسب الفاصل الزمني أدناه</p>
                  </div>
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))} className={`relative w-11 h-6 rounded-full transition-colors ${autoEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${autoEnabled ? 'left-0.5' : 'left-[22px]'}`} />
                  </button>
                </label>
                <label className={`flex items-center justify-between rounded-xl border p-3.5 cursor-pointer transition-colors ${settings.verifyAfterBackup ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <p className="font-extrabold text-slate-800 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> التحقق بعد كل نسخة</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">يقارن النسخة بالبيانات الحية ويتأكد من مطابقة كل السجلات</p>
                  </div>
                  <button type="button" onClick={() => setSettings((s) => ({ ...s, verifyAfterBackup: !s.verifyAfterBackup }))} className={`relative w-11 h-6 rounded-full transition-colors ${settings.verifyAfterBackup ? 'bg-blue-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.verifyAfterBackup ? 'left-0.5' : 'left-[22px]'}`} />
                  </button>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <label className="font-extrabold text-slate-700">الفاصل الزمني (ساعات)</label>
                    <select value={settings.intervalHours} onChange={(e) => setSettings((s) => ({ ...s, intervalHours: Number(e.target.value) }))} className="mt-1.5 w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value={1}>كل ساعة</option>
                      <option value={6}>كل 6 ساعات</option>
                      <option value={12}>كل 12 ساعة</option>
                      <option value={24}>كل يوم</option>
                      <option value={48}>كل يومين</option>
                      <option value={72}>كل 3 أيام</option>
                      <option value={168}>كل أسبوع</option>
                    </select>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <label className="font-extrabold text-slate-700">الاحتفاظ بعدد النسخ</label>
                    <input type="number" min={1} max={500} value={settings.retention} onChange={(e) => setSettings((s) => ({ ...s, retention: Number(e.target.value) }))} className="mt-1.5 w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-[10px] text-slate-400 mt-1">تُحذف الأقدم تلقائياً عند تجاوز العدد</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Btn tone="dark" onClick={saveSettings} disabled={busy}><Save className="w-4 h-4" /> حفظ الإعدادات</Btn>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card className="p-5">
              <SectionHeader title="إجراءات سريعة" subtitle="إنشاء نسخة يدوية أو استعادة من ملف محفوظ خارجياً أو التحقق من صحة البيانات" icon={<ArchiveRestore className="w-5 h-5 text-emerald-600" />} />
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <label className="font-extrabold text-slate-700 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> وصف النسخة (اختياري)</label>
                  <div className="flex gap-2 mt-1.5">
                    <input value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="مثال: قبل تحديث الأسعار" className="flex-1 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    <Btn onClick={createNow} disabled={!canManage || busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} إنشاء</Btn>
                  </div>
                </div>
                <Btn tone="primary" onClick={verifyNow} disabled={!canManage || verifyBusy} className="w-full">{verifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} التحقق من مطابقة البيانات الآن</Btn>
                {verifyResult && (
                  <div className={`rounded-xl border p-3 text-xs ${verifyResult.allMatch ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`font-extrabold ${verifyResult.allMatch ? 'text-emerald-700' : 'text-amber-700'} flex items-center gap-1.5`}>
                      {verifyResult.allMatch ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {verifyResult.allMatch ? 'مطابقة تامة — جميع البيانات محفوظة ومتوافقة' : `تم اكتشاف ${verifyResult.mismatchedKeys} عدم تطابق`}
                    </p>
                    {!verifyResult.allMatch && (
                      <ul className="mt-1.5 space-y-0.5 pr-4 list-disc text-[10px] text-amber-700">
                        {verifyResult.results.map((r, i) => <li key={i}>{r.key}: {r.status === 'count_mismatch' ? `النسخة ${r.backupRecords} vs الحية ${r.liveRecords}` : r.status}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                <label className={`flex items-center justify-between rounded-xl border p-3.5 transition-colors ${canManage ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer' : 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600/15 text-indigo-600 flex items-center justify-center"><HardDriveUpload className="w-4 h-4" /></div>
                    <div>
                      <p className="font-extrabold text-slate-800">استعادة من ملف خارجي</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">اختر ملف نسخة (JSON) محفوظاً على جهازك</p>
                    </div>
                  </div>
                  <input id="restore-file-input" type="file" accept=".json,application/json" className="hidden" disabled={!canManage} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); }} />
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">اختيار ملف</span>
                </label>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex gap-2 text-[11px] text-amber-800 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>قبل أي استعادة يُنشئ النظام تلقائياً «نقطة استعادة» لحالتك الحالية، فتصبح استعادتك قابلة للتراجع دائماً.</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Backup list */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <SectionHeader title="سجل النسخ الاحتياطية" subtitle={`${backups.length} نسخة مخزنة على هذا الجهاز — الأحدث أولاً`} icon={<History className="w-5 h-5 text-slate-600" />} />
            </div>
            {backups.length === 0 ? (
              <div className="p-10 text-center text-slate-400 font-bold text-sm">لا توجد نسخ احتياطية بعد. أنشئ أول نسخة الآن.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2.5 font-extrabold">النوع</th>
                      <th className="p-2.5 font-extrabold">التاريخ</th>
                      <th className="p-2.5 font-extrabold">الوصف</th>
                      <th className="p-2.5 font-extrabold">البيانات</th>
                      <th className="p-2.5 font-extrabold">الحجم</th>
                      <th className="p-2.5 font-extrabold">المنشئ</th>
                      <th className="p-2.5 font-extrabold text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_TONE[b.type] || TYPE_TONE.unknown}`}>{TYPE_LABEL[b.type] || TYPE_LABEL.unknown}</span></td>
                        <td className="p-2.5 font-bold text-slate-700 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                        <td className="p-2.5 text-slate-600 max-w-[180px] truncate">{b.label || '—'}</td>
                        <td className="p-2.5 text-slate-600 whitespace-nowrap">{b.units} وحدة / {b.records} سجل</td>
                        <td className="tnum text-left p-2.5 font-bold text-slate-700">{fmtSize(b.size)}</td>
                        <td className="p-2.5 text-slate-600">{b.createdBy || '—'}</td>
                        <td className="p-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => download(b)} title="تنزيل" className="p-1.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg"><HardDriveDownload className="w-4 h-4" /></button>
                            <button onClick={() => { setRestoreTarget(b); setTypedWord(''); }} title="استعادة" disabled={!canManage} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg disabled:opacity-40"><ArchiveRestore className="w-4 h-4" /></button>
                            <button onClick={() => { setDeleteTarget(b); setTypedWord(''); }} title="حذف" disabled={!canManage} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Restore confirm */}
      <Modal open={restoreTarget !== null} onClose={resetWord(() => setRestoreTarget(null))} title="تأكيد الاستعادة من نسخة">
        {restoreTarget && (
          <div className="space-y-3 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 font-bold">
              سيتم استبدال البيانات الحالية بالنسخة التالية، مع إنشاء نقطة استعادة للحالة الحالية أولاً:
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-slate-700 font-medium">
              <p className="flex justify-between"><span className="font-bold">النوع:</span> <span className={TYPE_TONE[restoreTarget.type]}>{TYPE_LABEL[restoreTarget.type]}</span></p>
              <p className="flex justify-between"><span className="font-bold">التاريخ:</span> {fmtDate(restoreTarget.createdAt)}</p>
              <p className="flex justify-between"><span className="font-bold">المحتوى:</span> {restoreTarget.units} وحدة / {restoreTarget.records} سجل</p>
              {restoreTarget.label && <p className="flex justify-between"><span className="font-bold">الوصف:</span> {restoreTarget.label}</p>}
            </div>
            <p className="font-bold text-slate-700">اكتب كلمة <span className="text-rose-600">تأكيد</span> للمتابعة:</p>
            <input dir="rtl" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500" placeholder="تأكيد" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetWord(() => setRestoreTarget(null))} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
              <button type="button" onClick={doRestore} disabled={typedWord.trim() !== 'تأكيد' || busy} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />} استعادة البيانات
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={resetWord(() => setDeleteTarget(null))} title="حذف نسخة احتياطية">
        {deleteTarget && (
          <div className="space-y-3 text-xs">
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 font-bold">
              سيتم حذف النسخة نهائياً من هذا الجهاز ولا يمكن استعادتها. هل أنت متأكد؟
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium">
              <p>{TYPE_LABEL[deleteTarget.type]} — {fmtDate(deleteTarget.createdAt)} — {fmtSize(deleteTarget.size)}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetWord(() => setDeleteTarget(null))} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
              <button type="button" onClick={doDelete} disabled={busy} className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} حذف النسخة
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* File restore confirm */}
      <Modal open={filePreview !== null} onClose={resetWord(() => { setFilePreview(null); setFileData(null); })} title="استعادة من ملف خارجي">
        {filePreview && (
          <div className="space-y-3 text-xs">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 font-bold">
              سيتم استبدال جميع بيانات النظام الحالية ببيانات الملف التالي، مع إنشاء نقطة استعادة أولاً:
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-slate-700 font-medium">
              <p className="flex justify-between"><span className="font-bold">اسم الملف:</span> <span dir="ltr" className="font-mono">{filePreview.fileName}</span></p>
              <p className="flex justify-between"><span className="font-bold">تاريخ النسخة:</span> {filePreview.createdAt}</p>
              {filePreview.createdBy && <p className="flex justify-between"><span className="font-bold">أنشئت بواسطة:</span> {filePreview.createdBy}</p>}
              <p className="flex justify-between"><span className="font-bold">الوحدات:</span> {Object.keys(filePreview.counts).length} وحدة / {Object.values(filePreview.counts).reduce((s, c) => s + (Number(c) || 0), 0)} سجل</p>
            </div>
            <p className="font-bold text-slate-700">اكتب كلمة <span className="text-rose-600">تأكيد</span> للمتابعة:</p>
            <input dir="rtl" value={typedWord} onChange={(e) => setTypedWord(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500" placeholder="تأكيد" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetWord(() => { setFilePreview(null); setFileData(null); })} className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-medium">إلغاء</button>
              <button type="button" onClick={doRestoreFile} disabled={typedWord.trim() !== 'تأكيد' || busy} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />} استعادة البيانات
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Verification log */}
      {canManage && verifyLog.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <SectionHeader title="سجل التحقق من النسخ الاحتياطية" subtitle={`آخر ${Math.min(verifyLog.length, 20)} عمليات تحقق — الأحدث أولاً`} icon={<ShieldCheck className="w-5 h-5 text-blue-600" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2.5 font-extrabold">التاريخ والوقت</th>
                  <th className="p-2.5 font-extrabold">الملف</th>
                  <th className="p-2.5 font-extrabold">الحالة</th>
                  <th className="p-2.5 font-extrabold">السجلات</th>
                  <th className="p-2.5 font-extrabold">المطابقة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {verifyLog.slice(0, 20).map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="tnum text-left p-2.5 text-[10px]">{fmtDate(v.verifiedAt)}</td>
                    <td className="tnum text-left p-2.5 text-[10px]">{v.backupFile}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${v.allMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {v.allMatch ? 'مطابق' : `عدم تطابق (${v.mismatchedKeys})`}
                      </span>
                    </td>
                    <td className="tnum text-left p-2.5">{v.totalKeys} مفتاح</td>
                    <td className="tnum text-left p-2.5">{v.allMatch ? '100%' : `${((v.totalKeys - v.mismatchedKeys) / v.totalKeys * 100).toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Footer note */}
      {currentUser && !canManage && (
        <p className="text-center text-[11px] text-slate-500 font-bold">الوصول إلى إدارة النسخ الاحتياطي مقيد بصلاحية مدير النظام (reset_system).</p>
      )}
      <p className="text-center text-[10px] text-slate-400"><FolderOpen className="w-3 h-3 inline ml-1" /> تُخزَّن النسخ في مجلد <span dir="ltr" className="font-mono">{backupDir || 'النسخ الاحتياطي'}</span> داخل ملفات النظام — زر «فتح مجلد النسخ» يعرضها في مستكشف الملفات.</p>
    </div>
  );
};
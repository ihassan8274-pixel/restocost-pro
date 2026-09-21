import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { downloadCSV } from '../../utils/helpers';

export const AuditLogView: React.FC = () => {
  const { auditLogs } = useApp();
  const [moduleFilter, setModuleFilter] = useState('all');

  const modules = ['all', ...Array.from(new Set(auditLogs.map((l) => l.module)))];
  const filtered = moduleFilter === 'all' ? auditLogs : auditLogs.filter((l) => l.module === moduleFilter);

  return (
    <div className="space-y-6">
      <PageHeader title="سجل التدقيق (Audit Trail)" subtitle="تتبع كامل الإجراءات الحساسة: التعديلات، الموافقات، والحذف" icon={<ScrollText className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="سجل التدقيق" sheets={[
            {
              name: 'سجل التدقيق',
              header: ['التوقيت', 'المستخدم', 'الإجراء', 'الوحدة', 'التفاصيل'],
              rows: filtered.map((l) => [l.timestamp, l.userName, l.action, l.module, l.details || '-']),
            },
            {
              name: 'ملخص الوحدات',
              header: ['الوحدة', 'عدد الإجراءات'],
              rows: Array.from(new Set(auditLogs.map((l) => l.module))).map((m) => [m, auditLogs.filter((l) => l.module === m).length]),
            },
          ]} />
          <button onClick={() => downloadCSV('AuditLog.csv', ['التوقيت', 'المستخدم', 'الإجراء', 'الوحدة', 'التفاصيل'], filtered.map((l) => [l.timestamp, l.userName, l.action, l.module, l.details || '']))} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">تصدير CSV</button>
        </>} />

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600">الوحدة:</span>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={inputCls + ' !w-64'}>
            {modules.map((m) => <option key={m} value={m}>{m === 'all' ? 'الكل' : m}</option>)}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr><th className="p-3">التوقيت</th><th className="p-3">المستخدم</th><th className="p-3">الإجراء</th><th className="p-3">الوحدة</th><th className="p-3">التفاصيل</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{l.timestamp}</td>
                  <td className="p-3 font-bold text-slate-900">{l.userName}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{l.action}</span></td>
                  <td className="p-3 text-indigo-700 font-bold">{l.module}</td>
                  <td className="p-3 text-slate-600">{l.details || '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500 font-bold">لا توجد إجراءات مسجلة</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
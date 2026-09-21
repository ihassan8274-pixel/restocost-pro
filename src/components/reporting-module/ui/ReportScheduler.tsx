// ============================================================
// واجهة الجدولة التلقائية
// ============================================================

import React, { useState } from 'react';
import { Clock, Calendar, Play, Plus, Trash2, Settings, Smartphone, Mail, FileText } from 'lucide-react';
import type { ScheduledReportConfig } from '../scheduler';

interface ReportSchedulerProps {
  scheduledReports?: ScheduledReportConfig[];
  onCreateSchedule?: (config: Omit<ScheduledReportConfig, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'lastRun' | 'nextRun'>) => void;
  onRunNow?: (configId: string) => void;
  onDelete?: (configId: string) => void;
}

export const ReportScheduler: React.FC<ReportSchedulerProps> = ({
  scheduledReports = [],
  onCreateSchedule,
  onRunNow,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };

  const formatSchedule = (config: ScheduledReportConfig) => {
    const freqLabels: Record<string, string> = {
      daily: 'يومي',
      weekly: 'أسبوعي',
      monthly: 'شهري',
      quarterly: 'ربع سنوي',
      yearly: 'سنوي',
    };
    return freqLabels[config.schedule.frequency || ''] || config.schedule.frequency || 'مخصص';
  };

  const channelIcons: Record<string, React.ReactNode> = {
    telegram: <Smartphone className="w-3 h-3" />,
    email: <Mail className="w-3 h-3" />,
    file: <FileText className="w-3 h-3" />,
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-indigo-50 hover:bg-indigo-100 flex items-center justify-between text-sm font-bold text-indigo-800"
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          الجدولة التلقائية ({scheduledReports.length})
        </span>
        {expanded ? <Settings className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {/* قائمة التكوينات */}
          <div className="space-y-2">
            {scheduledReports.map(config => (
              <div
                key={config.id}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  selectedConfig === config.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSelectedConfig(config.id === selectedConfig ? null : config.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{config.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[config.status]}`}>
                      {config.status === 'pending' ? 'في الانتظار' : config.status === 'running' ? 'يعمل' : config.status === 'completed' ? 'مكتمل' : 'فشل'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRunNow?.(config.id); }}
                      className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                      title="تشغيل الآن"
                    >
                      <Play className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete?.(config.id); }}
                      className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                      title="حذف"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                
                {selectedConfig === config.id && (
                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-1 text-[11px] text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>التكرار: {formatSchedule(config)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>القنوات:</span>
                      {config.recipients.map((r, i) => (
                        <span key={i} className="inline-flex items-center gap-1">{channelIcons[r.type] || <FileText className="w-3 h-3" />} {r.type}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span>آخر تشغيل:</span>
                      <span>{config.lastRun ? new Date(config.lastRun).toLocaleString('ar-SA') : 'لم يُشغل بعد'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>عدد التشغيلات:</span>
                      <span>{config.runCount}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* زر إضافة جدولة جديدة */}
          {onCreateSchedule && (
            <button
              onClick={() => onCreateSchedule({
                reportId: '',
                name: '',
                enabled: true,
                schedule: { suggested: true, frequency: 'monthly', cron: '', channels: ['telegram'], formats: ['pdf'] },
                filters: { period: { from: '', to: '', preset: 'this-month' }, branchIds: [], companyIds: [], categoryIds: [], supplierIds: [], expenseCategoryIds: [], movementTypeIds: [], status: [] },
                recipients: [{ type: 'telegram', target: '', format: 'pdf' }],
                status: 'pending',
              })}
              className="w-full py-2 bg-indigo-500 text-white text-xs font-bold rounded-lg hover:bg-indigo-600 flex items-center justify-center gap-2"
            >
              <Plus className="w-3 h-3" />
              إنشاء جدولة جديدة
            </button>
          )}
        </div>
      )}
    </div>
  );
};
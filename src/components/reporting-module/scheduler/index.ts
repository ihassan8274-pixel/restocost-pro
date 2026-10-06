// ============================================================
// جدولة التقارير التلقائية (Scheduler)
// يتكامل مع cron jobs أو setInterval للتشغيل الدوري
// ============================================================

import type { 
  ReportFilters, 
  ScheduleSpec 
} from '../types';

import { getReportDefinition } from '../registry';
import { computeReport } from '../engine/aggregationEngine';
import { exportToPDF, exportToExcel, downloadBlob, getExportFilename } from '../export';
import { resolvePeriod, getComparePeriod } from '../data/sources';

// ============================================================
// أنواع الجدولة
// ============================================================

export interface ScheduledReportConfig {
  id: string;
  reportId: string;
  name: string;
  enabled: boolean;
  status: string;
  schedule: ScheduleSpec;
  filters: ReportFilters;
  recipients: ScheduledRecipient[];
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledRecipient {
  type: 'telegram' | 'email' | 'file';
  target: string; // chatId, email, or file path
  format: 'pdf' | 'excel';
}

export interface SchedulerJob {
  configId: string;
  reportId: string;
  runAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: {
    success: boolean;
    files?: Array<{ format: string; filename: string; size: number }>;
    error?: string;
  };
}

// ============================================================
// مخزن التكوينات (في الذاكرة - في الإنتاج يستخدم قاعدة البيانات)
// ============================================================

const scheduledConfigs = new Map<string, ScheduledReportConfig>();
const jobQueue: SchedulerJob[] = [];
let schedulerRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================
// دوال إدارة التكوينات
// ============================================================

export function createScheduledReport(config: Omit<ScheduledReportConfig, 'id' | 'createdAt' | 'updatedAt' | 'runCount' | 'lastRun' | 'nextRun'>): ScheduledReportConfig {
  const now = new Date().toISOString();
  const id = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const fullConfig: ScheduledReportConfig = {
    ...config,
    id,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
    nextRun: calculateNextRun(config.schedule),
  };
  
  scheduledConfigs.set(id, fullConfig);
  scheduleJob(fullConfig);
  
  return fullConfig;
}

export function updateScheduledReport(id: string, updates: Partial<ScheduledReportConfig>): ScheduledReportConfig | null {
  const config = scheduledConfigs.get(id);
  if (!config) return null;
  
  const updated = { ...config, ...updates, updatedAt: new Date().toISOString() };
  scheduledConfigs.set(id, updated);
  
  // إعادة جدولة إذا تغير الجدول
  if (updates.schedule || updates.enabled !== undefined) {
    scheduleJob(updated);
  }
  
  return updated;
}

export function deleteScheduledReport(id: string): boolean {
  const config = scheduledConfigs.get(id);
  if (config) {
    // إزالة الوظائف المجدولة المرتبطة
    const jobIndex = jobQueue.findIndex(j => j.configId === id);
    if (jobIndex >= 0) jobQueue.splice(jobIndex, 1);
    return scheduledConfigs.delete(id);
  }
  return false;
}

export function getScheduledReport(id: string): ScheduledReportConfig | undefined {
  return scheduledConfigs.get(id);
}

export function getAllScheduledReports(): ScheduledReportConfig[] {
  return Array.from(scheduledConfigs.values());
}

export function getEnabledScheduledReports(): ScheduledReportConfig[] {
  return Array.from(scheduledConfigs.values()).filter(c => c.enabled);
}

// ============================================================
// حساب الموعد التالي للتشغيل
// ============================================================

function calculateNextRun(schedule: ScheduleSpec): string | undefined {
  if (!schedule.suggested || !schedule.frequency) return undefined;
  
  const now = new Date();
  let next: Date;
  
  if (schedule.cron) {
    // في الإنتاج: استخدام مكتبة cron parser مثل croner
    // هنا تبسيط: نستخدم frequency
    next = getNextByFrequency(now, schedule.frequency);
  } else {
    next = getNextByFrequency(now, schedule.frequency);
  }
  
  return next.toISOString();
}

function getNextByFrequency(now: Date, frequency: ScheduleSpec['frequency']): Date {
  const next = new Date(now);
  
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 0, 0); // 6 صباحاً
      break;
    case 'weekly':
      next.setDate(next.getDate() + (7 - next.getDay())); // الأحد القادم
      next.setHours(6, 0, 0, 0);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      next.setHours(6, 0, 0, 0);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      next.setDate(1);
      next.setHours(6, 0, 0, 0);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      next.setMonth(0);
      next.setDate(1);
      next.setHours(6, 0, 0, 0);
      break;
  }
  
  return next;
}

// ============================================================
// جدولة المهام
// ============================================================

function scheduleJob(config: ScheduledReportConfig): void {
  if (!config.enabled || !config.schedule.suggested) return;
  
  const nextRun = config.nextRun ? new Date(config.nextRun) : null;
  if (!nextRun) return;
  
  // إزالة أي مهمة سابقة لنفس التكوين
  const existingIndex = jobQueue.findIndex(j => j.configId === config.id);
  if (existingIndex >= 0) jobQueue.splice(existingIndex, 1);
  
  jobQueue.push({
    configId: config.id,
    reportId: config.reportId,
    runAt: nextRun,
    status: 'pending',
  });
  
  // ترتيب الطابور
  jobQueue.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
}

export function startScheduler(intervalMs = 60000): void { // فحص كل دقيقة
  if (schedulerRunning) return;
  
  schedulerRunning = true;
  console.log('[Scheduler] Started');
  
  schedulerInterval = setInterval(async () => {
    await processJobQueue();
  }, intervalMs);
  
  // تشغيل فوري للمعالجة
  processJobQueue();
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  console.log('[Scheduler] Stopped');
}

async function processJobQueue(): Promise<void> {
  const now = new Date();
  const dueJobs = jobQueue.filter(j => j.status === 'pending' && j.runAt <= now);
  
  for (const job of dueJobs) {
    job.status = 'running';
    
    try {
      await executeScheduledJob(job);
      job.status = 'completed';
      
      // تحديث التكوين
      const config = scheduledConfigs.get(job.configId);
      if (config) {
        config.lastRun = new Date().toISOString();
        config.runCount += 1;
        config.nextRun = calculateNextRun(config.schedule) || undefined;
        scheduledConfigs.set(job.configId, config);
        
        // جدولة المهمة القادمة
        scheduleJob(config);
      }
    } catch (error: unknown) {
      job.status = 'failed';
      job.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      console.error(`[Scheduler] Job ${job.configId} failed:`, error);
    }
  }
  
  // تنظيف المهام المكتملة القديمة (احتفظ بآخر 100)
  const completedJobs = jobQueue.filter(j => j.status === 'completed' || j.status === 'failed');
  if (completedJobs.length > 100) {
    const toRemove = completedJobs.length - 100;
    let removed = 0;
    for (let i = 0; i < jobQueue.length && removed < toRemove; i++) {
      if (jobQueue[i].status === 'completed' || jobQueue[i].status === 'failed') {
        jobQueue.splice(i, 1);
        i--;
        removed++;
      }
    }
  }
}

async function executeScheduledJob(job: SchedulerJob): Promise<void> {
  const config = scheduledConfigs.get(job.configId);
  if (!config) throw new Error('Config not found');
  
  const definition = getReportDefinition(config.reportId);
  
  // حل الفترة الزمنية للتشغيل الحالي
  const period = resolvePeriod(config.filters.period.preset || 'this-month');
  const comparePeriod = getComparePeriod(period);
  
  // تشغيل التقرير
  const result = await computeReport({
    reportId: config.reportId,
    definition: {
      metrics: definition.metrics,
      dimensions: definition.dimensions,
      kpiMetrics: definition.kpiMetrics,
    },
    filters: { ...config.filters, period },
    comparePeriod: comparePeriod || undefined,
    useCache: false, // لا تستخدم الكاش للتشغيل المجدول
  });
  
  // تصدير وإرسال لكل مستلم
  const files: Array<{ format: string; filename: string; size: number }> = [];
  
  for (const recipient of config.recipients) {
    let blob: Blob;
    let filename: string;
    
    if (recipient.format === 'pdf') {
      blob = await exportToPDF(config.reportId, result, { nameAr: definition.nameAr });
      filename = getExportFilename(config.reportId, 'pdf', period);
    } else {
      blob = await exportToExcel(config.reportId, result, { nameAr: definition.nameAr });
      filename = getExportFilename(config.reportId, 'excel', period);
    }
    
    files.push({ format: recipient.format, filename, size: blob.size });
    
    // إرسال حسب النوع
    await deliverReport(recipient, blob, filename);
  }
  
  job.result = { success: true, files };
}

async function deliverReport(
  recipient: ScheduledRecipient, 
  blob: Blob, 
  filename: string
): Promise<void> {
  switch (recipient.type) {
    case 'telegram':
      await sendToTelegram(recipient.target, blob, filename);
      break;
    case 'email':
      await sendEmail(recipient.target, blob, filename);
      break;
    case 'file':
      await saveToFile(recipient.target, blob, filename);
      break;
  }
}

// ============================================================
// قنوات التوصيل (Stubs - تحتاج تنفيذ حقيقي)
// ============================================================

async function sendToTelegram(chatId: string, blob: Blob, filename: string): Promise<void> {
  // في الإنتاج: استخدام Telegram Bot API
  // const formData = new FormData();
  // formData.append('chat_id', chatId);
  // formData.append('document', blob, filename);
  // formData.append('caption', `📊 ${reportName}\n📅 ${period.from} → ${period.to}`);
  // await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: formData });
  
  console.log(`[Scheduler] Telegram delivery to ${chatId}: ${filename} (${blob.size} bytes)`);
}

async function sendEmail(email: string, blob: Blob, filename: string): Promise<void> {
  // في الإنتاج: استخدام خدمة بريد مثل SendGrid, Nodemailer, إلخ
  console.log(`[Scheduler] Email delivery to ${email}: ${filename} (${blob.size} bytes)`);
}

async function saveToFile(path: string, blob: Blob, filename: string): Promise<void> {
  // في بيئة المتصفح: لا يمكن حفظ ملفات مباشرة على القرص
  // في بيئة Node.js (الخادم): استخدام fs.writeFile
  // هنا: تحميل عبر المتصفح كحل بديل
  console.log(`[Scheduler] File save to ${path}/${filename} (${blob.size} bytes)`);
  
  // إذا كنا في المتصفح، نحاول التحميل
  if (typeof window !== 'undefined' && window.document) {
    await downloadBlob(blob, filename);
  }
}

// ============================================================
// دوال مساعدة للواجهة
// ============================================================

export function getSchedulerStatus(): { running: boolean; queueLength: number; pendingJobs: number } {
  return {
    running: schedulerRunning,
    queueLength: jobQueue.length,
    pendingJobs: jobQueue.filter(j => j.status === 'pending').length,
  };
}

export function getJobHistory(configId?: string): SchedulerJob[] {
  if (configId) {
    return jobQueue.filter(j => j.configId === configId);
  }
  return [...jobQueue].sort((a, b) => b.runAt.getTime() - a.runAt.getTime());
}

export function runScheduledReportNow(configId: string): Promise<{ success: boolean; error?: string }> {
  const config = scheduledConfigs.get(configId);
  if (!config) return Promise.resolve({ success: false, error: 'Config not found' });
  
  const job: SchedulerJob = {
    configId,
    reportId: config.reportId,
    runAt: new Date(),
    status: 'pending',
  };
  
  jobQueue.push(job);
  return processJobQueue().then(() => {
    const completedJob = jobQueue.find(j => j.configId === configId && j.status === 'completed');
    return { success: !!completedJob, error: completedJob?.result?.error };
  });
}

// ============================================================
// تكامل مع API الخادم (للحفظ الدائم)
// ============================================================

export async function syncScheduledReportsToServer(): Promise<{ ok: boolean; count: number }> {
  try {
    const configs = getAllScheduledReports();
    const response = await fetch('/api/collections/rcerp_scheduled_reports', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs }),
    });
    
    const json = await response.json();
    return { ok: json.ok === true, count: configs.length };
  } catch (error: unknown) {
    console.error('[Scheduler] Sync to server failed:', error);
    return { ok: false, count: 0 };
  }
}

export async function loadScheduledReportsFromServer(): Promise<{ ok: boolean; count: number }> {
  try {
    const response = await fetch('/api/collections/rcerp_scheduled_reports', {
      credentials: 'include',
    });
    
    const json = await response.json();
    if (json.ok && json.data) {
      for (const config of json.data) {
        scheduledConfigs.set(config.id, config);
        if (config.enabled) scheduleJob(config);
      }
      return { ok: true, count: json.data.length };
    }
    return { ok: false, count: 0 };
  } catch (error: unknown) {
    console.error('[Scheduler] Load from server failed:', error);
    return { ok: false, count: 0 };
  }
}
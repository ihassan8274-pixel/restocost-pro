import { useState } from 'react';
import { tempStatusOf } from '../types';
import type { HaccpInspection, TempLogEntry } from '../types';
import type { ToastEntry } from './useToasts';

// كبسولة «سلامة الغذاء» المستخرجة من AppProvider: سجل درجات الحرارة + تقارير التفتيش.
// يبقى السلوك مطابقاً للأصل — تُحقن الاعتمادات (audit/toast/اسم المسجِّل) من الداخل؟
// لا، التوقيع يتعاقد خارجياً: المُستدعي (السياق) فقط يورد currentUser/logAudit/showToast.
interface UseHaccpDeps {
  currentUser: { name?: string } | null;
  logAudit: (action: string, module: string, details?: string) => void;
  showToast: (message: string, opts?: Partial<Omit<ToastEntry, 'message'>>) => void;
}

export const useHaccp = ({ currentUser, logAudit, showToast }: UseHaccpDeps) => {
  const [tempLogs, setTempLogs] = useState<TempLogEntry[]>([]);
  const [haccpInspections, setHaccpInspections] = useState<HaccpInspection[]>([]);

  const addTempLog = (data: Omit<TempLogEntry, 'id' | 'recordedBy'>) => {
    const entry: TempLogEntry = { ...data, id: `temp-${Date.now()}`, recordedBy: currentUser?.name || 'المستخدم' };
    setTempLogs((prev) => [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
    const st = tempStatusOf(entry);
    if (st === 'critical') showToast('انحراف حرج في الحرارة — يجب معالجة فورية وتوثيق الإجراء');
    else if (st === 'warning') showToast('تحذير — درجة حرارة فوق النطاق الآمن');
    logAudit('تسجيل درجة حرارة', 'سلامة الغذاء', `${data.location} ${data.temperature}°`);
  };

  const addHaccpInspection = (data: Omit<HaccpInspection, 'id' | 'createdAt'>) => {
    const rec: HaccpInspection = { ...data, id: `insp-${Date.now()}`, createdAt: new Date().toISOString() };
    setHaccpInspections((prev) => [rec, ...prev]);
    logAudit('تقرير تفتيش سلامة غذاء', 'سلامة الغذاء', data.overallPassed ? 'ناجح' : 'به ملاحظات');
    showToast(data.overallPassed ? 'سجّل التفتيش (ناجح) ✓' : 'سُجّل التفتيش مع ملاحظات — راجعها');
  };
  const deleteTempLog = (id: string) => setTempLogs((prev) => prev.filter((x) => x.id !== id));

  return { tempLogs, setTempLogs, haccpInspections, setHaccpInspections, addTempLog, addHaccpInspection, deleteTempLog };
};
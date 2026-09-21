import React from 'react';
import { Sparkles } from 'lucide-react';
import { getAIModels, getActiveAIModelId, AI_PROVIDERS } from '../../utils/ai';

// قائمة اختيار نموذج ذكاء اصطناعي داخل شاشات AI — تظهر القائمة فقط عند وجود أكثر من نموذج
interface Props {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export const AIModelPicker: React.FC<Props> = ({ value, onChange, className }) => {
  const models = getAIModels();
  const activeId = getActiveAIModelId();
  const safe = models.some((m) => m.id === value) ? value : activeId;

  if (models.length <= 1) {
    const m = models[0];
    if (!m) return null;
    const label = AI_PROVIDERS.find((p) => p.id === m.provider)?.label.split(' (')[0] || m.provider;
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold bg-violet-50 border border-violet-200 text-violet-700 rounded-lg px-2.5 py-1.5 ${className || ''}`}
        title="النموذج المستخدم"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {m.name} · {label}{m.model ? ` · ${m.model}` : ''}
      </span>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${className || ''}`}>
      <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
      <select
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-violet-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-violet-700 focus:outline-none"
        title="اختر نموذج الذكاء الاصطناعي لهذه الشاشة"
      >
        {models.map((m) => {
          const label = AI_PROVIDERS.find((p) => p.id === m.provider)?.label.split(' (')[0] || m.provider;
          return (
            <option key={m.id} value={m.id}>
              {m.name} ({label}{m.model ? ` — ${m.model}` : ''})
            </option>
          );
        })}
      </select>
    </label>
  );
};
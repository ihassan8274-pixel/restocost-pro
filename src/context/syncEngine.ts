// محرك إعادة الإرسال الموثوق (مستخرج من AppContext).
// منطق الإرسال/الترتيب/إعادة المحاولة ومعالجة 409/401 قرارات نقية هنا؛
// الآثار الجانبية (fetch/delete/setState) تُحقن من الخارج، فيبقى السلوك مطابقاً
// للأصل وقابلاً للاختبار وحده.

const ABORT_MS = 120000; // مهلة إرسال مفتاح واحد (مطابقة للأصل)

export type FlushDecision =
  | { kind: 'saved' }
  | { kind: 'shrunk'; note: string }
  | { kind: 'auth'; note: string }
  | { kind: 'retry'; note: string };

export const decideFlush = (status: number): FlushDecision => {
  if (status >= 200 && status < 300) return { kind: 'saved' };
  if (status === 409) return { kind: 'shrunk', note: 'رفض (بيانات تجريبية)' };
  if (status === 401 || status === 403) return { kind: 'auth', note: String(status) };
  return { kind: 'retry', note: `HTTP ${status}` };
};

export interface FlushHandlers {
  send: (key: string, value: unknown, signal: AbortSignal) => Promise<number>;
  onSaved: (key: string) => void;
  onShrinkRejected: (key: string) => Promise<void>;
}

export interface FlushResult {
  failures: string[];
  gotAuthError: boolean;
  hadFailures: boolean;
}

export const runFlushQueue = async (
  entries: { key: string; value: unknown }[],
  h: FlushHandlers,
  opts: { abortMs?: number; failures?: string[] } = {},
): Promise<FlushResult> => {
  const abortMs = opts.abortMs ?? ABORT_MS;
  const failures = opts.failures ?? [];
  let gotAuthError = false;
  let hadFailures = false;

  for (const { key, value } of entries) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), abortMs);
      let status: number;
      try {
        status = await h.send(key, value, ctrl.signal);
      } finally {
        clearTimeout(timer);
      }
      const d = decideFlush(status);
      if (d.kind === 'saved') {
        h.onSaved(key);
        continue;
      }
      if (d.kind === 'shrunk') {
        hadFailures = true;
        failures.push(`${key}→${d.note}`);
        await h.onShrinkRejected(key);
        continue;
      }
      if (d.kind === 'auth') {
        gotAuthError = true;
        hadFailures = true;
        failures.push(`${key}→${d.note}`);
        break;
      }
      hadFailures = true;
      failures.push(`${key}→${d.note}`);
    } catch {
      hadFailures = true;
      failures.push(`${key}→لا استجابة`);
      continue;
    }
  }
  return { failures, gotAuthError, hadFailures };
};

// ترتيب المفاتيح الصغيرة أولاً فلا يحجب مفتاح ضخم (كبُر) بقية التعديلات.
export const sortEntriesBySize = <T>(entries: { key: string; value: T }[]): { key: string; value: T }[] =>
  [...entries].sort((a, b) => JSON.stringify(a.value).length - JSON.stringify(b.value).length);
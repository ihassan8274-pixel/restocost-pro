// محرك إعادة الإرسال الموثوق (مستخرج من AppContext).
// منطق الإرسال/الترتيب/إعادة المحاولة ومعالجة 409/401 قرارات نقية هنا؛
// الآثار الجانبية (fetch/delete/setState) تُحقن من الخارج، فيبقى السلوك مطابقاً
// للأصل وقابلاً للاختبار وحده.

const ABORT_MS = 120000; // مهلة إرسال مفتاح واحد (مطابقة للأصل)

export type FlushDecision =
  | { kind: 'saved' }
  | { kind: 'shrunk'; note: string }
  | { kind: 'auth'; note: string }
  | { kind: 'forbidden'; note: string }
  | { kind: 'retry'; note: string };

export const decideFlush = (status: number): FlushDecision => {
  if (status >= 200 && status < 300) return { kind: 'saved' };
  if (status === 409) return { kind: 'shrunk', note: 'رفض (بيانات تجريبية)' };
  if (status === 401) return { kind: 'auth', note: String(status) };
  if (status === 403) return { kind: 'forbidden', note: String(status) };
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
      if (d.kind === 'forbidden') {
        hadFailures = true;
        failures.push(`${key}→صلاحية غير كافية (403)`);
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

// دمج قائمة محلية مع قائمة واردة بالمعرّف (نفس مبدأ الخادم): السجل الأحدث
// (أعلى _mtime) يفوز عند التعارض، والسجلات الجديدة تُضاف، ولا يُحذف شيء —
// يمنع bootstrap/تبويب قديم يحمل نسخة أصغر من طمس سجلات مستوردة حديثاً.
// يُستخدم أيضاً في جانب الخادم لنفطه مماثل عبر mergeById (mergeCore.mjs).
export const mergeByIdLocal = <T extends { id?: unknown; _mtime?: number }>(local: T[] | undefined, incoming: unknown): T[] => {
  if (!Array.isArray(incoming)) return Array.isArray(local) ? local : [] as T[];
  const localArr = Array.isArray(local) ? local : [] as T[];
  const merged = new Map<string, T>();
  localArr.forEach((r) => { if (r && r.id !== undefined) merged.set(String(r.id), r); });
  (incoming as T[]).forEach((r) => {
    if (!r || r.id === undefined) return;
    const id = String(r.id);
    const cur = merged.get(id);
    if (!cur) { merged.set(id, r); return; }
    const nextM = (r as { _mtime?: unknown })._mtime;
    const curM = (cur as { _mtime?: unknown })._mtime;
    const nextNum = typeof nextM === 'number' && Number.isFinite(nextM) ? nextM : 0;
    const curNum = typeof curM === 'number' && Number.isFinite(curM) ? curM : 0;
    if (nextNum >= curNum) merged.set(id, r);
  });
  return Array.from(merged.values());
};
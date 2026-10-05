import type { CompanyConfig, PosSource } from './config.js';

// ═══════════════════════════════════════════════════════
//  فحص صحة الشركة
//  ⭐ يقرأ metadata فقط — لا يتصل بقاعدة البيانات أبداً
// ═══════════════════════════════════════════════════════

export interface HealthPayload {
  ok: boolean;
  service?: string;
  version?: string;
  schemaVersion?: string;
  dbSizeMb?: number;
  rows?: Record<string, number>;
  lastBackup?: string | null;
  uptime?: number;
}

export interface CompanyStatus {
  id: string;
  name: string;
  nameAr?: string | undefined;
  subdomain: string;
  port: number;
  legacyPort?: number | undefined;
  posSource: PosSource;
  posEnabled: boolean;
  healthy: boolean;
  appVersion?: string | undefined;
  schemaVersion?: string | undefined;
  dbSizeMb?: number | undefined;
  rows?: Record<string, number> | undefined;
  lastBackup?: string | null | undefined;
  uptimeSeconds?: number | undefined;
  error?: string;
  checkedAt: string;
}

const TIMEOUT_MS = 2_500;

async function probePort(
  port: number,
): Promise<{ ok: boolean; data?: HealthPayload; error?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: (await res.json()) as HealthPayload };
  } catch (e) {
    const err = e as Error;
    const msg =
      err.name === 'TimeoutError' || err.name === 'AbortError'
        ? `timeout ${TIMEOUT_MS}ms`
        : err.message;
    return { ok: false, error: msg };
  }
}

export async function probe(c: CompanyConfig): Promise<CompanyStatus> {
  const base = {
    id: c.id,
    name: c.name,
    nameAr: c.nameAr,
    subdomain: c.subdomain,
    port: c.port,
    legacyPort: c.legacy?.port,
    // ⭐ الشركة بلا كتلة pos تظهر "none" لا undefined — اللوحة تعرض
    //    العمود دائماً، والـ frontend مابيش يحتاج case تاني.
    posSource: c.pos?.source ?? 'none',
    posEnabled: c.pos?.enabled === true,
    checkedAt: new Date().toISOString(),
  };

  const r = await probePort(c.port);

  return {
    ...base,
    healthy: r.ok && r.data?.ok === true,
    appVersion: r.data?.version,
    schemaVersion: r.data?.schemaVersion,
    dbSizeMb: r.data?.dbSizeMb,
    rows: r.data?.rows,
    lastBackup: r.data?.lastBackup,
    uptimeSeconds: r.data?.uptime,
    error: r.error ?? (r.data && r.data.ok !== true ? 'ok=false' : undefined),
  };
}

/** ⭐ نسخة احتياطية قديمة = تحذير (لا يمنع) */
export function backupAge(lastBackup?: string | null): {
  days: number | null;
  stale: boolean;
} {
  if (!lastBackup) return { days: null, stale: true };
  const days = Math.floor((Date.now() - Date.parse(lastBackup)) / 86_400_000);
  return { days, stale: days > 2 };
}

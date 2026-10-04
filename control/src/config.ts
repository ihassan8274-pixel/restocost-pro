import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import type { Document } from 'yaml';

// ═══════════════════════════════════════════════════════
//  أنواع
// ═══════════════════════════════════════════════════════

export interface LegacyRef {
  port: number;
  note?: string;
}

export interface CompanyConfig {
  id: string;
  name: string;
  nameAr?: string;
  subdomain: string;
  port: number;
  databaseUrl: string;
  timezone?: string;
  active?: boolean;
  legacy?: LegacyRef;
}

export interface ControlConfig {
  port: number;
  subdomain: string;
}

export interface RootConfig {
  control: ControlConfig;
  companies: CompanyConfig[];
}

// ═══════════════════════════════════════════════════════
//  تحميل + ⭐ تحقق صارم
//  الملف نصف مكتوب يجب أن يُرفض loudly — لا يفتح بلاCompanies
// ═══════════════════════════════════════════════════════

// ⭐ module-relative, NOT cwd-relative — يعمل من أي مجلد تُشغّل منه
//    src/ و dist/ على نفس العمق ⇒ نفس المسار
const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(MODULE_DIR, '..', '..');

const CANDIDATES = [
  process.env['COMPANIES_CONFIG'],
  resolve(REPO_ROOT, 'config', 'companies.yaml'),
  resolve(process.cwd(), 'config', 'companies.yaml'),
  resolve(process.cwd(), 'companies.yaml'),
].filter((p): p is string => Boolean(p));

/** ⭐ أول مسار موجود؛ وإلا الافتراضي (لإنشاء ملف جديد) */
export function resolveConfigPath(): string {
  for (const p of CANDIDATES) if (existsSync(p)) return p;
  return resolve(REPO_ROOT, 'config', 'companies.yaml');
}

function readFirstExisting(): { path: string; raw: string } {
  const tried: string[] = [];
  for (const p of CANDIDATES) {
    try {
      return { path: p, raw: readFileSync(p, 'utf8') };
    } catch {
      tried.push(p);
    }
  }
  throw new Error(
    `تعذّر إيجاد companies.yaml.\n` +
      `   جرّبت:\n${tried.map((p) => `     • ${p}`).join('\n')}\n` +
      `   عدّل COMPANIES_CONFIG أو أنشئ config/companies.yaml في جذر المستودع.`,
  );
}

const REQUIRED = [
  'id',
  'name',
  'subdomain',
  'port',
  'databaseUrl',
] as const satisfies readonly (keyof CompanyConfig)[];

let cached: RootConfig | null = null;
let cachedAt = 0;
const TTL_MS = 5_000;

export function loadConfig(): RootConfig {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;   // ⭐ reread كل 5 ثوانٍ

  let raw: string;
  let CONFIG_PATH: string;
  try {
    const found = readFirstExisting();
    raw = found.raw;
    CONFIG_PATH = found.path;
  } catch (e) {
    throw e;
  }

  const cfg = parse(raw) as Partial<RootConfig> | null;
  const problems: string[] = [];

  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`${CONFIG_PATH} ليس YAML صالحاً`);
  }

  // ── control ──
  const port = cfg.control?.port;
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    problems.push(`control.port غير صالح: ${String(port)}`);
  }

  // ── companies ──
  const list = cfg.companies;
  if (!Array.isArray(list) || list.length === 0) {
    problems.push('companies فارغة — لا توجد شركة واحدة');
  }

  const seenId = new Set<string>();
  const seenPort = new Set<number>();

  for (const [i, c] of (list ?? []).entries()) {
    const label = c?.id ?? `#${i + 1}`;
    for (const field of REQUIRED) {
      if (c?.[field] === undefined || c?.[field] === '') {
        problems.push(`الشركة "${label}" ناقصها الحقل: ${field}`);
      }
    }
    if (typeof c?.port !== 'number') {
      problems.push(`الشركة "${label}" port يجب أن يكون رقماً`);
    }
    if (seenId.has(c?.id ?? '')) problems.push(`معرّف مكرر: ${c?.id}`);
    if (seenPort.has(c?.port ?? -1)) problems.push(`منفذ مكرر: ${c?.port}`);
    seenId.add(c?.id ?? '');
    seenPort.add(c?.port ?? -1);

    // 🔴 كلمة المرور الحقيقية = خطأ، لا accident
    if (typeof c?.databaseUrl === 'string' && !c.databaseUrl.includes('CHANGE_ME')) {
      if (/:\/\/[^:@]+:[^:@]+@/.test(c.databaseUrl)) {
        problems.push(
          `الشركة "${label}" databaseUrl فيه كلمة مرور حقيقية — ` +
            `استخدم متغير بيئة: \${process.env['DB_PASSWORD']}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `❌ ${CONFIG_PATH} غير صالح:\n` + problems.map((p) => `   • ${p}`).join('\n'),
    );
  }

  cached = cfg as RootConfig;
  cachedAt = now;
  return cached;
}

export function listCompanies(): CompanyConfig[] {
  return loadConfig().companies.filter((c) => c.active !== false);
}

export function getCompany(id: string): CompanyConfig | undefined {
  return listCompanies().find((c) => c.id === id);
}

export function controlConfig(): ControlConfig {
  return loadConfig().control;
}

export function resetCache(): void {
  cached = null;
  cachedAt = 0;
}

// ═══════════════════════════════════════════════════════
//  ⭐ الكتابة — تحافظ على التعليقات في YAML
//  parseDocument يبقي Document؛ re-stringify عادي يمسح كل تعليق
// ═══════════════════════════════════════════════════════

export type YamlDoc = Document;

export function loadDoc(): YamlDoc {
  return parseDocument(readFileSync(resolveConfigPath(), 'utf8'));
}

/** ⭐ كتابة ذرّية: ملف مؤقت ثم rename — لا يفسد الملف أبداً */
function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, path);
}

export function saveDoc(doc: YamlDoc): void {
  const path = resolveConfigPath();
  writeAtomic(path, doc.toString({ lineWidth: 0 }));
  resetCache();
}

/** ⭐ فحص قبل الحفظ — نفس قواعد القراءة، يمنع الدخول الفاسد */
function assertValid(list: CompanyConfig[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const ports = new Set<number>();
  const hosts = new Set<string>();

  for (const [i, c] of list.entries()) {
    const label = c.id || `#${i + 1}`;
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(c.id ?? '')) {
      problems.push(`"${label}": id يجب أن يكون أحرفاً صغيرة وأرقاماً وشرطات فقط`);
    }
    for (const f of REQUIRED) {
      if (c[f] === undefined || c[f] === '') problems.push(`"${label}" ناقص: ${f}`);
    }
    if (typeof c.port !== 'number' || c.port < 1024 || c.port > 65535) {
      problems.push(`"${label}": port يجب أن يكون 1024-65535`);
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.subdomain ?? '')) {
      problems.push(`"${label}": subdomain غير صالح (${c.subdomain})`);
    }
    if (ids.has(c.id)) problems.push(`id مكرر: ${c.id}`);
    if (ports.has(c.port)) problems.push(`port مكرر: ${c.port}`);
    if (hosts.has(c.subdomain)) problems.push(`subdomain مكرر: ${c.subdomain}`);
    ids.add(c.id); ports.add(c.port); hosts.add(c.subdomain);
  }
  return problems;
}

function commitDoc(doc: YamlDoc): void {
  const problems = assertValid(readList(doc));
  if (problems.length > 0) {
    throw new Error(
      `❌ لم يُحفظ — ${problems.length} مشكلة:\n` +
        problems.map((p) => `   • ${p}`).join('\n'),
    );
  }
  saveDoc(doc);
}

// ⭐ __trap__ (مُختبَر):
//    doc.get(key)        ⇒ YAMLSeq node  — ليس array
//    doc.get(key, true)  ⇒ proxy — stringifies كـ array لكن .push غير موجودة
//    doc.toJS()          ⇒ ⭐ JavaScript نقي — استخدمه للقراءة
//    doc.addIn(path, v)  ⇒ ⭐ يعمل على seq قائم ويحافظ على التعليقات
//    doc.set(key, [])    ⇒ ⛔ يُفشِل addIn بعدها ("Expected YAML collection")
const readList = (doc: YamlDoc): CompanyConfig[] => {
  const js = doc.toJS() as Partial<RootConfig> | null;
  return Array.isArray(js?.companies) ? js.companies : [];
};

export function addCompany(c: CompanyConfig): CompanyConfig {
  const doc = loadDoc();
  const list = readList(doc);

  if (list.some((x) => x.id === c.id)) {
    throw new Error(`شركة بمعرّف "${c.id}" موجودة بالفعل`);
  }
  if (list.some((x) => x.port === c.port)) {
    throw new Error(`المنفذ ${c.port} مستخدم بالفعل`);
  }

  const entry = { ...c, active: c.active ?? true };
  if (doc.has('companies')) {
    doc.addIn(['companies'], entry);      // ⭐ يحافظ على كل التعليقات
  } else {
    doc.set('companies', [entry]);        // ملف جديد — seq من الصفر
  }

  commitDoc(doc);
  return c;
}

/** ⭐ تعديل جزئي — الحقول غير المذكورة تبقى */
export function updateCompany(
  id: string,
  patch: Partial<Omit<CompanyConfig, 'id'>>,
): CompanyConfig {
  const doc = loadDoc();
  const list = readList(doc);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error(`شركة بمعرّف "${id}" غير موجودة`);

  const merged: CompanyConfig = { ...list[idx]!, ...patch, id };
  doc.setIn(['companies', idx], merged);
  commitDoc(doc);
  return merged;
}

/** ⭐ ⛔ يزيل من الإعدادات فقط — لا يمس قاعدة البيانات أبداً */
export function removeCompany(id: string): { id: string; dbName: string } {
  const doc = loadDoc();
  const list = readList(doc);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) throw new Error(`شركة بمعرّف "${id}" غير موجودة`);

  const dbName = dbNameFrom(list[idx]!.databaseUrl);
  doc.deleteIn(['companies', idx]);
  saveDoc(doc);
  return { id, dbName };
}

/** ⭐ @restocost_massobi ← restocost_massobi */
export function dbNameFrom(url: string): string {
  const m = /\/([^/?#]+)(?:[?#]|$)/.exec(url);
  return m?.[1] ?? 'unknown';
}

export function nextPort(list: CompanyConfig[]): number {
  const used = new Set(list.map((c) => c.port));
  for (let p = 3011; p < 3099; p++) if (!used.has(p)) return p;
  throw new Error('لا يوجد منفذ متاح بين 3011-3099');
}

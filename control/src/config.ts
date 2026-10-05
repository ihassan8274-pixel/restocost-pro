import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import type { Document } from 'yaml';

// ═══════════════════════════════════════════════════════
//  ⭐ توسعة متغيرات البيئة
// ═══════════════════════════════════════════════════════

/**
 * ⭐ لماذا `${VAR}` بدل كلمة مرور حرفية في YAML:
 *    config/companies.yaml يتم commit في git. كلمة مرور حرفية هناك = سر
 *    داخل المستودع للأبد.
 *
 * ⭐ لماذا ترمي استثناءً بدل استبدال فارغ:
 *    الاستبدال الفارغ ينتج `postgres://restocost_app:@127.0.0.1/db` — شكله
 *    صحيح، فيتصل بقاعدة غلط أو يفشل بعدين برسالة غامضة.
 *    نفس فكرة commit d6a9523: القيمة الصامتة أسوأ من قيمة صريحة.
 *    "مقدرتش أعرف" لازم يبان.
 *
 * الصيغة المدعومة:  ${NAME}            → إجباري
 *                    ${NAME:-القيمة}    → اختياري
 */
export const ENV_REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/** ⭐ قواعد legacy — لا يجوز أن يشير entry شركة إليها */
export const LEGACY_DATABASES = new Set(['restocost', 'restocost2']);

export function interpolateEnv(
  raw: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const missing: string[] = [];

  const out = raw.replace(ENV_REF, (_all, name: string, def?: string) => {
    const v = env[name];
    if (v !== undefined && v !== '') return v;
    if (def !== undefined) return def;
    missing.push(name);
    return '';
  });

  if (missing.length > 0) {
    throw new Error(
      `متغير بيئة غير معرّف: ${[...new Set(missing)].join('، ')}\n` +
        `   في: ${raw}\n` +
        `   أضِفه إلى control/.env (غير متتبَّع في git).`,
    );
  }

  // ⛔ خطأ إملائي مثل ${DABASE_URL} يعدّي الـ replace أعلاه ويصل للسائق
  //    كـ نص حرفي، فيفشل وقت الاتصال برسالة غامضة. امسكه هنا بدل هناك.
  //    ⭐ نفحص ${ فقط وليس } وحدها — كلمة مرور تحتوي } ممكنة، أما ${ فاحتمالها ضئيل.
  if (out.includes('${')) {
    const bad = /\$\{[^}]*\}?/.exec(out)?.[0] ?? '${';
    throw new Error(
      `مرجع متغير بيئة مش مكتمل: ${bad}\n` +
        `   الصيغة الصحيحة: \${NAME}  أو  \${NAME:-قيمة-افتراضية}`,
    );
  }

  return out;
}

/** ⭐ هل يحتوي النص على مرجع ${...}؟ (نسخة جديدة من الـ regex كل مرة لتفادي lastIndex) */
const hasEnvRef = (s: string): boolean => new RegExp(ENV_REF.source).test(s);

/**
 * ⭐ فحص عنوان قاعدة البيانات — مشترك بين مسار القراءة ومسار الكتابة.
 *
 * ⛔⛔ كان الفحص موجوداً في loadConfig() فقط. مسار الكتابة (POST/PATCH على
 *    /api/config) يمرّ من assertValid() التي لا تحتوي أي فحص لكلمة المرور،
 *    أي كان يمكن حفظ كلمة مرور حرفية في YAML عبر الـ API ثم تُحفظ في git.
 *    نفس الفحص، نفس القواعد، في المكانين.
 */
function checkDatabaseUrl(
  label: string,
  raw: unknown,
  problems: string[],
  opts: { resolve: boolean },
): void {
  if (typeof raw !== 'string' || raw === '') return;   // REQUIRED يلتقط الفراغ

  // ⭐ CHANGE_ME أولاً: هو placeholder مش سر، ولازم يبقى في رسالة صريحة
  //    "لسه متملوش" بدل ما يتبلع في رسالة "كلمة مرور حرفية".
  // ⭐ مفيش return مبكر — problems بتتجمّع كلها عشان المستخدم يشوفها مرة
  //    واحدة. لو رجعنا عند أول مشكلة، هنخفي الباقي ونخلّيه يصحح واحد واحد.
  if (raw.includes('CHANGE_ME')) {
    problems.push(
      `الشركة "${label}" databaseUrl لسه فيه CHANGE_ME — ` +
        `استبدله بـ \${COMPANY_DB_PASSWORD}`,
    );
  }

  // ⛔ كلمة مرور حرفية في ملف يتم committing → سر في المستودع
  if (!hasEnvRef(raw) && /:\/\/[^:@/\s]+:[^:@/\s]+@/.test(raw)) {
    problems.push(
      `الشركة "${label}" databaseUrl فيه كلمة مرور حرفية — ` +
        `استخدم \${COMPANY_DB_PASSWORD} بدلاً منها`,
    );
  }

  // فحص بناء الـ ${...} حتى بدون متغيرات بيئة (مسار الكتابة)
  const badRef = raw.match(/\$\{[^}]*\}?/)?.[0];
  if (badRef && !/^\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}$/.test(badRef)) {
    problems.push(`الشركة "${label}" مرجع متغير بيئة مش صالح: ${badRef}`);
  }

  if (!opts.resolve) return;

  // ⭐ هنا فقط نفكّ المتغيرات — الفشل يُسجَّل، ومفيش silent pass
  let resolved: string;
  try {
    resolved = interpolateEnv(raw);
  } catch (e) {
    problems.push(`الشركة "${label}": ${(e as Error).message.split('\n')[0]}`);
    return;
  }

  let u: URL;
  try {
    u = new URL(resolved);
  } catch {
    problems.push(`الشركة "${label}" databaseUrl ليس URL صالح بعد التوسعة`);
    return;
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
    problems.push(`الشركة "${label}" databaseUrl بروتوكول غير مدعوم: ${u.protocol}`);
  }
  if (!u.hostname) problems.push(`الشركة "${label}" databaseUrl بلا host`);

  const db = u.pathname.replace(/^\//, '');
  if (LEGACY_DATABASES.has(db)) {
    problems.push(
      `الشركة "${label}" يشير إلى قاعدة legacy "${db}" — ` +
        `كل شركة ليها قاعدة مستقلة، ولا يجوز أن يشير إلى قاعدة الإنتاج`,
    );
  }
}

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

// ⭐ دالة، مش ثابت — لو كانت ثابتة لالتقطت COMPANIES_CONFIG مرة واحدة وقت
//    تحميل الموديول، وأي تغيير في البيئة بعد كده (زي الاختبارات) يتجاهل بصمت.
const candidates = (): string[] =>
  [
    process.env['COMPANIES_CONFIG'],
    resolve(REPO_ROOT, 'config', 'companies.yaml'),
    resolve(process.cwd(), 'config', 'companies.yaml'),
    resolve(process.cwd(), 'companies.yaml'),
  ].filter((p): p is string => Boolean(p));

/** ⭐ أول مسار موجود؛ وإلا الافتراضي (لإنشاء ملف جديد) */
export function resolveConfigPath(): string {
  for (const p of candidates()) if (existsSync(p)) return p;
  return resolve(REPO_ROOT, 'config', 'companies.yaml');
}

function readFirstExisting(): { path: string; raw: string } {
  const tried: string[] = [];
  for (const p of candidates()) {
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

  // ⭐ الكائنات المعادة — databaseUrl فيها القيم المفسَّرة، لا ${...}
  const out: CompanyConfig[] = [];

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

    // ⭐ فحص عنوان قاعدة البيانات — توسعة + تحقق (كان inline هنا فقط)
    checkDatabaseUrl(label, c?.databaseUrl, problems, { resolve: true });

    // ⭐ نضع المفسَّر في الكائن المعاد. الفشل سُجّل في problems فوق بالفعل،
    //    فالـ catch هنا موجود فقط حتى لا يتسرّب استثناء غير متوقع؛ ولأن
    //    problems.length > 0 يعني loadConfig سيرمي error تخدمه.
    let resolvedUrl = typeof c?.databaseUrl === 'string' ? c.databaseUrl : '';
    try {
      resolvedUrl = interpolateEnv(resolvedUrl);
    } catch {
      /* problems[] امتلأ فوق — نُبقي النص الخام */
    }
    out.push({ ...(c as CompanyConfig), databaseUrl: resolvedUrl });
  }

  if (problems.length > 0) {
    throw new Error(
      `❌ ${CONFIG_PATH} غير صالح:\n` + problems.map((p) => `   • ${p}`).join('\n'),
    );
  }

  // ⭐ نخزّن النسخة المعادة (المفسَّرة)، لا الـ YAML الخام
  cached = { control: cfg.control as ControlConfig, companies: out };
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
    // ⛔⛔ الفحص كان ناقصاً هنا بالكامل. loadConfig() كان يفحص كلمة المرور
    //    الحرفية، لكن assertValid() — وهو ما يحرس POST/PATCH على /api/config —
    //    لم يكن يفحصها. النتيجة: ممكن تبعت databaseUrl فيه كلمة مرور عبر
    //    الـ API، يُحفظ في YAML، ثم يُحفظ في git.
    checkDatabaseUrl(c.id || `#${i + 1}`, c.databaseUrl, problems, { resolve: false });
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

/** ⭐ @restocost_massobi ← restocost_massobi
 *
 *  ⭐ It expands `${...}` first so a `${DB_NAME}` in the path still works.
 *    On failure it falls back to the raw string instead of throwing: this runs
 *    on the DELETE path, where the entry is about to be removed anyway and a
 *    throw would leave a half-completed delete. It returns `unknown` rather
 *    than a wrong name so no caller can act on a guess.
 */
export function dbNameFrom(url: string): string {
  let source = url;
  try {
    source = interpolateEnv(url);
  } catch {
    /* fall through to the raw string */
  }
  const m = /\/([^/?#]+)(?:[?#]|$)/.exec(source);
  return m?.[1] ?? 'unknown';
}

export function nextPort(list: CompanyConfig[]): number {
  const used = new Set(list.map((c) => c.port));
  for (let p = 3011; p < 3099; p++) if (!used.has(p)) return p;
  throw new Error('لا يوجد منفذ متاح بين 3011-3099');
}

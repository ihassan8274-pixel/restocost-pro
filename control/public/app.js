// ═══════════════════════════════════════════════════════
//  RestoCost Control — companies CRUD
//  ⭐ CSP: script-src 'self' — no inline script
// ═══════════════════════════════════════════════════════

const REFRESH_MS = 15_000;
const TOKEN_KEY = 'restocost.control.token';   // ⭐ sessionStorage, لا localStorage

const $ = (id) => document.getElementById(id);
const el = {
  grid: $('grid'), summary: $('summary'), subtitle: $('subtitle'),
  stamp: $('stamp'), refresh: $('refresh'),
  add: $('add-company'), unlock: $('unlock'), hint: $('mode-hint'),
  dlg: $('dlg'), form: $('form'), title: $('dlg-title'), fields: $('fields'),
  problems: $('problems'), msg: $('msg'), cancel: $('cancel'), save: $('save'),
};

// ── token ──────────────────────────────────────────────
const getToken = () => sessionStorage.getItem(TOKEN_KEY) ?? '';
const setToken = (t) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY));

async function api(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  const t = getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (opts.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || data.ok === false) {
    const e = new Error(data.error ?? `HTTP ${res.status}`);
    e.payload = data;
    e.status = res.status;
    throw e;
  }
  return data;
}

// ── fmt ────────────────────────────────────────────────
const fmtBytes = (mb) => mb == null ? '—' : mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
const fmtUptime = (s) => {
  if (s == null) return '—';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtBackup = (b) => (!b || b.days == null) ? { text: 'never ⚠', warn: true }
  : b.stale ? { text: `${b.days}d ago ⚠`, warn: true }
  : { text: b.days === 0 ? 'today' : `${b.days}d ago`, warn: false };

const cell = (k, v, warn = false) =>
  `<div class="cell${warn ? ' warn' : ''}"><div class="k">${k}</div><div class="v">${v ?? '—'}</div></div>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// ── render ─────────────────────────────────────────────
function renderSummary(s) {
  const stats = [
    ['Companies', s.total, ''],
    ['Healthy', s.healthy, s.healthy === s.total ? 'ok' : 'warn'],
    ['Down', s.down, s.down > 0 ? 'down' : 'ok'],
    ['Stale backup', s.staleBackup, s.staleBackup > 0 ? 'warn' : 'ok'],
    ['Versions', s.versions.join(' · '), s.versions.length > 1 ? 'warn' : ''],
  ];
  el.summary.innerHTML = stats
    .map(([k, n, cls]) => `<div class="stat ${cls}"><div class="n">${n}</div><div class="k">${k}</div></div>`)
    .join('');
}

let WRITABLE = false;

function renderCard(c) {
  const bk = fmtBackup(c.backup);
  const total = c.rows ? Object.values(c.rows).reduce((a, b) => a + b, 0).toLocaleString() : null;

  const cells = [
    cell('Domain', `<a href="https://${c.subdomain}" target="_blank" rel="noopener">${c.subdomain}</a>`),
    cell('Local port', `:${c.port}`),
    cell('App version', c.appVersion),
    cell('Schema', c.schemaVersion),
    cell('DB size', fmtBytes(c.dbSizeMb)),
    cell('Rows', total),
    cell('Uptime', fmtUptime(c.uptimeSeconds)),
    cell('Last backup', bk.text, bk.warn),
  ].join('');

  return `
  <article class="card ${c.healthy ? 'up' : ''}" data-id="${esc(c.id)}">
    <div class="card-head">
      <span class="dot"></span>
      <div class="card-title">
        <h2>${esc(c.name)}${c.nameAr ? `<bdi class="ar" dir="rtl"> · ${esc(c.nameAr)}</bdi>` : ''}</h2>
      </div>
      <span class="badge ${c.healthy ? 'ok' : ''}">${c.healthy ? 'ONLINE' : 'OFFLINE'}</span>
    </div>

    <div class="rows">${cells}</div>
    ${c.error ? `<div class="err">${esc(c.error)}</div>` : ''}
    ${c.legacyPort ? `<div class="legacy">🟡 Legacy instance still on port :${c.legacyPort}</div>` : ''}

    <div class="actions">
      <a class="primary" href="https://${c.subdomain}" target="_blank" rel="noopener">Open</a>
      <a href="http://127.0.0.1:${c.port}" target="_blank" rel="noopener">Local</a>
      ${WRITABLE ? `<button type="button" data-act="edit" data-id="${esc(c.id)}">Edit</button>
                    <button type="button" data-act="del"  data-id="${esc(c.id)}" class="danger">Delete</button>` : ''}
    </div>
  </article>`;
}

function setMode(on, why = '') {
  WRITABLE = on;
  el.hint.textContent = on ? 'editing enabled' : (why || 'read-only');
  el.hint.classList.toggle('on', on);
  el.unlock.textContent = on ? '🔓 Editing on' : '🔒 Enable editing';
}

async function load() {
  try {
    const data = await api('/api/companies');
    const cs = data.companies;

    el.subtitle.textContent = `${cs.length} compan${cs.length === 1 ? 'y' : 'ies'} · loopback only`;
    renderSummary(data.summary);

    // ⭐ renderCard نفسها لا تُدرج أزرار التعديل إلا إذا WRITABLE
    el.grid.innerHTML = cs.map(renderCard).join('');
  } catch (e) {
    if (e.status === 503) setMode(false, 'write disabled on server');
    el.grid.innerHTML = `<p class="empty">❌ ${esc(e.message)}</p>`;
  } finally {
    el.stamp.textContent = new Date().toLocaleTimeString();
  }
}

// ── dialog ─────────────────────────────────────────────
function showProblems(list, msg) {
  el.problems.hidden = !list?.length;
  el.problems.innerHTML = (list ?? []).map((p) => `<li>${esc(p)}</li>`).join('');
  el.msg.hidden = !msg;
  el.msg.textContent = msg ?? '';
}

function field(name, label, value, opts = {}) {
  return `<div class="field">
    <label for="f-${name}">${label}</label>
    <input id="f-${name}" name="${name}" value="${esc(value ?? '')}"
      ${opts.readonly ? 'disabled' : ''} ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}>
    ${opts.note ? `<div class="note">${esc(opts.note)}</div>` : ''}
  </div>`;
}

function openDialog(mode, c = null, suggest = null) {
  el.title.textContent = mode === 'add' ? 'New company' : `Edit — ${c.name}`;
  showProblems([], null);

  if (mode === 'add') {
    el.fields.innerHTML =
      field('name', 'Display name *', '') +
      field('nameAr', 'Arabic name', '', { placeholder: 'بخارو' }) +
      field('id', 'ID *', '', { placeholder: 'bukharo', note: 'lowercase, digits, hyphens' }) +
      field('subdomain', 'Subdomain *', suggest?.subdomain ?? '', { note: 'becomes the company URL' }) +
      field('port', 'Local port *', suggest?.port ?? '') +
      `<div class="check"><input type="checkbox" id="f-createDatabase" checked>
        <label for="f-createDatabase" style="text-transform:none;font-size:13.5px;margin:0">
          Create PostgreSQL database</label></div>`;
    el.save.textContent = 'Create';
  } else {
    el.fields.innerHTML =
      field('name', 'Display name *', c.name) +
      field('nameAr', 'Arabic name', c.nameAr) +
      field('subdomain', 'Subdomain *', c.subdomain) +
      field('port', 'Local port *', c.port) +
      `<div class="check"><input type="checkbox" id="f-active" ${c.active !== false ? 'checked' : ''}>
        <label for="f-active" style="text-transform:none;font-size:13.5px;margin:0">Active</label></div>`;
    el.save.textContent = 'Save';
  }

  el.dlg.dataset.mode = mode;
  el.dlg.dataset.id = c?.id ?? '';
  el.dlg.showModal();
}

const val = (n) => document.getElementById(`f-${n}`)?.value.trim();

async function save() {
  const mode = el.dlg.dataset.mode;
  const id = el.dlg.dataset.id;
  el.save.disabled = true;
  showProblems([], null);

  try {
    if (mode === 'add') {
      const r = await api('/api/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: val('name'), nameAr: val('nameAr'), id: val('id'),
          subdomain: val('subdomain'), port: Number(val('port')),
          createDatabase: document.getElementById('f-createDatabase').checked,
        }),
      });
      el.dlg.close();
      await load();
      el.msg.hidden = true;
      alert(`✅ ${r.company.name} added.\n\nDatabase: ${r.database?.message ?? 'skipped'}\n\n`
          + `⚠️ Still to do manually (needs admin PowerShell):\n`
          + `  nssm install RestoCost-${r.company.id} node "…\\api\\dist\\main.js"\n`
          + `  nssm set RestoCost-${r.company.id} AppEnvironmentExtra COMPANY_ID=${r.company.id} PORT=${r.company.port}\n`
          + `  cloudflared tunnel route dns restocost ${r.company.subdomain}`);
    } else {
      await api(`/api/companies/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: val('name'), nameAr: val('nameAr'),
          subdomain: val('subdomain'), port: Number(val('port')),
          active: document.getElementById('f-active').checked,
        }),
      });
      el.dlg.close();
      await load();
    }
  } catch (e) {
    const p = e.payload ?? {};
    showProblems(
      p.problems ?? [p.error ?? e.message].filter(Boolean),
      p.hint,
    );
  } finally {
    el.save.disabled = false;
  }
}

async function remove(id) {
  const ok = confirm(
    `Remove "${id}" from config?\n\n` +
    `⚠️ This does NOT drop the database.\n` +
    `⚠️ The company URL will stop being served.`,
  );
  if (!ok) return;
  try {
    const r = await api(`/api/companies/${encodeURIComponent(id)}?confirm=${encodeURIComponent(id)}`,
      { method: 'DELETE' });
    await load();
    alert(`✅ ${r.removed} removed from config.\n\nDatabase kept: ${r.databaseKept}\n\n${r.nextStep}`);
  } catch (e) {
    alert(`❌ ${e.message}`);
  }
}

// ── events ─────────────────────────────────────────────
el.add.addEventListener('click', async () => {
  const s = await api('/api/admin/suggest').catch(() => null);
  openDialog('add', null, s);
});

el.unlock.addEventListener('click', () => {
  const t = prompt('Admin token (CONTROL_ADMIN_TOKEN from control/.env):');
  if (t === null) return;
  setToken(t.trim());
  if (t.trim()) {
    api('/api/config/reload', { method: 'POST' })
      .then(() => { setMode(true); load(); })
      .catch((e) => {
        setToken('');
        setMode(false, e.status === 401 ? 'wrong token' : 'read-only');
        alert(`❌ ${e.message}`);
      });
  }
});

el.grid.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'del') return remove(id);
  fetch('/api/companies/' + encodeURIComponent(id))
    .then((r) => r.json())
    .then((d) => openDialog('edit', d.company));
});

el.save.addEventListener('click', save);
el.cancel.addEventListener('click', () => el.dlg.close());
el.refresh.addEventListener('click', load);

// ── boot ───────────────────────────────────────────────
api('/api/admin/status')
  .then((s) => { if (!s.writeEnabled) setMode(false, 'write disabled (no token set)'); })
  .catch(() => {});
load();
setInterval(() => { if (!el.dlg.open) load(); }, REFRESH_MS);

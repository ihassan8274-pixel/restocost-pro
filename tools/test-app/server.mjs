#!/usr/bin/env node
// Test App — Endpoint Tester (zero dependencies; Node >= 18).
// Core flow: input (URL) -> POST /api/runs -> HTTP request performed -> result
// returned to the caller AND stored as a durable run record in data/runs.json.
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3099);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'runs.json');
const REQUEST_TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 8000);
const SNIPPET_BYTES = 300;
const METHODS = ['GET', 'POST', 'HEAD'];
const MAX_BODY_BYTES = 16 * 1024;

/* ------------------------------- store ------------------------------ */
const emptyStore = () => ({ version: 1, runs: [] });
async function readStore() {
  try { return JSON.parse(await fsp.readFile(DATA_FILE, 'utf8')); }
  catch { return emptyStore(); }
}
async function writeStore(store) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fsp.rename(tmp, DATA_FILE);
}
let writeLock = Promise.resolve();
function appendRun(run) {
  writeLock = writeLock.then(async () => {
    const store = await readStore();
    store.runs.push(run);
    await writeStore(store);
  });
  return writeLock;
}

/* ----------------------------- validation --------------------------- */
function validateInput(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) return { error: 'URL is required. Example: http://127.0.0.1:3099/health' };
  let parsed;
  try { parsed = new URL(url); }
  catch { return { error: 'URL is malformed. Include the scheme, e.g. http://host:port/path' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `Unsupported scheme "${parsed.protocol}". Use http:// or https://.` };
  }
  const method = String(raw.method || 'GET').toUpperCase();
  if (!METHODS.includes(method)) return { error: `Method "${method}" is not allowed. Use GET, POST or HEAD.` };
  let expectedStatus = null;
  if (raw.expectedStatus !== undefined && raw.expectedStatus !== null && String(raw.expectedStatus).trim() !== '') {
    const n = Number(raw.expectedStatus);
    if (!Number.isInteger(n) || n < 100 || n > 599) return { error: 'Expected status must be an integer between 100 and 599.' };
    expectedStatus = n;
  }
  return { input: { url, method, expectedStatus } };
}

/* ------------------------------ requester --------------------------- */
function performRequest(input) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve({ latencyMs: Date.now() - started, ...r }); } };
    let req;
    try {
      const target = new URL(input.url);
      const lib = target.protocol === 'https:' ? https : http;
      req = lib.request(target, { method: input.method, timeout: REQUEST_TIMEOUT_MS }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { if (buf.length < SNIPPET_BYTES * 2) buf += chunk; });
        res.on('end', () => finish({ statusCode: res.statusCode ?? null, bodySnippet: buf.slice(0, SNIPPET_BYTES), error: null }));
      });
      req.on('timeout', () => req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS} ms`)));
      req.on('error', (err) => finish({ statusCode: null, bodySnippet: '', error: err.message }));
      req.end();
    } catch (err) { finish({ statusCode: null, bodySnippet: '', error: err.message }); }
  });
}

/* -------------------------------- runs ------------------------------ */
function newId() { return `run-${Date.now()}-${randomBytes(3).toString('hex')}`; }

function buildRun(input, result) {
  const normalized = {
    statusCode: result.statusCode ?? null,
    latencyMs: result.latencyMs ?? null,
    bodySnippet: result.bodySnippet || '',
    error: result.error || null,
  };
  let status = 'success';
  let error = '';
  if (result.error) { status = 'failed'; error = result.error; }
  else if (input.expectedStatus !== null && result.statusCode !== input.expectedStatus) {
    status = 'failed'; error = `Expected status ${input.expectedStatus} but received ${result.statusCode}.`;
  } else if (input.expectedStatus === null && (result.statusCode < 200 || result.statusCode >= 400)) {
    status = 'failed'; error = `Received HTTP ${result.statusCode}.`;
  }
  return { id: newId(), ts: new Date().toISOString(), input, result: normalized, status, error };
}

function buildFailedRun(input, message) {
  return { id: newId(), ts: new Date().toISOString(), input, result: null, status: 'failed', error: message };
}

/* ------------------------------ helpers ----------------------------- */
const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};
const text = (res, statusCode, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(statusCode, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) { reject(new Error('Request body too large.')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

/* ------------------------------- server ----------------------------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /health') {
      return json(res, 200, { status: 'ok', app: 'test-app', ts: new Date().toISOString(), uptimeSec: Math.round(process.uptime()) });
    }

    if (route === 'GET /') {
      const html = await fsp.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8');
      return text(res, 200, html, 'text/html; charset=utf-8');
    }

    if (route === 'GET /api/runs') {
      const store = await readStore();
      let runs = store.runs.slice();
      const statusFilter = url.searchParams.get('status');
      if (statusFilter === 'success' || statusFilter === 'failed') runs = runs.filter((r) => r.status === statusFilter);
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (q) runs = runs.filter((r) => String(r.input?.url || '').toLowerCase().includes(q));
      const sort = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
      runs.sort((a, b) => (sort === 'asc' ? String(a.ts).localeCompare(String(b.ts)) : String(b.ts).localeCompare(String(a.ts))));
      return json(res, 200, { ok: true, count: runs.length, runs });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/runs/'.length));
      const store = await readStore();
      const run = store.runs.find((r) => r.id === id);
      if (!run) return json(res, 404, { ok: false, error: 'Run not found.' });
      return json(res, 200, { ok: true, run });
    }

    if (route === 'POST /api/runs') {
      let body = {};
      const raw = await readBody(req).catch(() => null);
      if (raw === null) return json(res, 400, { ok: false, error: 'Request body is missing or too large.' });
      try { body = raw ? JSON.parse(raw) : {}; }
      catch (e) {
        const run = buildFailedRun({ url: '', method: '', expectedStatus: null }, `Invalid JSON body: ${e.message}`);
        await appendRun(run);
        return json(res, 400, { ok: false, error: run.error, run });
      }
      const check = validateInput(body);
      if (check.error) {
        const run = buildFailedRun(
          { url: typeof body?.url === 'string' ? body.url : '', method: String(body?.method || ''), expectedStatus: null },
          check.error
        );
        await appendRun(run);
        return json(res, 400, { ok: false, error: check.error, run });
      }
      const result = await performRequest(check.input);
      const run = buildRun(check.input, result);
      await appendRun(run);
      return json(res, 200, { ok: true, run });
    }

    if (route === 'GET /favicon.ico') { res.writeHead(204); return res.end(); }
    return json(res, 404, { ok: false, error: 'Not found.' });
  } catch (err) {
    return json(res, 500, { ok: false, error: err && err.message ? err.message : 'Internal error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Test App running on http://${HOST}:${PORT} (data: ${DATA_FILE})`);
});

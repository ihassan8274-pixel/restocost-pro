// Automated smoke suite for Test App (node --test tests/).
// Covers: happy path, failure paths (empty / malformed / unreachable),
// persistence across a full app restart, and the on-disk store schema.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT || 3111);
const BASE = `http://127.0.0.1:${PORT}`;

let tmpDir;
let child;

async function waitReady(timeoutMs = 8000) {
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* not up yet */ }
    if (Date.now() - started > timeoutMs) throw new Error('App did not become ready in time');
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function startApp() {
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir },
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitReady();
}

async function stopApp() {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

const postRun = (payload) => fetch(`${BASE}/api/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
const listRuns = async (qs = '') => (await (await fetch(`${BASE}/api/runs${qs}`)).json()).runs;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-app-'));
  await startApp();
});

after(async () => {
  await stopApp();
});

test('happy path: submit a URL and receive a stored success record', async () => {
  const res = await postRun({ url: `${BASE}/health`, method: 'GET' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.run.status, 'success');
  assert.equal(body.run.result.statusCode, 200);
  assert.ok(body.run.id.startsWith('run-'), 'id has the documented prefix');
  assert.ok(!Number.isNaN(Date.parse(body.run.ts)), 'timestamp is an ISO date');
  const runs = await listRuns();
  assert.equal(runs.length, 1);
});

test('happy path: expected status matches and run is marked success', async () => {
  const body = await (await postRun({ url: `${BASE}/health`, expectedStatus: 200 })).json();
  assert.equal(body.run.status, 'success');
  assert.equal(body.run.input.expectedStatus, 200);
});

test('failure: empty input returns a readable error and stores a failed record', async () => {
  const res = await postRun({ url: '   ' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /URL is required/);
  assert.equal(body.run.status, 'failed');
  const failed = await listRuns('?status=failed');
  assert.equal(failed.length, 1);
});

test('failure: malformed URL is rejected readably', async () => {
  const body = await (await postRun({ url: 'not a url' })).json();
  assert.match(body.error, /malformed/i);
  assert.equal(body.run.status, 'failed');
});

test('failure: unreachable host stores error text without crashing', async () => {
  const body = await (await postRun({ url: 'http://127.0.0.1:9/' })).json();
  assert.equal(body.run.status, 'failed');
  assert.ok(body.run.error.length > 0, 'error text is present');
});

test('failure: expected status mismatch is recorded as failed', async () => {
  const body = await (await postRun({ url: `${BASE}/health`, expectedStatus: 418 })).json();
  assert.equal(body.run.status, 'failed');
  assert.match(body.run.error, /Expected status 418/);
});

test('persistence: records survive a full app restart with identical values', async () => {
  const before = await listRuns();
  assert.ok(before.length >= 5, `expected >=5 runs before restart, got ${before.length}`);
  await stopApp();
  await startApp();
  const after = await listRuns();
  assert.equal(after.length, before.length, 'same number of records after restart');
  assert.deepEqual(
    after.map((r) => r.id).sort(),
    before.map((r) => r.id).sort(),
    'same record ids after restart'
  );
  const sample = before[0];
  const again = after.find((r) => r.id === sample.id);
  assert.equal(again.ts, sample.ts);
  assert.deepEqual(again.input, sample.input);
  assert.equal(again.status, sample.status);
  assert.deepEqual(again.result, sample.result);
});

test('store: data file exists on disk with the documented schema', async () => {
  const store = JSON.parse(fs.readFileSync(path.join(tmpDir, 'runs.json'), 'utf8'));
  assert.equal(store.version, 1);
  assert.ok(Array.isArray(store.runs));
  const run = store.runs[0];
  for (const key of ['id', 'ts', 'input', 'result', 'status', 'error']) {
    assert.ok(key in run, `record has field "${key}"`);
  }
});

test('review: filtering by status and text search work', async () => {
  const failed = await listRuns('?status=failed');
  assert.ok(failed.every((r) => r.status === 'failed'));
  const search = await listRuns('?q=health');
  assert.ok(search.length >= 2);
  assert.ok(search.every((r) => String(r.input.url).includes('health')));
  const asc = await listRuns('?sort=asc');
  const desc = await listRuns('?sort=desc');
  assert.equal(asc[0].id, desc[desc.length - 1].id, 'sorting changes order as documented');
});

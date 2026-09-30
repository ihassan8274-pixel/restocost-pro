#!/usr/bin/env node
// Reset the run store: node reset.mjs
// Clears all stored run records (data/runs.json) intentionally.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'runs.json');

let cleared = 0;
try {
  const store = JSON.parse(await fsp.readFile(DATA_FILE, 'utf8'));
  cleared = Array.isArray(store.runs) ? store.runs.length : 0;
} catch { /* no store yet — nothing to count */ }

await fsp.mkdir(DATA_DIR, { recursive: true });
await fsp.writeFile(DATA_FILE, JSON.stringify({ version: 1, runs: [] }, null, 2), 'utf8');
console.log(`Reset complete. Cleared ${cleared} run record(s).`);
console.log(`Store: ${DATA_FILE}`);

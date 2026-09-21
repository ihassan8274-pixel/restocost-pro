// Build identity, shared by /health, /ready and /api/bootstrap so every
// authenticated response carries the deployed client fingerprint. The client
// uses "build" to detect stale UI (version handshake / refresh banner).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PKG_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
})();

export const buildFingerprint = (() => {
  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
    return crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);
  } catch { return 'no-dist'; }
})();

export const serverStamp = (() => {
  try {
    const h = crypto.createHash('sha256');
    for (const name of fs.readdirSync(__dirname)) {
      if (!(name.endsWith('.mjs') || name.endsWith('.js'))) continue;
      h.update(name + ':' + fs.statSync(path.join(__dirname, name)).mtimeMs);
    }
    return h.digest('hex').slice(0, 10);
  } catch { return '?'; }
})();
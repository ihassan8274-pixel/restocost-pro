import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// بصمة تُخبز داخل الحزمة وقت البناء، وتُعرض في تذييل الشريط الجانبي.
// الغرض: يستطيع المستخدم (وأنا) تمييز «نافذة تعمل على بناء قديم» عن «النشر لم
// يصل» — وهو تمييز مستحيل بدون رقم ظاهر، لأن الحزمة نفسها لا تكشف نسختها.
function sourceStamp(): string {
  try {
    const h = crypto.createHash('sha256');
    const walk = (dir: string, depth: number) => {
      if (depth > 6) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (/\.(ts|tsx|css)$/.test(e.name)) h.update(e.name + ':' + fs.readFileSync(full));
      }
    };
    walk(path.resolve(__dirname, 'src'), 0);
    return h.digest('hex').slice(0, 10);
  } catch {
    return 'unknown';
  }
}

const VENDOR_GROUPS = new Map<string, string>([
  ['react', 'vendor-react'],
  ['react-dom', 'vendor-react'],
  ['scheduler', 'vendor-react'],
  ['react-router', 'vendor-react'],
  ['react-router-dom', 'vendor-react'],
  ['history', 'vendor-react'],
  ['axios', 'vendor-http'],
  ['zustand', 'vendor-http'],
  ['@tanstack', 'vendor-http'],
  ['lucide-react', 'vendor-icons'],
  ['zod', 'vendor-utils'],
  ['immer', 'vendor-utils'],
]);

// Split libraries per-package (immutable, far-future-cacheable). Anything not
// mapped keeps Rollup's default behaviour, so genuinely lazy exports
// (jsPDF, html2canvas, recharts, xlsx …) stay in their own on-demand chunks
// instead of being dragged into the eager entry graph.
function manualChunks(id: string): string | undefined {
  const idx = id.indexOf('node_modules/');
  if (idx === -1) return undefined;
  const rest = id.slice(idx + 'node_modules/'.length);
  const pkg = rest.startsWith('@') ? rest.split('/').slice(0, 2).join('/') : rest.split('/')[0];
  const group = VENDOR_GROUPS.get(pkg);
  if (group) return group;
  return `v-${pkg.replace(/[^a-z0-9@._-]/gi, '-')}`;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_STAMP__: JSON.stringify(sourceStamp()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});

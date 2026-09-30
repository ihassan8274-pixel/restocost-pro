import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

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

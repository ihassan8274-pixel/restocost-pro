import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // ⛔⛔ server/test/repo/** كان مشمول صح — لكن Vitest بيقرأ أول ملف
    //    vitest.config.* بالترتيب الأبجدي، فماشي .ts هو اللي بيتقرا،
    //    والملف .mjs اللي كان فيه اختبارات الخادم (18 اختبار CDC/Repository)
    //    اتجاهل بصمت تماماً.
    // ⭐ الملفات دي Node خالص، فكل واحد فيهم عليه
    //    // @vitest-environment node في أول سطر.
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/test/repo/**/*.test.mjs',
      'control/src/**/*.test.ts',
    ],
    // ⛔ كان 'server/**' — وده كان بيمسح test/repo مع بعض. استثنيناه صريح.
    exclude: ['node_modules/**', 'dist/**', 'server/data/**', 'server/tests/**'],
    css: false,
  },
});
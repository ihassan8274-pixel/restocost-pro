import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restocost.erp',
  appName: 'RestoCost ERP',
  webDir: 'dist',
  // يعمل WebView مباشرة على نفس أصل الخادم:
  // - لا مشكلة CORS (نفس الأصل)
  // - يعمل الكاش الأوفلاين + المزامنة + PWA كما في المتصفح
  server: {
    url: 'https://erp.restocost.shop',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
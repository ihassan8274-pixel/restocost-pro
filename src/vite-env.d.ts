/// <reference types="vite/client" />

/**
 * بصمة البناء، تُحقن في الحزمة وقت البناء (vite.config.ts → define).
 * تُعرض في تذييل الشريط الجانبي لمقارنتها ببصمة ‎/health‎ الخاصة بالسيرفر:
 * اختلافهما يعني أن الصفحة تعمل على بناء أقدم من المنشور.
 */
declare const __BUILD_STAMP__: string;
// تطبيق السمة على واجهة DOM — دالة خالصة بلا متجر ولا حالة.
//
// كانت في src/context/domains/ui.ts alongside متجر useUIStore. حُذف ذلك
// المجلد، لأنه كان شجرة متاجر موازية غير موصولة بالخادم (بند تدقيقي).
// السلوك نفسه باقٍ: main.tsx يقرأ 'rcerp-ui' من localStorage ويستدعي هذه
// الدالة قبل أول رسم، وإلا رأى مستخدم الوضع الداكن وميضاً أبيض كل إعادة تحميل.

/** يطبّق السمة على عنصر <html> ومتصفحه (أشرطة التمرير وعناصر النموذج). */
export function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#1c1917' : '#fafaf9';
}
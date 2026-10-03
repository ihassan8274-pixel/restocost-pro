import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// بصمة البناء مخبوزة في هذه الحزمة وقت البناء (__BUILD_STAMP__ من vite.config).
// المكتوبة هنا هي الكود الذي يعمل أمام المستخدم فعلاً، لا ما خزّنه المتصفح.
//
// ثلاث نسخ من هذا الملف كانت مصدّرة لعطب واحد: المستخدم يبقى على واجهة قديمة
// مع شريط لا ينتهي.
//
//  1) كان الفحص مرة واحدة عند الإقلاع (useEffect[]) — أي تبويب مفتوح عبر
//     النشر يبقى على الشيفرة القديمة طوال الجلسة، والتنبيه لا يظهر أبداً.
//  2) قورنت بصمة localStorage ببصمة السيرفر. لكن localStorage هذه كُتبت من
//     عميل *لا يعرف* ببصمته (قبل خبزها في الحزمة)، فهي قيمة عشوائية من
//     viewpoint العميل. والنتيجة أسوأ من الغياب: عند الاختلاف نُظهر التنبيه
//     ونمتنع عن تحديث المخزَّنة، فيبقى الاختلاف قائماً بعد إعادة التحميل —
//     الشريط يظهر، تختار «إعادة التحميل الآن»، فيعود الشريط. لا مخرج.
//  3) النتيجة: «لا يوجد شي» — لا تغيّر في الشاشات ولا في التنبيه.
//
// الآن: المصدر الوحيد للحقيقة هو البصمة المخبوزة. يقارنها العميل بما يبلّغه
// السيرفر عن البناء المنشور فعلاً. متساويان ⇒ أنت على الأحدث. مختلفان ⇒
// المنشور أحدث ⇒ أعد التحميل. بعد التحميل تتساوى بالضرورة، فيختفي الشريط.
// لا ذاكرة، ولا احتمال لأن يدور.
const POLL_MS = 45_000;

const MINE: string = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';

export const VersionBanner: React.FC = () => {
  const [stale, setStale] = useState(false);
  const [deployed, setDeployed] = useState('');

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // بلا بصمة مخبوزة لا سبيل للمقارنة — لا نُظهر شيئاً بدل أن نُظهر تنبيهاً
      // كاذباً لا ينتهي.
      if (!MINE) return;
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        const deployed = typeof d.stamp === 'string' ? d.stamp : '';
        if (!deployed || cancelled) return;
        setDeployed(deployed);
        setStale(deployed !== MINE);
      } catch { /* offline / غير متاح — صمت */ }
    };

    check();
    const t = window.setInterval(check, POLL_MS);
    const onFocus = () => { check(); };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed bottom-5 right-1/2 translate-x-1/2 z-[95] w-auto max-w-[92vw]" dir="rtl">
      <div className="flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl border border-amber-300 bg-amber-500 text-white">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        <p className="text-xs font-extrabold leading-relaxed flex-1">
          تم نشر تحديث جديد للنظام — أعد تحميل الصفحة لتطبيقه
        </p>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 px-4 py-1.5 rounded-xl text-[11px] font-extrabold bg-white text-amber-700 hover:bg-amber-50 transition-colors"
        >
          إعادة التحميل الآن
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] font-bold text-amber-700/90" dir="ltr">
        you run {MINE} · deployed {deployed || '?'}
      </p>
    </div>
  );
};
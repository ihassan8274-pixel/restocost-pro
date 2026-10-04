import React from 'react';
import { BookOpen, Shield, LayoutDashboard, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader } from '../ui';

const FAQ: { q: string; a: string }[] = [
  { q: 'كيف يظهر بعض المستخدمين بيانات فرع واحد فقط؟', a: 'عند إنشاء مستخدم يتم تحديد فرعه. المستخدمون "جميع الفروع" يرون البيانات كاملة، بينما غيرهم مقيدون بفرعهم في التقارير والقوائم.' },
  { q: 'ما الفرق بين الصلاحيات والأدوار؟', a: 'الأدوار (مسؤول، مدير، محاسب تكاليف...) تملك مجموعة صلاحيات جاهزة في نظام المصادقة. صلاحية "manage_expenses" تسمح بالتسجيل بينما "approve_expenses" تسمح بالموافقة على الحالة.' },
  { q: 'كيف يتم تخزين البيانات؟', a: 'تُحفظ جميع البيانات محلياً على جهازك في قاعدة بيانات (SQLite) بجوار النظام، وليس في المتصفح. بيانات الدخول مشفرة بتجزئة SHA-256. لا تُرسل أي بيانات لخادم خارجي.' },
  { q: 'كيف يعمل المستشار الذكي؟', a: 'المستشار يحلل بياناتك الفعلية (المخزون، المبيعات، الهوالك، المصاريف) محلياً ويقدم توصيات مرتّبة بالأولوية دون الحاجة لاتصال خارجي.' },
];

const SECTIONS: { title: string; desc: string; steps: string[] }[] = [
  { title: 'الإعداد الأولي', desc: 'ابدأ بإدخال بياناتك الأساسية لضمان دقة الحسابات.', steps: ['أضف الفروع من "الإعدادات" (فرع + المطبخ المركزي).', 'أدخل المواد الخام مع الأسعار وحدود إعادة الطلب.', 'أنشئ الوصفات المعيارية بالمكونات ونسب الهدر.', 'حدد الهامش المستهدف العام (الافتراضي 32% في شاشة الوصفات).'] },
  { title: 'العمليات اليومية', desc: 'سير العمل اليومي من الشراء حتى البيع.', steps: ['أنشئ أوامر الشراء ثم فواتير الاستلام (GRN) لتحديث المخزون.', 'راجع أرصدة المخزون والتحويلات بين الفروع.', 'سجل المبيعات اليومية من شاشة "المبيعات اليومية" أو عبر نقطة البيع.', 'سجل الهوالك والفاقد فور حدوثه لتحميله على التكلفة.'] },
  { title: 'التحكم في التكاليف', desc: 'المراقبة والتحليل المستمر.', steps: ['تابع Food Cost من لوحة القيادة وتقارير التكاليف.', 'راجع إجمالي الربح ونسبته في قائمة الدخل.', 'استخدم هندسة المنيو لتحسين محفظة الأطباق.', 'راجع التوصيات من "المستشار الذكي" واتخذ قرارات.'] },
  { title: 'الرقابة الإدارية', desc: 'الحوكمة والمتابعة.', steps: ['أنشئ المستخدمين بالأدوار المناسبة من "إدارة المستخدمين".', 'تابع سجل التدقيق لأي إجراء حساس.', 'صدّر التقارير CSV لمشاركتها مع الإدارة.'] },
];

export const GuideView: React.FC = () => {
  const { currentUser, ROLE_LABELS: labels } = useApp() as any;

  return (
    <div className="space-y-6">
      <PageHeader title="دليل الاستخدام" subtitle="دليل عملي لبدء استخدام النظام وتشغيل العمليات اليومية" icon={<BookOpen className="w-6 h-6 text-indigo-600" />} />

      <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-2xl p-4">
        <Shield className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-extrabold text-slate-800">دورك الحالي: {labels?.[currentUser?.role] || '-'}</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">التنقل مقيد بصلاحيات دورك — الشاشات غير المتاحة لك لن تظهر في القائمة الجانبية.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-4">
            <h3 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5"><LayoutDashboard className="w-4 h-4 text-indigo-500" /> {s.title}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-2">{s.desc}</p>
            <ol className="space-y-1.5">
              {s.steps.map((st, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-700">
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-extrabold text-[9px]">{idx + 1}</span>
                  {st}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="font-extrabold text-slate-900 text-xs mb-3 flex items-center gap-1.5"><ChevronDown className="w-4 h-4 text-indigo-500" /> أسئلة شائعة</h3>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="bg-slate-50 border border-slate-200 rounded-xl p-3 group">
              <summary className="text-xs font-bold text-slate-800 cursor-pointer list-none flex items-center justify-between">{f.q}<ChevronDown className="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition-transform" /></summary>
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
};
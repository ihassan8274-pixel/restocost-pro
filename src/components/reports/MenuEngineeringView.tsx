import React from 'react';
import { LineChart as LineIcon, FileDown, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt, downloadCSV } from '../../utils/helpers';
import { openPrintWindow } from '../../utils/print';

type Quadrant = { name: string; label: string; color: string; bg: string; text: string; advice: string };

export const MenuEngineeringView: React.FC = () => {
  const { batchSalesRecords } = useApp();

  const itemMap = new Map<string, { nameAr: string; qty: number; revenue: number; cost: number }>();
  batchSalesRecords.forEach((b) => b.items.forEach((i) => {
    const cur = itemMap.get(i.recipeId) || { nameAr: i.recipeNameAr, qty: 0, revenue: 0, cost: 0 };
    cur.qty += i.quantitySold;
    cur.revenue += i.lineTotalRevenue;
    cur.cost += i.lineTotalCost;
    itemMap.set(i.recipeId, cur);
  }));

  const totalQty = [...itemMap.values()].reduce((s, v) => s + v.qty, 0) || 1;
  const avgMix = totalQty / itemMap.size || 1;
  const avgMargin = [...itemMap.values()].reduce((s, v) => s + (v.revenue - v.cost), 0) / itemMap.size || 1;

  const items = [...itemMap.values()].map((v) => {
    const margin = v.revenue - v.cost;
    return {
      ...v,
      marginPct: v.revenue ? (margin / v.revenue) * 100 : 0,
      isStar: v.qty >= avgMix && margin >= avgMargin,
      isPlowhorse: v.qty >= avgMix && margin < avgMargin,
      isPuzzle: v.qty < avgMix && margin >= avgMargin,
      isDog: v.qty < avgMix && margin < avgMargin,
      margin,
    };
  });

  const quadrants: Quadrant[] = [
    { name: 'star', label: 'النجوم', color: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', advice: 'ترويج مكثف، لا ترفع السعر، تأكد من استقرار الجودة' },
    { name: 'plowhorse', label: 'عمالة المطبخ', color: 'bg-sky-500', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', advice: 'مبيعات عالية بهامش منخفض — ارفع السعر قليلاً أو خفض التكلفة' },
    { name: 'puzzle', label: 'ألغاز', color: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', advice: 'هامش ممتاز لكن مبيعات ضعيفة — روج وضعه في منتصف المنيو' },
    { name: 'dog', label: 'الكلاب', color: 'bg-rose-500', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', advice: 'مبيعات وهامش ضعيفان — أعد تصميم الوصفة أو احذفه' },
  ];

  const itemsWithData = items.filter((i) => i.qty > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="هندسة المنيو (Menu Engineering)" subtitle="تحليل محفظة الأطباق: النجوم، الخيول العاملة، الألغاز، والكلاب" icon={<LineIcon className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar filename="هندسة المنيو" sheets={[
            {
              name: 'تحليل الأطباق',
              header: ['الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'هامش %', 'الربع'],
              rows: items.map((i) => [i.nameAr, i.qty, i.revenue, i.cost, i.margin, Number(i.marginPct.toFixed(2)), i.isStar ? 'نجم' : i.isPlowhorse ? 'خيل عامل' : i.isPuzzle ? 'لغز' : 'كلب']),
            },
          ]} />
          <Btn tone="ghost" onClick={() => openPrintWindow({
            title: 'تقرير هندسة المنيو',
            subtitle: `تحليل ${itemsWithData.length} صنفاً — طباعة ${new Date().toLocaleDateString('ar-SA-u-nu-latn')}`,
            meta: [
              ['النجوم', `${items.filter((i) => i.isStar).length}`], ['خيول عاملة', `${items.filter((i) => i.isPlowhorse).length}`],
              ['ألغاز', `${items.filter((i) => i.isPuzzle).length}`], ['كلاب', `${items.filter((i) => i.isDog).length}`],
            ],
            tables: [{
              title: 'تصنيف الأطباق والتوصيات',
              header: ['الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'هامش %', 'الربع'],
              rows: itemsWithData.map((i) => [i.nameAr, i.qty, fmt(i.revenue, 2), fmt(i.cost, 2), fmt(i.margin, 2), i.marginPct.toFixed(1), quadrants.find((q) => (i as unknown as Record<string, boolean>)[`is${q.name[0].toUpperCase()}${q.name.slice(1)}`])?.label || '-']),
            }],
            totals: [], footer: 'هندسة المنيو — RestoCost ERP',
          })}><Printer className="w-4 h-4" /> طباعة</Btn>
          <Btn tone="ghost" onClick={() => downloadCSV('MenuEngineering.csv', ['الصنف', 'الكمية', 'الإيراد', 'التكلفة', 'الهامش', 'الربع'], items.map((i) => [i.nameAr, i.qty, i.revenue, i.cost, i.margin, i.isStar ? 'نجم' : i.isPlowhorse ? 'خيل عامل' : i.isPuzzle ? 'لغز' : 'كلب']))}><FileDown className="w-4 h-4" /> تصدير</Btn>
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">النجوم</span><strong className="text-lg font-extrabold text-emerald-700 block mt-1">{items.filter((i) => i.isStar).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">خيول عاملة</span><strong className="text-lg font-extrabold text-sky-700 block mt-1">{items.filter((i) => i.isPlowhorse).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">ألغاز</span><strong className="text-lg font-extrabold text-amber-700 block mt-1">{items.filter((i) => i.isPuzzle).length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">كلاب</span><strong className="text-lg font-extrabold text-rose-700 block mt-1">{items.filter((i) => i.isDog).length}</strong></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quadrants.map((q) => {
          const quadrantItems = items.filter((i) => (i as unknown as Record<string, boolean>)[`is${q.name[0].toUpperCase()}${q.name.slice(1)}`]);
          return (
            <Card key={q.name} className={`p-4 border ${q.bg}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${q.color}`} />
                <h3 className={`font-extrabold text-xs ${q.text}`}>{q.label} ({quadrantItems.length})</h3>
              </div>
              <div className="space-y-2">
                {quadrantItems.map((i) => (
                  <div key={i.nameAr} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5">
                    <div className="min-w-0"><p className="font-bold text-slate-800 text-xs truncate">{i.nameAr}</p><p className="text-[10px] text-slate-500">هامش {i.marginPct.toFixed(2)}% • {i.qty} وحدة</p></div>
                    <span className="font-mono font-extrabold text-slate-900 text-xs">{fmt(i.revenue - i.cost, 0)}</span>
                  </div>
                ))}
                {quadrantItems.length === 0 && <p className="text-center text-slate-400 text-xs py-3">لا توجد أصناف في هذا الربع</p>}
              </div>
              <p className="text-[10px] font-bold text-slate-600 mt-3 bg-white/60 rounded-lg p-2 border border-slate-100">توصية: {q.advice}</p>
            </Card>
          );
        })}
      </div>

      {itemsWithData.length === 0 && (
        <Card className="p-6 text-center text-slate-500 text-xs font-bold">أدخل بيانات مبيعات من شاشة "المبيعات اليومية" لتظهر التحليلات</Card>
      )}
    </div>
  );
};
// بحث بلغة المطبخ الشعبية: مرادفات/أسماء دارجة ← الصنف الصحيح
// المطابقة مباشرة بالاسم/الرمز/الفئة، ثم عبر المرادفات (الاسم المألوف في المطبخ الشعبي).

export interface KitchenAlias {
  aliases: string[];
  keywords: string[];
}

export const KITCHEN_ALIASES: KitchenAlias[] = [
  { aliases: ['بن قهوة', 'بن', 'قهوة', 'قهوه', 'هيل'], keywords: ['قهوة', 'بن', 'هيل'] },
  { aliases: ['معصوب', 'معصوب القاضي', 'عصيدة', 'المعصوب'], keywords: ['معصوب', 'عصيدة'] },
  { aliases: ['قرش', 'قرص', 'قرش الخلطة'], keywords: ['قرش', 'قرص', 'قمح'] },
  { aliases: ['فول', 'فول مدمس', 'فول مدشوش'], keywords: ['فول'] },
  { aliases: ['بيض', 'بيض مسلوق', 'عجة', 'أومليت', 'اومليت'], keywords: ['بيض', 'عجة'] },
  { aliases: ['لحم', 'لحوم'], keywords: ['لحم', 'مندي', 'كبسة', 'مظبي', 'كفتة', 'شاورما'] },
  { aliases: ['دجاج'], keywords: ['دجاج', 'شاورما', 'مشاوي', 'مقلي'] },
  { aliases: ['أرز', 'رز', 'بخاري'], keywords: ['أرز', 'رز', 'بخاري', 'مندي'] },
  { aliases: ['شاي', 'شاي كرك', 'شاهي'], keywords: ['شاي'] },
  { aliases: ['عصير', 'عصيرات'], keywords: ['عصير', 'شربات'] },
  { aliases: ['برتقال'], keywords: ['برتقال'] },
  { aliases: ['موز', 'موزة'], keywords: ['موز'] },
  { aliases: ['تمر', 'تمر هندي'], keywords: ['تمر'] },
  { aliases: ['بسكويت', 'شاي بسكويت'], keywords: ['بسكويت'] },
  { aliases: ['كنافة', 'كعك', 'حلويات'], keywords: ['كنافة', 'كعك', 'حلوى', 'كنافة'] },
  { aliases: ['شكشوكة', 'مصقعة'], keywords: ['شكشوكة', 'مصقعة'] },
];

const normAr = (s: string) => s.trim().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ـ/g, '').replace(/\s+/g, ' ').toLowerCase();

/** مطابقة بحث منصة البيع مع مرادفات المطبخ الشعبي */
export const posAliasMatch = (query: string, recipe: { nameAr?: string; nameEn?: string; code?: string; category?: string }): boolean => {
  const q = (query || '').trim();
  if (!q) return true;
  const nameAr = recipe.nameAr || '';
  const nameEn = (recipe.nameEn || '').toLowerCase();
  const code = (recipe.code || '').toLowerCase();
  const category = recipe.category || '';
  if (nameAr.includes(q) || nameEn.includes(q.toLowerCase()) || code.includes(q.toLowerCase()) || category.includes(q)) return true;
  const nq = normAr(q);
  if (normAr(nameAr).includes(nq) || normAr(category).includes(nq)) return true;
  const now = /\d/.test(q);
  if (now) return false;
  const alias = KITCHEN_ALIASES.find((a) => a.aliases.some((al) => normAr(al) === nq));
  if (alias) return alias.keywords.some((k) => normAr(nameAr).includes(normAr(k)));
  return false;
};
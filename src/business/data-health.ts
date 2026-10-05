// حساب صحة البيانات — منطق خالص، مستخرج من useAppCompat (كان داخل hook واحد
// في سطر واحد من App). يحسب أبعاد اكتمال النظام الستة ويصنّف المستوى:
//   excellent (≥90) · good (≥70) · attention (أقل من 70)
// كل بُعد نسبة مئوية، والنسبة النهائية متوسطها (بلا ترجيح ولا ترتيب).

export interface DataHealthInput {
  rawMaterials: { id: string; isActive: boolean }[];
  recipes: { id: string; isActive: boolean; ingredients?: unknown[]; actualMenuPrice?: number; suggestedPrice?: number }[];
  suppliers: { id: string; isActive: boolean; phone?: string; email?: string; contactPerson?: string }[];
  users: { id: string; role: string; roleId?: string; isActive: boolean }[];
  journalEntries: { lines: { debit?: number; credit?: number }[] }[];
  inventory: { rawMaterialId: string }[];
  recipeInventory: { recipeId: string }[];
  /** هل للصنف سعر تكلفة؟ (يُمرَّر كدالة لأن التكلفة محسوبة من GRN لا مخزّنة) */
  hasCost: (rawMaterialId: string) => boolean;
  /** خريطة الدور → صلاحياته، لقياس جهوزية المستخدمين. */
  roleMap: Record<string, string[]>;
}

export interface DataHealthPart { label: string; pct: number; detail: string }
export interface DataHealthScore { score: number; grade: 'excellent' | 'good' | 'attention'; parts: DataHealthPart[] }

const pct = (ok: number, total: number) => (total > 0 ? Number(((ok / total) * 100).toFixed(0)) : 100);
const n = (v: number) => v.toLocaleString('en');

export const computeDataHealth = (i: DataHealthInput): DataHealthScore => {
  const activeMats = i.rawMaterials.filter((m) => m.isActive);
  const matsWithCost = activeMats.filter((m) => i.hasCost(m.id)).length;
  const partMats: DataHealthPart = {
    label: 'المواد الخام (سعر تكلفة)',
    pct: pct(matsWithCost, activeMats.length),
    detail: `${n(matsWithCost)} / ${n(activeMats.length)} صنفاً له سعر تكلفة`,
  };

  const activeRecipes = i.recipes.filter((r) => r.isActive);
  // مكتملة = لها مكوّنات AND لها سعر (سعر بيع فعلي أو مقترح)
  const completeRecipes = activeRecipes.filter((r) =>
    (r.ingredients?.length || 0) > 0 && ((r.actualMenuPrice || 0) > 0 || (r.suggestedPrice || 0) > 0)).length;
  const partRecipes: DataHealthPart = {
    label: 'الوصفات (مكونات + سعر)',
    pct: pct(completeRecipes, activeRecipes.length),
    detail: `${n(completeRecipes)} / ${n(activeRecipes.length)} وصفة بمقادير وسعر بيع`,
  };

  const activeSuppliers = i.suppliers.filter((s) => s.isActive);
  const withContact = activeSuppliers.filter((s) => !!(s.phone || s.email || s.contactPerson)).length;
  const partSuppliers: DataHealthPart = {
    label: 'الموردون (بيانات التواصل)',
    pct: pct(withContact, activeSuppliers.length),
    detail: `${n(withContact)} / ${n(activeSuppliers.length)} مورداً بمعلومات تواصل`,
  };

  const activeUsers = i.users.filter((u) => u.isActive);
  const readyUsers = activeUsers.filter((u) => !!i.roleMap[u.role] || !!u.roleId).length;
  const partUsers: DataHealthPart = {
    label: 'المستخدمون (أدوار/صلاحيات)',
    pct: pct(readyUsers, activeUsers.length),
    detail: `${n(readyUsers)} / ${n(activeUsers.length)} مستخدماً نشطاً بدور محدد`,
  };

  const balanced = i.journalEntries.filter((j) =>
    Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) <= 0.01).length;
  const partLedger: DataHealthPart = {
    label: 'القيود المحاسبية (توازن)',
    pct: pct(balanced, i.journalEntries.length),
    detail: `${n(balanced)} / ${n(i.journalEntries.length)} قيداً متوازناً`,
  };

  const matIds = new Set(i.rawMaterials.map((m) => m.id));
  const recipeIds = new Set(i.recipes.map((r) => r.id));
  const invBroken = i.inventory.filter((r) => !matIds.has(r.rawMaterialId)).length;
  const recBroken =
    i.recipes.filter((r) => (r.ingredients || []).some((ing) => !matIds.has((ing as { rawMaterialId?: string }).rawMaterialId || ''))).length
    + i.recipeInventory.filter((r) => !recipeIds.has(r.recipeId)).length;
  const refTotal = i.inventory.length + i.recipes.length + i.recipeInventory.length;
  const partRefs: DataHealthPart = {
    label: 'المراجع التكاملية (لا يتام)',
    pct: pct(refTotal - invBroken - recBroken, refTotal),
    detail: invBroken || recBroken ? `${invBroken + recBroken} مرجعاً مكسوراً` : `لا توجد مراجع مكسورة في ${n(refTotal)} سجل`,
  };

  const parts = [partMats, partRecipes, partSuppliers, partUsers, partLedger, partRefs];
  const score = Math.round(parts.reduce((s, p) => s + p.pct, 0) / parts.length);
  const grade: DataHealthScore['grade'] = score >= 90 ? 'excellent' : score >= 70 ? 'good' : 'attention';
  return { score, grade, parts };
};
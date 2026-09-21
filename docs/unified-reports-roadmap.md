# التقارير الموحدة (جديد) — خطة التقارير (47 تقريرًا مرجعيًا)

> المصدر: `docs/reporting-module-design.md` §6 — "الكتالوج الكامل: 8 عائلات × 24 تعريفًا" (المواصفة المرجعية)
> الحالة الفعلية: 24 تعريفًا مُنفذًا في `registry/index.ts` (REPORT_DEFINITIONS) — مع محرك تجميع موحد في المتصفح.

## الحالة (Legend)

| الشارة | المعنى |
|---|---|
| ✅ منفذ | تعريف منفذ يغطي التقرير المرجعي تغطية صحيحة |
| 🔸 جزئي | مغطى جزئيًا بتعريف منفذ (أبعاد/مقاييس ناقصة) |
| 📋 مخطط | لم يُنفذ بعد |

---

## 📈 العائلة أ: المبيعات والإيرادات `sales` (7)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `sales-daily` | الإيرادات اليومية (فرع/يوم/متوسط فاتورة) | `sales-unified` + `tickets-avg`-style | 🔸 |
| `sales-monthly` | ملخص الشهر (فرع/تصنيف، % من الإجمالي) | `sales-unified` (groupBy branch) | 🔸 |
| `sales-item-ranking` | ترتيب الأصناف (كمية/إيراد/هامش) | `item-profitability` | 🔸 |
| `sales-menu-engineering` | مصفوفة هندسة القائمة نجوم/أبقار/ألغاز/كلاب | `menu-engineering` | ✅ |
| `sales-comparison` | مقارنة الفترات PoP (نمو %) | — (يحتاج مقارنة فترات عميقة) | 📋 |
| `sales-returns` | المرتجعات والاسترداد (pos_returns فارغة) | — | 📋 |
| `sales-channels` | قنوات البيع المتنوعة (delivery فارغة) | — | 📋 |

## 🧮 العائلة ب: التكلفة والهوامش `cost` (7) — عائلة البرنامج الأساسية

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `cost-theoretical-vs-actual` | **تكلفة الطعام: نظري × فعلي** | `food-cost-detailed` | ✅ |
| `cost-pot-vs-act` | الاستهلاك المتوقع POT × ACT (كمية) | `food-cost-detailed` (theoreticalQty/countedQty) | 🔸 |
| `cost-by-item` | تكلفة الهامش لكل صنف (+ سعر مقترح) | `item-profitability` | ✅ |
| `cost-category` | التكلفة حسب مجموعات المواد (مكدسة) | — | 📋 |
| `cost-true` | التكلفة الحقيقية الكاملة (طعام+عمالة+تغليف+هالك+وجبات) | — | 📋 |
| `cost-trend` | اتجاه نسبة تكلفة الطعام (12 شهر) | — | 📋 |
| `cost-prime` | التكلفة الأولية والتشغيلية (نسب) | `pl-statement` (primeCostPct) | 🔸 |

## 🛒 العائلة ج: المشتريات والموردون `purchase` (6)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `purchase-monthly` | المشتريات الشهرية (فرع/مورد/تصنيف) | `purchases-suppliers` | 🔸 |
| `purchase-price-history` | سجل أسعار الشراء (midline/أفضل مورد) | `purchases-suppliers` (avgPurchasePrice) | 🔸 |
| `purchase-delivery-performance` | أداء التسليم PO→GRN (أيام التأخير) | `purchases-suppliers` + `supplier-scorecard` | 🔸 |
| `purchase-ap` | الحسابات الدائنة (مستحق، تقادم) | — | 📋 |
| `purchase-supplier-scorecard` | بطاقة أداء الموردين (سعر/التزام/جودة/حجم) | `supplier-scorecard` | ✅ |
| `purchase-variance` | انحراف أوامر الشراء (كمية/سعر) | `purchases-suppliers` (priceVariancePct) | 🔸 |

## 📦 العائلة د: المخزون والجرد `inventory` (7)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `inventory-movement` | حركة المخزون التفصيلية (3344 سند) | — | 📋 |
| `inventory-valuation` | تقييم المخزون (متوسط/FIFO) | `inventory-counts` (inventoryValue) | 🔸 |
| `inventory-cover` | تغطية المخزون (أيام) + تنبيهات | `inventory-counts` (stockCoverDays) | 🔸 |
| `inventory-abc` | تصنيف ABC/XYZ | — | 📋 |
| `inventory-limits` | الانحراف عن حدود الأدنى/الأقصى (655) | — | 📋 |
| `inventory-count-variance` | **الجرد: نظري × معدود** | `inventory-counts` | ✅ |
| `inventory-aging` | أقدمية المخزون (0-7/8-30/30+) | — | 📋 |

## 🏭 العائلة هـ: الإنتاج والمطبخ المركزي `production` (4)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `production-cost` | تكلفة الإنتاج × المعيارية (production_runs فارغة) | — | 📋 |
| `production-wastage` | الهوالك والفاقد (قيمة/نسبة) | `wastage-shrinkage` | ✅ |
| `production-butcher` | إنتاجية الجزارة (butcher_tests فارغة) | — | 📋 |
| `production-employee-meals` | وجبات العاملين (employee_meals فارغة) | — | 📋 |

## 👷 العائلة و: العمالة والإنتاجية `labor` (3)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `labor-cost` | تكلفة العمالة (أساسي/أوفرتايم/ساعة) | `labor-productivity` + `staff-productivity` | 🔸 |
| `labor-productivity` | الإنتاجية (إيراد/موظف، ساعة/إيراد) | `staff-productivity` | ✅ |
| `labor-ratio` | عمالة % و Prime % (مؤشرات) | `pl-statement` (laborCostPct/primeCostPct) | 🔸 |

## 💰 العائلة ز: المالية `finance` (7)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `finance-pl` | **P&L موحد** (فرع/شركة/مجمعة) | `pl-statement` | ✅ |
| `finance-journal` | يومية/ميزان المراجعة (274 قيدًا) | — (يوجد drill فقط) | 📋 |
| `finance-trial-balance` | ميزان المراجعة بالنهايات | — | 📋 |
| `finance-cashflow` | التدفق النقدي (داخل/خارج/صافي) | `cash-flow-vat` | ✅ |
| `finance-expenses` | المصروفات (تصنيف/مورد/استحقاق) | `operating-expenses` | ✅ |
| `finance-vat` | تقرير VAT (مبيعات/مشتريات/صافي) | `cash-flow-vat` | ✅ |
| `finance-budget` | الانحراف عن الميزانية (expense_budgets) | — | 📋 |

## 🛡️ العائلة ح: الحوكمة والرقابة `governance` (6)

| المعرّف المرجعي | التقرير | تعريف منفذ يغطيه | الحالة |
|---|---|---|---|
| `gov-audit` | سجل التدقيق (679 حدثًا) | `governance-audit` (auditEvents) | 🔸 |
| `gov-distributions` | مراجعة توزيعات البوت (13) | `transfers-distribution` | 🔸 |
| `gov-transfers` | تحويلات الفروع وتصالحها (13) | `transfers-distribution` | 🔸 |
| `gov-grn-journal-match` | **مطابقة GRN ↔ Journal** (2 سندات غير مقيدة) | `governance-audit` (grnUnmatched) | 🔸 |
| `gov-closure` | امتثال الإقفال (أيام/شهور) | `month-end-close` | ✅ |
| `gov-movement-integrity` | سلامة حركة المخزون (سالب بلا سند) | `risk-compliance` | 🔸 |

---

## خلاصة التغطية

| الحالة | العدد | التفصيل |
|---|---|---|
| ✅ منفذ | 12 | menu-engineering، theoretical-vs-actual، cost-by-item، supplier-scorecard، count-variance، production-wastage، labor-productivity، finance-pl، finance-cashflow، finance-expenses، finance-vat، gov-closure |
| 🔸 جزئي | 16 | تغطية عبر تعاريف موجودة لكن بأبعاد/مقاييس ناقصة |
| 📋 مخطط | 19 | لم يُنفذ — معظمها ينقصها بيانات المصدر (توصيل، مرتجعات، إنتاج، عمالة، ميزانيات) أو تحتاج محركًا متخصصًا |
| **المجموع** | **47** | 7 + 7 + 6 + 7 + 4 + 3 + 7 + 6 |

## ملاحظات الجودة (لماذا "جزئي/مخطط" رغم وجود 24 تعريفًا)

1. **المحرك موحد وليس متخصصًا**: يحسب نفس مجموعة المقاييس الأساسية لجميع التعريفات؛ الأبعاد الثانوية (category/item) ورسوم مثل التوزيع والتسعير والإقفال لا تُبنى لكل تقرير على حدة.
2. **بيانات المصدر شبه فارغة** تحجب التنفيذ الفعلي: pos_returns، delivery، production_runs، butcher_tests، employee_meals (فارغة) — payroll/attendance 1-0.
3. **أمور مفقودة كليًا**: مقارنة فترات PoP عميقة، سجل حركة مخزون منفصل، ABC/XYZ، Aging، AP، ميزان مراجعة/يومية، انحراف ميزانية، سلامة حركات.

## الأولويات المقترحة (مرتبطة بخارطة تصميم §13)

- **P1 (موجود عمليًا):** العلاقات الخمسة الأساسية مغطاة: `sales-monthly`, `cost-theoretical-vs-actual`, `finance-pl`, `inventory-movement` ⚠, `purchase-monthly`.
- **P2 (البناء القادم):** `inventory-movement` (جدول حركة)، `sales-comparison` (PoP)، `finance-journal`، `inventory-aging`، `gov-grn-journal-match` كتقرير كامل.
- **P3 (يحتاج بيانات/قرار):** `sales-returns`, `sales-channels`, `production-*`, `finance-budget`, `purchase-ap` — تُفعَّل عند امتلاء مصادرها.

## المراجع المعمارية (Architectural References)

> مراجع وهويات مشتركة مع المنظومة المتطورة: `docs/report-identity.md` (هوية كل تقرير مستمدة من `E:\MASSOBI APP\COST REPROT`) و `docs/advanced-reporting-roadmap.md`.

> مصادر مستلهمة — مشتركة مع مظومة التقارير المتطورة (77). المرجع الرئيس: `docs/advanced-reporting-roadmap.md`.

| النمط | المرجع | التطبيق في التقارير الموحدة | الحالة |
|---|---|---|---|
| نمط تكامل AI والوحدات التشغيلية | **Ever Gauzy** | التفاعل الحتمي بين توحيد البيانات والأدوات الذكية: التغذية الآلية لـ `AIContext` من نتائج التعاريف الموحدة + تكامل HRM/الوقت (3 موظفين) | ✅ محرك AI / 📋 HRM-وقت |
| تقرير يُبنى بلا كود | **NocoBase** | مقابل الفلسفة الموحدة: تعريفات `REPORT_DEFINITIONS` هي أساس منشئ تقارير مستقبلي (اختيار عائلة + أبعاد + مقاييس بدل كود) | 📋 لاحقاً |
| توليد الكود لتسريع التنفيذ | **RuoYi / Yudao** | توليد شاشات منظومة الـ77 من تعريف موحّد: قالب شاشة/طباعة/تصدير تلقائي يحوّل تعريفًا ✅ مباشرةً إلى تقرير متطور | 📋 لاحقاً |
<template>
  <div>
    <div class="topbar">
      <h1>📋 التقارير المالية</h1>
      <div class="actions">
        <select class="input" style="width:220px;" v-model="reportType" @change="loadAll">
          <option value="overview">📊 نظرة عامة</option>
          <option value="statement">🧾 كشف شهري تفصيلي</option>
          <option value="closing">📈 تقرير بعد الإغلاق</option>
          <option value="items">📦 بدلالة الأصناف</option>
          <option value="income">💰 قائمة الدخل</option>
          <option value="pandl">📊 دخل ومصروفات (P&L)</option>
          <option value="branches">🏢 مقارنة الفروع بالأشهر</option>
          <option value="allmonths">📅 جميع الأشهر × الفروع</option>
          <option value="portfolio">🏆 ملخص الأداء</option>
          <option value="annual">📅 مقارنة سنوية</option>
        </select>
        <input type="month" class="input" style="width:180px;" v-model="month" @change="loadAll" />
        <select class="input" style="width:200px;" v-model="reportBranchFilter" @change="loadAll">
          <option value="all">🌐 جميع الفروع</option>
          <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select v-if="reportType === 'branches'" class="input" style="width:200px;" v-model="branchesMetric">
          <option value="profit">🏆 صافي الربح</option>
          <option value="sales">📈 الإيرادات</option>
          <option value="cost">💸 التكلفة</option>
          <option value="ratio">📊 نسبة التكلفة%</option>
        </select>
        <select class="input" style="width:190px;" v-model="templateSel" @change="applyTemplate">
          <option value="">📁 {{ templates.length ? 'تحميل قالب...' : 'لا قوالب محفوظة' }}</option>
          <option v-for="t in templates" :key="t.id" :value="String(t.id)">📌 {{ t.name }}</option>
        </select>
        <button class="btn btn-outline" title="نسخ محفوظة من بيانات هذا التقرير" @click="openVersions">💾 نسخة</button>
        <button class="btn btn-outline" title="إعدادات التقرير: الألوان والترويسة" @click="openSettings">🎨 إعدادات</button>
        <button class="btn btn-info" @click="exportExcel">⬇️ Excel</button>
        <button class="btn btn-outline" @click="pdfReport">💾 PDF</button>
        <button class="btn btn-primary" @click="printReport">🖨️ طباعة</button>
      </div>
    </div>

    <div v-if="reportSettings.headerMessage || reportSettings.primaryColor" class="report-banner" :style="{ borderColor: reportSettings.primaryColor || 'var(--gold)', color: reportSettings.primaryColor || 'var(--gold-dark)' }">
      <span class="dot" :style="{ background: reportSettings.primaryColor || 'var(--gold)' }"></span>
      {{ reportSettings.headerMessage }}
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <div class="report-print-area">

        <template v-if="reportType === 'overview'">
          <div class="kpi-grid">
            <KpiCard icon="💰" label="التكاليف" :value="overviewTotalCost" color="var(--danger)" />
            <KpiCard icon="📈" label="الإيرادات" :value="overviewTotalSales" color="var(--success)" />
            <KpiCard icon="📊" label="المصروفات" :value="overviewTotalExpenses" color="var(--warning)" />
            <KpiCard icon="🏆" label="صافي الربح" :value="overviewNetProfit" color="var(--teal)" />
          </div>
          <div class="card">
            <div class="card-header"><h3>📋 ملخص الفروع - {{ monthLabel(month) }}</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>الفرع</th><th>العلامة</th><th>الإيرادات</th><th>التكلفة</th><th>نسبة التكلفة</th><th>صافي الربح</th></tr></thead>
                <tbody>
                  <tr v-for="r in branchRows" :key="r.id">
                    <td><strong>{{ r.name }}</strong></td>
                    <td>{{ r.brandName || '-' }}</td>
                    <td class="num-ltr">{{ fmt(r.sales) }}</td>
                    <td class="num-ltr">{{ fmt(r.cost) }}</td>
                    <td class="num-ltr">{{ r.ratio.toFixed(2) }}%</td>
                    <td class="num-ltr" :style="{ color: (r.sales - r.cost) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.sales - r.cost) }}</td>
                  </tr>
                  <tr v-if="!branchRows.length"><td colspan="6" class="empty-state"><div class="icon">📊</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="📈 شهري - التكلفة والمصروفات والإيرادات" type="line"
              :labels="overviewTrendLabels"
              :datasets="[
                { label: 'التكلفة', data: overviewTrendCost, borderColor: '#e74c3c' },
                { label: 'المصروفات', data: overviewTrendExp, borderColor: '#f39c12' },
                { label: 'الإيرادات', data: overviewTrendSales, borderColor: '#27ae60' },
              ]"
              :options="{ plugins: { legend: { position: 'bottom' } } }"
            />
            <ChartView title="🥧 توزيع التكلفة بالعلامة" type="doughnut"
              :labels="overviewBrandLabels"
              :datasets="[{ data: overviewBrandValues, backgroundColor: palette }]"
              :options="{ plugins: { legend: { position: 'right' } } }"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'statement'">
          <div class="card">
            <div class="card-header"><h3>🧾 كشف الشهر التفصيلي - {{ monthLabel(month) }}</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>الفرع</th><th>العلامة</th><th>رصيد أول المدة</th><th>المشتريات</th><th>التحويلات و المصروفات من المستودع</th><th>إجمالي متاح</th><th>رصيد آخر المدة</th><th>تكلفة المبيعات</th><th>المبيعات</th><th>نسبة التكلفة</th><th>ملاحظات</th></tr></thead>
                <tbody>
                  <tr v-for="r in statementRows" :key="r.id">
                    <td><strong>{{ r.name }}</strong></td>
                    <td>{{ r.brandName || '-' }}</td>
                    <td class="num-ltr">{{ fmt(r.opening) }}</td>
                    <td class="num-ltr">{{ fmt(r.purchases) }}</td>
                    <td class="num-ltr">{{ fmt(r.transfers) }}</td>
                    <td class="num-ltr">{{ fmt(Number(r.opening) + Number(r.purchases) + Number(r.transfers)) }}</td>
                    <td class="num-ltr">{{ fmt(r.closing) }}</td>
                    <td class="num-ltr" style="font-weight:700;">{{ fmt(r.cost) }}</td>
                    <td class="num-ltr">{{ fmt(r.sales) }}</td>
                    <td class="num-ltr">{{ r.ratio.toFixed(2) }}%</td>
                    <td class="text-muted" style="font-size:12px;">{{ r.notes || '-' }}</td>
                  </tr>
                  <tr v-if="!statementRows.length"><td colspan="11" class="empty-state"><div class="icon">🧾</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
                <tfoot v-if="statementRows.length">
                  <tr class="total-row">
                    <td colspan="2"><strong>الإجمالي</strong></td>
                    <td class="num-ltr">{{ fmt(totalOpening) }}</td><td class="num-ltr">{{ fmt(totalPurchases) }}</td>
                    <td class="num-ltr">{{ fmt(totalTransfers) }}</td><td class="num-ltr">{{ fmt(totalOpening + totalPurchases + totalTransfers) }}</td>
                    <td class="num-ltr">{{ fmt(totalClosing) }}</td><td class="num-ltr">{{ fmt(totalCost) }}</td>
                    <td class="num-ltr">{{ fmt(totalSales) }}</td>
                    <td class="num-ltr">{{ avgRatio.toFixed(2) }}%</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="📈 المبيعات مقابل تكلفة المبيعات لكل فرع" type="bar"
              :labels="branchLabels"
              :datasets="[
                { label: 'الإيرادات', data: branchSalesData, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 5 },
                { label: 'تكلفة المبيعات', data: branchCostData, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 5 },
              ]"
            />
            <ChartView title="🥧 الإيرادات حسب الفرع" type="doughnut"
              :labels="branchLabels"
              :datasets="[{ data: branchSalesData, backgroundColor: palette }]"
              :options="{ plugins: { legend: { position: 'right' } } }"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'closing'">
          <div class="kpi-grid">
            <KpiCard icon="🗃️" label="إجمالي المتاح" :value="totalOpening + totalPurchases + totalTransfers" color="var(--info)" />
            <KpiCard icon="📦" label="رصيد آخر المدة" :value="totalClosing" color="var(--gold-dark)" />
            <KpiCard icon="🧮" label="تكلفة المبيعات" :value="totalCost" color="var(--danger)" />
            <KpiCard icon="🏆" label="صافي الربح" :value="totalSales - totalCost" color="var(--teal)" />
          </div>
          <div class="card">
            <div class="card-header"><h3>📈 تقرير بعد الإغلاق - {{ monthLabel(month) }}</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>الفرع</th><th>رصيد أول المدة</th><th>المشتريات</th><th>التحويلات و المصروفات من المستودع</th><th>إجمالي متاح</th><th>رصيد آخر المدة</th><th>تكلفة المبيعات</th><th>المبيعات</th><th>نسبة التكلفة</th></tr></thead>
                <tbody>
                  <tr v-for="r in closingRows" :key="r.id">
                    <td><strong>{{ r.name }}</strong></td>
                    <td class="num-ltr">{{ fmt(r.opening) }}</td>
                    <td class="num-ltr">{{ fmt(r.purchases) }}</td>
                    <td class="num-ltr">{{ fmt(r.transfers) }}</td>
                    <td class="num-ltr">{{ fmt(Number(r.opening) + Number(r.purchases) + Number(r.transfers)) }}</td>
                    <td class="num-ltr">{{ fmt(r.closing) }}</td>
                    <td class="num-ltr" style="font-weight:700;">{{ fmt(r.cost) }}</td>
                    <td class="num-ltr">{{ fmt(r.sales) }}</td>
                    <td class="num-ltr"><span class="pill" :style="{ background: r.ratio <= 50 ? 'rgba(46,204,113,.15)' : r.ratio <= 70 ? 'rgba(243,156,18,.15)' : 'rgba(231,76,60,.15)', color: r.ratio <= 50 ? 'var(--success)' : r.ratio <= 70 ? 'var(--warning)' : 'var(--danger)' }">{{ r.ratio.toFixed(2) }}%</span></td>
                  </tr>
                  <tr v-if="!closingRows.length"><td colspan="9" class="empty-state"><div class="icon">📈</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
                <tfoot v-if="closingRows.length">
                  <tr class="total-row">
                    <td>الإجمالي</td>
                    <td class="num-ltr">{{ fmt(totalOpening) }}</td><td class="num-ltr">{{ fmt(totalPurchases) }}</td>
                    <td class="num-ltr">{{ fmt(totalTransfers) }}</td><td class="num-ltr">{{ fmt(totalOpening + totalPurchases + totalTransfers) }}</td>
                    <td class="num-ltr">{{ fmt(totalClosing) }}</td><td class="num-ltr">{{ fmt(totalCost) }}</td>
                    <td class="num-ltr">{{ fmt(totalSales) }}</td>
                    <td class="num-ltr">{{ avgRatio.toFixed(2) }}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="🗃️ رصيد آخر المدة لكل فرع" type="bar"
              :labels="branchLabels"
              :datasets="[{ label: 'رصيد آخر المدة', data: branchClosingData, backgroundColor: 'rgba(243,156,18,0.7)', borderRadius: 5 }]"
            />
            <ChartView title="🧮 تكلفة المبيعات لكل فرع" type="doughnut"
              :labels="branchLabels"
              :datasets="[{ data: branchCostData, backgroundColor: palette }]"
              :options="{ plugins: { legend: { position: 'right' } } }"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'items'">
          <div class="card">
            <div class="card-header"><h3>📦 بدلالة الأصناف (تجميع حسب الشركة/العلامة) - {{ monthLabel(month) }}</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>#</th><th>الشركة/العلامة</th><th>عدد الفروع</th><th>رصيد أول</th><th>مشتريات</th><th>التحويلات و المصروفات من المستودع</th><th>رصيد آخر</th><th>التكلفة</th><th>المبيعات</th><th>نسبة التكلفة</th><th>صافي الربح</th></tr></thead>
                <tbody>
                  <tr v-for="(r, i) in itemsBrandRows" :key="r.brandId">
                    <td>{{ i + 1 }}</td>
                    <td><strong>{{ r.brandName || '-' }}</strong></td>
                    <td class="num-ltr">{{ r.branches }}</td>
                    <td class="num-ltr">{{ fmt(r.opening) }}</td>
                    <td class="num-ltr">{{ fmt(r.purchases) }}</td>
                    <td class="num-ltr">{{ fmt(r.transfers) }}</td>
                    <td class="num-ltr">{{ fmt(r.closing) }}</td>
                    <td class="num-ltr">{{ fmt(r.cost) }}</td>
                    <td class="num-ltr">{{ fmt(r.sales) }}</td>
                    <td class="num-ltr">{{ r.ratio.toFixed(2) }}%</td>
                    <td class="num-ltr" :style="{ color: r.sales - r.cost >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.sales - r.cost) }}</td>
                  </tr>
                  <tr v-if="!itemsBrandRows.length"><td colspan="11" class="empty-state"><div class="icon">📦</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
                <tfoot v-if="itemsBrandRows.length">
                  <tr class="total-row">
                    <td colspan="2"><strong>الإجمالي</strong></td>
                    <td class="num-ltr">{{ branchRows.length }}</td>
                    <td class="num-ltr">{{ fmt(totalOpening) }}</td><td class="num-ltr">{{ fmt(totalPurchases) }}</td>
                    <td class="num-ltr">{{ fmt(totalTransfers) }}</td><td class="num-ltr">{{ fmt(totalClosing) }}</td>
                    <td class="num-ltr">{{ fmt(totalCost) }}</td><td class="num-ltr">{{ fmt(totalSales) }}</td>
                    <td class="num-ltr">{{ avgRatio.toFixed(2) }}%</td>
                    <td class="num-ltr" style="color: var(--success); font-weight: 800;">{{ fmt(totalSales - totalCost) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="🥧 توزيع تكلفة المبيعات بالعلامة" type="doughnut"
              :labels="brandGroupLabels"
              :datasets="[{ data: brandGroupCostData, backgroundColor: palette }]"
              :options="{ plugins: { legend: { position: 'right' } } }"
            />
            <ChartView title="📊 الإيرادات والتكلفة بالعلامة" type="bar"
              :labels="brandGroupLabels"
              :datasets="[
                { label: 'الإيرادات', data: brandGroupSalesData, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 5 },
                { label: 'تكلفة المبيعات', data: brandGroupCostData, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 5 },
              ]"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'income'">
          <div class="card" style="max-width: 640px;">
            <div class="card-header"><h3>💰 قائمة الدخل - {{ monthLabel(month) }}</h3></div>
            <div style="padding: 14px;">
              <div class="income-line"><span class="income-label">إجمالي الإيرادات</span><span class="num-ltr income-value">{{ fmt(totalSales) }}</span></div>
              <div class="income-line"><span class="income-label">تكلفة المبيعات</span><span class="num-ltr income-value" style="color: var(--danger);">- {{ fmt(totalCost) }}</span></div>
              <div class="income-line"><span class="income-label">المصروفات العمومية والإدارية</span><span class="num-ltr income-value" style="color: var(--danger);">- {{ fmt(totalExpenses) }}</span></div>
              <hr style="border: none; border-top: 1px dashed var(--border);" />
              <div class="income-line" style="font-weight: 800; font-size: 15px;"><span class="income-label">مجمل الربح</span><span class="num-ltr income-value" :style="{ color: (totalSales - totalCost) >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(totalSales - totalCost) }}</span></div>
              <div class="income-line" style="font-weight: 800; font-size: 15px;"><span class="income-label">صافي الربح قبل الضريبة</span><span class="num-ltr income-value" :style="{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(netProfit) }}</span></div>
              <div class="income-line"><span class="income-label">هامش صافي الربح</span><span class="num-ltr income-value">{{ marginPercent.toFixed(2) }}%</span></div>
            </div>
          </div>
        </template>

        <template v-else-if="reportType === 'pandl'">
          <div class="card" style="max-width: 680px;">
            <div class="card-header"><h3>📊 قائمة الدخل والمصروفات (P&L) - {{ monthLabel(month) }}</h3></div>
            <div style="padding: 14px;">
              <div class="income-line"><span class="income-label">💰 إجمالي الإيرادات</span><span class="num-ltr income-value">{{ fmt(totalSales) }}</span></div>
              <div class="income-line"><span class="income-label">🧾 تكلفة المبيعات (COGS)</span><span class="num-ltr income-value" style="color: var(--danger);">- {{ fmt(totalCost) }}</span></div>
              <div class="income-line" style="font-weight: 800;"><span class="income-label">مجمل الربح</span><span class="num-ltr income-value" :style="{ color: grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(grossProfit) }}</span></div>
              <hr style="border: none; border-top: 1px dashed var(--border);" />
              <div class="text-muted" style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">المصروفات التشغيلية حسب التصنيف:</div>
              <div class="income-line" v-for="c in expenseCategories" :key="c.cat"><span class="income-label">🗂️ {{ categoryLabel(c.cat) }} ({{ c.count }})</span><span class="num-ltr income-value" style="color: var(--danger);">- {{ fmt(c.total) }}</span></div>
              <div class="income-line" style="font-weight: 800;"><span class="income-label">إجمالي المصروفات</span><span class="num-ltr income-value" style="color: var(--danger);">- {{ fmt(totalExpenses) }}</span></div>
              <hr style="border: none; border-top: 1px dashed var(--border);" />
              <div class="income-line" style="font-weight: 800; font-size: 15px;"><span class="income-label">🏆 صافي الربح</span><span class="num-ltr income-value" :style="{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(netProfit) }}</span></div>
              <div class="income-line"><span class="income-label">هامش مجمل الربح</span><span class="num-ltr income-value">{{ grossMargin.toFixed(2) }}%</span></div>
              <div class="income-line"><span class="income-label">هامش صافي الربح</span><span class="num-ltr income-value">{{ marginPercent.toFixed(2) }}%</span></div>
              <div class="income-line"><span class="income-label">نسبة المصروفات للإيرادات</span><span class="num-ltr income-value">{{ expenseToRevenue.toFixed(2) }}%</span></div>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="🥧 توزيع المصروفات حسب التصنيف" type="doughnut"
              :labels="expenseCategoryLabels"
              :datasets="[{ data: expenseCategoryValues, backgroundColor: [categoryColor('fixed'), categoryColor('variable'), categoryColor('administrative'), categoryColor('operational'), categoryColor('other')] }]"
              :options="{ plugins: { legend: { position: 'right' } } }"
            />
            <ChartView title="📊 المكونات الرئيسية" type="bar"
              :labels="['الإيرادات', 'التكلفة', 'المصروفات', 'صافي الربح']"
              :datasets="[{ data: [totalSales, totalCost, totalExpenses, netProfit], backgroundColor: ['rgba(46,204,113,0.7)', 'rgba(231,76,60,0.7)', 'rgba(243,156,18,0.7)', 'rgba(155,89,182,0.7)'] }]"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'branches'">
          <div class="card">
            <div class="card-header"><h3>🏢 مقارنة {{ metricLabel }} بين الفروع (آخر {{ branchCompMonths.length }} أشهر)</h3></div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>الفرع</th>
                    <th v-for="m in branchCompMonths" :key="m" class="num-ltr">{{ monthShortLabel(m) }}</th>
                    <th class="num-ltr">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in branchCompRows" :key="b.branchId">
                    <td><strong>{{ b.name }}</strong></td>
                    <td v-for="m in branchCompMonths" :key="m" class="num-ltr" :style="cellStyle(b.values[m])">{{ b.values[m] !== null ? fmtValue(b.values[m]) : '—' }}</td>
                    <td class="num-ltr" style="font-weight:700;">{{ fmtValue(b.total) }}</td>
                  </tr>
                  <tr v-if="!branchCompRows.length"><td :colspan="branchCompMonths.length + 2" class="empty-state"><div class="icon">🏢</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>

        <template v-else-if="reportType === 'allmonths'">
          <div class="card">
            <div class="card-header"><h3>📅 قائمة الدخل التفصيلية — جميع الأشهر × الفروع</h3></div>
            <div class="table-wrapper" style="max-width: 100%; overflow-x: auto;">
              <table style="min-width: 1400px;">
                <thead>
                  <tr>
                    <th rowspan="2" style="position: sticky; left: 0; background: var(--bg); z-index: 2;">الفرع / الشهر</th>
                    <th v-for="m in allMonthsList" :key="m" :colspan="allExpenseTypes.length + 7" class="num-ltr">{{ monthLabel(`${m}-01`) }}</th>
                  </tr>
                  <tr>
                    <th v-for="m in allMonthsList" :key="'sales_' + m" class="num-ltr">إجمالي المبيعات</th>
                    <th v-for="m in allMonthsList" :key="'netsales_' + m" class="num-ltr">صافي المبيعات</th>
                    <th v-for="m in allMonthsList" :key="'cost_' + m" class="num-ltr">تكلفة المبيعات</th>
                    <th v-for="m in allMonthsList" :key="'gross_' + m" class="num-ltr">مجمل الربح</th>
                    <th v-for="m in allMonthsList" :key="'ratio_' + m" class="num-ltr">نسبة التكلفة%</th>
                    <template v-for="m in allMonthsList" :key="m">
                      <th v-for="et in allExpenseTypes" :key="m+'_'+et" class="num-ltr">{{ et }}</th>
                    </template>
                    <th v-for="m in allMonthsList" :key="'totexp_' + m" class="num-ltr">إجمالي المصروفات</th>
                    <th v-for="m in allMonthsList" :key="'net_' + m" class="num-ltr">صافي الربح</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in allMonthsBranchRows" :key="b.branchId">
                    <td style="position: sticky; left: 0; background: var(--bg); font-weight: 700; z-index: 1;">{{ b.name }}</td>
                    <template v-for="m in allMonthsList" :key="m">
                      <td v-if="b.months[m]" class="num-ltr" :style="{fontWeight: 700}">{{ fmt(b.months[m].sales) }}</td>
                      <td v-else class="num-ltr" colspan="7">—</td>
                      <td v-if="b.months[m]" class="num-ltr">{{ fmt(b.months[m].sales) }}</td>
                      <td v-if="b.months[m]" class="num-ltr">{{ fmt(b.months[m].cost) }}</td>
                      <td v-if="b.months[m]" class="num-ltr" :style="{ color: b.months[m].grossProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(b.months[m].grossProfit) }}</td>
                      <td v-if="b.months[m]" class="num-ltr">{{ b.months[m].grossMargin.toFixed(2) }}%</td>
                      <td v-if="b.months[m]" v-for="et in allExpenseTypes" :key="m+'_'+et" class="num-ltr">{{ b.months[m].expenses[et] ? fmt(b.months[m].expenses[et]) : '—' }}</td>
                      <td v-if="b.months[m]" class="num-ltr">{{ fmt(b.months[m].totalExpenses) }}</td>
                      <td v-if="b.months[m]" class="num-ltr" :style="{ color: b.months[m].netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(b.months[m].netProfit) }}</td>
                    </template>
                  </tr>
                  <tr v-if="!allMonthsBranchRows.length"><td :colspan="allMonthsList.length * (allExpenseTypes.length + 7) + 1" class="empty-state"><div class="icon">📅</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="📅 الإجمالي الشهري (إيرادات / تكلفة / صافي) — جميع الفروع" type="line"
              :labels="allMonthsChartLabels"
              :datasets="[
                { label: 'الإيرادات', data: allMonthsSalesData, borderColor: '#27ae60', backgroundColor: 'rgba(46,204,113,0.12)', fill: true, tension: 0.35 },
                { label: 'تكلفة المبيعات', data: allMonthsCostData, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.10)', fill: true, tension: 0.35 },
                { label: 'صافي الربح', data: allMonthsNetData, borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.12)', fill: true, tension: 0.35 },
              ]"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'portfolio'">
          <div class="card">
            <div class="card-header"><h3>🏆 ملخص أداء الفروع والعلامات - {{ monthLabel(month) }}</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>الترتيب</th><th>الفرع</th><th>العلامة</th><th>الإيرادات</th><th>التكلفة</th><th>نسبة التكلفة</th><th>صافي الربح</th><th>التقييم</th></tr></thead>
                <tbody>
                  <tr v-for="(b, i) in portfolioRows" :key="b.id">
                    <td style="font-weight:800; color:var(--gold);">{{ i + 1 }}</td>
                    <td><strong>{{ b.name }}</strong></td>
                    <td>{{ b.brandName || '-' }}</td>
                    <td class="num-ltr">{{ fmt(b.sales) }}</td>
                    <td class="num-ltr">{{ fmt(b.cost) }}</td>
                    <td class="num-ltr">{{ b.ratio.toFixed(2) }}%</td>
                    <td class="num-ltr" :style="{ color: (b.sales - b.cost) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(b.sales - b.cost) }}</td>
                    <td><span class="badge" :class="b.ratio <= 50 ? 'badge-success' : b.ratio <= 70 ? 'badge-warning' : 'badge-danger'">{{ b.ratio <= 50 ? 'ممتاز' : b.ratio <= 70 ? 'متوسط' : 'يحتاج مراجعة' }}</span></td>
                  </tr>
                  <tr v-if="!portfolioRows.length"><td colspan="8" class="empty-state"><div class="icon">🏆</div><p>لا توجد بيانات</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="🏆 ترتيب الفروع حسب صافي الربح" type="bar"
              :labels="portfolioNames"
              :datasets="[{ label: 'صافي الربح', data: portfolioNetData, backgroundColor: portfolioNetColors }]"
              :options="{ indexAxis: 'y', scales: { x: { beginAtZero: true, grid: { display: false } }, y: { ticks: { font: { family: 'Tajawal', size: 11 } } } } }"
            />
          </div>
        </template>

        <template v-else-if="reportType === 'annual'">
          <div class="kpi-grid">
            <KpiCard icon="📅" label="سنوات متاحة" :value="annualRows.length" color="var(--info)" />
            <KpiCard icon="🏆" label="أفضل صافي ربح" :value="bestProfitYear?.year || '—'" color="var(--teal)" />
            <KpiCard icon="📈" label="أكبر نمو مبيعات" :value="bestGrowthYear || '—'" color="var(--success)" />
          </div>
          <div class="card">
            <div class="card-header"><h3>🏷️ المقارنة السنوية ({{ monthLabel(month) }})</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>السنة</th><th>الإيرادات</th><th>التكلفة</th><th>المصروفات</th><th>مجمل الربح</th><th>صافي الربح</th><th>الفروع</th></tr></thead>
                <tbody>
                  <tr v-for="r in annualRows" :key="r.year">
                    <td style="font-weight:800;">{{ r.year }}</td>
                    <td class="num-ltr">{{ fmt(r.sales) }}</td>
                    <td class="num-ltr">{{ fmt(r.cost) }}</td>
                    <td class="num-ltr">{{ fmt(r.expenses) }}</td>
                    <td class="num-ltr">{{ fmt(r.grossProfit) }}</td>
                    <td class="num-ltr" :style="{ color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.netProfit) }}</td>
                    <td class="num-ltr">{{ r.branches }}</td>
                  </tr>
                  <tr v-if="!annualRows.length"><td colspan="7" class="empty-state"><div class="icon">📅</div><p>تحتاج بيانات من أكثر من سنة</p></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="card" v-if="annualStats.length">
            <div class="card-header"><h3>📈 مؤشرات النمو السنوية</h3></div>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>السنة</th><th>نمو المبيعات</th><th>نمو التكلفة</th><th>نمو الأرباح</th></tr></thead>
                <tbody>
                  <tr v-for="s in annualStats" :key="s.year">
                    <td style="font-weight:800;">{{ s.year }}</td>
                    <td class="num-ltr" :style="{ color: (s.salesGrowth ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ s.salesGrowth === null ? '—' : (s.salesGrowth.toFixed(1) + '%') }}</td>
                    <td class="num-ltr" :style="{ color: (s.costGrowth ?? 0) >= 0 ? 'var(--danger)' : 'var(--success)' }">{{ s.costGrowth === null ? '—' : (s.costGrowth.toFixed(1) + '%') }}</td>
                    <td class="num-ltr" :style="{ color: (s.profitGrowth ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ s.profitGrowth === null ? '—' : (s.profitGrowth.toFixed(1) + '%') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="charts-grid">
            <ChartView title="📊 الإيرادات والتكلفة والمصروفات بالسنوات"
              :labels="annualLabels"
              :datasets="[
                { label: 'الإيرادات', data: annualSales, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 6 },
                { label: 'التكلفة', data: annualCost, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 6 },
                { label: 'المصروفات', data: annualExpenses, backgroundColor: 'rgba(243,156,18,0.7)', borderRadius: 6 },
              ]"
            />
            <ChartView title="🏆 صافي الربح بالسنوات" type="line"
              :labels="annualLabels"
              :datasets="[{ label: 'صافي الربح', data: annualProfit, borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.15)', fill: true, tension: 0.4, pointRadius: 5 }]"
            />
          </div>
        </template>

      </div>
    </template>

    <div v-if="settingsModal" class="modal-overlay" @click.self="settingsModal = false">
      <div class="modal">
        <h3>🎨 إعدادات تقرير «{{ reportTitles[reportType] }}»</h3>
        <form @submit.prevent="saveSettings">
          <div class="form-row">
            <label>اللون الأساسي<input v-model="rsForm.primaryColor" type="color" class="input" style="padding:2px;height:40px" /></label>
            <label>اللون الثانوي<input v-model="rsForm.accentColor" type="color" class="input" style="padding:2px;height:40px" /></label>
          </div>
          <label>رسالة الترويسة
            <textarea v-model="rsForm.headerMessage" class="input" rows="2" placeholder="مثال: أُعد هذا التقرير بتاريخ..."></textarea>
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <input v-model="rsForm.saveAsTemplate" type="checkbox" /> حفظ الإعدادات أيضاً كقالب قابل لإعادة الاستخدام
          </label>
          <label v-if="rsForm.saveAsTemplate" style="margin-top:8px">
            اسم القالب<input v-model="rsForm.templateName" type="text" class="input" placeholder="مثال: تقرير الإغلاق القياسي" />
          </label>
          <div class="btn-group">
            <button class="btn btn-primary">حفظ</button>
            <button type="button" class="btn btn-outline" @click="settingsModal = false">إلغاء</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="versionsModal" class="modal-overlay" @click.self="versionsModal = false">
      <div class="modal wide">
        <h3>💾 نسخ تقرير «{{ reportTitles[reportType] }}» - {{ monthLabel(month) }}</h3>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button class="btn btn-primary btn-sm" @click="saveVersion">حفظ نسخة من البيانات الحالية</button>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>الإصدار</th><th>الحالة</th><th>المنشئ</th><th>التاريخ</th></tr></thead>
            <tbody>
              <tr v-for="v in versions" :key="v.id">
                <td>v{{ v.versionNo }}</td>
                <td><span class="badge" :class="v.status === 'final' ? 'badge-success' : 'badge-info'">{{ v.status === 'final' ? 'نهائي' : 'مسودة' }}</span></td>
                <td>{{ v.creator || '—' }}</td>
                <td class="mono">{{ (v.createdAt || '').replace('T', ' ').slice(0, 16) }}</td>
              </tr>
              <tr v-if="!versions.length"><td colspan="4" class="empty-cell">لا توجد نسخ محفوظة لهذا التقرير</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatMoney, formatNumber, currentMonth, monthLabel, calculateCost, calculateRatio, categoryLabel, categoryColor, previousMonth } from '../utils/format'
import { buildXls, downloadFile } from '../utils/excel'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const reportType = ref('overview')
const month = ref(currentMonth())
const loading = ref(false)
const records = ref([])
const expenses = ref([])
const trend = ref([])
const brandDist = ref([])
const annual = ref({ rows: [], stats: [] })
const branchesMetric = ref('profit')
const reportBranchFilter = ref('all')
const monthRecords = ref({})
const monthExpenses = ref({})

const templates = ref([])
const templateSel = ref('')
const settingsModal = ref(false)
const settingsMap = ref({})
const rsForm = ref({ primaryColor: '#b8860b', accentColor: '#4d5ec6', headerMessage: '', saveAsTemplate: false, templateName: '' })
const versionsModal = ref(false)
const versions = ref([])

const palette = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#8bc34a']
const fmt = (v) => formatNumber(v)

const activeBranchSet = computed(() => {
  if (reportBranchFilter.value === 'all') return null
  return new Set([Number(reportBranchFilter.value)])
})
const branchFilterFn = computed(() => {
  const s = activeBranchSet.value
  return s ? (b) => s.has(Number(b.id)) : () => true
})
const filteredExpenses = computed(() => {
  const s = activeBranchSet.value
  if (!s) return expenses.value
  return expenses.value.filter(e => s.has(Number(e.branchId)))
})

const branchRows = computed(() => {
  return store.branches.filter(branchFilterFn.value).map(b => {
    const r = records.value.find(x => x.branchId === b.id) || { opening: 0, purchases: 0, transfers: 0, closing: 0, sales: 0, notes: '' }
    const cost = calculateCost(r)
    const sales = Number(r.sales || 0)
    const ratio = calculateRatio(cost, sales)
    return { ...b, ...r, cost, sales, ratio, brandName: store.brandById[b.brandId]?.name }
  })
})
// charts for branch-level reports
const branchLabels = computed(() => branchRows.value.map(b => b.name))
const branchSalesData = computed(() => branchRows.value.map(b => b.sales))
const branchCostData = computed(() => branchRows.value.map(b => b.cost))
const branchClosingData = computed(() => branchRows.value.map(b => Number(b.closing || 0)))
const brandGroupLabels = computed(() => itemsBrandRows.value.map(g => g.brandName || '-'))
const brandGroupSalesData = computed(() => itemsBrandRows.value.map(g => g.sales))
const brandGroupCostData = computed(() => itemsBrandRows.value.map(g => g.cost))
const portfolioNames = computed(() => portfolioRows.value.map(b => b.name))
const portfolioNetData = computed(() => portfolioRows.value.map(b => b.sales - b.cost))
const portfolioNetColors = computed(() => portfolioNetData.value.map(v => v >= 0 ? 'rgba(26,188,156,0.75)' : 'rgba(231,76,60,0.75)'))
const allMonthsChartLabels = computed(() => [...allMonthsList.value].reverse().map(m => monthShortLabel(m)))
const allMonthsSalesData = computed(() => allMonthsSummary.value.map(x => x.revenue))
const allMonthsCostData = computed(() => allMonthsSummary.value.map(x => x.cost))
const allMonthsNetData = computed(() => allMonthsSummary.value.map(x => x.net))
const allMonthsSummary = computed(() => {
  const months = [...allMonthsList.value].reverse()
  return months.map(m => {
    let revenue = 0, cost = 0, net = 0
    for (const b of store.branches) {
      const rec = (monthRecords.value[m] || []).find(x => x.branchId === b.id)
      const exps = (monthExpenses.value[m] || []).filter(e => e.branchId === b.id)
      const sales = rec ? Number(rec.sales || 0) : 0
      const ccost = rec ? calculateCost(rec) : 0
      revenue += sales
      cost += ccost
      net += sales - ccost - exps.reduce((s, e) => s + Number(e.amount || 0), 0)
    }
    return { m, revenue, cost, net }
  })
})

const closingRows = computed(() => branchRows.value)
const statementRows = computed(() => branchRows.value)
const itemsRows = computed(() => branchRows.value)
const itemsBrandRows = computed(() => {
  const groups = new Map()
  for (const r of branchRows.value) {
    const key = r.brandId || 'none'
    if (!groups.has(key)) {
      groups.set(key, { brandId: key, brandName: r.brandName || '-', branches: 0, opening: 0, purchases: 0, transfers: 0, closing: 0, cost: 0, sales: 0, ratio: 0 })
    }
    const g = groups.get(key)
    g.branches += 1
    g.opening += Number(r.opening || 0)
    g.purchases += Number(r.purchases || 0)
    g.transfers += Number(r.transfers || 0)
    g.closing += Number(r.closing || 0)
    g.cost += Number(r.cost || 0)
    g.sales += Number(r.sales || 0)
  }
  const rows = Array.from(groups.values())
  for (const g of rows) g.ratio = calculateRatio(g.cost, g.sales)
  return rows
})
const portfolioRows = computed(() => [...branchRows.value].sort((a, b) => (b.sales - b.cost) - (a.sales - a.cost)))

// P&L
const grossProfit = computed(() => totalSales.value - totalCost.value)
const grossMargin = computed(() => totalSales.value > 0 ? (grossProfit.value / totalSales.value) * 100 : 0)
const expenseToRevenue = computed(() => totalSales.value > 0 ? (totalExpenses.value / totalSales.value) * 100 : 0)
const expenseCategories = computed(() => {
  const catOrder = ['fixed', 'variable', 'administrative', 'operational', 'other']
  const map = {}
  for (const e of filteredExpenses.value) {
    const c = e.category || 'other'
    if (!map[c]) map[c] = { cat: c, total: 0, count: 0 }
    map[c].total += Number(e.amount || 0)
    map[c].count += 1
  }
  return catOrder.filter(c => map[c]).map(c => map[c])
})
const expenseCategoryLabels = computed(() => expenseCategories.value.map(c => categoryLabel(c.cat)))
const expenseCategoryValues = computed(() => expenseCategories.value.map(c => c.total))

// branch comparison over months
const branchCompMonths = computed(() => Object.keys(monthRecords.value).sort())
const metricLabel = computed(() => ({ profit: 'صافي الربح', sales: 'الإيرادات', cost: 'التكلفة', ratio: 'نسبة التكلفة' }[branchesMetric.value] || branchesMetric.value))
function valueForRec(r, metric) {
  const cost = calculateCost(r)
  const sales = Number(r.sales || 0)
  if (metric === 'profit') return sales - cost
  if (metric === 'sales') return sales
  if (metric === 'cost') return cost
  return calculateRatio(cost, sales)
}
const branchCompRows = computed(() => {
  const months = branchCompMonths.value
  return store.branches.filter(branchFilterFn.value).map(b => {
    const values = {}
    let total = 0
    for (const m of months) {
      const rec = (monthRecords.value[m] || []).find(x => x.branchId === b.id)
      if (rec) { values[m] = valueForRec(rec, branchesMetric.value); total += branchesMetric.value === 'ratio' ? 0 : values[m] }
      else values[m] = null
    }
    if (branchesMetric.value === 'ratio' && months.length) {
      const all = months.map(m => values[m]).filter(v => v !== null)
      total = all.length ? all.reduce((s, v) => s + v, 0) / all.length : 0
    }
    return { ...b, values, total }
  }).filter(r => Object.values(r.values).some(v => v !== null))
})
function monthShortLabel(m) { return monthLabel(`${m}-01`).split(' ')[0] }
function fmtValue(v) {
  if (branchesMetric.value === 'ratio') return (v || 0).toFixed(2) + '%'
  return fmt(v)
}
function cellStyle(v) {
  if (v === null || v === undefined) return {}
  return { color: branchesMetric.value === 'profit' ? (v >= 0 ? 'var(--success)' : 'var(--danger)') : '' }
}

// All months detailed P&L per branch
const allMonthsList = computed(() => Object.keys(monthRecords.value).sort().reverse())
const allMonthsBranchRows = computed(() => {
  const months = allMonthsList.value
  return store.branches.filter(branchFilterFn.value).map(b => {
    const monthData = {}
    for (const m of months) {
      const rec = (monthRecords.value[m] || []).find(x => x.branchId === b.id)
      const exps = (monthExpenses.value[m] || []).filter(e => e.branchId === b.id)
      if (!rec && !exps.length) continue
      const cost = rec ? calculateCost(rec) : 0
      const sales = rec ? Number(rec.sales || 0) : 0
      const grossProfit = sales - cost
      const grossMargin = sales > 0 ? (grossProfit / sales) * 100 : 0
      const expByType = {}
      for (const e of exps) {
        const key = e.typeName || e.category || 'غير محدد'
        expByType[key] = (expByType[key] || 0) + Number(e.amount || 0)
      }
      const totalExpenses = Object.values(expByType).reduce((s, v) => s + v, 0)
      const netProfit = grossProfit - totalExpenses
      monthData[m] = {
        sales, cost, grossProfit, grossMargin,
        expenses: expByType,
        totalExpenses,
        netProfit,
        netMargin: sales > 0 ? (netProfit / sales) * 100 : 0,
        hasData: !!rec || exps.length > 0
      }
    }
    return { ...b, months: monthData }
  }).filter(b => Object.keys(b.months).length > 0)
})
// Collect all unique expense type names across all months/branches
const allExpenseTypes = computed(() => {
  const set = new Set()
  for (const b of allMonthsBranchRows.value) {
    for (const m of Object.keys(b.months)) {
      for (const k of Object.keys(b.months[m].expenses)) set.add(k)
    }
  }
  return Array.from(set).sort()
})

const annualRows = computed(() => annual.value.rows || [])
const annualStats = computed(() => annual.value.stats || [])
const annualLabels = computed(() => annualRows.value.map(r => r.year))
const annualSales = computed(() => annualRows.value.map(r => r.sales))
const annualCost = computed(() => annualRows.value.map(r => r.cost))
const annualExpenses = computed(() => annualRows.value.map(r => r.expenses))
const annualProfit = computed(() => annualRows.value.map(r => r.netProfit))
const bestProfitYear = computed(() => annualRows.value.reduce((best, r) => (best && best.netProfit >= r.netProfit) ? best : r, null))
const bestGrowthYear = computed(() => {
  const st = annualStats.value
  if (!st.length) return null
  const item = st.reduce((a, b) => (a.salesGrowth === null ? b : (b.salesGrowth === null || b.salesGrowth >= a.salesGrowth ? b : a)))
  return item.salesGrowth === null ? null : String(item.year)
})

const totalOpening = computed(() => branchRows.value.reduce((s, r) => s + Number(r.opening || 0), 0))
const totalPurchases = computed(() => branchRows.value.reduce((s, r) => s + Number(r.purchases || 0), 0))
const totalTransfers = computed(() => branchRows.value.reduce((s, r) => s + Number(r.transfers || 0), 0))
const totalClosing = computed(() => branchRows.value.reduce((s, r) => s + Number(r.closing || 0), 0))
const totalCost = computed(() => branchRows.value.reduce((s, r) => s + r.cost, 0))
const totalSales = computed(() => branchRows.value.reduce((s, r) => s + r.sales, 0))
const avgRatio = computed(() => totalSales.value > 0 ? (totalCost.value / totalSales.value) * 100 : 0)
const totalExpenses = computed(() => filteredExpenses.value.reduce((s, e) => s + Number(e.amount || 0), 0))
const netProfit = computed(() => totalSales.value - totalCost.value - totalExpenses.value)
const marginPercent = computed(() => totalSales.value > 0 ? (netProfit.value / totalSales.value) * 100 : 0)

// overview aliases
const overviewTotalCost = totalCost
const overviewTotalSales = totalSales
const overviewTotalExpenses = totalExpenses
const overviewNetProfit = netProfit
const overviewTrendLabels = computed(() => trend.value.map(t => monthLabel(t.month)))
const overviewTrendCost = computed(() => trend.value.map(t => Number(t.cost)))
const overviewTrendExp = computed(() => trend.value.map(t => Number(t.expenses || 0)))
const overviewTrendSales = computed(() => trend.value.map(t => Number(t.sales)))
const overviewBrandLabels = computed(() => brandDist.value.map(b => b.label))
const overviewBrandValues = computed(() => brandDist.value.map(b => Number(b.cost)))

const reportTitles = {
  overview: 'نظرة عامة',
  statement: 'كشف شهري تفصيلي',
  closing: 'تقرير بعد الإغلاق',
  items: 'بدلالة الأصناف',
  income: 'قائمة الدخل',
  pandl: 'دخل ومصروفات (P&L)',
  branches: 'مقارنة الفروع بالأشهر',
  allmonths: 'جميع الأشهر × الفروع (تفصيلي)',
  portfolio: 'ملخص الأداء',
  annual: 'مقارنة سنوية',
}

function exportExcel() {
  let sheet = '', headers = [], rows = []
  const base = (b) => [b.name, b.brandName || '-', b.opening, b.purchases, b.transfers, b.closing, b.cost, b.sales, b.ratio.toFixed(2), b.sales - b.cost]
  switch (reportType.value) {
    case 'overview':
      sheet = 'نظرة عامة'; headers = ['الفرع', 'العلامة', 'الإيرادات', 'التكلفة', 'نسبة التكلفة%', 'صافي الربح']
      rows = branchRows.value.map(b => [b.name, b.brandName || '-', b.sales, b.cost, b.ratio.toFixed(2), b.sales - b.cost])
      break
    case 'statement':
      sheet = 'كشف شهري'; headers = ['الفرع', 'العلامة', 'رصيد أول', 'مشتريات', 'التحويلات و المصروفات من المستودع', 'إجمالي متاح', 'رصيد آخر', 'تكلفة المبيعات', 'المبيعات', 'نسبة التكلفة%', 'ملاحظات']
      rows = statementRows.value.map(b => [b.name, b.brandName || '-', b.opening, b.purchases, b.transfers, Number(b.opening) + Number(b.purchases) + Number(b.transfers), b.closing, b.cost, b.sales, b.ratio.toFixed(2), b.notes || ''])
      break
    case 'closing':
      sheet = 'بعد الإغلاق'; headers = ['الفرع', 'رصيد أول', 'مشتريات', 'التحويلات و المصروفات من المستودع', 'إجمالي متاح', 'رصيد آخر', 'تكلفة المبيعات', 'المبيعات', 'نسبة التكلفة%']
      rows = closingRows.value.map(b => [b.name, b.opening, b.purchases, b.transfers, Number(b.opening) + Number(b.purchases) + Number(b.transfers), b.closing, b.cost, b.sales, b.ratio.toFixed(2)])
      break
    case 'items':
      sheet = 'بدلالة الأصناف'; headers = ['العلامة', 'عدد الفروع', 'رصيد أول', 'مشتريات', 'التحويلات و المصروفات من المستودع', 'رصيد آخر', 'التكلفة', 'المبيعات', 'نسبة التكلفة%', 'صافي الربح']
      rows = itemsBrandRows.value.map(b => [b.brandName, b.branches, b.opening, b.purchases, b.transfers, b.closing, b.cost, b.sales, b.ratio.toFixed(2), b.sales - b.cost])
      break
    case 'income':
      sheet = 'قائمة الدخل'; headers = []
      rows = [
        ['إجمالي الإيرادات', totalSales.value],
        ['تكلفة المبيعات', -totalCost.value],
        ['المصروفات العمومية والإدارية', -totalExpenses.value],
        ['مجمل الربح', totalSales.value - totalCost.value],
        ['صافي الربح', netProfit.value],
      ]
      break
    case 'pandl':
      sheet = 'دخل ومصروفات'; headers = ['البند', 'القيمة']
      rows = [
        ['إجمالي الإيرادات', totalSales.value],
        ['تكلفة المبيعات', totalCost.value],
        ['مجمل الربح', grossProfit.value],
        ...expenseCategories.value.map(c => [`مصروفات ${categoryLabel(c.cat)}`, c.total]),
        ['إجمالي المصروفات', totalExpenses.value],
        ['صافي الربح', netProfit.value],
        ['هامش مجمل الربح %', grossMargin.value.toFixed(2)],
        ['هامش صافي الربح %', marginPercent.value.toFixed(2)],
      ]
      break
    case 'branches':
      sheet = 'مقارنة الفروع'; headers = ['الفرع', ...branchCompMonths.value, 'الإجمالي']
      rows = branchCompRows.value.map(b => [b.name, ...branchCompMonths.value.map(m => b.values[m] !== null ? b.values[m] : ''), b.total])
      break
    case 'allmonths':
      sheet = 'جميع الأشهر تفصيلي'
      const monthsAll = allMonthsList.value
      const etypes = allExpenseTypes.value
      headers = ['الفرع']
      for (const m of monthsAll) {
        headers.push(`${monthShortLabel(m)} - إجمالي المبيعات`)
        headers.push(`${monthShortLabel(m)} - صافي المبيعات`)
        headers.push(`${monthShortLabel(m)} - تكلفة المبيعات`)
        headers.push(`${monthShortLabel(m)} - مجمل الربح`)
        headers.push(`${monthShortLabel(m)} - نسبة التكلفة%`)
        for (const et of etypes) headers.push(`${monthShortLabel(m)} - ${et}`)
        headers.push(`${monthShortLabel(m)} - إجمالي المصروفات`)
        headers.push(`${monthShortLabel(m)} - صافي الربح`)
      }
      rows = allMonthsBranchRows.value.map(b => {
        const row = [b.name]
        for (const m of monthsAll) {
          if (b.months[m]) {
            row.push(fmt(b.months[m].sales))
            row.push(fmt(b.months[m].sales))
            row.push(fmt(b.months[m].cost))
            row.push(fmt(b.months[m].grossProfit))
            row.push(b.months[m].grossMargin.toFixed(2))
            for (const et of etypes) row.push(b.months[m].expenses[et] ? fmt(b.months[m].expenses[et]) : '')
            row.push(fmt(b.months[m].totalExpenses))
            row.push(fmt(b.months[m].netProfit))
          } else {
            for (let i = 0; i < 7 + etypes.length; i++) row.push('')
          }
        }
        return row
      })
      break
    case 'portfolio':
      sheet = 'ملخص الأداء'; headers = ['الفرع', 'العلامة', 'الإيرادات', 'التكلفة', 'نسبة التكلفة%', 'صافي الربح']
      rows = portfolioRows.value.map(b => [b.name, b.brandName || '-', b.sales, b.cost, b.ratio.toFixed(2), b.sales - b.cost])
      break
    case 'annual':
      sheet = 'مقارنة سنوية'; headers = ['السنة', 'الإيرادات', 'التكلفة', 'المصروفات', 'مجمل الربح', 'صافي الربح', 'الفروع']
      rows = annualRows.value.map(r => [r.year, r.sales, r.cost, r.expenses, r.grossProfit, r.netProfit, r.branches])
      break
  }
  const text = buildXls(sheet, '', headers, rows)
  downloadFile(text, `report_${reportType.value}_${month.value}.xls`)
  showToast('✅ تم تصدير Excel', 'success')
}

const reportSettings = computed(() => settingsMap.value[reportType.value] || {})

function printReport() {
  const branchName = reportBranchFilter.value === 'all'
    ? 'جميع الفروع'
    : (store.branches.find(b => String(b.id) === String(reportBranchFilter.value))?.name || 'فرع محدد')
  capturePrint(document.querySelector('.report-print-area'), {
    title: `${reportTitles[reportType.value] || 'تقرير'} - ${monthLabel(month.value)} - ${branchName}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
    primaryColor: reportSettings.value.primaryColor,
    headerMessage: reportSettings.value.headerMessage,
  })
}

function pdfReport() {
  const branchName = reportBranchFilter.value === 'all'
    ? 'جميع الفروع'
    : (store.branches.find(b => String(b.id) === String(reportBranchFilter.value))?.name || 'فرع محدد')
  capturePrint(document.querySelector('.report-print-area'), {
    title: `${reportTitles[reportType.value] || 'تقرير'} - ${monthLabel(month.value)} - ${branchName}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
    primaryColor: reportSettings.value.primaryColor,
    headerMessage: reportSettings.value.headerMessage,
    pdf: true,
  })
}

async function loadTemplates() {
  try {
    const [tpls, sset] = await Promise.all([apiClient.getReportTemplates(), apiClient.getReportSettings()])
    templates.value = tpls || []
    const map = {}
    for (const s of sset || []) map[s.reportType] = s
    settingsMap.value = map
  } catch (_) {}
}

function applyTemplate() {
  const t = templates.value.find(x => String(x.id) === templateSel.value)
  if (!t) return
  const cfg = t.config || {}
  if (cfg.reportType) reportType.value = cfg.reportType
  if (cfg.branchId) reportBranchFilter.value = cfg.branchId
  else if (cfg.branchFilter) reportBranchFilter.value = cfg.branchFilter
  if (cfg.branchesMetric) branchesMetric.value = cfg.branchesMetric
  loadAll()
  showToast(`تم تطبيق القالب «${t.name}»`, 'success')
}

function openSettings() {
  const cur = reportSettings.value
  rsForm.value = { ...{ primaryColor: '#b8860b', accentColor: '#4d5ec6', headerMessage: '' }, ...cur, saveAsTemplate: false, templateName: '' }
  settingsModal.value = true
}

async function saveSettings() {
  try {
    await apiClient.saveReportSettings({
      reportType: reportType.value,
      primaryColor: rsForm.value.primaryColor,
      accentColor: rsForm.value.accentColor,
      headerMessage: rsForm.value.headerMessage,
    })
    if (rsForm.value.saveAsTemplate) {
      await apiClient.createReportTemplate({
        name: rsForm.value.templateName || `${reportTitles[reportType.value]} - ${month.value}`,
        reportType: reportType.value,
        config: { reportType: reportType.value, branchFilter: reportBranchFilter.value, branchesMetric: branchesMetric.value },
      })
    }
    settingsModal.value = false
    showToast('تم حفظ إعدادات التقرير', 'success')
    await loadTemplates()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function buildSnapshotData() {
  const meta = { month: month.value, branchFilter: reportBranchFilter.value, branchesMetric: branchesMetric.value }
  let rows = []
  if (reportType.value === 'annual') rows = annualRows.value.map(r => ({ year: r.year, sales: r.sales, cost: r.cost, expenses: r.expenses, netProfit: r.netProfit }))
  else if (reportType.value === 'branches') rows = branchCompRows.value.map(b => ({ name: b.name, values: b.values, total: b.total }))
  else if (reportType.value === 'items') rows = itemsBrandRows.value.map(g => ({ brandName: g.brandName, branches: g.branches, sales: g.sales, cost: g.cost, ratio: g.ratio }))
  else if (reportType.value === 'income' || reportType.value === 'pandl') {
    rows = [
      { item: 'الإيرادات', value: totalSales.value },
      { item: 'التكلفة', value: totalCost.value },
      { item: 'المصروفات', value: totalExpenses.value },
      { item: 'صافي الربح', value: netProfit.value },
    ]
  } else {
    rows = branchRows.value.map(b => ({ name: b.name, brandName: b.brandName || '-', opening: Number(b.opening || 0), purchases: Number(b.purchases || 0), transfers: Number(b.transfers || 0), closing: Number(b.closing || 0), cost: b.cost, sales: b.sales, ratio: b.ratio }))
  }
  return { ...meta, reportType: reportType.value, title: reportTitles[reportType.value], companyName: store.companyName }
}

function snapshotRows() {
  const data = buildSnapshotData()
  if (reportType.value === 'annual') return data.rows
  if (reportType.value === 'branches') return data.rows
  if (reportType.value === 'items') return data.rows
  if (reportType.value === 'income' || reportType.value === 'pandl') return data.rows
  const target = branchRows.value
  return target.map(b => ({ name: b.name, brandName: b.brandName || '-', opening: Number(b.opening || 0), purchases: Number(b.purchases || 0), transfers: Number(b.transfers || 0), closing: Number(b.closing || 0), cost: b.cost, sales: b.sales, ratio: b.ratio }))
}

async function saveVersion() {
  try {
    const snapshot = { ...buildSnapshotData(), rows: snapshotRows() }
    await apiClient.createReportVersion({ reportType: reportType.value, month: month.value, status: 'draft', snapshot })
    showToast('تم حفظ نسخة من بيانات التقرير', 'success')
    if (versionsModal.value) await openVersions()
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function openVersions() {
  versionsModal.value = true
  versions.value = await apiClient.getReportVersions({ reportType: reportType.value, month: month.value })
}

async function loadAll() {
  loading.value = true
  try {
    const months = []
    for (let i = 0; i < 6; i++) months.push(previousMonth(month.value, i))
    const monthCalls = months.map(m => apiClient.getRecords({ month: m }).then(r => [m, r]))
    const expenseCalls = months.map(m => apiClient.getExpenses({ month: m }).then(r => [m, r]))
    const [recs, exp, tr, bd, branches, yc, ...monthResults] = await Promise.all([
      apiClient.getRecords({ month: month.value }),
      apiClient.getExpenses({ month: month.value }),
      apiClient.getTrend(),
      apiClient.getBrandDistribution(),
      apiClient.getBranches(),
      apiClient.yearComparison({ month: month.value }),
      ...monthCalls,
      ...expenseCalls,
    ])
    records.value = recs
    expenses.value = exp
    trend.value = tr
    brandDist.value = bd
    store.branches = branches
    annual.value = yc || { rows: [], stats: [] }
    const mm = {}
    const em = {}
    for (const [m, rows] of monthResults.slice(0, 6)) mm[m] = rows
    for (const [m, rows] of monthResults.slice(6)) em[m] = rows
    monthRecords.value = mm
    monthExpenses.value = em
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadAll(); loadTemplates() })
watch(reportType, loadAll)
</script>
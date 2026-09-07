<template>
  <div>
    <div class="topbar">
      <h1>📈 تقارير تحليلية</h1>
      <div class="actions">
        <select class="input" style="width:230px;" v-model="tab" @change="load">
          <option value="budget">📋 انحراف الميزانية</option>
          <option value="expense">🧾 تحليل المصروفات</option>
          <option value="mom">🔄 مقارنة شهرية</option>
          <option value="foodcost">📉 نسبة تكلفة الطعام</option>
          <option value="brand">🏢 أداء العلامات</option>
          <option value="top">🏆 أفضل/أسوأ الفروع</option>
          <option value="alerts">⚠️ تنبيهات ذكية</option>
        </select>
        <input v-if="tab === 'foodcost'" type="number" class="input" style="width:120px;" v-model.number="year" min="2000" max="2100" @change="load" />
        <input v-else type="month" class="input" style="width:170px;" v-model="month" @change="load" />
        <select v-if="tab !== 'brand'" class="input" style="width:200px;" v-model="branch" @change="load">
          <option value="all">🌐 جميع الفروع</option>
          <option v-for="b in store.branches" :key="b.id" :value="String(b.id)">{{ b.name }}</option>
        </select>
        <button class="btn btn-info" @click="exportExcel">⬇️ Excel</button>
        <button class="btn btn-primary" @click="printReport">🖨️ طباعة / PDF</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <!-- ===== Budget variance ===== -->
      <template v-if="tab === 'budget' && budget">
        <div class="kpi-grid">
          <KpiCard v-for="t in budget.totals" :key="t.key" :icon="kpiIcon(t.key)" :label="t.label"
            :value="t.actual" :sub="plannedSub(t)" color="var(--info)" />
        </div>
        <div class="card">
          <div class="card-header"><h3>📋 انحراف الميزانية عن الفعلي — {{ monthLabel(month) }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th v-for="t in budget.totals" :key="'h' + t.key">{{ t.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in budget.rows" :key="r.branchId">
                  <td><strong>{{ r.name }}</strong></td>
                  <td v-for="m in r.metrics" :key="m.key" class="num-ltr">
                    <div>{{ fmt(m.actual) }} <span class="muted" style="font-size:11px;">/ {{ fmt(m.planned) }}</span></div>
                    <div :style="{ color: varianceColor(m), fontWeight: 700, fontSize: 12 }">{{ varianceText(m) }}</div>
                  </td>
                </tr>
                <tr v-if="!budget.rows.length"><td :colspan="budget.totals.length + 1" class="empty-state"><div class="icon">📋</div><p>لا توجد بيانات</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="charts-grid">
          <ChartView title="📊 الفعلي مقابل المخطط (الإجمالي)" type="bar"
            :labels="budget.totals.map(t => t.label)"
            :datasets="[
              { label: 'المخطط', data: budget.totals.map(t => t.planned), backgroundColor: 'rgba(52,152,219,0.7)', borderRadius: 5 },
              { label: 'الفعلي', data: budget.totals.map(t => t.actual), backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 5 },
            ]"
            :options="{ plugins: { legend: { position: 'bottom' } } }"
          />
        </div>
      </template>

      <!-- ===== Expense analysis ===== -->
      <template v-else-if="tab === 'expense' && expense">
        <div class="kpi-grid">
          <KpiCard icon="💸" label="إجمالي المصروفات" :value="expense.total" color="var(--danger)" />
          <KpiCard icon="📅" label="الشهر السابق" :value="expense.prevTotal" color="var(--warning)" />
          <KpiCard icon="📉" label="التغير عن السابق" :value="expense.total - expense.prevTotal"
            :color="(expense.total - expense.prevTotal) <= 0 ? 'var(--success)' : 'var(--danger)'"
            :sub="expense.prevTotal ? ((expense.total - expense.prevTotal) / expense.prevTotal * 100).toFixed(1) + '%' : ''" />
        </div>
        <div class="charts-grid">
          <ChartView title="🥧 حسب التصنيف" type="doughnut"
            :labels="expense.categoryRows.map(c => c.label)"
            :datasets="[{ data: expense.categoryRows.map(c => c.total), backgroundColor: palette }]"
            :options="{ plugins: { legend: { position: 'right' } } }"
          />
          <ChartView title="🏢 حسب الفرع" type="bar"
            :labels="expense.branchRows.map(b => b.name)"
            :datasets="[{ data: expense.branchRows.map(b => b.total), backgroundColor: 'rgba(155,89,182,0.7)', borderRadius: 5 }]"
          />
        </div>
        <div class="card">
          <div class="card-header"><h3>📊 المصروفات حسب التصنيف والفرع — {{ monthLabel(month) }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>التصنيف</th><th>المبلغ</th><th>النسبة</th></tr></thead>
              <tbody>
                <tr v-for="c in expense.categoryRows" :key="c.category">
                  <td><strong>{{ c.label }}</strong></td>
                  <td class="num-ltr">{{ fmt(c.total) }}</td>
                  <td class="num-ltr">{{ c.pct.toFixed(2) }}%</td>
                </tr>
                <tr v-if="!expense.categoryRows.length"><td colspan="3" class="empty-state"><div class="icon">🧾</div><p>لا مصروفات لهذا الشهر</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>🏆 أعلى بنود المصروفات</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>البند</th><th>النوع</th><th>الفرع</th><th>المبلغ</th></tr></thead>
              <tbody>
                <tr v-for="(it, i) in expense.topItems" :key="it.id">
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ it.description }}</strong></td>
                  <td>{{ it.typeName }}</td>
                  <td>{{ it.branchName }}</td>
                  <td class="num-ltr">{{ fmt(it.amount) }}</td>
                </tr>
                <tr v-if="!expense.topItems.length"><td colspan="5" class="empty-state"><div class="icon">🧾</div><p>لا بنود</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== MoM comparison ===== -->
      <template v-else-if="tab === 'mom' && mom">
        <div class="card">
          <div class="card-header"><h3>🔄 مقارنة {{ monthLabel(month) }} مع {{ monthLabel(mom.previousMonth) }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>البند</th><th>{{ monthLabel(mom.previousMonth) }}</th><th>{{ monthLabel(month) }}</th><th>التغير</th><th>النسبة %</th></tr></thead>
              <tbody>
                <tr v-for="d in momRows" :key="d.key">
                  <td><strong>{{ d.label }}</strong></td>
                  <td class="num-ltr">{{ fmt(d.previous) }}</td>
                  <td class="num-ltr" :style="{ fontWeight: 700, color: d.key === 'netProfit' ? (d.current >= 0 ? 'var(--success)' : 'var(--danger)') : '' }">{{ fmt(d.current) }}</td>
                  <td class="num-ltr" :style="{ color: d.change >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ d.changeText }}</td>
                  <td class="num-ltr" :style="{ color: d.changePct === null ? '#888' : (d.changePct >= 0 ? 'var(--success)' : 'var(--danger)') }">{{ d.changePct === null ? '—' : d.changePct.toFixed(2) + '%' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="charts-grid">
          <ChartView title="📊 مقارنة المكونات" type="bar"
            :labels="momRows.map(d => d.label)"
            :datasets="[
              { label: monthLabel(mom.previousMonth), data: momRows.map(d => d.previous), backgroundColor: 'rgba(52,152,219,0.7)', borderRadius: 5 },
              { label: monthLabel(month), data: momRows.map(d => d.current), backgroundColor: 'rgba(26,188,156,0.7)', borderRadius: 5 },
            ]"
            :options="{ plugins: { legend: { position: 'bottom' } } }"
          />
        </div>
      </template>

      <!-- ===== Food cost trend ===== -->
      <template v-else-if="tab === 'foodcost' && foodcost">
        <div class="kpi-grid">
          <KpiCard icon="📉" label="متوسط نسبة التكلفة" :value="foodcostAvg" isPercent color="var(--warning)" />
          <KpiCard icon="💰" label="إجمالي الإيرادات" :value="foodcostSales" color="var(--success)" />
          <KpiCard icon="🧾" label="إجمالي التكلفة" :value="foodcostCost" color="var(--danger)" />
        </div>
        <div class="card">
          <div class="card-header"><h3>📉 نسبة تكلفة الطعام عبر الأشهر — {{ year }}</h3></div>
          <div class="charts-grid">
            <ChartView title="📉 نسبة التكلفة %" type="line"
              :labels="foodcost.months.map(m => monthLabel(m.month))"
              :datasets="[{ label: 'نسبة التكلفة %', data: foodcost.months.map(m => m.ratio), borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.12)', fill: true, tension: 0.35 }]"
            />
            <ChartView title="💰 الإيرادات مقابل التكلفة" type="bar"
              :labels="foodcost.months.map(m => monthLabel(m.month))"
              :datasets="[
                { label: 'الإيرادات', data: foodcost.months.map(m => m.sales), backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 5 },
                { label: 'التكلفة', data: foodcost.months.map(m => m.cost), backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 5 },
              ]"
            />
          </div>
          <div class="table-wrapper" style="margin-top:12px;">
            <table>
              <thead><tr><th>الشهر</th><th>الإيرادات</th><th>التكلفة</th><th>النسبة %</th></tr></thead>
              <tbody>
                <tr v-for="m in foodcost.months" :key="m.month">
                  <td><strong>{{ monthLabel(m.month) }}</strong></td>
                  <td class="num-ltr">{{ fmt(m.sales) }}</td>
                  <td class="num-ltr">{{ fmt(m.cost) }}</td>
                  <td class="num-ltr" :style="{ color: m.ratio > 40 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }">{{ m.ratio.toFixed(2) }}%</td>
                </tr>
                <tr v-if="!foodcost.months.length"><td colspan="4" class="empty-state"><div class="icon">📉</div><p>لا بيانات لهذه السنة</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Brand performance ===== -->
      <template v-else-if="tab === 'brand' && brand">
        <div class="card">
          <div class="card-header"><h3>🏢 أداء العلامات التجارية — {{ monthLabel(month) }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>العلامة</th><th>الإيرادات</th><th>التكلفة</th><th>نسبة التكلفة</th><th>المصروفات</th><th>مجمل الربح</th><th>صافي الربح</th><th>هامش الصافي</th></tr></thead>
              <tbody>
                <tr v-for="r in brand.rows" :key="r.brandId">
                  <td><strong><span :style="{ color: r.brandColor }">●</span> {{ r.brandName }}</strong></td>
                  <td class="num-ltr">{{ fmt(r.revenue) }}</td>
                  <td class="num-ltr">{{ fmt(r.cost) }}</td>
                  <td class="num-ltr">{{ r.costRatio.toFixed(2) }}%</td>
                  <td class="num-ltr">{{ fmt(r.expenses) }}</td>
                  <td class="num-ltr" :style="{ color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(r.grossProfit) }}</td>
                  <td class="num-ltr" :style="{ color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.netProfit) }}</td>
                  <td class="num-ltr">{{ r.netRatio.toFixed(2) }}%</td>
                </tr>
                <tr v-if="!brand.rows.length"><td colspan="8" class="empty-state"><div class="icon">🏢</div><p>لا بيانات</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="charts-grid">
          <ChartView title="🥧 الإيرادات حسب العلامة" type="doughnut"
            :labels="brand.rows.map(r => r.brandName)"
            :datasets="[{ data: brand.rows.map(r => r.revenue), backgroundColor: brand.rows.map(r => r.brandColor || '#888') }]"
            :options="{ plugins: { legend: { position: 'right' } } }"
          />
          <ChartView title="🏆 صافي الربح حسب العلامة" type="bar"
            :labels="brand.rows.map(r => r.brandName)"
            :datasets="[{ data: brand.rows.map(r => r.netProfit), backgroundColor: brand.rows.map(r => r.brandColor || '#888'), borderRadius: 5 }]"
          />
        </div>
      </template>

      <!-- ===== Top / bottom branches ===== -->
      <template v-else-if="tab === 'top' && top">
        <div class="card">
          <div class="card-header"><h3>🏆 ترتيب الفروع حسب صافي الربح — {{ monthLabel(month) }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>الفرع</th><th>العلامة</th><th>الإيرادات</th><th>التكلفة</th><th>نسبة التكلفة</th><th>المصروفات</th><th>صافي الربح</th><th>السبب</th></tr></thead>
              <tbody>
                <tr v-for="(r, i) in top.rows" :key="r.branchId">
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ r.name }}</strong></td>
                  <td>{{ r.brandName }}</td>
                  <td class="num-ltr">{{ fmt(r.revenue) }}</td>
                  <td class="num-ltr">{{ fmt(r.cost) }}</td>
                  <td class="num-ltr">{{ r.costRatio.toFixed(2) }}%</td>
                  <td class="num-ltr">{{ fmt(r.expenses) }}</td>
                  <td class="num-ltr" :style="{ color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.netProfit) }}</td>
                  <td><span class="pill" :style="{ background: reasonColor(r.reason) + '22', color: reasonColor(r.reason) }">{{ r.reason }}</span></td>
                </tr>
                <tr v-if="!top.rows.length"><td colspan="9" class="empty-state"><div class="icon">🏆</div><p>لا بيانات</p></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- ===== Smart alerts ===== -->
      <template v-else-if="tab === 'alerts' && alerts">
        <div class="kpi-grid">
          <KpiCard icon="⚠️" label="إجمالي التنبيهات" :value="alerts.alerts.length" color="var(--danger)" />
          <KpiCard icon="🔴" label="عالية الخطورة" :value="alerts.alerts.filter(a => a.severity === 'high').length" color="var(--danger)" />
          <KpiCard icon="🟡" label="تحذيرية" :value="alerts.alerts.filter(a => a.severity === 'warning').length" color="var(--warning)" />
        </div>
        <div class="card">
          <div class="card-header"><h3>⚠️ تنبيهات ذكية مقابل أهداف KPI — {{ monthLabel(month) }}</h3></div>
          <div v-if="!alerts.alerts.length" class="empty-state"><div class="icon">✅</div><p>لا توجد تنبيهات — كل الفروع ضمن الأهداف (أو لا توجد أهداف KPI لهذا الشهر)</p></div>
          <div v-else class="alerts-list">
            <div v-for="(a, i) in alerts.alerts" :key="i" class="alert-item" :class="a.severity">
              <span class="alert-icon">{{ a.severity === 'high' ? '🔴' : '🟡' }}</span>
              <div class="alert-body">
                <div class="alert-title"><strong>{{ a.branchName }}</strong> — {{ alertTypeLabel(a.type) }}</div>
                <div class="alert-msg">{{ a.message }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '../api/client'
import { store } from '../store'
import { showToast } from '../store/toast'
import { formatNumber, monthLabel, currentMonth } from '../utils/format'
import { buildXls, downloadFile } from '../utils/excel'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const tab = ref('budget')
const month = ref(currentMonth())
const year = ref(Number(currentMonth().slice(0, 4)))
const branch = ref('all')
const loading = ref(false)
const budget = ref(null)
const expense = ref(null)
const mom = ref(null)
const foodcost = ref(null)
const brand = ref(null)
const top = ref(null)
const alerts = ref(null)

const fmt = (v) => formatNumber(v)
const palette = ['#3498db', '#e74c3c', '#f39c12', '#9b59b6', '#27ae60', '#e67e22', '#1abc9c', '#c0392b']

const momRows = computed(() => {
  if (!mom.value) return []
  const labels = { revenue: 'الإيرادات', cogs: 'تكلفة المبيعات', expenses: 'المصروفات', netProfit: 'صافي الربح' }
  return ['revenue', 'cogs', 'expenses', 'netProfit'].map(k => {
    const d = mom.value.deltas[k]
    return { key: k, label: labels[k], ...d, changeText: (d.change >= 0 ? '+' : '-') + ' ' + fmt(Math.abs(d.change)) }
  })
})

const foodcostAvg = computed(() => {
  const ms = foodcost.value?.months || []
  const withData = ms.filter(m => m.sales > 0)
  if (!withData.length) return 0
  return withData.reduce((s, m) => s + m.ratio, 0) / withData.length
})
const foodcostSales = computed(() => (foodcost.value?.months || []).reduce((s, m) => s + m.sales, 0))
const foodcostCost = computed(() => (foodcost.value?.months || []).reduce((s, m) => s + m.cost, 0))

function kpiIcon(key) {
  return ({ revenue: '💰', cost: '🧾', expense: '💸', profit: '🏆' })[key] || '📊'
}
function plannedSub(t) {
  return 'المخطط: ' + fmt(t.planned)
}
function varianceText(m) {
  if (m.variancePct === null) return 'لا ميزانية'
  return (m.variance >= 0 ? '+' : '-') + fmt(Math.abs(m.variance)) + ' (' + m.variancePct.toFixed(1) + '%)'
}
function varianceColor(m) {
  if (m.variancePct === null) return '#888'
  if (m.key === 'revenue' || m.key === 'profit') return m.variance >= 0 ? 'var(--success)' : 'var(--danger)'
  return m.variance <= 0 ? 'var(--success)' : 'var(--danger)'
}
function reasonColor(reason) {
  return reason === 'أداء جيد' ? '#27ae60' : '#e74c3c'
}
function alertTypeLabel(type) {
  return ({ costRatio: 'نسبة التكلفة', profit: 'صافي الربح', expenses: 'المصروفات', sales: 'الإيرادات' })[type] || type
}

async function load() {
  loading.value = true
  try {
    if (tab.value === 'budget') budget.value = await apiClient.getBudgetVariance({ month: month.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
    else if (tab.value === 'expense') expense.value = await apiClient.getExpenseAnalysis({ month: month.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
    else if (tab.value === 'mom') mom.value = await apiClient.getMomComparison({ month: month.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
    else if (tab.value === 'foodcost') foodcost.value = await apiClient.getFoodCostTrend({ year: year.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
    else if (tab.value === 'brand') brand.value = await apiClient.getBrandPerformance({ month: month.value })
    else if (tab.value === 'top') top.value = await apiClient.getTopBranches({ month: month.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
    else if (tab.value === 'alerts') alerts.value = await apiClient.getSmartAlerts({ month: month.value, ...(branch.value !== 'all' ? { branchId: branch.value } : {}) })
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function printReport() {
  const area = document.querySelector('.main .page')
  if (!area) return
  capturePrint(area, {
    title: `📈 تقرير تحليلي — ${tabLabel(tab.value)}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
    primaryColor: '#b8860b',
    landscape: true,
  })
}

function tabLabel(t) {
  return ({ budget: 'انحراف الميزانية', expense: 'تحليل المصروفات', mom: 'مقارنة شهرية', foodcost: 'نسبة تكلفة الطعام', brand: 'أداء العلامات', top: 'أفضل/أسوأ الفروع', alerts: 'تنبيهات ذكية' })[t] || t
}

function exportExcel() {
  const rows = []
  if (tab.value === 'budget' && budget.value) {
    rows.push(['انحراف الميزانية', monthLabel(month.value)])
    rows.push(['الفرع', ...budget.value.totals.map(t => t.label)])
    for (const r of budget.value.rows) rows.push([r.name, ...r.metrics.map(m => m.actual)])
    rows.push(['الإجمالي', ...budget.value.totals.map(t => t.actual)])
  } else if (tab.value === 'expense' && expense.value) {
    rows.push(['تحليل المصروفات', monthLabel(month.value)])
    rows.push(['إجمالي', expense.value.total, 'الشهر السابق', expense.value.prevTotal])
    rows.push([])
    rows.push(['التصنيف', 'المبلغ', 'النسبة%'])
    for (const c of expense.value.categoryRows) rows.push([c.label, c.total, c.pct.toFixed(2)])
    rows.push([])
    rows.push(['أعلى البنود', 'النوع', 'الفرع', 'المبلغ'])
    for (const it of expense.value.topItems) rows.push([it.description, it.typeName, it.branchName, it.amount])
  } else if (tab.value === 'mom' && mom.value) {
    rows.push(['مقارنة شهرية', monthLabel(month.value), 'مع', monthLabel(mom.value.previousMonth)])
    rows.push(['البند', monthLabel(mom.value.previousMonth), monthLabel(month.value), 'التغير', 'النسبة%'])
    for (const d of momRows.value) rows.push([d.label, d.previous, d.current, d.change, d.changePct === null ? '' : d.changePct.toFixed(2)])
  } else if (tab.value === 'foodcost' && foodcost.value) {
    rows.push(['نسبة تكلفة الطعام', String(year.value)])
    rows.push(['الشهر', 'الإيرادات', 'التكلفة', 'النسبة%'])
    for (const m of foodcost.value.months) rows.push([monthLabel(m.month), m.sales, m.cost, m.ratio.toFixed(2)])
  } else if (tab.value === 'brand' && brand.value) {
    rows.push(['أداء العلامات', monthLabel(month.value)])
    rows.push(['العلامة', 'الإيرادات', 'التكلفة', 'نسبة التكلفة%', 'المصروفات', 'صافي الربح', 'هامش الصافي%'])
    for (const r of brand.value.rows) rows.push([r.brandName, r.revenue, r.cost, r.costRatio.toFixed(2), r.expenses, r.netProfit, r.netRatio.toFixed(2)])
  } else if (tab.value === 'top' && top.value) {
    rows.push(['ترتيب الفروع', monthLabel(month.value)])
    rows.push(['#', 'الفرع', 'الإيرادات', 'التكلفة', 'المصروفات', 'صافي الربح', 'السبب'])
    top.value.rows.forEach((r, i) => rows.push([i + 1, r.name, r.revenue, r.cost, r.expenses, r.netProfit, r.reason]))
  } else if (tab.value === 'alerts' && alerts.value) {
    rows.push(['تنبيهات ذكية', monthLabel(month.value)])
    rows.push(['الفرع', 'النوع', 'الرسالة'])
    for (const a of alerts.value.alerts) rows.push([a.branchName, alertTypeLabel(a.type), a.message])
  } else return
  const text = buildXls('تقرير تحليلي', '', ['البند', 'القيمة'], rows)
  downloadFile(text, `insight_${tab.value}_${month.value}.xls`)
  showToast('✅ تم تصدير Excel', 'success')
}

watch(tab, load)
watch(month, load)
watch(year, load)
watch(branch, load)

onMounted(load)
</script>

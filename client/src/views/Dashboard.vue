<template>
  <div>
    <div class="topbar">
      <h1>📊 لوحة التحكم</h1>
      <div class="actions">
        <button class="btn btn-outline" @click="customOpen = !customOpen">🎛️ تخصيص</button>
        <select class="input" style="width:170px;" v-model="brandFilter" @change="loadAll">
          <option value="all">🌐 كل العلامات</option>
          <option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <button class="btn btn-gold" @click="printReport">🖨️ طباعة</button>
        <button class="btn btn-teal" @click="toggleTheme">{{ isDark ? '☀️ فاتح' : '🌙 داكن' }}</button>
        <input type="month" class="input" style="width:180px;" v-model="month" @change="loadAll" />
      </div>
    </div>

    <div v-if="customOpen" class="card" style="margin-bottom: 14px; border-color: var(--gold);">
      <div class="card-header">
        <h3>🎛️ تخصيص لوحة التحكم</h3>
        <span class="text-muted" style="font-size:12px;">اختر العناصر الظاهرة (يُحفظ تلقائياً)</span>
      </div>
      <div class="flex" style="flex-wrap: wrap; gap: 16px;">
        <label v-for="w in widgets" :key="w.key" class="checkbox-label" style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
          <input type="checkbox" :checked="dash[w.key]" @change="toggleWidget(w.key)" /> {{ w.icon }} {{ w.label }}
        </label>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <div class="report-print-area">
      <div class="kpi-grid" v-if="dash.kpis">
        <KpiCard icon="💰" label="إجمالي التكاليف" :value="summary.totalCost" :change="summary.costChange" :good-when-down="true" vs-label="السابق" color="var(--danger)" />
        <KpiCard icon="📈" label="الإيرادات" :value="summary.totalSales" :change="summary.salesChange" vs-label="السابق" color="var(--success)" />
        <KpiCard icon="📊" label="مجمل الربح" :value="summary.grossProfit" color="var(--info)" />
        <KpiCard icon="📉" label="هامش الربح" :value="summary.grossMargin" :is-percent="true" color="var(--purple)" />
        <KpiCard icon="💰" label="إجمالي المصروفات" :value="summary.totalExpenses" :good-when-down="true" vs-label="السابق" color="var(--warning)" />
        <KpiCard icon="🏆" label="صافي الربح" :value="summary.netProfit" :change="summary.profitChange" vs-label="السابق" color="var(--teal)" />
        <KpiCard icon="🏪" label="الفروع النشطة" :value="`${summary.activeBranches} / ${summary.branchCount}`" color="#34495e" />
      </div>

      <div class="charts-grid">
        <ChartView v-if="dash.chartBranches"
          title="📊 التكاليف vs الإيرادات"
          :labels="chartLabels"
          :datasets="[
            { label: 'التكاليف', data: costsData, backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 6 },
            { label: 'الإيرادات', data: salesData, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 6 },
          ]"
        />
        <ChartView v-if="dash.chartBrand"
          title="🥧 توزيع التكاليف حسب العلامة"
          type="doughnut"
          :labels="brandDistLabels"
          :datasets="[{ data: brandDistValues, backgroundColor: brandDistColors, borderColor: 'white', borderWidth: 2 }]"
          :options="{ cutout: '55%', plugins: { legend: { position: 'right' } } }"
        />
      </div>

      <div class="charts-grid mt-20">
        <ChartView v-if="dash.chartTrend"
          title="📈 اتجاه التكاليف والمصروفات"
          type="line"
          :labels="trendLabels"
          :datasets="[
            { label: 'التكاليف', data: trendCosts, borderColor: '#e74c3c', tension: 0.4, fill: false, pointRadius: 4 },
            { label: 'المصروفات', data: trendExpenses, borderColor: '#f39c12', tension: 0.4, fill: false, pointRadius: 4 },
            { label: 'الإيرادات', data: trendSales, borderColor: '#27ae60', tension: 0.4, fill: false, pointRadius: 4 },
          ]"
        />
        <ChartView v-if="dash.chartBudget"
          title="📊 الميزانية vs الفعلي"
          :labels="budgetLabels"
          :datasets="[
            { label: 'المخطط', data: budgetPlanned, backgroundColor: 'rgba(52,152,219,0.7)', borderRadius: 6 },
            { label: 'الفعلي', data: budgetActual, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 6 },
          ]"
        />
      </div>

      <div class="card" v-if="dash.ranking">
        <div class="card-header">
          <h3>🏆 ترتيب الفروع - صافي الربح</h3>
        </div>
        <div style="max-height: 360px; overflow-y: auto;">
          <div v-for="(b, i) in ranking" :key="b.id" class="flex between wrap" style="padding: 11px 14px; border-bottom: 1px solid var(--border);">
            <div class="flex" style="gap: 12px;">
              <span style="font-weight: 800; font-size: 16px; width: 30px; text-align: center; color: var(--gold);">{{ i + 1 }}</span>
              <div>
                <div style="font-weight: 700;">{{ b.name }}</div>
                <div class="text-muted" style="font-size: 11px;">{{ b.brandName }} · مصروفات: {{ formatMoney(b.expenses) }}</div>
              </div>
            </div>
            <div style="text-align: left;">
              <div :style="{ fontWeight: 800, color: b.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ formatMoney(b.netProfit) }}</div>
              <div class="text-muted" style="font-size: 11px;">نسبة التكلفة: {{ b.ratio.toFixed(1) }}%</div>
            </div>
          </div>
          <div v-if="!ranking.length" class="empty-state"><div class="icon">🏪</div><p>لا توجد بيانات لهذا الشهر</p></div>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store, setTheme } from '../store'
import { formatMoney, currentMonth, monthLabel } from '../utils/format'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const month = ref(currentMonth())
const brandFilter = ref('all')
const customOpen = ref(false)
const defaultDash = { kpis: true, chartBranches: true, chartBrand: true, chartTrend: true, chartBudget: true, ranking: true }
const dash = reactive({ ...defaultDash, ...(store.settings.dash || {}) })
const widgets = [
  { key: 'kpis', icon: '🎯', label: 'بطاقات المؤشرات' },
  { key: 'chartBranches', icon: '📊', label: 'رسم: التكاليف vs الإيرادات' },
  { key: 'chartBrand', icon: '🥧', label: 'رسم: توزيع العلامات' },
  { key: 'chartTrend', icon: '📈', label: 'رسم: الاتجاه الشهري' },
  { key: 'chartBudget', icon: '📋', label: 'رسم: الميزانية' },
  { key: 'ranking', icon: '🏆', label: 'ترتيب الفروع' },
]
async function toggleWidget(key) {
  dash[key] = !dash[key]
  store.settings.dash = { ...dash }
  try {
    await apiClient.saveSettings({ dash: { ...dash } })
  } catch (e) { showToast('فشل حفظ التخصيص: ' + e.message, 'error') }
}
const loading = ref(true)
const summary = ref({})
const ranking = ref([])
const trend = ref([])
const brandDist = ref([])
const budgetSummary = ref([])
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')

const recordsCache = reactive({ records: {} })

function recordsOf(m, branchId) {
  return recordsCache.records[`${m}-${branchId}`]
}

const visibleBranches = computed(() => {
  if (brandFilter.value === 'all') return store.branches
  return store.branches.filter(b => b.brandId === Number(brandFilter.value))
})
const chartLabels = computed(() => visibleBranches.value.map(b => b.name.length > 20 ? b.name.slice(0, 20) + '…' : b.name))
const costsData = computed(() => visibleBranches.value.map(b => recordsOf(month.value, b.id)?.cost || 0))
const salesData = computed(() => visibleBranches.value.map(b => recordsOf(month.value, b.id)?.sales || 0))

const brandDistLabels = computed(() => brandDist.value.map(b => b.label))
const brandDistValues = computed(() => brandDist.value.map(b => Number(b.cost)))
const brandDistColors = computed(() => brandDist.value.map(b => (b.color || '#FFD700') + 'CC'))

const trendLabels = computed(() => trend.value.map(t => monthLabel(t.month).split(' ')[0] + ' ' + t.month.slice(2, 4)))
const trendCosts = computed(() => trend.value.map(t => Number(t.cost)))
const trendSales = computed(() => trend.value.map(t => Number(t.sales)))
const trendExpenses = computed(() => trend.value.map(t => Number(t.expenses)))

const budgetLabels = computed(() => budgetSummary.value.map(b => monthLabel(b.month)))
const budgetPlanned = computed(() => budgetSummary.value.map(b => Number(b.planned)))
const budgetActual = computed(() => budgetSummary.value.map(b => Number(b.actual)))

async function loadAll() {
  loading.value = true
  try {
    const m = month.value
    const year = new Date().getFullYear()
    const brandQ = brandFilter.value === 'all' ? undefined : brandFilter.value

    const [sum, rank, tr, bd, budget, recs, brands, branches] = await Promise.all([
      apiClient.getSummary({ month: m, brandId: brandQ }),
      apiClient.getBranchRanking({ month: m, brandId: brandQ }),
      apiClient.getTrend(),
      apiClient.getBrandDistribution(),
      apiClient.getBudgetSummary({ year }),
      apiClient.getRecords({ month: m }),
      apiClient.getBrands(),
      apiClient.getBranches(),
    ])
    summary.value = sum
    ranking.value = rank
    trend.value = tr
    brandDist.value = bd
    budgetSummary.value = budget
    store.brands = brands
    store.branches = branches
    recordsCache.records = {}
    recs.forEach(r => {
      recordsCache.records[`${m}-${r.branchId}`] = { ...r, cost: Number(r.opening) + Number(r.purchases) + Number(r.transfers) - Number(r.closing) }
    })
  } catch (e) {
    showToast('فشل تحميل البيانات: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function toggleTheme() {
  isDark.value = !isDark.value
  setTheme(isDark.value ? 'dark' : 'light')
}

function printReport() {
  const brandName = brandFilter.value === 'all' ? '' : ' - ' + (store.brandById[brandFilter.value]?.name || '')
  capturePrint(document.querySelector('.report-print-area'), {
    title: `لوحة التحكم - ${monthLabel(month.value)}${brandName}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
  })
}

onMounted(loadAll)
</script>
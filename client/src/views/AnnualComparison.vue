<template>
  <div>
    <div class="topbar">
      <h1>📅 المقارنة السنوية</h1>
      <div class="actions">
        <div class="seg">
          <button type="button" class="seg-btn" :class="{ active: mode === 'same' }" @click="mode = 'same'">🗓️ نفس الشهر عبر السنوات</button>
          <button type="button" class="seg-btn" :class="{ active: mode === 'full' }" @click="mode = 'full'">📊 سنوات كاملة</button>
        </div>
        <input v-if="mode === 'same'" type="month" class="input" style="width:170px;" v-model="refMonth" @change="loadYears" />
        <select class="input" style="width:170px;" v-model="detailYear" @change="loadDetail">
          <option v-for="y in availableYears" :key="y" :value="y">سنة {{ y }}</option>
        </select>
        <button class="btn btn-info" @click="exportExcel">⬇️ Excel</button>
        <button class="btn btn-primary" @click="printReport">🖨️ طباعة / PDF</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <div class="card">
        <div class="card-header"><h3>📊 مقارنة السنوات — {{ mode === 'same' ? 'شهر ' + monthLabel(refMonth) : 'سنوات كاملة' }}</h3></div>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>السنة</th><th>الإيرادات</th><th>التكلفة</th><th>مجمل الربح</th><th>المصروفات</th><th>صافي الربح</th><th>نمو الإيرادات</th><th>نمو الربح</th><th>الفروع</th></tr></thead>
            <tbody>
              <tr v-for="r in yearRows" :key="r.year">
                <td><strong>{{ r.year }}</strong></td>
                <td class="num-ltr">{{ fmt(r.sales) }}</td>
                <td class="num-ltr">{{ fmt(r.cost) }}</td>
                <td class="num-ltr">{{ fmt(r.grossProfit) }}</td>
                <td class="num-ltr">{{ fmt(r.expenses) }}</td>
                <td class="num-ltr" :style="{ color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(r.netProfit) }}</td>
                <td class="num-ltr" :style="growthStyle(r.salesGrowth)">{{ growthText(r.salesGrowth) }}</td>
                <td class="num-ltr" :style="growthStyle(r.profitGrowth)">{{ growthText(r.profitGrowth) }}</td>
                <td class="num-ltr">{{ r.branches }}</td>
              </tr>
              <tr v-if="!yearRows.length"><td colspan="9" class="empty-state"><div class="icon">📅</div><p>لا بيانات</p></td></tr>
            </tbody>
          </table>
        </div>
        <div class="charts-grid" style="margin-top:14px;">
          <ChartView title="📈 الإيرادات والتكلفة حسب السنة" type="bar"
            :labels="yearRows.map(r => String(r.year))"
            :datasets="[
              { label: 'الإيرادات', data: yearRows.map(r => r.sales), backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 5 },
              { label: 'التكلفة', data: yearRows.map(r => r.cost), backgroundColor: 'rgba(231,76,60,0.7)', borderRadius: 5 },
              { label: 'صافي الربح', data: yearRows.map(r => r.netProfit), backgroundColor: 'rgba(26,188,156,0.7)', borderRadius: 5 },
            ]"
            :options="{ plugins: { legend: { position: 'bottom' } } }"
          />
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>📅 التفصيل الشهري — سنة {{ detailYear }}</h3></div>
        <div class="charts-grid">
          <ChartView title="📈 الإيرادات والتكلفة والصافي شهرياً" type="line"
            :labels="detailMonths.map(m => m.label)"
            :datasets="[
              { label: 'الإيرادات', data: detailMonths.map(m => m.revenue), borderColor: '#27ae60', tension: 0.35 },
              { label: 'التكلفة', data: detailMonths.map(m => m.cogs), borderColor: '#e74c3c', tension: 0.35 },
              { label: 'صافي الربح', data: detailMonths.map(m => m.netProfit), borderColor: '#9b59b6', tension: 0.35 },
            ]"
          />
        </div>
        <div class="table-wrapper" style="margin-top:12px;">
          <table>
            <thead><tr><th>الشهر</th><th>الإيرادات</th><th>التكلفة</th><th>المصروفات</th><th>صافي الربح</th></tr></thead>
            <tbody>
              <tr v-for="m in detailMonths" :key="m.month">
                <td><strong>{{ m.label }}</strong></td>
                <td class="num-ltr">{{ fmt(m.revenue) }}</td>
                <td class="num-ltr">{{ fmt(m.cogs) }}</td>
                <td class="num-ltr">{{ fmt(m.expenses) }}</td>
                <td class="num-ltr" :style="{ color: m.netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }">{{ fmt(m.netProfit) }}</td>
              </tr>
              <tr v-if="!detailMonths.length"><td colspan="5" class="empty-state"><div class="icon">📅</div><p>لا بيانات لهذه السنة</p></td></tr>
            </tbody>
          </table>
        </div>
      </div>
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
import ChartView from '../components/ChartView.vue'

const mode = ref('same')
const refMonth = ref(currentMonth())
const detailYear = ref(Number(currentMonth().slice(0, 4)))
const loading = ref(false)
const yearData = ref(null)
const detailData = ref(null)

const fmt = (v) => formatNumber(v)

const yearRows = computed(() => {
  const rows = yearData.value?.rows || []
  const stats = yearData.value?.stats || []
  const statMap = {}
  for (const s of stats) statMap[s.year] = s
  return rows.map(r => ({ ...r, ...(statMap[r.year] || {}) }))
})
const availableYears = computed(() => {
  const years = (yearData.value?.rows || []).map(r => r.year)
  if (!years.includes(detailYear.value)) years.unshift(detailYear.value)
  return years.sort((a, b) => b - a)
})
const detailMonths = computed(() => (detailData.value?.months || []))

function growthText(v) {
  if (v === null || v === undefined) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}
function growthStyle(v) {
  if (v === null || v === undefined) return { color: '#888' }
  return { color: v >= 0 ? 'var(--success)' : 'var(--danger)' }
}

async function loadYears() {
  loading.value = true
  try {
    yearData.value = await apiClient.yearComparison({ month: refMonth.value, mode: mode.value === 'full' ? 'full' : 'same' })
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function loadDetail() {
  try {
    detailData.value = await apiClient.getPL({ year: detailYear.value })
  } catch (e) {
    showToast(e.message, 'error')
  }
}

function printReport() {
  const area = document.querySelector('.main .page')
  if (!area) return
  capturePrint(area, {
    title: `المقارنة السنوية — ${mode.value === 'same' ? 'شهر ' + monthLabel(refMonth.value) : 'سنوات كاملة'}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
    primaryColor: '#b8860b',
    landscape: true,
  })
}

function exportExcel() {
  const rows = []
  rows.push(['المقارنة السنوية', mode.value === 'same' ? 'شهر ' + monthLabel(refMonth.value) : 'سنوات كاملة'])
  rows.push(['السنة', 'الإيرادات', 'التكلفة', 'مجمل الربح', 'المصروفات', 'صافي الربح', 'نمو الإيرادات%', 'نمو الربح%', 'الفروع'])
  for (const r of yearRows.value) rows.push([r.year, r.sales, r.cost, r.grossProfit, r.expenses, r.netProfit, growthText(r.salesGrowth), growthText(r.profitGrowth), r.branches])
  rows.push([])
  rows.push(['التفصيل الشهري', 'سنة ' + detailYear.value])
  rows.push(['الشهر', 'الإيرادات', 'التكلفة', 'المصروفات', 'صافي الربح'])
  for (const m of detailMonths.value) rows.push([m.label, m.revenue, m.cogs, m.expenses, m.netProfit])
  const text = buildXls('المقارنة السنوية', '', ['البند', 'القيمة'], rows)
  downloadFile(text, `annual_comparison.xls`)
  showToast('✅ تم تصدير Excel', 'success')
}

watch(mode, loadYears)
watch(refMonth, loadYears)
watch(detailYear, loadDetail)

onMounted(async () => {
  await loadYears()
  await loadDetail()
})
</script>

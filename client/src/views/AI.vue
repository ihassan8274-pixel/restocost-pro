<template>
  <div>
    <div class="topbar">
      <h1>🤖 التحليل الذكي (AI محلي)</h1>
      <div class="actions">
        <button class="btn btn-primary" @click="printReport">🖨️ طباعة / PDF</button>
        <button class="btn btn-purple" @click="refreshAll" :disabled="loading"><span v-if="loading" class="spinner sm"></span>🔄 تحديث</button>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <div class="report-print-area">
      <div class="kpi-grid">
        <KpiCard icon="📈" label="تكلفة متوقعة للشهر القادم" :value="nextCost" color="var(--purple)" />
        <KpiCard icon="📉" label="نمو شهري متوقع" :value="deltaPct" :is-percent="true" color="var(--info)" />
        <KpiCard icon="🧾" label="مصروفات الشهر القادم" :value="nextExpense" color="var(--warning)" />
        <KpiCard icon="⚠️" label="شذوذات مكتشفة" :value="anomalies.total" color="var(--danger)" />
        <KpiCard icon="💡" label="توصيات" :value="recommendations.list.length" color="var(--teal)" />
      </div>

      <div class="charts-grid">
        <ChartView
          title="📈 توقع التكلفة (فعلي + متوسط متحرك + خطي)"
          type="line"
          :labels="forecastChartLabels"
          :datasets="[
            { label: 'فعلي', data: forecastChartActual, borderColor: '#2c3e50', tension: 0.3, fill: false, pointRadius: 4 },
            { label: 'متوسط متحرك (3)', data: forecastChartMA, borderColor: '#3498db', borderDash: [6, 4], tension: 0.3, fill: false, pointRadius: 3 },
            { label: 'توقع خطي', data: forecastChartPred, borderColor: '#9b59b6', borderDash: [2, 2], tension: 0, fill: false, pointRadius: 3 },
          ]"
        />
        <ChartView
          title="🧾 توقع المصروفات الشهرية"
          type="line"
          :labels="expenseChartLabels"
          :datasets="[
            { label: 'فعلي', data: expenseChartActual, borderColor: '#f39c12', tension: 0.3, fill: false, pointRadius: 4 },
            { label: 'توقع', data: expenseChartPred, borderColor: '#e67e22', borderDash: [5, 3], tension: 0, fill: false, pointRadius: 4 },
          ]"
        />
      </div>

      <div class="charts-grid mt-20">
        <div class="card">
          <div class="card-header"><h3>📈 توقع التكلفة ({{ forecast.viewMonths }} شهر قادمة)</h3></div>
          <div v-if="forecast.ready" class="rec-item" v-for="(f, i) in forecast.cards" :key="i">
            <span class="rec-icon">{{ f.icon }}</span>
            <div class="rec-body">
              <div class="rec-title">{{ f.title }}</div>
              <div class="rec-text">{{ f.text }}</div>
            </div>
          </div>
          <p v-else class="text-muted" style="padding: 20px;">📭 تحتاج شهرين أو أكثر من البيانات لإجراء التوقع</p>
        </div>

        <div class="card">
          <div class="card-header"><h3>🧾 توقع المصروفات الشهرية</h3></div>
          <div v-if="expenseForecast.ready" class="rec-item" v-for="(f, i) in expenseForecast.cards" :key="i">
            <span class="rec-icon">{{ f.icon }}</span>
            <div class="rec-body">
              <div class="rec-title">{{ f.title }}</div>
              <div class="rec-text">{{ f.text }}</div>
            </div>
          </div>
          <p v-else class="text-muted" style="padding: 20px;">📭 تحتاج شهرين أو أكثر من بيانات المصروفات لإجراء التوقع</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>⚠️ الشذوذات المالية - التكاليف</h3></div>
        <div v-if="anomalies.cost.length" class="rec-item" v-for="a in anomalies.cost" :key="a.branchId">
          <span class="rec-icon" style="background: rgba(231,76,60,.15); color: var(--danger)">🚨</span>
          <div class="rec-body">
            <div class="rec-title">{{ a.name }}</div>
            <div class="rec-text">تكلفة {{ formatMoney(a.cost) }} تتجاوز عتبة الانحراف {{ formatMoney(anomalies.threshold) }}</div>
            <div class="rec-text">متوسط الفروع: {{ formatMoney(anomalies.avg) }} · انحراف معياري: {{ formatMoney(anomalies.stdDev) }}</div>
          </div>
        </div>
        <p v-else class="text-muted" style="padding: 20px;">✅ لا توجد شذوذات تكلفة في بيانات هذا الشهر</p>
      </div>

      <div class="charts-grid mt-20">
        <div class="card">
          <div class="card-header"><h3>📝 شذوذات المصروفات حسب الفرع</h3></div>
          <div v-if="anomalies.expense.length" class="rec-item" v-for="a in anomalies.expense" :key="a.branchId">
            <span class="rec-icon" style="background: rgba(243,156,18,.15); color: var(--warning)">🧾</span>
            <div class="rec-body">
              <div class="rec-title">{{ a.name }}</div>
              <div class="rec-text">مصروفات {{ formatMoney(a.total) }} تتجاوز المتوسط {{ formatMoney(a.avg) }} بعتبة {{ formatMoney(anomalies.expThreshold) }}</div>
            </div>
          </div>
          <p v-else class="text-muted" style="padding: 20px;">✅ لا توجد شذوذات مصروفات حسب الفرع</p>
        </div>

        <div class="card">
          <div class="card-header"><h3>🏷️ شذوذات المصروفات حسب النوع</h3></div>
          <div v-if="anomalies.type.length" class="rec-item" v-for="(a, i) in anomalies.type" :key="i">
            <span class="rec-icon" style="background: rgba(155,89,182,.15); color: var(--purple)">⚠️</span>
            <div class="rec-body">
              <div class="rec-title">{{ a.name }} ({{ a.category }})</div>
              <div class="rec-text">إجمالي {{ formatMoney(a.total) }} مقابل متوسط الأنواع {{ formatMoney(a.avg) }}</div>
            </div>
          </div>
          <p v-else class="text-muted" style="padding: 20px;">✅ لا توجد أنواع مصروف شاذة</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>💡 التوصيات الذكية</h3></div>
        <div class="rec-item" v-for="(r, i) in recommendations.list" :key="i">
          <span class="rec-icon">{{ r.icon || '💡' }}</span>
          <div class="rec-body">
            <div class="rec-title">{{ r.title }}</div>
            <div class="rec-text">{{ r.description }}</div>
          </div>
          <span class="badge" :class="impactBadge(r.impact)">{{ impactLabel(r.impact) }}</span>
        </div>
        <p v-if="!recommendations.list.length" class="text-muted" style="padding: 20px;">لوّن بياناتك لتحصل على توصيات مخصصة</p>
      </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatMoney, formatNumber, monthLabel } from '../utils/format'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const loading = ref(true)
const rawForecast = ref(null)
const rawExpForecast = ref(null)
const rawAnomalies = ref(null)
const rawRecommendations = ref(null)

function nextMonthLabel(m) {
  if (!m) return ''
  const [y, mo] = m.split('-').map(Number)
  const nd = new Date(y + (mo === 12 ? 1 : 0), mo === 12 ? 0 : mo, 1)
  return monthLabel(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`)
}

const forecast = computed(() => {
  const f = rawForecast.value
  if (!f || !Array.isArray(f.forecast) || !f.forecast.length) return { ready: false, viewMonths: 0, cards: [] }
  const nextCost = f.forecast[0]
  const lastMonth = f.months[f.months.length - 1]
  const slope = Number(f.slope || 0)
  const deltaPct = nextCost > 0 ? (Math.abs(slope) / nextCost) * 100 : 0
  const maNext = Array.isArray(f.maForecast) && f.maForecast.length ? f.maForecast[0] : nextCost
  const actuals = Array.isArray(f.actual) ? f.actual : []
  const lastActual = actuals.length ? actuals[actuals.length - 1] : 0
  const maSmoother = lastActual > 0 ? (((maNext - lastActual) / lastActual) * 100).toFixed(1) : '0.0'
  return {
    ready: true,
    viewMonths: f.forecast.length,
    nextCost,
    deltaPct,
    cards: [
      { icon: '📈', title: 'توقع الشهر القادم', text: `${nextMonthLabel(lastMonth)} متوقع بقيمة ${formatMoney(nextCost)}` },
      { icon: '📉', title: 'نسبة النمو الشهرية', text: `${deltaPct.toFixed(2)}% بناءً على معادلة الانحدار الخطي` },
      { icon: '🧮', title: 'المتوسط المتحرك (3 أشهر)', text: `${formatMoney(maNext)} بانحدار ${maSmoother}% عن آخر شهر` },
      { icon: '🧠', title: 'معادلة الاتجاه', text: `y = ${formatNumber(slope)}x ${Number(f.intercept) >= 0 ? '+' : '-'} ${formatNumber(Math.abs(Number(f.intercept)))}` },
      { icon: '🔭', title: 'الأفق الزمني', text: `البيانات المتوفرة: ${f.months.map(m => monthLabel(`${m}-01`)).join(' ← ')}` },
    ],
  }
})

const nextCost = computed(() => forecast.value.nextCost || 0)
const deltaPct = computed(() => forecast.value.deltaPct || 0)

const expenseForecast = computed(() => {
  const f = rawExpForecast.value
  if (!f || !Array.isArray(f.forecast) || !f.forecast.length) return { ready: false, cards: [] }
  const m = f.months[f.months.length - 1]
  return {
    ready: true,
    nextExpense: f.forecast[0],
    cards: [
      { icon: '🧾', title: 'مصروفات الشهر القادم', text: `${nextMonthLabel(m)} متوقعة بقيمة ${formatMoney(f.forecast[0])}` },
      { icon: '📜', title: 'البيانات المتوفرة', text: `${f.months.map(x => monthLabel(`${x}-01`)).join(' ← ')}` },
    ],
  }
})

const nextExpense = computed(() => expenseForecast.value.nextExpense || 0)

const forecastChartLabels = computed(() => {
  const f = rawForecast.value
  if (!f || !Array.isArray(f.months)) return []
  const from = f.months.length ? f.months[f.months.length - 1] : ''
  const labels = f.months.map(m => monthLabel(`${m}-01`).split(' ')[0])
  for (let i = 1; i <= (f.forecast ? f.forecast.length : 0); i++) {
    const nd = new Date(`${from}-01`)
    nd.setMonth(nd.getMonth() + i)
    labels.push(`${monthLabel(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`).split(' ')[0]}*`)
  }
  return labels
})
const forecastChartActual = computed(() => {
  const f = rawForecast.value
  if (!f || !Array.isArray(f.actual)) return []
  return f.actual.concat(Array(f.forecast ? f.forecast.length : 0).fill(null))
})
const forecastChartMA = computed(() => {
  const f = rawForecast.value
  if (!f || !Array.isArray(f.maForecast)) return []
  return f.maForecast.concat(Array(f.forecast ? f.forecast.length : 0).fill(null))
})
const forecastChartPred = computed(() => {
  const f = rawForecast.value
  if (!f || !Array.isArray(f.forecast)) return []
  return Array(f.actual ? f.actual.length : 0).fill(null).concat(f.forecast)
})

const expenseChartLabels = computed(() => {
  const f = rawExpForecast.value
  if (!f || !Array.isArray(f.months)) return []
  const from = f.months.length ? f.months[f.months.length - 1] : ''
  const labels = f.months.map(m => monthLabel(`${m}-01`).split(' ')[0])
  for (let i = 1; i <= (f.forecast ? f.forecast.length : 0); i++) {
    const nd = new Date(`${from}-01`)
    nd.setMonth(nd.getMonth() + i)
    labels.push(`${monthLabel(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`).split(' ')[0]}*`)
  }
  return labels
})
const expenseChartActual = computed(() => {
  const f = rawExpForecast.value
  if (!f || !Array.isArray(f.actual)) return []
  return f.actual.concat(Array(f.forecast ? f.forecast.length : 0).fill(null))
})
const expenseChartPred = computed(() => {
  const f = rawExpForecast.value
  if (!f || !Array.isArray(f.forecast)) return []
  return Array(f.actual ? f.actual.length : 0).fill(null).concat(f.forecast)
})

const anomalies = computed(() => {
  const a = rawAnomalies.value
  if (!a) return { cost: [], expense: [], type: [], total: 0, avg: 0, stdDev: 0, threshold: 0, expThreshold: 0 }
  const cost = a.anomalies || []
  const expense = a.expenseAnomalies || []
  const type = a.typeAnomalies || []
  return {
    cost, expense, type,
    total: cost.length + expense.length + type.length,
    avg: Number(a.avg || 0), stdDev: Number(a.stdDev || 0), threshold: Number(a.threshold || 0),
    expThreshold: Number(a.expThreshold || 0),
  }
})

const recommendations = computed(() => {
  const list = (rawRecommendations.value?.recommendations || []).map(r => ({
    title: r.title,
    description: r.description,
    impact: r.impact,
    icon: r.title.includes('🔴') ? '🔴' : r.title.includes('📉') ? '📉' : r.title.includes('📊') ? '📊' : r.title.includes('💰') ? '💰' : r.title.includes('🔮') ? '🔮' : '💡',
  }))
  return { list }
})

const impactMap = { high: ['badge-danger', 'أولوية عالية'], medium: ['badge-warning', 'أولوية متوسطة'], low: ['badge-info', 'أولوية منخفضة'] }
function impactBadge(impact) { return (impactMap[impact] || impactMap.low)[0] }
function impactLabel(impact) { return (impactMap[impact] || impactMap.low)[1] }

async function loadAll() {
  loading.value = true
  try {
    const [fc, expf, an, rec] = await Promise.all([
      apiClient.forecast(),
      apiClient.expenseForecast(),
      apiClient.anomalies({ limit: 5 }),
      apiClient.recommendations(),
    ])
    rawForecast.value = fc
    rawExpForecast.value = expf
    rawAnomalies.value = an
    rawRecommendations.value = rec
  } catch (e) {
    showToast('فشل تحليل البيانات: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

function refreshAll() { loadAll() }

function printReport() {
  capturePrint(document.querySelector('.report-print-area'), {
    title: 'التقرير الذكي والتحليلات',
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
  })
}

onMounted(loadAll)
</script>
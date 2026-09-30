<template>
  <div>
    <div class="topbar">
      <h1>📉 تحليل التكاليف</h1>
      <div class="actions">
        <select class="input" style="width:170px;" v-model="brandFilter" @change="loadAll">
          <option value="all">🌐 كل العلامات</option>
          <option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <button class="btn btn-gold" @click="printReport">🖨️ طباعة</button>
        <input type="month" class="input" style="width:180px;" v-model="month" @change="loadAll" />
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else>
      <div class="report-print-area">
      <div class="kpi-grid">
        <KpiCard icon="📦" label="تكلفة المبيعات" :value="totalCost" color="var(--danger)" />
        <KpiCard icon="💰" label="الإيرادات" :value="totalSales" color="var(--success)" />
        <KpiCard icon="📊" label="نسبة التكلفة" :value="costRatio" :is-percent="true" color="var(--gold)" />
        <KpiCard icon="🔥" label="أعلى فرع تكلفة" :value="topBranch?.name || '—'" color="var(--warning)" />
        <KpiCard icon="✅" label="أقل فرع تكلفة" :value="lowBranch?.name || '—'" color="var(--teal)" />
      </div>

      <div class="charts-grid">
        <ChartView
          title="📊 تكلفة المبيعات حسب الفرع"
          :labels="costLabels"
          :datasets="[{ label: 'تكلفة المبيعات', data: costValues, backgroundColor: 'rgba(231,76,60,0.75)', borderRadius: 6 }]"
        />
        <ChartView
          title="💹 الإيرادات حسب الفرع"
          :labels="salesLabels"
          :datasets="[{ label: 'الإيرادات', data: salesValues, backgroundColor: 'rgba(46,204,113,0.75)', borderRadius: 6 }]"
        />
      </div>

      <div class="charts-grid mt-20">
        <ChartView
          title="📊 نسبة التكلفة % حسب الفرع"
          type="line"
          :labels="ratioLabels"
          :datasets="[{ label: 'نسبة التكلفة %', data: ratioValues, borderColor: '#f39c12', backgroundColor: 'rgba(243,156,18,0.15)', fill: true, tension: 0.4, pointRadius: 5 }]"
        />
        <ChartView
          title="🥧 توزيع التكلفة حسب العلامة"
          type="doughnut"
          :labels="brandLabels"
          :datasets="[{ data: brandValues, backgroundColor: ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e','#e91e63','#8bc34a'], borderColor: 'white', borderWidth: 2 }]"
          :options="{ cutout: '55%', plugins: { legend: { position: 'right' } } }"
        />
      </div>

      <div class="card">
        <div class="card-header"><h3>🏆 تحليل كل فرع ({{ monthLabel(month) }})</h3></div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>#</th><th>الفرع</th><th>الإيرادات</th><th>التكلفة</th><th>نسبة التكلفة</th><th>هامش الربح</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              <tr v-for="(b, i) in branchAnalysis" :key="b.id">
                <td>{{ i + 1 }}</td>
                <td><strong>{{ b.name }}</strong></td>
                <td class="num-ltr">{{ formatMoney(b.sales) }}</td>
                <td class="num-ltr">{{ formatMoney(b.cost) }}</td>
                <td class="num-ltr"><span class="pill" :style="{ background: ratioBg(b.ratio), color: ratioFg(b.ratio) }">{{ b.ratio.toFixed(2) }}%</span></td>
                <td class="num-ltr">{{ formatMoney(b.sales - b.cost) }}</td>
                <td><span class="badge" :class="b.ratio <= 50 ? 'badge-success' : b.ratio <= 70 ? 'badge-warning' : 'badge-danger'">{{ b.ratio <= 50 ? 'ممتاز' : b.ratio <= 70 ? 'متوسط' : 'مرتفع' }}</span></td>
              </tr>
              <tr v-if="!branchAnalysis.length"><td colspan="7" class="empty-state"><div class="icon">📉</div><p>لا توجد بيانات</p></td></tr>
            </tbody>
          </table>
        </div>
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
import { formatMoney, currentMonth, monthLabel, calculateCost, calculateRatio } from '../utils/format'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const month = ref(currentMonth())
const brandFilter = ref('all')
const loading = ref(true)
const records = ref([])

const totalCost = computed(() => records.value.reduce((s, r) => s + costOf(r), 0))
const totalSales = computed(() => records.value.reduce((s, r) => s + Number(r.sales || 0), 0))
const costRatio = computed(() => totalSales.value > 0 ? (totalCost.value / totalSales.value) * 100 : 0)

const branchAnalysis = computed(() => {
  const branches = brandFilter.value === 'all' ? store.branches : store.branches.filter(b => b.brandId === Number(brandFilter.value))
  return branches.map(b => {
    const r = records.value.find(x => x.branchId === b.id) || { sales: 0, opening: 0, purchases: 0, transfers: 0, closing: 0 }
    const cost = costOf(r)
    const sales = Number(r.sales || 0)
    const ratio = calculateRatio(cost, sales)
    return { ...b, cost, sales, ratio }
  }).sort((a, b) => b.cost - a.cost)
})

const topBranch = computed(() => branchAnalysis.value[0])
const lowBranch = computed(() => branchAnalysis.value[branchAnalysis.value.length - 1])

const costLabels = computed(() => branchAnalysis.value.map(b => b.name))
const costValues = computed(() => branchAnalysis.value.map(b => b.cost))
const salesLabels = computed(() => branchAnalysis.value.map(b => b.name))
const salesValues = computed(() => branchAnalysis.value.map(b => b.sales))
const ratioLabels = computed(() => branchAnalysis.value.map(b => b.name))
const ratioValues = computed(() => branchAnalysis.value.map(b => +b.ratio.toFixed(2)))

const brandLabels = computed(() => store.brands.map(b => b.name))
const brandValues = computed(() => {
  return store.brands.map(brand => {
    const ids = store.branches.filter(b => b.brandId === brand.id).map(b => b.id)
    return records.value.filter(r => ids.includes(r.branchId)).reduce((s, r) => s + costOf(r), 0)
  })
})

function costOf(r) {
  return calculateCost(r)
}
function ratioBg(ratio) {
  return ratio <= 50 ? 'rgba(46,204,113,0.15)' : ratio <= 70 ? 'rgba(243,156,18,0.15)' : 'rgba(231,76,60,0.15)'
}
function ratioFg(ratio) {
  return ratio <= 50 ? 'var(--success)' : ratio <= 70 ? 'var(--warning)' : 'var(--danger)'
}

async function loadAll() {
  loading.value = true
  try {
    const brandQ = brandFilter.value === 'all' ? undefined : brandFilter.value
    const [recs, branches, brands] = await Promise.all([
      apiClient.getRecords({ month: month.value, brandId: brandQ }),
      apiClient.getBranches(),
      apiClient.getBrands(),
    ])
    records.value = recs
    store.branches = branches
    store.brands = brands
  } catch (e) {
    showToast(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function printReport() {
  const brandName = brandFilter.value === 'all' ? '' : ' - ' + (store.brandById[brandFilter.value]?.name || '')
  capturePrint(document.querySelector('.report-print-area'), {
    title: `تحليل التكاليف - ${monthLabel(month.value)}${brandName}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
  })
}

onMounted(loadAll)
</script>
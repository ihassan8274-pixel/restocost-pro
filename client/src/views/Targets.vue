<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h3>🎯 أهداف الأداء (KPI)</h3>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <label>الشهر <input v-model="month" type="month" class="input" @change="load" /></label>
          <button class="btn btn-primary" :disabled="busy || !store.canEdit" @click="save">{{ busy ? 'جارِ الحفظ...' : 'حفظ الأهداف' }}</button>
          <button class="btn btn-outline" @click="fillSuggested">تعبئة من بيانات شهر سابق</button>
        </div>
      </div>

      <p class="muted-note">حدد أهدافاً لكل فرع: المبيعات، المصروفات، صافي الربح، ونسبة التكلفة إلى المبيعات (٪).</p>

      <div class="kpi-grid mini">
        <div class="stat"><span class="stat-icon">🏆</span><div><b>{{ withTarget }}</b><span>هدف مضبوط</span></div></div>
        <div class="stat"><span class="stat-icon">📈</span><div><b>{{ totalSalesTarget }}</b><span>إجمالي هدف المبيعات</span></div></div>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>المبيعات</th>
              <th>المصروفات</th>
              <th>صافي الربح</th>
              <th>نسبة التكلفة ٪</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix" :key="row.branchId">
              <td>{{ row.name }}</td>
              <td><input v-model="row.sales" type="number" class="input num-ltr" :disabled="!store.canEdit" /></td>
              <td><input v-model="row.expenses" type="number" class="input num-ltr" :disabled="!store.canEdit" /></td>
              <td><input v-model="row.profit" type="number" class="input num-ltr" :disabled="!store.canEdit" /></td>
              <td><input v-model="row.costRatio" type="number" step="0.1" class="input num-ltr" :disabled="!store.canEdit" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { store } from '../store'
import { showToast as toast } from '../store/toast'

const month = ref(new Date().toISOString().slice(0, 7))
const matrix = ref([])
const busy = ref(false)

const METRICS = ['sales', 'expenses', 'profit', 'costRatio']

onMounted(async () => {
  if (!store.branches.length) await import('../store').then(m => m.loadStaticData())
  await load()
})

async function load() {
  const targets = await apiClient.getKpiTargets(month.value)
  const byBranch = {}
  for (const t of targets) {
    byBranch[t.branchId] = byBranch[t.branchId] || {}
    byBranch[t.branchId][t.metric] = Number(t.target)
  }
  matrix.value = store.branches.map(b => ({
    branchId: b.id, name: b.name,
    sales: byBranch[b.id]?.sales ?? '', expenses: byBranch[b.id]?.expenses ?? '',
    profit: byBranch[b.id]?.profit ?? '', costRatio: byBranch[b.id]?.costRatio ?? '',
  }))
}

const withTarget = computed(() => matrix.value.filter(r => METRICS.some(m => r[m] !== '')).length)
const totalSalesTarget = computed(() => matrix.value.reduce((s, r) => s + (Number(r.sales) || 0), 0))

async function fillSuggested() {
  const prev = new Date(month.value + '-01')
  prev.setMonth(prev.getMonth() - 1)
  const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  try {
    const recs = await apiClient.getRecords(prevStr)
    const summary = await apiClient.getSummary({ month: prevStr })
    const expenses = await apiClient.getExpenses({ month: prevStr })
    const branchMap = {}
    for (const r of recs) {
      const cost = (r.opening || 0) + (r.purchases || 0) + (r.transfers || 0) - (r.closing || 0)
      const rec = { sales: r.sales || 0, cost, profit: (r.sales || 0) - cost }
      branchMap[r.branchId] = rec
    }
    for (const e of expenses) {
      if (branchMap[e.branchId]) branchMap[e.branchId].expenses = (branchMap[e.branchId].expenses || 0) + e.amount
    }
    void summary
    for (const row of matrix.value) {
      const rec = branchMap[row.branchId]
      if (!rec) continue
      row.sales = Math.round(rec.sales)
      row.expenses = Math.round(rec.expenses || 0)
      row.profit = Math.round(rec.profit)
      row.costRatio = rec.sales > 0 ? Number(((rec.cost / rec.sales) * 100).toFixed(1)) : 0
    }
    toast('تمت التعبئة من شهر ' + prevStr, 'info')
  } catch (e) {
    toast('تعذر قراءة بيانات الشهر السابق: ' + e.message, 'error')
  }
}

async function save() {
  busy.value = true
  try {
    const targets = []
    for (const row of matrix.value) {
      for (const metric of METRICS) {
        const val = row[metric]
        targets.push({ branchId: row.branchId, metric, target: val === '' ? 0 : Number(val), present: val !== '' })
      }
    }
    await apiClient.saveKpiTargets(month.value, targets)
    toast('تم حفظ أهداف الشهر', 'success')
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    busy.value = false
  }
}
</script>
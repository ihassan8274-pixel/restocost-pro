<template>
  <div>
    <div class="topbar">
      <h1>📋 إدارة الميزانيات</h1>
      <div class="actions">
        <button class="btn btn-gold" @click="printReport">🖨️ طباعة</button>
        <button class="btn btn-primary" @click="openBudgetForm()">➕ إضافة ميزانية</button>
      </div>
    </div>

    <div class="card report-print-area">
      <div class="form-grid">
        <div class="form-group">
          <label>📅 السنة</label>
          <select class="input" v-model="year" @change="loadBudgets">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>🏪 الفرع</label>
          <select class="input" v-model="branchFilter" @change="loadBudgets">
            <option value="all">جميع الفروع</option>
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>📊 النوع</label>
          <select class="input" v-model="typeFilter" @change="loadBudgets">
            <option value="all">جميع الأنواع</option>
            <option value="revenue">الإيرادات</option><option value="cost">التكاليف</option>
            <option value="expense">المصروفات</option><option value="profit">الأرباح</option>
          </select>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-card" style="border-top-color: var(--info);">
          <div class="label">💰 المخطط</div>
          <div class="value num-ltr">{{ formatMoney(totalPlanned) }}</div>
        </div>
        <div class="kpi-card" style="border-top-color: var(--success);">
          <div class="label">📊 الفعلي</div>
          <div class="value num-ltr">{{ formatMoney(totalActual) }}</div>
        </div>
        <div class="kpi-card" style="border-top-color: var(--gold);">
          <div class="label">📈 نسبة التنفيذ</div>
          <div class="value num-ltr">{{ totalExec.toFixed(2) }}%</div>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>#</th><th>الفرع</th><th>النوع</th><th>الشهر</th><th>المخطط</th><th>الفعلي</th><th>الانحراف</th><th>نسبة التنفيذ</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            <tr v-for="(b, i) in budgets" :key="b.id">
              <td>{{ i + 1 }}</td>
              <td><strong>{{ b.branchName }}</strong></td>
              <td>{{ typeLabel(b.type) }}</td>
              <td>{{ monthLabel(b.month) }}</td>
              <td class="num-ltr">{{ formatNumber(b.planned) }}</td>
              <td class="num-ltr">{{ formatNumber(b.actual) }}</td>
              <td class="num-ltr" :style="{ color: Number(b.actual) >= Number(b.planned) ? 'var(--success)' : 'var(--danger)' }">{{ formatNumber(Number(b.actual) - Number(b.planned)) }}</td>
              <td class="num-ltr">{{ execPct(b).toFixed(2) }}%</td>
              <td><span class="badge" :class="statusBadge(b)">{{ statusLabel(b) }}</span></td>
              <td>
                <button class="btn btn-sm btn-primary" @click="openBudgetForm(b)">✏️</button>
                <button class="btn btn-sm btn-danger" @click="removeBudget(b.id)">🗑️</button>
              </td>
            </tr>
            <tr v-if="!budgets.length"><td colspan="10" class="empty-state"><div class="icon">📋</div><p>لا توجد ميزانيات</p></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="budgetModal" class="modal-overlay" @click.self="budgetModal = null">
      <div class="modal">
        <h3>{{ budgetForm.id ? '✏️ تعديل ميزانية' : '➕ إضافة ميزانية' }}</h3>
        <div class="form-group">
          <label>🏪 الفرع</label>
          <select class="input" v-model.number="budgetForm.branchId">
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>📊 النوع</label>
          <select class="input" v-model="budgetForm.type">
            <option value="revenue">الإيرادات</option><option value="cost">التكاليف</option>
            <option value="expense">المصروفات</option><option value="profit">الأرباح</option>
          </select>
        </div>
        <div class="form-group"><label>📅 الشهر</label><input type="month" class="input" v-model="budgetForm.month" /></div>
        <div class="form-grid">
          <div class="form-group"><label>المخطط</label><input type="number" class="input" v-model.number="budgetForm.planned" step="0.01" /></div>
          <div class="form-group"><label>الفعلي</label><input type="number" class="input" v-model.number="budgetForm.actual" step="0.01" /></div>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" @click="saveBudget">💾 حفظ</button>
          <button class="btn btn-outline" @click="budgetModal = null">إلغاء</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatNumber, formatMoney, monthLabel } from '../utils/format'
import { capturePrint } from '../utils/print'

const year = ref(String(new Date().getFullYear()))
const branchFilter = ref('all')
const typeFilter = ref('all')
const budgets = ref([])
const budgetModal = ref(null)
const budgetForm = ref({})

const years = computed(() => {
  const cur = Number(year.value)
  return [cur - 1, cur, cur + 1]
})

async function loadBudgets() {
  const params = { year: year.value }
  if (branchFilter.value !== 'all') params.branchId = branchFilter.value
  if (typeFilter.value !== 'all') params.type = typeFilter.value
  budgets.value = await apiClient.getBudgets(params)
}

const totalPlanned = computed(() => budgets.value.reduce((s, b) => s + Number(b.planned || 0), 0))
const totalActual = computed(() => budgets.value.reduce((s, b) => s + Number(b.actual || 0), 0))
const totalExec = computed(() => totalPlanned.value > 0 ? (totalActual.value / totalPlanned.value) * 100 : 0)

function printReport() {
  capturePrint(document.querySelector('.report-print-area'), {
    title: `الميزانيات - السنة ${year.value}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
  })
}

function execPct(b) {
  return Number(b.planned) > 0 ? (Number(b.actual) / Number(b.planned)) * 100 : 0
}
function statusLabel(b) {
  const p = execPct(b)
  return p >= 100 ? '✅ منجز' : p >= 80 ? '⚠️ قيد التنفيذ' : '🔴 متأخر'
}
function statusBadge(b) {
  const p = execPct(b)
  return p >= 100 ? 'badge-success' : p >= 80 ? 'badge-warning' : 'badge-danger'
}
function typeLabel(t) {
  return { revenue: 'الإيرادات', cost: 'التكاليف', expense: 'المصروفات', profit: 'الأرباح' }[t] || t
}

function openBudgetForm(b) {
  if (b) budgetForm.value = { ...b }
  else budgetForm.value = { id: null, branchId: store.branches[0]?.id, type: 'revenue', month: `${year.value}-01`, planned: 0, actual: 0 }
  budgetModal.value = true
}

async function saveBudget() {
  if (!budgetForm.value.branchId || !budgetForm.value.month) return showToast('⚠️ أكمل البيانات', 'warning')
  try {
    if (budgetForm.value.id) await apiClient.updateBudget(budgetForm.value.id, budgetForm.value)
    else await apiClient.createBudget(budgetForm.value)
    showToast('✅ تم حفظ الميزانية', 'success')
    budgetModal.value = null
    await loadBudgets()
  } catch (e) { showToast(e.message, 'error') }
}

async function removeBudget(id) {
  if (!confirm('حذف هذه الميزانية؟')) return
  try {
    await apiClient.deleteBudget(id)
    budgets.value = budgets.value.filter(b => b.id !== id)
    showToast('🗑️ تم الحذف', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

onMounted(loadBudgets)
</script>
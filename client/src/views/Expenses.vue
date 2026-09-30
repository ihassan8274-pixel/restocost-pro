<template>
  <div>
    <div class="topbar">
      <h1>💰 إدارة المصروفات</h1>
      <div class="actions">
        <button class="btn btn-gold" @click="printReport">🖨️ طباعة</button>
        <button class="btn btn-info" @click="exportExcel">⬇️ تصدير Excel</button>
        <button class="btn btn-gold btn-sm" @click="downloadTemplate">📋 قالب استيراد</button>
        <button class="btn btn-primary" @click="openTypeForm()">📋 نوع مصروف</button>
        <button class="btn btn-success" @click="openExpenseForm()">➕ إضافة مصروف</button>
      </div>
    </div>

    <div class="card report-print-area">
      <div class="card-header"><h3>📊 مصروفات الفروع</h3></div>
      <div class="form-grid">
        <div class="form-group"><label>📅 الشهر</label><input type="month" class="input" v-model="month" @change="loadExpenses" /></div>
        <div class="form-group">
          <label>🏪 الفرع</label>
          <select class="input" v-model="branchFilter" @change="loadExpenses">
            <option value="all">🌐 جميع الفروع</option>
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>🏷️ النوع</label>
          <select class="input" v-model="typeFilter" @change="loadExpenses">
            <option value="all">🌐 كل الأنواع</option>
            <option v-for="t in store.expenseTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>📂 التصنيف</label>
          <select class="input" v-model="categoryFilter" @change="loadExpenses">
            <option value="all">🌐 كل التصنيفات</option>
            <option value="fixed">ثابت</option>
            <option value="variable">متغير</option>
            <option value="administrative">إداري</option>
            <option value="operational">تشغيلي</option>
            <option value="other">أخرى</option>
          </select>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>#</th><th>الفرع</th><th>النوع</th><th>التصنيف</th><th>المبلغ</th><th>الوصف</th><th>الشهر</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in expenses" :key="e.id">
              <td>{{ i + 1 }}</td>
              <td><strong>{{ e.branchName }}</strong></td>
              <td>{{ e.typeName }}</td>
              <td><span class="badge" :style="{ background: categoryColor(e.category) + '22', color: categoryColor(e.category) }">{{ categoryLabel(e.category) }}</span></td>
              <td class="num-ltr" style="font-weight:700;">{{ formatMoney(e.amount) }}</td>
              <td>{{ e.description || '-' }}</td>
              <td>{{ e.month }}</td>
              <td>
                <button class="btn btn-sm btn-primary" @click="openExpenseForm(e)">✏️</button>
                <button class="btn btn-sm btn-danger" @click="removeExpense(e.id)">🗑️</button>
              </td>
            </tr>
            <tr v-if="!expenses.length"><td colspan="8" class="empty-state"><div class="icon">💰</div><p>لا توجد مصروفات</p></td></tr>
          </tbody>
          <tfoot v-if="expenses.length">
            <tr class="total-row">
              <td colspan="4" style="text-align:right;"><strong>الإجمالي</strong></td>
              <td class="num-ltr"><strong>{{ formatMoney(totalExpenses) }}</strong></td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>📋 أنواع المصروفات</h3></div>
      <div class="flex wrap gap-10">
        <div v-for="t in store.expenseTypes" :key="t.id" class="flex" style="gap:8px; border:1px solid var(--border); border-radius:22px; padding:6px 14px; background:var(--bg);">
          <span :style="{ color: categoryColor(t.category), fontWeight: 800 }">●</span>
          <span style="font-weight:700;">{{ t.name }}</span>
          <span class="text-muted" style="font-size:11px;">{{ categoryLabel(t.category) }}</span>
          <button class="btn btn-sm btn-outline" @click="openTypeForm(t)">✏️</button>
          <button class="btn btn-sm btn-danger" @click="removeType(t.id)">🗑️</button>
        </div>
        <div v-if="!store.expenseTypes.length" class="text-muted">لا توجد أنواع</div>
      </div>
    </div>

    <!-- Expense form -->
    <div v-if="expenseModal" class="modal-overlay" @click.self="expenseModal = null">
      <div class="modal">
        <h3>{{ expenseForm.id ? '✏️ تعديل مصروف' : '➕ إضافة مصروف' }}</h3>
        <div class="form-group">
          <label>📅 الشهر</label>
          <input type="month" class="input" v-model="expenseForm.month" />
        </div>
        <div class="form-group">
          <label>🏪 الفرع</label>
          <select class="input" v-model.number="expenseForm.branchId">
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>🏷️ النوع</label>
          <select class="input" v-model.number="expenseForm.expenseTypeId">
            <option v-for="t in store.expenseTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="form-group"><label>المبلغ</label><input type="number" class="input" v-model.number="expenseForm.amount" step="0.01" /></div>
        <div class="form-group"><label>الوصف</label><input class="input" v-model="expenseForm.description" placeholder="وصف المصروف" /></div>
        <div class="btn-group">
          <button class="btn btn-primary" @click="saveExpense">💾 حفظ</button>
          <button class="btn btn-outline" @click="expenseModal = null">إلغاء</button>
        </div>
      </div>
    </div>

    <!-- Type form -->
    <div v-if="typeModal" class="modal-overlay" @click.self="typeModal = null">
      <div class="modal">
        <h3>{{ typeForm.id ? '✏️ تعديل نوع' : '➕ إضافة نوع' }}</h3>
        <div class="form-group"><label>اسم النوع</label><input class="input" v-model="typeForm.name" /></div>
        <div class="form-group">
          <label>التصنيف</label>
          <select class="input" v-model="typeForm.category">
            <option value="fixed">ثابت</option><option value="variable">متغير</option>
            <option value="administrative">إداري</option><option value="operational">تشغيلي</option><option value="other">أخرى</option>
          </select>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" @click="saveType">💾 حفظ</button>
          <button class="btn btn-outline" @click="typeModal = null">إلغاء</button>
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
import { formatMoney, currentMonth, monthLabel, categoryLabel, categoryColor } from '../utils/format'
import { capturePrint } from '../utils/print'
import { getExpensesTemplate, buildXls, downloadFile } from '../utils/excel'

const month = ref(currentMonth())
const branchFilter = ref('all')
const typeFilter = ref('all')
const categoryFilter = ref('all')
const expenses = ref([])
const expenseModal = ref(null)
const typeModal = ref(null)
const expenseForm = ref({})
const typeForm = ref({})

async function loadExpenses() {
  const params = { month: month.value }
  if (branchFilter.value !== 'all') params.branchId = branchFilter.value
  if (typeFilter.value !== 'all') params.typeId = typeFilter.value
  if (categoryFilter.value !== 'all') params.category = categoryFilter.value
  expenses.value = await apiClient.getExpenses(params)
}

const totalExpenses = computed(() => expenses.value.reduce((s, e) => s + Number(e.amount || 0), 0))

function printReport() {
  capturePrint(document.querySelector('.report-print-area'), {
    title: `المصروفات - ${monthLabel(month.value)}`,
    company: store.companyName,
    logo: store.companyLogo,
    subtitle: store.companySlogan,
  })
}

function exportExcel() {
  const headers = ['الشهر', 'الفرع', 'العلامة', 'نوع المصروف', 'التصنيف', 'المبلغ', 'الوصف']
  const rows = expenses.value.map(e => [e.month, e.branchName, e.brandName || '-', e.typeName, categoryLabel(e.category), e.amount, e.description || ''])
  const text = buildXls('المصروفات', '', headers, rows)
  downloadFile(text, `expenses_${month.value}.xls`)
  showToast('✅ تم تصدير Excel', 'success')
}

function openExpenseForm(e) {
  if (e) {
    expenseForm.value = { ...e }
  } else {
    expenseForm.value = { id: null, month: month.value, branchId: store.branches[0]?.id, expenseTypeId: store.expenseTypes[0]?.id, amount: 0, description: '' }
  }
  expenseModal.value = true
}

function openTypeForm(t) {
  typeForm.value = t ? { ...t } : { id: null, name: '', category: 'fixed' }
  typeModal.value = true
}

function downloadTemplate() {
  const t = getExpensesTemplate()
  const text = buildXls(t.sheet, '', t.headers, t.rows)
  downloadFile(text, t.filename)
}

async function saveExpense() {
  if (!expenseForm.value.branchId || !expenseForm.value.expenseTypeId) return showToast('⚠️ اختر الفرع والنوع', 'warning')
  try {
    if (expenseForm.value.id) await apiClient.updateExpense(expenseForm.value.id, expenseForm.value)
    else await apiClient.createExpense(expenseForm.value)
    showToast('✅ تم حفظ المصروف', 'success')
    expenseModal.value = null
    await loadExpenses()
  } catch (e) { showToast(e.message, 'error') }
}

async function removeExpense(id) {
  if (!confirm('حذف هذا المصروف؟')) return
  try {
    await apiClient.deleteExpense(id)
    expenses.value = expenses.value.filter(e => e.id !== id)
    showToast('🗑️ تم الحذف', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

async function saveType() {
  if (!typeForm.value.name) return showToast('⚠️ الاسم مطلوب', 'warning')
  try {
    if (typeForm.value.id) await apiClient.updateExpenseType(typeForm.value.id, typeForm.value)
    else await apiClient.createExpenseType(typeForm.value)
    showToast('✅ تم الحفظ', 'success')
    typeModal.value = null
    store.expenseTypes = await apiClient.getExpenseTypes()
  } catch (e) { showToast(e.message, 'error') }
}

async function removeType(id) {
  if (!confirm('حذف هذا النوع؟')) return
  try {
    await apiClient.deleteExpenseType(id)
    store.expenseTypes = store.expenseTypes.filter(t => t.id !== id)
    showToast('🗑️ تم الحذف', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

onMounted(async () => {
  store.expenseTypes = await apiClient.getExpenseTypes()
  await loadExpenses()
})
</script>
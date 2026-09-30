<template>
  <div>
    <div class="topbar">
      <h1>📝 إدخال المصروفات الشهرية</h1>
      <div class="actions">
        <button class="btn btn-success" @click="saveAll" :disabled="saving">💾 حفظ الكل</button>
        <button class="btn btn-info" @click="copyPrev">📋 نسخ من الشهر السابق</button>
      </div>
    </div>

    <div class="card" style="background: var(--gold-light); border: 2px solid var(--gold);">
      <div class="form-grid">
        <div class="form-group">
          <label>📅 الشهر</label>
          <input type="month" class="input" v-model="month" @change="loadData" />
        </div>
        <div class="form-group">
          <label>🏪 الفرع</label>
          <select class="input" v-model="branchId" @change="loadData">
            <option value="">اختر الفرع</option>
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>🏷️ العلامة</label>
          <select class="input" v-model="brandFilter" @change="loadData">
            <option value="all">🌐 جميع العلامات</option>
            <option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
      </div>

      <div v-if="branchId" class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>نوع المصروف</th>
              <th>التصنيف</th>
              <th>المبلغ</th>
              <th>الوصف</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(type, i) in expenseTypes" :key="type.id">
              <td>{{ i + 1 }}</td>
              <td><strong>{{ type.name }}</strong></td>
              <td>
                <span class="badge" :style="{ background: categoryColor(type.category) + '22', color: categoryColor(type.category) }">
                  {{ categoryLabel(type.category) }}
                </span>
              </td>
              <td>
                <input type="number" class="input num-ltr" style="min-width: 120px;" v-model.number="edits[type.id].amount" step="0.01" placeholder="0" />
              </td>
              <td>
                <input class="input" style="min-width: 200px;" v-model="edits[type.id].description" placeholder="وصف المصروف" />
              </td>
            </tr>
            <tr v-if="!expenseTypes.length">
              <td colspan="5" class="empty-state"><div class="icon">📋</div><p>لا توجد أنواع مصروفات معرفة</p></td>
            </tr>
          </tbody>
          <tfoot v-if="expenseTypes.length">
            <tr class="total-row">
              <td colspan="2" style="text-align:right;"><strong>الإجمالي</strong></td>
              <td></td>
              <td class="num-ltr"><strong>{{ formatMoney(totalAmount) }}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-else class="empty-state" style="padding: 40px; text-align: center;">
        <p>اختر الفرع والشهر لعرض بنود المصروفات</p>
      </div>
    </div>

    <div v-if="savedToast" class="toast-success" style="position: fixed; top: 20px; right: 20px; z-index: 9999; animation: slideIn 0.3s;">
      ✅ {{ savedToast }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatMoney, currentMonth, previousMonth, categoryLabel, categoryColor } from '../utils/format'

const month = ref(currentMonth())
const branchId = ref('')
const brandFilter = ref('all')
const expenseTypes = ref([])
const edits = ref({})
const saving = ref(false)
const savedToast = ref(null)

async function loadData() {
  if (!branchId.value) return
  try {
    const [types, existing] = await Promise.all([
      apiClient.getExpenseTypes(),
      apiClient.getExpenses({ month: month.value, branchId: branchId.value })
    ])
    expenseTypes.value = types
    edits.value = {}
    for (const t of types) {
      const found = existing.find(e => e.expenseTypeId === t.id)
      edits.value[t.id] = {
        amount: found ? Number(found.amount) : 0,
        description: found?.description || '',
        existingId: found?.id || null
      }
    }
  } catch (e) {
    showToast('فشل التحميل: ' + e.message, 'error')
  }
}

const totalAmount = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.amount || 0), 0))

async function saveAll() {
  if (!branchId.value) return showToast('⚠️ اختر الفرع أولاً', 'warning')
  saving.value = true
  try {
    for (const t of expenseTypes.value) {
      const data = edits.value[t.id] || { amount: 0, description: '' }
      if (data.amount > 0 || data.description) {
        const payload = {
          month: month.value,
          branchId: Number(branchId.value),
          expenseTypeId: t.id,
          amount: data.amount,
          description: data.description || ''
        }
        if (data.existingId) {
          await apiClient.updateExpense(data.existingId, payload)
        } else {
          await apiClient.createExpense(payload)
        }
      } else if (data.existingId) {
        await apiClient.deleteExpense(data.existingId)
      }
    }
    savedToast.value = 'تم حفظ المصروفات بنجاح'
    showToast('✅ تم حفظ المصروفات بنجاح', 'success')
    setTimeout(() => savedToast.value = null, 3000)
    await loadData()
  } catch (e) {
    showToast('فشل الحفظ: ' + e.message, 'error')
  } finally {
    saving.value = false
  }
}

async function copyPrev() {
  if (!branchId.value) return showToast('⚠️ اختر الفرع أولاً', 'warning')
  try {
    const prev = previousMonth(month.value)
    const prevExpenses = await apiClient.getExpenses({ month: prev, branchId: branchId.value })
    if (!prevExpenses.length) return showToast('لا توجد بيانات للشهر السابق', 'warning')
    for (const t of expenseTypes.value) {
      const found = prevExpenses.find(e => e.expenseTypeId === t.id)
      if (found) {
        edits.value[t.id] = {
          amount: Number(found.amount),
          description: found.description || '',
          existingId: edits.value[t.id]?.existingId || null
        }
      }
    }
    showToast('📋 تم نسخ بيانات الشهر السابق', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

onMounted(async () => {
  store.expenseTypes = await apiClient.getExpenseTypes()
  expenseTypes.value = store.expenseTypes
})

watch(() => brandFilter.value, async () => {
  if (brandFilter.value !== 'all') {
    const branches = store.branches.filter(b => b.brandId === brandFilter.value)
    branchId.value = branches[0]?.id || ''
  } else {
    branchId.value = ''
  }
})
</script>

<style scoped>
.toast-success {
  background: var(--success);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  font-weight: 600;
}
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
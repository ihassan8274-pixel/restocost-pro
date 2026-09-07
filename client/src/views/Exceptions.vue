<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h3>⚠️ الاستثناءات المالية</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" @click="generate(monthFilter)">🤖 اكتشاف تلقائي</button>
          <button class="btn btn-warning btn-sm" @click="openCreate">+ استثناء جديد</button>
        </div>
      </div>

      <div class="toolbar filters">
        <label>الشهر <input v-model="monthFilter" type="month" class="input" @change="load" /></label>
        <label>الحالة
          <select v-model="statusFilter" class="input" @change="load">
            <option value="">الكل</option>
            <option value="open">مفتوح</option>
            <option value="in_progress">قيد المتابعة</option>
            <option value="resolved">تمت المعالجة</option>
            <option value="closed">مغلق</option>
          </select>
        </label>
        <label>الأولوية
          <select v-model="severityFilter" class="input" @change="load">
            <option value="">الكل</option>
            <option value="high">عالية</option>
            <option value="medium">متوسطة</option>
            <option value="low">منخفضة</option>
          </select>
        </label>
        <button class="btn btn-outline btn-sm" @click="load">تحديث</button>
      </div>

      <div class="kpi-grid mini">
        <div class="stat"><span class="stat-icon">🟥</span><div><b>{{ counts.high }}</b><span>عالية</span></div></div>
        <div class="stat"><span class="stat-icon">🟧</span><div><b>{{ counts.open }}</b><span>مفتوحة</span></div></div>
        <div class="stat"><span class="stat-icon">🟩</span><div><b>{{ counts.resolved }}</b><span>معالجة</span></div></div>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr><th>الشهر</th><th>الفرع</th><th>الوصف</th><th>الأولوية</th><th>الحالة</th><th>المسؤول</th><th>التفاصيل</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="e in rows" :key="e.id">
              <td class="mono">{{ e.month }}</td>
              <td>{{ e.branch }}</td>
              <td>{{ e.title }}</td>
              <td><span class="badge" :class="sevClass(e.severity)">{{ sevLabel(e.severity) }}</span></td>
              <td><span class="badge" :class="statusClass(e.status)">{{ exStatusLabel(e.status) }}</span></td>
              <td>{{ e.assigned || '—' }}</td>
              <td class="audit-detail" style="max-width:180px">{{ detailText(e.details) }}</td>
              <td style="white-space:nowrap">
                <button v-if="store.canEdit" class="btn btn-outline btn-sm" @click="openEdit(e)">تحرير</button>
                <button v-if="store.isAdmin" class="btn btn-danger btn-sm" @click="remove(e)">حذف</button>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="8" class="empty-cell">لا استثناءات مطابقة</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ form.id ? 'تحديث استثناء' : 'استثناء مالي جديد' }}</h3>
        <form @submit.prevent="save">
          <div class="form-row">
            <label>الشهر<input v-model="form.month" type="month" class="input" required /></label>
            <label>الفرع
              <select v-model="form.branchId" class="input" required>
                <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
            </label>
          </div>
          <div class="form-row">
            <label>الأولوية
              <select v-model="form.severity" class="input">
                <option value="high">عالية</option>
                <option value="medium">متوسطة</option>
                <option value="low">منخفضة</option>
              </select>
            </label>
            <label>الحالة
              <select v-model="form.status" class="input">
                <option value="open">مفتوح</option>
                <option value="in_progress">قيد المتابعة</option>
                <option value="resolved">تمت المعالجة</option>
                <option value="closed">مغلق</option>
              </select>
            </label>
          </div>
          <label>الوصف<input v-model="form.title" type="text" class="input" required /></label>
          <label>تفاصيل / ملاحظات<textarea v-model="form.details" class="input" rows="2"></textarea></label>
          <div class="form-row">
            <label>المسؤول
              <select v-model="form.assignedUserId" class="input">
                <option value="">— غير معين —</option>
                <option v-for="u in users" :key="u.id" :value="u.id">{{ u.displayName }}</option>
              </select>
            </label>
            <label>تاريخ الاستحقاق<input v-model="form.dueDate" type="date" class="input" /></label>
          </div>
          <div class="btn-group">
            <button class="btn btn-primary" :disabled="busy">حفظ</button>
            <button type="button" class="btn btn-outline" @click="showModal = false">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { store } from '../store'
import { showToast as toast } from '../store/toast'

const rows = ref([])
const users = ref([])
const monthFilter = ref(new Date().toISOString().slice(0, 7))
const statusFilter = ref('')
const severityFilter = ref('')
const showModal = ref(false)
const busy = ref(false)
const form = ref(defaultForm())

function defaultForm() {
  return { id: null, month: new Date().toISOString().slice(0, 7), branchId: store.branches[0]?.id || '', severity: 'medium', status: 'open', title: '', details: '', assignedUserId: '', dueDate: '' }
}

const counts = computed(() => {
  const c = { high: 0, open: 0, resolved: 0 }
  for (const r of rows.value) {
    if (r.severity === 'high') c.high++
    if (r.status === 'open' || r.status === 'in_progress') c.open++
    if (r.status === 'resolved' || r.status === 'closed') c.resolved++
  }
  return c
})

onMounted(async () => {
  await load()
  if (store.isAdmin) { try { users.value = await apiClient.getUsers() } catch (_) {} }
})

async function load() {
  rows.value = await apiClient.getExceptions({ month: monthFilter.value, status: statusFilter.value, severity: severityFilter.value })
}

async function generate(month) {
  if (!month) return toast('اختر شهراً أولاً', 'warning')
  const res = await apiClient.generateExceptions(month)
  toast(`تم إنشاء ${res.created || 0} استثناء تلقائياً`, res.created ? 'success' : 'info')
  await load()
}

function openCreate() {
  form.value = defaultForm()
  showModal.value = true
}
function openEdit(e) {
  form.value = { id: e.id, month: e.month, branchId: e.branchId, severity: e.severity, status: e.status, title: e.title, details: detailText(e.details), assignedUserId: e.assignedUserId || '', dueDate: e.dueDate || '' }
  showModal.value = true
}
async function save() {
  busy.value = true
  try {
    const payload = { ...form.value, assignedUserId: form.value.assignedUserId || null }
    if (form.value.id) await apiClient.updateException(form.value.id, payload)
    else await apiClient.createException(payload)
    toast('تم الحفظ', 'success')
    showModal.value = false
    await load()
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    busy.value = false
  }
}
async function remove(e) {
  if (!confirm(`حذف الاستثناء: ${e.title}؟`)) return
  await apiClient.deleteException(e.id)
  toast('تم الحذف', 'success')
  await load()
}

function detailText(d) {
  if (!d) return ''
  if (typeof d === 'object') return JSON.stringify(d).slice(0, 120)
  return String(d)
}
function sevLabel(s) { return ({ high: 'عالية', medium: 'متوسطة', low: 'منخفضة' })[s] || s }
function sevClass(s) { return ({ high: 'badge-danger', medium: 'badge-warning', low: 'badge-info' })[s] || 'badge' }
function exStatusLabel(s) { return ({ open: 'مفتوح', in_progress: 'قيد المتابعة', resolved: 'تمت المعالجة', closed: 'مغلق' })[s] || s }
function statusClass(s) { return ({ open: 'badge-danger', in_progress: 'badge-warning', resolved: 'badge-success', closed: 'badge' })[s] || 'badge' }
</script>
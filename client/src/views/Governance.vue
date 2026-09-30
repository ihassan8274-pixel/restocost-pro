<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h3>🛡️ الاعتمادات والحوكمة</h3>
        <div class="tabs pill-tabs">
          <button :class="['pill-tab', { active: tab === 'approvals' }]" @click="tab = 'approvals'">اعتمادات الأشهر</button>
          <button :class="['pill-tab', { active: tab === 'audit' }]" @click="tab = 'audit'">سجل التدقيق</button>
        </div>
      </div>

      <template v-if="tab === 'approvals'">
        <div class="status-strip">
          <span><span class="dot gray"></span> مسودة</span>
          <span><span class="dot blue"></span> قيد المراجعة</span>
          <span><span class="dot green"></span> معتمد</span>
          <span><span class="dot red"></span> مقفول</span>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th>الفروع</th>
                <th>المبيعات</th>
                <th>المشتريات</th>
                <th>المصروفات</th>
                <th>الحالة</th>
                <th>القفل</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in months" :key="m.month">
                <td class="mono">{{ arMonth(m.month) }}</td>
                <td>{{ m.branches }}</td>
                <td class="mono">{{ fmt(m.sales) }}</td>
                <td class="mono">{{ fmt(m.purchases) }}</td>
                <td class="mono">{{ fmt(m.expenses) }}</td>
                <td><span class="badge" :class="statusBadge(m)">{{ statusOf(m.month) }}</span></td>
                <td><span v-if="m.locked === 1 || lockedSet.has(m.month)" class="badge badge-danger">🔒 مقفول</span><span v-else class="badge badge-success">مفتوح</span></td>
                <td style="white-space:nowrap">
                  <button v-if="store.canApprove" class="btn btn-primary btn-sm" @click="openEdit(m)">تحديث الحالة</button>
                </td>
              </tr>
              <tr v-if="!months.length">
                <td colspan="8" class="empty-cell">لا توجد أشهر ببيانات بعد</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted-note">تسلسل الاعتماد: مسودة ← قيد المراجعة ← معتمد ← مقفول. القفل يمنع تعديل بيانات الشهر نهائياً.</p>
      </template>

      <template v-else>
        <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center">
          <input v-model="auditFilter" class="input" placeholder="تصفية حسب النشاط أو المستخدم..." style="max-width:320px" />
          <button class="btn btn-outline btn-sm" @click="loadAudit(true)">تحديث</button>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr><th>الوقت</th><th>المستخدم</th><th>النشاط</th><th>العنصر</th><th>التفاصيل</th></tr>
            </thead>
            <tbody>
              <tr v-for="log in filteredAudit" :key="log.id">
                <td class="mono" style="white-space:nowrap">{{ timeAgo(log.createdAt) }}</td>
                <td>{{ log.username }}</td>
                <td><span class="badge badge-info">{{ log.actionLabel }}</span></td>
                <td>{{ log.entity }}<template v-if="log.entityId"> / {{ log.entityId }}</template></td>
                <td class="audit-detail">{{ summarize(log.details) }}</td>
              </tr>
              <tr v-if="!filteredAudit.length"><td colspan="5" class="empty-cell">لا سجلات مطابقة</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <div v-if="editRow" class="modal-overlay" @click.self="editRow = null">
      <div class="modal">
        <h3>تحديث اعتماد شهر {{ arMonth(editRow.month) }}</h3>
        <form @submit.prevent="saveApproval">
          <label>الحالة الجديدة</label>
          <select v-model="approvalForm.status" class="input">
            <option value="review">إرسال للمراجعة</option>
            <option value="approved">اعتماد</option>
            <option value="locked">قفل نهائي</option>
            <option value="unlocked">فتح الحظر</option>
          </select>
          <label>ملاحظات</label>
          <textarea v-model="approvalForm.notes" class="input" rows="3" placeholder="سبب الاعتماد / ملاحظات إضافية"></textarea>
          <div class="btn-group">
            <button class="btn btn-primary" :disabled="busy">{{ busy ? 'جارِ الحفظ...' : 'حفظ' }}</button>
            <button type="button" class="btn btn-outline" @click="editRow = null">إلغاء</button>
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

const tab = ref('approvals')
const approvals = ref([])
const months = ref([])
const lockedSet = ref(new Set())
const audit = ref([])
const auditFilter = ref('')
const editRow = ref(null)
const approvalForm = ref({ status: 'review', notes: '' })
const busy = ref(false)

const approvalMap = computed(() => {
  const map = {}
  for (const a of approvals.value) {
    if (a.status === 'locked') lockedSet.value.add(a.month)
    map[a.month] = a
  }
  return map
})
function statusOf(month) {
  const a = approvalMap.value[month]
  return a ? ({ draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', locked: 'مقفول', unlocked: 'غير مؤمّن' })[a.status] : 'مسودة'
}
function statusBadge(m) {
  const s = statusOf(m.month)
  if (s === 'مقفول') return 'badge-danger'
  if (s === 'معتمد') return 'badge-success'
  if (s === 'قيد المراجعة') return 'badge-info'
  return 'badge-gold'
}
const filteredAudit = computed(() => {
  const f = auditFilter.value.trim().toLowerCase()
  if (!f) return audit.value
  return audit.value.filter(a => (a.username || '').toLowerCase().includes(f) || (a.actionLabel || '').toLowerCase().includes(f) || (a.entity || '').toLowerCase().includes(f))
})

onMounted(async () => {
  await loadApprovals()
  await loadAudit()
})

async function loadApprovals() {
  const data = await apiClient.getApprovals()
  approvals.value = data.approvals || []
  months.value = data.months || []
  lockedSet.value = new Set((data.approvals || []).filter(a => a.status === 'locked').map(a => a.month))
}
async function loadAudit(showBusy = false) {
  if (showBusy) toast('جارِ تحميل سجل التدقيق...', 'info')
  audit.value = await apiClient.getAuditLogs(150)
}

function openEdit(m) {
  editRow.value = m
  approvalForm.value = { status: 'review', notes: approvalMap.value[m.month]?.notes || '' }
  const cur = approvalMap.value[m.month]?.status || 'draft'
  if (cur === 'review') approvalForm.value.status = 'approved'
  else if (cur === 'approved') approvalForm.value.status = 'locked'
  else if (cur === 'locked') approvalForm.value.status = 'unlocked'
}

async function saveApproval() {
  busy.value = true
  try {
    await apiClient.setApproval(editRow.value.month, approvalForm.value)
    toast('تم تحديث الاعتماد بنجاح', 'success')
    editRow.value = null
    await loadApprovals()
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    busy.value = false
  }
}

function arMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const names = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${names[m]} ${y}`
}
function fmt(n) { return Number(n).toLocaleString('en-US') }
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`
  return new Date(iso).toLocaleDateString('ar')
}
function summarize(details) {
  if (!details) return ''
  try {
    if (details.body) {
      const b = details.body
      const keys = Object.keys(b).slice(0, 3)
      return keys.map(k => `${k}: ${typeof b[k] === 'object' ? JSON.stringify(b[k]).slice(0, 40) : b[k]}`).join('، ')
    }
    return JSON.stringify(details).slice(0, 120)
  } catch (_) { return String(details).slice(0, 120) }
}
</script>
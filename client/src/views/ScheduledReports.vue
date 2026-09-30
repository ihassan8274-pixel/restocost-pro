<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h3>🗓️ التقارير المجدولة</h3>
        <button class="btn btn-info btn-sm" @click="openCreate">+ جدولة تقرير</button>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>نوع التقرير</th>
              <th>التكرار</th>
              <th>الحالة</th>
              <th>آخر تشغيل</th>
              <th>التشغيل القادم</th>
              <th>الجلسات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in schedules" :key="s.id">
              <td>{{ s.name }}</td>
              <td><span class="badge badge-info">{{ reportTypeLabel(s.reportType) }}</span></td>
              <td>{{ freqLabel(s.frequency) }}</td>
              <td>
                <span class="badge" :class="s.enabled ? 'badge-success' : 'badge'">{{ s.enabled ? 'مفعّل' : 'متوقف' }}</span>
              </td>
              <td class="mono">{{ s.lastRunAt ? fmtDate(s.lastRunAt) : '—' }}</td>
              <td class="mono">{{ s.nextRunAt ? fmtDate(s.nextRunAt) : '—' }}</td>
              <td>
                <button v-if="s.runCount" class="link" @click="openRuns(s)">عرض ({{ s.runCount }})</button>
                <span v-else>—</span>
              </td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" @click="runNow(s)">تشغيل الآن</button>
                <button class="btn btn-outline btn-sm" @click="openEdit(s)">تحرير</button>
                <button class="btn btn-danger btn-sm" @click="remove(s)">حذف</button>
              </td>
            </tr>
            <tr v-if="!schedules.length"><td colspan="8" class="empty-cell">لا جداول بعد</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ form.id ? 'تحرير جدولة' : 'جدولة تقرير جديد' }}</h3>
        <form @submit.prevent="save">
          <label>اسم الجدولة<input v-model="form.name" type="text" class="input" required /></label>
          <div class="form-row">
            <label>نوع التقرير
              <select v-model="form.reportType" class="input">
                <option value="closing">تقرير الإغلاق الشهري</option>
                <option value="items">تقرير بدلالة الأصناف</option>
                <option value="expenses">تقارير المصروفات</option>
                <option value="branches">مقارنة الفروع</option>
              </select>
            </label>
            <label>التكرار
              <select v-model="form.frequency" class="input">
                <option value="weekly">أسبوعي</option>
                <option value="monthly">شهري</option>
                <option value="quarterly">ربع سنوي</option>
              </select>
            </label>
          </div>
          <label>شهر مستهدف (اختياري — إن تُرك يستخدم الشهر الحالي)
            <input v-model="form.targetMonth" type="month" class="input" />
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <input v-model="form.enabled" type="checkbox" /> تفعيل الجدولة
          </label>
          <div class="btn-group">
            <button class="btn btn-primary">حفظ</button>
            <button type="button" class="btn btn-outline" @click="showModal = false">إلغاء</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="runsView" class="modal-overlay" @click.self="runsView = null">
      <div class="modal wide">
        <h3>جلسات التقرير: {{ runsView.name }}</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead><tr><th>#</th><th>التاريخ</th><th>الشهر</th><th>نوع التقرير</th><th></th></tr></thead>
            <tbody>
              <tr v-for="(r, i) in runs" :key="r.id">
                <td>{{ r.id }}</td>
                <td class="mono">{{ fmtDate(r.ranAt) }}</td>
                <td class="mono">{{ r.month }}</td>
                <td>{{ r.reportType }}</td>
                <td><button class="btn btn-outline btn-sm" @click="viewRun(r)">عرض البيانات</button></td>
              </tr>
              <tr v-if="!runs.length"><td colspan="5" class="empty-cell">لا جلسات بعد</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="snapshotView" class="modal-overlay" @click.self="snapshotView = null">
      <div class="modal wide">
        <h3>لقطة بيانات الجلسة</h3>
        <pre class="snapshot-pre">{{ snapshotView }}</pre>
        <div class="btn-group"><button class="btn btn-outline" @click="snapshotView = null">إغلاق</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { showToast as toast } from '../store/toast'

const schedules = ref([])
const runs = ref([])
const runsView = ref(null)
const snapshotView = ref(null)
const showModal = ref(false)
const form = ref(defaultForm())
const busy = ref(false)

function defaultForm() {
  return { id: null, name: '', reportType: 'closing', frequency: 'monthly', targetMonth: '', enabled: true }
}

onMounted(load)

async function load() {
  schedules.value = await apiClient.getScheduledReports()
  for (const s of schedules.value) {
    try { const rr = await apiClient.getScheduledRuns(s.id); s.runCount = rr.length; } catch (_) { s.runCount = 0 }
  }
}

function openCreate() { form.value = defaultForm(); showModal.value = true }
function openEdit(s) {
  form.value = { id: s.id, name: s.name, reportType: s.reportType, frequency: s.frequency, targetMonth: s.config?.month || '', enabled: !!s.enabled }
  showModal.value = true
}
async function save() {
  busy.value = true
  try {
    const payload = { name: form.value.name, reportType: form.value.reportType, frequency: form.value.frequency, enabled: form.value.enabled, targetMonth: form.value.targetMonth || null }
    if (form.value.id) await apiClient.updateScheduledReport(form.value.id, payload)
    else await apiClient.createScheduledReport(payload)
    toast('تم الحفظ', 'success')
    showModal.value = false
    await load()
  } catch (e) { toast(e.message, 'error') } finally { busy.value = false }
}
async function remove(s) {
  if (!confirm(`حذف جدولة «${s.name}»؟`)) return
  await apiClient.deleteScheduledReport(s.id)
  toast('تم الحذف', 'success')
  await load()
}
async function runNow(s) {
  busy.value = true
  try {
    const r = await apiClient.runScheduledReport(s.id)
    toast('تم توليد التقرير (جلسة #' + r.run.id + ')', 'success')
    await load()
  } catch (e) { toast(e.message, 'error') } finally { busy.value = false }
}
async function openRuns(s) {
  runsView.value = s
  runs.value = await apiClient.getScheduledRuns(s.id)
}
async function viewRun(r) {
  const d = await apiClient.getScheduledRun(r.id)
  snapshotView.value = JSON.stringify(d.snapshot, null, 2).slice(0, 4000)
}

function reportTypeLabel(t) { return ({ closing: 'الإغلاق الشهري', items: 'الأصناف', expenses: 'المصروفات', branches: 'مقارنة الفروع' })[t] || t }
function freqLabel(f) { return ({ weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي' })[f] || f }
function fmtDate(iso) { return new Date(iso).toLocaleString('ar', { month: 'short', year: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
</script>
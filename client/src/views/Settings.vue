<template>
  <div>
    <div class="topbar">
      <h1>⚙️ الإعدادات</h1>
      <div class="actions">
        <button class="btn btn-success" @click="saveSettings">💾 حفظ الإعدادات</button>
        <button class="btn btn-info" @click="createBackup">🗃️ نسخة احتياطية</button>
      </div>
    </div>

    <div class="charts-grid">
      <div class="card">
        <div class="card-header"><h3>🏢 إعدادات الشركة</h3></div>
        <div class="form-group"><label>اسم الشركة/النشاط</label><input class="input" v-model="form.companyName" /></div>
        <div class="form-group"><label>الشعار الوصفي</label><input class="input" v-model="form.slogan" /></div>
        <div class="form-group">
          <label>شعار المؤسسة</label>
          <div class="flex gap-10" style="align-items: center; flex-wrap: wrap;">
            <img v-if="form.logo" :src="form.logo" alt="logo" style="width:64px;height:64px;object-fit:contain;border:1px dashed var(--muted);border-radius:8px;background:#fff;" />
            <span v-else class="text-muted" style="font-size:12px;">لا يوجد شعار</span>
            <label class="btn btn-outline btn-sm" style="cursor:pointer;">
              📤 اختيار شعار
              <input type="file" accept="image/*" style="display:none;" @change="onLogoChange" />
            </label>
            <button v-if="form.logo" class="btn btn-danger btn-sm" @click="form.logo = ''">🗑️ إزالة</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>العملة</label>
            <select class="input" v-model="form.currency">
              <option value="SAR">ريال سعودي (ر.س)</option>
              <option value="USD">دولار ($)</option>
              <option value="EUR">يورو (€)</option>
              <option value="AED">درهم (د.إ)</option>
            </select>
          </div>
          <div class="form-group">
            <label>المظهر</label>
            <div class="flex gap-10" style="margin-top: 5px;">
              <button class="btn" :class="isDark ? 'btn-outline' : 'btn-gold'" @click="setDark(false)">☀️ فاتح</button>
              <button class="btn" :class="isDark ? 'btn-gold' : 'btn-outline'" @click="setDark(true)">🌙 داكن</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>بيانات تجريبية توضيحية</label>
          <div class="flex gap-10">
            <button class="btn btn-sm btn-warning" @click="loadSeed">🌱 تعبئة بيانات تجريبية</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>🗃️ النسخ الاحتياطي</h3></div>
        <div class="table-wrapper">
          <table style="font-size: 12px;">
            <thead><tr><th>#</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
            <tbody>
              <tr v-for="(bp, i) in backups" :key="bp.id">
                <td>{{ i + 1 }}</td>
                <td class="num-ltr">{{ bp.created_at }}</td>
                <td>
                  <button class="btn btn-sm btn-info" @click="restoreBackup(bp.id)">↩️ استعادة</button>
                  <button class="btn btn-sm btn-outline" @click="downloadBackup(bp)">⬇️ تحميل</button>
                </td>
              </tr>
              <tr v-if="!backups.length"><td colspan="3" class="empty-state"><div class="icon">🗃️</div><p>لا توجد نسخ احتياطية</p></td></tr>
            </tbody>
          </table>
        </div>
        <div class="btn-group">
          <button class="btn btn-danger btn-sm" @click="clearBackups">🧹 مسح الكل</button>
        </div>
      </div>
    </div>

    <div class="card" style="border-color: rgba(231,76,60,.45);">
      <div class="card-header"><h3 style="color: var(--danger);">⚠️ منطقة الخطر</h3>
        <span class="text-muted" style="font-size: 12px;">حذف كامل لشهر معين من السجلات</span>
      </div>
      <div class="flex gap-10" style="flex-wrap: wrap;">
        <input type="month" class="input" style="width: 190px;" v-model="dangerMonth" />
        <button class="btn btn-danger" @click="deleteMonthData">🗑️ حذف بيانات الشهر</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store, setTheme, loadStaticData } from '../store'
import { currentMonth } from '../utils/format'

const form = ref({ companyName: '', slogan: '', currency: 'SAR', logo: '' })
const isDark = ref(document.documentElement.getAttribute('data-theme') === 'dark')
const backups = ref([])
const dangerMonth = ref(currentMonth())

function onLogoChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  if (file.size > 600 * 1024) { showToast('⚠️ الشعار كبير جداً (الحد 600 كيلوبايت)', 'error'); e.target.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => { form.value.logo = reader.result }
  reader.readAsDataURL(file)
}

async function loadSettings() {
  const s = await apiClient.getSettings().catch(() => ({}))
  const company = s.company || {}
  form.value = { companyName: company.name || store.companyName, slogan: company.slogan || store.companySlogan, currency: s.currency || 'SAR', logo: s.logo || '' }
}

async function loadBackups() {
  backups.value = await apiClient.getBackups()
}

async function saveSettings() {
  try {
    await apiClient.saveSettings({
      company: { name: form.value.companyName, slogan: form.value.slogan },
      theme: isDark.value ? 'dark' : 'light',
      currency: form.value.currency,
      logo: form.value.logo || undefined,
    })
    store.settings.company = { name: form.value.companyName, slogan: form.value.slogan }
    store.settings.currency = form.value.currency
    store.settings.logo = form.value.logo || undefined
    showToast('✅ تم حفظ الإعدادات', 'success')
  } catch (e) { showToast(e.message, 'error') }
}

function setDark(dark) {
  isDark.value = dark
  setTheme(dark ? 'dark' : 'light')
}

async function createBackup() {
  try {
    await apiClient.createBackup()
    showToast('🗃️ تم إنشاء نسخة احتياطية', 'success')
    await loadBackups()
  } catch (e) { showToast(e.message, 'error') }
}

async function restoreBackup(id) {
  if (!confirm('⚠️ استعادة هذه النسخة ستحل محل جميع البيانات الحالية. متابعة؟')) return
  try {
    await apiClient.restoreBackup(id)
    showToast('✅ تمت الاستعادة', 'success')
    await loadStaticData()
  } catch (e) { showToast(e.message, 'error') }
}

function downloadBackup(bp) {
  const blob = new Blob([JSON.stringify(bp.snapshot, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `restocost_backup_${bp.created_at}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function clearBackups() {
  if (!confirm('حذف جميع النسخ الاحتياطية؟')) return
  try {
    await apiClient.clearBackups()
    backups.value = []
    showToast('🧹 تم المسح', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

async function deleteMonthData() {
  if (!confirm(`حذف جميع سجلات شهر ${dangerMonth.value} نهائياً؟`)) return
  try {
    await apiClient.deleteMonth(dangerMonth.value)
    showToast('🗑️ تم حذف بيانات الشهر', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

async function loadSeed() {
  if (!confirm('تعبئة بيانات تجريبية (فروع وعلامات وسجلات لعدة أشهر)؟')) return
  try {
    const r = await fetch('/api/seed', { method: 'POST' })
    if (!r.ok) throw new Error((await r.json()).error || 'فشل')
    showToast('🌱 تم تعبئة البيانات التجريبية', 'success')
    await loadStaticData()
  } catch (e) { showToast(e.message, 'error') }
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadBackups()])
})
</script>
<template>
  <div>
    <div class="card">
      <div class="card-header">
        <h3>👥 المستخدمون والأدوار</h3>
        <button class="btn btn-primary btn-sm" @click="openCreate">+ مستخدم جديد</button>
      </div>

      <div class="role-grid">
        <div v-for="r in roles" :key="r.role" class="role-card">
          <div class="role-icon">{{ r.icon }}</div>
          <div>
            <b>{{ r.label }}</b>
            <p>{{ r.desc }}</p>
          </div>
        </div>
      </div>

      <div class="table-wrapper">
        <table class="table">
          <thead>
            <tr><th>#</th><th>اسم المستخدم</th><th>الاسم المعروض</th><th>الدور</th><th>الحالة</th><th>تاريخ الإنشاء</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td>
              <td class="mono">{{ u.username }}</td>
              <td>{{ u.displayName }}</td>
              <td><span class="badge" :class="roleBadge(u.role)">{{ roleLabel(u.role) }}</span></td>
              <td><span class="badge" :class="u.active ? 'badge-success' : 'badge-danger'">{{ u.active ? 'نشط' : 'معطل' }}</span></td>
              <td class="mono">{{ (u.createdAt || '').slice(0, 10) }}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" @click="openEdit(u)">تحرير</button>
                <button class="btn btn-warning btn-sm" @click="openReset(u)">كلمة المرور</button>
                <button v-if="u.id !== store.user?.id" class="btn btn-danger btn-sm" @click="remove(u)">حذف</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <h3>{{ form.id ? 'تحرير مستخدم' : 'مستخدم جديد' }}</h3>
        <form @submit.prevent="save">
          <label>اسم المستخدم (الدخول)
            <input v-model="form.username" type="text" class="input" required :disabled="!!form.id" />
          </label>
          <label>الاسم المعروض<input v-model="form.displayName" type="text" class="input" /></label>
          <div class="form-row">
            <label>الدور
              <select v-model="form.role" class="input">
                <option v-for="r in roles" :key="r.role" :value="r.role">{{ r.label }}</option>
              </select>
            </label>
            <label>كلمة المرور
              <input v-model="form.password" type="password" class="input" :placeholder="form.id ? 'اتركها فارغة للإبقاء' : '6 أحرف على الأقل'" :required="!form.id" />
            </label>
          </div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px">
            <input v-model="form.active" type="checkbox" /> حساب نشط
          </label>
          <div class="btn-group">
            <button class="btn btn-primary">حفظ</button>
            <button type="button" class="btn btn-outline" @click="showModal = false">إلغاء</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="resetUser" class="modal-overlay" @click.self="resetUser = null">
      <div class="modal">
        <h3>إعادة تعيين كلمة المرور: {{ resetUser.displayName }}</h3>
        <form @submit.prevent="doReset">
          <label>كلمة المرور الجديدة<input v-model="newPassword" type="password" class="input" minlength="6" required /></label>
          <div class="btn-group">
            <button class="btn btn-warning">تعيين</button>
            <button type="button" class="btn btn-outline" @click="resetUser = null">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiClient } from '../api/client'
import { store } from '../store'
import { showToast as toast } from '../store/toast'

const users = ref([])
const showModal = ref(false)
const resetUser = ref(null)
const newPassword = ref('')
const form = ref(defaultForm())

const roles = [
  { role: 'admin', icon: '🛡️', label: 'مدير النظام', desc: 'صلاحيات كاملة بما فيها إدارة المستخدمين' },
  { role: 'finance_manager', icon: '💼', label: 'المدير المالي', desc: 'الاعتمادات والقفل والاستثناءات والضبط' },
  { role: 'reviewer', icon: '🔍', label: 'مراجع', desc: 'مراجعة واعتماد الأشهر دون تعديل' },
  { role: 'branch_manager', icon: '🏪', label: 'مدير فرع', desc: 'إدخال بيانات الفروع والمصروفات' },
  { role: 'viewer', icon: '👁️', label: 'مشاهد', desc: 'قراءة التقارير فقط' },
]

function defaultForm() { return { id: null, username: '', displayName: '', role: 'viewer', password: '', active: true } }

onMounted(load)
async function load() { users.value = await apiClient.getUsers() }

function openCreate() { form.value = defaultForm(); showModal.value = true }
function openEdit(u) { form.value = { id: u.id, username: u.username, displayName: u.displayName || '', role: u.role, password: '', active: !!u.active }; showModal.value = true }

async function save() {
  try {
    const payload = { name: form.value.displayName, role: form.value.role, active: form.value.active ? 1 : 0 }
    if (form.value.password) payload.password = form.value.password
    if (form.value.id) await apiClient.updateUser(form.value.id, payload)
    else await apiClient.createUser({ username: form.value.username.toLowerCase(), password: form.value.password, name: form.value.displayName, role: form.value.role, active: form.value.active ? 1 : 0 })
    toast('تم الحفظ', 'success')
    showModal.value = false
    await load()
  } catch (e) { toast(e.message, 'error') }
}

async function doReset() {
  try {
    await apiClient.updateUser(resetUser.value.id, { password: newPassword.value })
    toast('تم تعيين كلمة المرور', 'success')
    resetUser.value = null
    newPassword.value = ''
  } catch (e) { toast(e.message, 'error') }
}

async function remove(u) {
  if (!confirm(`حذف المستخدم «${u.displayName || u.username}»؟`)) return
  try {
    await apiClient.deleteUser(u.id)
    toast('تم الحذف', 'success')
    await load()
  } catch (e) { toast(e.message, 'error') }
}

function roleLabel(r) { return ({ admin: 'مدير النظام', finance_manager: 'المدير المالي', branch_manager: 'مدير فرع', reviewer: 'مراجع', viewer: 'مشاهد' })[r] || r }
function roleBadge(r) { return ({ admin: 'badge-danger', finance_manager: 'badge-warning', branch_manager: 'badge-info', reviewer: 'badge-gold', viewer: 'badge' })[r] || 'badge' }
</script>
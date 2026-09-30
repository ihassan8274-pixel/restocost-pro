<template>
  <div>
    <div class="topbar">
      <h1>🏪 الفروع والعلامات التجارية</h1>
      <div class="actions">
        <button class="btn btn-gold" @click="openBrandForm()">➕ علامة</button>
        <button class="btn btn-primary" @click="openBranchForm()">➕ فرع</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>🏷️ العلامات التجارية</h3></div>
      <div class="flex wrap gap-10">
        <div v-for="brand in store.brands" :key="brand.id" class="flex" style="gap:8px; border:1px solid var(--border); border-radius: 22px; padding: 6px 14px; background: var(--bg);">
          <span :style="{ color: brand.color, fontWeight: 800 }">●</span>
          <span style="font-weight:700;">{{ brand.name }}</span>
          <button class="btn btn-sm btn-outline" @click="openBrandForm(brand)">✏️</button>
          <button class="btn btn-sm btn-danger" @click="removeBrand(brand.id)">🗑️</button>
        </div>
        <div v-if="!store.brands.length" class="text-muted">لا توجد علامات</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>📋 الفروع</h3></div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th><th>اسم الفرع</th><th>العلامة</th><th>المنطقة</th><th>رصيد أول المدة</th><th>رصيد آخر المدة</th><th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in store.branches" :key="b.id">
              <td>{{ b.id }}</td>
              <td><strong>{{ b.name }}</strong></td>
              <td><span :style="{ color: store.brandById[b.brandId]?.color, fontWeight: 600 }">{{ store.brandById[b.brandId]?.name || 'بدون' }}</span></td>
              <td>{{ b.region || '-' }}</td>
              <td class="num-ltr">{{ formatNumber(b.opening) }}</td>
              <td class="num-ltr">{{ formatNumber(b.closing) }}</td>
              <td>
                <button class="btn btn-sm btn-primary" @click="openBranchForm(b)">✏️</button>
                <button class="btn btn-sm btn-danger" @click="removeBranch(b.id)">🗑️</button>
              </td>
            </tr>
            <tr v-if="!store.branches.length"><td colspan="7" class="empty-state"><div class="icon">🏪</div><p>لا توجد فروع</p></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Branch form modal -->
    <div v-if="branchModal" class="modal-overlay" @click.self="branchModal = null">
      <div class="modal">
        <h3>{{ branchForm.id ? '✏️ تعديل فرع' : '➕ إضافة فرع' }}</h3>
        <div class="form-group"><label>اسم الفرع</label><input class="input" v-model="branchForm.name" /></div>
        <div class="form-group">
          <label>العلامة التجارية</label>
          <select class="input" v-model="branchForm.brandId">
            <option :value="''">-- اختر --</option>
            <option v-for="br in store.brands" :key="br.id" :value="br.id">{{ br.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>المنطقة</label>
          <select class="input" v-model="branchForm.region">
            <option>الرياض</option><option>جدة</option><option>الدمام</option><option>مكة</option><option>المدينة</option><option>أخرى</option>
          </select>
        </div>
        <div class="form-grid">
          <div class="form-group"><label>رصيد أول المدة</label><input type="number" class="input" v-model.number="branchForm.opening" step="0.01" /></div>
          <div class="form-group"><label>رصيد آخر المدة</label><input type="number" class="input" v-model.number="branchForm.closing" step="0.01" /></div>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" @click="saveBranch">{{ branchForm.id ? '💾 حفظ' : '➕ إضافة' }}</button>
          <button class="btn btn-outline" @click="branchModal = null">إلغاء</button>
        </div>
      </div>
    </div>

    <!-- Brand form modal -->
    <div v-if="brandModal" class="modal-overlay" @click.self="brandModal = null">
      <div class="modal">
        <h3>{{ brandForm.id ? '✏️ تعديل علامة' : '➕ إضافة علامة' }}</h3>
        <div class="form-group"><label>اسم العلامة</label><input class="input" v-model="brandForm.name" /></div>
        <div class="form-group"><label>اللون</label><input type="color" class="input" v-model="brandForm.color" /></div>
        <div class="btn-group">
          <button class="btn btn-primary" @click="saveBrand">{{ brandForm.id ? '💾 حفظ' : '➕ إضافة' }}</button>
          <button class="btn btn-outline" @click="brandModal = null">إلغاء</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatNumber } from '../utils/format'

const branchModal = ref(null)
const brandModal = ref(null)
const branchForm = ref({})
const brandForm = ref({})

function openBranchForm(branch) {
  branchForm.value = branch ? { ...branch, brandId: branch.brandId || '' } : { id: null, name: '', brandId: '', region: 'الرياض', opening: 0, closing: 0 }
  branchModal.value = true
}
function openBrandForm(brand) {
  brandForm.value = brand ? { ...brand } : { id: null, name: '', color: '#FFD700' }
  brandModal.value = true
}

async function saveBranch() {
  if (!branchForm.value.name) return showToast('⚠️ اسم الفرع مطلوب', 'warning')
  try {
    if (branchForm.value.id) {
      await apiClient.updateBranch(branchForm.value.id, branchForm.value)
      showToast('✅ تم تحديث الفرع', 'success')
    } else {
      await apiClient.createBranch(branchForm.value)
      showToast('✅ تم إضافة الفرع', 'success')
    }
    branchModal.value = null
    store.branches = await apiClient.getBranches()
  } catch (e) { showToast(e.message, 'error') }
}

async function removeBranch(id) {
  if (!confirm('⚠️ هل تريد حذف هذا الفرع وجميع سجلاته؟')) return
  try {
    await apiClient.deleteBranch(id)
    store.branches = store.branches.filter(b => b.id !== id)
    showToast('🗑️ تم حذف الفرع', 'info')
  } catch (e) { showToast(e.message, 'error') }
}

async function saveBrand() {
  if (!brandForm.value.name) return showToast('⚠️ اسم العلامة مطلوب', 'warning')
  try {
    if (brandForm.value.id) {
      await apiClient.updateBrand(brandForm.value.id, brandForm.value)
      showToast('✅ تم تحديث العلامة', 'success')
    } else {
      await apiClient.createBrand(brandForm.value)
      showToast('✅ تم إضافة العلامة', 'success')
    }
    brandModal.value = null
    store.brands = await apiClient.getBrands()
  } catch (e) { showToast(e.message, 'error') }
}

async function removeBrand(id) {
  if (!confirm('⚠️ هل تريد حذف هذه العلامة؟')) return
  try {
    await apiClient.deleteBrand(id)
    store.brands = store.brands.filter(b => b.id !== id)
    showToast('🗑️ تم حذف العلامة', 'info')
  } catch (e) { showToast(e.message, 'error') }
}
</script>
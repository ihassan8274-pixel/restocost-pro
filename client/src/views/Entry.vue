<template>
  <div>
    <div class="topbar">
      <h1>📝 إدخال البيانات الشهرية</h1>
      <div class="actions">
        <label class="btn btn-info btn-sm" style="cursor:pointer;">📥 استيراد من Excel<input type="file" style="display:none;" accept=".xls,.xlsx,.csv,.txt" @change="onImportFile" /></label>
        <button class="btn btn-gold btn-sm" @click="downloadTemplate">📋 قالب استيراد</button>
        <button class="btn btn-success" @click="saveAll">💾 حفظ</button>
        <button class="btn btn-info" @click="copyPrev">📋 نسخ من السابق</button>
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
          <select class="input" v-model="branchFilter">
            <option value="all">🌐 جميع الفروع</option>
            <option v-for="b in store.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>🏷️ العلامة</label>
          <select class="input" v-model="brandFilter">
            <option value="all">🌐 جميع العلامات</option>
            <option v-for="b in store.brands" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الفرع</th>
              <th>العلامة</th>
              <th>المنطقة</th>
              <th>رصيد أول المدة</th>
              <th>المشتريات</th>
              <th>التحويلات</th>
              <th>رصيد آخر المدة</th>
              <th>المبيعات</th>
              <th>التكلفة</th>
              <th>النسبة</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.id">
              <td>{{ row.id }}</td>
              <td><strong>{{ row.name }}</strong></td>
              <td><span :style="{ color: row.brandColor, fontWeight: 600 }">{{ row.brandName }}</span></td>
              <td>{{ row.region || '-' }}</td>
              <td><input type="number" class="input num-ltr" style="min-width:100px;" v-model.number="edits[row.id].opening" step="0.01" /></td>
              <td><input type="number" class="input num-ltr" style="min-width:100px;" v-model.number="edits[row.id].purchases" step="100" /></td>
              <td><input type="number" class="input num-ltr" style="min-width:100px;" v-model.number="edits[row.id].transfers" step="100" /></td>
              <td><input type="number" class="input num-ltr" style="min-width:100px;" v-model.number="edits[row.id].closing" step="0.01" /></td>
              <td><input type="number" class="input num-ltr" style="min-width:100px;" v-model.number="edits[row.id].sales" step="100" /></td>
              <td class="num-ltr" style="font-weight: 700;">{{ formatNumber(costOf(row.id)) }}</td>
              <td class="num-ltr" :style="{ color: ratioOf(row.id) > 70 ? 'var(--danger)' : ratioOf(row.id) > 50 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }">
                {{ ratioOf(row.id).toFixed(2) }}%
              </td>
              <td><input class="input" style="min-width:130px;font-size:12px;" v-model="edits[row.id].notes" placeholder="ملاحظة..." /></td>
            </tr>
            <tr v-if="!filteredRows.length" >
              <td colspan="12" class="empty-state"><div class="icon">📝</div><p>لا توجد فروع</p></td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" style="text-align:right;"><strong>📊 الإجمالي ({{ filteredRows.length }} فرع)</strong></td>
              <td class="num-ltr">{{ formatNumber(totalOpening) }}</td>
              <td class="num-ltr">{{ formatNumber(totalPurchases) }}</td>
              <td class="num-ltr">{{ formatNumber(totalTransfers) }}</td>
              <td class="num-ltr">{{ formatNumber(totalClosing) }}</td>
              <td class="num-ltr">{{ formatNumber(totalSales) }}</td>
              <td class="num-ltr">{{ formatNumber(totalCost) }}</td>
              <td class="num-ltr">{{ avgRatio.toFixed(2) }}%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '../api/client'
import { showToast } from '../store/toast'
import { store } from '../store'
import { formatNumber, currentMonth, previousMonth, calculateCost, calculateRatio } from '../utils/format'
import { parseImport, getMonthlyRecordsTemplate, buildXls, downloadFile } from '../utils/excel'

const month = ref(currentMonth())
const branchFilter = ref('all')
const brandFilter = ref('all')
const edits = ref({})
const rowsMeta = ref({})

async function loadData() {
  const [recs, brands, branches] = await Promise.all([
    apiClient.getRecords({ month: month.value }),
    apiClient.getBrands(),
    apiClient.getBranches(),
  ])
  store.brands = brands
  store.branches = branches
  rowsMeta.value = {}
  edits.value = {}
  for (const b of branches) {
    const rec = recs.find(r => r.branchId === b.id) || { opening: 0, closing: 0, purchases: 0, transfers: 0, sales: 0, notes: '' }
    edits.value[b.id] = {
      opening: Number(rec.opening || 0),
      closing: Number(rec.closing || 0),
      purchases: Number(rec.purchases || 0),
      transfers: Number(rec.transfers || 0),
      sales: Number(rec.sales || 0),
      notes: rec.notes || '',
    }
    const brand = store.brandById[b.brandId]
    rowsMeta.value[b.id] = {
      name: b.name, region: b.region,
      brandName: brand?.name || 'بدون', brandColor: brand?.color || '#888',
      brandId: b.brandId,
    }
  }
}

const filteredRows = computed(() => {
  return store.branches.filter(b => {
    if (branchFilter.value !== 'all' && b.id != branchFilter.value) return false
    if (brandFilter.value !== 'all' && b.brandId != brandFilter.value) return false
    return true
  }).map(b => ({ ...b, ...(rowsMeta.value[b.id] || {}) }))
})

function costOf(id) {
  return calculateCost(edits.value[id])
}
function ratioOf(id) {
  const e = edits.value[id]
  return e ? calculateRatio(calculateCost(e), e.sales) : 0
}

const totalOpening = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.opening || 0), 0))
const totalPurchases = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.purchases || 0), 0))
const totalTransfers = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.transfers || 0), 0))
const totalClosing = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.closing || 0), 0))
const totalSales = computed(() => Object.values(edits.value).reduce((s, e) => s + (e.sales || 0), 0))
const totalCost = computed(() => Object.values(edits.value).reduce((s, e) => s + calculateCost(e), 0))
const avgRatio = computed(() => totalSales.value > 0 ? (totalCost.value / totalSales.value) * 100 : 0)

function downloadTemplate() {
  const t = getMonthlyRecordsTemplate()
  const text = buildXls(t.sheet, '', t.headers, t.rows)
  downloadFile(text, t.filename)
}

async function saveAll() {
  const rows = store.branches.map(b => ({ branchId: b.id, ...(edits.value[b.id] || {}) }))
  try {
    await apiClient.bulkUpdateRecords(month.value, rows)
    showToast(`✅ تم حفظ بيانات شهر ${month.value}`, 'success')
  } catch (e) {
    showToast('فشل الحفظ: ' + e.message, 'error')
  }
}

async function copyPrev() {
  try {
    const prev = previousMonth(month.value)
    const prevRecs = await apiClient.getRecords({ month: prev })
    if (!prevRecs.length) return showToast('لا توجد بيانات للشهر السابق', 'warning')
    for (const b of store.branches) {
      const rec = prevRecs.find(r => r.branchId === b.id)
      if (rec) edits.value[b.id] = {
        opening: Number(rec.opening), closing: Number(rec.closing),
        purchases: Number(rec.purchases), transfers: Number(rec.transfers), sales: Number(rec.sales),
        notes: rec.notes || '',
      }
    }
    showToast('📋 تم نسخ بيانات الشهر السابق', 'success')
  } catch (e) {
    showToast(e.message, 'error')
  }
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await file.text()
    const items = parseImport(text, file.name)
    if (!items.length) return showToast('⚠️ لم يتم العثور على بيانات صالحة في الملف', 'warning')
    let applied = 0
    for (const it of items) {
      const b = store.branches.find(x => x.name.trim() === it.branchName.trim())
      if (!b) continue
      if (!edits.value[b.id]) edits.value[b.id] = { opening: 0, closing: 0, purchases: 0, transfers: 0, sales: 0, notes: '' }
      Object.assign(edits.value[b.id], { opening: it.opening, purchases: it.purchases, transfers: it.transfers, closing: it.closing, sales: it.sales, notes: it.notes })
      applied++
    }
    if (!applied) return showToast(`⚠️ لم تتطابق الأسماء مع الفروع (اقرئت ${items.length} صف)`, 'warning')
    showToast(`📥 تم استيراد ${applied} من ${items.length} صف، اضغط حفظ للاعتماد`, 'success')
  } catch (err) {
    showToast('فشل قراءة الملف: ' + err.message, 'error')
  }
}

watch([branchFilter, brandFilter], () => {})

onMounted(loadData)
</script>
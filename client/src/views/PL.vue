<template>
  <div>
    <div class="topbar">
      <h1>💰 قائمة الدخل والمصروفات (P&L)</h1>
      <div class="actions">
        <div class="seg">
          <button type="button" class="seg-btn" :class="{ active: mode === 'month' }" @click="mode = 'month'">📅 شهري</button>
          <button type="button" class="seg-btn" :class="{ active: mode === 'year' }" @click="mode = 'year'">🗓️ سنوي</button>
          <button type="button" class="seg-btn" :class="{ active: mode === 'range' }" @click="mode = 'range'">🔍 فترة مخصصة</button>
        </div>
        <input v-if="mode === 'month'" type="month" class="input" style="width:180px;" v-model="plMonth" />
        <input v-else-if="mode === 'year'" type="number" class="input" style="width:130px;" v-model.number="plYear" min="2000" max="2100" />
        <template v-else>
          <input type="month" class="input" style="width:150px;" v-model="plRangeFrom" placeholder="من" title="من شهر" />
          <span style="margin:0 6px;color:#888;">إلى</span>
          <input type="month" class="input" style="width:150px;" v-model="plRangeTo" placeholder="إلى" title="إلى شهر" />
        </template>
        <select class="input" style="width:210px;" v-model="plBranch">
          <option value="all">🌐 مجمع — جميع الفروع</option>
          <option v-for="b in store.branches" :key="b.id" :value="String(b.id)">{{ b.name }}</option>
        </select>
        <button class="btn btn-info" @click="exportExcel">⬇️ Excel</button>
        <button class="btn btn-outline" @click="pdfReport">💾 PDF</button>
        <button class="btn btn-primary" @click="printReport">🖨️ طباعة</button>
      </div>
    </div>

    <div v-if="rs.headerMessage || rs.primaryColor" class="report-banner" :style="{ borderColor: rs.primaryColor || 'var(--gold)', color: rs.primaryColor || 'var(--gold-dark)' }">
      <span class="dot" :style="{ background: rs.primaryColor || 'var(--gold)' }"></span>
      {{ rs.headerMessage }}
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div></div>

    <template v-else-if="data">
      <div class="pl-print-area">
        <div class="kpi-grid">
          <KpiCard icon="💰" label="إجمالي الإيرادات" :value="data.totals.revenue" color="var(--success)" />
          <KpiCard icon="🧾" label="تكلفة المبيعات (COGS)" :value="data.totals.cogs" color="var(--danger)" />
          <KpiCard icon="🏆" label="صافي الربح" :value="data.totals.netProfit" color="var(--teal)" />
          <KpiCard icon="📈" label="نسبة تكلفة المبيعات" :value="data.totals.cogsRatio" isPercent color="var(--warning)" />
          <KpiCard icon="💸" label="إجمالي المصروفات" :value="data.totals.totalExpenses" color="#9b59b6" />
          <KpiCard icon="⚖️" label="مصروفات / إيرادات" :value="data.totals.expenseRatio" isPercent color="var(--danger)" />
        </div>

        <div class="card pl-card">
          <div class="card-header"><h3>📊 قائمة الدخل والمصروفات — {{ data.periodLabel }} — {{ scopeLabel }}</h3></div>
          <div class="pl-table-scroll">
            <table class="pl-pivot-table">
              <thead>
                <tr>
                  <th class="pl-pv-bayan">البيان</th>
                  <th v-for="c in pivot.cols" :key="c.key">{{ c.label }}</th>
                  <th class="pl-pv-total">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in pivot.rows" :key="r.label" class="pl-pv-item" :class="r.cls">
                  <td class="pl-pv-bayan" :style="(r.style || '') + (r.bold ? 'font-weight:800;' : '')">{{ r.label }}</td>
                  <td v-for="(v, i) in r.cells" :key="i" class="num-ltr pl-pv-cell" :style="(r.style || '') + (r.bold ? 'font-weight:700;' : '')">{{ pvCellText(r, v) }}</td>
                  <td class="num-ltr pl-pv-total" :style="(r.style || '') + (r.bold ? 'font-weight:700;' : '')">{{ pvCellText(r, r.total) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="muted-note" style="margin:6px 0 12px;">* «—» تعني عدم وجود قيمة لهذا البند في هذا العمود</div>
          </div>
        </div>

        <div v-if="data.branchRows.length > 1" class="card">
          <div class="card-header"><h3>🏢 تفصيل أداء الفروع — {{ data.periodLabel }}</h3></div>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>الفرع</th><th>الإيرادات</th><th>تكلفة المبيعات</th><th>نسبة التكلفة</th><th>المصروفات</th><th>مجمل الربح</th><th>صافي الربح</th><th>هامش الصافي</th></tr></thead>
              <tbody>
                <tr v-for="b in data.branchRows" :key="b.branchId">
                  <td><strong>{{ b.name }}</strong></td>
                  <td class="num-ltr">{{ fmt(b.revenue) }}</td>
                  <td class="num-ltr">{{ fmt(b.cogs) }}</td>
                  <td class="num-ltr">{{ b.cogsRatio.toFixed(2) }}%</td>
                  <td class="num-ltr">{{ fmt(b.expenses) }}</td>
                  <td class="num-ltr" :style="{ color: b.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(b.grossProfit) }}</td>
                  <td class="num-ltr" style="font-weight:700;" :style="{ color: b.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }">{{ fmt(b.netProfit) }}</td>
                  <td class="num-ltr">{{ b.netRatio.toFixed(2) }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        

        <div class="charts-grid" style="margin-top: 14px;">
          <ChartView ref="chart1" title="📊 المكونات الرئيسية" type="bar"
            :labels="['الإيرادات', 'تكلفة المبيعات', 'المصروفات', 'مجمل الربح', 'صافي الربح']"
            :datasets="[{ data: [data.totals.revenue, data.totals.cogs, data.totals.totalExpenses, data.totals.grossProfit, data.totals.netProfit], backgroundColor: ['rgba(46,204,113,0.75)', 'rgba(231,76,60,0.75)', 'rgba(155,89,182,0.75)', 'rgba(52,152,219,0.75)', 'rgba(26,188,156,0.75)'] }]"
          />
          <ChartView ref="chart2" title="🥧 المصروفات حسب التصنيف" type="doughnut"
            :labels="expenseCategoryLabels"
            :datasets="[{ data: expenseCategoryValues, backgroundColor: expenseCategoryColors }]"
            :options="{ plugins: { legend: { position: 'right' } } }"
          />
          <ChartView ref="chart3" v-if="mode === 'year' && monthLabels.length > 1" title="📅 التطور الشهري (إيرادات / تكلفة / صافي)"
            :labels="monthLabels"
            :datasets="[
              { label: 'الإيرادات', data: monthRevenue, borderColor: '#27ae60', backgroundColor: 'rgba(46,204,113,0.12)', fill: true, tension: 0.35 },
              { label: 'تكلفة المبيعات', data: monthCogs, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.10)', fill: true, tension: 0.35 },
              { label: 'صافي الربح', data: monthNet, borderColor: '#9b59b6', backgroundColor: 'rgba(155,89,182,0.12)', fill: true, tension: 0.35 },
            ]"
          />
          <ChartView ref="chart4" v-if="branchChartLabels.length > 1" title="🏢 أداء الفروع (إيرادات وصافي)" type="bar"
            :labels="branchChartLabels"
            :datasets="[
              { label: 'الإيرادات', data: branchChartRevenue, backgroundColor: 'rgba(46,204,113,0.7)', borderRadius: 5 },
              { label: 'صافي الربح', data: branchChartNet, backgroundColor: 'rgba(26,188,156,0.7)', borderRadius: 5 },
            ]"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '../api/client'
import { store } from '../store'
import { showToast } from '../store/toast'
import { formatNumber, currentMonth, categoryLabel, categoryColor } from '../utils/format'
import { buildXls, downloadFile } from '../utils/excel'
import { capturePrint } from '../utils/print'
import KpiCard from '../components/KpiCard.vue'
import ChartView from '../components/ChartView.vue'

const mode = ref('month')
  const plMonth = ref(currentMonth())
  const plYear = ref(Number(currentMonth().slice(0, 4)))
  const plRangeFrom = ref(currentMonth())
  const plRangeTo = ref(currentMonth())
  const plBranch = ref('all')
  const loading = ref(false)
  const data = ref(null)
  const rs = ref({})

const fmt = (v) => formatNumber(v)

const scopeLabel = computed(() => {
  if (!data.value) return ''
  if (data.value.scope.type === 'branch') return data.value.scope.branch?.name || ''
  if (data.value.scope.type === 'brand') return 'جميع فروع العلامة'
  return 'مجمع — جميع الفروع'
})

const chart1 = ref(null)
const chart2 = ref(null)
const chart3 = ref(null)
const chart4 = ref(null)

const expenseCategoryLabels = computed(() => {
  const order = ['fixed', 'variable', 'administrative', 'operational', 'other']
  const map = {}
  for (const t of data.value?.expenseTypes || []) {
    const cat = t.category || 'other'
    map[cat] = (map[cat] || 0) + t.total
  }
  return order.filter(c => map[c]).map(c => categoryLabel(c))
})
const expenseCategoryValues = computed(() => {
  const order = ['fixed', 'variable', 'administrative', 'operational', 'other']
  const map = {}
  for (const t of data.value?.expenseTypes || []) {
    const cat = t.category || 'other'
    map[cat] = (map[cat] || 0) + t.total
  }
  return order.filter(c => map[c]).map(c => map[c])
})
const expenseCategoryColors = computed(() => {
  const order = ['fixed', 'variable', 'administrative', 'operational', 'other']
  const map = {}
  for (const t of data.value?.expenseTypes || []) {
    const cat = t.category || 'other'
    map[cat] = (map[cat] || 0) + t.total
  }
  return order.filter(c => map[c]).map(c => categoryColor(c))
})

const monthLabels = computed(() => (data.value?.months || []).map(m => m.label))
const monthRevenue = computed(() => (data.value?.months || []).map(m => m.revenue))
const monthCogs = computed(() => (data.value?.months || []).map(m => m.cogs))
const monthNet = computed(() => (data.value?.months || []).map(m => m.netProfit))

const branchChartLabels = computed(() => (data.value?.branchRows || []).map(b => b.name))
const branchChartRevenue = computed(() => (data.value?.branchRows || []).map(b => b.revenue))
const branchChartNet = computed(() => (data.value?.branchRows || []).map(b => b.netProfit))

const MONTH_NAMES = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
function monthLabelLocal(m) {
  if (!m) return ''
  const p = String(m).split('-')
  return (MONTH_NAMES[Number(p[1]) - 1] || p[1]) + ' ' + p[0]
}

const pivot = computed(() => {
  const d = data.value
  if (!d) return { cols: [], rows: [] }
  const isBranch = d.scope.type === 'branch'
  let cols = []
  const valMap = []

  if (mode.value === 'month') {
    const mKey = plMonth.value
    cols = [{ key: mKey, label: monthLabelLocal(mKey) }]
    const m = (d.months || []).find(x => x.month === mKey)
    const rev = m ? m.revenue : 0, cogs = m ? m.cogs : 0, exp = m ? m.expenses : 0
    const net = m ? m.netProfit : rev - cogs - exp
    valMap.push({ revenue: rev, cogs, gross: rev - cogs, cogsPct: rev > 0 ? (cogs / rev) * 100 : 0, grossPct: rev > 0 ? ((rev - cogs) / rev) * 100 : 0, expenses: exp, net, netPct: rev > 0 ? (net / rev) * 100 : 0 })
  } else if (mode.value === 'year') {
    if (isBranch) {
      const year = Number(plYear.value)
      const now = new Date()
      const maxMonth = (year === now.getFullYear()) ? now.getMonth() + 1 : 12
      cols = Array.from({ length: maxMonth }, (_, i) => {
        const m = String(i + 1).padStart(2, '0')
        const key = `${year}-${m}`
        return { key, label: monthLabelLocal(key) }
      })
      const mMap = {}
      for (const m of d.months || []) mMap[m.month] = m
      for (const c of cols) {
        const m = mMap[c.key]
        const rev = m ? m.revenue : 0, cogs = m ? m.cogs : 0, exp = m ? m.expenses : 0
        const net = m ? m.netProfit : rev - cogs - exp
        valMap.push({ revenue: rev, cogs, gross: rev - cogs, cogsPct: rev > 0 ? (cogs / rev) * 100 : 0, grossPct: rev > 0 ? ((rev - cogs) / rev) * 100 : 0, expenses: exp, net, netPct: rev > 0 ? (net / rev) * 100 : 0 })
      }
    } else {
      cols = (d.branchRows || []).map(b => ({ key: 'b' + b.branchId, label: b.name, branchId: b.branchId }))
      for (const b of d.branchRows || []) {
        valMap.push({ revenue: b.revenue, cogs: b.cogs, gross: b.grossProfit, cogsPct: b.revenue > 0 ? b.cogsRatio : 0, grossPct: b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0, expenses: b.expenses, net: b.netProfit, netPct: b.netRatio })
      }
    }
  } else if (mode.value === 'range') {
    if (isBranch) {
      const [fromY, fromM] = plRangeFrom.value.split('-').map(Number)
      const [toY, toM] = plRangeTo.value.split('-').map(Number)
      const totalMonths = (toY - fromY) * 12 + (toM - fromM) + 1
      cols = Array.from({ length: totalMonths }, (_, i) => {
        let y = fromY, m = fromM + i
        while (m > 12) { m -= 12; y++ }
        const key = `${y}-${String(m).padStart(2, '0')}`
        return { key, label: monthLabelLocal(key) }
      })
      const mMap = {}
      for (const m of d.months || []) mMap[m.month] = m
      for (const c of cols) {
        const m = mMap[c.key]
        const rev = m ? m.revenue : 0, cogs = m ? m.cogs : 0, exp = m ? m.expenses : 0
        const net = m ? m.netProfit : rev - cogs - exp
        valMap.push({ revenue: rev, cogs, gross: rev - cogs, cogsPct: rev > 0 ? (cogs / rev) * 100 : 0, grossPct: rev > 0 ? ((rev - cogs) / rev) * 100 : 0, expenses: exp, net, netPct: rev > 0 ? (net / rev) * 100 : 0 })
      }
    } else {
      cols = (d.branchRows || []).map(b => ({ key: 'b' + b.branchId, label: b.name, branchId: b.branchId }))
      for (const b of d.branchRows || []) {
        valMap.push({ revenue: b.revenue, cogs: b.cogs, gross: b.grossProfit, cogsPct: b.revenue > 0 ? b.cogsRatio : 0, grossPct: b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0, expenses: b.expenses, net: b.netProfit, netPct: b.netRatio })
      }
    }
  }
  const rowsMap = {}
  // Columns are either month-keyed (شهر/فترة/سنة لفرع واحد) or branch-keyed (سنة/فترة لجميع الفروع).
  // Decide matching by the column shape, not by scope, so expense rows land in the right column.
  const colsAreBranches = cols.length > 0 && cols[0].branchId !== undefined
  const idxOf = (it) => (colsAreBranches ? cols.findIndex(c => c.branchId === it.branchId) : cols.findIndex(c => c.key === it.month))
  for (const t of d.expenseTypes || []) {
    for (const it of t.items || []) {
      const key = it.description || it.typeName || 'مصروف'
      if (!rowsMap[key]) rowsMap[key] = { key, label: key, cells: new Array(cols.length).fill(0), total: 0 }
      const ci = idxOf(it)
      if (ci >= 0) rowsMap[key].cells[ci] += it.amount
      rowsMap[key].total += it.amount
    }
  }
  const expRows = Object.values(rowsMap)
  const expGrand = cols.map((_, i) => expRows.reduce((s, r) => s + r.cells[i], 0))
  const rows = []
  rows.push({ cls: 'pl-pv-income', label: '💰 إجمالي الإيرادات', cells: valMap.map(v => v.revenue), total: d.totals.revenue, bold: true })
  rows.push({ cls: 'pl-pv-income', label: '🧾 تكلفة المبيعات (COGS)', cells: valMap.map(v => v.cogs), total: d.totals.cogs, neg: true, style: 'color:var(--danger);' })
  rows.push({ cls: 'pl-pv-income', label: 'نسبة تكلفة المبيعات', cells: valMap.map(v => v.cogsPct), total: d.totals.cogsRatio, pct: true })
  rows.push({ cls: 'pl-pv-income', label: 'مجمل الربح', cells: valMap.map(v => v.gross), total: d.totals.grossProfit, style: 'color:var(--success);' })
  rows.push({ cls: 'pl-pv-income', label: 'نسبة مجمل الربح', cells: valMap.map(v => v.grossPct), total: d.totals.grossMargin, pct: true })
  rows.push({ cls: 'pl-pv-exp-head', section: true })
  for (const r of expRows) rows.push({ label: r.label, cells: r.cells, total: r.total })
  rows.push({ cls: 'pl-pv-grand', label: '💸 إجمالي المصروفات', cells: expGrand, total: d.totals.totalExpenses, neg: true, bold: true, style: 'color:var(--danger);' })
  rows.push({ cls: 'pl-pv-income', label: '🏆 صافي الربح', cells: valMap.map(v => v.net), total: d.totals.netProfit, bold: true, style: 'color:var(--success);' })
  rows.push({ cls: 'pl-pv-income', label: 'نسبة صافي الربح', cells: valMap.map(v => v.netPct), total: d.totals.netMargin, pct: true })
  return { cols, rows }
})

function pvCellText(r, v) {
  if (r.pct) return (v || v === 0) ? (Number(v).toFixed(2) + '%') : '—'
  if (!v) return '—'
  return (r.neg ? '- ' : '') + fmt(v)
}

function catStyle(cat) {
  const c = categoryColor(cat)
  return { background: c + '22', color: c, border: '1px solid ' + c + '55' }
}

async function load() {
  loading.value = true
  try {
    let params = {}
    if (mode.value === 'year') {
      params = { year: plYear.value }
    } else if (mode.value === 'range') {
      params = { fromMonth: plRangeFrom.value, toMonth: plRangeTo.value }
    } else {
      params = { month: plMonth.value }
    }
    if (plBranch.value !== 'all') params.branchId = plBranch.value
    data.value = await apiClient.getPL(params)
  } catch (e) {
    showToast(e.message, 'error')
    data.value = null
  } finally {
    loading.value = false
  }
}

function printReport() {
  if (!data.value) return
  ;[chart1, chart2, chart3, chart4].forEach(c => c.value && c.value.reRender({ immediate: true }))
  setTimeout(() => {
    capturePrint(document.querySelector('.pl-print-area'), {
      title: `قائمة الدخل والمصروفات (P&L) - ${data.value.periodLabel}${scopeLabel.value ? ' - ' + scopeLabel.value : ''}`,
      company: store.companyName,
      logo: store.companyLogo,
      subtitle: store.companySlogan,
      primaryColor: rs.value.primaryColor,
      headerMessage: rs.value.headerMessage,
      landscape: true,
    })
  }, 150)
}

function pdfReport() {
  if (!data.value) return
  ;[chart1, chart2, chart3, chart4].forEach(c => c.value && c.value.reRender({ immediate: true }))
  setTimeout(() => {
    capturePrint(document.querySelector('.pl-print-area'), {
      title: `قائمة الدخل والمصروفات (P&L) - ${data.value.periodLabel}${scopeLabel.value ? ' - ' + scopeLabel.value : ''}`,
      company: store.companyName,
      logo: store.companyLogo,
      subtitle: store.companySlogan,
      primaryColor: rs.value.primaryColor,
      headerMessage: rs.value.headerMessage,
      landscape: true,
      pdf: true,
    })
  }, 150)
}

function exportExcel() {
  const d = data.value
  if (!d) return
  const rows = []
  rows.push(['قائمة الدخل والمصروفات (P&L)', d.periodLabel, scopeLabel.value])
  rows.push(['إجمالي الإيرادات', d.totals.revenue])
  rows.push(['تكلفة المبيعات (COGS)', d.totals.cogs])
  rows.push(['نسبة تكلفة المبيعات %', d.totals.cogsRatio.toFixed(2)])
  rows.push(['مجمل الربح', d.totals.grossProfit])
  rows.push(['هامش مجمل الربح %', d.totals.grossMargin.toFixed(2)])
  rows.push([])
  for (const t of d.expenseTypes) {
    rows.push([`مصروفات ${t.typeName} (${categoryLabel(t.category)})`, '', -t.total])
    for (const item of t.items) rows.push([item.branchName, item.description, -item.amount])
  }
  rows.push(['إجمالي المصروفات', '', -d.totals.totalExpenses])
  rows.push([])
  rows.push(['صافي الربح', '', d.totals.netProfit])
  rows.push(['هامش صافي الربح %', '', d.totals.netMargin.toFixed(2)])
  rows.push(['نسبة المصروفات للإيرادات %', '', d.totals.expenseRatio.toFixed(2)])
  if (d.branchRows.length > 1) {
    rows.push([])
    rows.push(['تفصيل حسب الفرع', 'الإيرادات', 'التكلفة', 'المصروفات', 'صافي الربح'])
    for (const b of d.branchRows) rows.push([b.name, b.revenue, b.cogs, b.expenses, b.netProfit])
  }
  const text = buildXls('قائمة الدخل والمصروفات', '', ['البند', 'الوصف', 'القيمة'], rows)
  const fname = `${d.mode === 'year' ? 'year_' + d.period : d.period}${d.scope.type === 'branch' ? '_' + d.scope.branch.id : ''}_pl.xls`
  downloadFile(text, fname)
  showToast('✅ تم تصدير Excel', 'success')
}

watch(mode, load)
watch(plMonth, load)
watch(plYear, load)
watch(plBranch, load)

onMounted(async () => {
  try {
    const s = await apiClient.getReportSettings()
    rs.value = (s || []).find(x => x.reportType === 'pl') || {}
  } catch (_) {}
  // Auto-target the report to the last month that actually has data,
  // so an empty current month (e.g. سبتمبر بلا بيانات) is not shown by default.
  try {
    const range = await apiClient.getDataRange()
    if (range && range.max) {
      plMonth.value = range.max
      plYear.value = Number(range.max.slice(0, 4))
      if (range.min) plRangeFrom.value = range.min
      plRangeTo.value = range.max
    }
  } catch (_) {}
  await load()
})
</script>
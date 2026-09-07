import { store } from '../store'

export function formatNumber(num, fractionDigits = 2) {
  const n = Number(num ?? 0)
  const parts = n.toFixed(fractionDigits).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

export function formatMoney(num, fractionDigits = 2) {
  return `${formatNumber(num, fractionDigits)} ${store.currencySymbols[store.currency] || store.currency}`
}

export function formatPercent(num, digits = 1) {
  return `${Number(num || 0).toFixed(digits)}%`
}

export function monthLabel(monthStr) {
  if (!monthStr) return ''
  const [y, m] = monthStr.split('-')
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${names[Number(m) - 1]} ${y}`
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function previousMonth(monthStr, offset = 1) {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 - offset, 1)
  return d.toISOString().slice(0, 7)
}

export function calculateCost(rec) {
  return (Number(rec?.opening || 0) + Number(rec?.purchases || 0) + Number(rec?.transfers || 0)) - Number(rec?.closing || 0)
}

export function calculateRatio(cost, sales) {
  return sales > 0 ? (cost / sales) * 100 : 0
}

export function debounce(fn, wait = 300) {
  let t
  return function (...args) {
    clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), wait)
  }
}

export function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function categoryLabel(cat) {
  const map = { fixed: 'ثابت', variable: 'متغير', administrative: 'إداري', operational: 'تشغيلي', other: 'أخرى' }
  return map[cat] || cat
}

export function categoryColor(cat) {
  const map = { fixed: '#1565c0', variable: '#e65100', administrative: '#6a1b9a', operational: '#2e7d32', other: '#616161' }
  return map[cat] || '#616161'
}
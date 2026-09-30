// Lightweight Excel utilities: SpreadsheetML (.xls) export + CSV, and import parsing (works when the server is offline too)
function escXml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

// Build an Excel 2003 SpreadsheetML .xls document (opens in Excel/WPS/LibreOffice)
export function buildXls(sheetName, caption, headers, rows) {
  const head = rows.length ? rows[0] : []
  const widths = head.map(c => Math.min(30, Math.max(10, String(c).length + 4)))
  const colXml = widths.map((w, i) => `<Column ss:Index="${i + 1}" ss:Width="${w * 6}" />`).join('')
  const rowToXml = (cells, isHeader) => {
    const inner = cells.map(c => {
      const isNum = typeof c === 'number' || (!isHeader && c !== '' && !isNaN(Number(c)) && c !== null && c !== undefined)
      const val = isNum && c !== '' ? Number(c) : c === undefined || c === null ? '' : c
      return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}"${isNum ? '' : ' xml:space="preserve"'}>${escXml(val)}</Data></Cell>`
    }).join('')
    return `<Row${isHeader ? ' ss:StyleID="hdr"' : ''}>${inner}</Row>`
  }
  const headerXml = headers && headers.length ? rowToXml(headers, true) : ''
  const bodyXml = rows.map(r => rowToXml(r, false)).join('')
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">\n<Styles><Style ss:ID="hdr"><Font ss:Bold="1" ss:Size="11" ss:Color="#000000"/><Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/></Style></Styles>\n<Worksheet ss:Name="${escXml(sheetName)}">\n<Table>${colXml}\n${headerXml}${bodyXml}</Table>\n</Worksheet>\n</Workbook>`
}

export function buildCsv(headers, rows) {
  const q = (v) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = []
  if (headers && headers.length) lines.push(headers.map(q).join(','))
  for (const r of rows) lines.push(r.map(q).join(','))
  return '\uFEFF' + lines.join('\n')
}

export function downloadFile(text, filename, mime = 'application/vnd.ms-excel;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

// ---- Import parsing --------------------------------------------------------
const NUM_RE = /[0-9.,]+/
function num(v) {
  if (v === undefined || v === null || v === '') return 0
  const s = String(v).trim()
  if (!s) return 0
  let n = Number(s.replace(/,/g, ''))
  if (isNaN(n)) { const m = s.match(NUM_RE); n = m ? Number(m[0].replace(/,/g, '')) : 0 }
  return isNaN(n) ? 0 : n
}

function parseCsv(text) {
  let delim = ','
  const first = text.split(/\r?\n/).find(l => l.trim())
  if (first) {
    const c = (first.match(/,/g) || []).length
    const sc = (first.match(/;/g) || []).length
    const t = (first.match(/\t/g) || []).length
    if (sc > c && sc > t) delim = ';'
    else if (t > c && t > sc) delim = '\t'
  }
  const rows = []
  let cur = '', row = [], inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === delim) { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (ch !== '\r') cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function parseXls(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const rows = Array.from(doc.getElementsByTagName('Row'))
  return rows.map(r => {
    const cells = Array.from(r.getElementsByTagName('Cell'))
    return cells.map(c => {
      const d = c.getElementsByTagName('Data')[0]
      return d ? d.textContent : (c.getAttribute('ss:Index') ? '' : '')
    })
  })
}

// Parse an imported file into normalized records by branch name.
// Expects columns: [اسم الفرع, رصيد أول المدة, المشتريات, التحويلات, رصيد آخر المدة, المبيعات, (ملاحظات)]
export function parseImport(text, filename = '') {
  let rows = []
  if (/\.csv$|\.txt$/i.test(filename)) rows = parseCsv(text)
  else rows = parseXls(text)
  // drop empty leading rows
  rows = rows.filter(r => r.some(c => String(c ?? '').trim() !== ''))

  const first = rows[0] || []
  const headerLike = first.some(c => /فرع|اسم|رصيد|المبيعات|التكلفة|ملاحظات|مشتريات/i.test(String(c)))
  let items = rows
  let usedLen = headerLike ? 6 : 7
  if (headerLike) items = rows.slice(1)
  const indexOfName = (r) => {
    if (!r.length) return -1
    if (r[0]) { const s = String(r[0]).trim(); if (s && !/^null$/i.test(s)) return 0 }
    if (r[1]) { const s = String(r[1]).trim(); if (s && /^\D+$/.test(s)) return 1 }
    return -1
  }
  const out = []
  for (const r of items) {
    const iName = indexOfName(r)
    if (iName < 0) continue
    const branchName = String(r[iName]).trim()
    if (!branchName || /^(total|الإجمالي|المجموع)$/i.test(branchName)) continue
    // tolerance: if a brand/label column follows the name (non numeric), shift numerics by one
    let base = iName + 1
    const nextVal = r[base] !== undefined ? String(r[base]).trim() : ''
    if (nextVal && !isNumberLike(nextVal)) base += 1
    const v = (k) => r[k] !== undefined ? num(r[k]) : 0
    const last = r.length - 1
    out.push({
      branchName,
      opening: v(base), purchases: v(base + 1), transfers: v(base + 2), closing: v(base + 3), sales: v(base + 4),
      notes: last > base + 4 ? String(r[last]).trim() : '',
    })
  }
  return out
}

function isNumberLike(v) {
  if (v === '') return false
  return !isNaN(Number(String(v).replace(/,/g, ''))) || /^[0-9.,%]+$/.test(String(v).trim())
}

// ---- Templates --------------------------------------------------------
// Returns template content for monthly records import (كشف شهري)
export function getMonthlyRecordsTemplate() {
  const headers = ['اسم الفرع', 'رصيد أول المدة', 'المشتريات', 'التحويلات', 'رصيد آخر المدة', 'المبيعات', 'ملاحظات']
  const rows = [
    ['فرع النخيل', 9000, 15000, 1000, 8500, 25000, ''],
    ['فرع الروضة', 8500, 14000, 500, 8000, 23000, ''],
    ['فرع السلام', 9500, 16000, 0, 9000, 26000, ''],
    ['فرع الورود', 8800, 14500, 800, 8200, 24000, ''],
    ['فرع المروج', 9200, 15500, 200, 8700, 24500, ''],
    ['فرع الشرائع', 8700, 14200, 600, 8100, 23500, ''],
  ]
  return { headers, rows, sheet: 'كشف شهري', filename: 'template_monthly_records.xls' }
}

// Returns template content for expenses import
export function getExpensesTemplate() {
  const headers = ['الشهر', 'الفرع', 'نوع المصروف', 'المبلغ', 'الوصف']
  const rows = [
    ['2026-09', 'فرع النخيل', 'إيجار', 15000, 'إيجار شهري'],
    ['2026-09', 'فرع الروضة', 'رواتب', 8000, 'رواتب الموظفين'],
    ['2026-09', 'فرع السلام', 'صيانة', 2500, 'صيانة معدات'],
  ]
  return { headers, rows, sheet: 'المصروفات', filename: 'template_expenses.xls' }
}
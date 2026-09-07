// Print/PDF helper: clones a DOM section, rasterizes charts, and shows it
// as a temporary overlay on top of the current screen (no new window).
export function capturePrint(node, { title = '', company = '', logo = '', subtitle = '', primaryColor = '#b8860b', headerMessage = '', landscape = false, pdf = false } = {}) {
  if (!node) return showPrintError('لم يتم العثور على محتوى للطباعة')

  // Wait for charts to render (Chart.js animation ~1s)
  const charts = node.querySelectorAll('canvas')
  const minWait = new Promise(resolve => setTimeout(resolve, 900))
  const waitForCharts = Array.from(charts).map(c => {
    return new Promise(resolve => {
      if (c.width > 40 && c.height > 40) return resolve()
      const check = setInterval(() => {
        if (c.width > 40 && c.height > 40) {
          clearInterval(check)
          resolve()
        }
      }, 60)
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  })

  Promise.all([minWait, ...waitForCharts]).then(() => {
    const snapshots = Array.from(node.querySelectorAll('canvas')).map(c => {
      try { return c.toDataURL('image/png') } catch (_) { return null }
    })
    const clone = node.cloneNode(true)
    Array.from(clone.querySelectorAll('canvas')).forEach((c, i) => {
      const img = document.createElement('img')
      if (snapshots[i]) img.src = snapshots[i]
      img.style.cssText = 'max-width:100%;height:auto;display:block;margin:6px auto;'
      c.replaceWith(img)
    })

    const logoHtml = logo
      ? `<img src="${logo}" style="max-height:64px;max-width:120px;object-fit:contain;" alt="logo"/>`
      : ''
    const docHtml = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${String(title).replace(/</g, '&lt;')}</title><style>
      *{box-sizing:border-box}
      @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:7mm}
      body{font-family:'Tajawal','Segoe UI',Arial,sans-serif;color:#1c1c1c;background:#fff;font-size:12px;padding:14px}
      .print-header{display:flex;align-items:center;gap:12px;border-bottom:3px solid ${String(primaryColor || '#b8860b')};padding-bottom:7px;margin-bottom:9px}
      .print-header .ph-txt .h1{font-size:18px;font-weight:800;color:${String(primaryColor || '#b8860b')}}
      .print-header .ph-txt .h2{font-size:11px;color:#555;margin-top:1px}
      .print-header-message{font-size:11px;color:#666;background:#faf6e9;border:1px dashed ${String(primaryColor || '#b8860b')};border-radius:6px;padding:5px 9px;margin:0 0 9px}
      .page-title{font-size:14px;font-weight:800;text-align:center;margin:6px 0 9px}
      table{width:100%;border-collapse:collapse;margin:5px 0 10px;font-size:11px}
      thead{display:table-header-group}
      tr{page-break-inside:avoid}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}
      th{background:#f2e9d8;color:#5a4a1a;font-weight:700}
      .total-row td{background:#faf6e9;font-weight:800}
      .num-ltr{direction:ltr;text-align:right;font-variant-numeric:tabular-nums;unicode-bidi:embed}
      .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:7px;margin:4px 0 10px}
      .kpi-card{border:1px solid #dcd4bf;border-radius:8px;padding:7px 10px;background:#fff;page-break-inside:avoid}
      .kpi-card .label{font-size:10px;color:#777}
      .kpi-card .value{font-size:15px;font-weight:800;margin-top:2px}
      .kpi-card .change{font-size:10px;margin-top:2px}
      .kpi-card .change.up{color:#27ae60}
      .kpi-card .change.down{color:#e74c3c}
      .charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .chart-box{padding:4px}
      .chart-box.loading{opacity:.4}
      .charts-grid .card{margin-bottom:0;page-break-inside:avoid}
      .chart-container{height:auto !important}
      .card{border:1px solid #dcd4bf;border-radius:8px;padding:8px 10px;margin:0 0 9px;page-break-inside:auto}
      .card-header{font-weight:800;font-size:13px;color:#8a6d1a;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:4px}
      .card-header h3{display:inline}
      .rec-item{display:flex;gap:10px;padding:8px 4px;border-bottom:1px solid #eee;align-items:flex-start}
      .rec-icon{font-size:17px}
      .rec-title{font-weight:700}
      .rec-text{color:#444;font-size:12px;margin-top:2px}
      .pill,.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px}
      .income-line{display:flex;justify-content:space-between;padding:4px 2px}
      .income-label{color:#444}
      .income-value{font-weight:700}
      .empty-state{text-align:center;color:#888;padding:14px}
      .mt-20{margin-top:14px}.flex{display:flex}.between{justify-content:space-between}
      .pl-section-label{font-weight:800;color:#8a6d1a;margin:10px 0 4px;font-size:13px}
      .pl-type-group{margin:8px 0}
      .pl-type-head{display:flex;align-items:center;gap:8px;background:#f6f1e2;border-right:4px solid #b8860b;padding:6px 10px;border-radius:6px;font-weight:800;font-size:12px}
      .pl-type-name{color:#5a4a1a}
      .pl-cat-pill{font-size:10px;padding:1px 10px;border-radius:12px;font-weight:700}
      .pl-type-total{margin-right:auto;color:#a94442}
      .pl-exp-group{margin:0 0 10px}
      .pl-exp-table{width:100%;border-collapse:collapse;font-size:11px}
      .pl-exp-table th,.pl-exp-table td{border:1px solid #e2dccb;padding:4px 10px;text-align:right}
      .pl-exp-table th{background:#f2e9d8;font-weight:800}
      .pl-exp-table .pl-exp-type-row td{background:#f6f1e2;padding:5px 10px}
      .pl-exp-table .pl-exp-type-row td b{color:#5a4a1a}
      .pl-exp-branch{color:#777;font-size:10px;white-space:nowrap;width:22%}
      .pl-exp-amount{white-space:nowrap;width:18%}
      .pl-type-flex{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .pl-table-scroll{overflow-x:auto}
      .pl-pivot-table{width:100%;border-collapse:collapse;font-size:10px;margin:4px 0 8px;page-break-inside:auto}
      .pl-pivot-table th,.pl-pivot-table td{border:1px solid #e2dccb;padding:3px 5px;text-align:right;vertical-align:middle}
      .pl-pivot-table th{background:#f2e9d8;font-weight:800}
      .pl-pv-bayan{font-weight:600}
      .pl-pv-cell{text-align:left}
      .pl-pv-total{font-weight:700;background:#faf6e9;text-align:left}
      .pl-pv-type td{background:#f6f1e2;font-weight:800;color:#5a4a1a;padding:5px 6px}
      .pl-pv-type-total td{background:#faf6e9;font-weight:700}
      .pl-pv-grand td{background:#f2e9d8;font-weight:800}
      .muted-note{font-size:10px;color:#777}
      .footer{text-align:center;color:#999;font-size:10px;margin-top:14px;border-top:1px solid #eee;padding-top:6px}
      @media print{
        body{padding:0}
        .pl-table-scroll,.table-wrapper{overflow:visible !important}
        .pl-pivot-table{table-layout:fixed}
        .pl-pivot-table{font-size:9.5px}
        .pl-pivot-table th,.pl-pivot-table td{white-space:normal}
        .pl-pivot-table .num-ltr{white-space:nowrap}
        .pl-pv-bayan{width:13%}
        .charts-grid .card{page-break-inside:avoid}
      }
    </style></head><body>
      <div class="print-header">
        ${logoHtml}
        <div class="ph-txt"><div class="h1">${String(company || 'شركتي').replace(/</g, '&lt;')}</div><div class="h2">${String(subtitle || '').replace(/</g, '&lt;')} · تاريخ الطباعة: ${new Date().toLocaleString('ar-SA')}</div></div>
      </div>
      ${headerMessage ? `<div class="print-header-message">${String(headerMessage).replace(/</g, '&lt;')}</div>` : ''}
      <div class="page-title">${String(title).replace(/</g, '&lt;')}</div>
      ${clone.outerHTML}
      <div class="footer">تم الإنشاء بواسطة منصة إدارة مالية ذكية</div>
    </body></html>`

    // Build a full-screen overlay on top of the current page (no new window)
    const overlay = document.createElement('div')
    overlay.id = 'rcp-print-overlay'
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:#fff;display:flex;flex-direction:column;'
    const bar = document.createElement('div')
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 14px;background:#172033;color:#fff;font-family:Tajawal,Arial,sans-serif;flex:0 0 auto;'
    const barTitle = document.createElement('span')
    barTitle.textContent = (pdf ? '💾 حفظ PDF' : '🖨️ معاينة الطباعة') + ' — ' + title
    barTitle.style.cssText = 'font-weight:700;'
    const spacer = document.createElement('span')
    spacer.style.cssText = 'flex:1;'
    const printBtn = document.createElement('button')
    printBtn.textContent = pdf ? '💾 حفظ PDF' : '🖨️ طباعة'
    printBtn.style.cssText = 'background:#d7a928;color:#172033;border:0;border-radius:8px;padding:8px 18px;font-weight:700;cursor:pointer;font-family:inherit;'
    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✖ إغلاق'
    closeBtn.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:8px 14px;cursor:pointer;font-family:inherit;'
    bar.appendChild(barTitle); bar.appendChild(spacer); bar.appendChild(printBtn); bar.appendChild(closeBtn)
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'flex:1;width:100%;border:0;background:#fff;'
    overlay.appendChild(bar); overlay.appendChild(iframe)
    document.body.appendChild(overlay)

    const doc = iframe.contentDocument
    doc.open(); doc.write(docHtml); doc.close()

    printBtn.onclick = () => { try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch (_) {} }
    closeBtn.onclick = () => overlay.remove()

    setTimeout(() => {
      try {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch (_) {}
      // After the print dialog closes, remove the temporary overlay
      setTimeout(() => overlay.remove(), 600)
    }, 400)
  })
  return true
}

function showPrintError(msg) {
  console.warn(msg)
  return false
}

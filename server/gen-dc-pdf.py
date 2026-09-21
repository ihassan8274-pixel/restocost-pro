# -*- coding: utf-8 -*-
"""
server/gen-dc-pdf.py — مولّد PDF جرد يومي احترافي (عربي RTL) عبر PyMuPDF Story.
الاستخدام: python gen-dc-pdf.py <input.json> <output.pdf>
المدخل JSON: { branchName, date, countedBy, status, docNo, today, items: [...] }
"""
import sys, json, html as H, time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
try:
    import pymupdf as fitz
except ImportError:
    import fitz

# ---------------------------------------------------------------------------
DARK    = "#1e293b"
GOLD    = "#facc15"
GOLD_LG = "#fde047"
LIGHT   = "#f8fafc"
ZEBRA   = "#fffdef"
TEXT    = "#1e293b"
SLATE   = "#64748b"
RED     = "#dc2626"
GREEN   = "#059669"
BORDER  = "#e2e8f0"

PAGE_W, PAGE_H = 595.276, 841.890   # A4
MARGIN = 30                          # هامش ≈ 1 سم من كل جهة (مع حيّز واقٍ للطباعة)
CONTENT_W = PAGE_W - MARGIN * 2 - 40    # عرض آمن ≠ يفيض لليمين (MuPDF توسّع جداول rtl)
RECT = fitz.Rect(MARGIN, MARGIN, PAGE_W - MARGIN, PAGE_H - MARGIN)


def esc(v):
    return H.escape(str(v if v is not None else ""))


def break_long(s):
    """يُدرج فواصل ناعمة (U+200B) داخل الكلمات الطويلة المتلاصقة حتى تُقصّ داخل الخلية
    ولا تمتد خارج الهامش (المشكلة التي كانت تقتطع الكلمات على اليسار عند الطباعة)."""
    s = str(s or "")
    out = []
    for tok in s.split(" "):
        if len(tok) > 12 and not tok.strip():
            pass
        if len(tok) > 12:
            out.append("\u200b".join(tok))
        else:
            out.append(tok)
    return " ".join(out)


def fmt(n):
    try:
        v = float(n)
        if v == int(v):
            return f"{int(v):,}"
        return f"{v:,.2f}"
    except Exception:
        return esc(n)


# ---------------------------------------------------------------------------
def build_header_html(branch, date, doc_no, today):
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;">
    <tr><td style="padding:8pt 12pt;background:{DARK};border:0.8pt solid {DARK};">
      <table style="width:100%;border-collapse:collapse;"><tr>
        <td style="text-align:left;font-size:8.5pt;color:#cbd5e1;">
          <div style="color:{GOLD_LG};font-weight:bold;font-size:11pt;">RestoCost ERP Pro</div>
          <div>جرد يومي — مخزون</div>
        </td>
        <td style="text-align:center;">
          <div style="font-size:13pt;font-weight:bold;color:white;">{esc(branch)}</div>
          <div style="font-size:8.5pt;color:#e2e8f0;">تاريخ الجرد: {esc(date)}</div>
        </td>
        <td style="text-align:left;font-size:8.5pt;color:#cbd5e1;">
          <div>رقم المستند: <span style="direction:ltr;unicode-bidi:embed;">{esc(doc_no)}</span></div>
          <div>تاريخ الإصدار: {esc(today)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:3pt;background:{GOLD};font-size:1pt;"></td></tr></table>
    <div style="line-height:5pt;font-size:1pt;">&nbsp;</div>"""


def build_footer_html(page_no):
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;"><tr>
      <td style="border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{SLATE};text-align:left;">RestoCost ERP Pro</td>
      <td style="border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{SLATE};text-align:center;">تم توليد التقرير آلياً من الجوال</td>
      <td style="border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{TEXT};font-weight:bold;text-align:right;">صفحة {page_no}</td>
    </tr></table>"""


def build_meta_html(rec):
    counted = rec.get("countedBy") or "—"
    status = "مكتمل" if rec.get("status") == "saved" else esc(rec.get("status") or "—")
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;"><tr>
      <td style="font-size:9pt;color:{SLATE};text-align:right;"><b style="color:{TEXT};">القائم بالجرد:</b> {esc(counted)}</td>
      <td style="font-size:9pt;color:{SLATE};text-align:left;"><b style="color:{TEXT};">الحالة:</b> {status}</td>
    </tr></table>
    <div style="line-height:5pt;font-size:1pt;">&nbsp;</div>"""


def build_table_html(items, rows):
    head_cells = "".join(
        f'<th style="background:{DARK};color:{GOLD_LG};padding:4pt 3pt;font-size:8.5pt;border:0.5pt solid {DARK};">{t}</th>'
        for t in ["م", "الصنف", "الوحدة", "المعدود الفعلي"])
    cols = ("<colgroup>" +
            f'<col style="width:26pt;"/>' +
            f'<col style="width:{int(CONTENT_W * 0.34)}pt;"/>' +
            f'<col style="width:{int(CONTENT_W * 0.28)}pt;"/>' +
            f'<col style="width:{int(CONTENT_W * 0.30)}pt;"/>' +
            "</colgroup>")
    trs = ""
    for it in rows:
        c = float(it.get("countedQty") or 0)
        zebra = ZEBRA if (it.get("__no") % 2 == 0) else "white"
        trs += f"""<tr style="background:{zebra};">
          <td style="padding:3pt;text-align:center;font-size:8.5pt;border:0.5pt solid {BORDER};">{it["__no"]}</td>
          <td style="padding:3pt;text-align:right;font-size:8.5pt;border:0.5pt solid {BORDER};word-break:break-all;">{esc(break_long(it.get('itemName') or '—'))}</td>
          <td style="padding:3pt;text-align:center;font-size:8pt;border:0.5pt solid {BORDER};">{esc(it.get('unit') or '')}</td>
          <td style="padding:3pt;text-align:center;font-size:8.5pt;font-weight:bold;border:0.5pt solid {BORDER};">{fmt(c)}</td>
        </tr>"""
    if not trs:
        trs = f'<tr><td colspan="4" style="padding:8pt;text-align:center;color:{SLATE};font-size:9pt;border:0.5pt solid {BORDER};">لا توجد أصناف مسجلة</td></tr>'
    return (f'<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;table-layout:fixed;direction:rtl;">'
            f'{cols}<tr>{head_cells}</tr>{trs}</table>')


def build_page_html(rec, items_page, page_no, branch, date, doc_no, today):
    html = build_header_html(branch, date, doc_no, today)
    html += build_meta_html(rec)
    html += build_table_html(rec["items"], items_page)
    html += build_footer_html(page_no)
    return html


def fits_one_page(html):
    """يعيد True إذا لاءم الـ html صفحة Oby واحدة (place flag = 0)."""
    doc = fitz.open()
    doc.new_page(width=PAGE_W, height=PAGE_H)
    story = fitz.Story(html=html, user_css="")
    flag, _ = story.place(RECT)
    doc.close()
    return flag == 0


# ---------------------------------------------------------------------------
def main():
    if len(sys.argv) < 3:
        print("usage: python gen-dc-pdf.py <in.json> <out.pdf>")
        return 1
    with open(sys.argv[1], "r", encoding="utf-8-sig") as f:
        rec = json.load(f)

    branch = rec.get("branchName") or "فرع غير محدد"
    date = rec.get("date") or "—"
    items = rec.get("items") or []

    doc_no = rec.get("docNo") or "DC-" + format(int(time.time() * 1000) % 1000000, "06d")
    today = rec.get("today") or date or ""

    for idx, it in enumerate(items):
        it["__no"] = idx + 1

    total = len(items)
    pages_html = []
    i = 0
    page_no = 0
    while True:
        page_no += 1
        remaining = (total - i) if total else 1
        lo, hi = 1, max(1, remaining)
        best = 1
        while lo <= hi:
            mid = (lo + hi) // 2
            chunk = items[i:i + mid] if total else []
            html = build_page_html(rec, chunk, page_no, branch, date, doc_no, today)
            if fits_one_page(html):
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1
        chunk = items[i:i + best] if total else []
        pages_html.append(build_page_html(rec, chunk, page_no, branch, date, doc_no, today))
        i += best
        if not total or i >= total:
            break

    writer = fitz.DocumentWriter(sys.argv[2])
    page_rect = fitz.paper_rect("a4")          # صفحة A4 حقيقية ذات أبعاد كاملة
    for ph in pages_html:
        dev = writer.begin_page(page_rect)
        story = fitz.Story(html=ph, user_css="")
        story.place(RECT)                        # المحتوى داخل هامش 1 سم
        story.draw(dev)
        writer.end_page()
    writer.close()
    print(f"OK pages={len(pages_html)} items={total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
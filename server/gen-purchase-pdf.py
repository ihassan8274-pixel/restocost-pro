# -*- coding: utf-8 -*-
"""
server/gen-purchase-pdf.py — طلبات الشراء / أوامر التوريد المبدئي PDF.
يُولد عبر PyMuPDF Story (HTML + CSS) مع تشكيل RTL صحيح للعربية (HarfBuzz).
المحتوى بالكامل داخل هامش 1 سم من كل الجوانب (box-sizing: border-box،
وعروض أعمدة محسوبة لتساوي عرض المحتوى تماماً فلا يتجاوز الجدول حافة الصفحة).

الاستخدام: python gen-purchase-pdf.py <input.json> <output.pdf>

بنية JSON:
{
  title, subtitle, docNo, today,
  kpis:  [[label, value], ...],
  meta:  [[label, value], ...],
  columns: [strings],
  rows:   [[mixed...], ...],        # عدد = ينسّق فواصل، نص = escaped
  totals: [mixed...] | null,
  footer: string
}
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
BORDER  = "#e2e8f0"

CM = 28.35                              # 1 سم = 28.35pt
PAGE_W, PAGE_H = 595.276, 841.890       # A4
MARGIN = CM                             # هامش 1 سم من كل الجوانب
# في RTL تُرسى القصص عند الحافة اليمنى للحاوية وقد تفيض الحروف لليمين بضع
# نقاط (تقدير MuPDF لعرض أشكال العرض أثناء التشكيل). نحتفظ بعرض محتوى قريب
# من الهامش 1 سم ونُرصّ الإرساء داخل الهامش الأيمن قليلاً كي لا يتجاوز أي
# حرف حدّ الصفحة إطلاقاً.
# يوزّع MuPDF أعمدة الجداول بعرض متساوٍ يزيد نحو ~30pt على العرض المحدد
# (يتجاهل عرض <col>) ويرسو الجدول بيمينه قرب حافة الصفحة، فتنزلق البطاقة/
# العمود الأخير خارج الهامش. نسأل عرض المحتوى أقل منها بـ 40pt ليبقى كل جدول
# (رأسي النهاية) داخل الصفحة معبراً ~577pt — اختُبر بقياسات فعلية.
CONTENT_W = PAGE_W - 2 * MARGIN - 12 - 40     # عرض محتوى آمن ≠ يفيض لليمين
RIGHT_SLACK = 10                        # إزاحة الإرساء اليمنى داخل الهامش
RECT = fitz.Rect(MARGIN, MARGIN, PAGE_W - MARGIN - RIGHT_SLACK, PAGE_H - MARGIN)

# box-sizing:border-box يجعل الحدود والحشوات داخل عرض الأعمدة المحددة
# فلا تتمدد الأعمدة اليمنى خارج الصفحة.
CSS = """
* { box-sizing: border-box; }
table { border-collapse: collapse; }
td, th { overflow-wrap: break-word; }
"""


def esc(v):
    return H.escape(str(v if v is not None else ""))


def fmt(v):
    try:
        f = float(v)
        if f == int(f):
            return f"{int(f):,}"
        return f"{f:,.2f}"
    except Exception:
        return esc(v)


def cell(v):
    """عدد → تنسيق بفواصل؛ نص → escaped."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return fmt(v)
    return esc(v)


def break_long(s):
    """إدخال Zero-Width Space في الكلمات الطويلة للالتفاف بلا كسر."""
    s = str(s or "")
    out = []
    for tok in s.split(" "):
        if len(tok) > 12:
            out.append("\u200b".join(tok))
        else:
            out.append(tok)
    return " ".join(out)


# ---------------------------------------------------------------------------
def build_header_html(title, subtitle, doc_no, today):
    right = int(CONTENT_W * 0.30)
    center = int(CONTENT_W * 0.40)
    left = int(CONTENT_W * 0.30)
    sub = f'<div style="font-size:8.5pt;color:#e2e8f0;direction:rtl;">{esc(subtitle)}</div>' if subtitle else ""
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;table-layout:fixed;">
    <tr><td style="padding:8pt 10pt;background:{DARK};border:0.8pt solid {DARK};">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;direction:rtl;"><tr>
        <td style="width:{right}pt;text-align:right;font-size:8.5pt;color:#cbd5e1;direction:rtl;">
          <div style="color:{GOLD_LG};font-weight:bold;font-size:11pt;">RestoCost ERP Pro</div>
          <div>نظام إدارة المطاعم — تقارير الإدارة المتكاملة</div>
        </td>
        <td style="width:{center}pt;text-align:center;color:white;direction:rtl;">
          <div style="font-size:13pt;font-weight:bold;">{esc(title)}</div>
          {sub}
        </td>
        <td style="width:{left}pt;text-align:left;font-size:8.5pt;color:#cbd5e1;">
          <div>رقم المستند: <span style="direction:ltr;unicode-bidi:embed;">{esc(doc_no)}</span></div>
          <div>تاريخ الإصدار: {esc(today)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:3pt;background:{GOLD};font-size:1pt;padding:0;"></td></tr></table>
    <div style="line-height:5pt;font-size:1pt;">&nbsp;</div>"""


def build_footer_html(footer, page_no):
    w3 = int(CONTENT_W / 3)
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;table-layout:fixed;"><tr>
      <td style="width:{w3}pt;border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{SLATE};text-align:left;">RestoCost ERP Pro</td>
      <td style="width:{w3}pt;border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{SLATE};text-align:center;">{esc(footer)}</td>
      <td style="width:{w3}pt;border-top:0.8pt solid {BORDER};padding-top:4pt;font-size:8pt;color:{TEXT};font-weight:bold;text-align:right;">صفحة {page_no}</td>
    </tr></table>"""


def build_kpis_html(kpis):
    if not kpis:
        return ""
    n = len(kpis)
    base = int(CONTENT_W / n)
    colws = [base] * (n - 1)
    colws.append(CONTENT_W - base * (n - 1))     # آخر بطاقة تلتقط باقي العرض بدقة
    cols = "<colgroup>" + "".join(f'<col style="width:{w}pt;"/>' for w in colws) + "</colgroup>"
    cells = ""
    for label, val in kpis:
        # نفس النمط الذي يعمل مع جدول الأصناف: table-layout:fixed + direction:rtl
        # على الجدول وعرض محدد عبر colgroup — لا نضع عرضاً على الخلية نفسها كي
        # لا يتخطى MuPDF العروض ويُخرج آخر بطاقة خارج حافة الصفحة.
        cells += f"""<td style="background:{LIGHT};border:0.8pt solid {BORDER};padding:5pt 6pt;direction:rtl;">
          <div style="font-size:8pt;color:{SLATE};">{esc(label)}</div>
          <div style="font-size:11pt;font-weight:bold;color:{TEXT};">{esc(val)}</div>
        </td>"""
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;table-layout:fixed;direction:rtl;">{cols}<tr>{cells}</tr></table>
    <div style="line-height:5pt;font-size:1pt;">&nbsp;</div>"""


def build_meta_html(meta):
    if not meta:
        return ""
    lines, line, count = [], [], 0
    cells_per_row = 3
    for label, val in meta:
        line.append(f"""<td style="font-size:8.5pt;color:{SLATE};text-align:right;padding:1pt 0;direction:rtl;overflow-wrap:break-word;">
            <b style="color:{TEXT};">{esc(label)}:</b> {esc(break_long(str(val)))}</td>""")
        count += 1
        if count == cells_per_row:
            lines.append("<tr>" + "".join(line) + "</tr>")
            line, count = [], 0
    if line:
        while count < cells_per_row:
            line.append('<td style="padding:1pt 0;"></td>')
            count += 1
        lines.append("<tr>" + "".join(line) + "</tr>")
    return f"""<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;direction:rtl;table-layout:fixed;">{''.join(lines)}</table>
    <div style="line-height:5pt;font-size:1pt;">&nbsp;</div>"""


def build_table_html(columns, rows, totals):
    n = len(columns)
    colw0 = 26
    inner = CONTENT_W - colw0
    if n <= 1:
        colws = [CONTENT_W]
    else:
        base = int(inner / (n - 1))
        colws = [base] * (n - 1)
        colws[-1] = inner - base * (n - 2)          # آخر عمود يلتقط الباقي بدقة
    cols = "<colgroup><col style='width:%dpt;'/>" % colw0
    for w in colws:
        cols += f"<col style='width:{w}pt;'/>"
    cols += "</colgroup>"
    heads = "".join(
        f'<th style="background:{DARK};color:{GOLD_LG};padding:4pt 2pt;font-size:8pt;border:0.5pt solid {DARK};text-align:center;">{esc(t)}</th>'
        for t in columns)
    trs = ""
    for idx, row in enumerate(rows):
        zebra = ZEBRA if (idx % 2 == 0) else "white"
        tds = f'<td style="padding:3pt 2pt;text-align:center;font-size:8.5pt;border:0.5pt solid {BORDER};direction:ltr;">{esc(row[0])}</td>' if row else ""
        for c in row[1:]:
            tds += f"""<td style="padding:3pt 2pt;text-align:right;font-size:8.5pt;border:0.5pt solid {BORDER};direction:rtl;word-break:break-word;">{cell(c)}</td>"""
        trs += f'<tr style="background:{zebra};">{tds}</tr>'
    if totals:
        tds = f'<td style="padding:3pt 2pt;text-align:center;font-size:8.5pt;border:0.5pt solid {BORDER};"></td>'
        for c in totals[1:]:
            tds += f"""<td style="padding:3pt 2pt;text-align:right;font-size:8.5pt;font-weight:bold;border:0.5pt solid {BORDER};direction:rtl;">{cell(c)}</td>"""
        trs += f'<tr style="background:#fde047;">{tds}</tr>'
    if not trs:
        trs = f'<tr><td colspan="{n}" style="padding:8pt;text-align:center;color:{SLATE};font-size:9pt;border:0.5pt solid {BORDER};">لا توجد بنود</td></tr>'
    return (f'<table style="width:{CONTENT_W}pt;border-collapse:collapse;font-family:sans-serif;table-layout:fixed;direction:rtl;">'
            f'{cols}<tr>{heads}</tr>{trs}</table>')


def build_page_html(rec, rows_page, show_extra, page_no):
    html = build_header_html(rec["title"], rec.get("subtitle"), rec.get("docNo") or f"RPT-{int(time.time()*1000)%1000000:06d}", rec.get("today") or "")
    if show_extra:
        html += build_kpis_html(rec.get("kpis") or [])
        html += build_meta_html(rec.get("meta") or [])
    html += build_table_html(rec.get("columns") or [], rows_page, rec.get("totals"))
    html += build_footer_html(rec.get("footer") or "تم توليد التقرير آلياً — نظام إدارة المطاعم", page_no)
    return html


def make_story(html):
    return fitz.Story(html=html, user_css=CSS)


def fits_one_page(html):
    doc = fitz.open()
    doc.new_page(width=PAGE_W, height=PAGE_H)
    story = make_story(html)
    flag, _ = story.place(RECT)
    doc.close()
    return flag == 0


def main():
    if len(sys.argv) < 3:
        print("usage: python gen-purchase-pdf.py <in.json> <out.pdf>")
        return 1
    with open(sys.argv[1], "r", encoding="utf-8-sig") as f:
        rec = json.load(f)
    rows = rec.get("rows") or []
    rec["totals"] = rec.get("totals") or None

    total = len(rows)
    pages_html = []
    i, page_no, first = 0, 0, True
    while True:
        page_no += 1
        show_extra = first
        remaining = total if total else 1
        lo, hi, best = 1, max(1, remaining), 1
        while lo <= hi:
            mid = (lo + hi) // 2
            chunk = rows[i:i + mid] if total else []
            html = build_page_html(rec, chunk, show_extra, page_no)
            if fits_one_page(html):
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1
        chunk = rows[i:i + best] if total else []
        pages_html.append(build_page_html(rec, chunk, show_extra, page_no))
        i += best
        first = False
        if not total or i >= total:
            break

    writer = fitz.DocumentWriter(sys.argv[2])
    page_rect = fitz.paper_rect("a4")
    for ph in pages_html:
        dev = writer.begin_page(page_rect)
        story = make_story(ph)
        story.place(RECT)
        story.draw(dev)
        writer.end_page()
    writer.close()
    print(f"OK pages={len(pages_html)} rows={total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
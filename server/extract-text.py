import sys, json, os

try:
    import pymupdf as fitz
except ImportError:
    import fitz

inp, outp = sys.argv[1], sys.argv[2]

try:
    doc = fitz.open(inp)
    pages = []
    for page in doc:
        txt = page.get_text() or ''
        pages.append(txt)
    result = {"pages": len(doc), "chars": sum(len(p) for p in pages), "text": "\n".join(pages)}
except Exception as e:
    result = {"pages": 0, "chars": 0, "text": "", "error": str(e)}

with open(outp, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False)
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4100;
const SHEET_CSV_URL = process.env.SHEET_CSV_URL || '';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', async (req, res) => {
  if (!SHEET_CSV_URL) return res.status(500).json({ error: 'SHEET_CSV_URL غير مضبوط' });
  try {
    const r = await fetch(SHEET_CSV_URL);
    const csv = await r.text();
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return res.json({ headers: [], rows: [] });
    const parse = (line) => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === ',' && !q) { out.push(cur); cur = ''; }
        else cur += c;
      }
      out.push(cur);
      return out;
    };
    const headers = parse(lines[0]);
    const rows = lines.slice(1).map((l) => {
      const cells = parse(l);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
    });
    res.json({ headers, rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));

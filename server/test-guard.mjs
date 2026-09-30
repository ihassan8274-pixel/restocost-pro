const BASE = 'http://127.0.0.1:3001';
const BOX = /[\u2500-\u257F]/;
const grnCorrupt = (arr) => arr.filter((r) => BOX.test(r?.supplierName || '')).length;

(async () => {
  const login = await (await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@restocost.com', password: '0553696633' }),
  })).json();
  const H = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' };
  console.log('login ok =', login.ok);

  const b1 = await (await fetch(BASE + '/api/bootstrap', { headers: H })).json();
  console.log('bootstrap#1 GRN =', b1.data.rcerp_grn.length, '| corrupt =', grnCorrupt(b1.data.rcerp_grn));

  // simulate the browser pushing a corrupted copy back
  const bad = b1.data.rcerp_grn.map((r) => ({ ...r, supplierName: '┘à╪╡┘╪╣ ╪د╪│╪د╪│' }));
  const post = await fetch(BASE + '/api/collections/rcerp_grn', { method: 'POST', headers: H, body: JSON.stringify(bad) });
  const pj = await post.json();
  console.log('POST corrupted ->', post.status, JSON.stringify(pj));

  const b2 = await (await fetch(BASE + '/api/bootstrap', { headers: H })).json();
  console.log('bootstrap#2 GRN =', b2.data.rcerp_grn.length, '| corrupt =', grnCorrupt(b2.data.rcerp_grn), '| first =', JSON.stringify(b2.data.rcerp_grn[0]?.supplierName));

  // sanity: a clean (small) write must still work normally
  const good = [...b2.data.rcerp_grn];
  const t = { id: 'guard-test-tmp', docNo: 'ZZ-TEST', date: '2026-09-29', supplierName: 'اختبار', total: 1 };
  const ok = await fetch(BASE + '/api/collections/rcerp_grn', { method: 'POST', headers: H, body: JSON.stringify([...good, t]) });
  console.log('POST clean ->', ok.status, JSON.stringify(await ok.json()));
  const b3 = await (await fetch(BASE + '/api/bootstrap', { headers: H })).json();
  console.log('bootstrap#3 GRN =', b3.data.rcerp_grn.length, '| has test rec =', b3.data.rcerp_grn.some((r) => r.id === 'guard-test-tmp'), '| corrupt =', grnCorrupt(b3.data.rcerp_grn));
})().catch((e) => console.error('ERR', e));
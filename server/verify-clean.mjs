const BASE = 'http://127.0.0.1:3001';
const BOX = /[\u2500-\u257F]/;
(async () => {
  const login = await (await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@restocost.com', password: '0553696633' }),
  })).json();
  const H = { Authorization: 'Bearer ' + login.token };
  const b = await (await fetch(BASE + '/api/bootstrap', { headers: H })).json();
  const grn = b.data.rcerp_grn || [];
  const corrupt = grn.filter((r) => BOX.test(r?.supplierName || '')).length;
  const testRecs = grn.filter((r) => r?.id === 'guard-test-tmp').length;
  console.log(`GRN=${grn.length} | corruptSupplierName=${corrupt} | testRecords=${testRecs} | first="${grn[0]?.supplierName}"`);
})().catch((e) => console.error('ERR', e.message));
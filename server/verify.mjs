const BASE = 'http://127.0.0.1:3001';
const BOX = /[\u2500-\u257F]/;
const j = (r) => r.json();

(async () => {
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@restocost.com', password: '0553696633' }),
  });
  const lj = await j(login);
  console.log('login status', login.status, 'ok=', lj.ok, 'mustChangePassword=', lj.mustChangePassword);
  if (!lj.token) { console.log('NO TOKEN - aborting'); return; }

  const boot = await fetch(BASE + '/api/bootstrap', { headers: { Authorization: 'Bearer ' + lj.token } });
  const bj = await j(boot);
  const data = bj.data || {};
  const grn = data.rcerp_grn || [];
  const sup = data.rcerp_suppliers || [];
  const badGrn = grn.filter((r) => BOX.test(r.supplierName || '')).length;
  const badSup = sup.filter((r) => BOX.test(r.name || '')).length;
  console.log('bootstrap status', boot.status, 'ok=', bj.ok, 'keys=', Object.keys(data).length);
  console.log('GRN count =', grn.length, '| corrupt supplierName =', badGrn);
  console.log('suppliers count =', sup.length, '| corrupt name =', badSup);
  console.log('first GRN supplierName codepoints =', Array.from(grn[0]?.supplierName || '').map(c => c.codePointAt(0).toString(16)).join(' '));
})().catch((e) => { console.error('ERR', e.message); });
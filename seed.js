require('dotenv').config();
const { withTransaction, close } = require('./db');
const { query } = require('./db');

const brands = [
  { id: 1, name: 'برجر كينج', color: '#FF6B35' },
  { id: 2, name: 'بيتزا هت', color: '#E71D36' },
  { id: 3, name: 'ماكدونالدز', color: '#FFD700' },
  { id: 4, name: 'كنتاكي', color: '#E31837' },
  { id: 5, name: 'سوب واي', color: '#00A651' }
];
const branches = [
  ['الرياض - برجر كينج',1,'الرياض',9741.30], ['جدة - برجر كينج',1,'جدة',8040.30],
  ['الدمام - بيتزا هت',2,'الدمام',7368.90], ['الرياض - بيتزا هت',2,'الرياض',7243.50],
  ['جدة - ماكدونالدز',3,'جدة',9089.50], ['الدمام - ماكدونالدز',3,'الدمام',7266.00],
  ['الرياض - كنتاكي',4,'الرياض',4808.75], ['جدة - كنتاكي',4,'جدة',4000.95],
  ['الدمام - سوب واي',5,'الدمام',636.00], ['الرياض - سوب واي',5,'الرياض',1329.00]
];
(async () => {
  try {
    await withTransaction(async client => {
      for (const b of brands) await client.query('INSERT INTO brands(id,name,color) VALUES($1,$2,$3) ON CONFLICT (id) DO NOTHING', b);
      for (const [index, b] of branches.entries()) {
        const id = index + 1;
        await client.query('INSERT INTO branches(id,name,brand_id,region,opening,closing) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT (id) DO NOTHING', [id, ...b]);
        await client.query('INSERT INTO monthly_records(month,branch_id,opening,closing,purchases,transfers,sales) VALUES(\'2026-09-01\',$1,$2,$2,0,0,0) ON CONFLICT DO NOTHING', [id, b[3]]);
      }
    });
    console.log('Seed completed.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally { await close(); }
})();

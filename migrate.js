const fs = require('fs');
const path = require('path');
const { query, withTransaction, close } = require('./db');

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Existing tables may hold the legacy INTEGER PK shape (without SERIAL).
    // For a clean v8 upgrade we drop all tables (reverse dependency order) then
    // re-create the schema with identity columns.
    await withTransaction(async (client) => {
      await client.query(`DROP TABLE IF EXISTS state_backups CASCADE`);
      await client.query(`DROP TABLE IF EXISTS monthly_records CASCADE`);
      await client.query(`DROP TABLE IF EXISTS expenses CASCADE`);
      await client.query(`DROP TABLE IF EXISTS budgets CASCADE`);
      await client.query(`DROP TABLE IF EXISTS branches CASCADE`);
      await client.query(`DROP TABLE IF EXISTS expense_types CASCADE`);
      await client.query(`DROP TABLE IF EXISTS brands CASCADE`);
      await client.query(`DROP TABLE IF EXISTS app_settings CASCADE`);
      await client.query(schema);
    });
    console.log('PostgreSQL schema v8 is ready.');
  } catch (error) {
    console.error('Migration v8 failed:', error.message);
    process.exitCode = 1;
  } finally {
    await close();
  }
})();
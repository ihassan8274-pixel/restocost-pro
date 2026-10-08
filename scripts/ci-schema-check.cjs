// Fails the build if `prisma migrate deploy` did not really create the schema.
//
// Why this file exists instead of a `node -e "..."` one-liner in CI:
// an inline script has to survive two layers of quoting (YAML block scalar →
// bash double quotes → `$` and `"` escaping) inside a step that has never run
// anywhere. One missing backslash and the assertion silently becomes a syntax
// error. Checked in, it is reviewable and testable on its own.
//
// Why the health check is not enough on its own:
// the original /api/health probe was `SELECT 1`, which happily succeeds
// against a database with ZERO tables — that is how the stack shipped
// reporting {"ok":true,"db":"ok"} while discarding every write (P2021).
//
// Run inside the server container, from /app, so `@prisma/client` resolves:
//   docker cp scripts/ci-schema-check.cjs server:/app/chk.cjs
//   docker exec server node /app/chk.cjs
const { PrismaClient } = require('@prisma/client');

const p = new PrismaClient();

p.$queryRawUnsafe(
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
)
  .then((tables) => {
    const names = tables.map((t) => t.tablename);
    console.log(`tables(${names.length}) = ${names.join(',')}`);
    if (names.length === 0) {
      throw new Error('zero tables in public — migrations did not run');
    }
    if (!names.includes('kv')) {
      // kv is what probeStore actually queries; without it the app looks
      // healthy while every request that reads the store fails.
      throw new Error(`kv table missing — found: ${names.join(',')}`);
    }
    return p.$queryRawUnsafe('SELECT count(*)::int AS n FROM kv');
  })
  .then((r) => {
    console.log(`kv table present, rows = ${r[0].n}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(`SCHEMA CHECK FAILED: ${e && e.message ? e.message : e}`);
    process.exit(1);
  })
  .finally(() => p.$disconnect().catch(() => {}));

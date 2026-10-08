import { readFileSync } from 'node:fs';
const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim();
const { default: pg } = await import('pg');
const client = new pg.Client({ connectionString: url });
await client.connect();

// Clear all rate limits
await client.query('DELETE FROM kv WHERE key LIKE \'%rate_limit%\' OR key LIKE \'%login:%\' OR key LIKE \'%rate_limit%\'');
console.log('Cleared all rate limits');

await client.end();
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../drizzle/0019_agreement_party_foundation.sql'), 'utf8');

// Strip inline comments and split on semicolons
const statements = sql
  .split('\n')
  .map(line => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

const conn = await createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.query(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP (already exists):', stmt.slice(0, 80));
    } else {
      console.error('ERROR:', err.message, '\nStatement:', stmt.slice(0, 200));
    }
  }
}
await conn.end();
console.log('Done');

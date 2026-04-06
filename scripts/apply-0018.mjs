import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL || '');
const raw = readFileSync(new URL('../drizzle/0018_contract_management_system.sql', import.meta.url), 'utf8');

// Remove single-line comments (-- ...) but preserve newlines for readability
const stripped = raw
  .split('\n')
  .map(line => {
    // Remove inline -- comments (but not inside strings — good enough for DDL)
    const idx = line.indexOf('--');
    return idx >= 0 ? line.slice(0, idx) : line;
  })
  .join('\n');

// Split on semicolons, skip empty
const stmts = stripped
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

for (const stmt of stmts) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80).replace(/\n/g, ' '));
  } catch (e) {
    console.log('ERR:', e.message.slice(0, 120), '|', stmt.slice(0, 60).replace(/\n/g, ' '));
  }
}

await conn.end();
console.log('Done');

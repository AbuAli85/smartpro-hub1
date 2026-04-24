import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const sql = readFileSync('/home/ubuntu/smartpro-hub/drizzle/0081_attendance_period_locks.sql', 'utf8');
// Split on semicolons, filter blanks and comment-only lines
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (e) {
    console.log('ERR:', e.message.slice(0, 120));
  }
}
await conn.end();
console.log('Migration 0081 complete');

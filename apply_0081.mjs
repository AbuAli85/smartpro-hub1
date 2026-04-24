import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const raw = readFileSync('/home/ubuntu/smartpro-hub/drizzle/0081_attendance_period_locks.sql', 'utf8');

// Remove single-line comments, then split on semicolons
const noComments = raw.replace(/--[^\n]*/g, '');
const statements = noComments
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Found ${statements.length} statements to execute`);

const conn = await createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.slice(0, 100).replace(/\s+/g, ' '));
  } catch (e) {
    console.log('ERR:', e.message.slice(0, 150));
  }
}
await conn.end();
console.log('Migration 0081 done');

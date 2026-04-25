import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const sql = readFileSync('./drizzle/0084_attendance_billing_candidates.sql', 'utf8');

// Strip comment lines and split on semicolons
const statements = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

for (const stmt of statements) {
  console.log('Executing:', stmt.substring(0, 80));
  await conn.execute(stmt);
}

await conn.end();
console.log('Migration 0084 applied successfully.');

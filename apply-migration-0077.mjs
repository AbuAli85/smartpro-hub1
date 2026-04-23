import { createPool } from 'mysql2/promise';

const pool = createPool(process.env.DATABASE_URL);
try {
  await pool.execute(
    "ALTER TABLE `payroll_runs` ADD COLUMN `attendance_preflight_snapshot` TEXT NULL AFTER `notes`"
  );
  console.log('Migration 0077 applied successfully');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') {
    console.log('Column already exists — skipping');
  } else {
    console.error('Migration failed:', e.message);
    process.exit(1);
  }
} finally {
  await pool.end();
}

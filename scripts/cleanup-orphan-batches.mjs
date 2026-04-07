/**
 * One-off cleanup: remove orphan import batches (IDs >= 10) that were left
 * by failed import runs, using SET FOREIGN_KEY_CHECKS = 0 to bypass FK constraints.
 */
import mysql from "mysql2/promise";
import { URL } from "url";

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1).split("?")[0],
  ssl: { rejectUnauthorized: false },
});

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.execute("SET FOREIGN_KEY_CHECKS = 0");

  // Null out dangling batch refs in all child tables
  const childTables = [
    "sanad_intel_centers",
    "sanad_intel_workforce_governorate",
    "sanad_intel_geography_stats",
    "sanad_intel_service_usage_year",
    "sanad_intel_governorate_year_metrics",
  ];
  for (const t of childTables) {
    const [r] = await conn.execute(
      `UPDATE ${t} SET import_batch_id = NULL WHERE import_batch_id IS NOT NULL`,
    );
    if (r.affectedRows > 0) console.log(`Nulled ${r.affectedRows} rows in ${t}`);
  }

  // Delete orphan batches (keep only the original 9 from the direct import)
  const [del] = await conn.execute(
    "DELETE FROM sanad_intel_import_batches WHERE id >= 10",
  );
  console.log("Deleted orphan batches:", del.affectedRows);

  await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
  await conn.commit();

  const [[{ cnt }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM sanad_intel_import_batches",
  );
  console.log("Remaining batches:", cnt);

  const [[{ ccnt }]] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM sanad_intel_centers",
  );
  console.log("Centers:", ccnt);
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  await pool.end();
}

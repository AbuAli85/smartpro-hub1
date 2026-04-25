import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  // Apply both columns in a single ALTER statement
  const stmt = `ALTER TABLE attendance_invoices
    ADD COLUMN html_artifact_key VARCHAR(500) NULL AFTER issued_by_user_id,
    ADD COLUMN html_artifact_url VARCHAR(1000) NULL AFTER html_artifact_key`;
  console.log("Executing migration 0086...");
  await conn.execute(stmt);
  console.log("✅ Migration 0086 applied successfully.");
} catch (err) {
  if (err.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  Columns already exist — migration already applied.");
  } else {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}

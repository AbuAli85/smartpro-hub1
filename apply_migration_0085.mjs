import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./drizzle/0085_attendance_invoices.sql", import.meta.url), "utf8");

// Remove single-line comments (-- ...) before splitting
const sql = raw.replace(/--[^\n]*/g, "");

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    console.log("Executing:", stmt.slice(0, 80) + "...");
    await conn.execute(stmt);
  }
  console.log("✅ Migration 0085 applied successfully.");
} catch (err) {
  if (err.code === "ER_TABLE_EXISTS_ERROR") {
    console.log("ℹ️  Table already exists — migration already applied.");
  } else {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}

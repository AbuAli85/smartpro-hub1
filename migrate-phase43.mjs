import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";
config();

const sql = readFileSync(new URL("./drizzle/0005_phase43_core_ops.sql", import.meta.url), "utf8");
const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("--"));

const conn = await createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("✓", stmt.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("⚠ already exists:", stmt.slice(0, 60));
    } else {
      console.error("✗", e.message, "\n", stmt.slice(0, 80));
    }
  }
}
await conn.end();
console.log("Migration complete.");

import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const sql = readFileSync(new URL("./drizzle/0004_hr_letters.sql", import.meta.url), "utf8");

const conn = await createConnection(process.env.DATABASE_URL);
try {
  for (const stmt of sql.split(";").map(s => s.trim()).filter(Boolean)) {
    await conn.execute(stmt);
    console.log("OK:", stmt.slice(0, 60));
  }
  console.log("✅ hr_letters migration complete");
} finally {
  await conn.end();
}

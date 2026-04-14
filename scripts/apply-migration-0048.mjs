import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
let sql = readFileSync(join(__dirname, "../drizzle/0048_attendance_operational_issues.sql"), "utf8");

// Remove comment lines
sql = sql.replace(/--[^\n]*/g, "").trim();

// Split on semicolons that are NOT inside parentheses
const statements = [];
let depth = 0;
let current = "";
for (const ch of sql) {
  if (ch === "(") depth++;
  else if (ch === ")") depth--;
  if (ch === ";" && depth === 0) {
    const s = current.trim();
    if (s) statements.push(s);
    current = "";
  } else {
    current += ch;
  }
}
if (current.trim()) statements.push(current.trim());

const conn = await createConnection(process.env.DATABASE_URL);

for (const stmt of statements) {
  console.log("Executing:", stmt.substring(0, 80).replace(/\n/g, " ") + "...");
  try {
    await conn.execute(stmt);
    console.log("  ✓ OK");
  } catch (err) {
    if (err.code === "ER_TABLE_EXISTS_ERROR" || err.message?.includes("already exists")) {
      console.log("  ⚠ Already exists, skipping");
    } else if (err.message?.includes("Duplicate column")) {
      console.log("  ⚠ Column already exists, skipping");
    } else {
      console.error("  ✗ Error:", err.message);
    }
  }
}

await conn.end();
console.log("Migration 0048 complete.");

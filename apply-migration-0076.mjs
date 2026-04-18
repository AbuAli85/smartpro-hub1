import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await createConnection(url);
try {
  await conn.execute("ALTER TABLE `sanad_intel_center_operations` MODIFY `invite_token` VARCHAR(96) NULL");
  console.log("Migration 0076_sanad_invite_token_width applied successfully.");
} catch (e) {
  if (e.code === "ER_DUP_KEYNAME" || (e.message && e.message.includes("Duplicate"))) {
    console.log("Migration 0076 already applied (column already widened).");
  } else {
    console.error("Migration failed:", e.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}

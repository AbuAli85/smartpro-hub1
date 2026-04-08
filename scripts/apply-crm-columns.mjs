import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(url);

const statements = [
  "ALTER TABLE `service_quotations` ADD COLUMN `crm_deal_id` INT NULL",
  "ALTER TABLE `service_quotations` ADD COLUMN `crm_contact_id` INT NULL",
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log(`✓ Applied: ${sql}`);
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log(`⚠ Column already exists (skipped): ${sql}`);
    } else {
      console.error(`✗ Failed: ${sql}\n  ${err.message}`);
    }
  }
}

await conn.end();
console.log("Migration complete.");

import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const conn = await createConnection(DATABASE_URL);
try {
  // Check if column already exists
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'roleRedirectSettings'`
  );
  if (rows.length > 0) {
    console.log("Column roleRedirectSettings already exists, skipping.");
  } else {
    await conn.execute(`ALTER TABLE companies ADD COLUMN roleRedirectSettings JSON DEFAULT NULL`);
    console.log("Added roleRedirectSettings column to companies table.");
  }
} finally {
  await conn.end();
}

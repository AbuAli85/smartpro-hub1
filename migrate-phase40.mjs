import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

const statements = [
  // Companies extended fields
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `crNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `occiNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `municipalityLicenceNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `laborCardNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `pasiNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `bankName` varchar(255)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `bankAccountNumber` varchar(100)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `bankIban` varchar(50)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `omanisationTarget` decimal(5,2)",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `foundedYear` int",
  "ALTER TABLE `companies` ADD COLUMN IF NOT EXISTS `description` text",
  // Employees extended fields
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `dateOfBirth` date",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `gender` enum('male','female')",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `maritalStatus` enum('single','married','divorced','widowed')",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `profession` varchar(150)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `visaNumber` varchar(50)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `visaExpiryDate` date",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `workPermitNumber` varchar(50)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `workPermitExpiryDate` date",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `pasiNumber` varchar(50)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `bankName` varchar(255)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `bankAccountNumber` varchar(100)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `emergencyContactName` varchar(255)",
  "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `emergencyContactPhone` varchar(32)",
];

async function run() {
  console.log("Running Phase 40 migration...");
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log("✓", stmt.substring(0, 60));
    } catch (err) {
      if (err.message?.includes("Duplicate column name")) {
        console.log("⏭ Already exists:", stmt.substring(0, 60));
      } else {
        console.error("✗", stmt.substring(0, 60), "\n  Error:", err.message);
      }
    }
  }
  console.log("Migration complete.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });

import { createConnection } from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
const conn = await createConnection(DATABASE_URL);

const migrations = [
  `ALTER TABLE attendance_sites 
   ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) NULL,
   ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) NULL,
   ADD COLUMN IF NOT EXISTS radius_meters INT NOT NULL DEFAULT 200,
   ADD COLUMN IF NOT EXISTS site_type VARCHAR(50) NOT NULL DEFAULT 'office',
   ADD COLUMN IF NOT EXISTS client_name VARCHAR(255) NULL,
   ADD COLUMN IF NOT EXISTS operating_hours_start VARCHAR(5) NULL,
   ADD COLUMN IF NOT EXISTS operating_hours_end VARCHAR(5) NULL,
   ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Muscat',
   ADD COLUMN IF NOT EXISTS enforce_geofence BOOLEAN NOT NULL DEFAULT FALSE,
   ADD COLUMN IF NOT EXISTS enforce_hours BOOLEAN NOT NULL DEFAULT FALSE`,
];

for (const sql of migrations) {
  try {
    await conn.execute(sql);
    console.log("✓ Migration applied");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("⚠ Column already exists, skipping");
    } else {
      throw e;
    }
  }
}

await conn.end();
console.log("✅ Enhanced attendance sites migration complete.");

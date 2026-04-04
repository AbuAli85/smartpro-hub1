/**
 * Fix remaining users table issues:
 * 1. Abu Ali (ID 695) has platformRole='client' - should be 'company_admin'
 *    (he owns 3 companies)
 * 2. Chairman (ID 31942) has company_member role='company_member'
 *    - Update to 'company_admin' since user said he is Chairman/admin
 * 3. Also update Chairman's users.role from 'user' to 'admin'
 */

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

console.log("=== SmartPRO Users Fix - Phase 2 ===\n");

// Fix Abu Ali platformRole
const [r1] = await conn.execute(
  "UPDATE users SET platformRole = 'company_admin' WHERE id = 695"
);
console.log(`Abu Ali (695) platformRole -> company_admin: ${r1.affectedRows} row(s)`);

// Fix Chairman company_member role to company_admin
const [r2] = await conn.execute(
  "UPDATE company_members SET role = 'company_admin' WHERE userId = 31942"
);
console.log(`Chairman company_member role -> company_admin: ${r2.affectedRows} row(s)`);

// Fix Chairman users.role to 'admin'
const [r3] = await conn.execute(
  "UPDATE users SET role = 'admin' WHERE id = 31942"
);
console.log(`Chairman users.role -> admin: ${r3.affectedRows} row(s)`);

// Final state
const [finalUsers] = await conn.execute(
  "SELECT id, name, email, role, platformRole, isActive FROM users ORDER BY id"
);
console.log("\n=== Final users table ===");
console.table(finalUsers);

const [finalCm] = await conn.execute(
  `SELECT cm.id, u.name, u.email, cm.role as memberRole, cm.isActive, c.name as company
   FROM company_members cm
   JOIN users u ON u.id = cm.userId
   JOIN companies c ON c.id = cm.companyId
   ORDER BY cm.id`
);
console.log("\n=== Final company_members ===");
console.table(finalCm);

await conn.end();
console.log("\n✓ Phase 2 fixes applied");

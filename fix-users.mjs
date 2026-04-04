/**
 * Fix users table issues:
 * 1. Duplicate Abu Ali (IDs 1 and 695, same email luxsess2001@gmail.com)
 *    - Keep ID 695 (newer, more recent activity)
 *    - Reassign all references from ID 1 to ID 695
 *    - Delete ID 1
 * 2. Chairman (ID 31942) has platformRole='client' but should be 'company_admin'
 *    since they are a company team member
 */

import mysql from "mysql2/promise";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

console.log("=== SmartPRO Users Table Fix ===\n");

// Step 1: Show current state
const [users] = await conn.execute("SELECT id, name, email, platformRole, role, lastSignedIn FROM users ORDER BY id");
console.log("Current users:");
console.table(users);

// Step 2: Check companyMembers for both Abu Ali IDs
const [cm1] = await conn.execute("SELECT * FROM company_members WHERE userId IN (1, 695)");
console.log("\ncompany_members for Abu Ali (IDs 1 & 695):");
console.table(cm1);

// Step 3: Check employees table for userId references
const [emp1] = await conn.execute("SELECT id, firstName, lastName, userId FROM employees WHERE userId IN (1, 695)");
console.log("\nemployees linked to Abu Ali:");
console.table(emp1);

// Step 4: Fix Chairman platformRole
console.log("\n--- Fixing Chairman (ID 31942) platformRole: client -> company_admin ---");
const [chairmanResult] = await conn.execute(
  "UPDATE users SET platformRole = 'company_admin' WHERE id = 31942 AND email = 'chairman@falconeyegroup.net'"
);
console.log(`Updated ${chairmanResult.affectedRows} row(s) for Chairman`);

// Step 5: Handle duplicate Abu Ali
// Check if ID 1 has any unique data we need to preserve
const [user1] = await conn.execute("SELECT * FROM users WHERE id = 1");
const [user695] = await conn.execute("SELECT * FROM users WHERE id = 695");
console.log("\nAbu Ali ID 1:", user1[0]);
console.log("Abu Ali ID 695:", user695[0]);

// Check if ID 1 has any company_members records that ID 695 doesn't
const [cm1Only] = await conn.execute(
  "SELECT cm.* FROM company_members cm WHERE cm.userId = 1 AND cm.companyId NOT IN (SELECT companyId FROM company_members WHERE userId = 695)"
);
console.log("\ncompany_members ONLY in ID 1 (not in 695):", cm1Only);

if (cm1Only.length > 0) {
  console.log("Reassigning company_members from ID 1 to ID 695...");
  for (const cm of cm1Only) {
    await conn.execute("UPDATE company_members SET userId = 695 WHERE id = ?", [cm.id]);
    console.log(`  Reassigned company_member ${cm.id} from user 1 to user 695`);
  }
}

// Reassign employees.userId from 1 to 695
const [empUpdate] = await conn.execute(
  "UPDATE employees SET userId = 695 WHERE userId = 1"
);
console.log(`\nReassigned ${empUpdate.affectedRows} employee(s) from userId=1 to userId=695`);

// Reassign audit_logs
const [auditUpdate] = await conn.execute(
  "UPDATE audit_logs SET userId = 695 WHERE userId = 1"
);
console.log(`Reassigned ${auditUpdate.affectedRows} audit_log(s) from userId=1 to userId=695`);

// Reassign notifications
const [notifUpdate] = await conn.execute(
  "UPDATE notifications SET userId = 695 WHERE userId = 1"
);
console.log(`Reassigned ${notifUpdate.affectedRows} notification(s) from userId=1 to userId=695`);

// Delete duplicate company_members for ID 1 (same company as 695)
const [cmDup] = await conn.execute(
  "SELECT cm.* FROM company_members cm WHERE cm.userId = 1"
);
console.log(`\nRemaining company_members for ID 1: ${cmDup.length}`);
if (cmDup.length > 0) {
  await conn.execute("DELETE FROM company_members WHERE userId = 1");
  console.log(`Deleted ${cmDup.length} duplicate company_member(s) for user ID 1`);
}

// Now delete user ID 1
const [deleteResult] = await conn.execute("DELETE FROM users WHERE id = 1");
console.log(`\nDeleted ${deleteResult.affectedRows} duplicate user (ID 1)`);

// Step 6: Show final state
const [finalUsers] = await conn.execute(
  "SELECT id, name, email, platformRole, role, isActive, lastSignedIn FROM users ORDER BY id"
);
console.log("\n=== Final users table state ===");
console.table(finalUsers);

const [finalCm] = await conn.execute(
  `SELECT cm.id, cm.userId, u.name, u.email, cm.role, cm.isActive, c.name as company
   FROM company_members cm
   JOIN users u ON u.id = cm.userId
   JOIN companies c ON c.id = cm.companyId
   ORDER BY cm.id`
);
console.log("\n=== Final company_members state ===");
console.table(finalCm);

await conn.end();
console.log("\n✓ All fixes applied successfully");

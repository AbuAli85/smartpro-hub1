/**
 * One-time / optional backfill: for active members with **empty** `permissions` JSON,
 * set permissions to the role default HR performance keys so the column reflects grants
 * (UI / exports). Does **not** modify rows that already have any custom permissions.
 *
 * Run: npx tsx server/hrPerformancePermissionsBackfill.ts
 * Requires DATABASE_URL.
 */
import { eq, and } from "drizzle-orm";
import { companyMembers } from "../drizzle/schema";
import { getDb } from "./db";
import { HR_PERFORMANCE_ROLE_DEFAULTS } from "../shared/hrPerformancePermissions";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("[backfill] Database unavailable");
    process.exit(1);
  }

  const rows = await db
    .select()
    .from(companyMembers)
    .where(eq(companyMembers.isActive, true));

  let updated = 0;
  for (const row of rows) {
    const json = Array.isArray(row.permissions) ? row.permissions : [];
    if (json.length > 0) continue;

    const defaults = HR_PERFORMANCE_ROLE_DEFAULTS[row.role] ?? [];
    if (defaults.length === 0) continue;

    await db
      .update(companyMembers)
      .set({ permissions: [...defaults] })
      .where(and(eq(companyMembers.id, row.id), eq(companyMembers.companyId, row.companyId)));
    updated++;
  }

  console.log(`[backfill] Updated ${updated} member(s) with empty permissions + non-empty role defaults.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

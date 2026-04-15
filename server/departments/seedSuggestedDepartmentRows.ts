import { eq, and } from "drizzle-orm";
import { departments } from "../../drizzle/schema";
import { SUGGESTED_DEPARTMENTS } from "../../shared/hrSuggestedDepartments";
import type { getDb } from "../db.client";

/** Inserts suggested departments; skips when English name already exists (case-insensitive). */
export async function seedSuggestedDepartmentRows(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
): Promise<{ created: number; skipped: number }> {
  const existingRows = await db
    .select({ name: departments.name })
    .from(departments)
    .where(and(eq(departments.companyId, companyId), eq(departments.isActive, true)));
  const existing = new Set(existingRows.map((r) => r.name.trim().toLowerCase()));
  let created = 0;
  let skipped = 0;
  for (const row of SUGGESTED_DEPARTMENTS) {
    const key = row.name.trim().toLowerCase();
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    await db.insert(departments).values({
      companyId,
      name: row.name.trim(),
      nameAr: row.nameAr?.trim() || undefined,
      description: row.description?.trim() || undefined,
    });
    existing.add(key);
    created++;
  }
  return { created, skipped };
}

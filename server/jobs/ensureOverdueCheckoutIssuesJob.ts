/**
 * Periodically ensures `overdue_checkout` operational issues exist for all active companies,
 * without requiring HR to open the attendance UI.
 */
import { eq } from "drizzle-orm";
import { companies } from "../../drizzle/schema";
import { getDb } from "../db";
import { computeAndEnsureOverdueCheckoutIssues } from "../overdueCheckoutIssues.service";

export type EnsureOverdueCheckoutIssuesJobResult = {
  companiesScanned: number;
  errors: number;
};

/**
 * Runs {@link computeAndEnsureOverdueCheckoutIssues} for each active company.
 * Idempotent: delegates duplicate prevention to `ensureOverdueCheckoutOperationalIssuesOpen`.
 */
export async function runEnsureOverdueCheckoutIssuesJob(): Promise<EnsureOverdueCheckoutIssuesJobResult> {
  const db = await getDb();
  if (!db) {
    console.warn("[overdue-checkout-job] Database unavailable — skipping.");
    return { companiesScanned: 0, errors: 0 };
  }

  const rows = await db.select({ id: companies.id }).from(companies).where(eq(companies.status, "active"));
  let errors = 0;
  for (const { id: companyId } of rows) {
    try {
      await computeAndEnsureOverdueCheckoutIssues(db, companyId);
    } catch (e) {
      errors++;
      console.error(
        JSON.stringify({
          level: "error",
          component: "overdue_checkout_job",
          companyId,
          message: String((e as { message?: string })?.message ?? e),
        }),
      );
    }
  }
  return { companiesScanned: rows.length, errors };
}

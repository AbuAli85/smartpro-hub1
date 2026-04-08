/**
 * Derives onboarding checklist completion from real tenant data — not only manual clicks.
 * Called from onboarding.getProgress so the guide stays aligned with company/user state.
 * Never overwrites steps the user explicitly skipped.
 */
import { and, count, eq, gt, isNull, notInArray } from "drizzle-orm";
import {
  users,
  companies,
  companyMembers,
  companyInvites,
  employees,
  contracts,
  proServices,
  marketplaceBookings,
  companySubscriptions,
  companyDocuments,
  userOnboardingProgress,
} from "../drizzle/schema";
import type { User } from "../drizzle/schema";

import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(s?.trim());
}

export async function syncOnboardingFromBusinessState(db: Db, user: User, companyId: number): Promise<void> {
  const [progressRows, freshUserRow, companyRow] = await Promise.all([
    db
      .select()
      .from(userOnboardingProgress)
      .where(and(eq(userOnboardingProgress.userId, user.id), eq(userOnboardingProgress.companyId, companyId))),
    db.select().from(users).where(eq(users.id, user.id)).limit(1),
    db.select().from(companies).where(eq(companies.id, companyId)).limit(1),
  ]);

  const progressByKey = new Map(progressRows.map((r) => [r.stepKey, r]));
  const u = freshUserRow[0];
  const c = companyRow[0];
  if (!u || !c) return;

  const now = new Date();

  const [memberCountRow] = await db
    .select({ c: count() })
    .from(companyMembers)
    .where(eq(companyMembers.companyId, companyId));

  const [empActiveRow] = await db
    .select({ c: count() })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

  const [contractCountRow] = await db
    .select({ c: count() })
    .from(contracts)
    .where(and(eq(contracts.companyId, companyId), notInArray(contracts.status, ["cancelled"])));

  const [proCountRow] = await db
    .select({ c: count() })
    .from(proServices)
    .where(and(eq(proServices.companyId, companyId), notInArray(proServices.status, ["cancelled"])));

  const [bookingCountRow] = await db
    .select({ c: count() })
    .from(marketplaceBookings)
    .where(eq(marketplaceBookings.companyId, companyId));

  const [pendingInviteRow] = await db
    .select({ c: count() })
    .from(companyInvites)
    .where(
      and(
        eq(companyInvites.companyId, companyId),
        isNull(companyInvites.acceptedAt),
        isNull(companyInvites.revokedAt),
        gt(companyInvites.expiresAt, now),
      ),
    );

  const [subActiveRow] = await db
    .select({ c: count() })
    .from(companySubscriptions)
    .where(
      and(
        eq(companySubscriptions.companyId, companyId),
        notInArray(companySubscriptions.status, ["cancelled", "expired"]),
      ),
    );

  const [vaultDocRow] = await db
    .select({ c: count() })
    .from(companyDocuments)
    .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.isDeleted, false)));

  const members = Number(memberCountRow?.c ?? 0);
  const emps = Number(empActiveRow?.c ?? 0);
  const ctr = Number(contractCountRow?.c ?? 0);
  const pro = Number(proCountRow?.c ?? 0);
  const bookings = Number(bookingCountRow?.c ?? 0);
  const invites = Number(pendingInviteRow?.c ?? 0);
  const subs = Number(subActiveRow?.c ?? 0);
  const docs = Number(vaultDocRow?.c ?? 0);

  const stepsToComplete = new Set<string>();

  const nameOk = nonEmpty(u.name);
  const phoneOk = nonEmpty(u.phone);
  const avatarOk = nonEmpty(u.avatarUrl);
  if (nameOk && (phoneOk || avatarOk)) {
    stepsToComplete.add("complete_profile");
  }

  const hasRegId =
    nonEmpty(c.crNumber) || nonEmpty(c.registrationNumber) || nonEmpty(c.pasiNumber) || nonEmpty(c.occiNumber);
  const hasCompanyContact = nonEmpty(c.phone) || nonEmpty(c.email) || nonEmpty(c.address);
  const hasIndustryLocation = nonEmpty(c.industry) && (nonEmpty(c.city) || nonEmpty(c.country));
  if (hasRegId && hasCompanyContact) {
    stepsToComplete.add("setup_company");
  } else if (hasIndustryLocation && (hasRegId || c.omanisationTarget != null)) {
    stepsToComplete.add("setup_company");
  }

  if (members >= 2 || invites >= 1) {
    stepsToComplete.add("invite_team");
  }

  const hasPlatformUsage = emps >= 1 || ctr >= 1 || pro >= 1 || bookings >= 1 || members >= 2;
  if (hasPlatformUsage) {
    stepsToComplete.add("explore_dashboard");
  }

  if (emps >= 1) {
    stepsToComplete.add("add_employee");
  }

  if (ctr >= 1) {
    stepsToComplete.add("create_contract");
  }

  if (pro >= 1) {
    stepsToComplete.add("submit_pro_service");
  }

  if ((emps >= 1 && docs >= 1) || c.omanisationTarget != null || emps >= 3) {
    stepsToComplete.add("check_compliance");
  }

  if (bookings >= 1) {
    stepsToComplete.add("explore_marketplace");
  }

  if (c.subscriptionPlanId != null || subs >= 1) {
    stepsToComplete.add("setup_subscription");
  }

  for (const stepKey of stepsToComplete) {
    const existing = progressByKey.get(stepKey);
    if (existing?.status === "skipped") continue;
    if (existing?.status === "completed") continue;

    await db
      .insert(userOnboardingProgress)
      .values({
        userId: user.id,
        companyId,
        stepKey,
        status: "completed",
        completedAt: new Date(),
        autoCompleted: true,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: "completed",
          completedAt: new Date(),
          autoCompleted: true,
        },
      });
  }
}

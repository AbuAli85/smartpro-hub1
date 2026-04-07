import { proBillingCycles, subscriptionInvoices } from "../drizzle/schema";
import { and, eq, gte, isNotNull, lt, sum } from "drizzle-orm";
import type { getDb } from "./db";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday 00:00 local time of the week containing `d`. */
export function startOfIsoWeekMonday(d: Date): Date {
  const sod = startOfLocalDay(d);
  const day = sod.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  sod.setDate(sod.getDate() + diff);
  return sod;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export type ExecutiveRevenueSnapshot = {
  basis: string;
  officerProPaid: { todayOmr: number; weekOmr: number; monthToDateOmr: number };
  platformSubscriptionPaid: { todayOmr: number; weekOmr: number; monthToDateOmr: number };
  combinedPaid: { todayOmr: number; weekOmr: number; monthToDateOmr: number };
};

/**
 * Cash-basis revenue from paid officer PRO billing cycles and paid SaaS subscription invoices.
 * Uses `paidAt` when present; excludes rows with no payment timestamp.
 */
export async function buildExecutiveRevenueSnapshot(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<ExecutiveRevenueSnapshot> {
  const todayStart = startOfLocalDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekStart = startOfIsoWeekMonday(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  async function sumProPaid(rangeStart: Date, rangeEndExclusive: Date): Promise<number> {
    const [row] = await db
      .select({ total: sum(proBillingCycles.amountOmr) })
      .from(proBillingCycles)
      .where(
        and(
          eq(proBillingCycles.companyId, companyId),
          eq(proBillingCycles.status, "paid"),
          isNotNull(proBillingCycles.paidAt),
          gte(proBillingCycles.paidAt, rangeStart),
          lt(proBillingCycles.paidAt, rangeEndExclusive),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async function sumSubPaid(rangeStart: Date, rangeEndExclusive: Date): Promise<number> {
    const [row] = await db
      .select({ total: sum(subscriptionInvoices.amount) })
      .from(subscriptionInvoices)
      .where(
        and(
          eq(subscriptionInvoices.companyId, companyId),
          eq(subscriptionInvoices.status, "paid"),
          isNotNull(subscriptionInvoices.paidAt),
          gte(subscriptionInvoices.paidAt, rangeStart),
          lt(subscriptionInvoices.paidAt, rangeEndExclusive),
        ),
      );
    return Number(row?.total ?? 0);
  }

  const [oDay, oWeek, oMtd] = await Promise.all([
    sumProPaid(todayStart, tomorrowStart),
    sumProPaid(weekStart, tomorrowStart),
    sumProPaid(monthStart, nextMonthStart),
  ]);

  const [sDay, sWeek, sMtd] = await Promise.all([
    sumSubPaid(todayStart, tomorrowStart),
    sumSubPaid(weekStart, tomorrowStart),
    sumSubPaid(monthStart, nextMonthStart),
  ]);

  const basis =
    "Cash-basis paid revenue: sum of PRO officer billing cycles and platform subscription invoices with status paid and a non-null paidAt. Excludes marketplace bookings (no invoice linkage), quotations, and CRM pipeline value.";

  return {
    basis,
    officerProPaid: {
      todayOmr: oDay,
      weekOmr: oWeek,
      monthToDateOmr: oMtd,
    },
    platformSubscriptionPaid: {
      todayOmr: sDay,
      weekOmr: sWeek,
      monthToDateOmr: sMtd,
    },
    combinedPaid: {
      todayOmr: oDay + sDay,
      weekOmr: oWeek + sWeek,
      monthToDateOmr: oMtd + sMtd,
    },
  };
}

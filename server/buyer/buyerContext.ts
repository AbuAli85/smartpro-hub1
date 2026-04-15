/**
 * Buyer Portal context — scoped by customer_account_id + membership, not by operating companyId alone.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { customerAccounts, customerAccountMembers } from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import { getDb } from "../db";

export type BuyerMemberRole = (typeof customerAccountMembers.$inferSelect)["role"];
export type BuyerMemberStatus = (typeof customerAccountMembers.$inferSelect)["status"];

export type BuyerMembershipRow = {
  membershipId: number;
  customerAccountId: number;
  userId: number;
  role: BuyerMemberRole;
  status: BuyerMemberStatus;
  providerCompanyId: number;
};

export type BuyerContext = {
  customerAccountId: number;
  providerCompanyId: number;
  role: BuyerMemberRole;
  membershipId: number;
};

/**
 * Loads membership for (userId, customerAccountId) with provider company id from customer_accounts.
 * Returns null if no row or join missing.
 */
export async function getUserCustomerMembership(
  userId: number,
  customerAccountId: number,
): Promise<BuyerMembershipRow | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      membershipId: customerAccountMembers.id,
      customerAccountId: customerAccountMembers.customerAccountId,
      userId: customerAccountMembers.userId,
      role: customerAccountMembers.role,
      status: customerAccountMembers.status,
      providerCompanyId: customerAccounts.providerCompanyId,
    })
    .from(customerAccountMembers)
    .innerJoin(customerAccounts, eq(customerAccounts.id, customerAccountMembers.customerAccountId))
    .where(
      and(
        eq(customerAccountMembers.userId, userId),
        eq(customerAccountMembers.customerAccountId, customerAccountId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    membershipId: row.membershipId,
    customerAccountId: row.customerAccountId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    providerCompanyId: row.providerCompanyId,
  };
}

/**
 * Enforces active buyer membership. Uses NOT_FOUND when no row to reduce account id enumeration.
 */
export async function requireCustomerAccountMembership(
  user: User | null,
  customerAccountId: number,
): Promise<BuyerMembershipRow> {
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  const row = await getUserCustomerMembership(user.id, customerAccountId);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Customer account not found" });
  }
  if (row.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Buyer membership is not active" });
  }
  return row;
}

/**
 * Resolves buyer context for procedures after membership is verified.
 */
export async function resolveBuyerContext(
  user: User | null,
  input: { customerAccountId: number },
): Promise<BuyerContext> {
  const row = await requireCustomerAccountMembership(user, input.customerAccountId);
  return {
    customerAccountId: row.customerAccountId,
    providerCompanyId: row.providerCompanyId,
    role: row.role,
    membershipId: row.membershipId,
  };
}

/** Foundation stub: all active roles may call getOverview; tighten per procedure later. */
export function buyerRoleMayAccessOverview(_role: BuyerMemberRole): boolean {
  return true;
}

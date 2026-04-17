import { TRPCError } from "@trpc/server";
import { SQL, and, desc, eq, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { companies, engagements } from "../../../drizzle/schema";
import { logEngagementActivity } from "../engagementsService";
import { syncEngagementDerivedState } from "./deriveEngagementState";

type Db = NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

export type OpsBucket =
  | "all"
  | "open"
  | "awaiting_team"
  | "awaiting_client"
  | "overdue"
  | "at_risk"
  | "no_owner"
  | "pending_replies"
  | "overdue_payments"
  | "pending_signatures"
  | "docs_pending_review";

function buildOpsWhere(input: { scope: "platform" | "tenant"; companyId?: number | null; bucket: OpsBucket }): SQL | undefined {
  const parts: SQL[] = [];
  if (input.scope === "tenant") {
    if (input.companyId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "companyId required" });
    parts.push(eq(engagements.companyId, input.companyId));
  } else if (input.companyId != null) {
    parts.push(eq(engagements.companyId, input.companyId));
  }

  switch (input.bucket) {
    case "all":
      parts.push(ne(engagements.status, "archived"));
      break;
    case "open":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      break;
    case "awaiting_team":
      parts.push(eq(engagements.status, "waiting_platform"));
      parts.push(ne(engagements.status, "archived"));
      break;
    case "awaiting_client":
      parts.push(eq(engagements.status, "waiting_client"));
      parts.push(ne(engagements.status, "archived"));
      break;
    case "overdue":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(isNotNull(engagements.slaDueAt));
      parts.push(lt(engagements.slaDueAt, new Date()));
      break;
    case "at_risk":
      parts.push(eq(engagements.health, "at_risk"));
      parts.push(ne(engagements.status, "archived"));
      break;
    case "no_owner":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(isNull(engagements.assignedOwnerUserId));
      break;
    case "pending_replies":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(eq(engagements.topActionType, "messages"));
      break;
    case "overdue_payments":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(
        or(eq(engagements.topActionType, "payment"), eq(engagements.topActionType, "payment_verify"))!,
      );
      break;
    case "pending_signatures":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(eq(engagements.topActionType, "signing"));
      break;
    case "docs_pending_review":
      parts.push(ne(engagements.status, "completed"));
      parts.push(ne(engagements.status, "archived"));
      parts.push(eq(engagements.topActionType, "documents"));
      break;
    default:
      parts.push(ne(engagements.status, "archived"));
  }

  return parts.length ? and(...parts) : undefined;
}

export async function listEngagementsForOps(
  db: Db,
  input: {
    scope: "platform" | "tenant";
    companyId?: number | null;
    bucket: OpsBucket;
    page: number;
    pageSize: number;
    resyncDerived?: boolean;
  },
): Promise<{ items: (typeof engagements.$inferSelect & { companyName: string | null })[]; total: number }> {
  const offset = (input.page - 1) * input.pageSize;
  const whereExpr = buildOpsWhere(input);

  const rows = await db
    .select({
      engagement: engagements,
      companyName: companies.name,
    })
    .from(engagements)
    .leftJoin(companies, eq(companies.id, engagements.companyId))
    .where(whereExpr)
    .orderBy(desc(engagements.escalatedAt), desc(engagements.opsPriority), desc(engagements.updatedAt))
    .limit(input.pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(engagements)
    .where(whereExpr);

  if (input.resyncDerived) {
    for (const r of rows) {
      await syncEngagementDerivedState(db, r.engagement.id, r.engagement.companyId);
    }
  }

  return {
    items: rows.map((r) => ({ ...r.engagement, companyName: r.companyName })),
    total: Number(countRow?.c ?? 0),
  };
}

export async function getEngagementsOpsSummary(
  db: Db,
  input: { scope: "platform" | "tenant"; companyId?: number | null },
): Promise<Record<OpsBucket, number>> {
  const keys: OpsBucket[] = [
    "all",
    "open",
    "awaiting_team",
    "awaiting_client",
    "overdue",
    "at_risk",
    "no_owner",
    "pending_replies",
    "overdue_payments",
    "pending_signatures",
    "docs_pending_review",
  ];
  const out = {} as Record<OpsBucket, number>;
  for (const k of keys) {
    const { total } = await listEngagementsForOps(db, {
      scope: input.scope,
      companyId: input.companyId,
      bucket: k,
      page: 1,
      pageSize: 1,
    });
    out[k] = total;
  }
  return out;
}

export async function assignEngagementOwner(
  db: Db,
  input: { engagementId: number; companyId: number; ownerUserId: number | null; actorUserId: number },
): Promise<void> {
  await db
    .update(engagements)
    .set({ assignedOwnerUserId: input.ownerUserId })
    .where(and(eq(engagements.id, input.engagementId), eq(engagements.companyId, input.companyId)));
  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "ops.owner_assigned",
    payload: { ownerUserId: input.ownerUserId },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

export async function setEngagementOpsPriority(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    priority: "normal" | "high" | "urgent";
    actorUserId: number;
  },
): Promise<void> {
  await db
    .update(engagements)
    .set({ opsPriority: input.priority })
    .where(and(eq(engagements.id, input.engagementId), eq(engagements.companyId, input.companyId)));
  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "ops.priority_set",
    payload: { priority: input.priority },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

export async function escalateEngagement(
  db: Db,
  input: { engagementId: number; companyId: number; actorUserId: number; note?: string | null },
): Promise<void> {
  await db
    .update(engagements)
    .set({ escalatedAt: new Date(), opsPriority: "urgent" })
    .where(and(eq(engagements.id, input.engagementId), eq(engagements.companyId, input.companyId)));
  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "ops.escalated",
    payload: { note: input.note ?? undefined },
  });
  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

export async function listMyEngagementQueue(
  db: Db,
  input: { userId: number; companyId?: number | null; scope: "platform" | "tenant"; page: number; pageSize: number },
): Promise<{ items: (typeof engagements.$inferSelect & { companyName: string | null })[]; total: number }> {
  const offset = (input.page - 1) * input.pageSize;
  const parts: SQL[] = [
    eq(engagements.assignedOwnerUserId, input.userId),
    ne(engagements.status, "completed"),
    ne(engagements.status, "archived"),
  ];
  if (input.scope === "tenant") {
    if (input.companyId == null) throw new TRPCError({ code: "BAD_REQUEST", message: "companyId required" });
    parts.push(eq(engagements.companyId, input.companyId));
  }
  const whereExpr = and(...parts);

  const rows = await db
    .select({
      engagement: engagements,
      companyName: companies.name,
    })
    .from(engagements)
    .leftJoin(companies, eq(companies.id, engagements.companyId))
    .where(whereExpr)
    .orderBy(desc(engagements.updatedAt))
    .limit(input.pageSize)
    .offset(offset);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(engagements)
    .where(whereExpr);

  return {
    items: rows.map((r) => ({ ...r.engagement, companyName: r.companyName })),
    total: Number(countRow?.c ?? 0),
  };
}

/**
 * Lightweight resolution follow-through: match open employee_tasks using a stable tag convention,
 * surface CRM contact owners, and flag accountability gaps — no new workflow tables.
 *
 * Tag format (include in task title or description when creating follow-ups):
 *   [RESOLUTION:crm:contact:<contactId>]
 *   [RESOLUTION:billing:cycle:<cycleId>]
 */

import { and, eq, inArray, like, or } from "drizzle-orm";
import { RESOLUTION_TASK_TAG } from "@shared/resolutionWorkflow";

export { RESOLUTION_TASK_TAG };
import type { getDb } from "./db";
import { crmContacts, employeeTasks, users } from "../drizzle/schema";
import type { AccountHealthTier } from "./accountHealth";
import type { CollectionsCycleRow, RankedAccountRow, RenewalReadinessRow } from "./ownerResolution";

type RenewalIn = Omit<RenewalReadinessRow, "workflow">;
type RankedIn = Omit<RankedAccountRow, "workflow">;
type CollectionsIn = Omit<CollectionsCycleRow, "workflow">;

export type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const RESOLUTION_WORKFLOW_BASIS = `Follow-through uses open HR tasks (pending / in progress / blocked) whose title or description contains a resolution tag. Add ${RESOLUTION_TASK_TAG.crmContact(0).replace(":0]", ":<contactId>]")} to link a task to a CRM contact, or ${RESOLUTION_TASK_TAG.billingCycle(0).replace(":0]", ":<cycleId>]")} for a billing cycle. CRM contact ownerId maps to a user when set. Use “Create follow-up” on the dashboard or CRM to prefill a task with the tag and recommended action.`;

export type AccountabilityGap = "none" | "missing_owner" | "missing_task" | "both";

export type ResolutionWorkflowTracking = {
  taskTagConvention: string;
  hasOpenEmployeeTask: boolean;
  matchingTaskIds: number[];
  tasksHref: string;
  /** Open Task Manager with server-backed prefill query params. */
  followUpCreateHref: string;
  accountableOwnerLabel: string | null;
  accountableOwnerId: number | null;
  accountabilityGap: AccountabilityGap;
  /** Suggested commercial follow-up before contract end (end − 7d) when renewal applies. */
  renewalInterventionDueAt: string | null;
  /** Any matching task past dueDate. */
  isTaskDueOverdue: boolean;
};

export type OpenResolutionTask = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
};

export async function loadOpenResolutionTaggedTasks(
  db: DbClient,
  companyId: number,
): Promise<OpenResolutionTask[]> {
  const rows = await db
    .select({
      id: employeeTasks.id,
      title: employeeTasks.title,
      description: employeeTasks.description,
      status: employeeTasks.status,
      dueDate: employeeTasks.dueDate,
    })
    .from(employeeTasks)
    .where(
      and(
        eq(employeeTasks.companyId, companyId),
        inArray(employeeTasks.status, ["pending", "in_progress", "blocked"]),
        or(like(employeeTasks.title, "%[RESOLUTION:%"), like(employeeTasks.description, "%[RESOLUTION:%")),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    dueDate: normalizeTaskDueDate(r.dueDate),
  }));
}

function normalizeTaskDueDate(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function tasksForContact(tasks: OpenResolutionTask[], contactId: number): OpenResolutionTask[] {
  const tag = RESOLUTION_TASK_TAG.crmContact(contactId);
  return tasks.filter((t) => t.title.includes(tag) || (t.description ?? "").includes(tag));
}

function tasksForBillingCycle(tasks: OpenResolutionTask[], cycleId: number): OpenResolutionTask[] {
  const tag = RESOLUTION_TASK_TAG.billingCycle(cycleId);
  return tasks.filter((t) => t.title.includes(tag) || (t.description ?? "").includes(tag));
}

function taskDueOverdue(tasks: OpenResolutionTask[]): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tasks.some((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    d.setHours(0, 0, 0, 0);
    return d < today;
  });
}

function renewalInterventionDate(nearestEndIso: string | null): string | null {
  if (!nearestEndIso) return null;
  const end = new Date(nearestEndIso + "T12:00:00");
  end.setDate(end.getDate() - 7);
  return end.toISOString().slice(0, 10);
}

function gapForContact(
  tier: string,
  hasOwner: boolean,
  hasTask: boolean,
  needsFollowThrough: boolean,
  renewalImminent: boolean,
): AccountabilityGap {
  if (!needsFollowThrough) return "none";
  const strong = tier === "urgent" || tier === "at_risk" || renewalImminent;
  const mo = !hasOwner && strong;
  const mt = !hasTask && strong;
  if (mo && mt) return "both";
  if (mo) return "missing_owner";
  if (mt) return "missing_task";
  return "none";
}

function daysUntilExpiryIso(nearestEndIso: string | null, now: Date): number | null {
  if (!nearestEndIso) return null;
  const d = new Date(nearestEndIso + "T12:00:00");
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

async function loadContactOwners(
  db: DbClient,
  companyId: number,
  contactIds: number[],
): Promise<Map<number, { ownerId: number | null; label: string }>> {
  const out = new Map<number, { ownerId: number | null; label: string }>();
  if (contactIds.length === 0) return out;

  const contacts = await db
    .select({ id: crmContacts.id, ownerId: crmContacts.ownerId })
    .from(crmContacts)
    .where(and(eq(crmContacts.companyId, companyId), inArray(crmContacts.id, contactIds)));

  const userIds = Array.from(
    new Set(contacts.map((c) => c.ownerId).filter((x): x is number => x != null)),
  );
  const userMap = new Map<number, string>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const u of userRows) userMap.set(u.id, u.name ?? "");
  }

  for (const c of contacts) {
    const label = c.ownerId != null ? (userMap.get(c.ownerId) ?? "") : "";
    out.set(c.id, { ownerId: c.ownerId, label });
  }
  return out;
}

function buildWorkflowForContactRow(
  contactId: number,
  tier: string,
  nearestExpiry: string | null,
  tasks: OpenResolutionTask[],
  ownerId: number | null,
  ownerLabel: string,
  needsFollowThrough: boolean,
  renewalImminent: boolean,
): ResolutionWorkflowTracking {
  const matched = tasksForContact(tasks, contactId);
  const hasTask = matched.length > 0;
  const hasOwner = ownerId != null && ownerLabel.length > 0;

  return {
    taskTagConvention: RESOLUTION_TASK_TAG.crmContact(contactId),
    hasOpenEmployeeTask: hasTask,
    matchingTaskIds: matched.map((m) => m.id),
    tasksHref: "/hr/tasks",
    followUpCreateHref: `/hr/tasks?resolution=crm&contactId=${contactId}`,
    accountableOwnerLabel: hasOwner ? ownerLabel : null,
    accountableOwnerId: ownerId,
    accountabilityGap: gapForContact(tier, hasOwner, hasTask, needsFollowThrough, renewalImminent),
    renewalInterventionDueAt: renewalInterventionDate(nearestExpiry),
    isTaskDueOverdue: taskDueOverdue(matched),
  };
}

function buildWorkflowForBillingRow(cycleId: number, tasks: OpenResolutionTask[]): ResolutionWorkflowTracking {
  const matched = tasksForBillingCycle(tasks, cycleId);
  return {
    taskTagConvention: RESOLUTION_TASK_TAG.billingCycle(cycleId),
    hasOpenEmployeeTask: matched.length > 0,
    matchingTaskIds: matched.map((m) => m.id),
    tasksHref: "/hr/tasks",
    followUpCreateHref: `/hr/tasks?resolution=billing&billingCycleId=${cycleId}`,
    accountableOwnerLabel: null,
    accountableOwnerId: null,
    accountabilityGap: matched.length === 0 ? "missing_task" : "none",
    renewalInterventionDueAt: null,
    isTaskDueOverdue: taskDueOverdue(matched),
  };
}

function contactNeedsFollowThrough(
  tier: string,
  nearestExpiry: string | null,
  now: Date,
): { needs: boolean; renewalImminent: boolean } {
  const days = daysUntilExpiryIso(nearestExpiry, now);
  const renewalImminent = days != null && days <= 14 && days >= 0;
  const needs = tier === "urgent" || tier === "at_risk" || renewalImminent;
  return { needs, renewalImminent };
}

export async function enrichOwnerResolutionWithWorkflow(
  db: DbClient,
  companyId: number,
  renewalReadiness: RenewalIn[],
  rankedAccountsForReview: RankedIn[],
  collectionsFollowUp: CollectionsIn[],
): Promise<{
  renewalReadiness: RenewalReadinessRow[];
  rankedAccountsForReview: RankedAccountRow[];
  collectionsFollowUp: CollectionsCycleRow[];
}> {
  const tasks = await loadOpenResolutionTaggedTasks(db, companyId);
  const now = new Date();

  const contactIds = Array.from(
    new Set([
      ...renewalReadiness.map((r) => r.contactId),
      ...rankedAccountsForReview.map((r) => r.contactId),
    ]),
  );
  const owners = await loadContactOwners(db, companyId, contactIds);
  const expiryByContact = new Map(renewalReadiness.map((x) => [x.contactId, x.nearestExpiryEndDate]));

  const enrichedRenewal = renewalReadiness.map((r) => {
    const o = owners.get(r.contactId);
    const renewalImminent = r.daysUntilEnd != null && r.daysUntilEnd <= 14 && r.daysUntilEnd >= 0;
    const needsFollowThrough = true;
    return {
      ...r,
      workflow: buildWorkflowForContactRow(
        r.contactId,
        r.tier,
        r.nearestExpiryEndDate,
        tasks,
        o?.ownerId ?? null,
        o?.label ?? "",
        needsFollowThrough,
        renewalImminent,
      ),
    };
  });

  const enrichedRanked = rankedAccountsForReview.map((r) => {
    const o = owners.get(r.contactId);
    const nearest = expiryByContact.get(r.contactId) ?? null;
    const { needs, renewalImminent } = contactNeedsFollowThrough(r.tier, nearest, now);
    return {
      ...r,
      workflow: buildWorkflowForContactRow(
        r.contactId,
        r.tier,
        nearest,
        tasks,
        o?.ownerId ?? null,
        o?.label ?? "",
        needs,
        renewalImminent,
      ),
    };
  });

  const enrichedCollections = collectionsFollowUp.map((c) => ({
    ...c,
    workflow: buildWorkflowForBillingRow(c.id, tasks),
  }));

  return {
    renewalReadiness: enrichedRenewal,
    rankedAccountsForReview: enrichedRanked,
    collectionsFollowUp: enrichedCollections,
  };
}

export async function getWorkflowTrackingForContact(
  db: DbClient,
  companyId: number,
  contactId: number,
  tier: AccountHealthTier,
  nearestExpiryEndDate: string | null,
): Promise<ResolutionWorkflowTracking> {
  const tasks = await loadOpenResolutionTaggedTasks(db, companyId);
  const owners = await loadContactOwners(db, companyId, [contactId]);
  const o = owners.get(contactId);
  const now = new Date();
  const { needs, renewalImminent } = contactNeedsFollowThrough(tier, nearestExpiryEndDate, now);
  return buildWorkflowForContactRow(
    contactId,
    tier,
    nearestExpiryEndDate,
    tasks,
    o?.ownerId ?? null,
    o?.label ?? "",
    needs,
    renewalImminent,
  );
}

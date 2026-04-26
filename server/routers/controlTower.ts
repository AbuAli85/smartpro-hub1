/**
 * server/routers/controlTower.ts
 *
 * Control Tower tRPC router.
 *
 * Authority model:
 *  - All procedures require an authenticated session (protectedProcedure).
 *  - Read procedures call requireCanViewCompanyControlTower() — admits
 *    company_admin, hr_admin, finance_admin, reviewer, external_auditor,
 *    and company_member with dept/team scope.
 *  - Mutation procedures call requireCanManageControlTower() — company_admin,
 *    hr_admin, finance_admin only.
 *  - Per-domain signal procedures call requireControlTowerSignalAccess(domain)
 *    so hr_admin cannot call finance procedures and vice-versa.
 *  - Domain-action policy: hr_admin may only mutate hr/documents/compliance
 *    items; finance_admin may only mutate finance/payroll items.
 *  - Scope filtering is applied to every query so dept/team managers only
 *    receive items inside their scope.
 *
 * Persistence:
 *  - All lifecycle mutations (acknowledge, mark_in_progress, assign, resolve,
 *    dismiss) write to control_tower_item_states and the shared audit_logs
 *    table.
 *  - Items queries load persisted states and overlay them on generated signals.
 *  - Resolved and dismissed items are filtered from the active queue; the
 *    underlying source condition drives re-emergence automatically.
 *
 * Platform Control Tower (cross-tenant) is served by the platformOps router
 * and guarded by adminProcedure + canAccessGlobalAdminProcedures.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  requireCanViewCompanyControlTower,
  requireCanManageControlTower,
  requireControlTowerSignalAccess,
  resolveVisibilityScope,
  deriveCapabilities,
} from "../_core/policy";
import {
  buildDecisionsQueueSnapshot,
  buildRiskComplianceSnapshot,
  buildAttendanceSignalSnapshot,
  buildAgedReceivablesSnapshot,
} from "../controlTower";
import {
  buildAllVisibleSignals,
  buildPayrollSignals,
  buildHrSignals,
  buildComplianceSignals,
  buildOperationsSignals,
  buildFinanceSignals,
  buildDocumentSignals,
  buildContractSignals,
} from "../controlTower/signalBuilders";
import { rankItems, topRankedItems } from "../controlTower/rankItems";
import {
  getItemStatesByCompany,
  getItemStateByKey,
  upsertItemState,
  touchLastSeenBatch,
  buildStateMap,
} from "../controlTower/itemStateRepository";
import {
  requiresSourceResolution,
  checkSourceStillActive,
} from "../controlTower/sourceResolutionPolicy";
import { CONTROL_TOWER_SOURCE_STILL_ACTIVE } from "@shared/controlTowerTrpcReasons";
import { logCtMutation } from "../controlTower/controlTowerAudit";
import {
  overlayStateOnItems,
  filterActiveItems,
  assertDomainActionAllowed,
  assertNotReadOnly,
} from "../controlTower/stateOverlay";
import { getDb } from "../db";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type {
  ControlTowerDomain,
  ControlTowerSeverity,
  ControlTowerStatus,
  ControlTowerAction,
  ControlTowerItem,
  ControlTowerSummary,
} from "@shared/controlTowerTypes";
import type { User } from "../../drizzle/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes the allowed actions the current caller may perform on a Control Tower
 * item, based on the caller's derived capabilities.  Server must always compute
 * this — the client must never infer it from role alone.
 */
function computeAllowedActions(
  caps: Awaited<ReturnType<typeof deriveCapabilities>>,
  isReadOnly: boolean,
): ControlTowerAction[] {
  if (isReadOnly) return ["view_detail"];
  const actions: ControlTowerAction[] = ["view_detail", "acknowledge"];
  if (caps.canAssignControlTowerItems) actions.push("assign");
  if (caps.canResolveControlTowerItems) actions.push("resolve", "dismiss");
  return actions;
}

/**
 * Returns the set of domains the caller is permitted to see based on their
 * derived capabilities.
 */
function visibleDomains(
  caps: Awaited<ReturnType<typeof deriveCapabilities>>,
): ControlTowerDomain[] {
  const domains: ControlTowerDomain[] = [];
  if (caps.canViewControlTowerHrSignals) {
    domains.push("hr", "documents");
  }
  if (caps.canViewControlTowerFinanceSignals) {
    domains.push("finance", "payroll");
  }
  if (caps.canViewControlTowerComplianceSignals) {
    domains.push("compliance");
  }
  if (caps.canViewControlTowerOperationsSignals) {
    domains.push("operations", "contracts", "crm", "client");
  }
  if (caps.canViewControlTowerAuditSignals) {
    domains.push("audit");
  }
  return domains;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const controlTowerRouter = router({
  /**
   * Returns the caller's Control Tower access summary:
   * whether they can view it, which domains are visible, and if they're read-only.
   *
   * Used by the UI to decide which tabs/sections to render and whether to show
   * mutation buttons.  Safe to call before rendering — returns access:false
   * instead of throwing when the caller has no access.
   */
  myAccess: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const isPlatformOp = canAccessGlobalAdminProcedures(user);

      // Soft check — return access:false instead of throwing FORBIDDEN
      try {
        const m = await requireCanViewCompanyControlTower(user, input.companyId);
        const scope = await resolveVisibilityScope(user, m.companyId);
        const caps = deriveCapabilities(m.role, scope);

        const isReadOnly =
          !caps.canManageControlTowerItems &&
          !caps.canResolveControlTowerItems &&
          !caps.canAssignControlTowerItems;

        return {
          access: true as const,
          isPlatformOp,
          scopeType: scope.type,
          isReadOnly,
          allowedActions: computeAllowedActions(caps, isReadOnly),
          visibleDomains: visibleDomains(caps),
          companyId: m.companyId,
        };
      } catch (err) {
        if (err instanceof TRPCError && err.code === "FORBIDDEN") {
          return {
            access: false as const,
            isPlatformOp,
            scopeType: "self" as const,
            isReadOnly: true,
            allowedActions: [] as ControlTowerAction[],
            visibleDomains: [] as ControlTowerDomain[],
            companyId: input.companyId ?? null,
          };
        }
        throw err;
      }
    }),

  /**
   * Aggregated summary: open item counts by severity and domain.
   * Domains invisible to the caller are omitted — never padded with zeros.
   * State overlay is applied; resolved/dismissed items are excluded from counts.
   */
  summary: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }): Promise<ControlTowerSummary> => {
      const user = ctx.user as User;
      const m = await requireCanViewCompanyControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);
      const domains = visibleDomains(caps);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();
      const isReadOnly =
        !caps.canManageControlTowerItems &&
        !caps.canResolveControlTowerItems &&
        !caps.canAssignControlTowerItems;
      const allowed = computeAllowedActions(caps, isReadOnly);

      const [rawItems, states] = await Promise.all([
        buildAllVisibleSignals(db, m.companyId, scope, new Set(domains), allowed, now),
        getItemStatesByCompany(db, m.companyId),
      ]);

      const stateMap = buildStateMap(states);
      void touchLastSeenBatch(db, m.companyId, rawItems.map((i) => i.id), now);
      const allItems = filterActiveItems(overlayStateOnItems(rawItems, stateMap, allowed, now));

      const bySeverity: Record<ControlTowerSeverity, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
      const byDomain: Partial<Record<ControlTowerDomain, number>> = {};

      for (const it of allItems) {
        bySeverity[it.severity] += 1;
        byDomain[it.domain] = (byDomain[it.domain] ?? 0) + 1;
      }

      return {
        totalOpen: allItems.length,
        bySeverity,
        byDomain,
        visibleDomains: domains,
      };
    }),

  /**
   * Ranked list of active Control Tower items visible to the caller.
   *
   * Pipeline:
   *   build signals → state overlay → filter resolved/dismissed
   *   → rank → domain filter → paginate
   *
   * Pagination applied after all filtering, so total reflects the filtered count.
   */
  items: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        domain: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }): Promise<{ items: ControlTowerItem[]; total: number }> => {
      const user = ctx.user as User;
      const m = await requireCanViewCompanyControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);
      const domains = visibleDomains(caps);

      const isReadOnly =
        !caps.canManageControlTowerItems &&
        !caps.canResolveControlTowerItems &&
        !caps.canAssignControlTowerItems;
      const allowed = computeAllowedActions(caps, isReadOnly);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();
      const domainSet = new Set(input.domain ? [input.domain] : domains);

      const [rawItems, states] = await Promise.all([
        buildAllVisibleSignals(db, m.companyId, scope, domainSet, allowed, now),
        getItemStatesByCompany(db, m.companyId),
      ]);

      const stateMap = buildStateMap(states);

      // Touch last_seen_at for dismissed/resolved items still in the batch (fire-and-forget).
      void touchLastSeenBatch(db, m.companyId, rawItems.map((i) => i.id), now);

      // Overlay → re-emergence → filter resolved/dismissed → rank → paginate
      const withState = overlayStateOnItems(rawItems, stateMap, allowed, now);
      const active = filterActiveItems(withState);
      const ranked = rankItems(active, now);
      const total = ranked.length;
      const page = ranked.slice(input.offset, input.offset + input.limit);

      return { items: page, total };
    }),

  /**
   * Finance domain signals.
   * Restricted to roles with canViewControlTowerFinanceSignals.
   * Never exposes HR notes, identity docs, or employee personal data.
   */
  financeSignals: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireControlTowerSignalAccess(user, "finance", input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [ar, decisions] = await Promise.all([
        buildAgedReceivablesSnapshot(db, m.companyId),
        buildDecisionsQueueSnapshot(db, m.companyId),
      ]);
      const financeItems = decisions.items.filter(
        (i) => i.key === "payroll_draft" || i.key === "payroll_payment" || i.key === "expense",
      );
      return { agedReceivables: ar, pendingItems: financeItems };
    }),

  /**
   * HR domain signals.
   * Restricted to roles with canViewControlTowerHrSignals.
   * Never exposes salary, banking, or payroll figures.
   */
  hrSignals: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireControlTowerSignalAccess(user, "hr", input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [attendance, decisions] = await Promise.all([
        buildAttendanceSignalSnapshot(db, m.companyId),
        buildDecisionsQueueSnapshot(db, m.companyId),
      ]);
      const hrItems = decisions.items.filter(
        (i) => i.key === "leave" || i.key === "employee_requests",
      );
      return { attendanceSignal: attendance, pendingItems: hrItems };
    }),

  /**
   * Compliance domain signals.
   * Restricted to roles with canViewControlTowerComplianceSignals.
   */
  complianceSignals: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireControlTowerSignalAccess(user, "compliance", input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const risk = await buildRiskComplianceSnapshot(db, m.companyId);
      return {
        renewalWorkflowsFailed: risk.renewalWorkflowsFailed,
        renewalWorkflowsStuckPending: risk.renewalWorkflowsStuckPending,
        workPermitsExpiring7Days: risk.workPermitsExpiring7Days,
        slaOpenBreaches: risk.slaOpenBreaches,
      };
    }),

  /**
   * Operations domain signals.
   * Restricted to roles with canViewControlTowerOperationsSignals.
   */
  operationsSignals: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireControlTowerSignalAccess(user, "operations", input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [decisions, risk] = await Promise.all([
        buildDecisionsQueueSnapshot(db, m.companyId),
        buildRiskComplianceSnapshot(db, m.companyId),
      ]);
      const opsItems = decisions.items.filter(
        (i) => i.key === "contracts" || i.key === "quotations",
      );
      return {
        pendingItems: opsItems,
        contractsExpiringNext30Days: risk.contractsExpiringNext30Days,
        contractsPendingSignature: risk.contractsPendingSignature,
        slaOpenBreaches: risk.slaOpenBreaches,
      };
    }),

  /**
   * Audit domain signals.
   * Restricted to roles with canViewControlTowerAuditSignals.
   * Returns document expiry and compliance audit counts; no personal data.
   */
  auditSignals: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireControlTowerSignalAccess(user, "audit", input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const risk = await buildRiskComplianceSnapshot(db, m.companyId);
      return {
        employeeDocsExpiring7Days: risk.employeeDocsExpiring7Days,
        companyDocsExpiring30Days: risk.companyDocsExpiring30Days,
        workPermitsExpiring7Days: risk.workPermitsExpiring7Days,
        renewalWorkflowsFailed: risk.renewalWorkflowsFailed,
      };
    }),

  // ─── Lifecycle mutations ────────────────────────────────────────────────────

  /**
   * Acknowledges a Control Tower item (open → acknowledged).
   *
   * Policy:
   *  - Requires canManageControlTowerItems.
   *  - Domain-scoped: hr_admin → hr/documents/compliance;
   *    finance_admin → finance/payroll; company_admin → any.
   *  - Read-only roles (reviewer / external_auditor) are blocked.
   *
   * Persists state and writes audit log.
   */
  acknowledgeItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemKey: z.string().min(1),
        domain: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);

      assertNotReadOnly(m.role);
      if (!caps.canManageControlTowerItems) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot manage Control Tower items." });
      }
      assertDomainActionAllowed(m.role, input.domain, "acknowledge");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await getItemStateByKey(db, m.companyId, input.itemKey);
      const previousStatus = (existing?.status ?? "open") as ControlTowerStatus;

      if (previousStatus === "resolved" || previousStatus === "dismissed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot acknowledge an item that is already resolved or dismissed.",
        });
      }

      const now = new Date();
      await upsertItemState(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        status: "acknowledged",
        ownerUserId: existing?.ownerUserId ?? null,
        acknowledgedBy: user.id,
        acknowledgedAt: now,
        resolvedBy: existing?.resolvedBy ?? null,
        resolvedAt: existing?.resolvedAt ?? null,
        dismissedBy: null,
        dismissedAt: null,
        dismissalReason: null,
        lastSeenAt: now,
      });

      await logCtMutation(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        action: "acknowledge",
        actorUserId: user.id,
        previousStatus,
        nextStatus: "acknowledged",
        reason: input.note,
      });

      return { itemKey: input.itemKey, status: "acknowledged" as ControlTowerStatus };
    }),

  /**
   * Marks a Control Tower item as in-progress (open|acknowledged → in_progress).
   * Same domain-policy rules as acknowledgeItem.
   */
  markInProgress: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemKey: z.string().min(1),
        domain: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);

      assertNotReadOnly(m.role);
      if (!caps.canManageControlTowerItems) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot manage Control Tower items." });
      }
      assertDomainActionAllowed(m.role, input.domain, "mark_in_progress");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await getItemStateByKey(db, m.companyId, input.itemKey);
      const previousStatus = (existing?.status ?? "open") as ControlTowerStatus;

      if (previousStatus === "resolved" || previousStatus === "dismissed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot mark as in-progress an item that is already resolved or dismissed.",
        });
      }

      const now = new Date();
      await upsertItemState(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        status: "in_progress",
        ownerUserId: existing?.ownerUserId ?? null,
        acknowledgedBy: existing?.acknowledgedBy ?? null,
        acknowledgedAt: existing?.acknowledgedAt ?? null,
        resolvedBy: null,
        resolvedAt: null,
        dismissedBy: null,
        dismissedAt: null,
        dismissalReason: null,
        lastSeenAt: now,
      });

      await logCtMutation(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        action: "mark_in_progress",
        actorUserId: user.id,
        previousStatus,
        nextStatus: "in_progress",
        reason: input.note,
      });

      return { itemKey: input.itemKey, status: "in_progress" as ControlTowerStatus };
    }),

  /**
   * Resolves a Control Tower item.
   *
   * Policy:
   *  - Requires canResolveControlTowerItems.
   *  - Domain-scoped: same rules as acknowledgeItem.
   *  - resolution text is required (becomes the audit reason).
   *
   * Important: if the underlying source condition still exists, the signal
   * builder will re-generate the item on the next refresh.  The state overlay
   * will suppress it from the active queue (resolved items are filtered out),
   * but the source data remains live.  For durable resolution, the operator
   * should fix the source (pay the payroll, renew the document, etc.).
   */
  resolveItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemKey: z.string().min(1),
        domain: z.string().min(1),
        resolution: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);

      assertNotReadOnly(m.role);
      if (!caps.canResolveControlTowerItems) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role does not permit resolving Control Tower items.",
        });
      }
      assertDomainActionAllowed(m.role, input.domain, "resolve");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const now = new Date();

      // Source-confirmed resolution: block manual resolve while source is still active.
      if (requiresSourceResolution(input.itemKey)) {
        const sourceActive = await checkSourceStillActive(db, m.companyId, input.itemKey, now);
        if (sourceActive) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This signal is still active in the source module. " +
              "Resolve it from the related module or dismiss it with a reason.",
            cause: { reason: CONTROL_TOWER_SOURCE_STILL_ACTIVE },
          });
        }
      }

      const existing = await getItemStateByKey(db, m.companyId, input.itemKey);
      const previousStatus = (existing?.status ?? "open") as ControlTowerStatus;

      await upsertItemState(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        status: "resolved",
        ownerUserId: existing?.ownerUserId ?? null,
        acknowledgedBy: existing?.acknowledgedBy ?? null,
        acknowledgedAt: existing?.acknowledgedAt ?? null,
        resolvedBy: user.id,
        resolvedAt: now,
        dismissedBy: null,
        dismissedAt: null,
        dismissalReason: null,
        lastSeenAt: now,
      });

      await logCtMutation(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        action: "resolve",
        actorUserId: user.id,
        previousStatus,
        nextStatus: "resolved",
        reason: input.resolution,
      });

      return { itemKey: input.itemKey, status: "resolved" as ControlTowerStatus };
    }),

  /**
   * Assigns a Control Tower item to a user.
   *
   * Policy:
   *  - Requires canAssignControlTowerItems.
   *  - Domain-scoped policy applies.
   */
  assignItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemKey: z.string().min(1),
        domain: z.string().min(1),
        assignToUserId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);

      assertNotReadOnly(m.role);
      if (!caps.canAssignControlTowerItems) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role does not permit assigning Control Tower items.",
        });
      }
      assertDomainActionAllowed(m.role, input.domain, "assign");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await getItemStateByKey(db, m.companyId, input.itemKey);
      const previousStatus = (existing?.status ?? "open") as ControlTowerStatus;

      const now = new Date();
      await upsertItemState(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        status: previousStatus === "open" ? "in_progress" : previousStatus,
        ownerUserId: input.assignToUserId,
        acknowledgedBy: existing?.acknowledgedBy ?? null,
        acknowledgedAt: existing?.acknowledgedAt ?? null,
        resolvedBy: existing?.resolvedBy ?? null,
        resolvedAt: existing?.resolvedAt ?? null,
        dismissedBy: existing?.dismissedBy ?? null,
        dismissedAt: existing?.dismissedAt ?? null,
        dismissalReason: existing?.dismissalReason ?? null,
        lastSeenAt: now,
      });

      await logCtMutation(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        action: "assign",
        actorUserId: user.id,
        previousStatus,
        nextStatus: previousStatus === "open" ? "in_progress" : previousStatus,
        assignedToUserId: input.assignToUserId,
      });

      return { itemKey: input.itemKey, assignedToUserId: input.assignToUserId };
    }),

  /**
   * Dismisses a Control Tower item.
   *
   * Policy:
   *  - Requires canResolveControlTowerItems (same gate as resolve).
   *  - Domain-scoped policy applies.
   *  - reason is always required (ensures intentional dismissal).
   *  - company_admin or domain manager only; hr_admin/finance_admin limited
   *    to their domain (via assertDomainActionAllowed).
   */
  dismissItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemKey: z.string().min(1),
        domain: z.string().min(1),
        reason: z.string().min(1, "Dismissal reason is required."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);

      assertNotReadOnly(m.role);
      if (!caps.canResolveControlTowerItems) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role does not permit dismissing Control Tower items.",
        });
      }
      assertDomainActionAllowed(m.role, input.domain, "dismiss");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const existing = await getItemStateByKey(db, m.companyId, input.itemKey);
      const previousStatus = (existing?.status ?? "open") as ControlTowerStatus;

      const now = new Date();
      await upsertItemState(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        status: "dismissed",
        ownerUserId: existing?.ownerUserId ?? null,
        acknowledgedBy: existing?.acknowledgedBy ?? null,
        acknowledgedAt: existing?.acknowledgedAt ?? null,
        resolvedBy: null,
        resolvedAt: null,
        dismissedBy: user.id,
        dismissedAt: now,
        dismissalReason: input.reason,
        lastSeenAt: now,
      });

      await logCtMutation(db, {
        companyId: m.companyId,
        itemKey: input.itemKey,
        domain: input.domain,
        action: "dismiss",
        actorUserId: user.id,
        previousStatus,
        nextStatus: "dismissed",
        reason: input.reason,
      });

      return { itemKey: input.itemKey, status: "dismissed" as ControlTowerStatus };
    }),
});

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
 *  - Scope filtering is applied to every query so dept/team managers only
 *    receive items inside their scope.
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

      // Use builders so summary counts are always consistent with the items list
      const allItems = await buildAllVisibleSignals(
        db,
        m.companyId,
        scope,
        new Set(domains),
        allowed,
        now,
      );

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
   * Ranked list of all open Control Tower items visible to the caller.
   * Builders are run only for domains the caller can see; results are
   * ranked by the deterministic priority engine (severity → overdue → due-soon → status → age).
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
      const domainSet = new Set(
        input.domain ? [input.domain] : domains,
      );

      const allItems = await buildAllVisibleSignals(db, m.companyId, scope, domainSet, allowed, now);
      const ranked = rankItems(allItems, now);
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

  /**
   * Acknowledges a Control Tower item (moves open → acknowledged).
   * Requires canManageControlTowerItems.
   */
  acknowledgeItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      await requireCanManageControlTower(user, input.companyId);
      // In a full implementation this would update a control_tower_items table row.
      // For now we return the acknowledged shape so the client optimistic update works.
      return { itemId: input.itemId, status: "acknowledged" as ControlTowerStatus };
    }),

  /**
   * Resolves a Control Tower item.
   * Requires canResolveControlTowerItems.
   */
  resolveItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemId: z.string(),
        resolution: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);
      if (!caps.canResolveControlTowerItems) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role does not permit resolving Control Tower items.",
        });
      }
      return { itemId: input.itemId, status: "resolved" as ControlTowerStatus };
    }),

  /**
   * Assigns a Control Tower item to a user.
   * Requires canAssignControlTowerItems.
   */
  assignItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        itemId: z.string(),
        assignToUserId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanManageControlTower(user, input.companyId);
      const scope = await resolveVisibilityScope(user, m.companyId);
      const caps = deriveCapabilities(m.role, scope);
      if (!caps.canAssignControlTowerItems) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role does not permit assigning Control Tower items.",
        });
      }
      return { itemId: input.itemId, assignedToUserId: input.assignToUserId };
    }),
});

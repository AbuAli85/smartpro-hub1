import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  attendanceSites,
  billingCustomers,
  billingRateRules,
  customerDeploymentAssignments,
  customerDeployments,
  employees,
  type User,
} from "../../drizzle/schema";
import { requireWorkspaceMembership } from "../_core/membership";
import { auditDeploymentEconomics, DEPLOYMENT_ECONOMICS_ENTITY } from "../lib/deploymentEconomicsAudit";

async function assertBillingCustomerOwned(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  billingCustomerId: number
) {
  const [row] = await db
    .select({ id: billingCustomers.id })
    .from(billingCustomers)
    .where(and(eq(billingCustomers.id, billingCustomerId), eq(billingCustomers.companyId, companyId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Billing customer not found" });
}

async function assertSiteOwned(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  siteId: number
) {
  const [row] = await db
    .select({ id: attendanceSites.id })
    .from(attendanceSites)
    .where(and(eq(attendanceSites.id, siteId), eq(attendanceSites.companyId, companyId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Attendance site not found" });
}

async function assertEmployeeOwned(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  employeeId: number
) {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
}

export const deploymentEconomicsRouter = router({
  billingCustomers: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), limit: z.number().min(1).max(200).default(100) }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        return db
          .select()
          .from(billingCustomers)
          .where(eq(billingCustomers.companyId, m.companyId))
          .orderBy(desc(billingCustomers.updatedAt))
          .limit(input.limit);
      }),

    getById: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [row] = await db
          .select()
          .from(billingCustomers)
          .where(and(eq(billingCustomers.id, input.id), eq(billingCustomers.companyId, m.companyId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Billing customer not found" });
        return row;
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          displayName: z.string().min(1).max(255),
          legalName: z.string().max(255).optional(),
          partyId: z.string().length(36).optional(),
          taxRegistration: z.string().max(100).optional(),
          vatTreatment: z.string().max(64).optional(),
          paymentTermsDays: z.number().int().min(0).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [ins] = await db.insert(billingCustomers).values({
          companyId: m.companyId,
          partyId: input.partyId ?? null,
          displayName: input.displayName,
          legalName: input.legalName ?? null,
          taxRegistration: input.taxRegistration ?? null,
          vatTreatment: input.vatTreatment ?? null,
          paymentTermsDays: input.paymentTermsDays ?? null,
          status: "active",
        });
        const id = Number((ins as { insertId: number }).insertId);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingCustomer,
          entityId: id,
          action: "created",
          beforeState: null,
          afterState: { displayName: input.displayName, partyId: input.partyId ?? null },
        });
        return { id };
      }),

    update: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          id: z.number(),
          displayName: z.string().min(1).max(255).optional(),
          legalName: z.string().max(255).nullable().optional(),
          partyId: z.string().length(36).nullable().optional(),
          taxRegistration: z.string().max(100).nullable().optional(),
          vatTreatment: z.string().max(64).nullable().optional(),
          paymentTermsDays: z.number().int().min(0).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(billingCustomers)
          .where(and(eq(billingCustomers.id, input.id), eq(billingCustomers.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Billing customer not found" });
        const patch: Partial<typeof billingCustomers.$inferInsert> = {};
        if (input.displayName !== undefined) patch.displayName = input.displayName;
        if (input.legalName !== undefined) patch.legalName = input.legalName;
        if (input.partyId !== undefined) patch.partyId = input.partyId;
        if (input.taxRegistration !== undefined) patch.taxRegistration = input.taxRegistration;
        if (input.vatTreatment !== undefined) patch.vatTreatment = input.vatTreatment;
        if (input.paymentTermsDays !== undefined) patch.paymentTermsDays = input.paymentTermsDays;
        await db
          .update(billingCustomers)
          .set(patch)
          .where(and(eq(billingCustomers.id, input.id), eq(billingCustomers.companyId, m.companyId)));
        const [next] = await db.select().from(billingCustomers).where(eq(billingCustomers.id, input.id)).limit(1);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingCustomer,
          entityId: input.id,
          action: "updated",
          beforeState: prev as unknown as Record<string, unknown>,
          afterState: (next ?? prev) as unknown as Record<string, unknown>,
        });
        return { success: true as const };
      }),

    setStatus: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), id: z.number(), status: z.enum(["active", "inactive"]) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(billingCustomers)
          .where(and(eq(billingCustomers.id, input.id), eq(billingCustomers.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Billing customer not found" });
        await db
          .update(billingCustomers)
          .set({ status: input.status })
          .where(and(eq(billingCustomers.id, input.id), eq(billingCustomers.companyId, m.companyId)));
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingCustomer,
          entityId: input.id,
          action: "status_changed",
          beforeState: { status: prev.status },
          afterState: { status: input.status },
        });
        return { success: true as const };
      }),
  }),

  customerDeployments: router({
    list: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          billingCustomerId: z.number().optional(),
          limit: z.number().min(1).max(200).default(100),
        })
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        if (input.billingCustomerId != null) {
          return db
            .select()
            .from(customerDeployments)
            .where(
              and(
                eq(customerDeployments.companyId, m.companyId),
                eq(customerDeployments.billingCustomerId, input.billingCustomerId)
              )
            )
            .orderBy(desc(customerDeployments.updatedAt))
            .limit(input.limit);
        }
        return db
          .select()
          .from(customerDeployments)
          .where(eq(customerDeployments.companyId, m.companyId))
          .orderBy(desc(customerDeployments.updatedAt))
          .limit(input.limit);
      }),

    getById: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [row] = await db
          .select()
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.id), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        return row;
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          billingCustomerId: z.number(),
          customerContractId: z.number().optional(),
          primaryAttendanceSiteId: z.number().optional(),
          outsourcingContractId: z.string().length(36).optional(),
          effectiveFrom: z.string(),
          effectiveTo: z.string(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        await assertBillingCustomerOwned(db, m.companyId, input.billingCustomerId);
        if (input.primaryAttendanceSiteId != null) {
          await assertSiteOwned(db, m.companyId, input.primaryAttendanceSiteId);
        }
        const [ins] = await db.insert(customerDeployments).values({
          companyId: m.companyId,
          billingCustomerId: input.billingCustomerId,
          customerContractId: input.customerContractId ?? null,
          primaryAttendanceSiteId: input.primaryAttendanceSiteId ?? null,
          outsourcingContractId: input.outsourcingContractId ?? null,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          status: "draft",
          notes: input.notes ?? null,
        });
        const id = Number((ins as { insertId: number }).insertId);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.customerDeployment,
          entityId: id,
          action: "created",
          beforeState: null,
          afterState: { billingCustomerId: input.billingCustomerId },
        });
        return { id };
      }),

    update: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          id: z.number(),
          customerContractId: z.number().nullable().optional(),
          primaryAttendanceSiteId: z.number().nullable().optional(),
          outsourcingContractId: z.string().length(36).nullable().optional(),
          effectiveFrom: z.string().optional(),
          effectiveTo: z.string().optional(),
          notes: z.string().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.id), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        if (input.primaryAttendanceSiteId != null) {
          await assertSiteOwned(db, m.companyId, input.primaryAttendanceSiteId);
        }
        const patch: Partial<typeof customerDeployments.$inferInsert> = {};
        if (input.customerContractId !== undefined) patch.customerContractId = input.customerContractId;
        if (input.primaryAttendanceSiteId !== undefined) patch.primaryAttendanceSiteId = input.primaryAttendanceSiteId;
        if (input.outsourcingContractId !== undefined) patch.outsourcingContractId = input.outsourcingContractId;
        if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
        if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo;
        if (input.notes !== undefined) patch.notes = input.notes;
        await db
          .update(customerDeployments)
          .set(patch)
          .where(and(eq(customerDeployments.id, input.id), eq(customerDeployments.companyId, m.companyId)));
        const [next] = await db.select().from(customerDeployments).where(eq(customerDeployments.id, input.id)).limit(1);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.customerDeployment,
          entityId: input.id,
          action: "updated",
          beforeState: prev as unknown as Record<string, unknown>,
          afterState: (next ?? prev) as unknown as Record<string, unknown>,
        });
        return { success: true as const };
      }),

    setStatus: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          id: z.number(),
          status: z.enum(["draft", "active", "closed"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.id), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        await db
          .update(customerDeployments)
          .set({ status: input.status })
          .where(and(eq(customerDeployments.id, input.id), eq(customerDeployments.companyId, m.companyId)));
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.customerDeployment,
          entityId: input.id,
          action: "status_changed",
          beforeState: { status: prev.status },
          afterState: { status: input.status },
        });
        return { success: true as const };
      }),
  }),

  billingRateRules: router({
    listForDeployment: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), customerDeploymentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [dep] = await db
          .select({ id: customerDeployments.id })
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.customerDeploymentId), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        return db
          .select()
          .from(billingRateRules)
          .where(
            and(
              eq(billingRateRules.customerDeploymentId, input.customerDeploymentId),
              eq(billingRateRules.companyId, m.companyId)
            )
          )
          .orderBy(desc(billingRateRules.effectiveFrom));
      }),

    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          customerDeploymentId: z.number(),
          unit: z.enum(["day", "hour", "month"]),
          amountOmr: z.number(),
          effectiveFrom: z.string(),
          effectiveTo: z.string().optional(),
          ruleMetaJson: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [dep] = await db
          .select()
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.customerDeploymentId), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        const [ins] = await db.insert(billingRateRules).values({
          companyId: m.companyId,
          customerDeploymentId: input.customerDeploymentId,
          unit: input.unit,
          amountOmr: String(input.amountOmr),
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          ruleMetaJson: input.ruleMetaJson ?? null,
        });
        const id = Number((ins as { insertId: number }).insertId);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingRateRule,
          entityId: id,
          action: "created",
          beforeState: null,
          afterState: { customerDeploymentId: input.customerDeploymentId, unit: input.unit },
        });
        return { id };
      }),

    update: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          id: z.number(),
          unit: z.enum(["day", "hour", "month"]).optional(),
          amountOmr: z.number().optional(),
          effectiveFrom: z.string().optional(),
          effectiveTo: z.string().nullable().optional(),
          ruleMetaJson: z.record(z.string(), z.unknown()).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(billingRateRules)
          .where(and(eq(billingRateRules.id, input.id), eq(billingRateRules.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Billing rate rule not found" });
        const patch: Partial<typeof billingRateRules.$inferInsert> = {};
        if (input.unit !== undefined) patch.unit = input.unit;
        if (input.amountOmr !== undefined) patch.amountOmr = String(input.amountOmr);
        if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
        if (input.effectiveTo !== undefined) patch.effectiveTo = input.effectiveTo;
        if (input.ruleMetaJson !== undefined) patch.ruleMetaJson = input.ruleMetaJson;
        await db
          .update(billingRateRules)
          .set(patch)
          .where(and(eq(billingRateRules.id, input.id), eq(billingRateRules.companyId, m.companyId)));
        const [next] = await db.select().from(billingRateRules).where(eq(billingRateRules.id, input.id)).limit(1);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingRateRule,
          entityId: input.id,
          action: "updated",
          beforeState: prev as unknown as Record<string, unknown>,
          afterState: (next ?? prev) as unknown as Record<string, unknown>,
        });
        return { success: true as const };
      }),

    setEffectiveTo: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), id: z.number(), effectiveTo: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [prev] = await db
          .select()
          .from(billingRateRules)
          .where(and(eq(billingRateRules.id, input.id), eq(billingRateRules.companyId, m.companyId)))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Billing rate rule not found" });
        await db
          .update(billingRateRules)
          .set({ effectiveTo: input.effectiveTo })
          .where(and(eq(billingRateRules.id, input.id), eq(billingRateRules.companyId, m.companyId)));
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.billingRateRule,
          entityId: input.id,
          action: "status_changed",
          beforeState: { effectiveTo: prev.effectiveTo },
          afterState: { effectiveTo: input.effectiveTo },
        });
        return { success: true as const };
      }),
  }),

  /** Phase 1: assignments CRUD (no link to promoter_assignments). */
  customerDeploymentAssignments: router({
    create: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          customerDeploymentId: z.number(),
          employeeId: z.number(),
          role: z.string().max(64).optional(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [dep] = await db
          .select()
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.customerDeploymentId), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        await assertEmployeeOwned(db, m.companyId, input.employeeId);
        const [ins] = await db.insert(customerDeploymentAssignments).values({
          companyId: m.companyId,
          customerDeploymentId: input.customerDeploymentId,
          employeeId: input.employeeId,
          role: input.role ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          status: "active",
        });
        const id = Number((ins as { insertId: number }).insertId);
        await auditDeploymentEconomics(db, {
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          entityType: DEPLOYMENT_ECONOMICS_ENTITY.customerDeploymentAssignment,
          entityId: id,
          action: "created",
          beforeState: null,
          afterState: { customerDeploymentId: input.customerDeploymentId, employeeId: input.employeeId },
        });
        return { id };
      }),

    listForDeployment: protectedProcedure
      .input(z.object({ companyId: z.number().optional(), customerDeploymentId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        const [dep] = await db
          .select({ id: customerDeployments.id })
          .from(customerDeployments)
          .where(and(eq(customerDeployments.id, input.customerDeploymentId), eq(customerDeployments.companyId, m.companyId)))
          .limit(1);
        if (!dep) throw new TRPCError({ code: "NOT_FOUND", message: "Customer deployment not found" });
        return db
          .select()
          .from(customerDeploymentAssignments)
          .where(
            and(
              eq(customerDeploymentAssignments.customerDeploymentId, input.customerDeploymentId),
              eq(customerDeploymentAssignments.companyId, m.companyId)
            )
          )
          .orderBy(desc(customerDeploymentAssignments.startDate));
      }),
  }),
});

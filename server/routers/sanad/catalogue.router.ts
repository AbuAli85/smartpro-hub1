import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { omitUndefined } from "@shared/objectUtils";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../../db";
import { sanadOffices, sanadServiceCatalogue } from "../../../drizzle/schema";
import { protectedProcedure } from "../../_core/trpc";
import { assertSanadOfficeAccess, assertSanadOfficeCatalogueAccess } from "../../sanadAccess";
import { getActiveCatalogueCountForOffice, requireListedOfficeRemainsDiscoverableOrThrow } from "./sanadCore";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function assertCatalogueChangeKeepsListedOfficeValid(
  db: Db,
  officeId: number,
  activeCatalogueCountAfter: number,
): Promise<void> {
  const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
  if (!office) return;
  await requireListedOfficeRemainsDiscoverableOrThrow(db, office, officeId, activeCatalogueCountAfter);
}

export const sanadCatalogueProcedures = {
  listServiceCatalogue: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.officeId, input.officeId))
        .orderBy(sanadServiceCatalogue.serviceType);
    }),

  upsertServiceCatalogue: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        officeId: z.number(),
        serviceType: z.string(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        priceOmr: z.number().min(0),
        processingDays: z.number().min(1).default(3),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, input.officeId);
      }
      if (input.id) {
        const [prev] = await db
          .select()
          .from(sanadServiceCatalogue)
          .where(eq(sanadServiceCatalogue.id, input.id))
          .limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
        const activeNow = await getActiveCatalogueCountForOffice(db, prev.officeId);
        const wasActive = prev.isActive === 1;
        const willBeActive = input.isActive;
        const activeAfter = activeNow - (wasActive ? 1 : 0) + (willBeActive ? 1 : 0);
        await assertCatalogueChangeKeepsListedOfficeValid(db, prev.officeId, activeAfter);
        await db
          .update(sanadServiceCatalogue)
          .set({
            serviceType: input.serviceType,
            serviceName: input.serviceName,
            serviceNameAr: input.serviceNameAr,
            priceOmr: String(input.priceOmr),
            processingDays: input.processingDays,
            description: input.description,
            descriptionAr: input.descriptionAr,
            isActive: input.isActive ? 1 : 0,
            updatedAt: new Date(),
          })
          .where(eq(sanadServiceCatalogue.id, input.id));
        return { id: input.id };
      }
      const activeNow = await getActiveCatalogueCountForOffice(db, input.officeId);
      const activeAfter = activeNow + (input.isActive ? 1 : 0);
      await assertCatalogueChangeKeepsListedOfficeValid(db, input.officeId, activeAfter);
      const [result] = await db.insert(sanadServiceCatalogue).values({
        officeId: input.officeId,
        serviceType: input.serviceType,
        serviceName: input.serviceName,
        serviceNameAr: input.serviceNameAr,
        priceOmr: String(input.priceOmr),
        processingDays: input.processingDays,
        description: input.description,
        descriptionAr: input.descriptionAr,
        isActive: input.isActive ? 1 : 0,
      });
      return { id: (result as any).insertId };
    }),

  deleteServiceItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      const activeNow = await getActiveCatalogueCountForOffice(db, row.officeId);
      const activeAfter = activeNow - (row.isActive === 1 ? 1 : 0);
      await assertCatalogueChangeKeepsListedOfficeValid(db, row.officeId, activeAfter);
      await db.delete(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  addCatalogueItem: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        serviceType: z.string(),
        priceOmr: z.string(),
        processingDays: z.number().default(3),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, input.officeId);
      }
      const [result] = await db.insert(sanadServiceCatalogue).values({
        officeId: input.officeId,
        serviceType: input.serviceType,
        serviceName: input.serviceName,
        serviceNameAr: input.serviceNameAr,
        priceOmr: input.priceOmr,
        processingDays: input.processingDays,
        description: input.description,
        descriptionAr: input.descriptionAr,
        isActive: 1,
      });
      return { id: (result as any).insertId };
    }),

  updateCatalogueItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        serviceName: z.string().min(1),
        serviceNameAr: z.string().optional(),
        serviceType: z.string(),
        priceOmr: z.string(),
        processingDays: z.number(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select({ officeId: sanadServiceCatalogue.officeId })
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      await db
        .update(sanadServiceCatalogue)
        .set(
          omitUndefined({
            serviceName: input.serviceName,
            serviceNameAr: input.serviceNameAr,
            serviceType: input.serviceType,
            priceOmr: input.priceOmr,
            processingDays: input.processingDays,
            description: input.description,
            descriptionAr: input.descriptionAr,
            updatedAt: new Date(),
          }) as never,
        )
        .where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  toggleCatalogueItem: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      const activeNow = await getActiveCatalogueCountForOffice(db, row.officeId);
      const wasActive = row.isActive === 1;
      const willBeActive = input.isActive;
      const activeAfter = activeNow - (wasActive ? 1 : 0) + (willBeActive ? 1 : 0);
      await assertCatalogueChangeKeepsListedOfficeValid(db, row.officeId, activeAfter);
      await db
        .update(sanadServiceCatalogue)
        .set({ isActive: input.isActive ? 1 : 0, updatedAt: new Date() })
        .where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  deleteCatalogueItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Catalogue item not found" });
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeCatalogueAccess(db as never, ctx.user.id, row.officeId);
      }
      const activeNow = await getActiveCatalogueCountForOffice(db, row.officeId);
      const activeAfter = activeNow - (row.isActive === 1 ? 1 : 0);
      await assertCatalogueChangeKeepsListedOfficeValid(db, row.officeId, activeAfter);
      await db.delete(sanadServiceCatalogue).where(eq(sanadServiceCatalogue.id, input.id));
      return { success: true };
    }),

  getServiceCatalogue: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      }
      return db
        .select()
        .from(sanadServiceCatalogue)
        .where(eq(sanadServiceCatalogue.officeId, input.officeId))
        .orderBy(sanadServiceCatalogue.serviceType);
    }),
};

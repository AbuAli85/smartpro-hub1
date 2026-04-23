import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  listSanadLifecycleBlockers,
  recommendedSanadPartnerNextActions,
  resolveSanadLifecycleStage,
  sanadLifecycleBadge,
  sanadPublicProfileCompleteness,
} from "@shared/sanadLifecycle";
import { computeSanadGoLiveReadiness, computeSanadMarketplaceReadiness } from "@shared/sanadMarketplaceReadiness";
import { omitUndefined } from "@shared/objectUtils";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../../db";
import { sanadIntelCenterOperations, sanadOffices, sanadServiceCatalogue } from "../../../drizzle/schema";
import { protectedProcedure } from "../../_core/trpc";
import { getCenterDetail } from "../../sanad-intelligence/queries";
import { assertSanadOfficeAccess, assertSanadOfficeProfileAccess, getSanadOfficesForUser } from "../../sanadAccess";
import {
  getActiveCatalogueCountForOffice,
  PROVIDER_TYPES,
  requireGoLiveOkForPublicListing,
  requireListedOfficeRemainsDiscoverableOrThrow,
} from "./sanadCore";

export const sanadWorkspaceProcedures = {
  /** Guided onboarding for the centre linked to the signed-in user (invite pipeline). */
  partnerOnboardingWorkspace: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [intelRow] = await db
      .select({ centerId: sanadIntelCenterOperations.centerId })
      .from(sanadIntelCenterOperations)
      .where(eq(sanadIntelCenterOperations.registeredUserId, ctx.user.id))
      .limit(1);
    if (!intelRow) return null;

    const detail = await getCenterDetail(db as never, intelRow.centerId);
    if (!detail) return null;

    const office =
      detail.ops?.linkedSanadOfficeId != null
        ? (
            await db
              .select()
              .from(sanadOffices)
              .where(eq(sanadOffices.id, detail.ops.linkedSanadOfficeId))
              .limit(1)
          )[0] ?? null
        : null;

    let activeCatalogueCount = 0;
    if (detail.ops?.linkedSanadOfficeId) {
      const [catRow] = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(sanadServiceCatalogue)
        .where(
          and(
            eq(sanadServiceCatalogue.officeId, detail.ops.linkedSanadOfficeId),
            eq(sanadServiceCatalogue.isActive, 1),
          ),
        );
      activeCatalogueCount = catRow?.n ?? 0;
    }

    const doneStatuses = new Set(["verified", "waived", "not_applicable"]);
    const complianceTotal = detail.compliance.length;
    const complianceDone = detail.compliance.filter((r) => doneStatuses.has(r.item.status)).length;

    const stage = resolveSanadLifecycleStage(detail.ops ?? {}, office, { activeCatalogueCount });
    const badge = sanadLifecycleBadge(stage);
    const blockers = listSanadLifecycleBlockers(stage, detail.ops, office, {
      activeCatalogueCount,
      complianceDone,
      complianceTotal,
    });
    const profileCompleteness = sanadPublicProfileCompleteness(office);
    const marketplaceReadiness = computeSanadMarketplaceReadiness(office, activeCatalogueCount);
    const recommendedNextActions = recommendedSanadPartnerNextActions(stage, blockers, marketplaceReadiness.reasons);

    return {
      centerId: detail.center.id,
      centerName: detail.center.centerName,
      governorateLabel: detail.center.governorateLabelRaw,
      wilayat: detail.center.wilayat,
      stage,
      badge,
      blockers,
      compliance: { done: complianceDone, total: complianceTotal },
      profileCompleteness,
      catalogueCompleteness: {
        activeCount: activeCatalogueCount,
        needsAtLeastOneActive: activeCatalogueCount < 1,
      },
      marketplaceReadiness,
      recommendedNextActions,
      contact: {
        inviteAcceptName: detail.ops?.inviteAcceptName,
        inviteAcceptPhone: detail.ops?.inviteAcceptPhone,
        inviteAcceptEmail: detail.ops?.inviteAcceptEmail,
      },
      office,
      ops: detail.ops,
    };
  }),

  /** Get the first Sanad office profile (for self-management by the current user) */
  getMyOfficeProfile: protectedProcedure
    .input(z.object({ officeId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      // AUTH FIRST: pure platform check before DB
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        // Non-platform: fetch from user's offices (no DB guard needed)
        const db = await getDb();
        if (!db) return null;
        const offices = await getSanadOfficesForUser(db as never, ctx.user.id);
        if (input?.officeId) {
          return offices.find((o) => o.id === input.officeId) ?? null;
        }
        return offices[0] ?? null;
      }
      // Platform admin path
      const db = await getDb();
      if (!db) return null;
      if (input?.officeId) {
        const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.officeId)).limit(1);
        return office ?? null;
      }
      const [office] = await db.select().from(sanadOffices).limit(1);
      return office ?? null;
    }),

  /** Create or update the Sanad office profile for the current user's company */
  upsertOfficeProfile: protectedProcedure
    .input(
      z.object({
        officeId: z.number().optional(),
        name: z.string().min(1),
        nameAr: z.string().optional(),
        providerType: z.enum(PROVIDER_TYPES).default("pro_office"),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        licenseNumber: z.string().optional(),
        city: z.string().optional(),
        governorate: z.string().optional(),
        location: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
        contactPerson: z.string().optional(),
        openingHours: z.string().optional(),
        languages: z.string().optional(),
        responseTimeHours: z.number().optional(),
        isPublicListed: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const officeId = input.officeId;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        if (!officeId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "officeId is required to update a SANAD office profile." });
        }
        await assertSanadOfficeProfileAccess(db as never, ctx.user.id, officeId);
      }
      let existing: (typeof sanadOffices.$inferSelect)[];
      if (officeId) {
        existing = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
      } else if (canAccessGlobalAdminProcedures(ctx.user)) {
        existing = await db.select().from(sanadOffices).limit(1);
      } else {
        existing = [];
      }
      const payload = omitUndefined({
        name: input.name,
        nameAr: input.nameAr,
        providerType: input.providerType,
        description: input.description,
        descriptionAr: input.descriptionAr,
        licenseNumber: input.licenseNumber,
        city: input.city,
        governorate: input.governorate,
        location: input.location,
        phone: input.phone,
        email: input.email,
        website: input.website,
        contactPerson: input.contactPerson,
        openingHours: input.openingHours,
        languages: input.languages,
        responseTimeHours: input.responseTimeHours,
        isPublicListed: input.isPublicListed,
        updatedAt: new Date(),
      }) as Record<string, unknown>;
      if (existing.length === 0 && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SANAD office not found for your account." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      }
      if (existing.length > 0) {
        const projected = { ...existing[0], ...payload } as typeof sanadOffices.$inferSelect;
        const activeN = await getActiveCatalogueCountForOffice(db, existing[0].id);
        if ("isPublicListed" in payload && payload.isPublicListed === 1) {
          await requireGoLiveOkForPublicListing(db as never, projected, existing[0].id);
        } else if (projected.isPublicListed === 1) {
          await requireListedOfficeRemainsDiscoverableOrThrow(db as never, projected, existing[0].id, activeN);
        }
        await db.update(sanadOffices).set(payload as never).where(eq(sanadOffices.id, existing[0].id));

        return { id: existing[0].id };
      }
      if ("isPublicListed" in payload && payload.isPublicListed === 1) {
        const projected = { ...payload, status: "active" as const } as typeof sanadOffices.$inferSelect;
        await requireGoLiveOkForPublicListing(db as never, projected, 0);
      }
      const [result] = await db.insert(sanadOffices).values({
        ...(payload as Partial<typeof sanadOffices.$inferInsert>),
        name: input.name,
        providerType: input.providerType,
        status: "active",
      } as typeof sanadOffices.$inferInsert);
      return { id: (result as any).insertId };
    }),

  /** Go-live / marketplace readiness for an office (owner/manager/staff). */
  officeGoLiveReadiness: protectedProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await assertSanadOfficeAccess(db as never, ctx.user.id, input.officeId);
      const [office] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, input.officeId)).limit(1);
      if (!office) return null;
      const [catRow] = await db
        .select({ n: count() })
        .from(sanadServiceCatalogue)
        .where(and(eq(sanadServiceCatalogue.officeId, input.officeId), eq(sanadServiceCatalogue.isActive, 1)));
      const activeN = Number(catRow?.n ?? 0);
      return {
        activeCatalogueCount: activeN,
        goLiveReadiness: computeSanadGoLiveReadiness(office, activeN),
        marketplaceAsListed: computeSanadMarketplaceReadiness(office, activeN),
        profileCompleteness: sanadPublicProfileCompleteness(office),
      };
    }),
};

import { TRPCError } from "@trpc/server";
import { and, desc, eq, exists, gte, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { escapeLike, omitUndefined } from "@shared/objectUtils";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../../db";
import { sanadApplications, sanadOffices, sanadServiceCatalogue } from "../../../drizzle/schema";
import { protectedProcedure, publicProcedure } from "../../_core/trpc";
import { assertSanadOfficeProfileAccess } from "../../sanadAccess";
import {
  getActiveCatalogueCountForOffice,
  PROVIDER_TYPES,
  requireGoLiveOkForPublicListing,
  requireListedOfficeRemainsDiscoverableOrThrow,
  SERVICE_TYPES,
} from "./sanadCore";

export const sanadMarketplaceProcedures = {
  listPublicProviders: publicProcedure
    .input(
      z
        .object({
          governorate: z.string().optional(),
          wilayat: z.string().optional(),
          providerType: z.enum(PROVIDER_TYPES).optional(),
          serviceType: z.enum(SERVICE_TYPES).optional(),
          language: z.string().optional(),
          minRating: z.number().min(0).max(5).optional(),
          search: z.string().optional(),
          publicListedOnly: z.boolean().optional().default(true),
          /** When true (default), only offices that pass shared marketplace readiness (profile + catalogue + contact + location). */
          marketplaceReadyOnly: z.boolean().optional().default(true),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conds = [eq(sanadOffices.status, "active")];
      const strictMarketplace = input?.marketplaceReadyOnly !== false;
      if (strictMarketplace || input?.publicListedOnly !== false) {
        conds.push(eq(sanadOffices.isPublicListed, 1));
      }
      if (strictMarketplace) {
        conds.push(sql`trim(coalesce(${sanadOffices.phone}, '')) <> ''`);
        conds.push(
          or(
            sql`trim(coalesce(${sanadOffices.governorate}, '')) <> ''`,
            sql`trim(coalesce(${sanadOffices.city}, '')) <> ''`,
          )!,
        );
        conds.push(sql`trim(coalesce(${sanadOffices.name}, '')) <> ''`);
        conds.push(
          exists(
            db
              .select({ id: sanadServiceCatalogue.id })
              .from(sanadServiceCatalogue)
              .where(
                and(
                  eq(sanadServiceCatalogue.officeId, sanadOffices.id),
                  eq(sanadServiceCatalogue.isActive, 1),
                ),
              ),
          ),
        );
      }
      if (input?.governorate?.trim()) {
        conds.push(eq(sanadOffices.governorate, input.governorate.trim()));
      }
      if (input?.wilayat?.trim()) {
        conds.push(eq(sanadOffices.city, input.wilayat.trim()));
      }
      if (input?.providerType) {
        conds.push(eq(sanadOffices.providerType, input.providerType));
      }
      if (input?.serviceType) {
        conds.push(sql`JSON_CONTAINS(${sanadOffices.services}, ${JSON.stringify(input.serviceType)}, '$')`);
      }
      if (input?.language?.trim()) {
        conds.push(like(sanadOffices.languages, `%${escapeLike(input.language.trim())}%`));
      }
      if (input?.minRating != null) {
        conds.push(gte(sanadOffices.avgRating, String(input.minRating)));
      }
      if (input?.search?.trim()) {
        const q = `%${escapeLike(input.search.trim())}%`;
        conds.push(
          or(
            like(sanadOffices.name, q),
            like(sanadOffices.nameAr, q),
            like(sanadOffices.city, q),
            like(sanadOffices.governorate, q),
            like(sanadOffices.description, q),
            like(sanadOffices.descriptionAr, q),
          )!,
        );
      }
      return db
        .select()
        .from(sanadOffices)
        .where(and(...conds))
        .orderBy(desc(sanadOffices.avgRating));
    }),

  getPublicProfile: publicProcedure
    .input(z.object({ officeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [office] = await db
        .select()
        .from(sanadOffices)
        .where(eq(sanadOffices.id, input.officeId))
        .limit(1);
      if (!office) return null;
      const catalogue = await db
        .select()
        .from(sanadServiceCatalogue)
        .where(and(eq(sanadServiceCatalogue.officeId, input.officeId), eq(sanadServiceCatalogue.isActive, 1)))
        .orderBy(sanadServiceCatalogue.serviceType);
      const reviews = await db
        .select()
        .from(sanadApplications)
        .where(and(eq(sanadApplications.providerId, input.officeId), sql`${sanadApplications.rating} IS NOT NULL`))
        .orderBy(desc(sanadApplications.createdAt))
        .limit(10);
      return { office, catalogue, reviews };
    }),

  updatePublicProfile: protectedProcedure
    .input(
      z.object({
        officeId: z.number(),
        isPublicListed: z.boolean().optional(),
        licenceNumber: z.string().optional(),
        licenceExpiry: z.string().optional(),
        languages: z.string().optional(),
        governorate: z.string().optional(),
        logoUrl: z.string().optional(),
        descriptionAr: z.string().optional(),
        responseTimeHours: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { officeId, ...fields } = input;
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await assertSanadOfficeProfileAccess(db as never, ctx.user.id, officeId);
      }
      const [current] = await db.select().from(sanadOffices).where(eq(sanadOffices.id, officeId)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Office not found" });

      const nextIsPublicListed =
        fields.isPublicListed !== undefined ? (fields.isPublicListed ? 1 : 0) : current.isPublicListed;

      const merged: typeof sanadOffices.$inferSelect = {
        ...current,
        isPublicListed: nextIsPublicListed,
        licenceNumber: fields.licenceNumber !== undefined ? fields.licenceNumber : current.licenceNumber,
        licenceExpiry:
          fields.licenceExpiry !== undefined
            ? fields.licenceExpiry
              ? new Date(fields.licenceExpiry)
              : null
            : current.licenceExpiry,
        languages: fields.languages !== undefined ? fields.languages : current.languages,
        governorate: fields.governorate !== undefined ? fields.governorate : current.governorate,
        logoUrl: fields.logoUrl !== undefined ? fields.logoUrl : current.logoUrl,
        descriptionAr: fields.descriptionAr !== undefined ? fields.descriptionAr : current.descriptionAr,
        responseTimeHours:
          fields.responseTimeHours !== undefined ? fields.responseTimeHours : current.responseTimeHours,
      };

      const activeN = await getActiveCatalogueCountForOffice(db, officeId);
      if (fields.isPublicListed === true) {
        await requireGoLiveOkForPublicListing(db as never, merged, officeId);
      } else if (nextIsPublicListed === 1) {
        await requireListedOfficeRemainsDiscoverableOrThrow(db as never, merged, officeId, activeN);
      }

      await db
        .update(sanadOffices)
        .set(
          omitUndefined({
            isPublicListed: fields.isPublicListed !== undefined ? (fields.isPublicListed ? 1 : 0) : undefined,
            licenceNumber: fields.licenceNumber,
            licenceExpiry:
              fields.licenceExpiry !== undefined
                ? fields.licenceExpiry
                  ? new Date(fields.licenceExpiry)
                  : null
                : undefined,
            languages: fields.languages,
            governorate: fields.governorate,
            logoUrl: fields.logoUrl,
            descriptionAr: fields.descriptionAr,
            responseTimeHours: fields.responseTimeHours,
            updatedAt: new Date(),
          }) as never,
        )
        .where(eq(sanadOffices.id, officeId));
      return { success: true };
    }),
};

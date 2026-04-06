import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getActiveCompanyMembership,
  requireNotAuditor,
} from "../_core/membership";
import { isGoogleDocsServiceAccountConfigured } from "../_core/env";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  DocumentGenerationError,
} from "../modules/document-generation/documentGeneration.types";
import {
  canGenerateDocuments,
  generateDocument,
} from "../modules/document-generation/documentGeneration.service";

function mapDocGenError(e: unknown): never {
  if (e instanceof DocumentGenerationError) {
    const codeMap: Record<DocumentGenerationError["code"], TRPCError["code"]> = {
      UNAUTHORIZED: "UNAUTHORIZED",
      FORBIDDEN: "FORBIDDEN",
      VALIDATION_ERROR: "BAD_REQUEST",
      NOT_FOUND: "NOT_FOUND",
      NOT_CONFIGURED: "PRECONDITION_FAILED",
      INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
    };
    throw new TRPCError({
      code: codeMap[e.code],
      message: e.message,
      cause: e,
    });
  }
  throw e;
}

export const documentGenerationRouter = router({
  /**
   * Whether PDF generation can run on this deployment (Google service account env set).
   * Does not call Google; safe to poll from the UI to disable buttons.
   */
  readiness: protectedProcedure.query(() => ({
    googleDocsConfigured: isGoogleDocsServiceAccountConfigured(),
  })),

  generate: protectedProcedure
    .input(
      z.object({
        templateKey: z.string().min(1),
        entityId: z.string().uuid(),
        outputFormat: z.enum(["pdf"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const membership = await getActiveCompanyMembership(ctx.user.id, companyId);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      }
      requireNotAuditor(membership.role);
      if (!canGenerateDocuments(membership.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to generate documents.",
        });
      }

      try {
        return await generateDocument({
          templateKey: input.templateKey,
          entityId: input.entityId,
          outputFormat: input.outputFormat,
          actorUserId: ctx.user.id,
          user: ctx.user,
          activeCompanyId: companyId,
          membershipRole: membership.role,
        });
      } catch (e) {
        mapDocGenError(e);
      }
    }),
});

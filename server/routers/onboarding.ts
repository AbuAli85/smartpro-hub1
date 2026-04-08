import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { onboardingSteps, userOnboardingProgress } from "../../drizzle/schema";
import { requireActiveCompanyId } from "../_core/tenant";

export const onboardingRouter = router({
  /** Get all steps with the current user's progress merged in. */
  getProgress: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();

      // Fetch all canonical steps ordered by sortOrder
      const steps = await db.select().from(onboardingSteps).orderBy(onboardingSteps.sortOrder);

      // Fetch this user's progress for this company
      const progress = await db
        .select()
        .from(userOnboardingProgress)
        .where(
          and(
            eq(userOnboardingProgress.userId, ctx.user.id),
            eq(userOnboardingProgress.companyId, companyId),
          ),
        );

      const progressMap = new Map(progress.map((p) => [p.stepKey, p]));

      const merged = steps.map((step) => {
        const p = progressMap.get(step.stepKey);
        return {
          ...step,
          status: (p?.status ?? "pending") as "pending" | "completed" | "skipped",
          completedAt: p?.completedAt ?? null,
          skippedAt: p?.skippedAt ?? null,
          autoCompleted: p?.autoCompleted ?? false,
        };
      });

      const total = merged.length;
      const completed = merged.filter((s) => s.status === "completed").length;
      const skipped = merged.filter((s) => s.status === "skipped").length;
      const requiredTotal = merged.filter((s) => s.isRequired).length;
      const requiredCompleted = merged.filter(
        (s) => s.isRequired && s.status === "completed",
      ).length;
      const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
      const isComplete = requiredCompleted >= requiredTotal;

      return {
        steps: merged,
        summary: {
          total,
          completed,
          skipped,
          pending: total - completed - skipped,
          requiredTotal,
          requiredCompleted,
          percentComplete,
          isComplete,
        },
      };
    }),

  /** Mark a step as completed. */
  completeStep: protectedProcedure
    .input(
      z.object({
        stepKey: z.string(),
        companyId: z.number().optional(),
        autoCompleted: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();

      await db
        .insert(userOnboardingProgress)
        .values({
          userId: ctx.user.id,
          companyId,
          stepKey: input.stepKey,
          status: "completed",
          completedAt: new Date(),
          autoCompleted: input.autoCompleted,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "completed",
            completedAt: new Date(),
            autoCompleted: input.autoCompleted,
          },
        });

      return { success: true };
    }),

  /** Mark a step as skipped. */
  skipStep: protectedProcedure
    .input(
      z.object({
        stepKey: z.string(),
        companyId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();

      await db
        .insert(userOnboardingProgress)
        .values({
          userId: ctx.user.id,
          companyId,
          stepKey: input.stepKey,
          status: "skipped",
          skippedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            status: "skipped",
            skippedAt: new Date(),
          },
        });

      return { success: true };
    }),

  /** Reset all onboarding progress for the current user in this company. */
  resetProgress: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();

      await db
        .delete(userOnboardingProgress)
        .where(
          and(
            eq(userOnboardingProgress.userId, ctx.user.id),
            eq(userOnboardingProgress.companyId, companyId),
          ),
        );

      return { success: true };
    }),
});

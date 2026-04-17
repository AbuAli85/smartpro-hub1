import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { engagements } from "../../../drizzle/schema";
import type { User } from "../../../drizzle/schema";
import {
  findTransition,
  mapEngagementTypeToCategory,
  resolveWorkflowActor,
  type EngagementStatusKey,
} from "../../../shared/engagementWorkflow";
import { assertEngagementInCompany, logEngagementActivity } from "../engagementsService";
import { syncEngagementDerivedState } from "./deriveEngagementState";

type Db = NonNullable<Awaited<ReturnType<typeof import("../../db").getDb>>>;

function stageLabelForStatus(status: EngagementStatusKey): string | null {
  switch (status) {
    case "waiting_client":
      return "Awaiting client";
    case "waiting_platform":
      return "Awaiting SmartPRO / tenant team";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
    case "draft":
      return "Draft";
    default:
      return "In progress";
  }
}

async function runWorkflowOnEnter(
  db: Db,
  input: { engagementId: number; companyId: number; to: EngagementStatusKey; actorUserId: number },
): Promise<void> {
  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "workflow.entered_status",
    payload: { status: input.to },
  });
}

export async function applyEngagementWorkflowTransition(
  db: Db,
  input: {
    engagementId: number;
    companyId: number;
    to: EngagementStatusKey;
    actorUserId: number;
    memberRole: string | null | undefined;
    user: User;
    reason?: string | null;
  },
): Promise<void> {
  const eng = await assertEngagementInCompany(db, input.engagementId, input.companyId);
  const from = eng.status as EngagementStatusKey;
  if (from === input.to) return;

  const category = mapEngagementTypeToCategory(eng.engagementType);
  const actor = resolveWorkflowActor({
    isPlatformStaff: seesPlatformOperatorNav(input.user),
    memberRole: input.memberRole,
  });
  const edge = findTransition(category, from, input.to);
  if (!edge) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Transition from "${from}" to "${input.to}" is not allowed for this engagement type.`,
    });
  }
  if (!edge.actors.includes(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role cannot apply this status transition." });
  }

  const workflowStage = stageLabelForStatus(input.to);

  await db
    .update(engagements)
    .set({
      status: input.to,
      workflowStage,
    })
    .where(and(eq(engagements.id, input.engagementId), eq(engagements.companyId, input.companyId)));

  await runWorkflowOnEnter(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    to: input.to,
    actorUserId: input.actorUserId,
  });

  await logEngagementActivity(db, {
    engagementId: input.engagementId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    action: "workflow.transition",
    payload: {
      from,
      to: input.to,
      transitionId: edge.id,
      actor,
      reason: input.reason ?? undefined,
    },
  });

  await syncEngagementDerivedState(db, input.engagementId, input.companyId);
}

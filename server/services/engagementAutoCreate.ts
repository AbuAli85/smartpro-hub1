import type { CreateFromSourceInput } from "./engagementsService";
import { createEngagementFromSource } from "./engagementsService";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

/** Best-effort engagement backfill — never fails the primary transaction caller. */
export async function tryCreateEngagementFromSource(
  db: Db,
  companyId: number,
  actorUserId: number,
  input: CreateFromSourceInput,
): Promise<void> {
  try {
    await createEngagementFromSource(db, companyId, actorUserId, input);
  } catch (err) {
    console.warn("[engagementAutoCreate] skipped", { companyId, input, err });
  }
}

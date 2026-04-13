import { canAccessSanadIntelFull } from "./sanadRoles";

/** Only platform Sanad operators may reassign pipeline ownership or change lifecycle stage arbitrarily. */
export function canAssignSanadPipelineOwner(user: {
  id?: number | null;
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  return canAccessSanadIntelFull(user);
}

/** Read pipeline row: full admin, or the assigned owner. */
export function canWriteSanadCentrePipeline(
  user: { id?: number | null; role?: string | null; platformRole?: string | null },
  pipeline: { ownerUserId: number | null } | null | undefined,
): boolean {
  if (canAccessSanadIntelFull(user)) return true;
  const uid = user.id;
  if (uid == null || pipeline?.ownerUserId == null) return false;
  return pipeline.ownerUserId === uid;
}

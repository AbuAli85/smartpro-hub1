/**
 * Server-side SANAD lifecycle transition rules (invite → link → activate → public).
 * Use together with DB reads so helpers stay aligned with persisted state.
 */

import { computeSanadGoLiveReadiness, type SanadMarketplaceReadiness } from "./sanadMarketplaceReadiness";
import type { SanadLifecycleOfficeInput, SanadLifecycleOpsInput } from "./sanadLifecycle";

export type SanadTransitionResult =
  | { ok: true }
  | { ok: false; code: "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "PRECONDITION_FAILED"; message: string };

function bad(message: string): SanadTransitionResult {
  return { ok: false, code: "BAD_REQUEST", message };
}

function precondition(message: string): SanadTransitionResult {
  return { ok: false, code: "PRECONDITION_FAILED", message };
}

/** Issue / rotate open invite — must not bypass terminal states. */
export function validateGenerateCenterInvite(ops: SanadLifecycleOpsInput | null | undefined): SanadTransitionResult {
  const o = ops ?? {};
  if (o.linkedSanadOfficeId != null) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message:
        "Cannot issue an invite while this centre has a linked SANAD office. Unlink in operations tooling first if onboarding must be reset.",
    };
  }
  return { ok: true };
}

/** Capture lead on invite page — token path already validates expiry and channel. */
export function validateAcceptCenterInvite(
  ops: SanadLifecycleOpsInput | null | undefined,
  alreadyLinkedUser: boolean,
): SanadTransitionResult {
  const o = ops ?? {};
  if (o.linkedSanadOfficeId != null) {
    return bad("This centre is no longer accepting invite responses.");
  }
  if (alreadyLinkedUser) {
    return { ok: false, code: "CONFLICT", message: "This onboarding link is already linked to a SmartPRO account." };
  }
  return { ok: true };
}

/** OAuth user attaches to invite token. */
export function validateLinkSanadInviteToAccount(
  ops: SanadLifecycleOpsInput | null | undefined,
  inviteAcceptCaptured: boolean,
): SanadTransitionResult {
  const o = ops ?? {};
  if (o.linkedSanadOfficeId != null) {
    return bad("This centre is no longer accepting account links via this invite.");
  }
  if (!inviteAcceptCaptured && !o.inviteAcceptAt) {
    return bad("Submit your contact details on the invite page before linking your SmartPRO account.");
  }
  return { ok: true };
}

/**
 * Turning public listing ON must satisfy go-live bar (profile + location + phone + active catalogue + active status).
 */
export function validateEnablePublicListing(
  officeAfterPatch: SanadLifecycleOfficeInput,
  activeCatalogueCount: number,
): SanadTransitionResult & { readiness?: SanadMarketplaceReadiness } {
  const readiness = computeSanadGoLiveReadiness(officeAfterPatch, activeCatalogueCount);
  if (!readiness.ready) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: `Cannot enable public listing yet: ${readiness.reasons.join(" ")}`,
      readiness,
    };
  }
  return { ok: true, readiness };
}

/** Optional integrity scan: impossible or risky combinations in one snapshot (for audits / tests). */
export function listSanadIntelOfficeIntegrityWarnings(
  ops: SanadLifecycleOpsInput | null | undefined,
  _office: SanadLifecycleOfficeInput,
): string[] {
  const o = ops ?? {};
  const w: string[] = [];
  if (o.linkedSanadOfficeId != null && o.registeredUserId == null) {
    w.push("linkedSanadOfficeId is set but registeredUserId is null (unexpected).");
  }
  if (o.registeredUserId != null && !o.inviteAcceptAt) {
    w.push("registeredUserId is set but inviteAcceptAt is null (unexpected for invite pipeline).");
  }
  return w;
}

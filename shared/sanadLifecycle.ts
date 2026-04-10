/**
 * Canonical SANAD partner lifecycle (network intelligence + operational office).
 * Stages are ordered from earliest (registry) to most advanced (live_partner).
 */

export const SANAD_LIFECYCLE_STAGES = [
  "registry",
  "contacted",
  "prospect",
  "invited",
  "lead_captured",
  "account_linked",
  "compliance_in_progress",
  "licensed",
  "activated_office",
  "public_listed",
  "live_partner",
] as const;

export type SanadLifecycleStage = (typeof SANAD_LIFECYCLE_STAGES)[number];

const STAGE_ORDER: Record<SanadLifecycleStage, number> = Object.fromEntries(
  SANAD_LIFECYCLE_STAGES.map((s, i) => [s, i]),
) as Record<SanadLifecycleStage, number>;

export type PartnerStatus = "unknown" | "prospect" | "active" | "suspended" | "churned";
export type OnboardingStatus =
  | "not_started"
  | "intake"
  | "documentation"
  | "licensing_review"
  | "licensed"
  | "blocked";
export type ComplianceOverall = "not_assessed" | "partial" | "complete" | "at_risk";

/** Minimal intel operations slice used for lifecycle resolution */
export type SanadLifecycleOpsInput = {
  partnerStatus?: PartnerStatus | null;
  onboardingStatus?: OnboardingStatus | null;
  complianceOverall?: ComplianceOverall | null;
  lastContactedAt?: Date | string | null;
  inviteToken?: string | null;
  inviteSentAt?: Date | string | null;
  inviteExpiresAt?: Date | string | null;
  inviteAcceptAt?: Date | string | null;
  registeredUserId?: number | null;
  linkedSanadOfficeId?: number | null;
};

/** Minimal operational office row when linked */
export type SanadLifecycleOfficeInput = {
  name?: string | null;
  description?: string | null;
  phone?: string | null;
  governorate?: string | null;
  city?: string | null;
  languages?: string | null;
  logoUrl?: string | null;
  status?: string | null;
  isPublicListed?: number | boolean | null;
  avgRating?: string | number | null;
  totalReviews?: number | null;
  isVerified?: number | boolean | null;
} | null;

export type SanadLifecycleResolveExtras = {
  /** Active rows in sanad_service_catalogue for this office */
  activeCatalogueCount?: number;
  now?: Date;
};

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function isInviteChannelOpen(
  ops: SanadLifecycleOpsInput,
  now: Date,
): boolean {
  if (ops.linkedSanadOfficeId != null) return false;
  if (!ops.inviteToken || !ops.inviteExpiresAt) return false;
  return new Date(ops.inviteExpiresAt) > now;
}

function isLicensedIntel(ops: SanadLifecycleOpsInput): boolean {
  return ops.onboardingStatus === "licensed" || ops.complianceOverall === "complete";
}

function isComplianceInProgressIntel(ops: SanadLifecycleOpsInput): boolean {
  if (ops.onboardingStatus === "blocked") return true;
  return ["intake", "documentation", "licensing_review"].includes(ops.onboardingStatus ?? "");
}

/**
 * Returns the most advanced lifecycle stage satisfied by current DB-derived signals.
 */
export function resolveSanadLifecycleStage(
  ops: SanadLifecycleOpsInput | null | undefined,
  office: SanadLifecycleOfficeInput,
  extras?: SanadLifecycleResolveExtras,
): SanadLifecycleStage {
  const now = extras?.now ?? new Date();
  const o = ops ?? {};

  const listed =
    office &&
    (office.isPublicListed === 1 ||
      office.isPublicListed === true ||
      String(office.isPublicListed) === "1");
  const activeOffice = office && office.status === "active";
  const avgRating = office ? num(office.avgRating) : 0;
  const totalReviews = office?.totalReviews ?? 0;
  const verified =
    office?.isVerified === 1 || office?.isVerified === true || String(office?.isVerified) === "1";
  const catalogueOk = (extras?.activeCatalogueCount ?? 0) > 0;

  if (o.linkedSanadOfficeId != null) {
    if (!office) {
      return "activated_office";
    }
    if (listed && activeOffice && (totalReviews > 0 || verified || avgRating >= 4 || catalogueOk)) {
      return "live_partner";
    }
    if (listed && activeOffice) {
      return "public_listed";
    }
    return "activated_office";
  }
  if (isLicensedIntel(o)) {
    return "licensed";
  }
  if (o.registeredUserId != null && isComplianceInProgressIntel(o) && !isLicensedIntel(o)) {
    return "compliance_in_progress";
  }
  if (o.registeredUserId != null) {
    return "account_linked";
  }
  if (o.inviteAcceptAt) {
    return "lead_captured";
  }
  if (isInviteChannelOpen(o, now) || (o.inviteSentAt && !o.inviteAcceptAt)) {
    return "invited";
  }
  if (o.partnerStatus === "prospect") {
    return "prospect";
  }
  if (o.lastContactedAt) {
    return "contacted";
  }
  return "registry";
}

export function compareSanadLifecycleStage(a: SanadLifecycleStage, b: SanadLifecycleStage): number {
  return STAGE_ORDER[a] - STAGE_ORDER[b];
}

export type SanadLifecycleBadgeStyle = "muted" | "secondary" | "default" | "outline" | "destructive";

export function sanadLifecycleBadge(
  stage: SanadLifecycleStage,
): { label: string; description: string; className: string; style: SanadLifecycleBadgeStyle } {
  const meta: Record<
    SanadLifecycleStage,
    { label: string; description: string; className: string; style: SanadLifecycleBadgeStyle }
  > = {
    registry: {
      label: "Registry",
      description: "Imported directory row — outreach not recorded yet.",
      className: "bg-slate-100 text-slate-700 border-slate-200",
      style: "outline",
    },
    contacted: {
      label: "Contacted",
      description: "Outreach logged — relationship in motion.",
      className: "bg-zinc-100 text-zinc-800",
      style: "secondary",
    },
    prospect: {
      label: "Prospect",
      description: "Classified as a SmartPRO partner prospect.",
      className: "bg-blue-100 text-blue-800",
      style: "secondary",
    },
    invited: {
      label: "Invited",
      description: "Onboarding invite issued — centre can accept via SmartPRO.",
      className: "bg-indigo-100 text-indigo-800",
      style: "secondary",
    },
    lead_captured: {
      label: "Lead captured",
      description: "Contact details submitted on the invite flow.",
      className: "bg-violet-100 text-violet-900",
      style: "secondary",
    },
    account_linked: {
      label: "Account linked",
      description: "SmartPRO user linked to this centre record.",
      className: "bg-cyan-100 text-cyan-900",
      style: "default",
    },
    compliance_in_progress: {
      label: "Compliance in progress",
      description: "Licensing checklist and verification underway.",
      className: "bg-amber-100 text-amber-900",
      style: "default",
    },
    licensed: {
      label: "Licensed",
      description: "Licensing / compliance gate cleared on network record.",
      className: "bg-emerald-100 text-emerald-900",
      style: "default",
    },
    activated_office: {
      label: "Activated office",
      description: "Operational SANAD office created and linked.",
      className: "bg-green-100 text-green-900",
      style: "default",
    },
    public_listed: {
      label: "Public listed",
      description: "Visible on the public marketplace directory.",
      className: "bg-orange-100 text-orange-900",
      style: "default",
    },
    live_partner: {
      label: "Live partner",
      description: "Active, discoverable partner with marketplace presence.",
      className: "bg-red-100 text-red-900",
      style: "default",
    },
  };
  return meta[stage];
}

export function listSanadLifecycleBlockers(
  stage: SanadLifecycleStage,
  ops: SanadLifecycleOpsInput | null | undefined,
  office: SanadLifecycleOfficeInput,
  extras?: SanadLifecycleResolveExtras & {
    complianceDone?: number;
    complianceTotal?: number;
  },
): string[] {
  const o = ops ?? {};
  const blockers: string[] = [];
  const next = (msg: string) => blockers.push(msg);

  if (compareSanadLifecycleStage(stage, "contacted") < 0) {
    next("Log first outreach to move beyond raw registry.");
  }
  if (compareSanadLifecycleStage(stage, "invited") < 0 && !o.inviteSentAt && !o.inviteToken) {
    next("Issue a SmartPRO invite when the centre is ready to onboard.");
  }
  if (compareSanadLifecycleStage(stage, "lead_captured") < 0 && !o.inviteAcceptAt) {
    next("Capture lead details through the invite acceptance form.");
  }
  if (compareSanadLifecycleStage(stage, "account_linked") < 0 && !o.registeredUserId) {
    next("Centre representative must sign in and link their SmartPRO account.");
  }
  if (stage === "compliance_in_progress" || stage === "account_linked") {
    const total = extras?.complianceTotal ?? 0;
    const done = extras?.complianceDone ?? 0;
    if (total > 0 && done < total) {
      next("Complete outstanding compliance checklist items.");
    }
  }
  if (compareSanadLifecycleStage(stage, "activated_office") < 0 && !o.linkedSanadOfficeId) {
    next("Activate an operational office once compliance prerequisites are met.");
  }
  if (office && !(office.isPublicListed === 1 || office.isPublicListed === true)) {
    if (compareSanadLifecycleStage(stage, "public_listed") >= 0) {
      next("Publish the office profile to the marketplace when ready.");
    }
  }
  if (stage === "public_listed" && (extras?.activeCatalogueCount ?? 0) === 0) {
    next("Add at least one active catalogue item or earn reviews to reach live partner status.");
  }
  return blockers;
}

/**
 * Partner workspace: merge lifecycle blockers, marketplace gaps, and stage-based CTAs (deduped).
 */
export function recommendedSanadPartnerNextActions(
  stage: SanadLifecycleStage,
  blockers: string[],
  marketplaceReasons: string[],
): string[] {
  const extra: string[] = [];
  for (const r of marketplaceReasons) {
    extra.push(`Marketplace · ${r}`);
  }
  if (stage === "registry" || stage === "contacted") {
    extra.push(
      "Work with SmartPRO operations to classify this centre and begin onboarding when you are ready.",
    );
  }
  if (stage === "invited" || stage === "lead_captured") {
    extra.push("Open your SmartPRO invite link and complete the capture form.");
  }
  if (stage === "account_linked" || stage === "compliance_in_progress") {
    extra.push("Complete compliance checklist items and respond to your network contact.");
  }
  if (stage === "licensed" || stage === "activated_office") {
    extra.push("Finish your public profile, add active catalogue services, then enable marketplace listing.");
  }
  if (stage === "public_listed" || stage === "live_partner") {
    extra.push("Keep your catalogue and contact details current for clients.");
  }
  const merged = [...blockers, ...extra];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of merged) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= 18) break;
  }
  return out;
}

export function sanadPublicProfileCompleteness(office: SanadLifecycleOfficeInput): {
  score: number;
  max: number;
  missing: string[];
} {
  if (!office) return { score: 0, max: 6, missing: ["Office profile"] };
  const missing: string[] = [];
  let score = 0;
  const checks: [boolean, string][] = [
    [Boolean(office.name?.trim()), "Display name"],
    [Boolean(office.description?.trim()), "Description"],
    [Boolean(office.phone?.trim()), "Phone"],
    [Boolean(office.governorate?.trim()), "Governorate"],
    [Boolean(office.languages?.trim()), "Languages"],
    [Boolean(office.logoUrl?.trim()), "Logo"],
  ];
  for (const [ok, label] of checks) {
    if (ok) score++;
    else missing.push(label);
  }
  return { score, max: checks.length, missing };
}

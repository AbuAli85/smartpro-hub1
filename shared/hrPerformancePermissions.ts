/**
 * HR Performance & Growth — permission keys (financeHR training / self-review / KPI admin surfaces).
 * Effective permission = role defaults ∪ company_members.permissions JSON (∪ implies * wins from JSON).
 *
 * company_admin: implicit full access (handled in memberHasHrPerformancePermission).
 */

export const HR_PERF = {
  READ: "hr.performance.read",
  MANAGE: "hr.performance.manage",
  TRAINING_MANAGE: "hr.training.manage",
  SELF_READ: "hr.self_reviews.read",
  SELF_REVIEW: "hr.self_reviews.review",
} as const;

/** Default HR-performance keys by company_members.role (merged with JSON permissions). */
export const HR_PERFORMANCE_ROLE_DEFAULTS: Record<
  string,
  readonly string[]
> = {
  /** Full HR performance suite (same as explicit list; company_admin still bypasses in code). */
  hr_admin: [
    HR_PERF.READ,
    HR_PERF.MANAGE,
    HR_PERF.TRAINING_MANAGE,
    HR_PERF.SELF_READ,
    HR_PERF.SELF_REVIEW,
  ],
  /** Read-focused executive / finance leadership (conservative: no self-review content by default). */
  finance_admin: [HR_PERF.READ],
  /** Line-manager style: read + review self-reviews for direct reports (policy in procedures). */
  reviewer: [HR_PERF.READ, HR_PERF.SELF_READ, HR_PERF.SELF_REVIEW],
  company_member: [],
  client: [],
  external_auditor: [],
};

/**
 * Union of role defaults and JSON permissions. company_admin → ["*"].
 */
export function effectiveHrPerformancePermissions(member: {
  role: string;
  permissions: unknown;
}): Set<string> {
  if (member.role === "company_admin") {
    return new Set(["*"]);
  }
  const json: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const defaults = HR_PERFORMANCE_ROLE_DEFAULTS[member.role] ?? [];
  return new Set([...defaults, ...json]);
}

/** True if member may use this HR performance permission (role defaults ∪ JSON, * wildcard). */
export function memberHasHrPerformancePermission(
  member: { role: string; permissions: unknown },
  permission: string
): boolean {
  if (member.role === "company_admin") return true;
  const eff = effectiveHrPerformancePermissions(member);
  if (eff.has("*")) return true;
  return eff.has(permission);
}

/**
 * HR Letters — granular permission keys (company_members.permissions JSON ∪ role defaults).
 */

export const HR_LETTERS = {
  READ: "hr.letters.read",
  CREATE: "hr.letters.create",
  ISSUE: "hr.letters.issue",
  TEMPLATES_MANAGE: "hr.letters.templates.manage",
  SIGNATORIES_MANAGE: "hr.letters.signatories.manage",
  SENSITIVE_ISSUE: "hr.letters.sensitive.issue",
} as const;

/** Default keys merged with JSON permissions (company_admin bypasses in server). */
export const HR_LETTERS_ROLE_DEFAULTS: Record<string, readonly string[]> = {
  company_admin: [
    HR_LETTERS.READ,
    HR_LETTERS.CREATE,
    HR_LETTERS.ISSUE,
    HR_LETTERS.TEMPLATES_MANAGE,
    HR_LETTERS.SIGNATORIES_MANAGE,
    HR_LETTERS.SENSITIVE_ISSUE,
  ],
  hr_admin: [
    HR_LETTERS.READ,
    HR_LETTERS.CREATE,
    HR_LETTERS.ISSUE,
    HR_LETTERS.TEMPLATES_MANAGE,
    HR_LETTERS.SIGNATORIES_MANAGE,
    HR_LETTERS.SENSITIVE_ISSUE,
  ],
  finance_admin: [HR_LETTERS.READ],
  reviewer: [HR_LETTERS.READ, HR_LETTERS.CREATE, HR_LETTERS.ISSUE],
  company_member: [HR_LETTERS.READ],
  client: [HR_LETTERS.READ],
  external_auditor: [HR_LETTERS.READ],
};

export function effectiveHrLetterPermissions(member: { role: string; permissions: unknown }): Set<string> {
  if (member.role === "company_admin") return new Set(["*"]);
  const json: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const defaults = HR_LETTERS_ROLE_DEFAULTS[member.role] ?? [];
  return new Set([...defaults, ...json]);
}

export function memberHasHrLetterPermission(
  member: { role: string; permissions: unknown },
  permission: string
): boolean {
  if (member.role === "company_admin") return true;
  const eff = effectiveHrLetterPermissions(member);
  if (eff.has("*")) return true;
  return eff.has(permission);
}

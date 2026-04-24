/**
 * Configurable capability / permission system.
 *
 * Effective capabilities = role defaults ∪ explicit grants ∖ explicit denials,
 * further constrained by which company modules are enabled.
 *
 * Storage: `company_members.permissions` (string[])
 *   - Grants:  capability key as-is  (e.g. "view_payroll")
 *   - Denials: prefixed with "-"     (e.g. "-approve_tasks")
 *
 * Company-level module gating: `companies.enabledModules` (string[] | null).
 * When null = all modules active (legacy / unlimited plans).
 */

// ─── Capability keys ──────────────────────────────────────────────────────────

export const CAPABILITY_KEYS = [
  // Reports & insights
  "view_reports",            // /reports page + attendance exports
  "view_payroll",            // /payroll, /payroll/process (read)
  "edit_payroll",            // payroll run mutations
  "view_executive_summary",  // /finance/overview executive KPIs
  "view_finance",            // general /finance pages
  // HR
  "view_hr",                 // /hr module (read)
  "manage_hr",               // HR mutations — edit employees, approve leave
  "approve_tasks",           // task approval workflows
  // Administration
  "manage_users",            // /company-admin/members — invite/remove/change roles
  // Documents
  "view_documents",          // /company/documents (read)
  "manage_documents",        // document mutations (upload, delete)
  // Contracts & commercial
  "view_contracts",          // /contracts, /quotations (read)
  "manage_contracts",        // contract mutations
  // CRM & marketplace
  "view_crm",                // /crm (read)
  "manage_crm",              // CRM mutations
  "view_marketplace",        // /marketplace (read)
  // Government & compliance
  "view_compliance",         // /sanad, /workforce, /pro (read)
] as const;

export type Capability = (typeof CAPABILITY_KEYS)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  view_reports: "View Reports",
  view_payroll: "View Payroll",
  edit_payroll: "Edit Payroll",
  view_executive_summary: "View Executive Summary",
  view_finance: "View Finance",
  view_hr: "View HR",
  manage_hr: "Manage HR",
  approve_tasks: "Approve Tasks",
  manage_users: "Manage Users",
  view_documents: "View Documents",
  manage_documents: "Manage Documents",
  view_contracts: "View Contracts",
  manage_contracts: "Manage Contracts",
  view_crm: "View CRM",
  manage_crm: "Manage CRM",
  view_marketplace: "View Marketplace",
  view_compliance: "View Compliance",
};

// ─── Company modules ──────────────────────────────────────────────────────────

export const MODULE_KEYS = [
  "payroll",
  "finance",
  "hr",
  "crm",
  "compliance",
  "marketplace",
  "documents",
  "contracts",
] as const;

export type CompanyModule = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<CompanyModule, string> = {
  payroll: "Payroll",
  finance: "Finance",
  hr: "HR",
  crm: "CRM",
  compliance: "Compliance & Government",
  marketplace: "Marketplace",
  documents: "Documents",
  contracts: "Contracts",
};

/** Capabilities that become inaccessible when their module is disabled. */
export const MODULE_CAPABILITIES: Record<CompanyModule, ReadonlyArray<Capability>> = {
  payroll: ["view_payroll", "edit_payroll"],
  finance: ["view_finance", "view_executive_summary"],
  hr: ["view_hr", "manage_hr", "approve_tasks"],
  crm: ["view_crm", "manage_crm"],
  compliance: ["view_compliance"],
  marketplace: ["view_marketplace"],
  documents: ["view_documents", "manage_documents"],
  contracts: ["view_contracts", "manage_contracts"],
};

// ─── Role defaults ────────────────────────────────────────────────────────────

const ALL_CAPS: ReadonlyArray<Capability> = CAPABILITY_KEYS;

export const ROLE_DEFAULT_CAPABILITIES: Record<string, ReadonlyArray<Capability>> = {
  company_admin: ALL_CAPS,
  hr_admin: ["view_hr", "manage_hr", "view_reports", "approve_tasks", "view_documents"],
  finance_admin: ["view_payroll", "edit_payroll", "view_finance", "view_executive_summary", "view_reports"],
  reviewer: ["view_contracts", "manage_contracts", "view_crm", "manage_crm", "view_marketplace"],
  external_auditor: [
    "view_payroll",
    "view_reports",
    "view_finance",
    "view_executive_summary",
    "view_hr",
    "view_contracts",
    "view_compliance",
  ],
  company_member: [],
  client: [],
};

// ─── Core helpers ─────────────────────────────────────────────────────────────

export function getDefaultCapabilitiesForRole(role: string): Set<Capability> {
  return new Set(ROLE_DEFAULT_CAPABILITIES[role] ?? []);
}

/**
 * Resolve the effective capability set for a member.
 *
 * @param role           - company_members.role
 * @param permissions    - company_members.permissions (grants + "-"-prefixed denials)
 * @param enabledModules - companies.enabledModules (null = all enabled)
 */
export function resolveEffectiveCapabilities(
  role: string,
  permissions: string[] | null | undefined,
  enabledModules?: string[] | null,
): Set<Capability> {
  const perms = Array.isArray(permissions) ? permissions : [];

  const grants = perms.filter((p) => !p.startsWith("-")) as Capability[];
  const denials = new Set(
    perms.filter((p) => p.startsWith("-")).map((p) => p.slice(1)),
  );

  const effective = new Set<Capability>([
    ...getDefaultCapabilitiesForRole(role),
    ...grants,
  ]);

  for (const d of denials) {
    effective.delete(d as Capability);
  }

  // Module gating — only applies when the company has an explicit module list
  if (enabledModules != null) {
    const enabledSet = new Set(enabledModules);
    for (const [mod, caps] of Object.entries(MODULE_CAPABILITIES) as Array<
      [CompanyModule, ReadonlyArray<Capability>]
    >) {
      if (!enabledSet.has(mod)) {
        for (const cap of caps) {
          effective.delete(cap);
        }
      }
    }
  }

  return effective;
}

export function hasCapability(
  effectiveOrPermissions: Set<Capability> | string[] | null | undefined,
  capability: Capability,
): boolean {
  if (!effectiveOrPermissions) return false;
  if (effectiveOrPermissions instanceof Set) return effectiveOrPermissions.has(capability);
  return (effectiveOrPermissions as string[]).includes(capability);
}

/**
 * Build the permissions array stored in company_members.permissions from
 * a desired effective set relative to role defaults.
 * Encodes additions and "-"-prefixed removals; keeps the array minimal.
 */
export function buildPermissionsOverride(
  role: string,
  desiredEffective: Capability[],
): string[] {
  const defaults = getDefaultCapabilitiesForRole(role);
  const desired = new Set(desiredEffective);
  const result: string[] = [];

  for (const cap of desired) {
    if (!defaults.has(cap)) result.push(cap);
  }
  for (const cap of defaults) {
    if (!desired.has(cap)) result.push(`-${cap}`);
  }

  return result;
}

/** Canonical `users.platformRole` enum values (must match DB). */
export const PLATFORM_ROLE_VALUES = [
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
  "finance_admin",
  "hr_admin",
  "company_admin",
  "company_member",
  "reviewer",
  "client",
  "external_auditor",
  "sanad_network_admin",
  "sanad_compliance_reviewer",
] as const;

export type PlatformRoleValue = (typeof PLATFORM_ROLE_VALUES)[number];

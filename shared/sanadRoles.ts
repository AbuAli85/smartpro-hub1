import { canAccessGlobalAdminProcedures } from "./rbac";

export function canAccessSanadIntelFull(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  return canAccessGlobalAdminProcedures(user) || user.platformRole === "sanad_network_admin";
}

export function canAccessSanadIntelRead(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  return canAccessSanadIntelFull(user) || user.platformRole === "sanad_compliance_reviewer";
}

export function canAccessSanadIntelligenceUi(user: {
  role?: string | null;
  platformRole?: string | null;
}): boolean {
  return canAccessSanadIntelRead(user);
}

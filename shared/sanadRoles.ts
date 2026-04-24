import { canAccessGlobalAdminProcedures } from "./rbac";

type SanadUser = {
  role?: string | null;
  platformRole?: string | null;
  platformRoles?: string[] | null;
};

function hasSanadSlug(user: SanadUser, slug: string): boolean {
  const fromTable = (user.platformRoles ?? []).filter(Boolean);
  if (fromTable.length > 0) return fromTable.includes(slug);
  return (user.platformRole ?? "").trim() === slug;
}

export function canAccessSanadIntelFull(user: SanadUser): boolean {
  return canAccessGlobalAdminProcedures(user) || hasSanadSlug(user, "sanad_network_admin");
}

export function canAccessSanadIntelRead(user: SanadUser): boolean {
  return canAccessSanadIntelFull(user) || hasSanadSlug(user, "sanad_compliance_reviewer");
}

export function canAccessSanadIntelligenceUi(user: SanadUser): boolean {
  return canAccessSanadIntelRead(user);
}

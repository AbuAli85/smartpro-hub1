import type { User } from "../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";

/**
 * Whether `contract_signature_audit` rows may appear in the company-scoped unified audit timeline.
 * Conservative: excludes plain `company_member` (signing UX is per-contract; this feed is management/legal).
 */
export function canIncludeContractSignatureAuditInTimeline(
  user: Pick<User, "role" | "platformRole">,
  companyMemberRole: string | null | undefined,
): boolean {
  if (canAccessGlobalAdminProcedures(user)) return true;
  const r = (companyMemberRole ?? "").trim();
  return (
    r === "company_admin" ||
    r === "hr_admin" ||
    r === "finance_admin" ||
    r === "reviewer" ||
    r === "external_auditor"
  );
}

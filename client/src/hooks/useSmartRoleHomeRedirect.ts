import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { trpc } from "@/lib/trpc";
import { seesPlatformOperatorNav, getRoleDefaultRoute } from "@shared/clientNav";

/**
 * Same redirect behaviour as the legacy dashboard: non-owner roles with a configured or default
 * home route are sent away from the shared home (`/` and `/control-tower`).
 */
export function useSmartRoleHomeRedirect() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { activeCompanyId, activeCompany, loading: companyLoading } = useActiveCompany();
  const { data: roleRedirectData } = trpc.companies.getRoleRedirectSettings.useQuery(
    { companyId: activeCompanyId ?? 0 },
    { enabled: activeCompanyId != null && !companyLoading },
  );

  useEffect(() => {
    if (companyLoading) return;
    const memberRole = activeCompany?.role ?? null;
    if (!memberRole) return;
    if (seesPlatformOperatorNav(user)) return;
    if (memberRole === "company_admin" || (memberRole as string) === "owner") return;
    const customRoute = roleRedirectData?.settings?.[memberRole];
    const targetRoute = customRoute || getRoleDefaultRoute(memberRole);
    if (targetRoute && targetRoute !== "/dashboard" && targetRoute !== "/" && targetRoute !== "/control-tower") {
      navigate(targetRoute);
    }
  }, [activeCompany?.role, companyLoading, roleRedirectData, navigate, user]);
}

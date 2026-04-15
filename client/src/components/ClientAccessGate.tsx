import { useAuth } from "@/_core/hooks/useAuth";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { trpc } from "@/lib/trpc";
import { clientRouteAccessible } from "@shared/clientNav";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";

/**
 * Redirects to /dashboard when the current path is not allowed for this user
 * (same rules as sidebar — see shared/clientNav.ts).
 */
export function ClientAccessGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { activeCompanyId, activeCompany, loading: companiesLoading, companies } = useActiveCompany();
  const { data: myCompany, isLoading: companyLoading } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: Boolean(user) && !companiesLoading && activeCompanyId != null },
  );
  const effectiveMemberRole = myCompany?.member?.role ?? activeCompany?.role ?? null;
  const navExtraAllowedHrefs = useMemo(() => {
    const ext = (myCompany?.company as { roleNavExtensions?: Record<string, string[]> } | undefined)
      ?.roleNavExtensions;
    const r = effectiveMemberRole;
    if (!ext || !r) return null;
    const list = ext[r];
    return Array.isArray(list) && list.length > 0 ? list : null;
  }, [myCompany?.company, effectiveMemberRole]);
  const [prefsEpoch, setPrefsEpoch] = useState(0);

  useEffect(() => {
    const onPrefs = () => setPrefsEpoch((n) => n + 1);
    window.addEventListener("smartpro-nav-prefs-changed", onPrefs);
    return () => window.removeEventListener("smartpro-nav-prefs-changed", onPrefs);
  }, []);

  const allowed = useMemo(() => {
    if (!user) return true;
    return clientRouteAccessible(location, user, getHiddenNavHrefs(), {
      hasCompanyWorkspace: Boolean(myCompany?.company?.id),
      companyWorkspaceLoading: companiesLoading || (Boolean(user) && activeCompanyId != null && companyLoading),
      memberRole: effectiveMemberRole,
      hasCompanyMembership: companies.length > 0,
      navExtraAllowedHrefs,
      memberPermissions: Array.isArray(myCompany?.member?.permissions)
        ? [...(myCompany.member.permissions as string[])]
        : [],
    });
  }, [
    location,
    user,
    myCompany?.company?.id,
    myCompany?.member?.role,
    myCompany?.member?.permissions,
    activeCompany?.role,
    navExtraAllowedHrefs,
    companyLoading,
    companiesLoading,
    activeCompanyId,
    companies.length,
    prefsEpoch,
  ]);

  // Don't redirect while auth or company data is still loading — prevents
  // the infinite /dashboard ↔ /hr/employees bounce when the company query
  // resolves and flips `allowed` from false → true.
  const isLoadingAny = authLoading || companiesLoading || (Boolean(user) && activeCompanyId != null && companyLoading);

  if (authLoading || !user) {
    return <>{children}</>;
  }

  if (isLoadingAny) {
    return <>{children}</>;
  }

  if (!allowed) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}

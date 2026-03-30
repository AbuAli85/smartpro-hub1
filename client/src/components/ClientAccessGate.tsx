import { useAuth } from "@/_core/hooks/useAuth";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { trpc } from "@/lib/trpc";
import { clientRouteAccessible } from "@shared/clientNav";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";

/**
 * Redirects to /dashboard when the current path is not allowed for this user
 * (same rules as sidebar — see shared/clientNav.ts).
 */
export function ClientAccessGate({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { data: myCompany, isLoading: companyLoading } = trpc.companies.myCompany.useQuery(undefined, {
    enabled: Boolean(user),
  });
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
      companyWorkspaceLoading: companyLoading,
      memberRole: myCompany?.member?.role ?? null,
    });
  }, [location, user, myCompany?.company?.id, myCompany?.member?.role, companyLoading, prefsEpoch]);

  if (authLoading || !user) {
    return <>{children}</>;
  }

  if (!allowed) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}

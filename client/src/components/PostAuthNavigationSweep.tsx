import { useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { trpc } from "@/lib/trpc";
import { computePostAuthNavigationRedirect } from "@shared/postAuthHome";
import type { IdentityAugmentedUser } from "@shared/identityAuthority";

/**
 * Central post-auth navigation: once `auth.me` and workspace context are ready, align the URL with
 * {@link pickSafeAuthenticatedReturnPath} (same policy as tests). Runs once per settled snapshot.
 */
export function PostAuthNavigationSweep() {
  const [pathname, navigate] = useLocation();
  const search = useSearch();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { loading: companiesLoading, companies, activeCompanyId, activeCompany } = useActiveCompany();

  const { data: myCompany, isLoading: companyDetailLoading } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: Boolean(user) && !companiesLoading && activeCompanyId != null },
  );

  const workspacePolicyLoading =
    companiesLoading || (Boolean(user) && activeCompanyId != null && companyDetailLoading);

  const effectiveMemberRole = myCompany?.member?.role ?? activeCompany?.role ?? null;
  const navExtraAllowedHrefs = useMemo(() => {
    const ext = (myCompany?.company as { roleNavExtensions?: Record<string, string[]> } | undefined)?.roleNavExtensions;
    const r = effectiveMemberRole;
    if (!ext || !r) return null;
    const list = ext[r];
    return Array.isArray(list) && list.length > 0 ? list : null;
  }, [myCompany?.company, effectiveMemberRole]);

  const hiddenOptional = useMemo(() => getHiddenNavHrefs(), []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (authLoading || workspacePolicyLoading) return;

    const resolveInput = {
      isAuthenticated,
      authLoading,
      /** Membership list only (same semantics as {@link resolvePostAuthHome}). */
      companiesLoading,
      user: user as IdentityAugmentedUser,
      companiesSettled: !companiesLoading,
      hasCompanyMembership: companies.length > 0,
      activeMemberRole: effectiveMemberRole,
    };

    const target = computePostAuthNavigationRedirect({
      isAuthenticated,
      authLoading,
      companiesLoading: workspacePolicyLoading,
      pathname,
      search,
      pickSafeInput: {
        resolveInput,
        routeCheck: {
          user: user as IdentityAugmentedUser,
          hiddenOptional,
          navOptions: {
            hasCompanyWorkspace: Boolean(myCompany?.company?.id),
            companyWorkspaceLoading: workspacePolicyLoading,
            memberRole: effectiveMemberRole,
            hasCompanyMembership: companies.length > 0,
            navExtraAllowedHrefs,
            memberPermissions: Array.isArray(myCompany?.member?.permissions)
              ? [...(myCompany.member.permissions as string[])]
              : [],
          },
        },
      },
    });

    if (!target) return;

    navigate(target, { replace: true });
  }, [
    activeCompany?.role,
    authLoading,
    companies.length,
    companyDetailLoading,
    companiesLoading,
    effectiveMemberRole,
    hiddenOptional,
    isAuthenticated,
    myCompany?.company?.id,
    myCompany?.member?.permissions,
    myCompany?.member?.role,
    navigate,
    navExtraAllowedHrefs,
    pathname,
    search,
    user,
    workspacePolicyLoading,
  ]);

  return null;
}

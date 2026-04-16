/**
 * ActiveCompanyContext
 *
 * Provides the currently-selected company across the entire app.
 * - Persists the active company ID in localStorage so it survives page refreshes.
 * - When the user has only one company, that company is auto-selected.
 * - When the user switches company, all pages re-render with the new company's data.
 *
 * **Membership resolution:** `loading` is true until auth is resolved and (when logged in)
 * `trpc.companies.myCompanies` has finished. Until then, consumers must not treat
 * `companies.length === 0` as “user has no companies”
 * (the list may still be loading). Pre-company dashboard / `isPreCompanyWorkspaceUser`
 * depend on this. See `docs/architecture/workspace-mode.md`.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "smartpro_active_company_id";

interface CompanyOption {
  id: number;
  name: string;
  nameAr: string | null;
  country: string | null;
  industry: string | null;
  role: string | null;
}

interface ActiveCompanyContextValue {
  /** All companies the logged-in user belongs to */
  companies: CompanyOption[];
  /** The currently active company (null while loading) */
  activeCompany: CompanyOption | null;
  /** The ID of the currently active company (null while loading) */
  activeCompanyId: number | null;
  /** Switch to a different company */
  switchCompany: (companyId: number) => void;
  /**
   * True while auth or membership list is still loading (not settled yet).
   * Consumers should not infer “no company” from an empty list until this is false.
   */
  loading: boolean;
  /** Expiry warning threshold in days (default 30, configurable per company) */
  expiryWarningDays: number;
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue>({
  companies: [],
  activeCompany: null,
  activeCompanyId: null,
  switchCompany: () => {},
  loading: true,
  expiryWarningDays: 30,
});

export function ActiveCompanyProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { data: rawCompanies, isLoading: companyListLoading } = trpc.companies.myCompanies.useQuery(
    undefined,
    { enabled: isAuthenticated },
  );
  const membershipLoading = isAuthenticated && companyListLoading;
  const loading = authLoading || membershipLoading;


  const companies: CompanyOption[] = useMemo(
    () =>
      !isAuthenticated
        ? []
        : (rawCompanies ?? []).map((r) => ({
            id: r.company.id,
            name: r.company.name,
            nameAr: (r.company as any).nameAr ?? null,
            country: r.company.country ?? null,
            industry: (r.company as any).industry ?? null,
            role: r.member.role ?? null,
          })),
    [isAuthenticated, rawCompanies]
  );

  // Internal state: may hold a stale localStorage value before companies are loaded
  const [_savedId, setSavedId] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // Auto-select: if saved ID is not in the list (or no saved ID), pick the first
  useEffect(() => {
    if (membershipLoading || companies.length === 0) return;
    const valid = companies.find((c) => c.id === _savedId);
    if (!valid) {
      const first = companies[0];
      setSavedId(first.id);
      localStorage.setItem(STORAGE_KEY, String(first.id));
    }
  }, [companies, membershipLoading, _savedId]);

  // Only expose a validated company ID — null while loading OR while the saved ID
  // hasn't been confirmed against the loaded companies list yet.
  // This prevents pages from firing queries with a stale/unvalidated ID.
  const activeCompanyId: number | null = useMemo(() => {
    if (membershipLoading || companies.length === 0) return null;
    const valid = companies.find((c) => c.id === _savedId);
    return valid ? valid.id : (companies[0]?.id ?? null);
  }, [membershipLoading, companies, _savedId]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  );

  const { data: expirySettings } = trpc.companies.getExpirySettings.useQuery(
    { companyId: activeCompanyId! },
    { enabled: activeCompanyId != null }
  );
  const expiryWarningDays = expirySettings?.expiryWarningDays ?? 30;

  const switchCompany = (companyId: number) => {
    setSavedId(companyId);
    localStorage.setItem(STORAGE_KEY, String(companyId));
    void queryClient.invalidateQueries();
  };

  return (
    <ActiveCompanyContext.Provider
      value={{ companies, activeCompany, activeCompanyId, switchCompany, loading, expiryWarningDays }}
    >
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany() {
  return useContext(ActiveCompanyContext);
}

/**
 * ActiveCompanyContext
 *
 * Provides the currently-selected company across the entire app.
 * - Persists the active company ID in localStorage so it survives page refreshes.
 * - When the user has only one company, that company is auto-selected.
 * - When the user switches company, all pages re-render with the new company's data.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  /** True while the companies list is loading */
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
  const { data: rawCompanies, isLoading } = trpc.companies.myCompanies.useQuery();


  const companies: CompanyOption[] = useMemo(
    () =>
      (rawCompanies ?? []).map((r) => ({
        id: r.company.id,
        name: r.company.name,
        nameAr: (r.company as any).nameAr ?? null,
        country: r.company.country ?? null,
        industry: (r.company as any).industry ?? null,
        role: r.member.role ?? null,
      })),
    [rawCompanies]
  );

  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // Auto-select: if saved ID is not in the list (or no saved ID), pick the first
  useEffect(() => {
    if (isLoading || companies.length === 0) return;
    const valid = companies.find((c) => c.id === activeCompanyId);
    if (!valid) {
      const first = companies[0];
      setActiveCompanyId(first.id);
      localStorage.setItem(STORAGE_KEY, String(first.id));
    }
  }, [companies, isLoading, activeCompanyId]);

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
    setActiveCompanyId(companyId);
    localStorage.setItem(STORAGE_KEY, String(companyId));
  };

  return (
    <ActiveCompanyContext.Provider
      value={{ companies, activeCompany, activeCompanyId, switchCompany, loading: isLoading, expiryWarningDays }}
    >
      {children}
    </ActiveCompanyContext.Provider>
  );
}

export function useActiveCompany() {
  return useContext(ActiveCompanyContext);
}

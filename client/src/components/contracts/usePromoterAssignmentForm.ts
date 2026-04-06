/**
 * Shared form-state hook for the Promoter Assignment create/edit form.
 * Used by PromoterAssignmentsPage, ContractsPage, and ContractDetailPage.
 *
 * Encapsulates:
 *   - Controlled form state
 *   - Party picker, site, and employee queries
 *   - Reset helpers
 *   - canSubmit validation
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

export type PromoterAssignmentFormState = {
  clientCompanyId: number | "";
  employerCompanyId: number | "";
  promoterEmployeeId: number | "";
  clientSiteId: number | "";
  locationEn: string;
  locationAr: string;
  effectiveDate: string;
  expiryDate: string;
  contractNumber: string;
  issueDate: string;
  status: "active" | "inactive" | "expired";
  // Identity fields (PR 2)
  civilId: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  jobTitleEn: string;
};

const DEFAULT_STATE: PromoterAssignmentFormState = {
  clientCompanyId: "",
  employerCompanyId: "",
  promoterEmployeeId: "",
  clientSiteId: "",
  locationEn: "",
  locationAr: "",
  effectiveDate: "",
  expiryDate: "",
  contractNumber: "",
  issueDate: "",
  status: "active",
  civilId: "",
  passportNumber: "",
  passportExpiry: "",
  nationality: "",
  jobTitleEn: "",
};

type Options = {
  /** Open state — queries are paused when false */
  enabled: boolean;
  /** Pre-populate form for edit mode */
  initialValues?: Partial<PromoterAssignmentFormState>;
};

export function usePromoterAssignmentForm({ enabled, initialValues }: Options) {
  const { activeCompanyId } = useActiveCompany();

  const [state, setState] = useState<PromoterAssignmentFormState>(() => ({
    ...DEFAULT_STATE,
    ...initialValues,
  }));

  // Auto-set clientCompanyId to active company when dialog opens
  useEffect(() => {
    if (enabled && activeCompanyId != null && state.clientCompanyId === "") {
      setState((s) => ({ ...s, clientCompanyId: activeCompanyId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeCompanyId]);

  function set<K extends keyof PromoterAssignmentFormState>(
    field: K,
    value: PromoterAssignmentFormState[K]
  ) {
    setState((s) => ({ ...s, [field]: value }));
  }

  function setClient(id: number) {
    setState((s) => ({
      ...s,
      clientCompanyId: id,
      employerCompanyId: "",
      promoterEmployeeId: "",
      clientSiteId: "",
      locationEn: "",
      locationAr: "",
    }));
  }

  function setEmployer(id: number) {
    setState((s) => ({ ...s, employerCompanyId: id, promoterEmployeeId: "" }));
  }

  function reset(overrides?: Partial<PromoterAssignmentFormState>) {
    setState({ ...DEFAULT_STATE, ...overrides });
  }

  // ─── QUERIES ──────────────────────────────────────────────────────────────

  const pickersInput =
    typeof state.clientCompanyId === "number"
      ? { clientCompanyId: state.clientCompanyId }
      : undefined;

  const { data: pickers, isLoading: pickersLoading } =
    trpc.promoterAssignments.companiesForPartyPickers.useQuery(pickersInput, {
      enabled: enabled && activeCompanyId != null,
    });

  const { data: clientSites = [], isLoading: sitesLoading } =
    trpc.promoterAssignments.listClientWorkLocations.useQuery(
      {
        clientCompanyId:
          typeof state.clientCompanyId === "number" ? state.clientCompanyId : 0,
      },
      {
        enabled:
          enabled &&
          typeof state.clientCompanyId === "number" &&
          state.clientCompanyId > 0,
      }
    );

  const employerEmployeesEnabled =
    enabled &&
    typeof state.clientCompanyId === "number" &&
    state.clientCompanyId > 0 &&
    typeof state.employerCompanyId === "number" &&
    state.employerCompanyId > 0;

  const {
    data: employerEmployees = [],
    isLoading: employeesLoading,
    isError: employeesError,
    error: employeesErrorObj,
    refetch: refetchEmployees,
  } = trpc.promoterAssignments.listEmployerEmployees.useQuery(
    {
      employerCompanyId:
        typeof state.employerCompanyId === "number" ? state.employerCompanyId : 0,
      clientCompanyId:
        typeof state.clientCompanyId === "number" && state.clientCompanyId > 0
          ? state.clientCompanyId
          : undefined,
    },
    { enabled: employerEmployeesEnabled }
  );

  // Auto-fill identity from selected employee
  function onSelectEmployee(empId: number) {
    set("promoterEmployeeId", empId);
    const emp = employerEmployees.find((e) => e.id === empId);
    if (emp) {
      setState((s) => ({
        ...s,
        promoterEmployeeId: empId,
        civilId: s.civilId || emp.nationalId || "",
        passportNumber: s.passportNumber || emp.passportNumber || "",
        nationality: s.nationality || emp.nationality || "",
        jobTitleEn: s.jobTitleEn || emp.position || "",
      }));
    }
  }

  function onSelectSite(siteId: number | "__manual__") {
    if (siteId === "__manual__") {
      set("clientSiteId", "");
      return;
    }
    set("clientSiteId", siteId);
    const site = clientSites.find((s) => s.id === siteId);
    if (site) {
      setState((s) => ({
        ...s,
        clientSiteId: siteId,
        locationEn: [site.name, site.location].filter(Boolean).join(" — "),
        locationAr: site.name,
      }));
    }
  }

  // ─── VALIDATION ───────────────────────────────────────────────────────────

  const canSubmit =
    typeof state.clientCompanyId === "number" &&
    state.clientCompanyId > 0 &&
    typeof state.employerCompanyId === "number" &&
    state.employerCompanyId > 0 &&
    typeof state.promoterEmployeeId === "number" &&
    state.promoterEmployeeId > 0 &&
    state.locationEn.trim().length > 0 &&
    state.locationAr.trim().length > 0 &&
    state.effectiveDate.length > 0 &&
    state.expiryDate.length > 0 &&
    state.clientCompanyId !== state.employerCompanyId;

  return {
    state,
    set,
    setClient,
    setEmployer,
    reset,
    onSelectEmployee,
    onSelectSite,
    canSubmit,
    // Queries
    pickers,
    pickersLoading,
    clientSites,
    sitesLoading,
    employerEmployees,
    employeesLoading,
    employeesError,
    employeesErrorObj,
    refetchEmployees,
    employerEmployeesEnabled,
  };
}

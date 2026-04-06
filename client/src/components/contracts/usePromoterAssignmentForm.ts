/**
 * Shared form-state hook for the Promoter Assignment create/edit form.
 * Used by PromoterAssignmentsPage, ContractsPage, ContractDetailPage, ContractManagementPage.
 *
 * `creationPerspective`:
 *   - `client` — legacy: active company defaults as first party (client); dual company pickers.
 *   - `employer` — employer-side flow: second party locked to active company; unified client picker
 *     (platform tenants + managed external parties via contractManagement.promoterFlowClientOptions).
 */

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import type { ContractCreationPerspective, PromoterFlowClientOptionDto } from "@shared/agreementParties";

export type PromoterAssignmentFormState = {
  creationPerspective: ContractCreationPerspective;
  /** Subset of client selection for employer flow */
  clientSelectionKind: "" | "platform" | "external_party";
  /** UUID when client is an external managed party */
  clientPartyId: string;
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
  civilId: string;
  passportNumber: string;
  passportExpiry: string;
  nationality: string;
  jobTitleEn: string;
};

const DEFAULT_STATE: PromoterAssignmentFormState = {
  creationPerspective: "client",
  clientSelectionKind: "",
  clientPartyId: "",
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
  enabled: boolean;
  initialValues?: Partial<PromoterAssignmentFormState>;
  creationPerspective?: ContractCreationPerspective;
};

export function usePromoterAssignmentForm({
  enabled,
  initialValues,
  creationPerspective = "client",
}: Options) {
  const { activeCompanyId } = useActiveCompany();

  const [state, setState] = useState<PromoterAssignmentFormState>(() => ({
    ...DEFAULT_STATE,
    creationPerspective,
    ...initialValues,
  }));

  // Keep perspective in state when prop changes (dialog open)
  useEffect(() => {
    if (enabled) {
      setState((s) => ({ ...s, creationPerspective }));
    }
  }, [enabled, creationPerspective]);

  // Client perspective: default first party to active company
  useEffect(() => {
    if (
      enabled &&
      state.creationPerspective === "client" &&
      activeCompanyId != null &&
      state.clientCompanyId === ""
    ) {
      setState((s) => ({ ...s, clientCompanyId: activeCompanyId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeCompanyId, state.creationPerspective]);

  // Employer perspective: lock employer to active company when dialog opens (do not wipe after client pick).
  useEffect(() => {
    if (!enabled || state.creationPerspective !== "employer" || activeCompanyId == null) return;
    setState((s) => {
      const sameEmployer = s.employerCompanyId === activeCompanyId;
      if (sameEmployer && s.clientSelectionKind !== "") return s;
      if (sameEmployer && s.clientSelectionKind === "" && s.clientCompanyId === "" && s.clientPartyId === "") {
        return { ...s, employerCompanyId: activeCompanyId };
      }
      return {
        ...s,
        employerCompanyId: activeCompanyId,
        clientCompanyId: "",
        clientPartyId: "",
        clientSelectionKind: "",
        promoterEmployeeId: "",
        clientSiteId: "",
        locationEn: "",
        locationAr: "",
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeCompanyId, state.creationPerspective]);

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
      clientSelectionKind: "platform",
      clientPartyId: "",
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

  /** Employer flow: user picked a row from promoterFlowClientOptions */
  function setClientFromFlowOption(opt: PromoterFlowClientOptionDto) {
    if (opt.kind === "platform") {
      setState((s) => ({
        ...s,
        clientSelectionKind: "platform",
        clientCompanyId: opt.companyId,
        clientPartyId: "",
        promoterEmployeeId: "",
        clientSiteId: "",
        locationEn: "",
        locationAr: "",
      }));
    } else {
      setState((s) => ({
        ...s,
        clientSelectionKind: "external_party",
        clientPartyId: opt.partyId,
        clientCompanyId: "",
        promoterEmployeeId: "",
        clientSiteId: "",
        locationEn: "",
        locationAr: "",
      }));
    }
  }

  function reset(overrides?: Partial<PromoterAssignmentFormState>) {
    setState({
      ...DEFAULT_STATE,
      creationPerspective,
      ...overrides,
    });
  }

  const pickersInput =
    typeof state.clientCompanyId === "number"
      ? { clientCompanyId: state.clientCompanyId }
      : undefined;

  const { data: pickers, isLoading: pickersLoading } =
    trpc.promoterAssignments.companiesForPartyPickers.useQuery(pickersInput, {
      enabled:
        enabled &&
        state.creationPerspective === "client" &&
        activeCompanyId != null,
    });

  const { data: flowClientOptions = [], isLoading: flowClientOptionsLoading } =
    trpc.contractManagement.promoterFlowClientOptions.useQuery(undefined, {
      enabled:
        enabled &&
        state.creationPerspective === "employer" &&
        activeCompanyId != null,
    });

  const platformClientIdForSites =
    state.creationPerspective === "employer" && state.clientSelectionKind === "platform"
      ? typeof state.clientCompanyId === "number"
        ? state.clientCompanyId
        : 0
      : typeof state.clientCompanyId === "number"
        ? state.clientCompanyId
        : 0;

  const { data: clientSites = [], isLoading: sitesLoading } =
    trpc.contractManagement.listClientWorkLocations.useQuery(
      { clientCompanyId: platformClientIdForSites },
      {
        enabled:
          enabled &&
          platformClientIdForSites > 0,
      }
    );

  const employerEmployeesEnabled =
    enabled &&
    typeof state.employerCompanyId === "number" &&
    state.employerCompanyId > 0 &&
    (state.creationPerspective === "employer"
      ? state.clientSelectionKind === "platform"
        ? typeof state.clientCompanyId === "number" && state.clientCompanyId > 0
        : state.clientSelectionKind === "external_party" && state.clientPartyId.length > 0
      : typeof state.clientCompanyId === "number" &&
        state.clientCompanyId > 0 &&
        typeof state.employerCompanyId === "number" &&
        state.employerCompanyId > 0);

  const {
    data: employerEmployees = [],
    isLoading: employeesLoading,
    isError: employeesError,
    error: employeesErrorObj,
    refetch: refetchEmployees,
  } = trpc.contractManagement.listEmployerEmployees.useQuery(
    {
      employerCompanyId:
        typeof state.employerCompanyId === "number" ? state.employerCompanyId : 0,
      clientCompanyId:
        state.creationPerspective === "employer" && state.clientSelectionKind === "platform"
          ? typeof state.clientCompanyId === "number"
            ? state.clientCompanyId
            : undefined
          : typeof state.clientCompanyId === "number" && state.clientCompanyId > 0
            ? state.clientCompanyId
            : undefined,
      forEmployerPerspective: state.creationPerspective === "employer",
    },
    { enabled: employerEmployeesEnabled }
  );

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

  const clientReadyClientPerspective =
    typeof state.clientCompanyId === "number" &&
    state.clientCompanyId > 0 &&
    typeof state.employerCompanyId === "number" &&
    state.employerCompanyId > 0 &&
    state.clientCompanyId !== state.employerCompanyId;

  const clientReadyEmployerPerspective =
    typeof state.employerCompanyId === "number" &&
    state.employerCompanyId > 0 &&
    (state.clientSelectionKind === "platform"
      ? typeof state.clientCompanyId === "number" && state.clientCompanyId > 0
      : state.clientSelectionKind === "external_party" && state.clientPartyId.length > 0);

  const canSubmit =
    (state.creationPerspective === "client" ? clientReadyClientPerspective : clientReadyEmployerPerspective) &&
    typeof state.promoterEmployeeId === "number" &&
    state.promoterEmployeeId > 0 &&
    state.locationEn.trim().length > 0 &&
    state.locationAr.trim().length > 0 &&
    state.effectiveDate.length > 0 &&
    state.expiryDate.length > 0;

  return {
    state,
    set,
    setClient,
    setEmployer,
    setClientFromFlowOption,
    reset,
    onSelectEmployee,
    onSelectSite,
    canSubmit,
    creationPerspective,
    pickers,
    pickersLoading,
    flowClientOptions,
    flowClientOptionsLoading,
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

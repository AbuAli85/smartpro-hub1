/**
 * Contract Management System — shared types.
 *
 * ADR-001 (role model):
 *   first_party  = client (owns the work location / site)
 *   second_party = employer / vendor (supplies the promoter employee)
 *   promoter     = employee of the second_party assigned to work at first_party's site
 *   Company role is determined per-contract record, never by which company is logged in.
 */

// ─── PARTY ROLES ──────────────────────────────────────────────────────────────

export const PARTY_ROLES = ["first_party", "second_party", "third_party"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

// ─── CONTRACT STATUSES ────────────────────────────────────────────────────────

export const CONTRACT_STATUSES = [
  "draft",
  "active",
  "expired",
  "terminated",
  "renewed",
  "suspended",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

// ─── TRANSITION MAP ───────────────────────────────────────────────────────────
//
// Defines every valid status → status move.
// Every status change MUST pass through validateStatusTransition() before
// being written to the database.  No raw status updates should bypass this.
//
//   draft      → active        (activate: first-party confirmation)
//   draft      → terminated    (discard before activating)
//   active     → expired       (system: lazy-expire when expiryDate < now)
//   active     → terminated    (actor: terminate action)
//   active     → renewed       (system: marked when a renewal contract is created)
//   active     → suspended     (admin: manual suspension)
//   expired    → renewed       (actor: renew from expired contract)
//   suspended  → active        (admin: reactivate)
//   suspended  → terminated    (admin: terminate while suspended)
//   terminated → (terminal, no transitions)
//   renewed    → (terminal, no transitions)

export const ALLOWED_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft:      ["active", "terminated"],
  active:     ["expired", "terminated", "renewed", "suspended"],
  expired:    ["renewed"],
  terminated: [],
  renewed:    [],
  suspended:  ["active", "terminated"],
} as const;

/** Thrown when a requested status change violates the transition rules. */
export class ContractTransitionError extends Error {
  constructor(from: ContractStatus, to: ContractStatus) {
    super(
      `Cannot transition contract from "${from}" to "${to}". ` +
        `Allowed transitions from "${from}": [${(ALLOWED_TRANSITIONS[from] as readonly string[]).join(", ") || "none — terminal state"}].`
    );
    this.name = "ContractTransitionError";
  }
}

/**
 * Validates a status transition.
 * Throws `ContractTransitionError` if the transition is not allowed.
 * Returns silently if valid.
 */
export function validateStatusTransition(
  from: ContractStatus,
  to: ContractStatus
): void {
  if (from === to) return; // no-op transitions are always safe
  if (!(ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to)) {
    throw new ContractTransitionError(from, to);
  }
}

// ─── STATUS CLASSIFICATION ────────────────────────────────────────────────────

/**
 * Statuses that are set exclusively by system processes.
 *
 * "expired"  — set by lazy-expire when expiryDate < today.
 * "renewed"  — set by the renew flow when a successor contract is created.
 *
 * These MUST NOT be accepted as user input in the `update` mutation or any
 * direct status-change endpoint.  Attempting to set them manually will be
 * rejected with a BAD_REQUEST error.
 */
export const SYSTEM_ONLY_STATUSES = ["expired", "renewed"] as const satisfies ReadonlyArray<ContractStatus>;
export type SystemOnlyStatus = (typeof SYSTEM_ONLY_STATUSES)[number];

/**
 * Terminal statuses — contracts in these states are permanently sealed.
 *
 * "terminated" — manually ended by a party.
 * "renewed"    — superseded by a successor contract.
 *
 * No field edits (dates, location, identity, etc.) are allowed once a contract
 * reaches a terminal state.  Status transitions are also blocked (the transition
 * map enforces this independently, but this constant makes the intent explicit).
 */
export const TERMINAL_STATUSES = ["terminated", "renewed"] as const satisfies ReadonlyArray<ContractStatus>;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/**
 * Statuses a user may set directly via the `update` mutation.
 * = all statuses minus system-only statuses.
 *
 * Note: even USER_WRITABLE_STATUSES are subject to the transition map —
 * only valid moves from the current state are accepted.
 */
export const USER_WRITABLE_STATUSES = CONTRACT_STATUSES.filter(
  (s) => !(SYSTEM_ONLY_STATUSES as readonly string[]).includes(s)
) as ContractStatus[];

/** Returns true when a status is set exclusively by the system (never by a user). */
export function isSystemOnlyStatus(s: ContractStatus): boolean {
  return (SYSTEM_ONLY_STATUSES as readonly string[]).includes(s);
}

/**
 * Returns true when a contract in this status is permanently immutable.
 * Terminal contracts reject all field edits and further status changes.
 */
export function isTerminalStatus(s: ContractStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

// ─── STATUS METADATA (shared with frontend via types) ─────────────────────────

export const STATUS_META: Record<
  ContractStatus,
  { label: string; description: string; isTerminal: boolean; color: string }
> = {
  draft: {
    label: "Draft",
    description: "Created but not yet confirmed. Can be activated or discarded.",
    isTerminal: false,
    color: "zinc",
  },
  active: {
    label: "Active",
    description: "Confirmed and in effect.",
    isTerminal: false,
    color: "emerald",
  },
  expired: {
    label: "Expired",
    description: "Past expiry date. Can be renewed.",
    isTerminal: false,
    color: "red",
  },
  terminated: {
    label: "Terminated",
    description: "Manually terminated. No further changes possible.",
    isTerminal: true,
    color: "gray",
  },
  renewed: {
    label: "Renewed",
    description: "Superseded by a new contract. No further changes possible.",
    isTerminal: true,
    color: "blue",
  },
  suspended: {
    label: "Suspended",
    description: "Temporarily suspended. Can be reactivated or terminated.",
    isTerminal: false,
    color: "amber",
  },
};

// ─── DOCUMENT KINDS ───────────────────────────────────────────────────────────

export const CONTRACT_DOCUMENT_KINDS = [
  /** System-generated bilingual PDF — produced by the document generation service. */
  "generated_pdf",
  /** User-uploaded signed copy of the printed/scanned contract. */
  "signed_contract_pdf",
  /** Promoter passport bio-page scan (PDF or image). */
  "passport_copy",
  /** Promoter civil ID / national ID card scan (PDF or image). */
  "id_card_copy",
  /** Any other supporting attachment. */
  "attachment",
  // Legacy kind values — kept so existing DB rows remain valid
  "signed_pdf",
  "id_copy",
] as const;
export type ContractDocumentKind = (typeof CONTRACT_DOCUMENT_KINDS)[number];

/** Which kinds a user can upload (system-generated kinds are excluded). */
export const UPLOADABLE_DOCUMENT_KINDS = [
  "signed_contract_pdf",
  "passport_copy",
  "id_card_copy",
  "attachment",
] as const;
export type UploadableDocumentKind = (typeof UPLOADABLE_DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_META: Record<
  UploadableDocumentKind,
  {
    label: string;
    description: string;
    /** MIME types accepted by the file picker */
    acceptMime: string[];
    /** Human-readable accept string for <input accept=""> */
    acceptAttr: string;
    maxSizeMb: number;
    icon: "file-text" | "shield" | "id-card" | "paperclip";
  }
> = {
  signed_contract_pdf: {
    label: "Signed Contract",
    description: "Scanned or electronically signed copy of the executed contract.",
    acceptMime: ["application/pdf"],
    acceptAttr: ".pdf",
    maxSizeMb: 20,
    icon: "file-text",
  },
  passport_copy: {
    label: "Passport Copy",
    description: "Promoter's passport bio-data page (PDF or clear photo).",
    acceptMime: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp",
    maxSizeMb: 10,
    icon: "shield",
  },
  id_card_copy: {
    label: "ID Card Copy",
    description: "Promoter's civil ID / national ID card — both sides if applicable.",
    acceptMime: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp",
    maxSizeMb: 10,
    icon: "id-card",
  },
  attachment: {
    label: "Attachment",
    description: "Any other supporting document.",
    acceptMime: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    acceptAttr: ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx",
    maxSizeMb: 20,
    icon: "paperclip",
  },
};

// ─── AUDIT EVENT ACTIONS ──────────────────────────────────────────────────────

export const CONTRACT_EVENT_ACTIONS = [
  "created",
  "activated",
  "edited",
  "pdf_generated",
  "signed_uploaded",
  "renewed",
  "terminated",
  "suspended",
  "expired",
  "status_changed",
  "expiry_alerted",
  "document_uploaded",
  "document_deleted",
] as const;
export type ContractEventAction = (typeof CONTRACT_EVENT_ACTIONS)[number];

// ─── INPUT TYPES ──────────────────────────────────────────────────────────────

export type CreateOutsourcingContractInput = {
  contractTypeId: "promoter_assignment";
  clientCompanyId: number;
  employerCompanyId: number;
  promoterEmployeeId: number;
  /** Work location — free-text bilingual fields, authoritative for PDF */
  locationEn: string;
  locationAr: string;
  /** Optional: pre-filled from an attendance site on the client */
  clientSiteId?: number;
  effectiveDate: string;
  expiryDate: string;
  contractNumber?: string;
  issueDate?: string;
  status?: ContractStatus;
  /** Identity snapshot fields — required for production-grade promoter contracts */
  civilId?: string;
  passportNumber?: string;
  passportExpiry?: string;
  nationality?: string;
  jobTitleEn?: string;
  jobTitleAr?: string;
};

export type UpdateOutsourcingContractInput = {
  id: string;
  locationEn?: string;
  locationAr?: string;
  effectiveDate?: string;
  expiryDate?: string;
  contractNumber?: string;
  issueDate?: string;
  status?: ContractStatus;
  civilId?: string;
  passportNumber?: string;
  passportExpiry?: string;
  nationality?: string;
  jobTitleEn?: string;
  jobTitleAr?: string;
};

// ─── OUTPUT / ROW TYPES ───────────────────────────────────────────────────────

export type OutsourcingContractRow = {
  id: string;
  contractTypeId: string;
  /** Contract header tenant anchor; NULL when first party was external-only at creation. */
  companyId: number | null;
  contractNumber: string | null;
  status: string;
  issueDate: Date | string | null;
  effectiveDate: Date | string;
  expiryDate: Date | string;
  generatedPdfUrl: string | null;
  signedPdfUrl: string | null;
  renewalOfContractId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  // Joined fields
  firstPartyCompanyId: number | null;
  firstPartyName: string;
  firstPartyNameAr: string | null;
  firstPartyRegNumber: string | null;
  secondPartyCompanyId: number | null;
  secondPartyName: string;
  secondPartyNameAr: string | null;
  secondPartyRegNumber: string | null;
  // Location
  locationEn: string | null;
  locationAr: string | null;
  clientSiteId: number | null;
  // Promoter
  promoterEmployeeId: number;
  promoterName: string;
  promoterNameAr: string | null;
  civilId: string | null;
  passportNumber: string | null;
  passportExpiry: Date | string | null;
  nationality: string | null;
  jobTitleEn: string | null;
};

// ─── DOCUMENT CONTEXT FOR PDF GENERATION ─────────────────────────────────────
// Used by the document generation service to build placeholder values.
//
// Agreement lifecycle: renewals carry `party_id` via `createOutsourcingContractFull` from prior rows.
// Future amendments may use `outsourcing_contracts.metadata` keys such as `amendsContractId` (staged).

export type OutsourcingContractDocumentContext = {
  first_party: {
    company_name_en: string;
    company_name_ar: string;
    cr_number: string;
  };
  second_party: {
    company_name_en: string;
    company_name_ar: string;
    cr_number: string;
  };
  promoter: {
    full_name_en: string;
    full_name_ar: string;
    id_card_number: string;
    passport_number: string;
    passport_expiry: string;
    nationality: string;
    job_title_en: string;
  };
  assignment: {
    location_en: string;
    location_ar: string;
    start_date: string;
    end_date: string;
    contract_reference_number?: string;
    issue_date?: string;
  };
};

// ─── REQUIRED DOCUMENTS BY CONTRACT TYPE ─────────────────────────────────────

/**
 * Per-contract-type list of required document kinds.
 *
 * When `getContractKpis` builds the "missing documents" risk list it looks up
 * this registry using `row.contractTypeId`.  Adding a new contract type only
 * requires an entry here — no changes to the aggregation logic.
 *
 * Keys must match values stored in `outsourcing_contracts.contract_type_id`.
 */
export const REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE: Readonly<
  Record<string, ReadonlyArray<{ readonly kind: string; readonly label: string }>>
> = {
  promoter_assignment: [
    { kind: "signed_contract_pdf", label: "Signed Contract" },
    { kind: "passport_copy",       label: "Passport Copy" },
    { kind: "id_card_copy",        label: "ID Card Copy" },
  ],
  // Future contract types: add entries here.
  // Each entry's `kind` must match a value in CONTRACT_DOCUMENT_KINDS.
} as const;

/**
 * Fallback required-document list used when a contract type has no explicit
 * entry in REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE.
 */
export const DEFAULT_REQUIRED_DOCUMENTS: ReadonlyArray<{
  readonly kind: string;
  readonly label: string;
}> = REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE["promoter_assignment"]!;

// ─── REQUIRED IDENTITY FIELDS BY CONTRACT TYPE ────────────────────────────────

/**
 * Fields on OutsourcingContractRow (promoter detail) that must be populated
 * for a contract to be considered "identity-complete".
 *
 * Mapped per contract type so future types (offer_letter, etc.) can define
 * their own required fields.  `field` must be a key of OutsourcingContractRow.
 *
 * Checked by `scoreContractCompliance` — a null / empty-string field counts
 * as missing and contributes a proportional identity penalty.
 */
export const REQUIRED_IDENTITY_FIELDS_BY_CONTRACT_TYPE: Readonly<
  Record<
    string,
    ReadonlyArray<{
      readonly field: "civilId" | "passportNumber" | "passportExpiry" | "nationality" | "jobTitleEn";
      readonly label: string;
    }>
  >
> = {
  promoter_assignment: [
    { field: "civilId",        label: "Civil ID" },
    { field: "passportNumber", label: "Passport Number" },
    { field: "passportExpiry", label: "Passport Expiry" },
    { field: "nationality",    label: "Nationality" },
    { field: "jobTitleEn",     label: "Job Title" },
  ],
  // Future types: add entries here.
} as const;

/** Fallback when contract type has no explicit entry. */
export const DEFAULT_REQUIRED_IDENTITY_FIELDS: ReadonlyArray<{
  readonly field: "civilId" | "passportNumber" | "passportExpiry" | "nationality" | "jobTitleEn";
  readonly label: string;
}> = REQUIRED_IDENTITY_FIELDS_BY_CONTRACT_TYPE["promoter_assignment"]!;

// ─── COMPLIANCE SCORING ───────────────────────────────────────────────────────

/**
 * Penalty weights that drive `scoreContractCompliance`.
 *
 * Total maximum penalty = 100 (score can reach 0).
 *
 *   expired        — contract has lapsed (big issue; needs renewal)
 *   missingDocs    — missing one or more required documents (proportional)
 *   missingIdentity— missing one or more required identity fields (proportional)
 *   expiringSoon   — active, expiring within 30 days (proportional to urgency)
 *
 * All values are exported so the frontend can show a "scoring legend" without
 * duplicating the weights.
 */
export const COMPLIANCE_PENALTY_WEIGHTS = {
  expired:         40,
  missingDocs:     30,
  missingIdentity: 20,
  expiringSoon:    10,
} as const;

/**
 * Statuses included in compliance scoring.
 *
 * "draft", "terminated", "renewed" are intentionally excluded:
 *   - draft      = not yet operational; penalising it distorts the score.
 *   - terminated = historical record; no longer relevant to operations.
 *   - renewed    = superseded; the successor contract is what matters.
 */
export const COMPLIANCE_SCORABLE_STATUSES: ReadonlyArray<ContractStatus> = [
  "active",
  "expired",
  "suspended",
] as const;

/** Compliance band thresholds (inclusive lower bound). */
export const COMPLIANCE_BANDS = {
  excellent: 90,
  good:      70,
  fair:      50,
  // poor: 0–49 (everything below `fair`)
} as const;

/** Per-contract compliance score and breakdown. */
export interface ContractComplianceScore {
  id:             string;
  contractNumber: string | null;
  promoterName:   string;
  /** Effective status used for scoring (may differ from stored status). */
  effectiveStatus: ContractStatus;
  /** 0–100.  Higher = more compliant. */
  score: number;
  /**
   * Non-zero penalty components.
   * The sum of all values equals `100 - score` (before clamping).
   */
  penalties: {
    expired?:          number;
    missingDocuments?: number;
    missingIdentity?:  number;
    expiringSoon?:     number;
  };
  /** Required document kinds that are absent (canonical label strings). */
  missingDocuments:     string[];
  /** Required identity field labels that are absent or empty. */
  missingIdentityFields: string[];
}

/**
 * Portfolio-level compliance summary returned inside `ContractKpis`.
 *
 * `overallScore` is the mean score across all scorable contracts
 * (active + expired + suspended).  100 = fully compliant.
 *
 * `perContract` contains up to 50 scorable contracts sorted by score
 * ascending (worst first) — an immediately actionable list.
 */
export interface ComplianceKpis {
  /** Mean compliance score across all scorable contracts (0–100). */
  overallScore: number;
  /** Number of contracts included in the score (active + expired + suspended). */
  scorableCount: number;
  /**
   * Count of contracts in each compliance band.
   * All four counts sum to `scorableCount`.
   */
  bands: {
    excellent: number;  // 90–100
    good:      number;  // 70–89
    fair:      number;  // 50–69
    poor:      number;  // 0–49
  };
  /**
   * Per-contract scores sorted ascending by score (worst compliance first).
   * Capped at 50 entries; the overall score covers the full population.
   */
  perContract: ContractComplianceScore[];
}

// ─── CONTRACT KPIs ────────────────────────────────────────────────────────────

/** Shape returned by `getContractKpis` / `aggregateKpisFromRows`. */
export interface ContractKpis {
  /**
   * Scope metadata.
   *   - scope="company" — results are filtered to the `companyId`'s visibility.
   *   - scope="platform" — results span all tenants (platform admin only).
   *   - generatedAt — ISO-8601 timestamp so the client can show data freshness.
   */
  meta: {
    scope: "company" | "platform";
    /** null when scope="platform" */
    companyId: number | null;
    generatedAt: string;
  };

  totals: {
    /** Total rows in the result set (all statuses). */
    total: number;
    /**
     * Contracts whose *effective* status is "active":
     * stored status = "active" AND expiryDate >= today (UTC).
     * Contracts that are stored "active" but past their expiry are counted in
     * `expired` instead, even if lazy-expire hasn't run yet.
     */
    active: number;
    draft: number;
    /**
     * Active contracts (effective) whose expiryDate falls within the next
     * 30 calendar days (UTC).  Always a subset of `active`.
     */
    expiringIn30Days: number;
    /**
     * Effective expired count — includes:
     *   (a) rows with stored status = "expired"
     *   (b) rows with stored status = "active" whose expiryDate < today (UTC)
     *       (lazy-expire hasn't fired yet, but they are effectively expired)
     */
    expired: number;
    /**
     * Contracts stored as "active" but past their expiry date and not yet
     * updated by lazy-expire.  Subset of `expired`.
     * Useful for monitoring data staleness (should remain near 0 in a healthy
     * system where users regularly open contract detail pages).
     */
    storedActiveEffectivelyExpired: number;
    terminated: number;
    /**
     * Suspended contracts.  This status is supported by the transition map
     * (active → suspended → active/terminated) but requires a manual status
     * update via the `update` mutation (no dedicated `suspend` mutation exists
     * in Phase 1 — that is intentional; suspension is an admin-only action).
     */
    suspended: number;
    renewed: number;
  };

  /** Distinct count of promoter employees with at least one *effectively active* contract. */
  promotersDeployed: number;

  /**
   * Contract counts grouped by first-party (client) company.
   * Uses *effective* active count.  Sorted descending by total; capped at 10.
   */
  contractsPerCompany: Array<{
    companyId: number | null;
    companyName: string;
    total: number;
    active: number;
  }>;

  /**
   * Effectively-active contracts whose expiryDate falls within the next 30 days.
   * Sorted ascending by days remaining; capped at 15.
   */
  expiringSoon: Array<{
    id: string;
    contractNumber: string | null;
    promoterName: string;
    firstPartyName: string;
    expiryDate: string;
    daysLeft: number;
  }>;

  /**
   * Effectively-active contracts missing one or more required document kinds.
   * Required kinds are looked up from REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE
   * using the contract's contractTypeId.  Capped at 20 entries.
   */
  missingDocuments: Array<{
    id: string;
    contractNumber: string | null;
    promoterName: string;
    missingKinds: string[];
  }>;

  /**
   * Portfolio compliance score and per-contract breakdown.
   * Scoring covers active + expired + suspended contracts.
   * Draft, terminated, and renewed contracts are excluded.
   */
  compliance: ComplianceKpis;
}

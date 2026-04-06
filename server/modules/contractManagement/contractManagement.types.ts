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
  companyId: number;
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

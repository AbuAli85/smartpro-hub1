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

// ─── DOCUMENT KINDS ───────────────────────────────────────────────────────────

export const CONTRACT_DOCUMENT_KINDS = [
  "generated_pdf",
  "signed_pdf",
  "passport_copy",
  "id_copy",
  "attachment",
] as const;
export type ContractDocumentKind = (typeof CONTRACT_DOCUMENT_KINDS)[number];

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

import type { User } from "../../../drizzle/schema";

/** Normalized context for promoter assignment contracts (placeholder source paths). */
export type PromoterAssignmentDocumentContext = {
  first_party: {
    company_name_ar: string;
    company_name_en: string;
    cr_number: string;
  };
  second_party: {
    company_name_ar: string;
    company_name_en: string;
    cr_number: string;
  };
  promoter: {
    full_name_ar: string;
    full_name_en: string;
    id_card_number: string;
  };
  assignment: {
    location_ar: string;
    location_en: string;
    start_date: string;
    end_date: string;
    contract_reference_number?: string;
    issue_date?: string;
  };
};

export type DocumentGenerationErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export class DocumentGenerationError extends Error {
  readonly code: DocumentGenerationErrorCode;
  readonly missingPlaceholders?: string[];
  readonly causeDetail?: unknown;

  constructor(
    code: DocumentGenerationErrorCode,
    message: string,
    options?: { missingPlaceholders?: string[]; cause?: unknown }
  ) {
    super(message);
    this.name = "DocumentGenerationError";
    this.code = code;
    this.missingPlaceholders = options?.missingPlaceholders;
    this.causeDetail = options?.cause;
  }
}

export type GenerateDocumentInput = {
  templateKey: string;
  entityId: string;
  outputFormat: "pdf";
  actorUserId: number;
  user: User;
  activeCompanyId: number;
  membershipRole: string;
};

export type GenerateDocumentResult = {
  documentId: string;
  fileUrl: string;
  filePath: string;
  generatedGoogleDocId: string;
  missingFields: string[];
};

export type AuthLikeContext = {
  user: User;
  activeCompanyId: number;
  membershipRole: string;
};

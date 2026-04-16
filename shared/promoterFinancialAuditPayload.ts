/**
 * Phase 3.5 — structured, queryable audit payloads for promoter financial execution.
 * Keys are stable; extend with optional fields only when needed.
 */

export type PromoterFinancialAuditPayload = {
  companyId: number;
  actorUserId: number | null;
  /** ISO timestamp when the action was taken (client may also use audit row createdAt). */
  occurredAt: string;
  /** Payroll run or promoter invoice id */
  entityNumericId: number;
  entityKind: "promoter_payroll_run" | "promoter_invoice";
  periodStartYmd?: string;
  periodEndYmd?: string;
  fromStatus?: string;
  toStatus?: string;
  clientCompanyId?: number;
  brandCompanyId?: number;
  siteId?: number | null;
  assignmentIdsSample?: string[];
  acceptedWarningKeys?: string[];
  reviewerNote?: string | null;
  financialTotals?: {
    totalAccruedOmr?: number;
    totalInvoiceOmr?: number;
    lineCount?: number;
  };
  artifact?: {
    kind: "payroll_csv" | "invoice_html";
    storageKey?: string | null;
    storageUrl?: string | null;
    exportGeneration?: number;
    immutableAfter?: boolean;
  };
  sourceStagingSummary?: {
    periodStartYmd: string;
    periodEndYmd: string;
    includedRowCount?: number;
  };
};

export function buildFinancialAuditPayload(p: PromoterFinancialAuditPayload): Record<string, unknown> {
  return { ...p, schemaVersion: 1 as const };
}

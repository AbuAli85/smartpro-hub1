/**
 * Document context builder for outsourcing_contract entity type.
 * Reads from the new normalized tables (outsourcing_contracts, parties, locations,
 * promoter_details) and builds placeholder values for PDF generation.
 *
 * Registered with the document generation service via the context-builder registry.
 */

import { and, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import {
  companies,
  outsourcingContractLocations,
  outsourcingContractParties,
  outsourcingContracts,
  outsourcingPromoterDetails,
} from "../../../drizzle/schema";
import { DocumentGenerationError } from "../document-generation/documentGeneration.types";
import type { getDb } from "../../db";
import type { OutsourcingContractDocumentContext } from "./contractManagement.types";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function sqlDateToIso(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

function nonEmpty(label: string, v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) {
    throw new DocumentGenerationError("VALIDATION_ERROR", `${label} is required for contract PDF generation`);
  }
  return s;
}

function maybeEmpty(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Build placeholder context for an outsourcing contract (promoter_assignment type).
 * Tenant rule: contract is accessible if the active company is the first_party,
 * second_party, or employer of the promoter — or if the user is a platform admin.
 */
export async function buildOutsourcingContractDocumentContext(
  db: AppDb,
  entityId: string,
  activeCompanyId: number,
  isPlatformAdmin: boolean
): Promise<OutsourcingContractDocumentContext> {
  const [contract] = await db
    .select()
    .from(outsourcingContracts)
    .where(eq(outsourcingContracts.id, entityId))
    .limit(1);

  if (!contract) {
    throw new DocumentGenerationError("NOT_FOUND", "Outsourcing contract not found");
  }

  // Tenant check: visible if active company is first_party, second_party, or employer
  if (!isPlatformAdmin) {
    const parties = await db
      .select({ companyId: outsourcingContractParties.companyId })
      .from(outsourcingContractParties)
      .where(eq(outsourcingContractParties.contractId, entityId));

    const [promoterDetail] = await db
      .select({ employerCompanyId: outsourcingPromoterDetails.employerCompanyId })
      .from(outsourcingPromoterDetails)
      .where(eq(outsourcingPromoterDetails.contractId, entityId))
      .limit(1);

    const involvedCompanyIds = new Set<number>();
    if (contract.companyId != null) involvedCompanyIds.add(contract.companyId);
    for (const p of parties) {
      if (p.companyId != null) involvedCompanyIds.add(p.companyId);
    }
    if (promoterDetail?.employerCompanyId != null) {
      involvedCompanyIds.add(promoterDetail.employerCompanyId);
    }

    if (!involvedCompanyIds.has(activeCompanyId)) {
      throw new DocumentGenerationError(
        "FORBIDDEN",
        "This contract does not belong to your active company"
      );
    }
  }

  // Load parties
  const partyRows = await db
    .select()
    .from(outsourcingContractParties)
    .where(eq(outsourcingContractParties.contractId, entityId));

  const firstPartyRow = partyRows.find((p) => p.partyRole === "first_party");
  const secondPartyRow = partyRows.find((p) => p.partyRole === "second_party");

  if (!firstPartyRow || !secondPartyRow) {
    throw new DocumentGenerationError(
      "INTERNAL_ERROR",
      "Contract is missing first_party or second_party record"
    );
  }

  // Load location (belongs_to_party_role = first_party)
  const [locationRow] = await db
    .select()
    .from(outsourcingContractLocations)
    .where(
      and(
        eq(outsourcingContractLocations.contractId, entityId),
        eq(outsourcingContractLocations.belongsToPartyRole, "first_party")
      )
    )
    .limit(1);

  if (!locationRow) {
    throw new DocumentGenerationError(
      "INTERNAL_ERROR",
      "Contract is missing work location record"
    );
  }

  // Load promoter details
  const [promoterDetail] = await db
    .select()
    .from(outsourcingPromoterDetails)
    .where(eq(outsourcingPromoterDetails.contractId, entityId))
    .limit(1);

  if (!promoterDetail) {
    throw new DocumentGenerationError(
      "NOT_FOUND",
      "Contract is missing promoter details record"
    );
  }

  const firstCr = (firstPartyRow.registrationNumber ?? "").trim() || "—";
  const secondCr = (secondPartyRow.registrationNumber ?? "").trim() || "—";

  const ctx: OutsourcingContractDocumentContext = {
    first_party: {
      company_name_en: nonEmpty("First party English name", firstPartyRow.displayNameEn),
      company_name_ar: nonEmpty("First party Arabic name", firstPartyRow.displayNameAr ?? firstPartyRow.displayNameEn),
      cr_number: firstCr,
    },
    second_party: {
      company_name_en: nonEmpty("Second party English name", secondPartyRow.displayNameEn),
      company_name_ar: nonEmpty("Second party Arabic name", secondPartyRow.displayNameAr ?? secondPartyRow.displayNameEn),
      cr_number: secondCr,
    },
    promoter: {
      full_name_en: nonEmpty("Promoter English name", promoterDetail.fullNameEn),
      full_name_ar: nonEmpty("Promoter Arabic name", promoterDetail.fullNameAr ?? promoterDetail.fullNameEn),
      id_card_number: nonEmpty("Promoter civil ID / national ID", promoterDetail.civilId ?? promoterDetail.passportNumber),
      passport_number: maybeEmpty(promoterDetail.passportNumber),
      passport_expiry: sqlDateToIso(promoterDetail.passportExpiry),
      nationality: maybeEmpty(promoterDetail.nationality),
      job_title_en: maybeEmpty(promoterDetail.jobTitleEn),
    },
    assignment: {
      location_en: nonEmpty("Work location (English)", locationRow.locationEn),
      location_ar: nonEmpty("Work location (Arabic)", locationRow.locationAr),
      start_date: sqlDateToIso(contract.effectiveDate),
      end_date: sqlDateToIso(contract.expiryDate),
    },
  };

  if (contract.contractNumber?.trim()) {
    ctx.assignment.contract_reference_number = contract.contractNumber.trim();
  }
  if (contract.issueDate) {
    ctx.assignment.issue_date = sqlDateToIso(contract.issueDate);
  }

  return ctx;
}

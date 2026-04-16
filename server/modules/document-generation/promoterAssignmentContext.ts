import { and, eq, inArray } from "drizzle-orm";
import {
  companies,
  employees,
  promoterAssignments,
} from "../../../drizzle/schema";
import { format } from "date-fns";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { getDb } from "../../db";
import { DocumentGenerationError, type PromoterAssignmentDocumentContext } from "./documentGeneration.types";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function sqlDateToIso(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

function nonEmptyOrThrow(label: string, v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) {
    throw new DocumentGenerationError("VALIDATION_ERROR", `${label} is required`);
  }
  return s;
}

/**
 * Loads promoter assignment and related companies/employee for document placeholders.
 * Enforces tenant: assignment must belong to active company OR user is platform admin
 * and assignment involves that company as first/second party.
 */
export async function buildPromoterAssignmentDocumentContext(
  db: AppDb,
  entityId: string,
  activeCompanyId: number,
  user: { id: number; role?: string | null; platformRole?: string | null }
): Promise<PromoterAssignmentDocumentContext> {
  const [row] = await db
    .select()
    .from(promoterAssignments)
    .where(eq(promoterAssignments.id, entityId))
    .limit(1);

  if (!row) {
    throw new DocumentGenerationError("NOT_FOUND", "Promoter assignment not found");
  }

  const isPlatform = canAccessGlobalAdminProcedures(user);

  if (!isPlatform) {
    // ADR-001: a contract is accessible by the first_party OR the second_party.
    // companyId is always set to the first_party; secondPartyCompanyId gives the
    // employer access. Previously only companyId was checked, blocking the employer.
    const isFirstParty = row.companyId === activeCompanyId;
    const isSecondParty = row.secondPartyCompanyId === activeCompanyId;

    if (!isFirstParty && !isSecondParty) {
      throw new DocumentGenerationError(
        "FORBIDDEN",
        "Promoter assignment does not involve your active company"
      );
    }
  }

  const companyIds = [row.firstPartyCompanyId, row.secondPartyCompanyId];
  const coRows = await db
    .select()
    .from(companies)
    .where(inArray(companies.id, companyIds));

  const byId = new Map(coRows.map((c) => [c.id, c]));
  const firstParty = byId.get(row.firstPartyCompanyId);
  const secondParty = byId.get(row.secondPartyCompanyId);
  if (!firstParty || !secondParty) {
    throw new DocumentGenerationError("INTERNAL_ERROR", "Related company record missing for assignment");
  }

  const empList = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, row.promoterEmployeeId), eq(employees.companyId, row.secondPartyCompanyId)))
    .limit(1);

  const promoter = empList[0];
  if (!promoter) {
    throw new DocumentGenerationError(
      "NOT_FOUND",
      "Promoter must be an active employee of the employer (second party) company"
    );
  }

  const fullNameEn = nonEmptyOrThrow(
    "Promoter English name",
    `${promoter.firstName ?? ""} ${promoter.lastName ?? ""}`.trim() || null
  );
  const fullNameAr = nonEmptyOrThrow(
    "Promoter Arabic name",
    `${promoter.firstNameAr ?? ""} ${promoter.lastNameAr ?? ""}`.trim() ||
      `${promoter.firstName ?? ""} ${promoter.lastName ?? ""}`.trim()
  );

  const ctx: PromoterAssignmentDocumentContext = {
    first_party: {
      company_name_ar: nonEmptyOrThrow("First party Arabic name", firstParty.nameAr ?? firstParty.name),
      company_name_en: nonEmptyOrThrow("First party English name", firstParty.name),
      cr_number: nonEmptyOrThrow("First party CR number", firstParty.crNumber ?? firstParty.registrationNumber),
    },
    second_party: {
      company_name_ar: nonEmptyOrThrow("Second party Arabic name", secondParty.nameAr ?? secondParty.name),
      company_name_en: nonEmptyOrThrow("Second party English name", secondParty.name),
      cr_number: nonEmptyOrThrow("Second party CR number", secondParty.crNumber ?? secondParty.registrationNumber),
    },
    promoter: {
      full_name_ar: fullNameAr,
      full_name_en: fullNameEn,
      id_card_number: nonEmptyOrThrow("Promoter ID card number", promoter.nationalId ?? promoter.passportNumber),
    },
    assignment: {
      location_ar: nonEmptyOrThrow("Location (Arabic)", row.locationAr),
      location_en: nonEmptyOrThrow("Location (English)", row.locationEn),
      start_date: sqlDateToIso(row.startDate ?? new Date()),
      end_date: sqlDateToIso(row.endDate ?? new Date()),
    },
  };

  if (row.contractReferenceNumber?.trim()) {
    ctx.assignment.contract_reference_number = row.contractReferenceNumber.trim();
  }
  if (row.issueDate) {
    ctx.assignment.issue_date = sqlDateToIso(row.issueDate);
  }

  return ctx;
}

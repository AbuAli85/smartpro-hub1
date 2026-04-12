import { HR_LETTERS, memberHasHrLetterPermission } from "../hrLetterPermissions";
import { isSensitiveLetter } from "./meta";
import type { LetterFieldPayload, LetterLanguageMode, OfficialLetterType } from "./types";

export type ReadinessInput = {
  letterType: OfficialLetterType;
  language: LetterLanguageMode;
  fields: LetterFieldPayload;
  issuedTo: string;
  purpose: string;
  company: {
    name: string;
    nameAr?: string | null;
    crNumber?: string | null;
    address?: string | null;
    city?: string | null;
  };
  employee: {
    firstName: string;
    lastName: string;
    firstNameAr?: string | null;
    lastNameAr?: string | null;
    position?: string | null;
    department?: string | null;
    salary?: string | null;
    hireDate?: Date | null;
    status?: string | null;
    nationalId?: string | null;
    passportNumber?: string | null;
  };
  signatory: { nameEn: string; nameAr?: string | null; titleEn: string; titleAr?: string | null } | null;
  /** When false, only check draft-level rules (employee + type). */
  forOfficialIssue: boolean;
};

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

export function validateLetterReadiness(input: ReadinessInput): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const { letterType, language, company, employee, signatory, fields, issuedTo, purpose, forOfficialIssue } = input;

  if (!nonEmpty(company.name)) missing.push("Company legal name (English)");
  if (!nonEmpty(company.crNumber)) missing.push("Commercial Registration (CR) number");
  const addr = [company.address, company.city].filter(Boolean).join(", ").trim();
  if (!nonEmpty(addr)) missing.push("Company address");

  if (!nonEmpty(employee.firstName) || !nonEmpty(employee.lastName)) missing.push("Employee full name (English)");

  if (forOfficialIssue) {
    if (!signatory || !nonEmpty(signatory.nameEn) || !nonEmpty(signatory.titleEn)) {
      missing.push("Authorised signatory (English name and title)");
    }
    if (language === "ar" || language === "both") {
      if (!nonEmpty(company.nameAr)) missing.push("Company legal name (Arabic)");
      if (!signatory || !nonEmpty(signatory.nameAr) || !nonEmpty(signatory.titleAr)) {
        missing.push("Authorised signatory (Arabic name and title)");
      }
      if (!nonEmpty(employee.firstNameAr) || !nonEmpty(employee.lastNameAr)) {
        missing.push("Employee name in Arabic");
      }
    }
  }

  const issueDateStr = fields.issueDate?.trim();
  if (forOfficialIssue && !nonEmpty(issueDateStr)) {
    missing.push("Issue date");
  }

  if (forOfficialIssue && (letterType === "noc" || letterType === "salary_transfer_letter")) {
    if (!issuedTo.trim()) missing.push("Recipient / addressee (or choose “To Whom It May Concern”)");
  }

  switch (letterType) {
    case "salary_certificate":
      if (forOfficialIssue) {
        if (!nonEmpty(employee.position)) missing.push("Employee job title");
        if (!employee.salary || String(employee.salary).trim() === "") missing.push("Employee salary on record");
      }
      break;
    case "employment_verification":
      if (forOfficialIssue && !employee.hireDate) missing.push("Employee hire date");
      break;
    case "noc":
      if (forOfficialIssue) {
        if (!purpose.trim()) missing.push("Purpose of certificate");
        if (!nonEmpty(fields.destination)) missing.push("Destination / purpose detail");
        if (!nonEmpty(fields.validityUntil)) missing.push("Validity period end date");
      }
      break;
    case "experience_letter": {
      if (forOfficialIssue) {
        if (!employee.hireDate) missing.push("Employment start date");
        const ce =
          fields.currentlyEmployed === true ||
          (typeof fields.currentlyEmployed === "string" && fields.currentlyEmployed === "true");
        if (!ce && !nonEmpty(fields.employmentEndDate)) {
          missing.push("Employment end date (or mark as currently employed)");
        }
      }
      break;
    }
    case "promotion_letter":
      if (forOfficialIssue) {
        if (!nonEmpty(fields.previousTitle)) missing.push("Previous job title");
        if (!nonEmpty(fields.newTitle)) missing.push("New job title");
        if (!nonEmpty(fields.promotionEffectiveDate)) missing.push("Promotion effective date");
        if (!nonEmpty(fields.approvalReference)) missing.push("Approval reference / basis");
      }
      break;
    case "salary_transfer_letter":
      if (forOfficialIssue) {
        if (!nonEmpty(fields.bankName)) missing.push("Bank name");
        if (!employee.salary || String(employee.salary).trim() === "") missing.push("Salary on record");
      }
      break;
    case "leave_approval_letter":
      if (forOfficialIssue) {
        if (!nonEmpty(fields.leaveType)) missing.push("Leave type");
        if (!nonEmpty(fields.leaveStart)) missing.push("Leave start date");
        if (!nonEmpty(fields.leaveEnd)) missing.push("Leave end date");
        if (!nonEmpty(fields.returnDate)) missing.push("Expected return date");
      }
      break;
    case "warning_letter":
      if (forOfficialIssue) {
        if (!nonEmpty(fields.incidentDate)) missing.push("Incident date");
        if (!nonEmpty(fields.policyCategory)) missing.push("Policy / issue category");
        if (!nonEmpty(fields.factualSummary)) missing.push("Factual summary");
        if (!nonEmpty(fields.correctiveExpectation)) missing.push("Corrective expectation");
      }
      break;
    default:
      break;
  }

  return { ok: missing.length === 0, missing };
}

export function canIssueSensitiveLetter(
  member: { role: string; permissions: unknown },
  letterType: OfficialLetterType
): boolean {
  if (!isSensitiveLetter(letterType)) return true;
  return memberHasHrLetterPermission(member, HR_LETTERS.SENSITIVE_ISSUE);
}

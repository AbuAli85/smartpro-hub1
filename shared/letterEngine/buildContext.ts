import type { LetterFieldPayload, LetterLanguageMode, OfficialLetterType } from "./types";

/** Runtime values used to fill approved templates (all strings escaped at render time). */
export type LetterRenderContext = {
  letterType: OfficialLetterType;
  language: LetterLanguageMode;
  refNo: string;
  /** English display: "Reference No. SP-SAL-2026-..." */
  referenceLabelEn: string;
  /** Arabic display */
  referenceLabelAr: string;
  dateLineEn: string;
  dateLineAr: string;
  companyNameEn: string;
  companyNameAr: string;
  crNumber: string;
  addressEn: string;
  phone: string;
  email: string;
  employeeNameEn: string;
  employeeNameAr: string;
  position: string;
  department: string;
  salaryFormatted: string;
  currency: string;
  hireDateEn: string;
  hireDateAr: string;
  nationalId: string;
  passportNumber: string;
  employmentStatus: string;
  issuedTo: string;
  purpose: string;
  additionalNotes: string;
  signatoryNameEn: string;
  signatoryNameAr: string;
  signatoryTitleEn: string;
  signatoryTitleAr: string;
  fields: LetterFieldPayload;
};

function fmtDateEn(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtDateAr(d: Date): string {
  return d.toLocaleDateString("ar-OM", { day: "numeric", month: "long", year: "numeric" });
}

export function buildLetterRenderContext(params: {
  letterType: OfficialLetterType;
  language: LetterLanguageMode;
  refNo: string;
  issueDate: Date;
  company: {
    name: string;
    nameAr?: string | null;
    crNumber?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  employee: {
    firstName: string;
    lastName: string;
    firstNameAr?: string | null;
    lastNameAr?: string | null;
    position?: string | null;
    department?: string | null;
    salary?: string | null;
    currency?: string | null;
    hireDate?: Date | null;
    nationalId?: string | null;
    passportNumber?: string | null;
    status?: string | null;
  };
  signatory: {
    nameEn: string;
    nameAr?: string | null;
    titleEn: string;
    titleAr?: string | null;
  } | null;
  issuedTo: string;
  purpose: string;
  additionalNotes: string;
  fields: LetterFieldPayload;
}): LetterRenderContext {
  const { company, employee, signatory, issueDate, refNo, fields, letterType, language } = params;
  const companyNameEn = company.name?.trim() || "";
  const companyNameAr = (company.nameAr ?? "").trim() || companyNameEn;
  const addressEn = [company.address, company.city].filter(Boolean).join(", ") || "";
  const empEn = `${employee.firstName} ${employee.lastName}`.trim();
  const empAr =
    employee.firstNameAr && employee.lastNameAr
      ? `${employee.firstNameAr} ${employee.lastNameAr}`.trim()
      : empEn;
  let salaryFormatted = "—";
  if (employee.salary != null && String(employee.salary).trim() !== "") {
    const n = parseFloat(String(employee.salary));
    if (!Number.isNaN(n)) {
      salaryFormatted = `${employee.currency ?? "OMR"} ${n.toFixed(3)}`;
    }
  }
  const hd = employee.hireDate ? new Date(employee.hireDate) : null;
  return {
    letterType,
    language,
    refNo,
    referenceLabelEn: `Reference No. ${refNo}`,
    referenceLabelAr: `الرقم المرجعي: ${refNo}`,
    dateLineEn: `Date: ${fmtDateEn(issueDate)}`,
    dateLineAr: `التاريخ: ${fmtDateAr(issueDate)}`,
    companyNameEn,
    companyNameAr,
    crNumber: (company.crNumber ?? "").trim(),
    addressEn,
    phone: (company.phone ?? "").trim(),
    email: (company.email ?? "").trim(),
    employeeNameEn: empEn,
    employeeNameAr: empAr,
    position: (employee.position ?? "").trim() || "—",
    department: (employee.department ?? "").trim() || "—",
    salaryFormatted,
    currency: employee.currency ?? "OMR",
    hireDateEn: hd ? fmtDateEn(hd) : "—",
    hireDateAr: hd ? fmtDateAr(hd) : "—",
    nationalId: (employee.nationalId ?? "").trim(),
    passportNumber: (employee.passportNumber ?? "").trim(),
    employmentStatus: employee.status ?? "active",
    issuedTo: params.issuedTo.trim(),
    purpose: params.purpose.trim(),
    additionalNotes: params.additionalNotes.trim(),
    signatoryNameEn: signatory?.nameEn?.trim() ?? "",
    signatoryNameAr: (signatory?.nameAr ?? "").trim() || signatory?.nameEn?.trim() || "",
    signatoryTitleEn: signatory?.titleEn?.trim() ?? "",
    signatoryTitleAr: (signatory?.titleAr ?? "").trim() || signatory?.titleEn?.trim() || "",
    fields: { ...fields },
  };
}

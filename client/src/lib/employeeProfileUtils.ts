/**
 * Shared types and pure helpers for the employee self-service Profile tab.
 *
 * These are intentionally separated from EmployeePortalPage so they can be
 * tested and reused without loading the full portal page.
 */

import { daysUntilExpiry } from "@/lib/dateUtils";

// ─── Typed profile data shape ────────────────────────────────────────────────

/**
 * The subset of employee fields used by the profile tab.
 * Typed from the employees DB row — avoids `any` everywhere.
 */
export interface ProfileEmpData {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  employeeNumber?: string | null;
  status?: string | null;
  employmentType?: string | null;
  position?: string | null;
  department?: string | null;
  managerId?: number | null;
  hireDate?: string | Date | null;
  avatarUrl?: string | null;
  // Payroll
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  // Emergency
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  // Documents / IDs
  passportNumber?: string | null;
  nationalId?: string | null;
  visaNumber?: string | null;
  visaExpiryDate?: string | Date | null;
  workPermitNumber?: string | null;
  workPermitExpiryDate?: string | Date | null;
  pasiNumber?: string | null;
}

// ─── Derived booleans ────────────────────────────────────────────────────────

export function deriveProfileBooleans(emp: ProfileEmpData) {
  return {
    payrollReady: !!(emp.bankName || emp.bankAccountNumber || emp.bankIban),
    hasPhone: !!emp.phone?.trim(),
    hasEmergencyContact: !!(
      emp.emergencyContactName?.trim() || emp.emergencyContactPhone?.trim()
    ),
    hasEmergencyContactFull: !!(
      emp.emergencyContactName?.trim() && emp.emergencyContactPhone?.trim()
    ),
    fullName:
      [emp.firstName, emp.lastName].filter(Boolean).join(" ") || "Employee",
    arabicFullName:
      emp.firstNameAr || emp.lastNameAr
        ? [emp.firstNameAr, emp.lastNameAr].filter(Boolean).join(" ")
        : null,
  };
}

// ─── Employment type formatting ──────────────────────────────────────────────

export function formatEmploymentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Profile completeness ────────────────────────────────────────────────────

export type CompletenessStatus = "complete" | "good" | "incomplete";

export interface ProfileCompletenessItem {
  key: string;
  label: string;
  done: boolean;
  /** Who can fix this: employee via form, or HR team required */
  managedBy: "employee" | "hr";
  hint: string;
}

export interface ProfileCompleteness {
  score: number;
  total: number;
  percent: number;
  status: CompletenessStatus;
  items: ProfileCompletenessItem[];
}

export function computeProfileCompleteness(
  emp: ProfileEmpData,
  opts: { hasDocuments: boolean }
): ProfileCompleteness {
  const items: ProfileCompletenessItem[] = [
    {
      key: "phone",
      label: "Phone number",
      done: !!emp.phone?.trim(),
      managedBy: "employee",
      hint: "Add your phone so HR can reach you",
    },
    {
      key: "emergency_contact",
      label: "Emergency contact",
      done: !!(emp.emergencyContactName?.trim() && emp.emergencyContactPhone?.trim()),
      managedBy: "employee",
      hint: "Add an emergency contact for safety",
    },
    {
      key: "bank",
      label: "Bank details for payroll",
      done: !!(emp.bankName?.trim() || emp.bankAccountNumber?.trim()),
      managedBy: "hr",
      hint: "Contact HR to register your bank details",
    },
    {
      key: "documents",
      label: "Documents on file",
      done: opts.hasDocuments,
      managedBy: "hr",
      hint: "Contact HR to upload your documents",
    },
  ];

  const score = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = Math.round((score / total) * 100);

  let status: CompletenessStatus = "incomplete";
  if (percent === 100) status = "complete";
  else if (percent >= 75) status = "good";

  return { score, total, percent, status, items };
}

// ─── Profile alert model ─────────────────────────────────────────────────────

export interface ProfileAlert {
  key: string;
  severity: "warn" | "info";
  title: string;
  desc: string;
  /** Tab to navigate to when action is taken */
  actionTab?: string;
  /** If true, clicking the action opens the contact edit form */
  actionOpenContactEdit?: boolean;
}

export function computeProfileAlerts(
  emp: ProfileEmpData,
  opts: {
    payrollReady: boolean;
    hasPhone: boolean;
    hasEmergencyContact: boolean;
    expiringDocsCount: number;
  }
): ProfileAlert[] {
  const alerts: ProfileAlert[] = [];

  if (!opts.payrollReady) {
    alerts.push({
      key: "bank",
      severity: "warn",
      title: "Bank details not on file",
      desc: "Your salary cannot be processed. Contact HR to add your bank details.",
    });
  }

  if (!opts.hasPhone) {
    alerts.push({
      key: "phone",
      severity: "warn",
      title: "Phone number missing",
      desc: "Add your phone number so HR and your team can reach you.",
      actionOpenContactEdit: true,
    });
  }

  if (!opts.hasEmergencyContact) {
    alerts.push({
      key: "emergency",
      severity: "info",
      title: "No emergency contact on file",
      desc: "Providing an emergency contact is strongly recommended.",
      actionOpenContactEdit: true,
    });
  }

  if (opts.expiringDocsCount > 0) {
    alerts.push({
      key: "docs",
      severity: "warn",
      title: `${opts.expiringDocsCount} document${opts.expiringDocsCount > 1 ? "s" : ""} expiring soon`,
      desc: "Contact HR to renew before the expiry date.",
      actionTab: "documents",
    });
  }

  return alerts;
}

// ─── Document field model ────────────────────────────────────────────────────

export interface ProfileDocField {
  key: string;
  label: string;
  value: string | null | undefined;
  expiryDate: string | Date | null | undefined;
}

export function getProfileDocFields(emp: ProfileEmpData): ProfileDocField[] {
  return [
    { key: "passport", label: "Passport", value: emp.passportNumber, expiryDate: null },
    { key: "national_id", label: "National ID", value: emp.nationalId, expiryDate: null },
    { key: "visa", label: "Visa Number", value: emp.visaNumber, expiryDate: emp.visaExpiryDate },
    {
      key: "visa_expiry",
      label: "Visa Expiry",
      value: emp.visaExpiryDate ? String(emp.visaExpiryDate) : null,
      expiryDate: emp.visaExpiryDate,
    },
    { key: "work_permit", label: "Work Permit", value: emp.workPermitNumber, expiryDate: null },
    {
      key: "work_permit_expiry",
      label: "Work Permit Expiry",
      value: emp.workPermitExpiryDate ? String(emp.workPermitExpiryDate) : null,
      expiryDate: emp.workPermitExpiryDate,
    },
    { key: "pasi", label: "PASI Number", value: emp.pasiNumber, expiryDate: null },
  ].filter((f) => !!f.value);
}

export function hasAnyExpiringDocField(fields: ProfileDocField[]): boolean {
  return fields.some((f) => {
    if (!f.expiryDate) return false;
    const d = daysUntilExpiry(f.expiryDate);
    return d !== null && d <= 90;
  });
}

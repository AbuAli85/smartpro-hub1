import type { Employee, EmployeeAccountability } from "../drizzle/schema";

export type ReviewCadence = "daily" | "weekly" | "biweekly" | "monthly";

export type EffectiveAccountability = {
  employeeId: number;
  companyId: number;
  displayRole: string | null;
  departmentLabel: string | null;
  departmentId: number | null;
  directManagerEmployeeId: number | null;
  businessRoleKey: string | null;
  responsibilities: string[];
  kpiCategoryKeys: string[];
  reviewCadence: ReviewCadence;
  escalationEmployeeId: number | null;
  notes: string | null;
};

/**
 * Merge HR employee row with optional accountability overlay.
 * Escalation defaults to direct manager when not explicitly set.
 */
export function buildEffectiveAccountability(
  emp: Employee,
  overlay: EmployeeAccountability | null,
  opts?: {
    departmentName?: string | null;
  }
): EffectiveAccountability {
  const deptLabel =
    overlay?.departmentId != null && opts?.departmentName
      ? opts.departmentName
      : emp.department ?? null;

  const responsibilities = overlay?.responsibilities?.length
    ? overlay.responsibilities
    : emp.position
      ? [`Role: ${emp.position}`]
      : [];

  const kpiCategoryKeys = overlay?.kpiCategoryKeys?.length ? overlay.kpiCategoryKeys : [];

  return {
    employeeId: emp.id,
    companyId: emp.companyId,
    displayRole: emp.position ?? null,
    departmentLabel: deptLabel,
    departmentId: overlay?.departmentId ?? null,
    directManagerEmployeeId: emp.managerId ?? null,
    businessRoleKey: overlay?.businessRoleKey ?? null,
    responsibilities,
    kpiCategoryKeys,
    reviewCadence: (overlay?.reviewCadence as ReviewCadence) ?? "weekly",
    escalationEmployeeId: overlay?.escalationEmployeeId ?? emp.managerId ?? null,
    notes: overlay?.notes ?? null,
  };
}

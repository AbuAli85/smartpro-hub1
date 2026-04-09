import type { ControlTowerDomain } from "./domainNarrativeTypes";

export const DOMAIN_LABEL: Record<ControlTowerDomain, string> = {
  payroll: "Payroll",
  workforce: "Workforce",
  contracts: "Contracts",
  hr: "HR",
  compliance: "Compliance",
  operations: "Operations",
  general: "General",
};

export function domainLabel(d: ControlTowerDomain): string {
  return DOMAIN_LABEL[d];
}

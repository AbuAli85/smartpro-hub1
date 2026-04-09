import type { PriorityLevel } from "./priorityTypes";

export function severityBadgeClass(s: "high" | "medium" | "low") {
  if (s === "high") return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200";
  if (s === "medium") return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200";
}

export function priorityLevelBadgeClass(level: PriorityLevel) {
  if (level === "critical") {
    return "bg-red-100 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-100 dark:border-red-800";
  }
  if (level === "important") {
    return "bg-amber-100 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:border-amber-800";
  }
  return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600";
}

export function sourceLabel(source: string) {
  switch (source) {
    case "payroll":
      return "Payroll";
    case "workforce":
      return "Workforce";
    case "contracts":
      return "Contracts";
    case "operations":
      return "Operations";
    case "compliance":
      return "Compliance";
    case "system":
      return "System";
    default:
      return "HR";
  }
}

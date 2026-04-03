/**
 * CompanySwitcher
 *
 * Displays the active company name in the sidebar header.
 * If the user belongs to multiple companies, shows a dropdown to switch.
 */
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronDown, Check } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  company_admin: "Admin",
  hr_admin: "HR Admin",
  finance_admin: "Finance",
  company_member: "Member",
  employee: "Employee",
  reviewer: "Reviewer",
  auditor: "Auditor",
};

export function CompanySwitcher() {
  const { companies, activeCompany, switchCompany, loading } = useActiveCompany();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg animate-pulse">
        <div className="w-7 h-7 rounded-md bg-white/10" />
        <div className="flex-1 min-w-0">
          <div className="h-3 bg-white/10 rounded w-24 mb-1" />
          <div className="h-2 bg-white/10 rounded w-16" />
        </div>
      </div>
    );
  }

  if (!activeCompany) return null;

  const roleLabel = ROLE_LABELS[activeCompany.role ?? ""] ?? activeCompany.role ?? "";

  // Single company — no dropdown needed
  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
        <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center flex-shrink-0">
          <Building2 size={14} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{activeCompany.name}</p>
          <p className="text-xs text-white/60 truncate leading-tight">{roleLabel}</p>
        </div>
      </div>
    );
  }

  // Multiple companies — show dropdown switcher
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors w-full text-left group">
          <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{activeCompany.name}</p>
            <p className="text-xs text-white/60 truncate leading-tight">{roleLabel}</p>
          </div>
          <ChevronDown size={14} className="text-white/40 group-hover:text-white/70 transition-colors flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch Company
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((company) => {
          const isActive = company.id === activeCompany.id;
          const label = ROLE_LABELS[company.role ?? ""] ?? company.role ?? "";
          return (
            <DropdownMenuItem
              key={company.id}
              onClick={() => switchCompany(company.id)}
              className="flex items-center gap-3 py-2.5 cursor-pointer"
            >
              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <Building2 size={13} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{company.name}</p>
                <p className="text-xs text-muted-foreground truncate">{label}</p>
              </div>
              {isActive && <Check size={14} className="text-primary flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => (window.location.href = "/company/create")}
          className="text-xs text-muted-foreground cursor-pointer"
        >
          + Add another company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

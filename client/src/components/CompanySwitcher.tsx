/**
 * CompanySwitcher
 *
 * Displays the active company name in the sidebar header.
 * ALWAYS shows a dropdown (even for single company) so the user can:
 *   - See all their companies and switch between them
 *   - Add another company via "+ Add another company"
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
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner / Admin",
  company_admin: "Owner / Admin",
  hr_admin: "HR Manager",
  finance_admin: "Finance Manager",
  company_member: "Staff / Employee",
  employee: "Employee",
  reviewer: "Reviewer",
  auditor: "External Auditor",
  external_auditor: "External Auditor",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "text-orange-400",
  company_admin: "text-orange-400",
  hr_admin: "text-blue-400",
  finance_admin: "text-green-400",
  company_member: "text-white/50",
  employee: "text-white/50",
  reviewer: "text-purple-400",
  auditor: "text-yellow-400",
  external_auditor: "text-yellow-400",
};

export function CompanySwitcher() {
  const { t } = useTranslation("nav");
  const { companies, activeCompany, switchCompany, loading } = useActiveCompany();
  const [, navigate] = useLocation();

  function roleLabel(role: string | null | undefined) {
    const r = role?.trim() ?? "";
    if (!r) return t("roles.member", { defaultValue: "Member" });
    return t(`roles.${r}`, { defaultValue: ROLE_LABELS[r] ?? r });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 animate-pulse">
        <div className="w-7 h-7 rounded-md bg-white/10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-3 bg-white/10 rounded w-24 mb-1" />
          <div className="h-2 bg-white/10 rounded w-16" />
        </div>
        <div className="w-3 h-3 bg-white/10 rounded flex-shrink-0" />
      </div>
    );
  }

  if (!activeCompany) {
    // No company yet — show add button
    return (
      <button
        onClick={() => navigate("/company/create")}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors w-full text-left"
      >
        <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
          <Plus size={14} className="text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/70 truncate leading-tight">Add a Company</p>
          <p className="text-xs text-white/40 truncate leading-tight">Get started</p>
        </div>
      </button>
    );
  }

  // ALWAYS show dropdown — even for single company — so user can add another
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition-colors w-full text-start group focus:outline-none min-w-0">
          <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40 mb-0.5">
              {t("workspaceCompanyLabel", { defaultValue: "Company" })}
            </p>
            <p
              className="text-sm font-semibold text-white line-clamp-2 leading-tight break-words"
              title={activeCompany.name}
            >
              {activeCompany.name}
            </p>
            <p className={`text-xs font-medium truncate leading-tight ${ROLE_COLORS[activeCompany.role ?? ""] ?? "text-white/60"}`}>
              {roleLabel(activeCompany.role)}
            </p>
          </div>
          <ChevronDown
            size={13}
            className="text-white/40 group-hover:text-white/70 transition-colors flex-shrink-0"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal pb-1">
          Your Companies
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {companies.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground italic">
            No companies found
          </DropdownMenuItem>
        ) : (
          companies.map((company) => {
            const isActive = company.id === activeCompany.id;
            const label = roleLabel(company.role);
            return (
              <DropdownMenuItem
                key={company.id}
                onClick={() => switchCompany(company.id)}
                className="flex items-center gap-3 py-2.5 cursor-pointer"
              >
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                    isActive ? "bg-red-600" : "bg-muted"
                  }`}
                >
                  <Building2
                    size={13}
                    className={isActive ? "text-white" : "text-muted-foreground"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{company.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                </div>
                {isActive && <Check size={14} className="text-primary flex-shrink-0" />}
              </DropdownMenuItem>
            );
          })
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/company/create")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer py-2"
        >
          <Plus size={14} className="flex-shrink-0" />
          Add another company
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

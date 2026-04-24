/**
 * ActiveModeIndicator
 *
 * Status bar that shows the user's current access context:
 *   • Platform mode  — platform operator acting across tenants
 *   • Company mode   — standard company member workspace
 *   • Client mode    — external client portal user
 *
 * Displayed at the top of every authenticated layout shell so users always
 * know which workspace and role they are operating under.
 */
import { Building2, ShieldCheck, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

const PLATFORM_ROLES = new Set([
  "super_admin",
  "platform_admin",
  "regional_manager",
  "client_services",
]);

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company Admin",
  hr_admin: "HR Admin",
  finance_admin: "Finance Admin",
  company_member: "Member",
  reviewer: "Reviewer",
  external_auditor: "External Auditor",
  client: "Client",
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  regional_manager: "Regional Manager",
  client_services: "Client Services",
};

type Mode = "platform" | "company" | "client";

function resolveMode(platformRole: string | null | undefined, companyRole: string | null | undefined): Mode {
  if (platformRole && PLATFORM_ROLES.has(platformRole)) return "platform";
  if (companyRole === "client") return "client";
  return "company";
}

const MODE_CONFIG: Record<Mode, { label: string; badgeClass: string; icon: React.ElementType }> = {
  platform: {
    label: "Platform",
    badgeClass: "border-purple-400 text-purple-700 bg-purple-100",
    icon: ShieldCheck,
  },
  company: {
    label: "Company",
    badgeClass: "border-blue-400 text-blue-700 bg-blue-100",
    icon: Building2,
  },
  client: {
    label: "Client Portal",
    badgeClass: "border-emerald-400 text-emerald-700 bg-emerald-100",
    icon: Users,
  },
};

interface ActiveModeIndicatorProps {
  className?: string;
}

export function ActiveModeIndicator({ className }: ActiveModeIndicatorProps) {
  const { user, loading: authLoading } = useAuth();
  const { activeCompany, loading: companyLoading } = useActiveCompany();

  if (authLoading || companyLoading || !user) return null;

  const platformRole = (user as { platformRole?: string | null }).platformRole ?? null;
  const companyRole = activeCompany?.role ?? null;
  const mode = resolveMode(platformRole, companyRole);
  const config = MODE_CONFIG[mode];
  const ModeIcon = config.icon;

  const displayRole = mode === "platform"
    ? (platformRole ? (ROLE_LABELS[platformRole] ?? platformRole) : null)
    : (companyRole ? (ROLE_LABELS[companyRole] ?? companyRole) : null);

  return (
    <div
      role="status"
      aria-label="Active workspace mode"
      className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}
    >
      <Badge
        variant="outline"
        className={`font-semibold text-xs gap-1 ${config.badgeClass}`}
      >
        <ModeIcon className="h-3 w-3" aria-hidden="true" />
        {config.label}
      </Badge>

      {activeCompany && (
        <span className="flex items-center gap-1 text-foreground/70 font-medium truncate max-w-[160px]">
          <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{activeCompany.name}</span>
        </span>
      )}

      {displayRole && (
        <span className="flex items-center gap-1 text-foreground/60 truncate max-w-[120px]">
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{displayRole}</span>
        </span>
      )}
    </div>
  );
}

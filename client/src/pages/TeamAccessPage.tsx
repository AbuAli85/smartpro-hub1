import React, { useRef, useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";

/** Server row shape for HR + access — avoids `as any` in canonical mapping (Phase 4.4). */
type EmployeeWithAccessRow = RouterOutputs["companies"]["employeesWithAccess"][number];
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Users,
  UserCheck,
  UserX,
  UserPlus,
  Mail,
  Plus,
  Shield,
  Banknote,
  Eye,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Building2,
  RefreshCw,
  Lock,
  Unlock,
  AlertTriangle,
  Link2Off,
  History,
} from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";

// â"€â"€â"€ Role Configuration â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const ROLE_CONFIG: Record<string, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  access: string[];
}> = {
  company_admin: {
    label: "Owner / Admin",
    description: "Full access to everything – all modules, all settings, team management",
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200",
    icon: <Crown size={14} className="text-orange-500" />,
    access: ["All modules", "Team management", "Payroll & Finance", "Company settings", "HR & Employees"],
  },
  hr_admin: {
    label: "HR Manager",
    description: "Full access to all HR modules – employees, payroll, leave, attendance, letters, tasks",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    icon: <UserCheck size={14} className="text-blue-500" />,
    access: ["Employees & Team", "Payroll Engine", "Leave Management", "Attendance", "HR Letters"],
  },
  finance_admin: {
    label: "Finance Manager",
    description: "Access to payroll, billing, financial reports and subscriptions",
    color: "text-green-600",
    bgColor: "bg-green-50 border-green-200",
    icon: <Banknote size={14} className="text-green-500" />,
    access: ["Payroll Engine", "Run Payroll", "Financial Reports", "Subscriptions & Billing"],
  },
  company_member: {
    label: "Staff / Employee",
    description: "Access to Employee home only – their own attendance, tasks, leave, announcements",
    color: "text-gray-600",
    bgColor: "bg-gray-50 border-gray-200",
    icon: <Users size={14} className="text-gray-500" />,
    access: ["Employee home (personal dashboard)", "My Attendance", "My Tasks", "My Leave"],
  },
  reviewer: {
    label: "Reviewer",
    description: "Read-only access to most company data for review and approval workflows",
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
    icon: <Eye size={14} className="text-purple-500" />,
    access: ["View all modules (read-only)", "Approve/review workflows"],
  },
  external_auditor: {
    label: "External Auditor",
    description: "Limited read-only access – cannot see payroll, HR management, or admin pages",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    icon: <Shield size={14} className="text-yellow-500" />,
    access: ["View company data (limited)", "No payroll access", "No HR management"],
  },
};

function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type AuditEventRow = {
  id: number;
  action: string;
  entityType: string | null;
  actorName: string;
  afterState: Record<string, unknown> | null;
  createdAt: Date | string | null;
};

function formatAuditAction(event: AuditEventRow): string {
  const s = event.afterState;
  switch (event.action) {
    case "member_role_changed":
      return `changed role to ${ROLE_CONFIG[s?.role as string]?.label ?? (s?.role as string) ?? "unknown"}`;
    case "invite_created":
      return `invited ${(s?.email as string) ?? "someone"}`;
    case "invite_revoked":
      return "revoked an invite";
    case "invite_accepted":
      return "accepted an invite and joined";
    case "member_removed":
      return "removed a member";
    case "employee_linked":
      return "linked an employee account";
    case "member_capabilities_changed":
      return "updated permissions";
    default:
      return event.action.replace(/_/g, " ");
  }
}

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role];
  if (!config) return <Badge variant="outline" className="text-xs">{role}</Badge>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.bgColor} ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

type CanonicalAccessState = "HR_ONLY" | "INVITED" | "ACTIVE" | "SUSPENDED";

/**
 * Single source of team-access UI copy (Phase 4.3A / 4.4).
 * Do not hardcode stat, filter, badge, chip, or primary tab labels elsewhere — add a key here first.
 */
const TA = {
  statTotalEmployees: "Total Employees",
  statDirectAccessOnly: "Direct Access Only",
  statWithActiveAccess: "With Active Access",
  statPendingInvites: "Pending Invites",
  statSuspended: "Suspended",
  statNeedsAttention: "Needs Attention",
  filterAll: "All",
  filterActive: "Active",
  filterSuspended: "Suspended",
  filterInvitePending: "Pending Invites",
  filterHROnlyNoLogin: "HR only (no login)",
  filterNeedsAttention: "Needs attention",
  badgeActive: "Active",
  badgeSuspended: "Suspended",
  badgeInvitePending: "Invite pending",
  badgeHROnly: "HR only",
  chipAccountNotLinked: "Account not linked",
  chipIdentityConflict: "Identity conflict",
  chipMissingEmail: "Missing email",
  cardHrDirectoryTitle: "HR directory – access",
  tabActiveMembers: "Active Members",
  tabHrEmployees: "HR Employees",
  sectionActiveSystemLogins: "Active System Logins",
  tabRoleGuide: "Role Guide",
  accessIntelTitle: "Access intelligence",
  accessIntelHrInviteRows: "HR invite pending (rows)",
  accessIntelInviteQueue: "Invite queue (all pending)",
  accessIntelFootnote:
    "HR invite pending counts employee rows in INVITED state. Invite queue counts all pending company invites (may differ).",
  accessIntelTopIssue: "Top issue",
} as const;

type MainTab = "members" | "employees" | "invites" | "roles";

type CanonicalPrimaryAction =
  | "NONE"
  | "GRANT_ACCESS"
  | "COPY_INVITE"
  | "RESTORE_ACCESS"
  | "CHANGE_ROLE"
  | "LINK_ACCOUNT"
  | "RESOLVE_CONFLICT";

function AccessStatusBadge({ state }: { state: CanonicalAccessState }) {
  if (state === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 size={11} /> {TA.badgeActive}
      </span>
    );
  }
  if (state === "SUSPENDED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
        <XCircle size={11} /> {TA.badgeSuspended}
      </span>
    );
  }
  if (state === "INVITED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
        <Mail size={11} /> {TA.badgeInvitePending}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={11} /> {TA.badgeHROnly}
    </span>
  );
}

/** Prefer server `accessState`; `accessStatus` is only for tests or non-canonical payloads. */
function toCanonicalAccessState(emp: {
  accessState?: string | null;
  accessStatus?: string | null;
}): CanonicalAccessState {
  if (emp.accessState === "ACTIVE" || emp.accessState === "SUSPENDED" || emp.accessState === "INVITED" || emp.accessState === "HR_ONLY") {
    return emp.accessState;
  }
  if (emp.accessStatus === "active") return "ACTIVE";
  if (emp.accessStatus === "inactive") return "SUSPENDED";
  return "HR_ONLY";
}

function derivePrimaryAction(input: {
  accessState: CanonicalAccessState;
  flags?: { needsLink?: boolean; conflict?: boolean; missingEmail?: boolean } | null;
  primaryAction?: string | null;
}): CanonicalPrimaryAction {
  const primary = input.primaryAction;
  if (
    primary === "NONE" ||
    primary === "GRANT_ACCESS" ||
    primary === "COPY_INVITE" ||
    primary === "RESTORE_ACCESS" ||
    primary === "CHANGE_ROLE" ||
    primary === "LINK_ACCOUNT" ||
    primary === "RESOLVE_CONFLICT"
  ) {
    return primary;
  }
  if (input.flags?.conflict) return "RESOLVE_CONFLICT";
  if (input.accessState === "ACTIVE") return input.flags?.needsLink ? "LINK_ACCOUNT" : "CHANGE_ROLE";
  if (input.accessState === "SUSPENDED") return "RESTORE_ACCESS";
  if (input.accessState === "INVITED") return "COPY_INVITE";
  return input.flags?.missingEmail ? "NONE" : "GRANT_ACCESS";
}

/** HR Employees tab filter — canonical accessState plus a flag-based bucket (not email-based). */
export type EmployeeListFilter = "all" | CanonicalAccessState | "needs_attention";

function employeeNeedsAttention(flags: { needsLink?: boolean; conflict?: boolean; missingEmail?: boolean } | null | undefined): boolean {
  const f = flags ?? {};
  return !!(f.conflict || f.needsLink || f.missingEmail);
}

/**
 * HR list filter: uses canonical `accessState` and `needs_attention` (flags on the row).
 * Intentionally does not match by email — same rules as stat cards and Direct Access Only (memberId linkage).
 */
export function matchesEmployeeListFilter(
  emp: {
    canonicalAccessState: CanonicalAccessState;
    canonicalFlags?: { needsLink?: boolean; conflict?: boolean; missingEmail?: boolean } | null;
  },
  filter: EmployeeListFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "needs_attention") return employeeNeedsAttention(emp.canonicalFlags);
  return emp.canonicalAccessState === filter;
}

/** Map Access Intelligence `topIssues[].key` to the closest HR Employees filter. */
export function topIssueKeyToEmployeeFilter(key: string): EmployeeListFilter {
  if (key === "ACCOUNT_NOT_LINKED" || key === "MISSING_EMAIL" || key === "IDENTITY_CONFLICT") {
    return "needs_attention";
  }
  if (key.startsWith("STATE_REASON:")) {
    const r = key.slice("STATE_REASON:".length);
    if (r === "INVITED_PENDING") return "INVITED";
    if (r.startsWith("HR_ONLY")) return "HR_ONLY";
    if (r.startsWith("CONFLICT_")) return "needs_attention";
    if (r === "ACTIVE_MEMBER_LINK_DRIFT" || r === "SUSPENDED_MEMBER_LINK_DRIFT") return "needs_attention";
    if (r === "ACTIVE_MEMBER") return "ACTIVE";
    if (r === "SUSPENDED_MEMBER") return "SUSPENDED";
  }
  return "needs_attention";
}

/** Phase 4.3B — human-readable conflict diagnostics (mirrors server `stateReason`). */
function getConflictReviewCopy(stateReason: string | null | undefined): {
  title: string;
  intro: string;
  signals: string[];
  nextSteps: string[];
} {
  switch (stateReason) {
    case "CONFLICT_EMAIL_MISMATCH":
      return {
        title: "Email and account do not match",
        intro:
          "The HR profile email is tied to a different SmartPRO login than the company membership we resolved for this employee.",
        signals: [
          "The employee record and the membership disagree on which user account should apply.",
          "Common after an email change on one side but not the other.",
        ],
        nextSteps: [
          "Confirm the correct work email in HR → My Team.",
          "If the right person already has access, use Link account to attach the correct login to this HR row.",
          "Revoke duplicate invites or memberships if someone was added twice.",
        ],
      };
    case "CONFLICT_MULTIPLE_MEMBERS":
      return {
        title: "Multiple memberships for the same person",
        intro: "We found more than one company membership that could apply to this employee.",
        signals: ["Two or more member records overlap — SmartPRO cannot pick a single access row automatically."],
        nextSteps: [
          "In Active Members, remove memberships that are clearly duplicates.",
          "Refresh this page, then use Link account if the HR row still does not match the surviving membership.",
        ],
      };
    case "CONFLICT_MULTIPLE_INVITES":
      return {
        title: "Multiple pending invites",
        intro: "There is more than one outstanding invite for this email address.",
        signals: ["Invites can accumulate after resends or address changes."],
        nextSteps: [
          "Open Pending Invites and revoke extras, keeping a single current invite.",
          "Refresh this page after cleanup.",
        ],
      };
    case "CONFLICT_IDENTITY_MISMATCH":
    default:
      return {
        title: "HR record and login do not line up",
        intro: "The employee profile points to a different user identity than the membership we resolved.",
        signals: [
          "The HR employee user id and the member login user id are not the same person.",
          "This is a data conflict, not a missing invite.",
        ],
        nextSteps: [
          "Verify with HR which email and account should be canonical.",
          "Use Link account when you know which login is correct.",
          "If the wrong person was granted access, revoke that membership from Active Members first.",
        ],
      };
  }
}

function ConflictReviewDialogBody({
  target,
  onClose,
  onLinkAccount,
}: {
  target: { stateReason: string | null; needsLink: boolean };
  onClose: () => void;
  onLinkAccount: () => void;
}) {
  const c = getConflictReviewCopy(target.stateReason);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-start gap-2 text-left">
          <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={20} />
          {c.title}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Why this row is flagged, what signals disagree, and safe next steps. This dialog does not change data automatically.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 text-sm text-gray-700">
        <p>{c.intro}</p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What we detected</p>
          <ul className="list-disc pl-5 mt-1.5 space-y-1">
            {c.signals.map((line, i) => (
              <li key={`sig-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">What you can do next</p>
          <ul className="list-disc pl-5 mt-1.5 space-y-1">
            {c.nextSteps.map((line, i) => (
              <li key={`step-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
        {target.needsLink && (
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={onLinkAccount}
          >
            <UserCheck size={14} className="mr-1" /> Link account
          </Button>
        )}
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

// â"€â"€â"€ Empty State â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function EmptyEmployeesState({ totalEmployees }: { totalEmployees: number }) {
  const [, setLocation] = useLocation();
  if (totalEmployees > 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No employees match your search or filter.
      </div>
    );
  }
  return (
    <div className="py-12 text-center space-y-4">
      <Users size={40} className="mx-auto text-gray-200" />
      <div>
        <p className="text-sm font-semibold text-gray-600">No employees added yet</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
          Add your employees in the HR module first. Once added, you can grant them system access and assign roles here.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          size="sm"
          className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
          onClick={() => setLocation("/my-team")}
        >
          <UserPlus size={14} /> Go to My Team
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setLocation("/hr/employees")}
        >
          <Users size={14} /> HR Employees
        </Button>
      </div>
    </div>
  );
}

// â"€â"€â"€ Main Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function TeamAccessPage({ initialTab = "members" }: { initialTab?: "members" | "employees" | "invites" | "roles" } = {}) {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const [, setLocation] = useLocation();
  const hrDirectoryRef = useRef<HTMLDivElement>(null);
  const [mainTab, setMainTab] = useState<MainTab>(() => initialTab as MainTab);

  // Data
  const { data: employeesWithAccess = [], isLoading: loadingEmployees, refetch } = trpc.companies.employeesWithAccess.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: members = [], isLoading: loadingMembers } = trpc.companies.members.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: pendingInvites = [], refetch: refetchInvites } = trpc.companies.listInvites.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: accessIntel } = trpc.companies.accessAnalyticsOverview.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: recentAudit } = trpc.companies.recentAccessAudit.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const revokeInviteMutation = trpc.companies.revokeInvite.useMutation({
    onSuccess: () => {
      utils.companies.listInvites.invalidate();
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      toast.success("Invite revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  // UI state
  const [search, setSearch] = useState("");
  const [employeeListFilter, setEmployeeListFilter] = useState<EmployeeListFilter>("all");
  const [grantTarget, setGrantTarget] = useState<{ employeeId: number; name: string; email: string | null } | null>(null);
  const [grantRole, setGrantRole] = useState<string>("company_member");
  const [revokeTarget, setRevokeTarget] = useState<{ employeeId: number; name: string } | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ employeeId: number; name: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState("");
  // For legacy email-based add
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("company_member");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Member management
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ id: number; name: string } | null>(null);
  const [memberRoleTarget, setMemberRoleTarget] = useState<{ id: number; name: string; currentRole: string } | null>(null);
  const [memberNewRole, setMemberNewRole] = useState("");
  // Multi-company access
  const { companies: allMyCompanies } = useActiveCompany();
  const [multiGrantTarget, setMultiGrantTarget] = useState<{ employeeId: number; name: string; email: string | null } | null>(null);
  const [multiGrantSelections, setMultiGrantSelections] = useState<Record<number, string>>({}); // companyId -> role
  // Manual link: link a company member to an employee record
  const [linkTarget, setLinkTarget] = useState<{ employeeId: number; name: string } | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [conflictReviewTarget, setConflictReviewTarget] = useState<{
    employeeId: number;
    name: string;
    email: string | null;
    stateReason: string | null;
    needsLink: boolean;
  } | null>(null);

  // Multi-company grant mutation
  const grantMultiCompanyAccess = trpc.companies.grantMultiCompanyAccess.useMutation({
    onSuccess: (res) => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.members.invalidate();
      const granted = res.results.filter(r => r.action === 'granted').length;
      const invited = res.results.filter(r => r.action === 'invited').length;
      const skipped = res.results.filter(r => r.action === 'skipped').length;
      if (granted > 0) toast.success(`Access granted in ${granted} company${granted > 1 ? 'ies' : 'y'}`);
      if (invited > 0) toast.success(`Invite sent for ${invited} company${invited > 1 ? 'ies' : 'y'}`);
      if (skipped > 0) toast.warning(`Skipped ${skipped} company${skipped > 1 ? 'ies' : 'y'} (not admin)`);
      setMultiGrantTarget(null);
      setMultiGrantSelections({});
    },
    onError: (err) => toast.error(err.message),
  });

  // Mutations
  const grantAccess = trpc.companies.grantEmployeeAccess.useMutation({
    onSuccess: (res) => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.members.invalidate();
      if (res.action === 'linked') toast.success(res.message);
      else if (res.action === 'invited') toast.success(`Invite sent to ${grantTarget?.email}`);
      else toast.info(res.message);
      setGrantTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeAccess = trpc.companies.revokeEmployeeAccess.useMutation({
    onSuccess: () => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.members.invalidate();
      toast.success("Access revoked");
      setRevokeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateEmployeeRole = trpc.companies.updateEmployeeAccessRole.useMutation({
    onSuccess: () => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.members.invalidate();
      utils.auth.me.invalidate();
      toast.success("Role updated – sidebar will refresh automatically");
      setRoleChangeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const addMemberByEmail = trpc.companies.addMemberByEmail.useMutation({
    onSuccess: (res) => {
      utils.companies.members.invalidate();
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.listInvites.invalidate();
      utils.auth.me.invalidate();
      const msg = (res as any).message ?? "Done";
      if ((res as any).action === "invited") {
        const url = (res as any).inviteUrl;
        toast.success(url ? `Invite sent! Share this link: ${url}` : msg, { duration: 10000 });
      } else {
        toast.success(msg);
      }
      setInviteEmail("");
      setInviteOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMemberRole = trpc.companies.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.companies.members.invalidate();
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.auth.me.invalidate();
      toast.success("Role updated – sidebar will refresh automatically");
      setMemberRoleTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const linkMemberToEmployee = trpc.companies.linkMemberToEmployee.useMutation({
    onSuccess: (res) => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      utils.companies.members.invalidate();
      toast.success(res.message);
      setLinkTarget(null);
      setLinkEmail("");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.companies.removeMember.useMutation({
    onSuccess: () => {
      utils.companies.members.invalidate();
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.accessAnalyticsOverview.invalidate();
      toast.success("Member removed");
      setRemoveMemberTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const canonicalEmployees = employeesWithAccess.map((emp: EmployeeWithAccessRow) => {
    const accessState = toCanonicalAccessState(emp);
    const flags = emp.flags;
    const primaryAction = derivePrimaryAction({
      accessState,
      flags: flags ?? undefined,
      primaryAction: emp.primaryAction,
    });
    return {
      ...emp,
      canonicalAccessState: accessState,
      canonicalFlags: flags ?? {},
      canonicalPrimaryAction: primaryAction,
    };
  });

  // Dev-only: surface partial API payloads early (skipped under Vitest — fixtures may omit accessState on purpose).
  if (import.meta.env.DEV && import.meta.env.MODE !== "test") {
    for (const row of canonicalEmployees) {
      if (row.accessState == null) {
        console.warn("[TeamAccess] Missing accessState on employee row — check API rollout / resolver.", {
          employeeId: row.employeeId,
          accessStatus: row.accessStatus,
        });
      }
    }
  }

  // Filtered employees — with empty search, row counts match the corresponding stat / filter (see stat bar).
  const filteredEmployees = canonicalEmployees.filter((emp) => {
    const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || emp.email?.toLowerCase().includes(search.toLowerCase()) || emp.department?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = matchesEmployeeListFilter(emp, employeeListFilter);
    return matchSearch && matchStatus;
  });

  // Canonical stats
  const totalEmployees = canonicalEmployees.length;
  const withAccess = canonicalEmployees.filter((e) => e.canonicalAccessState === "ACTIVE").length;
  const suspended = canonicalEmployees.filter((e) => e.canonicalAccessState === "SUSPENDED").length;
  const invited = canonicalEmployees.filter((e) => e.canonicalAccessState === "INVITED").length;
  const needsAttention = canonicalEmployees.filter((e) => employeeNeedsAttention(e.canonicalFlags)).length;
  const activeMembers = members.filter((m) => m.isActive);
  /** HR rows that resolve to a company_members row — used to exclude those from â€œdirect onlyâ€ member counts. */
  const linkedMemberIds = new Set(
    canonicalEmployees
      .map((e) => e.memberId)
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
  );
  /** Active company members with no HR employee row pointing at their membership (Add by Email / legacy). */
  const directAccessOnly = activeMembers.filter((m) => !linkedMemberIds.has(m.memberId)).length;
  const pendingInvitesList = pendingInvites.filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date());

  const focusHrDirectory = () => {
    requestAnimationFrame(() => {
      hrDirectoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToHrEmployees = (filter: EmployeeListFilter) => {
    setMainTab("employees");
    setEmployeeListFilter(filter);
    setSearch("");
    focusHrDirectory();
  };

  const goToMembersTab = () => {
    setMainTab("members");
    setSearch("");
  };

  const goToInvitesTab = () => {
    if (pendingInvitesList.length === 0) {
      toast.info("No pending invites in the queue.");
      return;
    }
    setMainTab("invites");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Access & Roles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who can log in to SmartPRO and what they can see. Add employees in HR → My Team first, then grant access here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              utils.companies.accessAnalyticsOverview.invalidate();
            }}
            className="gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Plus size={16} /> Add by Email
          </Button>
        </div>
      </div>

      {accessIntel && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/90 px-4 py-3 text-xs text-slate-700">
          <div className="font-semibold text-slate-800 mb-2">{TA.accessIntelTitle}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <button
              type="button"
              title="Open HR Employees tab with HR only (no login) filter"
              onClick={() => goToHrEmployees("HR_ONLY")}
              className="text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TA.badgeHROnly}: <strong>{accessIntel.core.hrOnly}</strong>
            </button>
            <button
              type="button"
              title="Open HR Employees tab with Needs attention filter"
              onClick={() => goToHrEmployees("needs_attention")}
              className="text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TA.statNeedsAttention}: <strong>{accessIntel.core.needsAttention}</strong>
            </button>
            <button
              type="button"
              title="Open Active Members tab"
              onClick={goToMembersTab}
              className="text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TA.statDirectAccessOnly}: <strong>{accessIntel.core.directAccessOnly}</strong>
            </button>
            <button
              type="button"
              title="Open HR Employees tab with Pending invites (HR rows) filter"
              onClick={() => goToHrEmployees("INVITED")}
              className="text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TA.accessIntelHrInviteRows}: <strong>{accessIntel.core.invitePendingHrRows}</strong>
            </button>
            <button
              type="button"
              title="Open Pending Invites tab"
              onClick={goToInvitesTab}
              className="text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TA.accessIntelInviteQueue}: <strong>{accessIntel.invitesTable.pendingCount}</strong>
            </button>
          </div>
          {accessIntel.invitesTable.soonestExpiryDays != null && (
            <p className="mt-1.5 text-slate-600">
              Next invite expires in ~{accessIntel.invitesTable.soonestExpiryDays} days
              {accessIntel.invitesTable.farthestExpiryDays != null &&
              accessIntel.invitesTable.farthestExpiryDays !== accessIntel.invitesTable.soonestExpiryDays
                ? ` (furthest ~${accessIntel.invitesTable.farthestExpiryDays} d)`
                : null}
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2 leading-snug">{TA.accessIntelFootnote}</p>
          {accessIntel.topIssues[0] && (
            <button
              type="button"
              title="Open HR Employees tab with the closest matching filter for this issue"
              onClick={() => goToHrEmployees(topIssueKeyToEmployeeFilter(accessIntel.topIssues[0].key))}
              className="mt-2 block w-full text-left rounded-sm hover:underline hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-slate-700"
            >
              <span className="text-slate-500">{TA.accessIntelTopIssue}:</span>{" "}
              <strong>{accessIntel.topIssues[0].label}</strong> ({accessIntel.topIssues[0].count})
            </button>
          )}
        </div>
      )}

      {recentAudit && recentAudit.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
            <History size={14} className="text-slate-500" />
            Recent Access Changes
          </div>
          <div className="space-y-1.5">
            {recentAudit.map((event) => (
              <div key={event.id} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="text-slate-400 shrink-0 w-16 pt-px">{formatRelativeTime(event.createdAt)}</span>
                <span>
                  <span className="font-medium text-slate-800">{event.actorName}</span>
                  {" "}{formatAuditAction(event)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        Stat bar semantics (product):
        - Total Employees: HR directory rows in scope (canonicalEmployees.length).
        - Direct Access Only: active company members not referenced by any HR row (no employee.memberId match).
        - With Active Access: HR rows in canonical ACTIVE access state.
        - Needs Attention: rows with conflict / needsLink / missingEmail flags (memberId-based model; email drift may still surface here).
        Clickable HR stats apply the same filter as the HR Employees dropdown (empty search — count matches visible rows).
      */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() => goToHrEmployees("all")}
          className="bg-white border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Users size={18} className="text-gray-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{totalEmployees}</div>
            <div className="text-xs text-gray-500">{TA.statTotalEmployees}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={goToMembersTab}
          className="bg-white border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Link2Off size={18} className="text-slate-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">{directAccessOnly}</div>
            <div className="text-xs text-gray-500">{TA.statDirectAccessOnly}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => goToHrEmployees("ACTIVE")}
          className="bg-white border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700">{withAccess}</div>
            <div className="text-xs text-gray-500">{TA.statWithActiveAccess}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => goToHrEmployees("INVITED")}
          className="bg-white border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700">{invited}</div>
            <div className="text-xs text-gray-500">{TA.statPendingInvites}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => goToHrEmployees("SUSPENDED")}
          className="bg-white border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors hover:bg-gray-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <XCircle size={18} className="text-red-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-red-700">{suspended}</div>
            <div className="text-xs text-gray-500">{TA.statSuspended}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => goToHrEmployees("needs_attention")}
          className={`border rounded-xl p-4 flex items-center gap-3 w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            needsAttention > 0 ? "bg-orange-50/80 border-orange-200 hover:bg-orange-50" : "bg-white hover:bg-gray-50/90"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              needsAttention > 0 ? "bg-orange-100" : "bg-gray-100"
            }`}
          >
            <AlertTriangle size={18} className={needsAttention > 0 ? "text-orange-700" : "text-gray-500"} />
          </div>
          <div>
            <div className={`text-2xl font-bold ${needsAttention > 0 ? "text-orange-900" : "text-gray-700"}`}>{needsAttention}</div>
            <div className="text-xs text-gray-500">{TA.statNeedsAttention}</div>
          </div>
        </button>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="members" className="gap-2">
            <CheckCircle2 size={14} /> {TA.tabActiveMembers} ({activeMembers.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <Users size={14} /> {TA.tabHrEmployees} ({totalEmployees})
          </TabsTrigger>
          {/* Phase 4.3C (product): deliberate IA choice — keep this tab vs unify invites into a single access workspace. */}
          {pendingInvitesList.length > 0 && (
            <TabsTrigger value="invites" className="gap-2">
              <Clock size={14} /> {TA.statPendingInvites} ({pendingInvitesList.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="roles" className="gap-2">
            <Info size={14} /> {TA.tabRoleGuide}
          </TabsTrigger>
        </TabsList>

        {/* â"€â"€ Tab 1: All Employees â"€â"€ */}
        <TabsContent value="employees">
          <Card ref={hrDirectoryRef}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-800">
                  {TA.cardHrDirectoryTitle}
                </CardTitle>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <Input
                      placeholder="Search name, email, department..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <Select
                    value={employeeListFilter}
                    onValueChange={(v) => setEmployeeListFilter(v as EmployeeListFilter)}
                  >
                    <SelectTrigger className="h-9 min-w-[12.5rem] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{TA.filterAll}</SelectItem>
                      <SelectItem value="ACTIVE">{TA.filterActive}</SelectItem>
                      <SelectItem value="SUSPENDED">{TA.filterSuspended}</SelectItem>
                      <SelectItem value="INVITED">{TA.filterInvitePending}</SelectItem>
                      <SelectItem value="HR_ONLY">{TA.filterHROnlyNoLogin}</SelectItem>
                      <SelectItem value="needs_attention">{TA.filterNeedsAttention}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingEmployees ? (
                <div className="py-12 text-center text-sm text-gray-400">Loading employees...</div>
              ) : filteredEmployees.length === 0 ? (
                <EmptyEmployeesState totalEmployees={totalEmployees} />
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredEmployees.map((emp) => {
                    const fullName = `${emp.firstName} ${emp.lastName}`;
                    const initials = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase();
                    const canonicalState = emp.canonicalAccessState;
                    const flags = emp.canonicalFlags;
                    const primaryAction = emp.canonicalPrimaryAction;
                    const rowInvite =
                      emp.email
                        ? pendingInvitesList.find((i) => i.email?.trim().toLowerCase() === emp.email?.trim().toLowerCase())
                        : null;
                    return (
                      <div key={emp.employeeId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900">{fullName}</span>
                            {emp.employeeNumber && (
                              <span className="text-xs text-gray-400">#{emp.employeeNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {emp.department && (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Building2 size={10} className="text-gray-400" />
                                {emp.department}
                              </span>
                            )}
                            {emp.position && (
                              <span className="text-xs text-gray-500">{emp.position}</span>
                            )}
                            {emp.email && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Mail size={10} />
                                {emp.email}
                              </span>
                            )}
                            {flags?.needsLink && (
                              <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                                {TA.chipAccountNotLinked}
                              </span>
                            )}
                            {flags?.missingEmail && (
                              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                {TA.chipMissingEmail}
                              </span>
                            )}
                            {flags?.conflict && (
                              <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
                                <AlertTriangle size={10} />
                                {TA.chipIdentityConflict}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 hidden sm:block">
                          <AccessStatusBadge state={canonicalState} />
                        </div>

                        <div className="shrink-0 hidden md:block">
                          {emp.memberRole ? (
                            <RoleBadge role={emp.memberRole} />
                          ) : (
                            <span className="text-xs text-gray-400">–</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {primaryAction === "RESOLVE_CONFLICT" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-red-600 border-red-200"
                              onClick={() =>
                                setConflictReviewTarget({
                                  employeeId: emp.employeeId,
                                  name: fullName,
                                  email: emp.email ?? null,
                                  stateReason: emp.stateReason ?? null,
                                  needsLink: !!flags?.needsLink,
                                })
                              }
                            >
                              <AlertTriangle size={12} /> Review conflict
                            </Button>
                          ) : primaryAction === "NONE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:border-amber-300"
                              onClick={() => setLocation("/hr/employees")}
                              title="Add an email address to this employee profile before granting access"
                            >
                              <Mail size={12} /> Add Email
                            </Button>
                          ) : primaryAction === "COPY_INVITE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!rowInvite}
                              className="h-8 text-xs gap-1"
                              title={rowInvite ? `Expires in ${Math.ceil((new Date(rowInvite.expiresAt).getTime() - Date.now()) / 86400000)}d — copy link to share` : "No pending invite found"}
                              onClick={() => {
                                if (!rowInvite) return;
                                const url = `${window.location.origin}/invite/${rowInvite.token}`;
                                navigator.clipboard.writeText(url).then(() => toast.success("Invite link copied!")).catch(() => toast.info(`Link: ${url}`));
                              }}
                            >
                              <Mail size={12} /> Copy Invite{rowInvite ? ` (${Math.ceil((new Date(rowInvite.expiresAt).getTime() - Date.now()) / 86400000)}d)` : ""}
                            </Button>
                          ) : primaryAction === "RESTORE_ACCESS" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-green-600 hover:text-green-700"
                              onClick={() => {
                                setGrantTarget({ employeeId: emp.employeeId, name: fullName, email: emp.email ?? null });
                                setGrantRole(emp.memberRole ?? "company_member");
                              }}
                            >
                              <Unlock size={12} /> Restore
                            </Button>
                          ) : primaryAction === "LINK_ACCOUNT" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-purple-600 hover:text-purple-700 hover:border-purple-300"
                              onClick={() => { setLinkTarget({ employeeId: emp.employeeId, name: fullName }); setLinkEmail(emp.email ?? ""); }}
                              title="Manually link this employee to a SmartPRO account by email"
                            >
                              <UserCheck size={12} /> Link Account
                            </Button>
                          ) : primaryAction === "CHANGE_ROLE" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                setRoleChangeTarget({ employeeId: emp.employeeId, name: fullName, currentRole: emp.memberRole ?? "company_member" });
                                setNewRole(emp.memberRole ?? "company_member");
                              }}
                            >
                              Change Role
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1 bg-gray-900 hover:bg-gray-800 text-white"
                              onClick={() => {
                                setGrantTarget({ employeeId: emp.employeeId, name: fullName, email: emp.email ?? null });
                                setGrantRole("company_member");
                              }}
                            >
                              <Unlock size={12} /> Grant Access
                            </Button>
                          )}

                          {(canonicalState === "ACTIVE" || canonicalState === "SUSPENDED") && primaryAction !== "CHANGE_ROLE" && !flags?.conflict && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => {
                                setRoleChangeTarget({ employeeId: emp.employeeId, name: fullName, currentRole: emp.memberRole ?? "company_member" });
                                setNewRole(emp.memberRole ?? "company_member");
                              }}
                            >
                              Change Role
                            </Button>
                          )}

                          {(canonicalState === "ACTIVE" || canonicalState === "HR_ONLY") && allMyCompanies.length > 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:border-blue-300"
                              onClick={() => {
                                setMultiGrantTarget({ employeeId: emp.employeeId, name: fullName, email: emp.email ?? null });
                                setMultiGrantSelections({});
                              }}
                            >
                              <Building2 size={12} /> Multi-Company
                            </Button>
                          )}

                          {canonicalState === "ACTIVE" && primaryAction !== "LINK_ACCOUNT" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-purple-600 hover:text-purple-700 hover:border-purple-300"
                              onClick={() => { setLinkTarget({ employeeId: emp.employeeId, name: fullName }); setLinkEmail(emp.email ?? ""); }}
                              title="Manually link this employee to a SmartPRO account by email"
                            >
                              <UserCheck size={12} /> Link Account
                            </Button>
                          )}

                          {canonicalState === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                              onClick={() => setRevokeTarget({ employeeId: emp.employeeId, name: fullName })}
                            >
                              <Lock size={12} /> Revoke
                            </Button>
                          )}

                          {canonicalState === "INVITED" && rowInvite && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                              disabled={revokeInviteMutation.isPending}
                              onClick={() => revokeInviteMutation.mutate({ id: rowInvite.id, companyId: activeCompanyId ?? undefined })}
                            >
                              Revoke Invite
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* â"€â"€ Tab 2: Active Logins â"€â"€ */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  {TA.sectionActiveSystemLogins}
                </span>
                <Badge variant="secondary">{activeMembers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : activeMembers.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  No active members yet. Add employees in HR → My Team, then grant them system access from the {TA.tabHrEmployees} tab.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeMembers.map((member) => {
                    const isCurrentUser = member.userId === user?.id;
                    return (
                      <div key={member.memberId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
                            {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{member.name}</span>
                            {isCurrentUser && <span className="text-xs text-gray-400">(you)</span>}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Mail size={11} className="text-gray-400" />
                            <span className="text-xs text-gray-500">{member.email}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          <RoleBadge role={member.role} />
                        </div>
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                setMemberRoleTarget({ id: member.memberId, name: member.name ?? "", currentRole: member.role });
                                setMemberNewRole(member.role);
                              }}
                            >
                              Change Role
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-red-600 hover:text-red-700 hover:border-red-300"
                              onClick={() => setRemoveMemberTarget({ id: member.memberId, name: member.name ?? "" })}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* â"€â"€ Tab 3: Role Guide â"€â"€ */}
        <TabsContent value="roles">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(ROLE_CONFIG).map(([key, config]) => (
              <Card key={key} className={`border ${config.bgColor}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    {config.icon}
                    <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{config.description}</p>
                  <div className="space-y-1">
                    {config.access.map((item) => (
                      <div key={item} className="text-xs text-gray-600 flex items-center gap-1.5">
                        <CheckCircle2 size={10} className="text-gray-400 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* How it works */}
          <Card className="mt-4 border-blue-100 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-1">How Access Works</p>
                  <div className="space-y-1.5 text-xs text-blue-700">
                    <p><strong>Step 1:</strong> Add employees in the HR module (My Team / Employees page)</p>
                    <p><strong>Step 2:</strong> Come to this page → {TA.tabHrEmployees} tab → click &quot;Grant Access&quot; on any employee</p>
                    <p><strong>Step 3:</strong> Choose their role (Staff, HR Manager, Finance, etc.)</p>
                    <p><strong>Step 4:</strong> If they have a SmartPRO account (same email), they get access immediately. If not, an invite link is generated.</p>
                    <p><strong>Step 5:</strong> They log in at SmartPRO and see only what their role allows.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* â"€â"€ Tab: Pending Invites â"€â"€ */}
        <TabsContent value="invites">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  {TA.statPendingInvites}
                </span>
                <Badge variant="secondary">{pendingInvitesList.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pendingInvitesList.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">No pending invites.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingInvitesList.map((invite) => {
                    const expiresAt = new Date(invite.expiresAt);
                    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={invite.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                        <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                          <Mail size={16} className="text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{invite.email}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <RoleBadge role={invite.role} />
                            <span className="text-xs text-gray-400">Invited by {invite.inviterName ?? "Admin"}</span>
                            <span className="text-xs text-amber-600">{daysLeft}d left</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => {
                              const url = `${window.location.origin}/invite/${invite.token}`;
                              navigator.clipboard.writeText(url).then(() => toast.success("Invite link copied!")).catch(() => toast.info(`Link: ${url}`));
                            }}
                          >
                            Copy Link
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                            disabled={revokeInviteMutation.isPending}
                            onClick={() => revokeInviteMutation.mutate({ id: invite.id, companyId: activeCompanyId ?? undefined })}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* â"€â"€ Multi-Company Access Dialog â"€â"€ */}
      <Dialog open={!!multiGrantTarget} onOpenChange={(open) => { if (!open) { setMultiGrantTarget(null); setMultiGrantSelections({}); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" />
              Grant Access to Multiple Companies
            </DialogTitle>
            <DialogDescription>
              Grant <strong>{multiGrantTarget?.name}</strong> access to multiple companies at once.
              Select which companies and choose a role for each.
              {!multiGrantTarget?.email && (
                <span className="block mt-1 text-amber-600">âš  This employee has no email address. Please update their profile first.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
            {allMyCompanies.filter(c => c.id !== activeCompanyId).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">You only have one company. Add more companies to use this feature.</p>
            ) : (
              allMyCompanies.filter(c => c.id !== activeCompanyId).map((company) => {
                const isSelected = !!multiGrantSelections[company.id];
                const selectedRole = multiGrantSelections[company.id] ?? "company_member";
                return (
                  <div key={company.id} className={`border rounded-lg p-3 transition-colors ${isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`company-${company.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMultiGrantSelections(prev => ({ ...prev, [company.id]: "company_member" }));
                          } else {
                            setMultiGrantSelections(prev => { const next = { ...prev }; delete next[company.id]; return next; });
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`company-${company.id}`} className="text-sm font-semibold text-gray-800 cursor-pointer">{company.name}</label>
                        <p className="text-xs text-gray-500">{company.country ?? ""}</p>
                        {isSelected && (
                          <div className="mt-2">
                            <Select value={selectedRole} onValueChange={(val) => setMultiGrantSelections(prev => ({ ...prev, [company.id]: val }))}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="company_admin">Owner / Admin – Full access</SelectItem>
                                <SelectItem value="hr_admin">HR Manager – HR modules</SelectItem>
                                <SelectItem value="finance_admin">Finance Manager – Payroll & Finance</SelectItem>
                                <SelectItem value="company_member">Staff / Employee – Employee home only</SelectItem>
                                <SelectItem value="reviewer">Reviewer – Read-only</SelectItem>
                                <SelectItem value="external_auditor">External Auditor – Limited read-only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMultiGrantTarget(null); setMultiGrantSelections({}); }}>Cancel</Button>
            <Button
              disabled={!multiGrantTarget?.email || Object.keys(multiGrantSelections).length === 0 || grantMultiCompanyAccess.isPending}
              onClick={() => {
                if (!multiGrantTarget || !activeCompanyId) return;
                const grants = Object.entries(multiGrantSelections).map(([companyId, role]) => ({ companyId: Number(companyId), role: role as any }));
                grantMultiCompanyAccess.mutate({
                  employeeId: multiGrantTarget.employeeId,
                  sourceCompanyId: activeCompanyId,
                  grants,
                  origin: window.location.origin,
                });
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {grantMultiCompanyAccess.isPending ? "Granting..." : `Grant to ${Object.keys(multiGrantSelections).length} Compan${Object.keys(multiGrantSelections).length === 1 ? 'y' : 'ies'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* â"€â"€ Grant Access Dialog â"€â"€ */}
      <Dialog open={!!grantTarget} onOpenChange={(open) => { if (!open) setGrantTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock size={18} className="text-green-600" />
              Grant System Access
            </DialogTitle>
            <DialogDescription>
              Grant <strong>{grantTarget?.name}</strong> access to SmartPRO.
              {grantTarget?.email ? (
                <span className="block mt-1 text-gray-500">Email: {grantTarget.email}</span>
              ) : (
                <span className="block mt-1 text-amber-600">âš  This employee has no email address. Please update their profile first.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Role</label>
              <Select value={grantRole} onValueChange={setGrantRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">Owner / Admin – Full access</SelectItem>
                  <SelectItem value="hr_admin">HR Manager – HR modules</SelectItem>
                  <SelectItem value="finance_admin">Finance Manager – Payroll & Finance</SelectItem>
                  <SelectItem value="company_member">Staff / Employee – Employee home only</SelectItem>
                  <SelectItem value="reviewer">Reviewer – Read-only</SelectItem>
                  <SelectItem value="external_auditor">External Auditor – Limited read-only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1.5">
                {ROLE_CONFIG[grantRole]?.description}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantTarget(null)}>Cancel</Button>
            <Button
              disabled={!grantTarget?.email || grantAccess.isPending}
              onClick={() => {
                if (!grantTarget) return;
                grantAccess.mutate({
                  employeeId: grantTarget.employeeId,
                  role: grantRole as any,
                  origin: window.location.origin,
                  companyId: activeCompanyId ?? undefined,
                });
              }}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              {grantAccess.isPending ? "Granting..." : "Grant Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* – Change Role Dialog (Employee) – */}
      <Dialog open={!!roleChangeTarget} onOpenChange={(open) => { if (!open) setRoleChangeTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role – {roleChangeTarget?.name}</DialogTitle>
            <DialogDescription>
              Current role: <strong>{ROLE_CONFIG[roleChangeTarget?.currentRole ?? ""]?.label ?? roleChangeTarget?.currentRole}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">Owner / Admin</SelectItem>
                <SelectItem value="hr_admin">HR Manager</SelectItem>
                <SelectItem value="finance_admin">Finance Manager</SelectItem>
                <SelectItem value="company_member">Staff / Employee</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="external_auditor">External Auditor</SelectItem>
              </SelectContent>
            </Select>
            {ROLE_CONFIG[newRole]?.description && (
              <p className="text-xs text-gray-500">{ROLE_CONFIG[newRole].description}</p>
            )}
            {newRole === "company_admin" && roleChangeTarget?.currentRole !== "company_admin" && (
              <div className="flex items-start gap-2 rounded bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span><strong>Promotion to Owner / Admin</strong> — grants full access to all modules, team management, payroll, and company settings.</span>
              </div>
            )}
            {roleChangeTarget?.currentRole === "company_admin" && newRole !== "company_admin" && (
              <div className="flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span><strong>Removing admin access</strong> — confirm another Owner / Admin will remain. The server will block this if they are the last admin.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button
              disabled={updateEmployeeRole.isPending || newRole === roleChangeTarget?.currentRole}
              onClick={() => {
                if (!roleChangeTarget) return;
                updateEmployeeRole.mutate({ employeeId: roleChangeTarget.employeeId, role: newRole as any, companyId: activeCompanyId ?? undefined });
              }}
            >
              {updateEmployeeRole.isPending ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* – Revoke Access Confirm – */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>{revokeTarget?.name}</strong> will immediately lose the ability to log in to SmartPRO.</p>
                <p>Their HR records — payroll, attendance, leave, and documents — are not deleted and remain intact. You can restore access at any time from the HR Employees tab.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!revokeTarget) return;
                revokeAccess.mutate({ employeeId: revokeTarget.employeeId, companyId: activeCompanyId ?? undefined });
              }}
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* â"€â"€ Add by Email Dialog â"€â"€ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={18} className="text-gray-600" />
              Add Team Member by Email
            </DialogTitle>
            <DialogDescription>
              Enter any email address. If they already have a SmartPRO account they will be added immediately.
              If not, an invite link will be created and sent to them automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Email Address</label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inviteEmail && !addMemberByEmail.isPending) {
                    addMemberByEmail.mutate({ email: inviteEmail, role: inviteRole as any, companyId: activeCompanyId ?? undefined, origin: window.location.origin });
                  }
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_admin">Owner / Admin</SelectItem>
                  <SelectItem value="hr_admin">HR Manager</SelectItem>
                  <SelectItem value="finance_admin">Finance Manager</SelectItem>
                  <SelectItem value="company_member">Staff / Employee</SelectItem>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="external_auditor">External Auditor</SelectItem>
                </SelectContent>
              </Select>
              {ROLE_CONFIG[inviteRole] && (
                <p className="text-xs text-gray-500 mt-1.5">{ROLE_CONFIG[inviteRole].description}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              disabled={!inviteEmail || addMemberByEmail.isPending}
              onClick={() => addMemberByEmail.mutate({ email: inviteEmail, role: inviteRole as any, companyId: activeCompanyId ?? undefined, origin: window.location.origin })}
            >
              {addMemberByEmail.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* – Member Role Change Dialog – */}
      <Dialog open={!!memberRoleTarget} onOpenChange={(open) => { if (!open) setMemberRoleTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role – {memberRoleTarget?.name}</DialogTitle>
            <DialogDescription>
              Current role: <strong>{ROLE_CONFIG[memberRoleTarget?.currentRole ?? ""]?.label ?? memberRoleTarget?.currentRole}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Select value={memberNewRole} onValueChange={setMemberNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">Owner / Admin</SelectItem>
                <SelectItem value="hr_admin">HR Manager</SelectItem>
                <SelectItem value="finance_admin">Finance Manager</SelectItem>
                <SelectItem value="company_member">Staff / Employee</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="external_auditor">External Auditor</SelectItem>
              </SelectContent>
            </Select>
            {ROLE_CONFIG[memberNewRole]?.description && (
              <p className="text-xs text-gray-500">{ROLE_CONFIG[memberNewRole].description}</p>
            )}
            {memberNewRole === "company_admin" && memberRoleTarget?.currentRole !== "company_admin" && (
              <div className="flex items-start gap-2 rounded bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span><strong>Promotion to Owner / Admin</strong> — grants full access to all modules, team management, payroll, and company settings.</span>
              </div>
            )}
            {memberRoleTarget?.currentRole === "company_admin" && memberNewRole !== "company_admin" && (
              <div className="flex items-start gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span><strong>Removing admin access</strong> — confirm another Owner / Admin will remain. The server will block this if they are the last admin.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberRoleTarget(null)}>Cancel</Button>
            <Button
              disabled={updateMemberRole.isPending || memberNewRole === memberRoleTarget?.currentRole}
              onClick={() => {
                if (!memberRoleTarget) return;
                updateMemberRole.mutate({ memberId: memberRoleTarget.id, role: memberNewRole as any, companyId: activeCompanyId ?? undefined });
              }}
            >
              {updateMemberRole.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* â"€â"€ Conflict review (Phase 4.3B) — diagnostics only; no auto-merge. */}
      <Dialog open={!!conflictReviewTarget} onOpenChange={(open) => { if (!open) setConflictReviewTarget(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {conflictReviewTarget && (
            <ConflictReviewDialogBody
              target={conflictReviewTarget}
              onClose={() => setConflictReviewTarget(null)}
              onLinkAccount={() => {
                const t = conflictReviewTarget;
                setConflictReviewTarget(null);
                setLinkTarget({ employeeId: t.employeeId, name: t.name });
                setLinkEmail(t.email ?? "");
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* â"€â"€ Link Account Dialog â"€â"€ */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => { if (!open) { setLinkTarget(null); setLinkEmail(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck size={18} className="text-purple-600" />
              Link Account – {linkTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Connects this HR employee row to the user account that signs in with the email below. Use when someone is
              already a company member but the portal still shows the {TA.chipAccountNotLinked.toLowerCase()} chip on this row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">User&apos;s login email</label>
              <Input
                type="email"
                placeholder="user@company.com"
                value={linkEmail}
                onChange={(e) => {
                  setLinkEmail(e.target.value);
                  linkMemberToEmployee.reset();
                }}
                className={linkMemberToEmployee.isError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Requirements: (1) they have signed in to SmartPRO at least once with this email, and (2) they are already a
                member of this company (invite accepted or Grant Access). Link Account only attaches their login to this
                employee record — it does not add them to the company.
              </p>
              {linkMemberToEmployee.isError && (
                <p className="text-sm text-destructive font-medium mt-2" role="alert">
                  {linkMemberToEmployee.error.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkTarget(null); setLinkEmail(""); }}>Cancel</Button>
            <Button
              disabled={!linkEmail || linkMemberToEmployee.isPending}
              onClick={() => {
                if (!linkTarget) return;
                linkMemberToEmployee.mutate({ employeeId: linkTarget.employeeId, memberEmail: linkEmail, companyId: activeCompanyId ?? undefined });
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {linkMemberToEmployee.isPending ? "Linking..." : "Link Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* – Remove Member Confirm – */}
      <AlertDialog open={!!removeMemberTarget} onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeMemberTarget?.name} from the team?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p><strong>{removeMemberTarget?.name}</strong> will immediately lose login access to SmartPRO.</p>
                <p>Their HR records are not affected. To grant access again, use &quot;Grant Access&quot; on the HR Employees tab or &quot;Add by Email&quot;.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!removeMemberTarget) return;
                removeMember.mutate({ memberId: removeMemberTarget.id, companyId: activeCompanyId ?? undefined });
              }}
            >
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

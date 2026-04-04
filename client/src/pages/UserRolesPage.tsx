import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
  Plus,
  Trash2,
  Wrench,
  Clock,
  Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MembershipEntry = {
  memberId: number;
  companyId: number;
  companyName: string;
  memberRole: string;
  isActive: boolean;
};

type AuditUser = {
  id: number;
  name: string | null;
  email: string | null;
  platformRole: string | null;
  role: string | null;
  isActive: boolean;
  loginMethod: string | null;
  createdAt: Date | string;
  lastSignedIn: Date | string;
  companies: MembershipEntry[];
  bestMemberRole: string | null;
  expectedPlatformRole: string;
  hasMismatch: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLATFORM_ROLE_LABELS: Record<string, string> = {
  platform_admin: "Platform Admin",
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  hr_admin: "HR Admin",
  finance_admin: "Finance Admin",
  company_member: "Member",
  reviewer: "Reviewer",
  external_auditor: "Auditor",
  client: "Client",
};

const PLATFORM_ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-red-100 text-red-800 border-red-200",
  super_admin: "bg-red-100 text-red-800 border-red-200",
  company_admin: "bg-orange-100 text-orange-800 border-orange-200",
  hr_admin: "bg-purple-100 text-purple-800 border-purple-200",
  finance_admin: "bg-blue-100 text-blue-800 border-blue-200",
  company_member: "bg-gray-100 text-gray-700 border-gray-200",
  reviewer: "bg-teal-100 text-teal-800 border-teal-200",
  external_auditor: "bg-yellow-100 text-yellow-800 border-yellow-200",
  client: "bg-slate-100 text-slate-600 border-slate-200",
};

const MEMBER_ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  hr_admin: "HR Admin",
  finance_admin: "Finance Admin",
  company_member: "Member",
  reviewer: "Reviewer",
  external_auditor: "Auditor",
  client: "Client",
};

const ACTION_LABELS: Record<string, string> = {
  update_platform_role: "Platform role updated",
  update_membership_role: "Membership role updated",
  fix_role_mismatch: "Mismatch fixed",
  bulk_fix_role_mismatch: "Bulk mismatch fix",
  add_user_to_company: "Added to company",
  remove_user_from_company: "Removed from company",
};

function RoleBadge({ role }: { role: string | null }) {
  const label = role ? (PLATFORM_ROLE_LABELS[role] ?? role) : "—";
  const color = role ? (PLATFORM_ROLE_COLORS[role] ?? "bg-gray-100 text-gray-700") : "bg-gray-100 text-gray-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

// ─── Add to Company Dialog ────────────────────────────────────────────────────

function AddToCompanyDialog({
  user,
  companies,
  open,
  onClose,
  onSuccess,
}: {
  user: AuditUser;
  companies: { id: number; name: string }[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [companyId, setCompanyId] = useState<string>("");
  const [role, setRole] = useState<string>("company_member");

  const addMutation = trpc.platformOps.addUserToCompany.useMutation({
    onSuccess: () => {
      toast.success(`${user.name ?? user.email} has been added successfully.`);
      onSuccess();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Company</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Adding <strong>{user.name ?? user.email}</strong> to a company.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Company</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select company…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">Company Admin</SelectItem>
                <SelectItem value="hr_admin">HR Admin</SelectItem>
                <SelectItem value="finance_admin">Finance Admin</SelectItem>
                <SelectItem value="company_member">Member</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="external_auditor">External Auditor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!companyId || addMutation.isPending}
            onClick={() => addMutation.mutate({ userId: user.id, companyId: Number(companyId), role: role as "company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "external_auditor" })}
          >
            {addMutation.isPending ? "Adding…" : "Add to Company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  companies,
  onRefresh,
}: {
  user: AuditUser;
  companies: { id: number; name: string }[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const utils = trpc.useUtils();

  const fixMismatch = trpc.platformOps.fixRoleMismatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Role fixed: ${data.oldPlatformRole} → ${data.newPlatformRole}`);
      utils.platformOps.getRoleAuditReport.invalidate();
      utils.platformOps.getRoleAuditLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePlatformRole = trpc.platformOps.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success("Platform role updated");
      utils.platformOps.getRoleAuditReport.invalidate();
      utils.platformOps.getRoleAuditLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleActive = trpc.platformOps.updateUserRole.useMutation({
    onSuccess: () => {
      toast.success(user.isActive ? "Account suspended" : "Account activated");
      utils.platformOps.getRoleAuditReport.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMemberRole = trpc.platformOps.updateCompanyMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Membership role updated");
      utils.platformOps.getRoleAuditReport.invalidate();
      utils.platformOps.getRoleAuditLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.platformOps.removeUserFromCompany.useMutation({
    onSuccess: () => {
      toast.success("Removed from company");
      utils.platformOps.getRoleAuditReport.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <>
      <div
        className={`border rounded-lg mb-2 overflow-hidden transition-all ${
          user.hasMismatch ? "border-amber-300 bg-amber-50/30" : "border-border bg-card"
        }`}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30"
          onClick={() => setExpanded((e) => !e)}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {initials}
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{user.name ?? "—"}</span>
              {!user.isActive && (
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200">Suspended</span>
              )}
              {user.hasMismatch && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                  <AlertTriangle size={10} /> Role Mismatch
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
          </div>

          {/* Platform role */}
          <div className="hidden sm:block shrink-0">
            <RoleBadge role={user.platformRole} />
          </div>

          {/* Company count */}
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Building2 size={12} />
            {user.companies.filter((c) => c.isActive).length} co.
          </div>

          {/* Mismatch fix button */}
          {user.hasMismatch && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                fixMismatch.mutate({ userId: user.id });
              }}
              disabled={fixMismatch.isPending}
            >
              <Wrench size={12} className="mr-1" />
              Fix
            </Button>
          )}

          {/* Expand toggle */}
          <div className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t px-4 py-4 bg-muted/10 space-y-4">
            {/* Platform role editor */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-medium text-muted-foreground mb-1">Platform Role</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={user.platformRole ?? "client"}
                    onValueChange={(v) =>
                      updatePlatformRole.mutate({
                        userId: user.id,
                        platformRole: v as "client" | "company_admin" | "platform_admin",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="platform_admin">Platform Admin</SelectItem>
                      <SelectItem value="company_admin">Company Admin</SelectItem>
                      <SelectItem value="company_member">Member</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                  {user.hasMismatch && (
                    <span className="text-xs text-amber-600">
                      Expected: <strong>{PLATFORM_ROLE_LABELS[user.expectedPlatformRole] ?? user.expectedPlatformRole}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus size={12} className="mr-1" />
                  Add to Company
                </Button>
                <Button
                  size="sm"
                  variant={user.isActive ? "outline" : "default"}
                  className={`h-8 text-xs ${user.isActive ? "text-red-600 border-red-300 hover:bg-red-50" : ""}`}
                  onClick={() => toggleActive.mutate({ userId: user.id, isActive: !user.isActive })}
                  disabled={toggleActive.isPending}
                >
                  {user.isActive ? (
                    <><XCircle size={12} className="mr-1" />Suspend</>
                  ) : (
                    <><CheckCircle2 size={12} className="mr-1" />Activate</>
                  )}
                </Button>
              </div>
            </div>

            {/* Company memberships */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Company Memberships ({user.companies.length})</p>
              {user.companies.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No company memberships</p>
              ) : (
                <div className="space-y-2">
                  {user.companies.map((m) => (
                    <div
                      key={m.memberId}
                      className={`flex items-center gap-3 p-2 rounded border text-sm ${
                        m.isActive ? "bg-background border-border" : "bg-muted/30 border-dashed opacity-60"
                      }`}
                    >
                      <Building2 size={14} className="text-muted-foreground shrink-0" />
                      <span className="flex-1 font-medium text-xs">{m.companyName}</span>
                      {!m.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                      {m.isActive && (
                        <Select
                          value={m.memberRole}
                          onValueChange={(v) =>
                            updateMemberRole.mutate({
                              memberId: m.memberId,
                              role: v as "company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "external_auditor",
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company_admin">Company Admin</SelectItem>
                            <SelectItem value="hr_admin">HR Admin</SelectItem>
                            <SelectItem value="finance_admin">Finance Admin</SelectItem>
                            <SelectItem value="company_member">Member</SelectItem>
                            <SelectItem value="reviewer">Reviewer</SelectItem>
                            <SelectItem value="external_auditor">Auditor</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {m.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                          onClick={() => removeMember.mutate({ memberId: m.memberId })}
                          disabled={removeMember.isPending}
                          title="Remove from company"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1 border-t">
              <span>ID: {user.id}</span>
              <span>Login: {user.loginMethod ?? "—"}</span>
              <span>Last seen: {user.lastSignedIn ? new Date(user.lastSignedIn).toLocaleDateString() : "—"}</span>
              <span>Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span>
            </div>
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddToCompanyDialog
          user={user}
          companies={companies}
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            utils.platformOps.getRoleAuditReport.invalidate();
            utils.platformOps.getRoleAuditLogs.invalidate();
          }}
        />
      )}
    </>
  );
}

// ─── Audit Log Panel ──────────────────────────────────────────────────────────

function AuditLogPanel() {
  const { data: logs, isLoading } = trpc.platformOps.getRoleAuditLogs.useQuery({ limit: 30 });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading audit log…</div>;
  if (!logs || logs.length === 0) return <div className="text-sm text-muted-foreground p-4 italic">No role change events yet.</div>;

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-sm">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={13} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-xs">{ACTION_LABELS[log.action] ?? log.action}</span>
              <span className="text-xs text-muted-foreground">by {log.actorName ?? log.actorEmail ?? `User #${log.actorId}`}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {(() => {
                const ov = log.oldValues as Record<string, unknown> | null;
                const nv = log.newValues as Record<string, unknown> | null;
                if (ov && typeof ov === "object" && "platformRole" in ov) {
                  return (
                    <span className="text-xs text-muted-foreground">
                      {String(ov.platformRole)} → {nv && "platformRole" in nv ? String(nv.platformRole) : "—"}
                    </span>
                  );
                }
                if (ov && typeof ov === "object" && "role" in ov) {
                  return (
                    <span className="text-xs text-muted-foreground">
                      {String(ov.role)} → {nv && "role" in nv ? String(nv.role) : "—"}
                    </span>
                  );
                }
                return null;
              })()}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock size={10} />
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserRolesPage() {
  const [search, setSearch] = useState("");
  const [filterMismatches, setFilterMismatches] = useState(false);
  const [filterPlatformRole, setFilterPlatformRole] = useState<string>("all");
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");

  const utils = trpc.useUtils();

  const { data: reportData, isLoading, refetch } = trpc.platformOps.getRoleAuditReport.useQuery({
    search: search || undefined,
    filterMismatches: filterMismatches || undefined,
    filterPlatformRole: filterPlatformRole !== "all" ? filterPlatformRole : undefined,
    filterCompanyId: filterCompanyId !== "all" ? Number(filterCompanyId) : undefined,
  });

  const { data: companies } = trpc.platformOps.listCompanies.useQuery();

  const bulkFix = trpc.platformOps.bulkFixMismatches.useMutation({
    onSuccess: (data) => {
      toast.success(`Fixed ${data.fixedCount} mismatches — all role inconsistencies resolved.`);
      utils.platformOps.getRoleAuditReport.invalidate();
      utils.platformOps.getRoleAuditLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const stats = reportData?.stats ?? { total: 0, mismatches: 0, admins: 0, suspended: 0 };
  const userList = reportData?.users ?? [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary" />
            User Roles & Access
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review all user roles, detect mismatches, and manage company access from one place.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); utils.platformOps.getRoleAuditLogs.invalidate(); }}
          className="gap-1 shrink-0"
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.mismatches > 0 ? "border-amber-300" : ""}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stats.mismatches > 0 ? "bg-amber-50" : "bg-green-50"}`}>
                {stats.mismatches > 0
                  ? <AlertTriangle size={18} className="text-amber-600" />
                  : <CheckCircle2 size={18} className="text-green-600" />}
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.mismatches}</p>
                <p className="text-xs text-muted-foreground">Mismatches</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <UserCheck size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.admins}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <XCircle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.suspended}</p>
                <p className="text-xs text-muted-foreground">Suspended</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mismatch alert banner */}
      {stats.mismatches > 0 && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-amber-300 bg-amber-50">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-900 text-sm">
                {stats.mismatches} user{stats.mismatches !== 1 ? "s have" : " has"} a role mismatch
              </p>
              <p className="text-xs text-amber-700">
                Their platform role doesn't match their highest company membership role. This can cause incorrect sidebar navigation.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => bulkFix.mutate()}
            disabled={bulkFix.isPending}
          >
            <Wrench size={14} className="mr-1" />
            {bulkFix.isPending ? "Fixing…" : "Fix All"}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("users")}
        >
          <span className="flex items-center gap-2">
            <Users size={14} />
            Users ({userList.length})
          </span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("audit")}
        >
          <span className="flex items-center gap-2">
            <Shield size={14} />
            Audit Log
          </span>
        </button>
      </div>

      {activeTab === "users" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={filterPlatformRole} onValueChange={setFilterPlatformRole}>
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="platform_admin">Platform Admin</SelectItem>
                <SelectItem value="company_admin">Company Admin</SelectItem>
                <SelectItem value="hr_admin">HR Admin</SelectItem>
                <SelectItem value="finance_admin">Finance Admin</SelectItem>
                <SelectItem value="company_member">Member</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="external_auditor">Auditor</SelectItem>
                <SelectItem value="client">Client</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {(companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={filterMismatches ? "default" : "outline"}
              size="sm"
              className="h-9 text-sm gap-1"
              onClick={() => setFilterMismatches((f) => !f)}
            >
              <AlertTriangle size={13} />
              Mismatches Only
            </Button>
          </div>

          {/* User list */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : userList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No users found</p>
              <p className="text-sm">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div>
              {userList.map((user) => (
                <UserRow
                  key={user.id}
                  user={user as AuditUser}
                  companies={companies ?? []}
                  onRefresh={() => {
                    utils.platformOps.getRoleAuditReport.invalidate();
                    utils.platformOps.getRoleAuditLogs.invalidate();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "audit" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield size={16} />
              Recent Role Change Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AuditLogPanel />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

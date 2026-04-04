import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ACCOUNT_TYPE_UI_CONFIG,
  WARNING_STYLES,
  deriveAccountType,
  deriveEffectiveAccess,
  deriveScope,
  deriveEdgeCaseWarning,
  type AccountType,
} from "../../../shared/roleHelpers";
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
  Users,
  XCircle,
  Plus,
  Trash2,
  Wrench,
  Building2,
  Globe,
  Briefcase,
  UserCircle2,
  Lock,
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
  accountType: string;
  effectiveAccess: string;
  scope: string;
  edgeCaseWarning: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
// ACCOUNT_TYPE_CONFIG is now imported from shared/roleHelpers as ACCOUNT_TYPE_UI_CONFIG
// This ensures the frontend and backend use the same classification logic.

const EFFECTIVE_ACCESS_COLORS: Record<string, string> = {
  "Super Admin": "bg-red-100 text-red-800 border-red-200",
  "Platform Admin": "bg-red-100 text-red-800 border-red-200",
  "Regional Manager": "bg-orange-100 text-orange-800 border-orange-200",
  "Client Services": "bg-orange-100 text-orange-800 border-orange-200",
  "Company Admin": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "HR Manager": "bg-purple-100 text-purple-800 border-purple-200",
  "Finance Manager": "bg-blue-100 text-blue-800 border-blue-200",
  "Reviewer": "bg-teal-100 text-teal-800 border-teal-200",
  "Team Member": "bg-gray-100 text-gray-700 border-gray-200",
  "External Auditor": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Customer Portal": "bg-slate-100 text-slate-600 border-slate-200",
  "No Assigned Access": "bg-red-50 text-red-500 border-red-200",
  // Needs Review — shown in the fallback group for unknown/null roles
  "Unknown Role": "bg-red-100 text-red-700 border-red-300",
};

const ACTION_LABELS: Record<string, string> = {
  update_platform_role: "Platform role updated",
  update_membership_role: "Membership role updated",
  fix_role_mismatch: "Mismatch fixed",
  bulk_fix_role_mismatch: "Bulk mismatch fix",
  add_user_to_company: "Added to company",
  remove_user_from_company: "Removed from company",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function EffectiveAccessBadge({ label }: { label: string }) {
  const color = EFFECTIVE_ACCESS_COLORS[label] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

function AccountTypePill({ accountType }: { accountType: string }) {
  const cfg = ACCOUNT_TYPE_UI_CONFIG[accountType as AccountType];
  if (!cfg) return null;
  const iconMap: Record<string, React.ReactNode> = {
    platform_staff: <Shield size={12} className="text-red-600" />,
    business_user: <Briefcase size={12} className="text-gray-600" />,
    customer: <UserCircle2 size={12} className="text-slate-500" />,
    auditor: <Lock size={12} className="text-yellow-600" />,
    needs_review: <AlertTriangle size={12} className="text-red-600" />,
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
      {iconMap[accountType]}
      {cfg.label}
    </span>
  );
}

// ─── Add to Company Dialog ────────────────────────────────────────────────────
function AddToCompanyDialog({
  user, companies, open, onClose, onSuccess,
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
    onSuccess: () => { toast.success(`${user.name ?? user.email} added successfully.`); onSuccess(); onClose(); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add to Company</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Adding <strong>{user.name ?? user.email}</strong> to a company.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Company</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role in Company</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="company_admin">Company Admin (Owner)</SelectItem>
                <SelectItem value="hr_admin">HR Manager</SelectItem>
                <SelectItem value="finance_admin">Finance Manager</SelectItem>
                <SelectItem value="company_member">Member (Employee)</SelectItem>
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
            onClick={() => addMutation.mutate({
              userId: user.id,
              companyId: Number(companyId),
              role: role as "company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "external_auditor",
            })}
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
  user, companies, onRefresh,
}: {
  user: AuditUser;
  companies: { id: number; name: string }[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const utils = trpc.useUtils();

  const fixMismatch = trpc.platformOps.fixRoleMismatch.useMutation({
    onSuccess: () => { toast.success("Role mismatch fixed."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const updatePlatformRole = trpc.platformOps.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Platform role updated."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const updateMemberRole = trpc.platformOps.updateCompanyMemberRole.useMutation({
    onSuccess: () => { toast.success("Membership role updated."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const removeMember = trpc.platformOps.removeUserFromCompany.useMutation({
    onSuccess: () => { toast.success("Removed from company."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });
  const toggleActive = trpc.platformOps.updateUserRole.useMutation({
    onSuccess: () => { toast.success(user.isActive ? "Account suspended." : "Account reactivated."); onRefresh(); },
    onError: (err) => toast.error(err.message),
  });

  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <>
      <div className={`border rounded-lg mb-2 overflow-hidden transition-all ${user.hasMismatch ? "border-amber-300 bg-amber-50/20" : "border-border bg-card"}`}>
        {/* Main row */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{user.name ?? "—"}</span>
              {!user.isActive && (
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200">Suspended</span>
              )}
              {user.hasMismatch && (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                  <AlertTriangle size={10} /> Mismatch
                </span>
              )}
              {user.edgeCaseWarning === "business_role_no_membership" && !user.hasMismatch && (
                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200 flex items-center gap-1">
                  <AlertTriangle size={10} /> No membership
                </span>
              )}
              {user.edgeCaseWarning === "client_has_membership" && (
                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                  <AlertTriangle size={10} /> Inconsistent
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email ?? "—"}</p>
          </div>
          {/* Effective Access — primary display, replaces raw platformRole */}
          <div className="hidden sm:block shrink-0">
            <EffectiveAccessBadge label={user.effectiveAccess} />
          </div>
          {/* Scope */}
          <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground shrink-0 max-w-[150px]">
            {user.accountType === "platform_staff"
              ? <><Globe size={11} /><span>All companies</span></>
              : user.scope === "No company"
                ? <span className="opacity-50">No company</span>
                : <><Building2 size={11} /><span className="truncate">{user.scope}</span></>
            }
          </div>
          {user.hasMismatch && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50 h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); fixMismatch.mutate({ userId: user.id }); }}
              disabled={fixMismatch.isPending}
            >
              <Wrench size={12} className="mr-1" />Fix
            </Button>
          )}
          <div className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t px-4 py-4 bg-muted/10 space-y-5">
            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Account Type</p>
                <AccountTypePill accountType={user.accountType} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Effective Access</p>
                <EffectiveAccessBadge label={user.effectiveAccess} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Scope</p>
                <p className="text-sm font-medium">{user.scope}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Login Method</p>
                <p className="text-sm">{user.loginMethod ?? "—"}</p>
              </div>
            </div>

            {/* Mismatch warning */}
            {user.hasMismatch && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">Role Mismatch Detected</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Platform role is <strong>{user.platformRole}</strong> but company membership suggests it should be <strong>{user.expectedPlatformRole}</strong>.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                  onClick={() => fixMismatch.mutate({ userId: user.id })}
                  disabled={fixMismatch.isPending}
                >
                  Fix Now
                </Button>
              </div>
            )}
            {/* Edge case: business role but no company membership */}
            {user.edgeCaseWarning === "business_role_no_membership" && !user.hasMismatch && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-orange-300 bg-orange-50">
                <AlertTriangle size={16} className="text-orange-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-900">Business Role Without Company Membership</p>
                  <p className="text-xs text-orange-700 mt-0.5">
                    This user has a business platformRole (<strong>{user.platformRole}</strong>) but is not a member of any company.
                    Their Effective Access shows <strong>No Assigned Access</strong> until they are added to a company.
                  </p>
                </div>
              </div>
            )}
            {/* Edge case: client platformRole but has company membership */}
            {user.edgeCaseWarning === "client_has_membership" && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-purple-300 bg-purple-50">
                <AlertTriangle size={16} className="text-purple-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-purple-900">Inconsistent Data: Client with Company Membership</p>
                  <p className="text-xs text-purple-700 mt-0.5">
                    This user's platformRole is <strong>client</strong> but they have active company memberships.
                    Consider fixing the platformRole to match their membership role.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                  onClick={() => fixMismatch.mutate({ userId: user.id })}
                  disabled={fixMismatch.isPending}
                >
                  Fix Role
                </Button>
              </div>
            )}

            {/* Platform role editor */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Change Platform Role</p>
              <div className="flex items-center gap-3 flex-wrap">
                <Select
                  value={user.platformRole ?? "client"}
                  onValueChange={(v) =>
                    updatePlatformRole.mutate({
                      userId: user.id,
                      platformRole: v as "client" | "company_admin" | "platform_admin",
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin (Platform Staff)</SelectItem>
                    <SelectItem value="platform_admin">Platform Admin (Platform Staff)</SelectItem>
                    <SelectItem value="regional_manager">Regional Manager (Platform Staff)</SelectItem>
                    <SelectItem value="client_services">Client Services (Platform Staff)</SelectItem>
                    <SelectItem value="company_admin">Company Admin (Business User)</SelectItem>
                    <SelectItem value="hr_admin">HR Manager (Business User)</SelectItem>
                    <SelectItem value="finance_admin">Finance Manager (Business User)</SelectItem>
                    <SelectItem value="company_member">Company Member (Business User)</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="external_auditor">External Auditor</SelectItem>
                    <SelectItem value="client">Customer Portal</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Use "Fix Mismatch" for auto-correction.</p>
              </div>
            </div>

            {/* Edge case: unknown/null role */}
            {user.edgeCaseWarning === null && !user.hasMismatch && user.accountType === "needs_review" && (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-red-300 bg-red-50">
                <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-900">Unknown or Invalid Role</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    This user's platformRole (<strong>{user.platformRole ?? "null"}</strong>) is not a recognized value.
                    Assign a valid role using the selector below to restore access.
                  </p>
                </div>
              </div>
            )}

            {/* Company memberships */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Company Memberships</p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddDialog(true)}>
                  <Plus size={11} className="mr-1" />Add to Company
                </Button>
              </div>
              {user.companies.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No company memberships — Customer Portal access only.</p>
              ) : (
                <div className="space-y-2">
                  {[...user.companies]
                    .sort((a, b) => {
                      // Active first, then by company name (stable sort)
                      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
                      return a.companyName.localeCompare(b.companyName);
                    })
                    .map((m, idx) => (
                    <div
                      key={m.memberId}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border ${m.isActive ? "border-border bg-background" : "border-dashed border-muted-foreground/30 bg-muted/20 opacity-60"}`}
                    >
                      <Building2 size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{m.companyName}</p>
                          {idx === 0 && user.companies.filter((c) => c.isActive).length > 0 && m.isActive && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">Primary</span>
                          )}
                        </div>
                        {!m.isActive && <p className="text-xs text-muted-foreground">Inactive membership</p>}
                      </div>
                      <Select
                        value={m.memberRole}
                        onValueChange={(v) =>
                          updateMemberRole.mutate({
                            memberId: m.memberId,
                            role: v as "company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "external_auditor",
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company_admin">Company Admin</SelectItem>
                          <SelectItem value="hr_admin">HR Manager</SelectItem>
                          <SelectItem value="finance_admin">Finance Manager</SelectItem>
                          <SelectItem value="company_member">Member</SelectItem>
                          <SelectItem value="reviewer">Reviewer</SelectItem>
                          <SelectItem value="external_auditor">External Auditor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                        onClick={() => removeMember.mutate({ memberId: m.memberId })}
                        disabled={removeMember.isPending}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Account actions */}
            <div className="flex items-center gap-2 pt-1 border-t">
              <Button
                size="sm"
                variant="outline"
                className={`h-8 text-xs ${user.isActive ? "text-red-600 border-red-300 hover:bg-red-50" : "text-green-700 border-green-300 hover:bg-green-50"}`}
                onClick={() => toggleActive.mutate({ userId: user.id, isActive: !user.isActive })}
                disabled={toggleActive.isPending}
              >
                {user.isActive
                  ? <><XCircle size={12} className="mr-1" />Suspend Account</>
                  : <><CheckCircle2 size={12} className="mr-1" />Reactivate Account</>
                }
              </Button>
              <p className="text-xs text-muted-foreground">
                Joined {new Date(user.createdAt).toLocaleDateString()}
                {user.lastSignedIn ? ` · Last seen ${new Date(user.lastSignedIn).toLocaleDateString()}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>

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
    </>
  );
}

// ─── Grouped Section ──────────────────────────────────────────────────────────
function UserGroup({
  accountType, users, companies, onRefresh,
}: {
  accountType: string;
  users: AuditUser[];
  companies: { id: number; name: string }[];
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = ACCOUNT_TYPE_UI_CONFIG[accountType as AccountType] ?? { label: accountType, color: "border-gray-200 bg-gray-50", description: "", borderColor: "border-l-gray-400" };
  const mismatches = users.filter((u) => u.hasMismatch).length;
  const edgeCases = users.filter((u) => u.edgeCaseWarning).length;
  const iconMap: Record<string, React.ReactNode> = {
    platform_staff: <Shield size={16} className="text-red-600" />,
    business_user: <Briefcase size={16} className="text-gray-600" />,
    customer: <UserCircle2 size={16} className="text-slate-500" />,
    auditor: <Lock size={16} className="text-yellow-600" />,
    needs_review: <AlertTriangle size={16} className="text-red-600" />,
  };

  return (
    <div className={`rounded-xl border-2 ${cfg.color} mb-4 overflow-hidden border-l-4 ${cfg.borderColor}`}>
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-black/5 transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="shrink-0">{iconMap[accountType] ?? <Users size={16} />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-sm">{cfg.label}</span>
            <span className="text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </span>
            {mismatches > 0 && (
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1">
                <AlertTriangle size={10} /> {mismatches} mismatch{mismatches !== 1 ? "es" : ""}
              </span>
            )}
            {edgeCases > 0 && (
              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full border border-orange-300 flex items-center gap-1">
                <AlertTriangle size={10} /> {edgeCases} data issue{edgeCases !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
        </div>
        <div className="text-muted-foreground shrink-0">
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 pt-1 bg-background/60">
          {users.map((user) => (
            <UserRow key={user.id} user={user} companies={companies} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Audit Log Panel ──────────────────────────────────────────────────────────
function AuditLogPanel() {
  const { data, isLoading } = trpc.platformOps.getRoleAuditLogs.useQuery({ limit: 30 });
  const logs = Array.isArray(data) ? data : [];
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5].map((i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}
      </div>
    );
  }
  if (!logs.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No role change events recorded yet.</p>;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const oldVals = (log.oldValues as Record<string, unknown>) ?? {};
        const newVals = (log.newValues as Record<string, unknown>) ?? {};
        return (
          <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
            <ShieldCheck size={14} className="text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                {log.actorEmail && (
                  <span className="text-muted-foreground"> by <strong>{log.actorEmail}</strong></span>
                )}
              </p>
              {(Object.keys(oldVals).length > 0 || Object.keys(newVals).length > 0) && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Object.entries(newVals).map(([k, v]) => (
                    <span key={k}>{k}: <strong>{String(oldVals[k] ?? "—")}</strong> → <strong>{String(v)}</strong> </span>
                  ))}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground shrink-0">
              {new Date(log.createdAt).toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function UserRolesPage() {
  const [search, setSearch] = useState("");
  const [filterAccountType, setFilterAccountType] = useState<string>("all");
  const [filterMismatches, setFilterMismatches] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");

  const { data, isLoading, refetch } = trpc.platformOps.getRoleAuditReport.useQuery(
    {
      search: search || undefined,
      filterMismatches: filterMismatches || undefined,
      filterCompanyId: filterCompanyId !== "all" ? Number(filterCompanyId) : undefined,
    },
    { refetchOnWindowFocus: false }
  );

  const { data: companiesData } = trpc.platformOps.listCompanies.useQuery();
  const utils = trpc.useUtils();

  const bulkFix = trpc.platformOps.bulkFixMismatches.useMutation({
    onSuccess: (res) => {
      toast.success(`Fixed ${res.fixedCount} mismatch${res.fixedCount !== 1 ? "es" : ""}.`);
      utils.platformOps.getRoleAuditReport.invalidate();
      utils.platformOps.getRoleAuditLogs.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRefresh = () => {
    utils.platformOps.getRoleAuditReport.invalidate();
    utils.platformOps.getRoleAuditLogs.invalidate();
  };

  const rawStats = data?.stats ?? {};
  const stats = { total: 0, mismatches: 0, admins: 0, suspended: 0, platformStaff: 0, businessUsers: 0, customers: 0, ...rawStats };
  const allUsers = (data?.users ?? []) as AuditUser[];
  const companies = companiesData ?? [];

  // Apply account type filter client-side
  const filteredUsers = filterAccountType === "all"
    ? allUsers
    : allUsers.filter((u) => u.accountType === filterAccountType);

  // Group by accountType in defined order — needs_review is the fallback bucket
  const GROUP_ORDER = ["platform_staff", "business_user", "customer", "auditor", "needs_review"];
  const grouped = GROUP_ORDER.reduce<Record<string, AuditUser[]>>((acc, key) => {
    const group = filteredUsers.filter((u) => u.accountType === key);
    if (group.length > 0) acc[key] = group;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            User Roles &amp; Access
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and manage all user identities, effective access levels, and company memberships.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { handleRefresh(); refetch(); }} className="gap-1 shrink-0">
          <RefreshCw size={14} />Refresh
        </Button>
      </div>

      {/* Stats — by account type */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <Shield size={18} className="text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.platformStaff}</p>
                <p className="text-xs text-muted-foreground">Platform Staff</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <Briefcase size={18} className="text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.businessUsers}</p>
                <p className="text-xs text-muted-foreground">Company Users</p>
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
                  : <CheckCircle2 size={18} className="text-green-600" />
                }
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.mismatches}</p>
                <p className="text-xs text-muted-foreground">Mismatches</p>
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
                Their platform role does not match their highest company membership role, which can cause incorrect sidebar access.
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
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("users")}
        >
          <span className="flex items-center gap-2"><Users size={14} />Users &amp; Roles ({allUsers.length})</span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "audit" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("audit")}
        >
          <span className="flex items-center gap-2"><Shield size={14} />Audit Log</span>
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
            <Select value={filterAccountType} onValueChange={setFilterAccountType}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Account Types</SelectItem>
                <SelectItem value="platform_staff">Platform Staff</SelectItem>
                <SelectItem value="business_user">Company Users</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="auditor">Auditors</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
              <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.map((c) => (
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
              <AlertTriangle size={13} />Mismatches Only
            </Button>
          </div>

          {/* Model explanation */}
          <div className="p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground">
            <strong>How this works:</strong> Each user has one <strong>Account Type</strong> (Platform Staff / Business User / Customer),
            an <strong>Effective Access</strong> label computed from their highest role, and a <strong>Scope</strong> showing which companies they can access.
            The legacy <em>admin/user</em> system field is hidden — use Effective Access instead.
          </div>

          {/* Grouped user list */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No users found</p>
              <p className="text-sm">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <div>
              {Object.entries(grouped).map(([accountType, groupUsers]) => (
                <UserGroup
                  key={accountType}
                  accountType={accountType}
                  users={groupUsers}
                  companies={companies}
                  onRefresh={handleRefresh}
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
              <Shield size={16} />Role Change History
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

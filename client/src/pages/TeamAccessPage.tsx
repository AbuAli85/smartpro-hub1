import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
  ChevronDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Role Configuration ───────────────────────────────────────────────────────

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
    description: "Full access to everything — all modules, all settings, team management",
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200",
    icon: <Crown size={14} className="text-orange-500" />,
    access: ["All modules", "Team management", "Payroll & Finance", "Company settings", "HR & Employees"],
  },
  hr_admin: {
    label: "HR Manager",
    description: "Full access to all HR modules — employees, payroll, leave, attendance, letters, tasks",
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
    description: "Access to Employee home only — their own attendance, tasks, leave, announcements",
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
    description: "Limited read-only access — cannot see payroll, HR management, or admin pages",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    icon: <Shield size={14} className="text-yellow-500" />,
    access: ["View company data (limited)", "No payroll access", "No HR management"],
  },
};

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

function AccessStatusBadge({ status }: { status: 'active' | 'inactive' | 'no_access' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 size={11} /> Active
      </span>
    );
  }
  if (status === 'inactive') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
        <XCircle size={11} /> Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <Clock size={11} /> No Access
    </span>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────────

function EmptyEmployeesState({ totalEmployees }: { totalEmployees: number }) {
  const [, setLocation] = useLocation();
  if (totalEmployees > 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-400">
        No employees match your search.
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeamAccessPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();

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
  const revokeInviteMutation = trpc.companies.revokeInvite.useMutation({
    onSuccess: () => { utils.companies.listInvites.invalidate(); toast.success("Invite revoked"); },
    onError: (err) => toast.error(err.message),
  });

  // UI state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "no_access" | "inactive">("all");
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

  // Multi-company grant mutation
  const grantMultiCompanyAccess = trpc.companies.grantMultiCompanyAccess.useMutation({
    onSuccess: (res) => {
      utils.companies.employeesWithAccess.invalidate();
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
      utils.companies.members.invalidate();
      toast.success("Access revoked");
      setRevokeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateEmployeeRole = trpc.companies.updateEmployeeAccessRole.useMutation({
    onSuccess: () => {
      utils.companies.employeesWithAccess.invalidate();
      utils.companies.members.invalidate();
      utils.auth.me.invalidate();
      toast.success("Role updated — sidebar will refresh automatically");
      setRoleChangeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const addMemberByEmail = trpc.companies.addMemberByEmail.useMutation({
    onSuccess: (res) => {
      utils.companies.members.invalidate();
      utils.companies.employeesWithAccess.invalidate();
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
      utils.auth.me.invalidate();
      toast.success("Role updated — sidebar will refresh automatically");
      setMemberRoleTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const linkMemberToEmployee = trpc.companies.linkMemberToEmployee.useMutation({
    onSuccess: (res) => {
      utils.companies.employeesWithAccess.invalidate();
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
      toast.success("Member removed");
      setRemoveMemberTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Filtered employees
  const filteredEmployees = employeesWithAccess.filter((emp) => {
    const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || emp.email?.toLowerCase().includes(search.toLowerCase()) || emp.department?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || emp.accessStatus === filterStatus;
    return matchSearch && matchStatus;
  });

  // Stats — combine HR employees + direct members for a complete picture
  const totalEmployees = employeesWithAccess.length;
  const withAccess = employeesWithAccess.filter((e) => e.accessStatus === 'active').length;
  const noAccess = employeesWithAccess.filter((e) => e.accessStatus === 'no_access').length;
  const suspended = employeesWithAccess.filter((e) => e.accessStatus === 'inactive').length;
  const activeMembers = members.filter((m) => m.isActive);
  const pendingInvitesList = pendingInvites.filter((i) => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date());
  // Total unique people = HR employees + direct members not already in HR list
  // Build set of memberId values already represented in HR employee list
  const hrMemberIds = new Set(employeesWithAccess.map((e) => e.memberId).filter(Boolean));
  const directOnlyMembers = activeMembers.filter((m) => !hrMemberIds.has(m.memberId));
  const totalTeamSize = totalEmployees + directOnlyMembers.length;

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
          <Button variant="outline" size="sm" onClick={() => { refetch(); }} className="gap-2">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="gap-2">
            <Plus size={16} /> Add by Email
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <Users size={18} className="text-gray-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{totalTeamSize}</div>
            <div className="text-xs text-gray-500">Total Employees</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={18} className="text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-green-700">{activeMembers.length}</div>
            <div className="text-xs text-gray-500">With Active Access</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Clock size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-700">{pendingInvitesList.length}</div>
            <div className="text-xs text-gray-500">Pending Invites</div>
          </div>
        </div>
        <div className="bg-white border rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
            <XCircle size={18} className="text-red-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-red-700">{suspended}</div>
            <div className="text-xs text-gray-500">Suspended</div>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="members">
        <TabsList className="mb-4">
          <TabsTrigger value="members" className="gap-2">
            <CheckCircle2 size={14} /> Active Members ({activeMembers.length})
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <Users size={14} /> HR Employees ({totalEmployees})
          </TabsTrigger>
          {pendingInvitesList.length > 0 && (
            <TabsTrigger value="invites" className="gap-2">
              <Clock size={14} /> Pending Invites ({pendingInvitesList.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="roles" className="gap-2">
            <Info size={14} /> Role Guide
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: All Employees ── */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-800">
                  All Employees — Access Status
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
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                    <SelectTrigger className="h-9 w-36 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active Access</SelectItem>
                      <SelectItem value="no_access">No Access</SelectItem>
                      <SelectItem value="inactive">Suspended</SelectItem>
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
                    return (
                      <div key={emp.employeeId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        {/* Avatar */}
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        {/* Employee Info */}
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
                          </div>
                        </div>

                        {/* Access Status */}
                        <div className="shrink-0 hidden sm:block">
                          <AccessStatusBadge status={emp.accessStatus as any} />
                        </div>

                        {/* Role (if has access) */}
                        <div className="shrink-0 hidden md:block">
                          {emp.memberRole ? (
                            <RoleBadge role={emp.memberRole} />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          {emp.accessStatus === 'active' ? (
                            <>
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
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1 text-purple-600 hover:text-purple-700 hover:border-purple-300"
                                onClick={() => { setLinkTarget({ employeeId: emp.employeeId, name: fullName }); setLinkEmail(emp.email ?? ""); }}
                                title="Manually link this employee to a SmartPRO account by email"
                              >
                                <UserCheck size={12} /> Link Account
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:border-red-300"
                                onClick={() => setRevokeTarget({ employeeId: emp.employeeId, name: fullName })}
                              >
                                <Lock size={12} /> Revoke
                              </Button>
                            </>
                          ) : emp.accessStatus === 'inactive' ? (
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
                          ) : (
                            <>
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
                              {allMyCompanies.length > 1 && (
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
                            </>
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

        {/* ── Tab 2: Active Logins ── */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-500" />
                  Active System Logins
                </span>
                <Badge variant="secondary">{activeMembers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
              ) : activeMembers.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  No active members yet. Add employees in HR → My Team, then grant them system access from the HR Employees tab.
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

        {/* ── Tab 3: Role Guide ── */}
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
                    <p><strong>Step 2:</strong> Come to this page → "All Employees" tab → click "Grant Access" on any employee</p>
                    <p><strong>Step 3:</strong> Choose their role (Staff, HR Manager, Finance, etc.)</p>
                    <p><strong>Step 4:</strong> If they have a SmartPRO account (same email), they get access immediately. If not, an invite link is generated.</p>
                    <p><strong>Step 5:</strong> They log in at SmartPRO and see only what their role allows.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Pending Invites ── */}
        <TabsContent value="invites">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  Pending Invites
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
      {/* ── Multi-Company Access Dialog ── */}
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
                <span className="block mt-1 text-amber-600">⚠ This employee has no email address. Please update their profile first.</span>
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
                                <SelectItem value="company_admin">Owner / Admin — Full access</SelectItem>
                                <SelectItem value="hr_admin">HR Manager — HR modules</SelectItem>
                                <SelectItem value="finance_admin">Finance Manager — Payroll & Finance</SelectItem>
                                <SelectItem value="company_member">Staff / Employee — Employee home only</SelectItem>
                                <SelectItem value="reviewer">Reviewer — Read-only</SelectItem>
                                <SelectItem value="external_auditor">External Auditor — Limited read-only</SelectItem>
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

      {/* ── Grant Access Dialog ── */}
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
                <span className="block mt-1 text-amber-600">⚠ This employee has no email address. Please update their profile first.</span>
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
                  <SelectItem value="company_admin">Owner / Admin — Full access</SelectItem>
                  <SelectItem value="hr_admin">HR Manager — HR modules</SelectItem>
                  <SelectItem value="finance_admin">Finance Manager — Payroll & Finance</SelectItem>
                  <SelectItem value="company_member">Staff / Employee — Employee home only</SelectItem>
                  <SelectItem value="reviewer">Reviewer — Read-only</SelectItem>
                  <SelectItem value="external_auditor">External Auditor — Limited read-only</SelectItem>
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

      {/* ── Change Role Dialog (Employee) ── */}
      <Dialog open={!!roleChangeTarget} onOpenChange={(open) => { if (!open) setRoleChangeTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role — {roleChangeTarget?.name}</DialogTitle>
            <DialogDescription>
              Select a new role for this team member.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
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
            <p className="text-xs text-gray-500 mt-2">{ROLE_CONFIG[newRole]?.description}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button
              disabled={updateEmployeeRole.isPending}
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

      {/* ── Revoke Access Confirm ── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access — {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent {revokeTarget?.name} from logging in to SmartPRO. Their HR data (payroll, attendance, leave) will not be deleted. You can restore access at any time.
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

      {/* ── Add by Email Dialog ── */}
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

      {/* ── Member Role Change Dialog ── */}
      <Dialog open={!!memberRoleTarget} onOpenChange={(open) => { if (!open) setMemberRoleTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role — {memberRoleTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberRoleTarget(null)}>Cancel</Button>
            <Button
              disabled={updateMemberRole.isPending}
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

      {/* ── Link Account Dialog ── */}
      <Dialog open={!!linkTarget} onOpenChange={(open) => { if (!open) { setLinkTarget(null); setLinkEmail(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck size={18} className="text-purple-600" />
              Link Account — {linkTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Connects this HR employee row to the user account that signs in with the email below. Use when someone is
              already a company member but the portal still shows &quot;Account Not Linked&quot;.
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
                employee record—it does not add them to the company.
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

      {/* ── Remove Member Confirm ── */}
      <AlertDialog open={!!removeMemberTarget} onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeMemberTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove their system access. Their HR data will not be deleted.
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
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

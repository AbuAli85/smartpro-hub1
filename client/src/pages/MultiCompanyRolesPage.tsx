import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, Search, Building2, ShieldCheck, Pencil, Trash2,
  RefreshCw, ChevronDown, ChevronRight, Globe,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ── Role helpers ──────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: "company_admin",    label: "Owner / Admin",        color: "bg-red-100 text-red-700 border-red-200" },
  { value: "hr_admin",         label: "HR Manager",           color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "finance_admin",    label: "Finance Manager",      color: "bg-green-100 text-green-700 border-green-200" },
  { value: "company_member",   label: "Staff / Employee",     color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "reviewer",         label: "Reviewer",             color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "external_auditor", label: "External Auditor",     color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "client",           label: "Client",               color: "bg-teal-100 text-teal-700 border-teal-200" },
] as const;

function getRoleOption(role: string) {
  return ROLE_OPTIONS.find(r => r.value === role) ?? { value: role, label: role, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

function RoleBadge({ role }: { role: string }) {
  const opt = getRoleOption(role);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Membership = {
  memberId: number;
  companyId: number;
  companyName: string;
  role: string;
  isActive: boolean;
  joinedAt: Date;
};

type UserRow = {
  userId: number;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  memberships: Membership[];
};

// ── Edit Role Dialog ──────────────────────────────────────────────────────────
function EditRoleDialog({
  open,
  onClose,
  membership,
  userName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  membership: Membership | null;
  userName: string | null;
  onSaved: () => void;
}) {
  const [selectedRole, setSelectedRole] = useState<string>(membership?.role ?? "company_member");

  const updateRole = trpc.companies.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success(`${userName}'s role in ${membership?.companyName} has been updated.`);
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={18} className="text-blue-500" />
            Edit Role
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Change <strong>{userName}</strong>'s role in <strong>{membership?.companyName}</strong>.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New Role</label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!membership) return;
              updateRole.mutate({ memberId: membership.memberId, companyId: membership.companyId, role: selectedRole as any, });
            }}
            disabled={updateRole.isPending || selectedRole === membership?.role}
          >
            {updateRole.isPending ? "Saving..." : "Save Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Revoke Confirm Dialog ─────────────────────────────────────────────────────
function RevokeDialog({
  open,
  onClose,
  membership,
  userName,
  onRevoked,
}: {
  open: boolean;
  onClose: () => void;
  membership: Membership | null;
  userName: string | null;
  onRevoked: () => void;
}) {
  const revoke = trpc.companies.revokeMemberAccess.useMutation({
    onSuccess: () => {
      toast.success(`${userName}'s access to ${membership?.companyName} has been revoked.`);
      onRevoked();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <Trash2 size={18} />
            Revoke Access
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to revoke <strong>{userName}</strong>'s access to <strong>{membership?.companyName}</strong>?
          </p>
          <p className="text-xs text-muted-foreground">
            They will no longer be able to log in to this company. Their employee record will remain intact.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!membership) return;
              revoke.mutate({ memberId: membership.memberId, companyId: membership.companyId });
            }}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? "Revoking..." : "Revoke Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── User Row (expandable) ─────────────────────────────────────────────────────
function UserAccessRow({
  user,
  onEditRole,
  onRevoke,
}: {
  user: UserRow;
  onEditRole: (membership: Membership, user: UserRow) => void;
  onRevoke: (membership: Membership, user: UserRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = user.memberships.filter(m => m.isActive).length;
  const allCompanies = user.memberships.map(m => m.companyName).join(", ");

  return (
    <>
      {/* Summary row */}
      <TableRow
        className="cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <TableCell className="w-8">
          {expanded
            ? <ChevronDown size={16} className="text-muted-foreground" />
            : <ChevronRight size={16} className="text-muted-foreground" />
          }
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-sm leading-tight">{user.name ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{user.email ?? "No email"}</p>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <Globe size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{activeCount}</span>
            <span className="text-xs text-muted-foreground">
              {activeCount === 1 ? "company" : "companies"}
            </span>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xs text-muted-foreground truncate max-w-[240px]">{allCompanies}</p>
              </TooltipTrigger>
              <TooltipContent>{allCompanies}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {Array.from(new Set(user.memberships.filter(m => m.isActive).map(m => m.role))).map(role => (
              <RoleBadge key={role} role={role} />
            ))}
          </div>
        </TableCell>
        <TableCell />
      </TableRow>

      {/* Expanded detail rows */}
      {expanded && user.memberships.map(m => (
        <TableRow key={m.memberId} className="bg-muted/20">
          <TableCell />
          <TableCell>
            <div className="flex items-center gap-2 pl-4">
              <Building2 size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm">{m.companyName}</span>
              {!m.isActive && (
                <span className="text-xs text-red-500 font-medium">(Revoked)</span>
              )}
            </div>
          </TableCell>
          <TableCell>
            <span className="text-xs text-muted-foreground">
              Joined {fmtDate(m.joinedAt)}
            </span>
          </TableCell>
          <TableCell className="hidden md:table-cell" />
          <TableCell>
            <RoleBadge role={m.role} />
          </TableCell>
          <TableCell>
            {m.isActive && (
              <div className="flex items-center gap-1.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); onEditRole(m, user); }}
                      >
                        <Pencil size={13} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit role in {m.companyName}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); onRevoke(m, user); }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Revoke access to {m.companyName}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MultiCompanyRolesPage() {

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [editTarget, setEditTarget] = useState<{ membership: Membership; user: UserRow } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ membership: Membership; user: UserRow } | null>(null);

  const { data: rawUsers = [], isLoading, refetch } = trpc.companies.getAllUsersAcrossCompanies.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Derive unique companies for filter
  const allCompanies = useMemo(() => {
    const seen = new Map<number, string>();
    for (const u of rawUsers) {
      for (const m of u.memberships) {
        if (!seen.has(m.companyId)) seen.set(m.companyId, m.companyName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawUsers]);

  // Filter users
  const filteredUsers = useMemo(() => {
    return rawUsers
      .map(u => ({
        ...u,
        memberships: u.memberships.filter(m => {
          if (filterCompany !== "all" && m.companyId !== Number(filterCompany)) return false;
          if (filterRole !== "all" && m.role !== filterRole) return false;
          return true;
        }),
      }))
      .filter(u => {
        if (u.memberships.length === 0) return false;
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.memberships.some(m => m.companyName.toLowerCase().includes(q))
        );
      });
  }, [rawUsers, search, filterRole, filterCompany]);

  // Summary stats
  const totalUsers = rawUsers.length;
  const totalMemberships = rawUsers.reduce((s, u) => s + u.memberships.filter(m => m.isActive).length, 0);
  const multiCompanyUsers = rawUsers.filter(u => u.memberships.filter(m => m.isActive).length > 1).length;
  const adminCount = rawUsers.filter(u => u.memberships.some(m => m.role === "company_admin" && m.isActive)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck size={24} className="text-primary" />
            Multi-Company Roles
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and manage all users' access across every company you administer.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 self-start">
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: totalUsers, icon: <Users size={18} className="text-blue-500" /> },
          { label: "Total Memberships", value: totalMemberships, icon: <Building2 size={18} className="text-green-500" /> },
          { label: "Multi-Company Users", value: multiCompanyUsers, icon: <Globe size={18} className="text-purple-500" /> },
          { label: "Admins", value: adminCount, icon: <ShieldCheck size={18} className="text-red-500" /> },
        ].map(stat => (
          <Card key={stat.label} className="border shadow-sm">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
                {stat.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or company..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-full sm:w-48 h-9">
                <SelectValue placeholder="All Companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {allCompanies.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full sm:w-48 h-9">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Users &amp; Access ({filteredUsers.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Click a row to expand and see per-company roles. Use the edit and revoke buttons to manage access.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <RefreshCw size={18} className="animate-spin" />
              Loading access data...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Users size={32} className="opacity-30" />
              <p className="text-sm">No users found matching your filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-8" />
                  <TableHead>User</TableHead>
                  <TableHead>Companies</TableHead>
                  <TableHead className="hidden md:table-cell">Company Names</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(user => (
                  <UserAccessRow
                    key={user.userId}
                    user={user}
                    onEditRole={(m, u) => setEditTarget({ membership: m, user: u })}
                    onRevoke={(m, u) => setRevokeTarget({ membership: m, user: u })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Role Dialog */}
      <EditRoleDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        membership={editTarget?.membership ?? null}
        userName={editTarget?.user.name ?? null}
        onSaved={() => refetch()}
      />

      {/* Revoke Dialog */}
      <RevokeDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        membership={revokeTarget?.membership ?? null}
        userName={revokeTarget?.user.name ?? null}
        onRevoked={() => refetch()}
      />
    </div>
  );
}

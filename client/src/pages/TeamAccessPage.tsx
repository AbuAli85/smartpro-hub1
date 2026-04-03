import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Mail,
  Plus,
  Shield,
  Banknote,
  Eye,
  Building2,
  Info,
} from "lucide-react";

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
    icon: <Crown size={16} className="text-orange-500" />,
    access: ["All modules", "Team management", "Payroll & Finance", "Company settings", "HR & Employees"],
  },
  hr_admin: {
    label: "HR Manager",
    description: "Full access to all HR modules — employees, payroll, leave, attendance, letters, tasks",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    icon: <UserCheck size={16} className="text-blue-500" />,
    access: ["Employees & Team", "Payroll Engine", "Leave Management", "Attendance", "HR Letters", "Tasks & Announcements"],
  },
  finance_admin: {
    label: "Finance Manager",
    description: "Access to payroll, billing, financial reports and subscriptions",
    color: "text-green-600",
    bgColor: "bg-green-50 border-green-200",
    icon: <Banknote size={16} className="text-green-500" />,
    access: ["Payroll Engine", "Run Payroll", "Financial Reports", "Subscriptions & Billing"],
  },
  company_member: {
    label: "Staff / Field Employee",
    description: "Access to My Portal only — their own attendance, tasks, leave, announcements, documents",
    color: "text-gray-600",
    bgColor: "bg-gray-50 border-gray-200",
    icon: <Users size={16} className="text-gray-500" />,
    access: ["My Portal (personal dashboard)", "My Attendance", "My Tasks", "My Leave", "My Documents"],
  },
  reviewer: {
    label: "Reviewer",
    description: "Read-only access to most company data for review and approval workflows",
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
    icon: <Eye size={16} className="text-purple-500" />,
    access: ["View all modules (read-only)", "Approve/review workflows"],
  },
  external_auditor: {
    label: "External Auditor",
    description: "Limited read-only access — cannot see payroll, HR management, or admin pages",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    icon: <Shield size={16} className="text-yellow-500" />,
    access: ["View company data (limited)", "No payroll access", "No HR management"],
  },
};

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role];
  if (!config) return <Badge variant="outline">{role}</Badge>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${config.bgColor} ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

export default function TeamAccessPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: members = [], isLoading } = trpc.companies.members.useQuery();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("company_member");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string } | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ id: number; name: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState("");

  const addMember = trpc.companies.addMemberByEmail.useMutation({
    onSuccess: (res) => {
      utils.companies.members.invalidate();
      toast.success(res.action === "reactivated" ? "Member reactivated successfully" : "Member added successfully");
      setInviteEmail("");
      setInviteOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.companies.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.companies.members.invalidate();
      toast.success("Role updated successfully");
      setRoleChangeTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = trpc.companies.removeMember.useMutation({
    onSuccess: () => {
      utils.companies.members.invalidate();
      toast.success("Member removed");
      setRemoveTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const reactivateMember = trpc.companies.reactivateMember.useMutation({
    onSuccess: () => {
      utils.companies.members.invalidate();
      toast.success("Member reactivated");
    },
    onError: (err) => toast.error(err.message),
  });

  const activeMembers = members.filter((m) => m.isActive);
  const inactiveMembers = members.filter((m) => !m.isActive);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Access & Roles</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage who has access to your company and what they can see and do.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus size={16} /> Add Team Member
        </Button>
      </div>

      {/* Role Guide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Info size={15} className="text-blue-500" /> Role Guide — What Each Role Can Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(ROLE_CONFIG).map(([key, config]) => (
              <div key={key} className={`rounded-lg border p-3 ${config.bgColor}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {config.icon}
                  <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                <div className="space-y-0.5">
                  {config.access.map((item) => (
                    <div key={item} className="text-xs text-gray-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base">
              <Users size={18} className="text-gray-500" />
              Active Team Members
            </span>
            <Badge variant="secondary">{activeMembers.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading members...</div>
          ) : activeMembers.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">
              No team members yet. Click "Add Team Member" to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activeMembers.map((member) => {
                const isCurrentUser = member.userId === user?.id;
                const isOwner = member.role === "company_admin";
                return (
                  <div key={member.memberId} className="flex items-center gap-4 py-3">
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-semibold">
                        {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{member.name}</span>
                        {isCurrentUser && (
                          <span className="text-xs text-gray-400 font-normal">(you)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Mail size={11} className="text-gray-400" />
                        <span className="text-xs text-gray-500 truncate">{member.email}</span>
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
                          onClick={() => {
                            setRoleChangeTarget({ id: member.memberId, name: member.name ?? "", currentRole: member.role });
                            setNewRole(member.role);
                          }}
                        >
                          Change Role
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          onClick={() => setRemoveTarget({ id: member.memberId, name: member.name ?? "" })}
                        >
                          <UserX size={14} />
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

      {/* Inactive Members */}
      {inactiveMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2 text-gray-500">
                <UserX size={18} />
                Deactivated Members
              </span>
              <Badge variant="outline">{inactiveMembers.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {inactiveMembers.map((member) => (
                <div key={member.memberId} className="flex items-center gap-4 py-3 opacity-60">
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarFallback className="bg-gray-100 text-gray-400 text-sm">
                      {member.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-600 truncate">{member.name}</div>
                    <div className="text-xs text-gray-400 truncate">{member.email}</div>
                  </div>
                  <RoleBadge role={member.role} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reactivateMember.mutate({ memberId: member.memberId })}
                    disabled={reactivateMember.isPending}
                  >
                    Reactivate
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-orange-500" />
              Add Team Member
            </DialogTitle>
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
              <p className="text-xs text-gray-400 mt-1">The person must already have a SmartPRO account.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {config.icon}
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {inviteRole && ROLE_CONFIG[inviteRole] && (
                <p className="text-xs text-gray-500 mt-1.5">{ROLE_CONFIG[inviteRole].description}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMember.mutate({ email: inviteEmail, role: inviteRole as any })}
              disabled={!inviteEmail || addMember.isPending}
            >
              {addMember.isPending ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!roleChangeTarget} onOpenChange={(o) => !o && setRoleChangeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role — {roleChangeTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-500">
              Current role: <RoleBadge role={roleChangeTarget?.currentRole ?? ""} />
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">New Role</label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {config.icon}
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {newRole && ROLE_CONFIG[newRole] && (
                <p className="text-xs text-gray-500 mt-1.5">{ROLE_CONFIG[newRole].description}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button
              onClick={() => roleChangeTarget && updateRole.mutate({ memberId: roleChangeTarget.id, role: newRole as any })}
              disabled={!newRole || newRole === roleChangeTarget?.currentRole || updateRole.isPending}
            >
              {updateRole.isPending ? "Saving..." : "Save Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove their access to your company. You can reactivate them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => removeTarget && removeMember.mutate({ memberId: removeTarget.id })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

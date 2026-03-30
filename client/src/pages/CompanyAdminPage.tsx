import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2, Users, Shield, Settings, Save, UserPlus, UserMinus,
  RefreshCw, Crown, Eye, Loader2, CheckCircle2, AlertCircle,
  Mail, Globe, Phone, MapPin, Hash, FileText, Edit3, UserCheck,
  ChevronRight, BarChart3, Search, X as XIcon
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRole = "company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "client" | "external_auditor";

const ROLE_CONFIG: Record<MemberRole, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  company_admin: {
    label: "Admin",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: <Crown className="w-3 h-3" />,
    description: "Full access to all company settings and data",
  },
  company_member: {
    label: "Member",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <Users className="w-3 h-3" />,
    description: "Standard access to company features",
  },
  reviewer: {
    label: "Reviewer",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Eye className="w-3 h-3" />,
    description: "Read-only access for review purposes",
  },
  client: {
    label: "Client",
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: <Shield className="w-3 h-3" />,
    description: "Limited access to client-facing features",
  },
  finance_admin: {
    label: "Finance Admin",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: <Shield className="w-3 h-3" />,
    description: "Full access to payroll, billing, and financial reports",
  },
  hr_admin: {
    label: "HR Admin",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    icon: <Users className="w-3 h-3" />,
    description: "Full access to HR, recruitment, and attendance",
  },
  external_auditor: {
    label: "External Auditor",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Eye className="w-3 h-3" />,
    description: "Read-only access to contracts, PRO, HR, and workforce data. Cannot edit, approve, or manage.",
  },
};

const INDUSTRIES = [
  "Construction", "Real Estate", "Retail", "Hospitality", "Healthcare",
  "Education", "Technology", "Finance", "Manufacturing", "Logistics",
  "Oil & Gas", "Government", "NGO", "Other",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: MemberRole }) {
  const cfg = ROLE_CONFIG[role];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CompanyAdminPage() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: myCompanyData, isLoading: companyLoading } = trpc.companies.myCompany.useQuery();
  const { data: members, isLoading: membersLoading } = trpc.companies.members.useQuery();
  const { data: stats } = trpc.companies.myStats.useQuery();

  const company = myCompanyData?.company;
  const myMembership = myCompanyData?.member;

  // ── Profile edit state ──────────────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({
    name: "", nameAr: "", industry: "", city: "", address: "",
    phone: "", email: "", website: "", registrationNumber: "", taxNumber: "",
  });
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (company) {
      setProfileForm({
        name: company.name ?? "",
        nameAr: company.nameAr ?? "",
        industry: company.industry ?? "",
        city: company.city ?? "",
        address: company.address ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        website: company.website ?? "",
        registrationNumber: company.registrationNumber ?? "",
        taxNumber: company.taxNumber ?? "",
      });
    }
  }, [company]);

  const updateCompany = trpc.companies.update.useMutation({
    onSuccess: () => {
      toast.success("Company profile updated successfully");
      setProfileDirty(false);
      utils.companies.myCompany.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to update company"),
  });

  const handleProfileChange = (field: string, value: string) => {
    setProfileForm((f) => ({ ...f, [field]: value }));
    setProfileDirty(true);
  };

  const handleProfileSave = () => {
    if (!company) return;
    updateCompany.mutate({ id: company.id, ...profileForm });
  };

  // ── Member management state ─────────────────────────────────────────────────
  const [addMemberDialog, setAddMemberDialog] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<MemberRole>("company_member");
  // Invite pipeline state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"company_admin" | "company_member" | "finance_admin" | "hr_admin" | "reviewer" | "external_auditor">("company_member");
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; expiresAt: Date } | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const [roleDialog, setRoleDialog] = useState<{ memberId: number; currentRole: MemberRole; name: string } | null>(null);
  const [newRole, setNewRole] = useState<MemberRole>("company_member");

  const [removeDialog, setRemoveDialog] = useState<{ memberId: number; name: string } | null>(null);

  // ── Search state ────────────────────────────────────────────────────────────
  const [memberSearch, setMemberSearch] = useState("");

  const addMember = trpc.companies.addMemberByEmail.useMutation({
    onSuccess: (data) => {
      toast.success(data.action === "reactivated" ? "Member reactivated successfully" : "Member added successfully");
      setAddMemberDialog(false);
      setAddEmail("");
      setAddRole("company_member");
      utils.companies.members.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to add member"),
  });

  const updateRole = trpc.companies.updateMemberRole.useMutation({
    onSuccess: () => {
      toast.success("Member role updated");
      setRoleDialog(null);
      utils.companies.members.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to update role"),
  });

  const removeMember = trpc.companies.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from company");
      setRemoveDialog(null);
      utils.companies.members.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to remove member"),
  });

  const reactivateMember = trpc.companies.reactivateMember.useMutation({
    onSuccess: () => {
      toast.success("Member reactivated");
      utils.companies.members.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to reactivate member"),
  });

  const isAdmin = user?.role === "admin" || myMembership?.role === "company_admin";
  // Invite pipeline queries and mutations (must be after isAdmin)
  const { data: pendingInvites, refetch: refetchInvites } = trpc.companies.listInvites.useQuery(undefined, { enabled: isAdmin });
  const createInvite = trpc.companies.createInvite.useMutation({
    onSuccess: (data) => {
      setInviteResult({ inviteUrl: data.inviteUrl, expiresAt: new Date(data.expiresAt) });
      refetchInvites();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to create invite"),
  });
  const revokeInvite = trpc.companies.revokeInvite.useMutation({
    onSuccess: () => { toast.success("Invite revoked"); refetchInvites(); },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to revoke invite"),
  });
  const allActiveMembers = (members ?? []).filter((m) => m.isActive);
  const allInactiveMembers = (members ?? []).filter((m) => !m.isActive);

  const searchLower = memberSearch.toLowerCase().trim();
  const activeMembers = searchLower
    ? allActiveMembers.filter(
        (m) =>
          (m.name ?? "").toLowerCase().includes(searchLower) ||
          (m.email ?? "").toLowerCase().includes(searchLower)
      )
    : allActiveMembers;
  const inactiveMembers = searchLower
    ? allInactiveMembers.filter(
        (m) =>
          (m.name ?? "").toLowerCase().includes(searchLower) ||
          (m.email ?? "").toLowerCase().includes(searchLower)
      )
    : allInactiveMembers;

  // ── Loading state ───────────────────────────────────────────────────────────
  if (companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading company data…</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center shadow-sm">
          <CardContent className="pt-10 pb-8 space-y-4">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">No Company Found</h2>
            <p className="text-sm text-muted-foreground">
              You are not associated with any company yet. Please complete onboarding first.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Page Header ── */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{company.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs capitalize">{company.status}</Badge>
                  {company.industry && (
                    <span className="text-xs text-muted-foreground">{company.industry}</span>
                  )}
                  {myMembership && (
                    <RoleBadge role={myMembership.role as MemberRole} />
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {profileDirty && (
                <Button onClick={handleProfileSave} disabled={updateCompany.isPending} className="gap-2">
                  {updateCompany.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-5 h-5" />} label="Active Members" value={activeMembers.length} />
          <StatCard icon={<FileText className="w-5 h-5" />} label="Contracts" value={stats?.contracts ?? 0} />
          <StatCard icon={<Shield className="w-5 h-5" />} label="PRO Services" value={stats?.proServices ?? 0} />
          <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Employees" value={stats?.employees ?? 0} />
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="profile">
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="profile" className="gap-2">
              <Settings className="w-4 h-4" />
              Company Profile
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="w-4 h-4" />
              Members
              <span className="ml-1 bg-primary/10 text-primary text-xs rounded-full px-1.5 py-0.5 font-medium">
                {activeMembers.length}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Info */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Basic Information
                  </CardTitle>
                  <CardDescription>Company name and identity details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name (English) *</Label>
                    <Input
                      id="name"
                      value={profileForm.name}
                      onChange={(e) => handleProfileChange("name", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="e.g. SmartPRO Business Services LLC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameAr">Company Name (Arabic)</Label>
                    <Input
                      id="nameAr"
                      value={profileForm.nameAr}
                      onChange={(e) => handleProfileChange("nameAr", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="اسم الشركة بالعربية"
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select
                      value={profileForm.industry}
                      onValueChange={(v) => handleProfileChange("industry", v)}
                      disabled={!isAdmin}
                    >
                      <SelectTrigger id="industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((ind) => (
                          <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Registration */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hash className="w-4 h-4 text-primary" />
                    Registration Details
                  </CardTitle>
                  <CardDescription>Official registration and tax numbers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="registrationNumber">Commercial Registration No.</Label>
                    <Input
                      id="registrationNumber"
                      value={profileForm.registrationNumber}
                      onChange={(e) => handleProfileChange("registrationNumber", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="e.g. 1234567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxNumber">Tax Registration No. (VAT)</Label>
                    <Input
                      id="taxNumber"
                      value={profileForm.taxNumber}
                      onChange={(e) => handleProfileChange("taxNumber", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="e.g. OM1234567890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Status</Label>
                    <div className="flex items-center gap-2 h-9">
                      <Badge
                        className={
                          company.status === "active"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : company.status === "suspended"
                            ? "bg-red-100 text-red-700 border-red-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        }
                        variant="outline"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {company.status.charAt(0).toUpperCase() + company.status.slice(1)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Since {new Date(company.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      value={profileForm.phone}
                      onChange={(e) => handleProfileChange("phone", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="+968 XXXX XXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      <Mail className="w-3.5 h-3.5 inline mr-1" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => handleProfileChange("email", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="info@company.om"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">
                      <Globe className="w-3.5 h-3.5 inline mr-1" />
                      Website
                    </Label>
                    <Input
                      id="website"
                      value={profileForm.website}
                      onChange={(e) => handleProfileChange("website", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="https://www.company.om"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Address */}
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City / Governorate</Label>
                    <Input
                      id="city"
                      value={profileForm.city}
                      onChange={(e) => handleProfileChange("city", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="e.g. Muscat"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Full Address</Label>
                    <Input
                      id="address"
                      value={profileForm.address}
                      onChange={(e) => handleProfileChange("address", e.target.value)}
                      disabled={!isAdmin}
                      placeholder="Building, Street, Area, Postal Code"
                    />
                  </div>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Only company admins can edit this information.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {isAdmin && profileDirty && (
              <div className="flex justify-end">
                <Button onClick={handleProfileSave} disabled={updateCompany.isPending} size="lg" className="gap-2">
                  {updateCompany.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
                  Save All Changes
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── Members Tab ── */}
          <TabsContent value="members" className="mt-6 space-y-6">
            {/* Role legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(Object.entries(ROLE_CONFIG) as [MemberRole, typeof ROLE_CONFIG[MemberRole]][]).map(([role, cfg]) => (
                <div key={role} className="flex items-start gap-2 p-3 rounded-lg border bg-card">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                  <p className="text-xs text-muted-foreground leading-snug">{cfg.description}</p>
                </div>
              ))}
            </div>

            {/* Active Members */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-primary" />
                    Active Members
                    <Badge variant="secondary" className="ml-1">{activeMembers.length}</Badge>
                  </CardTitle>
                  <CardDescription>Users with active access to this company</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="h-8 pl-8 pr-7 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 w-52"
                    />
                    {memberSearch && (
                      <button
                        onClick={() => setMemberSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {isAdmin && (
                    <Button onClick={() => setAddMemberDialog(true)} className="gap-2" size="sm">
                      <UserPlus className="w-4 h-4" />
                      Add Member
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {membersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activeMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">
                      {searchLower ? `No members match "${memberSearch}"` : "No active members yet"}
                    </p>
                    {searchLower && (
                      <button
                        onClick={() => setMemberSearch("")}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="hidden md:table-cell">Login Method</TableHead>
                        <TableHead className="hidden md:table-cell">Last Active</TableHead>
                        <TableHead className="hidden md:table-cell">Joined</TableHead>
                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMembers.map((m) => {
                        const isMe = m.userId === user?.id;
                        const initials = (m.name ?? m.email ?? "?")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);
                        return (
                          <TableRow key={m.memberId} className={isMe ? "bg-primary/5" : ""}>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={m.avatarUrl ?? undefined} />
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium leading-none">
                                    {m.name ?? "—"}
                                    {isMe && <span className="ml-1.5 text-xs text-primary font-normal">(you)</span>}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{m.email ?? "—"}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <RoleBadge role={m.role as MemberRole} />
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-xs capitalize text-muted-foreground">{m.loginMethod ?? "—"}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {m.lastSignedIn
                                  ? new Date(m.lastSignedIn).toLocaleDateString()
                                  : "Never"}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-xs text-muted-foreground">
                                {new Date(m.joinedAt).toLocaleDateString()}
                              </span>
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 gap-1 text-xs"
                                    onClick={() => {
                                      setRoleDialog({ memberId: m.memberId, currentRole: m.role as MemberRole, name: m.name ?? m.email ?? "Member" });
                                      setNewRole(m.role as MemberRole);
                                    }}
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Role
                                  </Button>
                                  {!isMe && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 gap-1 text-xs text-destructive hover:text-destructive"
                                      onClick={() => setRemoveDialog({ memberId: m.memberId, name: m.name ?? m.email ?? "Member" })}
                                    >
                                      <UserMinus className="w-3 h-3" />
                                      Remove
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Inactive Members */}
            {inactiveMembers.length > 0 && (
              <Card className="shadow-sm opacity-80">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                    <UserMinus className="w-4 h-4" />
                    Removed Members
                    <Badge variant="outline" className="ml-1">{inactiveMembers.length}</Badge>
                  </CardTitle>
                  <CardDescription>These users have been removed but can be reactivated</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Member</TableHead>
                        <TableHead>Last Role</TableHead>
                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inactiveMembers.map((m) => {
                        const initials = (m.name ?? m.email ?? "?")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);
                        return (
                          <TableRow key={m.memberId} className="opacity-60">
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-3">
                                <Avatar className="w-8 h-8">
                                  <AvatarFallback className="text-xs bg-muted text-muted-foreground font-semibold">
                                    {initials}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{m.name ?? "—"}</p>
                                  <p className="text-xs text-muted-foreground">{m.email ?? "—"}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <RoleBadge role={m.role as MemberRole} />
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 gap-1 text-xs"
                                  onClick={() => reactivateMember.mutate({ memberId: m.memberId })}
                                  disabled={reactivateMember.isPending}
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Reactivate
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          {/* ── Pending Invites ── */}
          {isAdmin && pendingInvites && pendingInvites.length > 0 && (
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    Pending Invites
                    <Badge variant="secondary" className="text-xs">{pendingInvites.length}</Badge>
                  </CardTitle>
                  <Button size="sm" variant="outline" className="gap-2 h-8" onClick={() => { setInviteResult(null); setShowInviteDialog(true); }}>
                    <UserPlus className="w-3.5 h-3.5" />
                    Invite by Link
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Email</TableHead>
                      <TableHead scope="col">Role</TableHead>
                      <TableHead scope="col">Expires</TableHead>
                      <TableHead scope="col" className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvites.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-sm">{inv.email}</TableCell>
                        <TableCell><RoleBadge role={inv.role as MemberRole} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => revokeInvite.mutate({ id: inv.id })}
                            disabled={revokeInvite.isPending}
                            aria-label={`Revoke invite for ${inv.email}`}
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {isAdmin && (!pendingInvites || pendingInvites.length === 0) && (
            <div className="mt-4 flex justify-end">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => { setInviteResult(null); setShowInviteDialog(true); }}>
                <Mail className="w-3.5 h-3.5" />
                Invite by Magic Link
              </Button>
            </div>
          )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Add Member Dialog ── */}
      <Dialog open={addMemberDialog} onOpenChange={setAddMemberDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Add Member
            </DialogTitle>
            <DialogDescription>
              Add an existing platform user to your company by their email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="addEmail">Email Address</Label>
              <Input
                id="addEmail"
                type="email"
                placeholder="user@example.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addEmail && !addMember.isPending)
                    addMember.mutate({ email: addEmail, role: addRole as Parameters<typeof addMember.mutate>[0]['role'] });
                }}
              />
              <p className="text-xs text-muted-foreground">
                The user must already have a SmartPRO account.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.entries(ROLE_CONFIG) as [MemberRole, typeof ROLE_CONFIG[MemberRole]][]).map(([role, cfg]) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setAddRole(role)}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      addRole === role ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{cfg.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addMember.mutate({ email: addEmail, role: addRole as Parameters<typeof addMember.mutate>[0]['role'] })}
              disabled={!addEmail.trim() || addMember.isPending}
              className="gap-2"
            >
              {addMember.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Role Dialog ── */}
      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Edit3 className="w-5 h-5 text-primary" />
              Change Role
            </DialogTitle>
            <DialogDescription>
              Update the role for <strong>{roleDialog?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.entries(ROLE_CONFIG) as [MemberRole, typeof ROLE_CONFIG[MemberRole]][]).map(([role, cfg]) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setNewRole(role)}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    newRole === role ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    {roleDialog?.currentRole === role && (
                      <span className="text-xs text-muted-foreground">(current)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{cfg.description}</p>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
            <Button
              onClick={() => roleDialog && updateRole.mutate({ memberId: roleDialog.memberId, role: newRole as Parameters<typeof updateRole.mutate>[0]['role'] })}
              disabled={!roleDialog || newRole === roleDialog?.currentRole || updateRole.isPending}
              className="gap-2"
            >
              {updateRole.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite by Magic Link Dialog ── */}
      <Dialog open={showInviteDialog} onOpenChange={(o) => { if (!o) { setShowInviteDialog(false); setInviteResult(null); setInviteEmail(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Invite by Magic Link
            </DialogTitle>
            <DialogDescription>
              Send a one-time invite link to someone who doesn’t have a SmartPRO account yet. The link expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          {!inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email Address</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_admin">Company Admin</SelectItem>
                    <SelectItem value="company_member">Company Member</SelectItem>
                    <SelectItem value="finance_admin">Finance Admin</SelectItem>
                    <SelectItem value="hr_admin">HR Admin</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="external_auditor">External Auditor (Read-Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => createInvite.mutate({ email: inviteEmail, role: inviteRole as Parameters<typeof createInvite.mutate>[0]['role'], origin: window.location.origin })}
                  disabled={!inviteEmail.trim() || createInvite.isPending}
                  className="gap-2"
                >
                  {createInvite.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Generate Invite Link
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Invite Link (valid until {inviteResult.expiresAt.toLocaleDateString()})</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 truncate bg-background rounded px-2 py-1.5 border">{inviteResult.inviteUrl}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-8 px-2"
                    onClick={() => { navigator.clipboard.writeText(inviteResult.inviteUrl); toast.success("Link copied!"); }}
                    aria-label="Copy invite link"
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with <strong>{inviteEmail}</strong>. When they click it and sign up or log in, they will automatically join your company as <strong>{inviteRole.replace("_", " ")}</strong>.
              </p>
              <DialogFooter>
                <Button onClick={() => { setShowInviteDialog(false); setInviteResult(null); setInviteEmail(""); }}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Remove Confirmation ── */}
      <AlertDialog open={!!removeDialog} onOpenChange={(o) => !o && setRemoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeDialog?.name}</strong> from this company?
              They will lose access immediately. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeDialog && removeMember.mutate({ memberId: removeDialog.memberId })}
            >
              {removeMember.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, UserPlus, Building2, TrendingUp, Wallet, Star,
  Search, ChevronRight, Phone, Mail, Shield, Briefcase,
  CheckCircle2, AlertCircle, Clock, XCircle, Edit2, Trash2,
  Award, BarChart3, RefreshCw, FileText
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Officer = {
  id: number;
  fullName: string;
  fullNameAr?: string | null;
  civilId?: string | null;
  pasiNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  sanadOfficeId?: number | null;
  sanadOfficeName?: string | null;
  employmentTrack: "platform" | "sanad";
  monthlySalary: number;
  maxCompanies: number;
  status: "active" | "inactive" | "on_leave" | "terminated";
  qualifications?: string | null;
  notes?: string | null;
  hiredAt: string | Date;
  activeAssignments: number;
  availableSlots: number;
  capacityPct: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  active:     { label: "Active",    icon: CheckCircle2, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  inactive:   { label: "Inactive",  icon: AlertCircle,  color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  on_leave:   { label: "On Leave",  icon: Clock,        color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  terminated: { label: "Terminated",icon: XCircle,      color: "bg-red-500/15 text-red-400 border-red-500/30" },
} as const;

const TRACK_CONFIG = {
  platform: { label: "Track A — Platform", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  sanad:    { label: "Track B — Sanad",    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
} as const;

function CapacityBar({ pct, active, max }: { pct: number; active: number; max: number }) {
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{active}/{max} companies</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Officer Card ─────────────────────────────────────────────────────────────
function OfficerCard({ officer, onEdit, onView, isAdmin }: {
  officer: Officer;
  onEdit: (o: Officer) => void;
  onView: (o: Officer) => void;
  isAdmin: boolean;
}) {
  const sc = STATUS_CONFIG[officer.status];
  const tc = TRACK_CONFIG[officer.employmentTrack];
  const StatusIcon = sc.icon;

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm hover:border-border transition-all group cursor-pointer"
      onClick={() => onView(officer)}>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/20 shrink-0">
              <span className="text-lg font-bold text-red-400">
                {officer.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground leading-tight">{officer.fullName}</h3>
              {officer.fullNameAr && (
                <p className="text-xs text-muted-foreground mt-0.5 text-right" dir="rtl">{officer.fullNameAr}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${sc.color}`}>
              <StatusIcon className="w-2.5 h-2.5 mr-1" />
              {sc.label}
            </Badge>
          </div>
        </div>

        {/* Track + Sanad */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${tc.color}`}>
            {tc.label}
          </Badge>
          {officer.sanadOfficeName && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-muted/50 text-muted-foreground">
              <Building2 className="w-2.5 h-2.5 mr-1" />
              {officer.sanadOfficeName}
            </Badge>
          )}
        </div>

        {/* Capacity */}
        <CapacityBar pct={officer.capacityPct} active={officer.activeAssignments} max={officer.maxCompanies} />

        {/* Details */}
        <div className="mt-3 space-y-1.5">
          {officer.phone && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              <span>{officer.phone}</span>
            </div>
          )}
          {officer.email && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="w-3 h-3" />
              <span className="truncate">{officer.email}</span>
            </div>
          )}
          {officer.pasiNumber && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>PASI: {officer.pasiNumber}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            OMR {Number(officer.monthlySalary).toFixed(3)}/mo
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onEdit(officer); }}>
                <Edit2 className="w-3 h-3" />
              </Button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Create/Edit Dialog ───────────────────────────────────────────────────────
function OfficerFormDialog({
  open, onClose, officer
}: { open: boolean; onClose: () => void; officer?: Officer | null }) {
  
  const utils = trpc.useUtils();
  const isEdit = !!officer;

  const [form, setForm] = useState({
    fullName: officer?.fullName ?? "",
    fullNameAr: officer?.fullNameAr ?? "",
    civilId: officer?.civilId ?? "",
    pasiNumber: officer?.pasiNumber ?? "",
    phone: officer?.phone ?? "",
    email: officer?.email ?? "",
    employmentTrack: (officer?.employmentTrack ?? "platform") as "platform" | "sanad",
    monthlySalary: officer?.monthlySalary ?? 500,
    maxCompanies: officer?.maxCompanies ?? 10,
    status: (officer?.status ?? "active") as "active" | "inactive" | "on_leave" | "terminated",
    qualifications: officer?.qualifications ?? "",
    notes: officer?.notes ?? "",
  });

  const create = trpc.officers.create.useMutation({
    onSuccess: () => { utils.officers.list.invalidate(); utils.officers.stats.invalidate(); toast.success("Officer registered successfully"); onClose(); },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const update = trpc.officers.update.useMutation({
    onSuccess: () => { utils.officers.list.invalidate(); utils.officers.stats.invalidate(); toast.success("Officer updated"); onClose(); },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const handleSubmit = () => {
    const payload = {
      fullName: form.fullName,
      fullNameAr: form.fullNameAr || undefined,
      civilId: form.civilId || undefined,
      pasiNumber: form.pasiNumber || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      employmentTrack: form.employmentTrack,
      monthlySalary: form.monthlySalary,
      maxCompanies: form.maxCompanies,
      qualifications: form.qualifications || undefined,
      notes: form.notes || undefined,
    };
    if (isEdit && officer) {
      update.mutate({ id: officer.id, ...payload, status: form.status });
    } else {
      create.mutate(payload);
    }
  };

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const loading = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Award className="w-5 h-5 text-red-400" />
            {isEdit ? "Edit Officer Profile" : "Register New Omani PRO Officer"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Full Name EN */}
          <div className="space-y-1.5">
            <Label>Full Name (English) <span className="text-red-400">*</span></Label>
            <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="e.g. Ahmed Al-Balushi" />
          </div>
          {/* Full Name AR */}
          <div className="space-y-1.5">
            <Label>Full Name (Arabic)</Label>
            <Input value={form.fullNameAr} onChange={(e) => set("fullNameAr", e.target.value)} placeholder="الاسم بالعربية" dir="rtl" />
          </div>
          {/* Civil ID */}
          <div className="space-y-1.5">
            <Label>Civil ID Number</Label>
            <Input value={form.civilId} onChange={(e) => set("civilId", e.target.value)} placeholder="e.g. 12345678" />
          </div>
          {/* PASI */}
          <div className="space-y-1.5">
            <Label>PASI Number</Label>
            <Input value={form.pasiNumber} onChange={(e) => set("pasiNumber", e.target.value)} placeholder="Social insurance number" />
          </div>
          {/* Phone */}
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+968 9XXX XXXX" />
          </div>
          {/* Email */}
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" placeholder="officer@example.com" />
          </div>
          {/* Employment Track */}
          <div className="space-y-1.5">
            <Label>Employment Track</Label>
            <Select value={form.employmentTrack} onValueChange={(v) => set("employmentTrack", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Track A — Employed by Platform</SelectItem>
                <SelectItem value="sanad">Track B — Employed by Sanad Centre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Monthly Salary */}
          <div className="space-y-1.5">
            <Label>Monthly Salary (OMR)</Label>
            <Input value={form.monthlySalary} onChange={(e) => set("monthlySalary", Number(e.target.value))} type="number" min={0} step={0.001} />
          </div>
          {/* Max Companies */}
          <div className="space-y-1.5">
            <Label>Max Companies (1–10)</Label>
            <Input value={form.maxCompanies} onChange={(e) => set("maxCompanies", Number(e.target.value))} type="number" min={1} max={10} />
          </div>
          {/* Status (edit only) */}
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Qualifications */}
          <div className="col-span-2 space-y-1.5">
            <Label>Qualifications & Skills</Label>
            <Textarea value={form.qualifications} onChange={(e) => set("qualifications", e.target.value)}
              placeholder="e.g. 5 years PRO experience, fluent in Arabic/English, certified MoL agent..." rows={2} />
          </div>
          {/* Notes */}
          <div className="col-span-2 space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Any internal notes about this officer..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.fullName.trim()}
            className="bg-red-600 hover:bg-red-700 text-white">
            {loading ? "Saving…" : isEdit ? "Save Changes" : "Register Officer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Officer Detail Dialog ────────────────────────────────────────────────────
function OfficerDetailDialog({ officerId, onClose, onEdit, isAdmin }: {
  officerId: number | null;
  onClose: () => void;
  onEdit: (o: Officer) => void;
  isAdmin: boolean;
}) {
  const { data: officer, isLoading } = trpc.officers.getById.useQuery(
    { id: officerId! },
    { enabled: officerId !== null }
  );

  if (!officerId) return null;

  const sc = officer ? STATUS_CONFIG[officer.status] : null;
  const tc = officer ? TRACK_CONFIG[officer.employmentTrack] : null;

  return (
    <Dialog open={officerId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading officer profile…</div>
        ) : !officer ? (
          <div className="py-12 text-center text-muted-foreground">Officer not found</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/20">
                    <span className="text-2xl font-bold text-red-400">{officer.fullName.charAt(0)}</span>
                  </div>
                  <div>
                    <DialogTitle className="text-xl">{officer.fullName}</DialogTitle>
                    {officer.fullNameAr && <p className="text-sm text-muted-foreground mt-0.5" dir="rtl">{officer.fullNameAr}</p>}
                  </div>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => onEdit(officer as unknown as Officer)}>
                    <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                  </Button>
                )}
              </div>
            </DialogHeader>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {sc && (
                <Badge variant="outline" className={`${sc.color}`}>
                  <sc.icon className="w-3 h-3 mr-1.5" />{sc.label}
                </Badge>
              )}
              {tc && <Badge variant="outline" className={`${tc.color}`}>{tc.label}</Badge>}
              {officer.sanadOfficeName && (
                <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
                  <Building2 className="w-3 h-3 mr-1.5" />{officer.sanadOfficeName}
                </Badge>
              )}
            </div>

            {/* Capacity */}
            <Card className="border-border/50 bg-muted/20">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Company Capacity</span>
                  <span className="text-sm text-muted-foreground">{officer.activeAssignments}/{officer.maxCompanies} assigned</span>
                </div>
                <CapacityBar pct={officer.capacityPct} active={officer.activeAssignments} max={officer.maxCompanies} />
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="text-emerald-400">{officer.availableSlots} slots available</span>
                  <span>OMR {Number(officer.monthlySalary).toFixed(3)}/month salary</span>
                  <span>OMR {(officer.activeAssignments * 100).toFixed(3)}/month revenue</span>
                </div>
              </CardContent>
            </Card>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {officer.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" /><span>{officer.phone}</span>
                </div>
              )}
              {officer.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" /><span>{officer.email}</span>
                </div>
              )}
              {officer.civilId && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="w-4 h-4" /><span>Civil ID: {officer.civilId}</span>
                </div>
              )}
              {officer.pasiNumber && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="w-4 h-4" /><span>PASI: {officer.pasiNumber}</span>
                </div>
              )}
            </div>

            {officer.qualifications && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Qualifications</p>
                <p className="text-sm text-foreground/80 bg-muted/30 rounded-lg p-3">{officer.qualifications}</p>
              </div>
            )}

            {/* Assignments */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Assigned Companies ({officer.assignments?.length ?? 0})
              </p>
              {!officer.assignments?.length ? (
                <p className="text-sm text-muted-foreground italic">No companies assigned yet</p>
              ) : (
                <div className="space-y-2">
                  {officer.assignments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/40">
                      <div>
                        <p className="text-sm font-medium">{a.companyName}</p>
                        <p className="text-xs text-muted-foreground">{a.companyIndustry} · {a.companyCity}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className={
                          a.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                          "bg-muted/50 text-muted-foreground"
                        }>
                          {a.status}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">OMR {Number(a.monthlyFee).toFixed(3)}/mo</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OmaniOfficersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editOfficer, setEditOfficer] = useState<Officer | null>(null);
  const [viewOfficerId, setViewOfficerId] = useState<number | null>(null);

  const { data: stats, isLoading: statsLoading } = trpc.officers.stats.useQuery();
  const { data: officers = [], isLoading: officersLoading, refetch } = trpc.officers.list.useQuery({
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    track: trackFilter !== "all" ? trackFilter as any : undefined,
    search: search || undefined,
  });

  const filtered = officers.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.fullName.toLowerCase().includes(q) ||
      (o.fullNameAr ?? "").toLowerCase().includes(q) ||
      (o.email ?? "").toLowerCase().includes(q) ||
      (o.civilId ?? "").toLowerCase().includes(q)
    );
  });

  const handleEdit = (o: Officer) => { setEditOfficer(o); setShowForm(true); };
  const handleView = (o: Officer) => setViewOfficerId(o.id);
  const handleFormClose = () => { setShowForm(false); setEditOfficer(null); };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Award className="w-5 h-5 text-red-400" />
              Omani PRO Officers
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shared Omani PRO — National Omanisation Compliance Programme
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowForm(true)}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Register Officer
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Stats Row */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard icon={Users} label="Total Officers" value={stats.totalOfficers}
              sub={`${stats.activeOfficers} active`} />
            <StatCard icon={Building2} label="Companies Served" value={stats.companiesServed}
              sub={`${stats.totalAssignments} active assignments`} />
            <StatCard icon={Wallet} label="Monthly Revenue" value={`OMR ${Number(stats.totalMonthlyRevenue).toFixed(3)}`}
              accent="text-emerald-400" />
            <StatCard icon={TrendingUp} label="Platform Net" value={`OMR ${Number(stats.platformNetMonthly).toFixed(3)}`}
              sub="After payroll" accent="text-blue-400" />
            <StatCard icon={Star} label="Track A Officers" value={stats.trackAOfficers}
              sub="Platform employed" />
            <StatCard icon={Shield} label="Track B Officers" value={stats.trackBOfficers}
              sub="Sanad employed" />
          </div>
        )}

        {/* Omanisation Impact Banner */}
        {stats && stats.omanisEmployed > 0 && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="py-3 px-5">
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-sm font-semibold text-emerald-400">
                    {stats.omanisEmployed} Omani{stats.omanisEmployed !== 1 ? "s" : ""} employed
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    through the SmartPRO Shared Omani PRO programme — supporting Vision 2040 Omanisation targets
                  </span>
                </div>
                <Badge variant="outline" className="ml-auto border-emerald-500/30 text-emerald-400 shrink-0">
                  MoL Compliant
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, Civil ID…" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <Select value={trackFilter} onValueChange={setTrackFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Tracks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tracks</SelectItem>
              <SelectItem value="platform">Track A — Platform</SelectItem>
              <SelectItem value="sanad">Track B — Sanad</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} officer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Officer Grid */}
        {officersLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="border-border/50 animate-pulse">
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <div className="w-11 h-11 rounded-xl bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded" />
                  <div className="space-y-1.5">
                    <div className="h-2 bg-muted rounded w-2/3" />
                    <div className="h-2 bg-muted rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-border/50 border-dashed">
            <CardContent className="py-16 text-center">
              <Award className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-base font-medium text-foreground mb-1">
                {search || statusFilter !== "all" || trackFilter !== "all"
                  ? "No officers match your filters"
                  : "No Omani PRO Officers registered yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search || statusFilter !== "all" || trackFilter !== "all"
                  ? "Try adjusting your search or filter criteria"
                  : "Register your first Omani PRO officer to start the Shared Omani PRO programme"}
              </p>
              {isAdmin && !search && statusFilter === "all" && trackFilter === "all" && (
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowForm(true)}>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Register First Officer
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((o) => (
              <OfficerCard key={o.id} officer={o as Officer} onEdit={handleEdit} onView={handleView} isAdmin={isAdmin} />
            ))}
          </div>
        )}

        {/* Model Explainer */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              Shared Omani PRO — How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 rounded-lg bg-violet-500/5 border border-violet-500/20">
                <p className="font-semibold text-violet-400 mb-1">Track A — Platform Employed</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Platform employs the Omani officer directly. Sanad centre earns 10–15% commission (OMR 100–150/month) for client referrals. Zero employment risk for the Sanad centre.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <p className="font-semibold text-cyan-400 mb-1">Track B — Sanad Employed</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Sanad centre employs the Omani officer and receives OMR 600/month from the platform. Centre pays OMR 500 salary + PASI. Net to centre: OMR 42.50/month.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="font-semibold text-emerald-400 mb-1">Company Subscription</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Each company pays OMR 100/month. One Omani officer handles up to 10 companies simultaneously. Companies get MoL compliance + all government work handled.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      {showForm && (
        <OfficerFormDialog open={showForm} onClose={handleFormClose} officer={editOfficer} />
      )}
      <OfficerDetailDialog
        officerId={viewOfficerId}
        onClose={() => setViewOfficerId(null)}
        onEdit={(o) => { setViewOfficerId(null); handleEdit(o); }}
        isAdmin={isAdmin}
      />
    </div>
  );
}

import { useState, useMemo } from "react";
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
import { toast } from "sonner";
import {
  Building2, UserCheck, UserX, Plus, Search, FileText,
  Download, CheckCircle2, AlertTriangle, Clock, Wallet,
  ArrowRight, RefreshCw, Users, TrendingUp, Shield, Zap
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Officer = {
  id: number;
  fullName: string;
  fullNameAr?: string | null;
  employmentTrack: "platform" | "sanad";
  status: "active" | "inactive" | "on_leave" | "terminated";
  activeAssignments: number;
  availableSlots: number;
  capacityPct: number;
  maxCompanies: number;
  monthlySalary: number;
};

type Assignment = {
  id: number;
  officerId: number;
  companyId: number;
  monthlyFee: number;
  status: "active" | "suspended" | "terminated";
  assignedAt: string | Date;
  terminatedAt?: string | Date | null;
  notes?: string | null;
  companyName: string;
  companyNameAr?: string | null;
  companyIndustry?: string | null;
  companyCity?: string | null;
};

// ─── Capacity Ring ────────────────────────────────────────────────────────────
function CapacityRing({ pct, active, max, size = 64 }: { pct: number; active: number; max: number; size?: number }) {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#10b981";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={5}
          className="text-muted/40" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold text-foreground leading-none">{active}</span>
        <span className="text-[9px] text-muted-foreground leading-none">/{max}</span>
      </div>
    </div>
  );
}

// ─── Officer Selector Card ────────────────────────────────────────────────────
function OfficerSelectorCard({ officer, selected, onClick }: {
  officer: Officer; selected: boolean; onClick: () => void;
}) {
  const trackColor = officer.employmentTrack === "platform"
    ? "border-violet-500/30 bg-violet-500/5"
    : "border-cyan-500/30 bg-cyan-500/5";
  const trackLabel = officer.employmentTrack === "platform" ? "Track A" : "Track B";

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        selected
          ? "border-red-500/50 bg-red-500/10 ring-1 ring-red-500/30"
          : "border-border/50 bg-card/60 hover:border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <CapacityRing pct={officer.capacityPct} active={officer.activeAssignments} max={officer.maxCompanies} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{officer.fullName}</p>
          {officer.fullNameAr && (
            <p className="text-xs text-muted-foreground truncate" dir="rtl">{officer.fullNameAr}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${trackColor}`}>{trackLabel}</Badge>
            {officer.availableSlots > 0 ? (
              <span className="text-[10px] text-emerald-400">{officer.availableSlots} slots free</span>
            ) : (
              <span className="text-[10px] text-red-400">Full capacity</span>
            )}
          </div>
        </div>
        {selected && <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0" />}
      </div>
    </div>
  );
}

// ─── Assign Company Dialog ────────────────────────────────────────────────────
function AssignCompanyDialog({ open, onClose, officer }: {
  open: boolean; onClose: () => void; officer: Officer | null;
}) {
  
  const utils = trpc.useUtils();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [monthlyFee, setMonthlyFee] = useState(100);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const { data: available = [] } = trpc.officers.availableCompanies.useQuery(
    { officerId: officer?.id ?? 0 },
    { enabled: !!officer }
  );

  const assign = trpc.officers.assignCompany.useMutation({
    onSuccess: () => {
      utils.officers.list.invalidate();
      utils.officers.getById.invalidate();
      utils.officers.stats.invalidate();
      toast.success("Company assigned successfully");
      onClose();
    },
    onError: (e) => toast.error(`Assignment failed: ${e.message}`),
  });

  const filtered = available.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.nameAr ?? "").toLowerCase().includes(q);
  });

  const handleAssign = () => {
    if (!officer || !selectedCompanyId) return;
    assign.mutate({ officerId: officer.id, companyId: Number(selectedCompanyId), monthlyFee, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            Assign Company to {officer?.fullName}
          </DialogTitle>
        </DialogHeader>

        {officer && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
            <CapacityRing pct={officer.capacityPct} active={officer.activeAssignments} max={officer.maxCompanies} size={48} />
            <div>
              <p className="text-sm font-medium">{officer.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {officer.availableSlots} slot{officer.availableSlots !== 1 ? "s" : ""} remaining · {officer.activeAssignments}/{officer.maxCompanies} assigned
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Company</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…" className="pl-9 mb-2" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-border/50 rounded-lg p-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {search ? "No companies match your search" : "All companies are already assigned"}
                </p>
              ) : (
                filtered.map((c) => (
                  <div key={c.id}
                    onClick={() => setSelectedCompanyId(String(c.id))}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      selectedCompanyId === String(c.id)
                        ? "bg-red-500/10 border border-red-500/30"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.industry} · {c.city}</p>
                    </div>
                    {selectedCompanyId === String(c.id) && (
                      <CheckCircle2 className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Monthly Fee (OMR)</Label>
              <Input value={monthlyFee} onChange={(e) => setMonthlyFee(Number(e.target.value))}
                type="number" min={0} step={0.001} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes…" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={assign.isPending}>Cancel</Button>
          <Button onClick={handleAssign}
            disabled={assign.isPending || !selectedCompanyId || !officer || officer.availableSlots <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {assign.isPending ? "Assigning…" : "Assign Company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Certificate Dialog ───────────────────────────────────────────────────────
function CertificateDialog({ open, onClose, companyId, companyName }: {
  open: boolean; onClose: () => void; companyId: number; companyName: string;
}) {
  
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [cert, setCert] = useState<any>(null);

  const generate = trpc.officers.generateCertificate.useMutation({
    onSuccess: (data) => { setCert(data); toast.success("Certificate generated"); },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Compliance Certificate — {companyName}
          </DialogTitle>
        </DialogHeader>

        {!cert ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a Ministry of Labour compliance certificate confirming that this company has an active Omani PRO officer assigned through the SmartPRO Shared Omani PRO programme.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => generate.mutate({ companyId, month, year })}
                disabled={generate.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                {generate.isPending ? "Generating…" : "Generate Certificate"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Certificate Preview */}
            <div className="border border-border rounded-xl p-5 bg-card/60 space-y-4">
              <div className="text-center border-b border-border/50 pb-4">
                <div className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">SmartPRO Hub</div>
                <h3 className="text-base font-bold text-foreground">Omanisation Compliance Certificate</h3>
                <p className="text-xs text-muted-foreground mt-1">Shared Omani PRO Programme</p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Certificate No.</p>
                  <p className="font-mono font-medium text-foreground">{cert.certificateNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Period</p>
                  <p className="font-medium text-foreground">{cert.month} {cert.year}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Company (EN)</p>
                  <p className="font-medium text-foreground">{cert.companyName}</p>
                </div>
                {cert.companyNameAr && (
                  <div>
                    <p className="text-muted-foreground">Company (AR)</p>
                    <p className="font-medium text-foreground" dir="rtl">{cert.companyNameAr}</p>
                  </div>
                )}
                {cert.companyCR && (
                  <div>
                    <p className="text-muted-foreground">CR Number</p>
                    <p className="font-medium text-foreground">{cert.companyCR}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Omani Officer</p>
                  <p className="font-medium text-foreground">{cert.officerName}</p>
                </div>
                {cert.officerPASI && (
                  <div>
                    <p className="text-muted-foreground">PASI Number</p>
                    <p className="font-medium text-foreground">{cert.officerPASI}</p>
                  </div>
                )}
                {cert.officerCivilId && (
                  <div>
                    <p className="text-muted-foreground">Civil ID</p>
                    <p className="font-medium text-foreground">{cert.officerCivilId}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Work Orders</p>
                  <p className="font-medium text-foreground">{cert.workOrderCount} completed</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Employment Track</p>
                  <p className="font-medium text-foreground">
                    {cert.employmentTrack === "platform" ? "Track A — Platform" : "Track B — Sanad"}
                  </p>
                </div>
              </div>
              <div className="border-t border-border/50 pt-3 text-center">
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  MoL Omanisation Compliant
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Generated {new Date(cert.generatedAt).toLocaleDateString()} · SmartPRO Hub Platform
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCert(null)}>Generate Another</Button>
              <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OfficerAssignmentPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  
  const utils = trpc.useUtils();

  const [selectedOfficer, setSelectedOfficer] = useState<Officer | null>(null);
  const [officerSearch, setOfficerSearch] = useState("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [certDialog, setCertDialog] = useState<{ companyId: number; companyName: string } | null>(null);

  const { data: officers = [], isLoading: officersLoading, refetch } = trpc.officers.list.useQuery({ status: "active" });
  const { data: assignments = [], isLoading: assignmentsLoading } = trpc.officers.getAssignments.useQuery(
    { officerId: selectedOfficer?.id ?? 0 },
    { enabled: !!selectedOfficer }
  );

  const removeAssignment = trpc.officers.removeCompany.useMutation({
    onSuccess: () => {
      utils.officers.getAssignments.invalidate();
      utils.officers.list.invalidate();
      utils.officers.stats.invalidate();
      toast.success("Assignment removed");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  // Smart Assign: pick officer with most available capacity
  const handleSmartAssign = () => {
    const available = (officers as Officer[]).filter(o => o.availableSlots > 0);
    if (available.length === 0) { toast.error("All officers are at full capacity"); return; }
    const best = [...available].sort((a, b) => b.availableSlots - a.availableSlots)[0];
    setSelectedOfficer(best);
    setShowAssignDialog(true);
    toast.info(`Smart Assign: Selected ${best.fullName} (${best.availableSlots} slots free, lowest load)`);
  };

  const filteredOfficers = useMemo(() => {
    if (!officerSearch) return officers as Officer[];
    const q = officerSearch.toLowerCase();
    return (officers as Officer[]).filter((o) =>
      o.fullName.toLowerCase().includes(q) || (o.fullNameAr ?? "").toLowerCase().includes(q)
    );
  }, [officers, officerSearch]);

  const activeAssignments = (assignments as Assignment[]).filter((a) => a.status === "active");
  const pastAssignments = (assignments as Assignment[]).filter((a) => a.status !== "active");

  // Summary stats
  const totalRevenue = activeAssignments.reduce((s, a) => s + a.monthlyFee, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/40 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-5 h-5 text-red-400" />
              Company Assignments
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage which companies are assigned to each Omani PRO officer
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50" onClick={handleSmartAssign}>
              <Zap className="w-3.5 h-3.5" /> Smart Assign
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — Officer List */}
          <div className="lg:col-span-1 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={officerSearch} onChange={(e) => setOfficerSearch(e.target.value)}
                placeholder="Search officers…" className="pl-9" />
            </div>

            {officersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : filteredOfficers.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="py-8 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active officers found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredOfficers.map((o) => (
                  <OfficerSelectorCard
                    key={o.id}
                    officer={o}
                    selected={selectedOfficer?.id === o.id}
                    onClick={() => setSelectedOfficer(o)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right — Assignment Detail */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedOfficer ? (
              <Card className="border-dashed border-border/50 h-full min-h-[400px]">
                <CardContent className="flex flex-col items-center justify-center h-full py-16">
                  <ArrowRight className="w-10 h-10 text-muted-foreground/20 mb-4" />
                  <h3 className="text-base font-medium text-foreground mb-1">Select an Officer</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Choose an Omani PRO officer from the left panel to view and manage their company assignments
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Officer Summary */}
                <Card className="border-border/50 bg-card/60">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-4">
                        <CapacityRing
                          pct={selectedOfficer.capacityPct}
                          active={selectedOfficer.activeAssignments}
                          max={selectedOfficer.maxCompanies}
                          size={72}
                        />
                        <div>
                          <h2 className="text-lg font-bold text-foreground">{selectedOfficer.fullName}</h2>
                          {selectedOfficer.fullNameAr && (
                            <p className="text-sm text-muted-foreground" dir="rtl">{selectedOfficer.fullNameAr}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex flex-wrap items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {selectedOfficer.activeAssignments} companies
                            </span>
                            <span className="flex flex-wrap items-center gap-1">
                              <Wallet className="w-3 h-3" />
                              OMR {totalRevenue.toFixed(3)}/mo revenue
                            </span>
                            <span className="flex flex-wrap items-center gap-1">
                              <TrendingUp className="w-3 h-3" />
                              OMR {(totalRevenue - selectedOfficer.monthlySalary).toFixed(3)}/mo net
                            </span>
                          </div>
                        </div>
                      </div>
                      {isAdmin && selectedOfficer.availableSlots > 0 && (
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => setShowAssignDialog(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Assign Company
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Active Assignments */}
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Active Assignments ({activeAssignments.length})
                      </span>
                      {selectedOfficer.availableSlots === 0 && (
                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
                          <AlertTriangle className="w-3 h-3 mr-1" /> At Capacity
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {assignmentsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
                        ))}
                      </div>
                    ) : activeAssignments.length === 0 ? (
                      <div className="py-8 text-center">
                        <Building2 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No active company assignments</p>
                        {isAdmin && (
                          <Button size="sm" variant="outline" className="mt-3"
                            onClick={() => setShowAssignDialog(true)}>
                            <Plus className="w-3.5 h-3.5 mr-1.5" /> Assign First Company
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeAssignments.map((a) => (
                          <div key={a.id}
                            className="flex items-center justify-between p-3.5 rounded-xl bg-muted/20 border border-border/40 hover:border-border/60 transition-colors">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <span className="text-sm font-bold text-emerald-400">
                                  {a.companyName.charAt(0)}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{a.companyName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {a.companyIndustry} · {a.companyCity}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-right">
                                <p className="text-xs font-medium text-foreground">OMR {a.monthlyFee.toFixed(3)}/mo</p>
                                <p className="text-[10px] text-muted-foreground">
                                  Since {new Date(a.assignedAt).toLocaleDateString()}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-blue-400 hover:text-blue-300"
                                onClick={() => setCertDialog({ companyId: a.companyId, companyName: a.companyName })}>
                                <FileText className="w-3 h-3 mr-1" /> Cert
                              </Button>
                              {isAdmin && (
                                <Button variant="ghost" size="sm"
                                  className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
                                  disabled={removeAssignment.isPending}
                                  onClick={() => {
                                    if (confirm(`Remove ${a.companyName} from ${selectedOfficer.fullName}?`)) {
                                      removeAssignment.mutate({ officerId: selectedOfficer.id, companyId: a.companyId });
                                    }
                                  }}>
                                  <UserX className="w-3 h-3 mr-1" /> Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Past Assignments */}
                {pastAssignments.length > 0 && (
                  <Card className="border-border/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        Past Assignments ({pastAssignments.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {pastAssignments.map((a) => (
                          <div key={a.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border/30 opacity-60">
                            <div>
                              <p className="text-sm font-medium text-foreground">{a.companyName}</p>
                              <p className="text-xs text-muted-foreground">{a.companyIndustry} · {a.companyCity}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground">
                                {a.status}
                              </Badge>
                              {a.terminatedAt && (
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  Ended {new Date(a.terminatedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Compliance Note */}
                <Card className="border-border/40 bg-blue-500/5 border-blue-500/20">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-blue-400">MoL Compliance: </span>
                        Each company assigned to this officer satisfies the Ministry of Labour requirement for one Omani employee per commercial register (Ministerial Decision No. 906/2025). Generate a monthly compliance certificate for each company's records.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {showAssignDialog && selectedOfficer && (
        <AssignCompanyDialog
          open={showAssignDialog}
          onClose={() => setShowAssignDialog(false)}
          officer={selectedOfficer}
        />
      )}
      {certDialog && (
        <CertificateDialog
          open={!!certDialog}
          onClose={() => setCertDialog(null)}
          companyId={certDialog.companyId}
          companyName={certDialog.companyName}
        />
      )}
    </div>
  );
}

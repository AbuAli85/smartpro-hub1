import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Trash2,
  Download,
  Loader2,
  Users,
  Building2,
  Calendar,
  MapPin,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type AssignmentRow = {
  id: string;
  firstPartyCompanyId: number;
  secondPartyCompanyId: number;
  promoterEmployeeId: number;
  locationAr: string | null;
  locationEn: string | null;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  contractReferenceNumber: string | null;
  firstPartyName: string;
  secondPartyName: string;
  promoterName: string;
};

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export default function PromoterAssignmentsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Data queries
  const { data: assignments = [], isLoading, refetch } = trpc.promoterAssignments.list.useQuery();
  const { data: allCompanies = [] } = trpc.promoterAssignments.listAvailableCompanies.useQuery();
  const { data: allEmployees = [] } = trpc.promoterAssignments.listAvailableEmployees.useQuery({});

  // Mutations
  const createMutation = trpc.promoterAssignments.create.useMutation({
    onSuccess: () => {
      toast.success("Assignment created", { description: "Promoter assignment saved successfully." });
      refetch();
      setShowCreate(false);
      resetForm();
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const deleteMutation = trpc.promoterAssignments.delete.useMutation({
    onSuccess: () => {
      toast.success("Deleted", { description: "Assignment removed." });
      refetch();
    },
    onError: (e) => toast.error("Error", { description: e.message }),
  });

  const generateMutation = trpc.documentGeneration.generate.useMutation({
    onSuccess: (result) => {
      toast.success("Contract generated!", { description: "Opening PDF…" });
      window.open(result.fileUrl, "_blank");
      setGeneratingId(null);
    },
    onError: (e) => {
      toast.error("Generation failed", { description: e.message });
      setGeneratingId(null);
    },
  });

  // Form state
  const [form, setForm] = useState({
    firstPartyCompanyId: "",
    secondPartyCompanyId: "",
    promoterEmployeeId: "",
    locationAr: "",
    locationEn: "",
    startDate: "",
    endDate: "",
    contractReferenceNumber: "",
    issueDate: "",
    status: "active" as "active" | "inactive" | "expired",
  });

  function resetForm() {
    setForm({
      firstPartyCompanyId: "",
      secondPartyCompanyId: "",
      promoterEmployeeId: "",
      locationAr: "",
      locationEn: "",
      startDate: "",
      endDate: "",
      contractReferenceNumber: "",
      issueDate: "",
      status: "active",
    });
  }

  function handleCreate() {
    if (!form.firstPartyCompanyId || !form.secondPartyCompanyId || !form.promoterEmployeeId) {
      toast.error("Missing fields", { description: "Please fill all required fields." });
      return;
    }
    createMutation.mutate({
      firstPartyCompanyId: Number(form.firstPartyCompanyId),
      secondPartyCompanyId: Number(form.secondPartyCompanyId),
      promoterEmployeeId: Number(form.promoterEmployeeId),
      locationAr: form.locationAr,
      locationEn: form.locationEn,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      contractReferenceNumber: form.contractReferenceNumber || undefined,
      issueDate: form.issueDate || undefined,
    });
  }

  function handleGenerate(assignment: AssignmentRow) {
    setGeneratingId(assignment.id);
    generateMutation.mutate({
      templateKey: "promoter_assignment_contract_bilingual",
      entityId: assignment.id,
      outputFormat: "pdf",
    });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return assignments;
    const q = search.toLowerCase();
    return (assignments as AssignmentRow[]).filter(
      (a) =>
        a.promoterName.toLowerCase().includes(q) ||
        a.firstPartyName.toLowerCase().includes(q) ||
        a.secondPartyName.toLowerCase().includes(q) ||
        (a.locationEn ?? "").toLowerCase().includes(q) ||
        (a.contractReferenceNumber ?? "").toLowerCase().includes(q)
    );
  }, [assignments, search]);

  const statusColor: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    inactive: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30",
    expired: "bg-red-500/15 text-red-500 border-red-500/30",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Promoter Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage promoter assignment contracts between companies. Generate bilingual PDF contracts instantly.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Assignment
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: assignments.length, icon: <FileText className="h-4 w-4" /> },
          { label: "Active", value: (assignments as AssignmentRow[]).filter((a) => a.status === "active").length, icon: <Users className="h-4 w-4 text-emerald-500" /> },
          { label: "Expired", value: (assignments as AssignmentRow[]).filter((a) => a.status === "expired").length, icon: <AlertCircle className="h-4 w-4 text-red-500" /> },
          { label: "Companies", value: new Set((assignments as AssignmentRow[]).flatMap((a) => [a.firstPartyCompanyId, a.secondPartyCompanyId])).size, icon: <Building2 className="h-4 w-4 text-blue-500" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">{s.icon}</div>
            <div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by promoter, company, or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Promoter</TableHead>
              <TableHead>First Party</TableHead>
              <TableHead>Second Party</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Ref #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading assignments…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileText className="h-10 w-10 opacity-30" />
                    <p className="font-medium">No assignments found</p>
                    <p className="text-sm">Create your first promoter assignment to get started.</p>
                    <Button size="sm" onClick={() => setShowCreate(true)} className="mt-1 gap-2">
                      <Plus className="h-4 w-4" /> New Assignment
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              (filtered as AssignmentRow[]).map((a) => (
                <TableRow key={a.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {a.promoterName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-sm">{a.promoterName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{a.firstPartyName}</TableCell>
                  <TableCell className="text-sm">{a.secondPartyName}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span>{a.locationEn ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span>{formatDate(a.startDate)} → {formatDate(a.endDate)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.contractReferenceNumber ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColor[a.status] ?? ""}`}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="gap-1.5 text-xs"
                        disabled={generatingId === a.id}
                        onClick={() => handleGenerate(a)}
                        title="Generate bilingual PDF contract"
                      >
                        {generatingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        {generatingId === a.id ? "Generating…" : "Generate Contract"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Delete this assignment?")) deleteMutation.mutate({ id: a.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => { setShowCreate(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              New Promoter Assignment
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* First Party */}
            <div className="space-y-1.5">
              <Label>First Party (Company) <span className="text-destructive">*</span></Label>
              <Select value={form.firstPartyCompanyId} onValueChange={(v) => setForm((f) => ({ ...f, firstPartyCompanyId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company…" />
                </SelectTrigger>
                <SelectContent>
                  {allCompanies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Second Party */}
            <div className="space-y-1.5">
              <Label>Second Party (Company) <span className="text-destructive">*</span></Label>
              <Select value={form.secondPartyCompanyId} onValueChange={(v) => setForm((f) => ({ ...f, secondPartyCompanyId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company…" />
                </SelectTrigger>
                <SelectContent>
                  {allCompanies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Promoter Employee */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Promoter Employee <span className="text-destructive">*</span></Label>
              <Select value={form.promoterEmployeeId} onValueChange={(v) => setForm((f) => ({ ...f, promoterEmployeeId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {`${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || `Employee #${e.id}`}
                      {e.jobTitle ? ` — ${e.jobTitle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location EN */}
            <div className="space-y-1.5">
              <Label>Location (English) <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. eXtra - Muscat City Centre"
                value={form.locationEn}
                onChange={(e) => setForm((f) => ({ ...f, locationEn: e.target.value }))}
              />
            </div>

            {/* Location AR */}
            <div className="space-y-1.5">
              <Label>Location (Arabic) <span className="text-destructive">*</span></Label>
              <Input
                dir="rtl"
                placeholder="مثال: اكسترا - مسقط سيتي سنتر"
                value={form.locationAr}
                onChange={(e) => setForm((f) => ({ ...f, locationAr: e.target.value }))}
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label>Start Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <Label>End Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>

            {/* Contract Ref */}
            <div className="space-y-1.5">
              <Label>Contract Reference No.</Label>
              <Input
                placeholder="e.g. PA-2026-001"
                value={form.contractReferenceNumber}
                onChange={(e) => setForm((f) => ({ ...f, contractReferenceNumber: e.target.value }))}
              />
            </div>

            {/* Issue Date */}
            <div className="space-y-1.5">
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="gap-2">
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

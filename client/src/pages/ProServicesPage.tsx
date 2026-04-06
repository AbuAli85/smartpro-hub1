import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Shield, Plus, Search, AlertTriangle, CheckCircle2, RefreshCw,
  CheckSquare, Square, Zap, ChevronRight, X, FileText, User, Calendar,
  ArrowRight, Edit2, Hash, Globe, CreditCard, Activity, Flag, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { DateInput } from "@/components/ui/date-input";

const STATUS_META: Record<string, { label: string; color: string; step: number }> = {
  pending:                { label: "Pending",           color: "bg-amber-100 text-amber-700 border-amber-200",      step: 1 },
  assigned:               { label: "Assigned",          color: "bg-blue-100 text-blue-700 border-blue-200",         step: 2 },
  in_progress:            { label: "In Progress",       color: "bg-indigo-100 text-indigo-700 border-indigo-200",   step: 3 },
  awaiting_documents:     { label: "Awaiting Docs",     color: "bg-orange-100 text-orange-700 border-orange-200",   step: 3 },
  submitted_to_authority: { label: "Submitted to MoL",  color: "bg-purple-100 text-purple-700 border-purple-200",   step: 4 },
  approved:               { label: "Approved",          color: "bg-green-100 text-green-700 border-green-200",      step: 5 },
  completed:              { label: "Completed",         color: "bg-emerald-100 text-emerald-700 border-emerald-200",step: 6 },
  rejected:               { label: "Rejected",          color: "bg-red-100 text-red-700 border-red-200",            step: 0 },
  cancelled:              { label: "Cancelled",         color: "bg-gray-100 text-gray-500 border-gray-200",         step: 0 },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "bg-gray-100 text-gray-600" },
  normal: { label: "Normal", color: "bg-blue-100 text-blue-600" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

const SERVICE_LABELS: Record<string, string> = {
  visa_processing:       "Visa Processing",
  work_permit:           "Work Permit",
  labor_card:            "Labour Card",
  emirates_id:           "Emirates ID",
  oman_id:               "Oman ID (ROP)",
  residence_renewal:     "Residence Renewal",
  visa_renewal:          "Visa Renewal",
  permit_renewal:        "Permit Renewal",
  document_attestation:  "Document Attestation",
  company_registration:  "Company Registration (CR)",
  other:                 "Other",
};

const WORKFLOW_STEPS = [
  { key: "pending",                label: "Intake",     step: 1 },
  { key: "assigned",               label: "Assigned",   step: 2 },
  { key: "in_progress",            label: "Processing", step: 3 },
  { key: "submitted_to_authority", label: "Submitted",  step: 4 },
  { key: "approved",               label: "Approved",   step: 5 },
  { key: "completed",              label: "Completed",  step: 6 },
];

function IntakeWizard({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    serviceType: "work_permit" as const,
    priority: "normal" as const,
    employeeName: "",
    nationality: "",
    passportNumber: "",
    passportExpiry: "",
    notes: "",
    fees: "",
    dueDate: "",
    expiryDate: "",
    visaNumber: "",
    permitNumber: "",
  });

  const createMutation = trpc.pro.create.useMutation({
    onSuccess: (data) => {
      toast.success("Case created: " + data.serviceNumber);
      setOpen(false);
      setStep(1);
      setForm({ serviceType: "work_permit", priority: "normal", employeeName: "", nationality: "", passportNumber: "", passportExpiry: "", notes: "", fees: "", dueDate: "", expiryDate: "", visaNumber: "", permitNumber: "" });
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const stepLabels = ["Employee Info", "Service Details", "Fees & Deadline"];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setStep(1); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white">
          <Plus size={16} /> New PRO Case
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--smartpro-orange)]" />
            New PRO Service Case
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1 mb-4">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={"w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " + (step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-[var(--smartpro-orange)] text-white" : "bg-muted text-muted-foreground")}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <span className={"text-xs font-medium " + (step === i + 1 ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < stepLabels.length - 1 && <div className={"flex-1 h-px " + (step > i + 1 ? "bg-green-500" : "bg-border")} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Employee Full Name *</Label>
              <Input placeholder="e.g. Ahmed Al-Balushi" value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nationality</Label>
                <Input placeholder="e.g. Indian" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Passport Number</Label>
                <Input placeholder="Passport #" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Passport Expiry Date</Label>
              <DateInput value={form.passportExpiry} onChange={(e) => setForm({ ...form, passportExpiry: e.target.value })} />
            </div>
            <Button className="w-full" disabled={!form.employeeName} onClick={() => setStep(2)}>
              Next: Service Details <ArrowRight size={14} className="ml-1" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Service Type *</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent — SLA applies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Visa / Permit Number</Label>
                <Input placeholder="If existing" value={form.visaNumber} onChange={(e) => setForm({ ...form, visaNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Document Expiry</Label>
                <DateInput value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Textarea placeholder="Special instructions, client requirements..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1" onClick={() => setStep(3)}>Next: Fees <ArrowRight size={14} className="ml-1" /></Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Service Fees (OMR)</Label>
                <Input type="number" placeholder="0.000" step="0.001" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Target Completion Date</Label>
                <DateInput value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm">
              <p className="font-semibold text-orange-800 mb-1">Case Summary</p>
              <div className="text-orange-700 space-y-0.5 text-xs">
                <p><strong>Employee:</strong> {form.employeeName} ({form.nationality || "—"})</p>
                <p><strong>Service:</strong> {SERVICE_LABELS[form.serviceType]}</p>
                <p><strong>Priority:</strong> {form.priority}</p>
                {form.fees && <p><strong>Fees:</strong> OMR {parseFloat(form.fees).toFixed(3)}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
              <Button
                className="flex-1 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({ ...form, fees: form.fees ? Number(form.fees) : undefined })}
              >
                {createMutation.isPending ? "Creating..." : "Create Case"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CaseDetailPanel({ serviceId, onClose, onUpdate }: { serviceId: number; onClose: () => void; onUpdate: () => void }) {
  const { data: svc, refetch } = trpc.pro.getById.useQuery({ id: serviceId });
  const [editNotes, setEditNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [editFees, setEditFees] = useState(false);
  const [fees, setFees] = useState("");

  const updateMutation = trpc.pro.update.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); onUpdate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!svc) return (
    <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
      <div className="text-center">
        <Shield size={32} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Loading case details...</p>
      </div>
    </div>
  );

  const statusMeta = STATUS_META[svc.status ?? "pending"];
  const priorityMeta = PRIORITY_META[svc.priority ?? "normal"];
  const daysLeft = svc.dueDate ? Math.ceil((new Date(svc.dueDate).getTime() - Date.now()) / 86400000) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const currentStep = statusMeta.step;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between p-4 border-b">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{svc.serviceNumber}</span>
            <Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge>
            <Badge className={"text-xs " + priorityMeta.color} variant="outline">{priorityMeta.label}</Badge>
          </div>
          <h2 className="font-bold text-lg leading-tight">{svc.employeeName}</h2>
          <p className="text-sm text-muted-foreground">{SERVICE_LABELS[svc.serviceType ?? "other"]}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close case panel"><X size={16} aria-hidden="true" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Case Progress</p>
          <div className="flex items-start justify-between relative">
            <div className="absolute top-3.5 left-0 right-0 h-px bg-border z-0" />
            {WORKFLOW_STEPS.map((wStep, i) => {
              const done = currentStep >= wStep.step && !["rejected","cancelled"].includes(svc.status ?? "");
              const active = svc.status === wStep.key || (svc.status === "awaiting_documents" && wStep.key === "in_progress");
              return (
                <div key={wStep.key} className="flex flex-col items-center z-10 flex-1">
                  <div className={"w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all " + (active ? "border-[var(--smartpro-orange)] bg-[var(--smartpro-orange)] text-white scale-110" : done ? "border-green-500 bg-green-500 text-white" : "border-border bg-background text-muted-foreground")}>
                    {done && !active ? "✓" : i + 1}
                  </div>
                  <p className={"text-[9px] mt-1 text-center leading-tight " + (active ? "text-[var(--smartpro-orange)] font-semibold" : done ? "text-green-600" : "text-muted-foreground")}>
                    {wStep.label}
                  </p>
                </div>
              );
            })}
          </div>
          {svc.status === "rejected" && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              This case was rejected. Review notes and create a new case if needed.
            </div>
          )}
        </div>

        <Separator />

        {!["completed", "cancelled", "rejected"].includes(svc.status ?? "") && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-xs font-semibold text-orange-800 mb-2 flex items-center gap-1">
              <Activity size={12} /> Next Action Required
            </p>
            <div className="flex flex-wrap gap-2">
              {svc.status === "pending" && (
                <Button size="sm" className="h-7 text-xs bg-[var(--smartpro-orange)] text-white hover:bg-orange-600"
                  onClick={() => updateMutation.mutate({ id: svc.id, status: "assigned" })}>
                  Assign Officer
                </Button>
              )}
              {svc.status === "assigned" && (
                <Button size="sm" className="h-7 text-xs bg-[var(--smartpro-orange)] text-white hover:bg-orange-600"
                  onClick={() => updateMutation.mutate({ id: svc.id, status: "in_progress" })}>
                  Start Processing
                </Button>
              )}
              {svc.status === "in_progress" && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-[var(--smartpro-orange)] text-white hover:bg-orange-600"
                    onClick={() => updateMutation.mutate({ id: svc.id, status: "submitted_to_authority" })}>
                    Submit to Authority
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => updateMutation.mutate({ id: svc.id, status: "awaiting_documents" })}>
                    Request Documents
                  </Button>
                </>
              )}
              {svc.status === "awaiting_documents" && (
                <Button size="sm" className="h-7 text-xs bg-[var(--smartpro-orange)] text-white hover:bg-orange-600"
                  onClick={() => updateMutation.mutate({ id: svc.id, status: "in_progress" })}>
                  Documents Received
                </Button>
              )}
              {svc.status === "submitted_to_authority" && (
                <>
                  <Button size="sm" className="h-7 text-xs bg-green-600 text-white hover:bg-green-700"
                    onClick={() => updateMutation.mutate({ id: svc.id, status: "approved" })}>
                    Mark Approved
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-600"
                    onClick={() => updateMutation.mutate({ id: svc.id, status: "rejected" })}>
                    Mark Rejected
                  </Button>
                </>
              )}
              {svc.status === "approved" && (
                <Button size="sm" className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => updateMutation.mutate({ id: svc.id, status: "completed" })}>
                  Mark Completed & Delivered
                </Button>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Case Details</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { icon: User, label: "Employee", value: svc.employeeName ?? "—" },
              { icon: Globe, label: "Nationality", value: svc.nationality ?? "—" },
              { icon: Hash, label: "Passport", value: svc.passportNumber ?? "—" },
              { icon: Calendar, label: "Passport Expiry", value: svc.passportExpiry ? fmtDate(svc.passportExpiry) : "—" },
              { icon: FileText, label: "Visa / Permit #", value: svc.visaNumber ?? svc.permitNumber ?? "—" },
              { icon: Calendar, label: "Document Expiry", value: svc.expiryDate ? fmtDate(svc.expiryDate) : "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-medium text-xs">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/40 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Service Fees</p>
              <button onClick={() => { setEditFees(true); setFees(svc.fees ?? ""); }} className="text-muted-foreground hover:text-foreground">
                <Edit2 size={11} />
              </button>
            </div>
            {editFees ? (
              <div className="flex gap-1">
                <Input className="h-7 text-xs" type="number" value={fees} onChange={(e) => setFees(e.target.value)} />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => { updateMutation.mutate({ id: svc.id, fees: Number(fees) }); setEditFees(false); }}>✓</Button>
              </div>
            ) : (
              <p className="text-lg font-black text-[var(--smartpro-orange)]">
                {svc.fees ? "OMR " + parseFloat(svc.fees).toFixed(3) : "Not set"}
              </p>
            )}
          </div>
          <div className="p-3 bg-muted/40 rounded-xl">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Due Date</p>
            {svc.dueDate ? (
              <div>
                <p className={"text-sm font-bold " + (isOverdue ? "text-red-600" : daysLeft! <= 3 ? "text-orange-600" : "text-foreground")}>
                  {fmtDate(svc.dueDate)}
                </p>
                <p className={"text-xs " + (isOverdue ? "text-red-500" : "text-muted-foreground")}>
                  {isOverdue ? Math.abs(daysLeft!) + "d overdue" : daysLeft + "d remaining"}
                </p>
              </div>
            ) : <p className="text-sm text-muted-foreground">Not set</p>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Officer Notes</p>
            <button onClick={() => { setEditNotes(true); setNotes(svc.notes ?? ""); }} className="text-xs text-[var(--smartpro-orange)] hover:underline flex items-center gap-1">
              <Edit2 size={11} /> Edit
            </button>
          </div>
          {editNotes ? (
            <div className="space-y-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={() => { updateMutation.mutate({ id: svc.id, notes }); setEditNotes(false); }}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditNotes(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-3 min-h-[60px]">
              {svc.notes || "No notes added yet. Click Edit to add officer notes."}
            </p>
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <p>Created: {fmtDateTime(svc.createdAt)}</p>
          {svc.completedAt && <p className="text-green-600">Completed: {fmtDateTime(svc.completedAt)}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ProServicesPage() {
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: services, refetch } = trpc.pro.list.useQuery(
    {
      status: statusFilter !== "all" ? statusFilter : undefined,
      serviceType: typeFilter !== "all" ? typeFilter : undefined,
      companyId: activeCompanyId ?? undefined,
    },
    { enabled: activeCompanyId != null },
  );
  const { data: stats } = trpc.pro.getStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery(
    { daysAhead: 60, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const updateMutation = trpc.pro.update.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.length === (filtered?.length ?? 0) && (filtered?.length ?? 0) > 0
        ? [] : (filtered?.map((s) => s.id) ?? [])
    );
  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedIds.length === 0) return;
    for (const id of selectedIds) {
      await updateMutation.mutateAsync({ id, status: bulkStatus as any });
    }
    setSelectedIds([]);
    setBulkStatus("");
  };

  const filtered = services?.filter((s) =>
    !search ||
    (s.employeeName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    s.serviceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    (s.nationality ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const kpiItems = [
    { label: "Pending Intake",         value: stats?.pending ?? 0,              color: "bg-amber-500",   icon: Clock },
    { label: "In Progress",            value: stats?.inProgress ?? 0,           color: "bg-indigo-500",  icon: Activity },
    { label: "Submitted to Authority", value: stats?.submittedToAuthority ?? 0, color: "bg-purple-500",  icon: ArrowRight },
    { label: "Completed This Month",   value: stats?.completedThisMonth ?? 0,   color: "bg-emerald-500", icon: CheckCircle2 },
    { label: "Urgent Cases",           value: stats?.urgent ?? 0,               color: "bg-red-500",     icon: Flag },
    { label: "Fees Collected (OMR)",   value: stats?.totalFeesCollected ? stats.totalFeesCollected.toFixed(3) : "0.000", color: "bg-[var(--smartpro-orange)]", icon: CreditCard },
  ];

  return (
    <div className="flex h-full">
      <div className={"flex-1 p-6 space-y-6 overflow-y-auto transition-all " + (selectedId ? "max-w-[calc(100%-380px)]" : "")}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">PRO & Visa Services</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Complete case lifecycle — intake to MoL submission to delivery
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {["MHRSD Compliant", "PASI Integrated", "WPS Ready", "Omanisation Tracking"].map((tag, i) => (
                <span key={tag} className={"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border " + (i === 0 ? "bg-orange-50 text-orange-700 border-orange-200" : i === 1 ? "bg-blue-50 text-blue-700 border-blue-200" : i === 2 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-violet-50 text-violet-700 border-violet-200")}>{tag}</span>
              ))}
            </div>
          </div>
          <IntakeWizard onSuccess={refetch} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiItems.map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-card border rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className={"w-7 h-7 rounded-lg " + color + " flex items-center justify-center mb-2"}>
                <Icon size={14} className="text-white" />
              </div>
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="cases">
          <TabsList>
            <TabsTrigger value="cases">
              All Cases
              {stats && stats.total > 0 && (
                <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{stats.total}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expiring">
              Expiring Documents
              {(expiringDocs?.length ?? 0) > 0 && (
                <span className="ml-1.5 bg-red-100 text-red-700 rounded-full px-1.5 py-0.5 text-[10px]">{expiringDocs?.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cases" className="space-y-4 mt-4">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-xl">
                <CheckSquare size={15} className="text-orange-600" />
                <span className="text-sm font-semibold">{selectedIds.length} selected</span>
                <div className="flex items-center gap-2 ml-auto">
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Set status..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="submitted_to_authority">Submitted to Authority</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 text-xs gap-1" onClick={handleBulkUpdate} disabled={!bulkStatus || updateMutation.isPending}>
                    <Zap size={12} /> Apply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedIds([])}>Clear</Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by name, number, nationality..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="awaiting_documents">Awaiting Docs</SelectItem>
                  <SelectItem value="submitted_to_authority">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(SERVICE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="px-4 py-3 w-8">
                        <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                          {selectedIds.length > 0 && selectedIds.length === (filtered?.length ?? 0)
                            ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                      </th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Case #</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Employee</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Service</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Priority</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Due / Expiry</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Fees</th>
                      <th scope="col" className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered?.length === 0 && (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          <Shield size={32} className="mx-auto mb-2 opacity-30" />
                          <p>No PRO cases found</p>
                          <p className="text-xs mt-1">Create a new case using the button above</p>
                        </td>
                      </tr>
                    )}
                    {filtered?.map((svc) => {
                      const isExpiringSoon = svc.expiryDate && new Date(svc.expiryDate) < new Date(Date.now() + 30 * 86400000);
                      const daysLeft = svc.dueDate ? Math.ceil((new Date(svc.dueDate).getTime() - Date.now()) / 86400000) : null;
                      const isOverdue = daysLeft !== null && daysLeft < 0;
                      const statusMeta = STATUS_META[svc.status ?? "pending"];
                      const priorityMeta = PRIORITY_META[svc.priority ?? "normal"];
                      const isSelected = selectedId === svc.id;
                      return (
                        <tr
                          key={svc.id}
                          className={"border-b hover:bg-muted/20 transition-colors cursor-pointer " + (selectedIds.includes(svc.id) ? "bg-orange-50/50 " : "") + (isSelected ? "bg-orange-50" : "")}
                          onClick={() => setSelectedId(isSelected ? null : svc.id)}
                        >
                          <td className="px-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => toggleSelect(svc.id)} className="text-muted-foreground hover:text-foreground">
                              {selectedIds.includes(svc.id) ? <CheckSquare size={14} className="text-orange-600" /> : <Square size={14} />}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{svc.serviceNumber}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{svc.employeeName}</div>
                            {svc.nationality && <div className="text-xs text-muted-foreground">{svc.nationality}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs">{SERVICE_LABELS[svc.serviceType ?? "other"]}</td>
                          <td className="px-4 py-3">
                            <Badge className={"text-xs " + priorityMeta.color} variant="outline">{priorityMeta.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {svc.dueDate ? (
                              <span className={"flex items-center gap-1 " + (isOverdue ? "text-red-600 font-medium" : daysLeft! <= 3 ? "text-orange-600" : "text-muted-foreground")}>
                                {isOverdue && <AlertTriangle size={11} />}
                                {fmtDate(svc.dueDate)}
                                {daysLeft !== null && <span className="text-[10px]">({isOverdue ? Math.abs(daysLeft) + "d late" : daysLeft + "d"})</span>}
                              </span>
                            ) : svc.expiryDate ? (
                              <span className={"flex items-center gap-1 " + (isExpiringSoon ? "text-red-600 font-medium" : "text-muted-foreground")}>
                                {isExpiringSoon && <AlertTriangle size={11} />}
                                {fmtDate(svc.expiryDate)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {svc.fees ? "OMR " + parseFloat(svc.fees).toFixed(3) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight size={14} className={"text-muted-foreground transition-transform " + (isSelected ? "rotate-90 text-[var(--smartpro-orange)]" : "")} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="expiring" className="space-y-4 mt-4">
            {expiringDocs?.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
                  <h3 className="font-semibold">All documents are up to date</h3>
                  <p className="text-sm text-muted-foreground">No documents expiring in the next 60 days.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {expiringDocs?.map((doc) => {
                  const daysLeft = doc.expiryDate
                    ? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000)
                    : null;
                  const urgency = daysLeft !== null ? (daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "notice") : "notice";
                  return (
                    <div key={doc.id} className={"flex items-center justify-between p-4 rounded-xl border " + (urgency === "critical" ? "border-red-200 bg-red-50" : urgency === "warning" ? "border-orange-200 bg-orange-50" : "border-amber-200 bg-amber-50")}>
                      <div className="flex items-center gap-3">
                        <div className={"w-8 h-8 rounded-lg flex items-center justify-center " + (urgency === "critical" ? "bg-red-500" : urgency === "warning" ? "bg-orange-500" : "bg-amber-500")}>
                          <AlertTriangle size={14} className="text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{doc.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{SERVICE_LABELS[doc.serviceType ?? "other"]} — expires {doc.expiryDate ? fmtDate(doc.expiryDate) : "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {daysLeft !== null && (
                          <Badge className={urgency === "critical" ? "bg-red-100 text-red-700 border-red-200" : urgency === "warning" ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-amber-100 text-amber-700 border-amber-200"} variant="outline">
                            {daysLeft}d left
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                          onClick={() => updateMutation.mutate({ id: doc.id, status: "in_progress" })}>
                          <RefreshCw size={12} /> Start Renewal
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectedId && (
        <div className="w-[380px] border-l bg-background flex flex-col h-full overflow-hidden shrink-0">
          <CaseDetailPanel
            serviceId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdate={refetch}
          />
        </div>
      )}
    </div>
  );
}

import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import {
  Building2, Plus, Search, Star, Phone, Mail, Globe, MapPin,
  FileText, Clock, CheckCircle2, AlertTriangle, XCircle,
  ChevronRight, Briefcase, Users, FileCheck, Stamp, Scale,
  BadgeCheck, Filter, RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pro_office:      { label: "PRO Office",      icon: Briefcase,  color: "bg-red-100 text-red-700" },
  typing_centre:   { label: "Typing Centre",   icon: FileText,   color: "bg-blue-100 text-blue-700" },
  admin_bureau:    { label: "Admin Bureau",    icon: Building2,  color: "bg-gray-100 text-gray-700" },
  legal_services:  { label: "Legal Services",  icon: Scale,      color: "bg-purple-100 text-purple-700" },
  attestation:     { label: "Attestation",     icon: Stamp,      color: "bg-amber-100 text-amber-700" },
  visa_services:   { label: "Visa Services",   icon: FileCheck,  color: "bg-green-100 text-green-700" },
  business_setup:  { label: "Business Setup",  icon: Users,      color: "bg-indigo-100 text-indigo-700" },
  other:           { label: "Other",           icon: Building2,  color: "bg-gray-100 text-gray-600" },
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  work_permit: "Work Permit",
  work_permit_renewal: "Work Permit Renewal",
  work_permit_cancellation: "Work Permit Cancellation",
  labor_card: "Labour Card",
  labor_card_renewal: "Labour Card Renewal",
  residence_visa: "Residence Visa",
  residence_visa_renewal: "Residence Visa Renewal",
  visit_visa: "Visit Visa",
  exit_reentry: "Exit / Re-entry Permit",
  commercial_registration: "Commercial Registration",
  commercial_registration_renewal: "Commercial Reg. Renewal",
  business_license: "Business Licence",
  document_typing: "Document Typing",
  document_translation: "Document Translation",
  document_attestation: "Document Attestation",
  pasi_registration: "PASI Registration",
  omanisation_report: "Omanisation Report",
  other: "Other",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:              { label: "Draft",            color: "bg-gray-100 text-gray-600",      icon: FileText },
  submitted:          { label: "Submitted",        color: "bg-blue-100 text-blue-700",      icon: Clock },
  in_progress:        { label: "In Progress",      color: "bg-indigo-100 text-indigo-700",  icon: RefreshCw },
  awaiting_documents: { label: "Awaiting Docs",    color: "bg-amber-100 text-amber-700",    icon: AlertTriangle },
  awaiting_payment:   { label: "Awaiting Payment", color: "bg-orange-100 text-orange-700",  icon: AlertTriangle },
  completed:          { label: "Completed",        color: "bg-emerald-100 text-emerald-700",icon: CheckCircle2 },
  rejected:           { label: "Rejected",         color: "bg-red-100 text-red-700",        icon: XCircle },
  cancelled:          { label: "Cancelled",        color: "bg-gray-100 text-gray-500",      icon: XCircle },
};

const PRIORITY_COLORS: Record<string, string> = {
  low:    "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high:   "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

// ─── New Work Order Dialog ────────────────────────────────────────────────────

function NewWorkOrderDialog({ providers, onSuccess }: { providers: any[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    serviceType: "work_permit" as const,
    providerId: "",
    priority: "normal" as const,
    beneficiaryName: "",
    nationality: "",
    passportNumber: "",
    notes: "",
    fees: "",
    dueDate: "",
  });

  const createMutation = trpc.sanad.createWorkOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`Work order created: ${data.referenceNumber}`);
      setOpen(false);
      setForm({ serviceType: "work_permit", providerId: "", priority: "normal", beneficiaryName: "", nationality: "", passportNumber: "", notes: "", fees: "", dueDate: "" });
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-red-600 hover:bg-red-700 text-white">
          <Plus size={16} /> New Work Order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <FileText size={20} className="text-red-600" />
            New Service Request
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Service Type *</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Service Provider</Label>
              <Select value={form.providerId} onValueChange={(v) => setForm({ ...form, providerId: v })}>
                <SelectTrigger><SelectValue placeholder="Select provider (optional)" /></SelectTrigger>
                <SelectContent>
                  {providers.filter((p) => p.status === "active").map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — {PROVIDER_TYPE_LABELS[p.providerType]?.label ?? p.providerType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Beneficiary Name</Label>
              <Input placeholder="Full name" value={form.beneficiaryName} onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nationality</Label>
              <Input placeholder="e.g. Indian" value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Passport Number</Label>
              <Input placeholder="Passport / ID" value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Estimated Fees (OMR)</Label>
              <Input type="number" placeholder="0.000" value={form.fees} onChange={(e) => setForm({ ...form, fees: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes / Instructions</Label>
            <Textarea placeholder="Special instructions for the service provider..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ serviceType: form.serviceType, providerId: form.providerId ? Number(form.providerId) : undefined, priority: form.priority, beneficiaryName: form.beneficiaryName || undefined, nationality: form.nationality || undefined, passportNumber: form.passportNumber || undefined, notes: form.notes || undefined, fees: form.fees ? Number(form.fees) : undefined, dueDate: form.dueDate || undefined })} disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createMutation.isPending ? "Creating..." : "Create Work Order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({ provider, onSelect }: { provider: any; onSelect: (p: any) => void }) {
  const typeInfo = PROVIDER_TYPE_LABELS[provider.providerType] ?? PROVIDER_TYPE_LABELS.other;
  const Icon = typeInfo.icon;
  const stars = Math.round(Number(provider.rating ?? 0));

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer border border-border" onClick={() => onSelect(provider)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon size={20} className="text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate">{provider.name}</h3>
                {provider.isVerified && <BadgeCheck size={14} className="text-blue-500 shrink-0" />}
              </div>
              {provider.nameAr && <p className="text-xs text-muted-foreground" dir="rtl">{provider.nameAr}</p>}
            </div>
          </div>
          <Badge className={`${typeInfo.color} text-xs shrink-0`}>{typeInfo.label}</Badge>
        </div>
        {provider.description && <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{provider.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {provider.city && <span className="flex flex-wrap items-center gap-1"><MapPin size={11} />{provider.city}{provider.governorate ? `, ${provider.governorate}` : ""}</span>}
          {provider.phone && <span className="flex flex-wrap items-center gap-1"><Phone size={11} />{provider.phone}</span>}
          {provider.openingHours && <span className="flex flex-wrap items-center gap-1"><Clock size={11} />{provider.openingHours}</span>}
        </div>
        {provider.services && provider.services.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {(provider.services as string[]).slice(0, 4).map((s) => (
              <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded-full">{SERVICE_TYPE_LABELS[s] ?? s}</span>
            ))}
            {provider.services.length > 4 && <span className="text-xs text-muted-foreground">+{provider.services.length - 4} more</span>}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {[1,2,3,4,5].map((n) => (
              <Star key={n} size={12} className={n <= stars ? "text-amber-400 fill-amber-400" : "text-gray-300"} />
            ))}
            <span className="text-xs text-muted-foreground ml-1">({provider.totalOrders ?? 0} orders)</span>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Provider Detail Dialog ───────────────────────────────────────────────────

function ProviderDetailDialog({ provider, onClose, onRequestService }: { provider: any; onClose: () => void; onRequestService: (p: any) => void }) {
  const typeInfo = PROVIDER_TYPE_LABELS[provider.providerType] ?? PROVIDER_TYPE_LABELS.other;
  const Icon = typeInfo.icon;
  const stars = Math.round(Number(provider.rating ?? 0));

  return (
    <Dialog open={!!provider} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Icon size={20} className="text-red-600" />
            {provider.name}
            {provider.isVerified && <BadgeCheck size={16} className="text-blue-500" />}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
            <Badge variant="outline" className={provider.status === "active" ? "text-emerald-600 border-emerald-300" : "text-gray-500"}>
              {provider.status === "active" ? "Active" : provider.status}
            </Badge>
            {provider.licenseNumber && <span className="text-xs text-muted-foreground">Lic: {provider.licenseNumber}</span>}
          </div>
          {provider.description && <p className="text-sm text-muted-foreground">{provider.description}</p>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {provider.contactPerson && <div><span className="text-muted-foreground text-xs block">Contact Person</span>{provider.contactPerson}</div>}
            {provider.phone && <div><span className="text-muted-foreground text-xs block">Phone</span><a href={`tel:${provider.phone}`} className="text-red-600 hover:underline">{provider.phone}</a></div>}
            {provider.email && <div><span className="text-muted-foreground text-xs block">Email</span><a href={`mailto:${provider.email}`} className="text-red-600 hover:underline truncate block">{provider.email}</a></div>}
            {provider.website && <div><span className="text-muted-foreground text-xs block">Website</span><a href={provider.website} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">{provider.website}</a></div>}
            {(provider.city || provider.governorate) && <div><span className="text-muted-foreground text-xs block">Location</span>{[provider.city, provider.governorate].filter(Boolean).join(", ")}</div>}
            {provider.openingHours && <div><span className="text-muted-foreground text-xs block">Hours</span>{provider.openingHours}</div>}
          </div>
          {provider.services && provider.services.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Services Offered</p>
              <div className="flex flex-wrap gap-1">
                {(provider.services as string[]).map((s) => (
                  <span key={s} className="text-xs bg-muted px-2 py-1 rounded-full">{SERVICE_TYPE_LABELS[s] ?? s}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {[1,2,3,4,5].map((n) => (
              <Star key={n} size={14} className={n <= stars ? "text-amber-400 fill-amber-400" : "text-gray-300"} />
            ))}
            <span className="text-sm text-muted-foreground ml-1">{Number(provider.rating ?? 0).toFixed(1)} / 5 ({provider.totalOrders ?? 0} orders)</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { onClose(); onRequestService(provider); }}>
              <Plus size={15} className="mr-1" /> Request Service
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Work Order Row ───────────────────────────────────────────────────────────

function WorkOrderRow({ order, providers, onUpdate }: { order: any; providers: any[]; onUpdate: () => void }) {
  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = statusCfg.icon;
  const provider = providers.find((p) => p.id === order.providerId);

  const updateMutation = trpc.sanad.updateWorkOrder.useMutation({
    onSuccess: () => { toast.success("Work order updated"); onUpdate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <StatusIcon size={15} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{order.title || SERVICE_TYPE_LABELS[order.serviceType] || order.serviceType}</span>
          <Badge className={`${statusCfg.color} text-xs`}>{statusCfg.label}</Badge>
          {order.priority && order.priority !== "normal" && (
            <Badge className={`${PRIORITY_COLORS[order.priority]} text-xs`}>{order.priority}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="font-mono">{order.referenceNumber}</span>
          {order.beneficiaryName && <span>{order.beneficiaryName}</span>}
          {provider && <span className="flex flex-wrap items-center gap-1"><Building2 size={10} />{provider.name}</span>}
          {order.dueDate && <span className="flex flex-wrap items-center gap-1"><Clock size={10} />Due {new Date(order.dueDate).toLocaleDateString()}</span>}
          {order.fees && <span>{Number(order.fees).toFixed(3)} OMR</span>}
        </div>
      </div>
      <Select value={order.status} onValueChange={(v) => updateMutation.mutate({ id: order.id, status: v as any })}>
        <SelectTrigger className="h-7 text-xs w-36 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["draft","submitted","in_progress","awaiting_documents","awaiting_payment","completed","rejected","cancelled"].map((s) => (
            <SelectItem key={s} value={s} className="text-xs">{STATUS_CONFIG[s]?.label ?? s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SanadPage() {
  const [tab, setTab] = useState("providers");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState<any>(null);

  const providersQuery = trpc.sanad.listProviders.useQuery(undefined);
  const workOrdersQuery = trpc.sanad.listWorkOrders.useQuery(undefined);

  const providers = (providersQuery.data ?? []) as any[];
  const workOrders = (workOrdersQuery.data ?? []) as any[];

  const filteredProviders = useMemo(() => {
    let list = providers;
    if (typeFilter !== "all") list = list.filter((p) => p.providerType === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q) ||
        (p.city ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [providers, typeFilter, search]);

  const filteredOrders = useMemo(() => {
    let list = workOrders;
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search && tab === "orders") {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        (o.referenceNumber ?? "").toLowerCase().includes(q) ||
        (o.beneficiaryName ?? "").toLowerCase().includes(q) ||
        (o.title ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [workOrders, statusFilter, search, tab]);

  const activeProviders = providers.filter((p) => p.status === "active").length;
  const pendingOrders = workOrders.filter((o) => ["submitted","in_progress","awaiting_documents","awaiting_payment"].includes(o.status)).length;
  const completedOrders = workOrders.filter((o) => o.status === "completed").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-sm">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Sanad Office Management</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Government service providers across Oman — PRO offices, typing centres, admin bureaus, legal services, attestation
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">🇴🇲 Sultanate of Oman</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">🇦🇪 UAE</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">🇸🇦 KSA</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">🇶🇦 Qatar</span>
          </div>
        </div>
        <NewWorkOrderDialog providers={providers} onSuccess={() => workOrdersQuery.refetch()} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Providers",  value: activeProviders,    bg: "stat-gradient-1", icon: Building2 },
          { label: "Total Work Orders", value: workOrders.length,  bg: "stat-gradient-2", icon: FileText },
          { label: "In Progress",       value: pendingOrders,      bg: "stat-gradient-gold", icon: Clock },
          { label: "Completed",         value: completedOrders,    bg: "stat-gradient-4", icon: CheckCircle2 },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-white shadow-sm`}>
            <s.icon size={20} className="mb-2 opacity-80" />
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-white/70 mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setSearch(""); }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="providers" className="gap-2">
              <Building2 size={14} /> Providers
              <Badge variant="secondary" className="ml-1 text-xs">{providers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <FileText size={14} /> Work Orders
              {pendingOrders > 0 && <Badge className="ml-1 text-xs bg-amber-100 text-amber-700">{pendingOrders}</Badge>}
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={tab === "providers" ? "Search providers..." : "Search work orders..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-52 text-sm"
              />
            </div>
            {tab === "providers" && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <Filter size={12} className="mr-1" />
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(PROVIDER_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {tab === "orders" && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <Filter size={12} className="mr-1" />
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Providers Tab */}
        <TabsContent value="providers" className="mt-4">
          {providersQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map((n) => <div key={n} className="h-44 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No service providers found</p>
              {search || typeFilter !== "all"
                ? <p className="text-sm mt-1">Try adjusting your search or filter</p>
                : <p className="text-sm mt-1">Service providers will appear here once added by an admin</p>
              }
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProviders.map((p) => (
                <ProviderCard key={p.id} provider={p} onSelect={setSelectedProvider} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Work Orders Tab */}
        <TabsContent value="orders" className="mt-4">
          {workOrdersQuery.isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map((n) => <div key={n} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No work orders found</p>
              {statusFilter !== "all"
                ? <Button variant="link" className="text-sm mt-1" onClick={() => setStatusFilter("all")}>Clear filter</Button>
                : <p className="text-sm mt-1">Create a new work order to get started</p>
              }
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map((o) => (
                <WorkOrderRow key={o.id} order={o} providers={providers} onUpdate={() => workOrdersQuery.refetch()} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Provider Detail Dialog */}
      {selectedProvider && (
        <ProviderDetailDialog
          provider={selectedProvider}
          onClose={() => setSelectedProvider(null)}
          onRequestService={() => setTab("orders")}
        />
      )}
    </div>
  );
}

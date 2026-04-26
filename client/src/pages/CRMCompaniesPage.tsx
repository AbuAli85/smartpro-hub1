import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Building2, Plus, Search, ChevronRight, Edit2, Phone, Mail,
  Tag, Users, TrendingUp, FileText, CheckCircle2, Archive,
  AlertCircle, ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

// ─── Status metadata ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  lead:     { label: "Lead",     color: "bg-blue-100 text-blue-700 border-blue-200",    icon: TrendingUp },
  active:   { label: "Active",   color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-600 border-gray-200",    icon: AlertCircle },
  archived: { label: "Archived", color: "bg-red-100 text-red-600 border-red-200",       icon: Archive },
};

// ─── Create/Edit dialog ───────────────────────────────────────────────────────

type CompanyFormState = {
  name: string;
  industry: string;
  crNumber: string;
  billingAddress: string;
  status: "lead" | "active" | "inactive" | "archived";
  notes: string;
};

const BLANK_FORM: CompanyFormState = {
  name: "", industry: "", crNumber: "", billingAddress: "",
  status: "lead", notes: "",
};

function CompanyFormDialog({
  trigger,
  title,
  initial,
  onSubmit,
  isPending,
}: {
  trigger: React.ReactNode;
  title: string;
  initial?: Partial<CompanyFormState>;
  onSubmit: (data: CompanyFormState) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyFormState>({ ...BLANK_FORM, ...initial });

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Company name is required"); return; }
    onSubmit(form);
    setOpen(false);
    setForm({ ...BLANK_FORM, ...initial });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 size={16} className="text-[var(--smartpro-orange)]" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Al Aqsa Trading LLC" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Construction" />
            </div>
            <div className="space-y-1.5">
              <Label>CR Number</Label>
              <Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} placeholder="1234567" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Billing Address</Label>
            <Textarea value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} rows={2} placeholder="P.O. Box 123, Muscat, Oman" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button
            className="w-full bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
            disabled={!form.name.trim() || isPending}
            onClick={handleSubmit}
          >
            {isPending ? "Saving..." : "Save Company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Company card ─────────────────────────────────────────────────────────────

function CompanyCard({ cc, companyId, onRefresh }: {
  cc: {
    id: number; name: string; industry?: string | null; crNumber?: string | null;
    status: string; notes?: string | null;
  };
  companyId: number;
  onRefresh: () => void;
}) {
  const meta = STATUS_META[cc.status] ?? STATUS_META.lead;
  const Icon = meta.icon;

  const updateMutation = trpc.crm.clientCompanies.update.useMutation({
    onSuccess: () => { toast.success("Company updated"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-[var(--smartpro-orange)]" />
            </div>
            <div className="min-w-0">
              <Link href={`/crm/companies/${cc.id}`}>
                <p className="font-semibold text-sm text-slate-800 hover:text-[var(--smartpro-orange)] truncate cursor-pointer">
                  {cc.name}
                </p>
              </Link>
              {cc.industry && <p className="text-xs text-slate-500 truncate">{cc.industry}</p>}
              {cc.crNumber && <p className="text-xs text-slate-400">CR: {cc.crNumber}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={`text-xs border ${meta.color} flex items-center gap-1`}>
              <Icon size={10} />
              {meta.label}
            </Badge>
            <CompanyFormDialog
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Edit2 size={13} />
                </Button>
              }
              title="Edit Client Company"
              initial={{
                name: cc.name,
                industry: cc.industry ?? "",
                crNumber: cc.crNumber ?? "",
                status: cc.status as any,
                notes: cc.notes ?? "",
              }}
              onSubmit={(data) => updateMutation.mutate({ id: cc.id, companyId, ...data })}
              isPending={updateMutation.isPending}
            />
            <Link href={`/crm/companies/${cc.id}`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ChevronRight size={13} />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard summary cards ──────────────────────────────────────────────────

function SummaryCards({ companies }: { companies: Array<{ status: string }> }) {
  const total = companies.length;
  const active = companies.filter((c) => c.status === "active").length;
  const leads = companies.filter((c) => c.status === "lead").length;
  const inactive = companies.filter((c) => c.status === "inactive").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Total Clients", value: total, icon: Building2, color: "text-slate-600" },
        { label: "Active",        value: active, icon: CheckCircle2, color: "text-green-600" },
        { label: "Leads",         value: leads,  icon: TrendingUp,   color: "text-blue-600" },
        { label: "Inactive",      value: inactive, icon: AlertCircle, color: "text-gray-500" },
      ].map((s) => (
        <Card key={s.label} className="border-0 bg-white/80">
          <CardContent className="p-4 flex items-center gap-3">
            <s.icon size={20} className={s.color} />
            <div>
              <p className="text-lg font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CRMCompaniesPage() {
  const { t } = useTranslation("crm");
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: companies = [], refetch, isLoading } = trpc.crm.clientCompanies.list.useQuery(
    { companyId: activeCompanyId ?? undefined, search: search || undefined, status: statusFilter === "all" ? undefined : statusFilter as any },
    { enabled: activeCompanyId != null },
  );

  const createMutation = trpc.crm.clientCompanies.create.useMutation({
    onSuccess: () => { toast.success("Client company created"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft size={16} /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={20} className="text-[var(--smartpro-orange)]" />
            Client Companies
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage B2B client organisations</p>
        </div>
        <div className="ml-auto">
          <CompanyFormDialog
            trigger={
              <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white">
                <Plus size={16} /> Add Company
              </Button>
            }
            title="New Client Company"
            onSubmit={(data) => {
              if (activeCompanyId == null) { toast.error("No active workspace"); return; }
              createMutation.mutate({ companyId: activeCompanyId, ...data });
            }}
            isPending={createMutation.isPending}
          />
        </div>
      </div>

      {/* Summary */}
      {companies.length > 0 && <SummaryCards companies={companies} />}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9 text-sm"
            placeholder="Search by name or CR number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading client companies…</div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 font-medium">No client companies yet</p>
          <p className="text-slate-400 text-sm mt-1">Add your first client company to start the WaaS pipeline</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((cc) => (
            <CompanyCard
              key={cc.id}
              cc={cc}
              companyId={activeCompanyId!}
              onRefresh={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

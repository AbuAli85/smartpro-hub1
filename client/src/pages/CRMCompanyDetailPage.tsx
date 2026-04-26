import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  Building2, ArrowLeft, Users, TrendingUp, FileText, Truck,
  Receipt, Tag, Edit2, CheckCircle2, AlertCircle, Archive, Phone, Mail,
  Calendar, DollarSign, Send, ExternalLink, ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { toast } from "sonner";
import { fmtDate } from "@/lib/dateUtils";

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  lead:     { label: "Lead",     color: "bg-blue-100 text-blue-700 border-blue-200",    icon: TrendingUp },
  active:   { label: "Active",   color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-600 border-gray-200",    icon: AlertCircle },
  archived: { label: "Archived", color: "bg-red-100 text-red-600 border-red-200",       icon: Archive },
};

const DEAL_STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700", qualified: "bg-blue-100 text-blue-700",
  proposal: "bg-purple-100 text-purple-700", quotation_sent: "bg-indigo-100 text-indigo-700",
  negotiation: "bg-amber-100 text-amber-700", won: "bg-green-100 text-green-700",
  closed_won: "bg-green-100 text-green-700", lost: "bg-red-100 text-red-700",
  closed_lost: "bg-red-100 text-red-700",
};

const DEPLOYMENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700", cancelled: "bg-red-100 text-red-700",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", pending: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700", overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500", waived: "bg-slate-100 text-slate-500",
};

const QUOT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700", declined: "bg-red-100 text-red-700",
  expired: "bg-slate-100 text-slate-500",
};

export default function CRMCompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeCompanyId } = useActiveCompany();
  const { caps } = useMyCapabilities();
  const companyId = Number(id);
  const [tab, setTab] = useState("overview");
  const [inviting, setInviting] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = trpc.crm.clientCompanies.getById.useQuery(
    { id: companyId, companyId: activeCompanyId ?? undefined },
    { enabled: !isNaN(companyId) && activeCompanyId != null },
  );

  const inviteMutation = trpc.crm.clientCompanies.inviteToPortal.useMutation({
    onSuccess: () => {
      toast.info("Portal invitation recorded (email delivery pending).");
      setInviting(null);
    },
    onError: (e) => { toast.error(e.message); setInviting(null); },
  });

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <AlertCircle size={40} className="text-slate-300" />
        <p className="text-slate-500">Client company not found</p>
        <Link href="/crm/companies"><Button variant="outline" size="sm"><ArrowLeft size={14} className="mr-1" />Back</Button></Link>
      </div>
    );
  }

  const statusMeta = STATUS_META[data.status] ?? STATUS_META.lead;
  const StatusIcon = statusMeta.icon;

  const deployments = (data as any).deployments ?? [];
  const invoices = (data as any).invoices ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/crm/companies">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-0.5"><ArrowLeft size={16} /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800">{data.name}</h1>
            <Badge className={`text-xs border ${statusMeta.color} flex items-center gap-1`}>
              <StatusIcon size={10} />
              {statusMeta.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {data.industry && <span className="text-xs text-slate-500">{data.industry}</span>}
            {data.crNumber && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">CR: {data.crNumber}</span>}
          </div>
        </div>
        {caps.canManageCrm && (
          <Link href={`/crm/companies/${companyId}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5"><Edit2 size={13} />Edit</Button>
          </Link>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Contacts",    value: data.contacts.length,         icon: Users,       color: "text-blue-600" },
          { label: "Deals",       value: data.deals.length,            icon: TrendingUp,  color: "text-purple-600" },
          { label: "Quotations",  value: data.recentQuotations.length, icon: FileText,    color: "text-indigo-600" },
          { label: "Deployments", value: deployments.length,           icon: Truck,       color: "text-teal-600" },
        ].map((s) => (
          <Card key={s.label} className="border-0 bg-white/80">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon size={18} className={s.color} />
              <div>
                <p className="text-lg font-bold text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9 flex-wrap">
          <TabsTrigger value="overview"    className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="contacts"    className="text-xs">Contacts ({data.contacts.length})</TabsTrigger>
          <TabsTrigger value="deals"       className="text-xs">Deals ({data.deals.length})</TabsTrigger>
          <TabsTrigger value="quotations"  className="text-xs">Quotations ({data.recentQuotations.length})</TabsTrigger>
          <TabsTrigger value="deployments" className="text-xs">Deployments ({deployments.length})</TabsTrigger>
          {caps.canViewClientFinancials && (
            <TabsTrigger value="invoices"  className="text-xs">Invoices ({invoices.length})</TabsTrigger>
          )}
          <TabsTrigger value="tasks"       className="text-xs">Tasks</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          {data.billingAddress && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Billing Address</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600 whitespace-pre-wrap">{data.billingAddress}</CardContent>
            </Card>
          )}
          {data.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-600 whitespace-pre-wrap">{data.notes}</CardContent>
            </Card>
          )}
          {!data.billingAddress && !data.notes && (
            <div className="text-center py-12 text-slate-400 text-sm">No additional details recorded.</div>
          )}
        </TabsContent>

        {/* ── Contacts ──────────────────────────────────────────────────────── */}
        <TabsContent value="contacts" className="space-y-3">
          {data.contacts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No contacts linked yet. Create a contact from the CRM and assign this company.
            </div>
          ) : (
            data.contacts.map((c) => (
              <Card key={c.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center text-xs font-semibold text-orange-600">
                    {(c.firstName[0] ?? "") + (c.lastName[0] ?? "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800">{c.firstName} {c.lastName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.position && <span className="text-xs text-slate-500">{c.position}</span>}
                      {c.roleType && (
                        <Badge variant="outline" className="text-xs capitalize">{c.roleType.replace("_", " ")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.email && <a href={`mailto:${c.email}`}><Button variant="ghost" size="icon" className="h-7 w-7"><Mail size={12} /></Button></a>}
                    {c.phone && <a href={`tel:${c.phone}`}><Button variant="ghost" size="icon" className="h-7 w-7"><Phone size={12} /></Button></a>}
                    {caps.canInviteClientPortalUser && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1 ml-1"
                        disabled={inviting === c.id}
                        onClick={() => {
                          setInviting(c.id);
                          inviteMutation.mutate({
                            companyId: activeCompanyId ?? undefined,
                            clientCompanyId: companyId,
                            contactId: c.id,
                          });
                        }}
                      >
                        <Send size={11} />
                        {inviting === c.id ? "Sending…" : "Invite to Portal"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Deals ─────────────────────────────────────────────────────────── */}
        <TabsContent value="deals" className="space-y-3">
          {data.deals.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No deals linked yet. Create a deal from the CRM pipeline and assign this company.
            </div>
          ) : (
            data.deals.map((d) => (
              <Card key={d.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <TrendingUp size={16} className="text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">{d.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge className={`text-xs ${DEAL_STAGE_COLORS[d.stage] ?? "bg-gray-100 text-gray-700"} border-0`}>
                        {d.stage.replace(/_/g, " ")}
                      </Badge>
                      {(d as any).serviceType && (
                        <span className="text-xs text-slate-400 capitalize">{(d as any).serviceType.replace("_", " ")}</span>
                      )}
                      {(d as any).probability != null && (
                        <span className="text-xs text-slate-400">{(d as any).probability}%</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {d.value && (
                      <p className="text-sm font-semibold text-slate-700">
                        OMR {Number(d.value).toLocaleString("en-OM", { minimumFractionDigits: 3 })}
                      </p>
                    )}
                    <Link href={`/crm?deal=${d.id}`} className="text-xs text-[var(--smartpro-orange)] hover:underline">
                      Open
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Quotations ────────────────────────────────────────────────────── */}
        <TabsContent value="quotations" className="space-y-3">
          {data.recentQuotations.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No quotations linked to this company yet.
            </div>
          ) : (
            data.recentQuotations.map((q) => (
              <Card key={q.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <FileText size={16} className="text-indigo-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 font-mono">{q.referenceNumber}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`text-xs ${QUOT_STATUS_COLORS[q.status] ?? ""} border-0`}>{q.status}</Badge>
                      <span className="text-xs text-slate-400">{fmtDate(q.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-700">
                      OMR {Number(q.totalOmr).toLocaleString("en-OM", { minimumFractionDigits: 3 })}
                    </p>
                    <Link href={`/quotations?id=${q.id}`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink size={12} /></Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Deployments ───────────────────────────────────────────────────── */}
        <TabsContent value="deployments" className="space-y-3">
          {deployments.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No deployments linked to this company yet.
              <p className="mt-1 text-xs">Convert an accepted quotation to create a deployment.</p>
            </div>
          ) : (
            deployments.map((dep: any) => (
              <Card key={dep.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-center gap-3">
                  <Truck size={16} className="text-teal-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800">Deployment #{dep.id}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge className={`text-xs ${DEPLOYMENT_STATUS_COLORS[dep.status] ?? "bg-gray-100 text-gray-600"} border-0`}>
                        {dep.status}
                      </Badge>
                      {dep.effectiveFrom && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar size={10} />{dep.effectiveFrom} → {dep.effectiveTo ?? "—"}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/workforce/deployments?id=${dep.id}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"><ExternalLink size={12} /></Button>
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Invoices (finance-gated) ───────────────────────────────────────── */}
        {caps.canViewClientFinancials && (
          <TabsContent value="invoices" className="space-y-3">
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No invoices linked to this company yet.
              </div>
            ) : (
              invoices.map((inv: any) => (
                <Card key={inv.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Receipt size={16} className="text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 font-mono">{inv.invoiceNumber ?? `INV-${inv.id}`}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-xs ${INVOICE_STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-600"} border-0`}>
                          {inv.status}
                        </Badge>
                        {inv.periodYear && <span className="text-xs text-slate-400">{inv.periodYear}/{String(inv.periodMonth).padStart(2, "0")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700">
                          OMR {Number(inv.totalOmr ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3 })}
                        </p>
                        {inv.balanceOmr && Number(inv.balanceOmr) > 0 && (
                          <p className="text-xs text-red-600">Due: OMR {Number(inv.balanceOmr).toLocaleString("en-OM", { minimumFractionDigits: 3 })}</p>
                        )}
                      </div>
                      <Link href={`/billing/invoices?id=${inv.id}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink size={12} /></Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}

        {/* ── Tasks ─────────────────────────────────────────────────────────── */}
        <TabsContent value="tasks" className="space-y-3">
          <div className="text-center py-8 text-slate-400 text-sm space-y-3">
            <ListChecks size={32} className="mx-auto text-slate-300" />
            <p>Manage tasks for this client company.</p>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/tasks?clientCompanyId=${companyId}`}>
                <ListChecks size={13} className="mr-1.5" />
                Open Task List
              </Link>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

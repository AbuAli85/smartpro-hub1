import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Users, Plus, Search, Phone, Mail, Building2, TrendingUp, DollarSign,
  ChevronRight, X, MessageSquare, Calendar, Target, Star,
  CheckCircle2, Handshake, Send, FileText, AlertTriangle, Truck, ListChecks,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { DateInput } from "@/components/ui/date-input";

const DEAL_STAGE_META: Record<string, { label: string; color: string; icon: any }> = {
  lead:        { label: "Lead",         color: "bg-gray-100 text-gray-700 border-gray-200",       icon: Target },
  qualified:   { label: "Qualified",    color: "bg-blue-100 text-blue-700 border-blue-200",       icon: CheckCircle2 },
  proposal:    { label: "Proposal",     color: "bg-purple-100 text-purple-700 border-purple-200", icon: Send },
  negotiation: { label: "Negotiation",  color: "bg-amber-100 text-amber-700 border-amber-200",    icon: Handshake },
  closed_won:  { label: "Closed Won",   color: "bg-green-100 text-green-700 border-green-200",    icon: Star },
  closed_lost: { label: "Closed Lost",  color: "bg-red-100 text-red-700 border-red-200",          icon: X },
};

const CONTACT_STATUS_META: Record<string, { label: string; color: string }> = {
  lead:     { label: "Lead",     color: "bg-blue-100 text-blue-700 border-blue-200" },
  prospect: { label: "Prospect", color: "bg-purple-100 text-purple-700 border-purple-200" },
  customer: { label: "Customer", color: "bg-green-100 text-green-700 border-green-200" },
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

function getInitials(first?: string | null, last?: string | null) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || "?";
}

function NewContactDialog({ onSuccess, companyId }: { onSuccess: () => void; companyId: number | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", position: "", status: "lead" as const, notes: "" });
  const createMutation = trpc.crm.createContact.useMutation({
    onSuccess: () => { toast.success("Contact added"); setOpen(false); setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", position: "", status: "lead", notes: "" }); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"><Plus size={16} /> Add Contact</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Users size={16} className="text-[var(--smartpro-orange)]" /> Add New Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <Button className="w-full bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" disabled={!form.firstName || createMutation.isPending || companyId == null}
            onClick={() => companyId != null && createMutation.mutate({ companyId, firstName: form.firstName, lastName: form.lastName || "", email: form.email || undefined, phone: form.phone || undefined, company: form.company || undefined, position: form.position || undefined, status: form.status as any, notes: form.notes || undefined })}>
            {createMutation.isPending ? "Adding..." : "Add Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDealDialog({ onSuccess, companyId }: { onSuccess: () => void; companyId: number | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", value: "", currency: "OMR", stage: "lead" as const, probability: "50", expectedCloseDate: "", notes: "" });
  const createMutation = trpc.crm.createDeal.useMutation({
    onSuccess: () => { toast.success("Deal created"); setOpen(false); setForm({ title: "", value: "", currency: "OMR", stage: "lead", probability: "50", expectedCloseDate: "", notes: "" }); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2"><TrendingUp size={16} /> New Deal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><TrendingUp size={16} className="text-[var(--smartpro-orange)]" /> New Deal</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5"><Label>Deal Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. PRO Services for Muscat Trading LLC" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Value</Label><Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0.000" /></div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="OMR">OMR</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="AED">AED</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="negotiation">Negotiation</SelectItem>
                  <SelectItem value="closed_won">Closed Won</SelectItem>
                  <SelectItem value="closed_lost">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Win Probability (%)</Label><Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Expected Close Date</Label><DateInput value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          <Button className="w-full" disabled={!form.title || createMutation.isPending || companyId == null}
            onClick={() => companyId != null && createMutation.mutate({ companyId, ...form, value: form.value ? Number(form.value) : undefined, probability: form.probability ? Number(form.probability) : undefined })}>
            {createMutation.isPending ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactDetailPanel({ contactId, onClose, companyId }: { contactId: number; onClose: () => void; companyId: number | null }) {
  const { data: contact360, isLoading: loading360, refetch: refetch360 } = trpc.crm.getContact360.useQuery(
    { contactId, companyId: companyId ?? undefined },
    { enabled: companyId != null },
  );
  const { data: comms, refetch: refetchComms } = trpc.crm.listCommunications.useQuery(
    { contactId, companyId: companyId ?? undefined },
    { enabled: companyId != null },
  );
  const [commForm, setCommForm] = useState({ type: "call" as const, subject: "", content: "", direction: "outbound" as const });
  const [showCommForm, setShowCommForm] = useState(false);

  const createComm = trpc.crm.createCommunication.useMutation({
    onSuccess: () => {
      toast.success("Communication logged");
      setShowCommForm(false);
      setCommForm({ type: "call", subject: "", content: "", direction: "outbound" });
      void refetch360();
      refetchComms();
    },
    onError: (e) => toast.error(e.message),
  });

  const COMM_ICONS: Record<string, any> = { call: Phone, email: Mail, meeting: Users, note: MessageSquare };
  const COMM_COLORS: Record<string, string> = {
    call: "bg-blue-100 text-blue-600",
    email: "bg-green-100 text-green-600",
    meeting: "bg-purple-100 text-purple-600",
    note: "bg-amber-100 text-amber-600",
  };

  const contact = contact360?.contact;
  const stageLabel = contact?.status ? (CONTACT_STATUS_META[contact.status]?.label ?? contact.status) : "";

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9 shrink-0">
              <AvatarFallback className="bg-[var(--smartpro-orange)]/15 text-[var(--smartpro-orange)] text-xs font-bold">
                {getInitials(contact?.firstName, contact?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">
                {loading360 ? "…" : `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim() || "Contact"}
              </p>
              {contact?.status && (
                <Badge variant="outline" className={"text-[10px] mt-0.5 " + (CONTACT_STATUS_META[contact.status]?.color ?? "")}>
                  {stageLabel}
                </Badge>
              )}
            </div>
          </div>
          {contact?.company && <p className="text-xs text-muted-foreground mt-2 truncate flex items-center gap-1"><Building2 size={12} /> {contact.company}</p>}
          {(contact?.email || contact?.phone) && (
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              {contact?.email && <div className="flex items-center gap-1.5 truncate"><Mail size={12} className="shrink-0" /> {contact.email}</div>}
              {contact?.phone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {contact.phone}</div>}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close contact panel"><X size={16} aria-hidden="true" /></Button>
      </div>

      {!loading360 && contact360 && (
        <div className="px-4 py-3 border-b space-y-3 max-h-[46vh] overflow-y-auto">
          {contact360.accountHealth && (
            <div className="rounded-lg border border-border/80 bg-muted/25 px-2.5 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Account health</p>
                <Badge
                  variant="secondary"
                  className={
                    contact360.accountHealth.tier === "urgent"
                      ? "text-[9px] bg-red-100 text-red-900 border-red-200"
                      : contact360.accountHealth.tier === "at_risk"
                        ? "text-[9px] bg-orange-100 text-orange-900 border-orange-200"
                        : contact360.accountHealth.tier === "watch"
                          ? "text-[9px] bg-amber-100 text-amber-900 border-amber-200"
                          : "text-[9px] bg-emerald-100 text-emerald-900 border-emerald-200"
                  }
                >
                  {contact360.accountHealth.tier.replace("_", " ")}
                </Badge>
              </div>
              {contact360.accountHealth.lastActivityAt && (
                <p className="text-[10px] text-muted-foreground">
                  Last activity: {fmtDateTimeShort(new Date(contact360.accountHealth.lastActivityAt))}
                </p>
              )}
              {contact360.accountHealth.renewalWeakFollowUp && (
                <p className="text-[10px] text-amber-800 dark:text-amber-200 flex items-start gap-1">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  Renewal window — weak follow-up (no CRM touch 21+ days while a contract ends soon).
                </p>
              )}
              {contact360.accountHealth.reasons.length > 0 && (
                <ul className="text-[10px] text-muted-foreground space-y-0.5 list-disc pl-3.5">
                  {contact360.accountHealth.reasons.slice(0, 5).map((r, i) => (
                    <li key={i} className="leading-snug">{r}</li>
                  ))}
                </ul>
              )}
              {contact360.accountHealth.nextActions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {contact360.accountHealth.nextActions.map((a) => (
                    <Button key={a.href} variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                      <Link href={a.href}>{a.label}</Link>
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground leading-snug border-t border-border/60 pt-1.5">
                {contact360.accountHealth.tenantCollectionsScopeNote && (
                  <>{contact360.accountHealth.tenantCollectionsScopeNote} </>
                )}
                Deterministic rule-based tiers — not a predictive score.
              </p>
            </div>
          )}
          {contact360.resolution && (
            <div className="rounded-lg border-2 border-[var(--smartpro-orange)]/40 bg-[var(--smartpro-orange)]/5 px-2.5 py-2 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <ListChecks size={12} /> Next action
              </p>
              <Button size="sm" className="w-full h-8 text-xs bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" asChild>
                <Link href={contact360.resolution.primary.href} title={contact360.resolution.primary.basis}>
                  {contact360.resolution.primary.label}
                </Link>
              </Button>
              <p className="text-[10px] text-muted-foreground leading-snug">{contact360.resolution.primary.basis}</p>
              {contact360.resolution.alternatives.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contact360.resolution.alternatives.map((a) => (
                    <Button key={a.label + a.href} variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                      <Link href={a.href} title={a.basis}>
                        {a.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground border-t border-border/60 pt-1.5">{contact360.resolution.basis}</p>
              {contact360.resolution.workflow && (
                <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 space-y-1 text-[9px]">
                  <div className="flex flex-wrap items-center gap-1.5 justify-between">
                    <p className="font-semibold text-foreground">Follow-through</p>
                    {contact360.resolution.workflow.review && (
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground text-right">
                        {contact360.resolution.workflow.review.workflowScope === "crm_contact" ? "CRM contact" : "Workspace billing"}
                        {" · "}
                        <span className="capitalize text-foreground">{contact360.resolution.workflow.review.reviewBucket.replace(/_/g, " ")}</span>
                      </span>
                    )}
                  </div>
                  {contact360.resolution.workflow.review && (
                    <p className="text-[8px] text-muted-foreground leading-snug">{contact360.resolution.workflow.review.reviewBasis}</p>
                  )}
                  <p className="text-muted-foreground leading-snug">
                    {contact360.resolution.workflow.accountableOwnerLabel ? (
                      <>Accountable: {contact360.resolution.workflow.accountableOwnerLabel}</>
                    ) : (
                      <span className="text-amber-800 dark:text-amber-200">No CRM owner on contact</span>
                    )}
                    {" · "}
                    {contact360.resolution.workflow.hasOpenEmployeeTask
                      ? `Open tagged HR task (${contact360.resolution.workflow.matchingTaskIds.length})`
                      : "No open HR task with resolution tag"}
                    {contact360.resolution.workflow.renewalInterventionDueAt && (
                      <>
                        {" · "}
                        Suggested intervention window ends {contact360.resolution.workflow.renewalInterventionDueAt}
                      </>
                    )}
                  </p>
                  {contact360.resolution.workflow.accountabilityGap !== "none" && (
                    <p className="text-amber-900 dark:text-amber-200 font-medium">
                      Gap: {contact360.resolution.workflow.accountabilityGap.replace("_", " ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Button variant="default" size="sm" className="h-6 text-[10px] px-2" asChild>
                      <Link href={contact360.resolution.workflow.followUpCreateHref} title="Prefill title, tag, due date, assignee">
                        Create tagged task
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                      <Link href={contact360.resolution.workflow.tasksHref}>Task list</Link>
                    </Button>
                    <span className="font-mono text-[8px] text-muted-foreground break-all self-center max-w-full">
                      {contact360.resolution.workflow.taskTagConvention}
                    </span>
                  </div>
                  {contact360.resolution.workflowTagBasis && (
                    <p className="text-[8px] text-muted-foreground leading-snug border-t border-border/50 pt-1">
                      {contact360.resolution.workflowTagBasis}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {contact360.revenueRealization && (
            <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/30 dark:bg-emerald-950/15 px-2.5 py-2 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <DollarSign size={12} /> Revenue realization
              </p>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <p>
                  Workspace: {contact360.revenueRealization.workspaceSnapshot.completedProWithFeesLast90dCount} PRO completions + fees (90d, company-wide) ·{" "}
                  {contact360.revenueRealization.workspaceSnapshot.proBillingPendingCount} billing cycles pending ·{" "}
                  {contact360.revenueRealization.workspaceSnapshot.proBillingOverdueCount} overdue (OMR{" "}
                  {contact360.revenueRealization.workspaceSnapshot.proBillingOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })})
                </p>
                {contact360.revenueRealization.workspaceSnapshot.billingFollowThroughPressure && (
                  <p className="text-amber-900 dark:text-amber-200 font-medium">
                    Billing follow-through pressure — fee-bearing completions while cycles are unsettled (derived).
                  </p>
                )}
                {contact360.revenueRealization.accountMonetizationHint && (
                  <p className="text-foreground">{contact360.revenueRealization.accountMonetizationHint}</p>
                )}
              </div>
              {contact360.revenueRealization.nextRecommendedActions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {contact360.revenueRealization.nextRecommendedActions.map((a) => (
                    <Button key={a.href + a.label} variant="outline" size="sm" className="h-6 text-[10px] px-2" asChild>
                      <Link href={a.href} title={a.basis}>
                        {a.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground leading-snug border-t border-border/60 pt-1.5">
                {contact360.revenueRealization.caveat}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Commercial lifecycle</p>
            <Button variant="outline" size="sm" className="h-7 text-[10px] shrink-0" asChild>
              <Link href={`/quotations?contact=${contactId}&new=1`}>New quote</Link>
            </Button>
          </div>
          {contact360.dealsWithLifecycle && contact360.dealsWithLifecycle.length > 0 && (
            <div className="space-y-1.5">
              {contact360.dealsWithLifecycle.map(({ deal: d, lifecycle: life }) => (
                <div key={d.id} className="rounded-lg border bg-muted/20 px-2 py-1.5 text-xs">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-medium line-clamp-2">{d.title}</span>
                    <Badge variant="secondary" className="text-[9px] shrink-0 max-w-[120px] truncate" title={life.detail}>
                      {life.label}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{life.detail}</p>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Timeline (recent first)</p>
            {contact360.lifecycleThread && contact360.lifecycleThread.length > 0 ? (
              <ol className="relative border-l border-border/80 ml-1.5 space-y-2 pl-3">
                {contact360.lifecycleThread.slice(0, 12).map((row) => (
                  <li key={`${row.kind}-${row.entityId}`} className="text-xs">
                    <Link href={row.href} className="block rounded-md -ml-1 pl-1 py-0.5 hover:bg-muted/60">
                      <span className="text-[10px] uppercase text-muted-foreground">{row.kind}</span>
                      <span className="font-medium block truncate">{row.title}</span>
                      <span className="text-[10px] text-muted-foreground">{row.subtitle}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">No linked deals, quotes, or contracts yet.</p>
            )}
          </div>

          {(contact360.contactPostSale?.stalledServiceContracts?.length ?? 0) > 0 ||
          (contact360.workspaceCollections?.proBillingOverdueCount ?? 0) > 0 ||
          (contact360.workspaceCollections?.subscriptionOverdueCount ?? 0) > 0 ||
          (contact360.companyDeliverySnapshot?.openProServicesCount ?? 0) > 0 ? (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 px-2 py-2 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Truck size={12} /> Operations & collections
              </p>
              {(contact360.companyDeliverySnapshot?.openProServicesCount ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground border-b border-amber-200/60 pb-2">
                  Company-wide open PRO jobs:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {contact360.companyDeliverySnapshot!.openProServicesCount}
                  </span>{" "}
                  <Link href="/pro" className="text-[var(--smartpro-orange)] font-medium hover:underline">
                    Open PRO queue
                  </Link>
                  <span className="block text-[9px] mt-1 opacity-90">{contact360.companyDeliverySnapshot?.basis}</span>
                </p>
              )}
              {(contact360.contactPostSale?.stalledServiceContracts?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-amber-900 dark:text-amber-200 flex items-start gap-1">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    Signed service agreement — weak delivery signals (derived)
                  </p>
                  <ul className="space-y-0.5 pl-1">
                    {contact360.contactPostSale!.stalledServiceContracts.map((sc) => (
                      <li key={sc.id}>
                        <Link
                          href={`/contracts?id=${sc.id}`}
                          className="text-xs font-medium text-foreground hover:underline line-clamp-2"
                        >
                          {sc.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[9px] text-muted-foreground leading-snug">{contact360.contactPostSale?.stalledBasis}</p>
                </div>
              )}
              {((contact360.workspaceCollections?.proBillingOverdueCount ?? 0) > 0 ||
                (contact360.workspaceCollections?.subscriptionOverdueCount ?? 0) > 0) && (
                <div className="text-xs space-y-1 border-t border-amber-200/60 pt-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Workspace collections (tenant-wide)</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">PRO/officer overdue</span>
                    <span className={contact360.workspaceCollections!.proBillingOverdueOmr > 0 ? "text-red-700 font-semibold" : ""}>
                      OMR {contact360.workspaceCollections!.proBillingOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ({contact360.workspaceCollections!.proBillingOverdueCount})
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Subscription overdue</span>
                    <span className={contact360.workspaceCollections!.subscriptionOverdueOmr > 0 ? "text-red-700 font-semibold" : ""}>
                      OMR {contact360.workspaceCollections!.subscriptionOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ({contact360.workspaceCollections!.subscriptionOverdueCount})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href="/client/invoices" className="text-[10px] text-[var(--smartpro-orange)] font-medium hover:underline">
                      Client billing →
                    </Link>
                    <Link href="/pro" className="text-[10px] text-[var(--smartpro-orange)] font-medium hover:underline">
                      PRO jobs →
                    </Link>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{contact360.workspaceCollections?.scopeNote}</p>
                </div>
              )}
              {(contact360.billingReviewHint?.completedProWithFeesLast90dCount ?? 0) > 0 && (
                <div className="text-xs border-t border-amber-200/60 pt-2 space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground">Billing follow-up hint (90d)</p>
                  <p>
                    <span className="font-semibold tabular-nums">{contact360.billingReviewHint!.completedProWithFeesLast90dCount}</span>
                    <span className="text-muted-foreground"> completed PRO jobs with fees (company-wide)</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-snug">{contact360.billingReviewHint?.caveat}</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20">
        <MessageSquare size={14} className="text-[var(--smartpro-orange)] shrink-0" />
        <span className="font-semibold text-xs">Communication log</span>
      </div>
      <div className="p-4 border-b">
        <Button size="sm" className="w-full gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" onClick={() => setShowCommForm(!showCommForm)}>
          <Plus size={14} /> Log Communication
        </Button>
        {showCommForm && (
          <div className="mt-3 space-y-3 p-3 bg-muted/40 rounded-xl">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={commForm.type} onValueChange={(v) => setCommForm({ ...commForm, type: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <Select value={commForm.direction} onValueChange={(v) => setCommForm({ ...commForm, direction: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subject *</Label>
              <Input className="h-8 text-xs" value={commForm.subject} onChange={(e) => setCommForm({ ...commForm, subject: e.target.value })} placeholder="e.g. Follow-up on proposal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-xs" rows={2} value={commForm.content} onChange={(e) => setCommForm({ ...commForm, content: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 text-xs" disabled={!commForm.subject || createComm.isPending}
                onClick={() => companyId != null && createComm.mutate({ companyId, contactId, type: commForm.type, subject: commForm.subject || undefined, content: commForm.content || undefined, direction: commForm.direction })}>
                {createComm.isPending ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCommForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!comms?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No communications yet</p>
            <p className="text-xs mt-1">Log your first call, email, or meeting above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comms.map((comm) => {
              const Icon = COMM_ICONS[comm.type ?? "note"] ?? MessageSquare;
              const colorClass = COMM_COLORS[comm.type ?? "note"] ?? "bg-gray-100 text-gray-600";
              return (
                <div key={comm.id} className="flex gap-3">
                  <div className={"w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 " + colorClass}>
                    <Icon size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{comm.subject}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(comm.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge className={"text-[10px] " + colorClass} variant="outline">{comm.type}</Badge>
                      {comm.direction && <Badge className="text-[10px] bg-muted text-muted-foreground" variant="outline">{comm.direction}</Badge>}
                    </div>
                    {(comm as any).content && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{(comm as any).content}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CRMPage() {
  const { t } = useTranslation("common");
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const { data: contacts, refetch: refetchContacts } = trpc.crm.listContacts.useQuery(
    {
      status: typeFilter !== "all" ? typeFilter : undefined,
      companyId: activeCompanyId ?? undefined,
    },
    { enabled: activeCompanyId != null },
  );
  const { data: deals, refetch: refetchDeals } = trpc.crm.listDealsWithLifecycle.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: pipeline } = trpc.crm.pipelineStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );

  const updateDealMutation = trpc.crm.updateDeal.useMutation({
    onSuccess: () => { toast.success("Deal updated"); refetchDeals(); },
    onError: (e) => toast.error(e.message),
  });
  const updateContactMutation = trpc.crm.updateContact.useMutation({
    onSuccess: () => { toast.success("Contact updated"); refetchContacts(); },
    onError: (e) => toast.error(e.message),
  });

  const filteredContacts = contacts?.filter((c) =>
    !search ||
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.company ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.position ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalPipeline = deals?.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0) ?? 0;
  const wonDeals = deals?.filter((d) => d.stage === "closed_won") ?? [];
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
  const winRate = deals?.length ? Math.round((wonDeals.length / deals.length) * 100) : 0;

  const kpiItems = [
    { label: "Total Contacts",  value: contacts?.length ?? 0,                    color: "bg-blue-500",                    icon: Users },
    { label: "Active Leads",    value: contacts?.filter((c) => c.status === "lead").length ?? 0, color: "bg-purple-500", icon: Target },
    { label: "Open Deals",      value: deals?.filter((d) => !["closed_won","closed_lost"].includes(d.stage ?? "")).length ?? 0, color: "bg-amber-500", icon: TrendingUp },
    { label: "Pipeline (OMR)",  value: "OMR " + totalPipeline.toLocaleString(),   color: "bg-[var(--smartpro-orange)]",    icon: DollarSign },
    { label: "Won Value (OMR)", value: "OMR " + wonValue.toLocaleString(),        color: "bg-emerald-500",                 icon: Star },
    { label: "Win Rate",        value: winRate + "%",                             color: "bg-teal-500",                    icon: CheckCircle2 },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      <div className={"flex-1 p-6 space-y-6 overflow-y-auto min-w-0"}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">CRM & Sales Pipeline</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Contacts · Deals · Pipeline · Communication log</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {["OMR Pipeline", "GCC Contacts", "B2B Deals", "Communication Log"].map((tag, i) => (
                <span key={tag} className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border " + (i === 0 ? "bg-orange-50 text-orange-700 border-orange-200" : i === 1 ? "bg-blue-50 text-blue-700 border-blue-200" : i === 2 ? "bg-green-50 text-green-700 border-green-200" : "bg-purple-50 text-purple-700 border-purple-200")}>{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <NewDealDialog onSuccess={refetchDeals} companyId={activeCompanyId} />
            <NewContactDialog onSuccess={refetchContacts} companyId={activeCompanyId} />
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiItems.map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-card border rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className={"w-7 h-7 rounded-lg " + color + " flex items-center justify-center mb-2"}><Icon size={14} className="text-white" /></div>
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="contacts">
          <TabsList>
            <TabsTrigger value="contacts">
              Contacts
              {contacts && <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{contacts.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="deals">
              Deals
              {deals && <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{deals.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline Kanban</TabsTrigger>
          </TabsList>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by name, company, email, position..." className="pl-9" aria-label="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredContacts?.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-12 text-center">
                  <Users size={40} className="mx-auto text-muted-foreground mb-3 opacity-30" />
                  <h3 className="font-semibold">No contacts found</h3>
                  <p className="text-sm text-muted-foreground">Add your first contact to start building your pipeline.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Contact</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Company</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Contact Info</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Move to</th>
                        <th scope="col" className="px-4 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts?.map((contact) => {
                        const statusMeta = CONTACT_STATUS_META[contact.status ?? "lead"] ?? { label: contact.status, color: "bg-gray-100 text-gray-600 border-gray-200" };
                        const isSelected = selectedContactId === contact.id;
                        return (
                          <tr key={contact.id}
                            className={"border-b hover:bg-muted/20 transition-colors cursor-pointer " + (isSelected ? "bg-orange-50" : "")}
                            onClick={() => setSelectedContactId(isSelected ? null : contact.id)}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8 shrink-0">
                                  <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-bold">{getInitials(contact.firstName, contact.lastName)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-sm">{contact.firstName} {contact.lastName}</p>
                                  {contact.position && <p className="text-xs text-muted-foreground">{contact.position}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">{contact.company ? <span className="flex items-center gap-1"><Building2 size={11} className="text-muted-foreground" />{contact.company}</span> : "—"}</td>
                            <td className="px-4 py-3 text-xs">
                              <div className="space-y-0.5">
                                {contact.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail size={10} /><a href={"mailto:" + contact.email} className="hover:text-[var(--smartpro-orange)] hover:underline" onClick={(e) => e.stopPropagation()}>{contact.email}</a></div>}
                                {contact.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone size={10} />{contact.phone}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-3"><Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge></td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <Select value={contact.status ?? "lead"} onValueChange={(v) => updateContactMutation.mutate({ id: contact.id, status: v as any })}>
                                <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="lead">Lead</SelectItem>
                                  <SelectItem value="prospect">Prospect</SelectItem>
                                  <SelectItem value="customer">Customer</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                {activeCompanyId != null && (
                                  <Link
                                    href={`/quotations?contact=${contact.id}&new=1`}
                                    className="text-[10px] font-semibold text-[var(--smartpro-orange)] hover:underline flex items-center gap-0.5"
                                  >
                                    <FileText size={10} />
                                    Quote
                                  </Link>
                                )}
                                <ChevronRight size={14} className={"text-muted-foreground transition-transform shrink-0 " + (isSelected ? "rotate-90 text-[var(--smartpro-orange)]" : "")} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Deals Tab */}
          <TabsContent value="deals" className="space-y-4 mt-4">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Deal</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Value</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Stage</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Win %</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Close Date</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Lifecycle</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Move to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals?.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">
                        <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                        <p>No deals yet</p><p className="text-xs mt-1">Create your first deal using the button above</p>
                      </td></tr>
                    )}
                    {deals?.map((deal) => {
                      const stageMeta = DEAL_STAGE_META[deal.stage ?? "lead"] ?? { label: deal.stage, color: "bg-gray-100 text-gray-700 border-gray-200", icon: Target };
                      return (
                        <tr key={deal.id} className="border-b hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium text-sm">{deal.title}</td>
                          <td className="px-4 py-3 text-xs font-semibold">{deal.value ? `${deal.currency ?? "OMR"} ${Number(deal.value).toLocaleString()}` : "—"}</td>
                          <td className="px-4 py-3"><Badge className={"text-xs " + stageMeta.color} variant="outline">{stageMeta.label}</Badge></td>
                          <td className="px-4 py-3 text-xs">{deal.probability ? deal.probability + "%" : "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{deal.expectedCloseDate ? fmtDate(deal.expectedCloseDate) : "—"}</td>
                          <td className="px-4 py-3 max-w-[140px]">
                            <span className="text-[10px] leading-tight text-muted-foreground line-clamp-2" title={deal.lifecycle?.detail}>
                              {deal.lifecycle?.label ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Select value={deal.stage ?? "lead"} onValueChange={(v) => updateDealMutation.mutate({ id: deal.id, stage: v as any })}>
                              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lead">Lead</SelectItem>
                                <SelectItem value="qualified">Qualified</SelectItem>
                                <SelectItem value="proposal">Proposal</SelectItem>
                                <SelectItem value="negotiation">Negotiation</SelectItem>
                                <SelectItem value="closed_won">Closed Won</SelectItem>
                                <SelectItem value="closed_lost">Closed Lost</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Pipeline Kanban Tab */}
          <TabsContent value="pipeline" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"].map((stage) => {
                const stageMeta = DEAL_STAGE_META[stage];
                const stageDeals = deals?.filter((d) => d.stage === stage) ?? [];
                const stageValue = stageDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
                const Icon = stageMeta.icon;
                return (
                  <div key={stage} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className={"flex items-center gap-1.5 text-xs font-semibold"}>
                        <Icon size={11} />
                        {stageMeta.label}
                      </div>
                      <span className={"text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center " + stageMeta.color}>{stageDeals.length}</span>
                    </div>
                    {stageValue > 0 && <p className="text-[10px] text-muted-foreground font-medium">OMR {stageValue.toLocaleString()}</p>}
                    <div className="space-y-2">
                      {stageDeals.map((deal) => (
                        <Card key={deal.id} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-2.5">
                            <p className="text-xs font-medium truncate">{deal.title}</p>
                            {deal.lifecycle?.label && (
                              <p className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5" title={deal.lifecycle?.detail}>
                                {deal.lifecycle.label}
                              </p>
                            )}
                            {deal.value && <p className="text-xs text-muted-foreground mt-0.5">{deal.currency ?? "OMR"} {Number(deal.value).toLocaleString()}</p>}
                            {deal.expectedCloseDate && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                <Calendar size={9} />
                                {fmtDate(deal.expectedCloseDate)}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      {stageDeals.length === 0 && (
                        <div className="h-16 rounded-lg border-2 border-dashed border-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Empty</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Contact Detail Side Panel */}
      {selectedContactId && (
        <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
          <ContactDetailPanel
            contactId={selectedContactId}
            onClose={() => setSelectedContactId(null)}
            companyId={activeCompanyId}
          />
        </div>
      )}
    </div>
  );
}

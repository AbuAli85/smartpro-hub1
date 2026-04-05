import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Users, Plus, Search, Phone, Mail, Building2, TrendingUp, DollarSign,
  ChevronRight, X, MessageSquare, Calendar, Target, Star,
  CheckCircle2, Handshake, Send,
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

function NewContactDialog({ onSuccess }: { onSuccess: () => void }) {
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
          <Button className="w-full bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" disabled={!form.firstName || createMutation.isPending}
            onClick={() => createMutation.mutate({ firstName: form.firstName, lastName: form.lastName || "", email: form.email || undefined, phone: form.phone || undefined, company: form.company || undefined, position: form.position || undefined, status: form.status as any, notes: form.notes || undefined })}>
            {createMutation.isPending ? "Adding..." : "Add Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDealDialog({ onSuccess }: { onSuccess: () => void }) {
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
          <Button className="w-full" disabled={!form.title || createMutation.isPending}
            onClick={() => createMutation.mutate({ ...form, value: form.value ? Number(form.value) : undefined, probability: form.probability ? Number(form.probability) : undefined })}>
            {createMutation.isPending ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactDetailPanel({ contactId, onClose }: { contactId: number; onClose: () => void }) {
  const { data: comms, refetch: refetchComms } = trpc.crm.listCommunications.useQuery({ contactId });
  const [commForm, setCommForm] = useState({ type: "call" as const, subject: "", content: "", direction: "outbound" as const });
  const [showCommForm, setShowCommForm] = useState(false);

  const createComm = trpc.crm.createCommunication.useMutation({
    onSuccess: () => {
      toast.success("Communication logged");
      setShowCommForm(false);
      setCommForm({ type: "call", subject: "", content: "", direction: "outbound" });
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--smartpro-orange)]" />
          <span className="font-semibold text-sm">Communication Log</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close contact panel"><X size={16} aria-hidden="true" /></Button>
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
                onClick={() => createComm.mutate({ contactId, type: commForm.type, subject: commForm.subject || undefined, content: commForm.content || undefined, direction: commForm.direction })}>
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const { data: contacts, refetch: refetchContacts } = trpc.crm.listContacts.useQuery({
    status: typeFilter !== "all" ? typeFilter : undefined,
  });
  const { data: deals, refetch: refetchDeals } = trpc.crm.listDeals.useQuery({});
  const { data: pipeline } = trpc.crm.pipelineStats.useQuery();

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
            <NewDealDialog onSuccess={refetchDeals} />
            <NewContactDialog onSuccess={refetchContacts} />
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
                              <ChevronRight size={14} className={"text-muted-foreground transition-transform " + (isSelected ? "rotate-90 text-[var(--smartpro-orange)]" : "")} />
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
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Move to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals?.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
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
          />
        </div>
      )}
    </div>
  );
}

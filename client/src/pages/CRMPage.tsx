import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Users, Plus, Search, Phone, Mail, Building2, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const dealStageColors: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  qualified: "bg-blue-100 text-blue-700",
  proposal: "bg-purple-100 text-purple-700",
  negotiation: "bg-amber-100 text-amber-700",
  closed_won: "bg-green-100 text-green-700",
  closed_lost: "bg-red-100 text-red-700",
};

function NewContactDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    position: "",
    status: "lead" as const,
    notes: "",
  });

  const createMutation = trpc.crm.createContact.useMutation({
    onSuccess: () => { toast.success("Contact added"); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> Add Contact</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add New Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
          <Label>Contact Type</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
            <Textarea placeholder="Notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button className="w-full" disabled={!form.firstName || createMutation.isPending}
            onClick={() => createMutation.mutate({ firstName: form.firstName, lastName: form.lastName, email: form.email || undefined, phone: form.phone || undefined, company: form.company || undefined, position: form.position || undefined, status: form.status, notes: form.notes || undefined })}>
            {createMutation.isPending ? "Adding..." : "Add Contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDealDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    value: "",
    currency: "OMR",
    stage: "lead" as const,
    probability: "50",
    expectedCloseDate: "",
    notes: "",
  });

  const createMutation = trpc.crm.createDeal.useMutation({
    onSuccess: () => { toast.success("Deal created"); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2"><Plus size={16} /> New Deal</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create New Deal</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Deal Title *</Label>
            <Input placeholder="e.g. PRO Services Package" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Deal Value</Label>
              <Input type="number" placeholder="0.00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OMR">OMR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="space-y-1.5">
              <Label>Win Probability (%)</Label>
              <Input type="number" min="0" max="100" value={form.probability} onChange={(e) => setForm({ ...form, probability: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expected Close Date</Label>
            <Input type="date" value={form.expectedCloseDate} onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button className="w-full" disabled={!form.title || createMutation.isPending}
            onClick={() => createMutation.mutate({
              ...form,
              value: form.value ? Number(form.value) : undefined,
              probability: form.probability ? Number(form.probability) : undefined,
            })}>
            {createMutation.isPending ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CRMPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: contacts, refetch: refetchContacts } = trpc.crm.listContacts.useQuery({
    status: typeFilter !== "all" ? typeFilter : undefined,
  });
  const { data: deals, refetch: refetchDeals } = trpc.crm.listDeals.useQuery({});
  const { data: pipeline } = trpc.crm.pipelineStats.useQuery();

  const updateDealMutation = trpc.crm.updateDeal.useMutation({
    onSuccess: () => { toast.success("Deal updated"); refetchDeals(); },
    onError: (e) => toast.error(e.message),
  });

  const filteredContacts = contacts?.filter((c) =>
    !search ||
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    contacts: contacts?.length ?? 0,
    leads: contacts?.filter((c) => c.status === "lead").length ?? 0,
    deals: deals?.length ?? 0,
    pipeline: deals?.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0) ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">CRM & Sales Pipeline</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Contacts, leads, deals, and pipeline management for Oman & GCC business development
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">OMR Pipeline</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">GCC Contacts</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">B2B Deals</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewDealDialog onSuccess={refetchDeals} />
          <NewContactDialog onSuccess={refetchContacts} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Contacts",  value: stats.contacts,                       bg: "stat-gradient-1" },
          { label: "Leads",           value: stats.leads,                          bg: "stat-gradient-2" },
          { label: "Active Deals",    value: stats.deals,                          bg: "stat-gradient-gold" },
          { label: "Pipeline (OMR)",  value: `${stats.pipeline.toLocaleString()}`, bg: "stat-gradient-4" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-white shadow-sm`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-white/70 mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts ({contacts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="deals">Deals ({deals?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search contacts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredContacts?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Users size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
                <h3 className="font-semibold mb-1">No contacts yet</h3>
                <p className="text-sm text-muted-foreground">Add your first contact to start building your CRM.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts?.map((contact) => (
                <Card key={contact.id} className="hover:shadow-md transition-all duration-200">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                        {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{contact.firstName} {contact.lastName}</div>
                        {contact.position && <div className="text-xs text-muted-foreground">{contact.position}</div>}
                      </div>
                      <Badge className={`text-xs ${contact.status === "customer" ? "bg-green-100 text-green-700" : contact.status === "lead" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`} variant="outline">
                        {contact.status}
                      </Badge>
                    </div>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      {contact.company && <div className="flex items-center gap-1.5"><Building2 size={11} />{contact.company}</div>}
                      {contact.email && <div className="flex items-center gap-1.5"><Mail size={11} />{contact.email}</div>}
                      {contact.phone && <div className="flex items-center gap-1.5"><Phone size={11} />{contact.phone}</div>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deals" className="space-y-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deal</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Value</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Probability</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Close Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Move to</th>
                  </tr>
                </thead>
                <tbody>
                  {deals?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                        No deals yet
                      </td>
                    </tr>
                  )}
                  {deals?.map((deal) => (
                    <tr key={deal.id} className="border-b hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{deal.title}</td>
                      <td className="px-4 py-3 text-xs">{deal.value ? `${deal.currency} ${Number(deal.value).toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${dealStageColors[deal.stage ?? "lead"]}`} variant="outline">
                          {deal.stage?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">{deal.probability ? `${deal.probability}%` : "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : "—"}
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
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"].map((stage) => {
              const stageDeals = deals?.filter((d) => d.stage === stage) ?? [];
              const stageValue = stageDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
              return (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold capitalize text-muted-foreground">{stage.replace(/_/g, " ")}</span>
                    <Badge className={`text-xs ${dealStageColors[stage]}`} variant="outline">{stageDeals.length}</Badge>
                  </div>
                  {stageValue > 0 && <p className="text-xs text-muted-foreground">OMR {stageValue.toLocaleString()}</p>}
                  <div className="space-y-2">
                    {stageDeals.map((deal) => (
                      <Card key={deal.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-2.5">
                          <p className="text-xs font-medium truncate">{deal.title}</p>
                          {deal.value && <p className="text-xs text-muted-foreground mt-0.5">{deal.currency} {Number(deal.value).toLocaleString()}</p>}
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
  );
}

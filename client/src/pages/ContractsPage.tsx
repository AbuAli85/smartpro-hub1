import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { FileText, Plus, Search, CheckCircle2, Clock, AlertTriangle, PenLine, Sparkles, Download, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-amber-100 text-amber-700",
  pending_signature: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-700",
  terminated: "bg-gray-100 text-gray-500",
  cancelled: "bg-gray-100 text-gray-400",
};

function NewContractDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "employment" as const,
    partyAName: "",
    partyBName: "",
    value: "",
    currency: "OMR",
    startDate: "",
    endDate: "",
    content: "",
    notes: "",
  });

  const { data: templates } = trpc.contracts.templates.useQuery();
  const createMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Contract created: ${data.contractNumber}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> New Contract</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Contract</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Contract Title *</Label>
            <Input placeholder="e.g. Employment Agreement - John Doe" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employment">Employment</SelectItem>
                  <SelectItem value="service">Service Agreement</SelectItem>
                  <SelectItem value="nda">NDA</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="lease">Lease</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OMR">OMR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Party A (Your Company)</Label>
              <Input placeholder="Company name" value={form.partyAName} onChange={(e) => setForm({ ...form, partyAName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Party B (Other Party)</Label>
              <Input placeholder="Other party name" value={form.partyBName} onChange={(e) => setForm({ ...form, partyBName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Value</Label>
              <Input type="number" placeholder="0.00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Contract Content</Label>
            <Textarea placeholder="Enter contract terms and conditions..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Internal notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <Button className="w-full" disabled={!form.title || createMutation.isPending}
            onClick={() => createMutation.mutate({ ...form, value: form.value ? Number(form.value) : undefined })}>
            {createMutation.isPending ? "Creating..." : "Create Contract"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AIGenerateContractDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "preview">("form");
  const [generatedContent, setGeneratedContent] = useState("");
  const [form, setForm] = useState({
    type: "employment" as const,
    partyAName: "",
    partyBName: "",
    value: "",
    currency: "OMR",
    startDate: "",
    endDate: "",
    jurisdiction: "Oman",
    additionalClauses: "",
  });

  const generateMutation = trpc.contracts.generateFromTemplate.useMutation({
    onSuccess: (data) => {
      setGeneratedContent(typeof data.content === "string" ? data.content : "");
      setStep("preview");
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Contract created: ${data.contractNumber}`);
      setOpen(false);
      setStep("form");
      setGeneratedContent("");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    if (!form.partyAName || !form.partyBName) { toast.error("Both party names are required"); return; }
    generateMutation.mutate({ ...form, value: form.value ? Number(form.value) : undefined });
  };

  const handleSave = () => {
    createMutation.mutate({
      title: `${form.type.charAt(0).toUpperCase() + form.type.slice(1)} Agreement — ${form.partyAName} & ${form.partyBName}`,
      type: form.type,
      partyAName: form.partyAName,
      partyBName: form.partyBName,
      value: form.value ? Number(form.value) : undefined,
      currency: form.currency,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      content: generatedContent,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep("form"); setGeneratedContent(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
          <Sparkles size={14} /> AI Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" /> AI Contract Generator
          </DialogTitle>
        </DialogHeader>
        {step === "form" ? (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Fill in the details and our AI will generate a complete, professional contract following GCC legal standards.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Contract Type *</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["employment","service","nda","partnership","vendor","lease","other"].map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Jurisdiction</Label>
                <Select value={form.jurisdiction} onValueChange={(v) => setForm({ ...form, jurisdiction: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Oman">Oman</SelectItem>
                    <SelectItem value="UAE">UAE</SelectItem>
                    <SelectItem value="Saudi Arabia">Saudi Arabia</SelectItem>
                    <SelectItem value="Bahrain">Bahrain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Party A (Client/Employer) *</Label>
                <Input placeholder="Company or individual name" value={form.partyAName} onChange={(e) => setForm({ ...form, partyAName: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Party B (Provider/Employee) *</Label>
                <Input placeholder="Company or individual name" value={form.partyBName} onChange={(e) => setForm({ ...form, partyBName: e.target.value })} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Contract Value</Label>
                <div className="flex gap-2">
                  <Input placeholder="0.000" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="text-sm" />
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger className="w-24 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OMR">OMR</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="SAR">SAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="text-sm" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Additional Requirements / Special Clauses</Label>
                <Textarea placeholder="e.g. Include non-compete clause, specify probation period, add IP ownership clause..." value={form.additionalClauses} onChange={(e) => setForm({ ...form, additionalClauses: e.target.value })} rows={3} className="text-sm" />
              </div>
            </div>
            <Button className="w-full gap-2 bg-purple-600 hover:bg-purple-700" disabled={generateMutation.isPending} onClick={handleGenerate}>
              {generateMutation.isPending ? (
                <><span className="animate-spin">⟳</span> Generating contract (15-30s)...</>
              ) : (
                <><Sparkles size={14} /> Generate Contract with AI</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> Contract generated successfully</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setStep("form")}>
                  ← Edit Details
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { const w = window.open("","_blank"); w?.document.write(`<pre style="font-family:serif;padding:40px;max-width:800px;margin:auto;line-height:1.8">${generatedContent}</pre>`); w?.print(); }}>
                  <Printer size={12} /> Print
                </Button>
              </div>
            </div>
            <div className="border rounded-lg p-4 bg-muted/20 max-h-80 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">{generatedContent}</pre>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700" disabled={createMutation.isPending} onClick={handleSave}>
                {createMutation.isPending ? "Saving..." : "Save as Contract"}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => {
                const blob = new Blob([generatedContent], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `contract-${Date.now()}.txt`; a.click();
              }}>
                <Download size={14} /> Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportContractButton({ contractId, contractNumber }: { contractId: number; contractNumber: string }) {
  const [loading, setLoading] = useState(false);
  const utils = trpc.useUtils();

  const handleExport = async () => {
    setLoading(true);
    try {
      const result = await utils.contracts.exportHtml.fetch({ id: contractId });
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(result.html);
        w.document.close();
        setTimeout(() => w.print(), 500);
      }
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={loading} onClick={handleExport}>
      <Printer size={12} /> {loading ? "..." : "PDF"}
    </Button>
  );
}

export default function ContractsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: contracts, refetch } = trpc.contracts.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const updateMutation = trpc.contracts.update.useMutation({
    onSuccess: () => { toast.success("Contract updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = contracts?.filter((c) =>
    !search ||
    (c.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
    c.contractNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: contracts?.length ?? 0,
    active: contracts?.filter((c) => ["active", "signed"].includes(c.status ?? "")).length ?? 0,
    pending: contracts?.filter((c) => ["draft", "pending_review", "pending_signature"].includes(c.status ?? "")).length ?? 0,
    expired: contracts?.filter((c) => c.status === "expired").length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={24} className="text-[var(--smartpro-orange)]" />
            Contract Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Create, manage and track all business contracts</p>
        </div>
        <div className="flex gap-2">
          <AIGenerateContractDialog onSuccess={refetch} />
          <NewContractDialog onSuccess={refetch} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Contracts", value: stats.total, icon: <FileText size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "Active", value: stats.active, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Pending", value: stats.pending, icon: <Clock size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Expired", value: stats.expired, icon: <AlertTriangle size={18} />, color: "text-red-600 bg-red-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search contracts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="pending_signature">Pending Signature</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="employment">Employment</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="nda">NDA</SelectItem>
            <SelectItem value="partnership">Partnership</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="lease">Lease</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contract #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Parties</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Value</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">End Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    No contracts found
                  </td>
                </tr>
              )}
              {filtered?.map((contract) => (
                <tr key={contract.id} className="border-b hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{contract.contractNumber}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium max-w-48 truncate">{contract.title}</div>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{contract.type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs">
                    {contract.partyAName && <div className="truncate max-w-32">{contract.partyAName}</div>}
                    {contract.partyBName && <div className="text-muted-foreground truncate max-w-32">{contract.partyBName}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {contract.value ? `${contract.currency} ${Number(contract.value).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${statusColors[contract.status ?? "draft"]}`} variant="outline">
                      {contract.status?.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {contract.endDate ? new Date(contract.endDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Select value={contract.status ?? "draft"} onValueChange={(v) => updateMutation.mutate({ id: contract.id, status: v as any })}>
                      <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending_review">Send for Review</SelectItem>
                        <SelectItem value="pending_signature">Request Signature</SelectItem>
                        <SelectItem value="signed">Mark Signed</SelectItem>
                        <SelectItem value="active">Activate</SelectItem>
                        <SelectItem value="expired">Mark Expired</SelectItem>
                        <SelectItem value="terminated">Terminate</SelectItem>
                      </SelectContent>
                    </Select>
                    <ExportContractButton contractId={contract.id} contractNumber={contract.contractNumber ?? ""} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

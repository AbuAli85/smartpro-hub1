import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { FileText, Plus, Search, CheckCircle2, Clock, AlertTriangle, PenLine, Sparkles, Download, Printer, Users, PenSquare, History, Shield } from "lucide-react";
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
    title: "", type: "employment" as const, partyAName: "", partyBName: "",
    value: "", currency: "OMR", startDate: "", endDate: "", content: "", notes: "",
  });
  const { data: templates } = trpc.contracts.templates.useQuery();
  const createMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => { toast.success(`Contract created: ${data.contractNumber}`); setOpen(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> New Contract</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create New Contract</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Contract Title *</Label>
            <Input placeholder="e.g. Employment Agreement - John Doe" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["employment","service","nda","partnership","vendor","lease","other"].map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["OMR","AED","USD","SAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Party A (Your Company)</Label><Input placeholder="Company name" value={form.partyAName} onChange={(e) => setForm({ ...form, partyAName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Party B (Other Party)</Label><Input placeholder="Other party name" value={form.partyBName} onChange={(e) => setForm({ ...form, partyBName: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label>Contract Value</Label><Input type="number" placeholder="0.00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Contract Content</Label><Textarea placeholder="Enter contract terms..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea placeholder="Internal notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
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
    type: "employment" as const, partyAName: "", partyBName: "", value: "",
    currency: "OMR", startDate: "", endDate: "", jurisdiction: "Oman", additionalClauses: "",
  });
  const generateMutation = trpc.contracts.generateFromTemplate.useMutation({
    onSuccess: (data) => { setGeneratedContent(typeof data.content === "string" ? data.content : ""); setStep("preview"); },
    onError: (e) => toast.error(e.message),
  });
  const createMutation = trpc.contracts.create.useMutation({
    onSuccess: (data) => { toast.success(`Contract created: ${data.contractNumber}`); setOpen(false); setStep("form"); setGeneratedContent(""); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep("form"); setGeneratedContent(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50">
          <Sparkles size={14} /> AI Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2"><Sparkles size={18} className="text-purple-600" /> AI Contract Generator</DialogTitle>
        </DialogHeader>
        {step === "form" ? (
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Fill in the details and our AI will generate a complete, professional contract following GCC legal standards.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    {["Oman","UAE","Saudi Arabia","Bahrain"].map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-sm">Party A (Client/Employer) *</Label><Input placeholder="Company or individual name" value={form.partyAName} onChange={(e) => setForm({ ...form, partyAName: e.target.value })} className="text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-sm">Party B (Employee/Provider) *</Label><Input placeholder="Name" value={form.partyBName} onChange={(e) => setForm({ ...form, partyBName: e.target.value })} className="text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-sm">Value ({form.currency})</Label><Input type="number" placeholder="0.00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="text-sm" /></div>
              <div className="space-y-1.5">
                <Label className="text-sm">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{["OMR","AED","USD","SAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-sm">Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-sm">End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="text-sm" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-sm">Additional Requirements</Label><Textarea placeholder="Any specific clauses, terms, or requirements..." value={form.additionalClauses} onChange={(e) => setForm({ ...form, additionalClauses: e.target.value })} rows={3} className="text-sm" /></div>
            <Button className="w-full gap-2" disabled={!form.partyAName || !form.partyBName || generateMutation.isPending} onClick={() => { if (!form.partyAName || !form.partyBName) { toast.error("Both party names are required"); return; } generateMutation.mutate({ ...form, value: form.value ? Number(form.value) : undefined }); }}>
              <Sparkles size={14} /> {generateMutation.isPending ? "Generating contract..." : "Generate Contract with AI"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> Contract generated successfully</p>
              <Button size="sm" variant="ghost" onClick={() => setStep("form")}>← Edit Details</Button>
            </div>
            <Textarea value={generatedContent} onChange={(e) => setGeneratedContent(e.target.value)} rows={16} className="font-mono text-xs" />
            <Button className="w-full" disabled={createMutation.isPending} onClick={() => createMutation.mutate({ title: `${form.type.charAt(0).toUpperCase() + form.type.slice(1)} Agreement — ${form.partyAName} & ${form.partyBName}`, type: form.type, partyAName: form.partyAName, partyBName: form.partyBName, value: form.value ? Number(form.value) : undefined, currency: form.currency, startDate: form.startDate || undefined, endDate: form.endDate || undefined, content: generatedContent })}>
              {createMutation.isPending ? "Saving..." : "Save Contract"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── E-Signature: Manage Signers Dialog ────────────────────────────────────────
function SignersDialog({ contractId, contractTitle }: { contractId: number; contractTitle: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const { data: signers, refetch } = trpc.contracts.listSigners.useQuery({ contractId }, { enabled: open });
  const addSigner = trpc.contracts.addSigner.useMutation({
    onSuccess: () => { toast.success("Signer added — signature requested"); setName(""); setEmail(""); setRole(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const statusColor = (s: string | null) => s === "signed" ? "text-green-600" : s === "declined" ? "text-red-500" : "text-amber-500";
  const statusIcon = (s: string | null) => s === "signed" ? "✓" : s === "declined" ? "✗" : "○";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"><Users size={12} /> Signers</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Manage Signers — {contractTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {signers && signers.length > 0 && (
            <div className="space-y-2">
              {signers.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                  <div>
                    <div className="font-medium text-sm">{s.signerName}</div>
                    <div className="text-xs text-muted-foreground">{s.signerEmail}{s.signerRole ? ` · ${s.signerRole}` : ""}</div>
                    {s.signedAt && <div className="text-xs text-green-600">Signed {new Date(s.signedAt).toLocaleDateString()}</div>}
                  </div>
                  <span className={`text-sm font-bold ${statusColor(s.status)}`}>{statusIcon(s.status)} {s.status}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Add Signer</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div><Label className="text-xs">Name</Label><Input className="h-8" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" /></div>
              <div><Label className="text-xs">Email</Label><Input className="h-8" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" /></div>
              <div className="col-span-2"><Label className="text-xs">Role (optional)</Label><Input className="h-8" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. CEO, Employee" /></div>
            </div>
            <Button className="mt-2 w-full" size="sm" disabled={!name || !email || addSigner.isPending}
              onClick={() => addSigner.mutate({ contractId, signerName: name, signerEmail: email, signerRole: role || undefined })}>
              {addSigner.isPending ? "Adding..." : "Add Signer & Request Signature"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── E-Signature: Canvas Signing Dialog ───────────────────────────────────────
function SignatureCanvasDialog({ signatureId, signerName }: { signatureId: number; signerName: string }) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const submitSignature = trpc.contracts.submitSignature.useMutation({
    onSuccess: (data) => {
      toast.success(data.allSigned ? "All parties signed! Contract is fully executed." : "Signature submitted.");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    setDrawing(true); setHasDrawn(true);
  };
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stopDraw = () => setDrawing(false);
  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.clearRect(0, 0, 400, 150); setHasDrawn(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"><PenSquare size={12} /> Sign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Sign as {signerName}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Draw your signature below using your mouse or touchscreen.</p>
          <div className="border-2 border-dashed rounded-lg overflow-hidden bg-white">
            <canvas ref={canvasRef} width={400} height={150} className="w-full touch-none cursor-crosshair"
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={clearCanvas} className="flex-1">Clear</Button>
            <Button size="sm" className="flex-1" disabled={!hasDrawn || submitSignature.isPending}
              onClick={() => submitSignature.mutate({ signatureId, signatureDataUrl: canvasRef.current?.toDataURL("image/png") ?? "" })}>
              {submitSignature.isPending ? "Submitting..." : "Submit Signature"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── E-Signature: Audit Trail Dialog ──────────────────────────────────────────
function AuditTrailDialog({ contractId, contractTitle }: { contractId: number; contractTitle: string }) {
  const [open, setOpen] = useState(false);
  const { data: trail } = trpc.contracts.getSignatureAuditTrail.useQuery({ contractId }, { enabled: open });
  const eventIcon: Record<string, string> = {
    requested: "📨", viewed: "👁", signed: "✍️", declined: "✗", expired: "⏰", reminder_sent: "🔔", completed: "✅",
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"><History size={12} /> Audit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2"><Shield size={16} /> Audit Trail — {contractTitle}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {!trail?.length && <p className="text-sm text-muted-foreground text-center py-4">No signature activity yet.</p>}
          {trail?.map((entry) => (
            <div key={entry.id} className="flex gap-3 p-2 rounded border bg-muted/20">
              <span className="text-lg">{eventIcon[entry.event] ?? "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium capitalize">{entry.event.replace(/_/g, " ")}</div>
                {entry.actorName && <div className="text-xs text-muted-foreground">{entry.actorName}{entry.actorEmail ? ` <${entry.actorEmail}>` : ""}</div>}
                {entry.notes && <div className="text-xs text-muted-foreground italic">{entry.notes}</div>}
                {entry.ipAddress && <div className="text-xs text-muted-foreground">IP: {entry.ipAddress}</div>}
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── E-Signature: Export Signed Contract ──────────────────────────────────────
function ExportSignedButton({ contractId }: { contractId: number }) {
  const exportSigned = trpc.contracts.exportSignedHtml.useMutation({
    onSuccess: (data) => toast.success(<span>Signed contract saved. <a href={data.url} target="_blank" rel="noreferrer" className="underline font-medium">Open</a></span>),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={exportSigned.isPending}
      onClick={() => exportSigned.mutate({ id: contractId })}>
      <Download size={12} /> {exportSigned.isPending ? "Exporting..." : "Signed PDF"}
    </Button>
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
      if (w) { w.document.write(result.html); w.document.close(); setTimeout(() => w.print(), 500); }
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={loading} onClick={handleExport}>
      <Printer size={12} /> {loading ? "..." : "Print"}
    </Button>
  );
}

function SaveToStorageButton({ contractId }: { contractId: number }) {
  const saveToStorage = trpc.contracts.saveToStorage.useMutation({
    onSuccess: (data) => toast.success(<span>Saved to cloud. <a href={data.url} target="_blank" rel="noreferrer" className="underline font-medium">Open</a></span>),
    onError: () => toast.error("Failed to save to storage"),
  });
  return (
    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={saveToStorage.isPending}
      onClick={() => saveToStorage.mutate({ id: contractId })}>
      <Download size={12} /> {saveToStorage.isPending ? "Saving..." : "Save"}
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
    !search || (c.title ?? "").toLowerCase().includes(search.toLowerCase()) || c.contractNumber?.toLowerCase().includes(search.toLowerCase())
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
          <p className="text-muted-foreground text-sm mt-1">Create, manage and e-sign all business contracts</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AIGenerateContractDialog onSuccess={refetch} />
          <NewContractDialog onSuccess={refetch} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Contracts", value: stats.total, icon: <FileText size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "Active / Signed", value: stats.active, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Pending", value: stats.pending, icon: <Clock size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Expired", value: stats.expired, icon: <AlertTriangle size={18} />, color: "text-red-600 bg-red-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
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
                    <div className="flex flex-wrap gap-0.5">
                      <Select value={contract.status ?? "draft"} onValueChange={(v) => updateMutation.mutate({ id: contract.id, status: v as any })}>
                        <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending_review">Send for Review</SelectItem>
                          <SelectItem value="pending_signature">Request Signature</SelectItem>
                          <SelectItem value="signed">Mark Signed</SelectItem>
                          <SelectItem value="active">Activate</SelectItem>
                          <SelectItem value="expired">Mark Expired</SelectItem>
                          <SelectItem value="terminated">Terminate</SelectItem>
                        </SelectContent>
                      </Select>
                      <SignersDialog contractId={contract.id} contractTitle={contract.title ?? ""} />
                      <AuditTrailDialog contractId={contract.id} contractTitle={contract.title ?? ""} />
                      {contract.status === "signed" && <ExportSignedButton contractId={contract.id} />}
                      <ExportContractButton contractId={contract.id} contractNumber={contract.contractNumber ?? ""} />
                      <SaveToStorageButton contractId={contract.id} />
                    </div>
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

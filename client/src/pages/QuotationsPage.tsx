import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FileText, Plus, Send, Check, X, Trash2, Eye, Download,
  TrendingUp, Clock, CheckCircle2, AlertCircle, DollarSign
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-gray-100 text-gray-500",
};

const COMMON_SERVICES = [
  "Work Permit Application",
  "Work Permit Renewal",
  "Residence Visa Processing",
  "PASI Registration",
  "PASI Monthly Contribution",
  "Company Registration (CR)",
  "CR Renewal",
  "Municipality Permit",
  "Labour Card Issuance",
  "Sanad Service Processing",
  "Employee Onboarding Package",
  "HR Outsourcing — Monthly",
  "Payroll Processing",
  "Contract Drafting",
  "Power of Attorney",
  "Document Attestation",
  "Embassy Attestation",
  "Medical Fitness Certificate",
  "Police Clearance Certificate",
  "PRO Services — Monthly Retainer",
];

type LineItem = {
  serviceName: string;
  description: string;
  qty: number;
  unitPriceOmr: number;
  discountPct: number;
};

function LineItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: LineItem;
  index: number;
  onChange: (i: number, field: keyof LineItem, value: string | number) => void;
  onRemove: (i: number) => void;
}) {
  const lineTotal = item.unitPriceOmr * item.qty * (1 - item.discountPct / 100);
  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-4">
        <Select value={item.serviceName} onValueChange={(v) => onChange(index, "serviceName", v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select service…" />
          </SelectTrigger>
          <SelectContent>
            {COMMON_SERVICES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="mt-1 h-7 text-xs"
          placeholder="Custom service name…"
          value={item.serviceName}
          onChange={(e) => onChange(index, "serviceName", e.target.value)}
        />
      </div>
      <div className="col-span-3">
        <Input
          className="h-8 text-xs"
          placeholder="Description (optional)"
          value={item.description}
          onChange={(e) => onChange(index, "description", e.target.value)}
        />
      </div>
      <div className="col-span-1">
        <Input
          className="h-8 text-xs text-center"
          type="number"
          min={1}
          value={item.qty}
          onChange={(e) => onChange(index, "qty", Number(e.target.value))}
        />
      </div>
      <div className="col-span-2">
        <Input
          className="h-8 text-xs"
          type="number"
          step="0.001"
          min={0}
          placeholder="0.000"
          value={item.unitPriceOmr}
          onChange={(e) => onChange(index, "unitPriceOmr", Number(e.target.value))}
        />
      </div>
      <div className="col-span-1">
        <Input
          className="h-8 text-xs text-center"
          type="number"
          min={0}
          max={100}
          value={item.discountPct}
          onChange={(e) => onChange(index, "discountPct", Number(e.target.value))}
        />
      </div>
      <div className="col-span-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-right w-full">{lineTotal.toFixed(3)}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => onRemove(index)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export default function QuotationsPage() {
  
  const utils = trpc.useUtils();

  const { data: quotations, isLoading } = trpc.quotations.list.useQuery({});
  const { data: summary } = trpc.quotations.getSummary.useQuery();

  const createMutation = trpc.quotations.create.useMutation({
    onSuccess: () => { utils.quotations.list.invalidate(); utils.quotations.getSummary.invalidate(); setShowCreate(false); toast.success("Quotation created"); },
    onError: (e) => toast.error(e.message),
  });
  const sendMutation = trpc.quotations.send.useMutation({
    onSuccess: () => { utils.quotations.list.invalidate(); toast.success("Quotation sent — PDF generated"); },
    onError: (e) => toast.error(e.message),
  });
  const acceptMutation = trpc.quotations.accept.useMutation({
    onSuccess: () => { utils.quotations.list.invalidate(); utils.quotations.getSummary.invalidate(); toast.success("Quotation accepted"); },
  });
  const declineMutation = trpc.quotations.decline.useMutation({
    onSuccess: () => { utils.quotations.list.invalidate(); utils.quotations.getSummary.invalidate(); toast.success("Quotation declined"); },
  });
  const deleteMutation = trpc.quotations.delete.useMutation({
    onSuccess: () => { utils.quotations.list.invalidate(); utils.quotations.getSummary.invalidate(); toast.success("Quotation deleted"); },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form state
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days of acceptance. All prices in Omani Rial (OMR). VAT at 5% is included.");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { serviceName: "", description: "", qty: 1, unitPriceOmr: 0, discountPct: 0 },
  ]);

  const subtotal = lineItems.reduce((s, l) => s + l.unitPriceOmr * l.qty * (1 - l.discountPct / 100), 0);
  const vat = subtotal * 0.05;
  const total = subtotal + vat;

  const handleLineChange = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  };
  const addLine = () => setLineItems((prev) => [...prev, { serviceName: "", description: "", qty: 1, unitPriceOmr: 0, discountPct: 0 }]);
  const removeLine = (i: number) => setLineItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = () => {
    if (!clientName.trim()) { toast.error("Client name required"); return; }
    if (lineItems.some((l) => !l.serviceName.trim())) { toast.error("All line items need a service name"); return; }
    createMutation.mutate({ clientName, clientEmail: clientEmail || undefined, clientPhone: clientPhone || undefined, validityDays, notes: notes || undefined, terms: terms || undefined, lineItems });
  };

  const filtered = (quotations ?? []).filter((q) => filterStatus === "all" || q.status === filterStatus);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Quotation Engine</h1>
            <p className="text-sm text-muted-foreground">Professional proposals · OMR pricing · 5% VAT · Oman & GCC</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4" />
          New Quotation
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total", value: summary?.total ?? 0, icon: FileText, color: "text-slate-600" },
          { label: "Draft", value: summary?.draft ?? 0, icon: Clock, color: "text-slate-500" },
          { label: "Sent", value: summary?.sent ?? 0, icon: Send, color: "text-blue-600" },
          { label: "Accepted", value: summary?.accepted ?? 0, icon: CheckCircle2, color: "text-green-600" },
          { label: "Declined", value: summary?.declined ?? 0, icon: AlertCircle, color: "text-red-600" },
        ].map((s) => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div>
                <p className="text-2xl font-black">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground font-medium">Total Pipeline:</span>
        <span className="font-bold text-orange-600">OMR {(summary?.totalValueOmr ?? 0).toFixed(3)}</span>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "draft", "sent", "accepted", "declined", "expired"].map((s) => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            className={filterStatus === s ? "bg-orange-500 hover:bg-orange-600" : ""}
            onClick={() => setFilterStatus(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Quotations List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse border-0 shadow-sm">
              <CardContent className="p-4 h-20 bg-muted/30 rounded-xl" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2 shadow-none">
          <CardContent className="p-12 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-muted-foreground">No quotations found</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first professional quotation to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card key={q.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">{q.referenceNumber}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[q.status] ?? ""}`}>
                        {q.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="font-semibold">{q.clientName}</p>
                    {q.clientEmail && <p className="text-xs text-muted-foreground">{q.clientEmail}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {format(new Date(q.createdAt), "d MMM yyyy")} ·
                      Valid {q.validityDays} days
                      {q.sentAt && ` · Sent ${format(new Date(q.sentAt), "d MMM yyyy")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-orange-600">OMR {Number(q.totalOmr).toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">incl. 5% VAT</p>
                    <div className="flex gap-1 mt-2 justify-end flex-wrap">
                      {q.status === "draft" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 h-7"
                            onClick={() => sendMutation.mutate({ id: q.id })}
                            disabled={sendMutation.isPending}
                          >
                            <Send className="w-3 h-3" />
                            Send
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-red-500 hover:text-red-700"
                            onClick={() => deleteMutation.mutate({ id: q.id })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      {q.status === "sent" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 h-7 border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => acceptMutation.mutate({ id: q.id })}
                          >
                            <Check className="w-3 h-3" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs gap-1 h-7 border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => declineMutation.mutate({ id: q.id })}
                          >
                            <X className="w-3 h-3" />
                            Decline
                          </Button>
                        </>
                      )}
                      {q.pdfUrl && (
                        <a href={q.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1">
                            <Eye className="w-3 h-3" />
                            View
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-500" />
              New Quotation — SmartPRO Business Services
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Client Details */}
            <div>
              <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Client Details</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                  <Label className="text-xs">Client / Company Name *</Label>
                  <Input className="mt-1" placeholder="e.g. Al Noor Trading LLC" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input className="mt-1" type="email" placeholder="client@example.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input className="mt-1" placeholder="+968 9XXX XXXX" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Line Items */}
            <div>
              <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">Services & Line Items</h3>
              <div className="grid grid-cols-12 gap-2 mb-2 text-xs font-semibold text-muted-foreground">
                <div className="col-span-4">Service</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1 text-center">Qty</div>
                <div className="col-span-2">Unit Price (OMR)</div>
                <div className="col-span-1 text-center">Disc%</div>
                <div className="col-span-1 text-right">Total</div>
              </div>
              <div className="space-y-2">
                {lineItems.map((item, i) => (
                  <LineItemRow key={i} item={item} index={i} onChange={handleLineChange} onRemove={removeLine} />
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-3 gap-1 text-xs" onClick={addLine}>
                <Plus className="w-3 h-3" />
                Add Line Item
              </Button>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>OMR {subtotal.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (5%)</span>
                  <span>OMR {vat.toFixed(3)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-black text-base">
                  <span>Total</span>
                  <span className="text-orange-600">OMR {total.toFixed(3)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Validity (days)</Label>
                <Input className="mt-1" type="number" min={1} max={365} value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input className="mt-1" placeholder="Any special notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Terms & Conditions</Label>
                <Textarea className="mt-1 text-xs" rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-orange-500 hover:bg-orange-600">
              {createMutation.isPending ? "Creating…" : "Create Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

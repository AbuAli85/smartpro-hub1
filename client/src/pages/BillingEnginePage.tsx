import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertCircle,
  BanknoteIcon,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800 border-amber-200", icon: <Clock size={12} /> },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-800 border-red-200", icon: <AlertCircle size={12} /> },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <XCircle size={12} /> },
  waived: { label: "Waived", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <CheckCircle2 size={12} /> },
};

const PAYOUT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  on_hold: { label: "On Hold", color: "bg-red-100 text-red-800" },
};

function formatOMR(val: string | number | null | undefined) {
  const n = parseFloat(String(val ?? "0"));
  return `OMR ${n.toFixed(3)}`;
}

function currentMonth() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export default function BillingEnginePage() {
  const { user } = useAuth();
  const now = currentMonth();
  const [filterMonth, setFilterMonth] = useState(String(now.month));
  const [filterYear, setFilterYear] = useState(String(now.year));
  const [filterStatus, setFilterStatus] = useState("all");
  const [genMonth, setGenMonth] = useState(String(now.month));
  const [genYear, setGenYear] = useState(String(now.year));
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutOfficerId, setPayoutOfficerId] = useState("");
  const [payoutCommPct, setPayoutCommPct] = useState("12.5");
  const [payoutFixed, setPayoutFixed] = useState("600");
  const [payoutDeductions, setPayoutDeductions] = useState("0");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");

  const utils = trpc.useUtils();

  const dashboardQuery = trpc.billing.getBillingDashboard.useQuery({
    month: filterMonth !== "all" ? parseInt(filterMonth) : undefined,
    year: filterYear !== "all" ? parseInt(filterYear) : undefined,
    status: filterStatus !== "all" ? (filterStatus as any) : undefined,
  });

  const payoutsQuery = trpc.billing.getOfficerPayouts.useQuery({
    month: filterMonth !== "all" ? parseInt(filterMonth) : undefined,
    year: filterYear !== "all" ? parseInt(filterYear) : undefined,
  });

  const generateMutation = trpc.billing.generateMonthlyInvoices.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.created} invoices (${data.skipped} already existed)`);
      setShowGenDialog(false);
      utils.billing.getBillingDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMutation = trpc.billing.markInvoicePaid.useMutation({
    onSuccess: () => {
      toast.success("Invoice marked as paid");
      setSelectedInvoice(null);
      utils.billing.getBillingDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.billing.updateInvoiceStatus.useMutation({
    onSuccess: () => {
      toast.success("Invoice status updated");
      setSelectedInvoice(null);
      utils.billing.getBillingDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const calcPayoutMutation = trpc.billing.calculateOfficerPayout.useMutation({
    onSuccess: (data) => {
      toast.success(`Payout calculated: ${formatOMR(data.net)} net (Track ${data.track === "platform" ? "A" : "B"})`);
      setShowPayoutDialog(false);
      utils.billing.getOfficerPayouts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePayoutMutation = trpc.billing.updatePayoutStatus.useMutation({
    onSuccess: () => {
      toast.success("Payout status updated");
      utils.billing.getOfficerPayouts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markOverdueMutation = trpc.billing.markOverdueInvoices.useMutation({
    onSuccess: () => {
      toast.success("Overdue invoices marked");
      utils.billing.getBillingDashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 text-red-500" size={48} />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-muted-foreground mt-1">Only platform administrators can access the Billing Engine.</p>
        </div>
      </div>
    );
  }

  const { invoices = [], summary = {} as any } = dashboardQuery.data ?? {};
  const payouts = payoutsQuery.data ?? [];

  const years = [2024, 2025, 2026, 2027];

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="text-primary" size={26} />
            Billing Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage monthly invoices, officer payouts, and revenue tracking
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => markOverdueMutation.mutate()} disabled={markOverdueMutation.isPending}>
            <RefreshCw size={14} className="mr-1.5" />
            Mark Overdue
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPayoutDialog(true)}>
            <Wallet size={14} className="mr-1.5" />
            Calculate Payout
          </Button>
          <Button size="sm" onClick={() => setShowGenDialog(true)}>
            <FileText size={14} className="mr-1.5" />
            Generate Invoices
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-slate-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Invoiced</p>
                <p className="text-2xl font-bold mt-1">{formatOMR(summary.totalOmr)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{summary.total ?? 0} invoices</p>
              </div>
              <div className="p-2 bg-slate-200 rounded-lg"><DollarSign size={18} className="text-slate-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Collected</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700">{formatOMR(summary.paidOmr)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">{summary.paid ?? 0} paid</p>
              </div>
              <div className="p-2 bg-emerald-200 rounded-lg"><CheckCircle2 size={18} className="text-emerald-700" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Outstanding</p>
                <p className="text-2xl font-bold mt-1 text-amber-700">{formatOMR(summary.pendingOmr)}</p>
                <p className="text-xs text-amber-600 mt-0.5">{summary.pending ?? 0} pending</p>
              </div>
              <div className="p-2 bg-amber-200 rounded-lg"><Clock size={18} className="text-amber-700" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-red-700 font-medium uppercase tracking-wide">Overdue</p>
                <p className="text-2xl font-bold mt-1 text-red-700">{formatOMR(summary.overdueOmr)}</p>
                <p className="text-xs text-red-600 mt-0.5">{summary.overdue ?? 0} overdue</p>
              </div>
              <div className="p-2 bg-red-200 rounded-lg"><AlertCircle size={18} className="text-red-700" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-muted/40 p-3 rounded-lg">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-28 h-8 text-sm bg-background">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterMonth(String(now.month)); setFilterYear(String(now.year)); setFilterStatus("all"); }}>
          Reset
        </Button>
      </div>

      {/* Tabs: Invoices / Payouts */}
      <Tabs defaultValue="invoices">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices" className="gap-1.5">
            <FileText size={14} />
            Invoices
            {invoices.length > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{invoices.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payouts" className="gap-1.5">
            <Wallet size={14} />
            Officer Payouts
            {payouts.length > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{payouts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices">
          {dashboardQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading invoices...</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl">
              <FileText size={40} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium text-muted-foreground">No invoices found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Generate invoices for the selected period to get started.</p>
              <Button className="mt-4" size="sm" onClick={() => setShowGenDialog(true)}>Generate Invoices</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Officer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv: any) => {
                    const sc = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                    return (
                      <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{inv.officerName ?? `Officer #${inv.officerId}`}</div>
                          <div className="text-xs text-muted-foreground">Co. #{inv.companyId}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {MONTHS[(inv.billingMonth ?? 1) - 1]} {inv.billingYear}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatOMR(inv.amountOmr)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
                            {sc.icon}{sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { setSelectedInvoice(inv); setInvoiceNotes(inv.notes ?? ""); }}
                          >
                            Manage
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Payouts Tab ── */}
        <TabsContent value="payouts">
          {payoutsQuery.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading payouts...</div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed rounded-xl">
              <Wallet size={40} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium text-muted-foreground">No payouts calculated yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Use "Calculate Payout" to generate officer payouts for the period.</p>
              <Button className="mt-4" size="sm" onClick={() => setShowPayoutDialog(true)}>Calculate Payout</Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Officer</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Track</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Collected</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Commission</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Net Payout</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payouts.map((p: any) => {
                    const sc = PAYOUT_STATUS_CONFIG[p.status] ?? PAYOUT_STATUS_CONFIG.pending;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.officerName ?? `Officer #${p.officerId}`}</div>
                          <div className="text-xs text-muted-foreground">ID #{p.officerId}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {MONTHS[(p.payoutMonth ?? 1) - 1]} {p.payoutYear}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={p.employmentTrack === "platform" ? "default" : "secondary"} className="text-xs">
                            {p.employmentTrack === "platform" ? "Track A" : "Track B"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatOMR(p.totalCollectedOmr)}</td>
                        <td className="px-4 py-3 text-right">
                          {p.employmentTrack === "platform"
                            ? `${parseFloat(p.commissionPct ?? "12.5").toFixed(1)}% = ${formatOMR(p.commissionOmr)}`
                            : <span className="text-muted-foreground">Fixed</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">{formatOMR(p.netOmr)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Select
                            value={p.status}
                            onValueChange={(val) => updatePayoutMutation.mutate({ payoutId: p.id, status: val as any })}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="paid">Mark Paid</SelectItem>
                              <SelectItem value="on_hold">On Hold</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Generate Invoices Dialog ── */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={18} />
              Generate Monthly Invoices
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will create OMR 100 invoices for all active officer-company assignments for the selected period.
              Existing invoices are skipped automatically.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Month</Label>
                <Select value={genMonth} onValueChange={setGenMonth}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Select value={genYear} onValueChange={setGenYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenDialog(false)}>Cancel</Button>
            <Button
              onClick={() => generateMutation.mutate({ month: parseInt(genMonth), year: parseInt(genYear) })}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Calculate Payout Dialog ── */}
      <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet size={18} />
              Calculate Officer Payout
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Officer ID</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="Enter officer ID"
                value={payoutOfficerId}
                onChange={(e) => setPayoutOfficerId(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Month</Label>
                <Select value={genMonth} onValueChange={setGenMonth}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Select value={genYear} onValueChange={setGenYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Commission % (Track A)</Label>
                <Input className="mt-1" type="number" value={payoutCommPct} onChange={(e) => setPayoutCommPct(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Fixed Salary (Track B)</Label>
                <Input className="mt-1" type="number" value={payoutFixed} onChange={(e) => setPayoutFixed(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Deductions (OMR)</Label>
              <Input className="mt-1" type="number" value={payoutDeductions} onChange={(e) => setPayoutDeductions(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea className="mt-1 text-sm" rows={2} value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayoutDialog(false)}>Cancel</Button>
            <Button
              disabled={!payoutOfficerId || calcPayoutMutation.isPending}
              onClick={() =>
                calcPayoutMutation.mutate({
                  officerId: parseInt(payoutOfficerId),
                  month: parseInt(genMonth),
                  year: parseInt(genYear),
                  commissionPct: parseFloat(payoutCommPct),
                  fixedSalaryOmr: parseFloat(payoutFixed),
                  deductionsOmr: parseFloat(payoutDeductions),
                  notes: payoutNotes || undefined,
                })
              }
            >
              {calcPayoutMutation.isPending ? "Calculating..." : "Calculate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage Invoice Dialog ── */}
      {selectedInvoice && (
        <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Manage Invoice</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice #</span>
                  <span className="font-mono text-xs">{selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Officer</span>
                  <span className="font-medium">{selectedInvoice.officerName ?? `#${selectedInvoice.officerId}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Period</span>
                  <span>{MONTHS[(selectedInvoice.billingMonth ?? 1) - 1]} {selectedInvoice.billingYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-semibold">{formatOMR(selectedInvoice.amountOmr)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_CONFIG[selectedInvoice.status]?.color}`}>
                    {STATUS_CONFIG[selectedInvoice.status]?.label}
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea className="mt-1 text-sm" rows={2} value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {selectedInvoice.status !== "paid" && (
                <Button
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => markPaidMutation.mutate({ invoiceId: selectedInvoice.id, notes: invoiceNotes })}
                  disabled={markPaidMutation.isPending}
                >
                  <CheckCircle2 size={14} className="mr-1.5" />
                  Mark as Paid
                </Button>
              )}
              {selectedInvoice.status === "pending" && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => updateStatusMutation.mutate({ invoiceId: selectedInvoice.id, status: "overdue", notes: invoiceNotes })}
                  disabled={updateStatusMutation.isPending}
                >
                  Mark Overdue
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelectedInvoice(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

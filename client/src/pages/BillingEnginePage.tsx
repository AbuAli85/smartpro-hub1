import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
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
  BarChart2,
  BanknoteIcon,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

function FinancialIntelligencePanel() {
  const agedQuery = trpc.billing.getAgedReceivables.useQuery();
  const trendQuery = trpc.billing.getRevenueTrend.useQuery();
  const topQuery = trpc.billing.getTopClients.useQuery();
  const aged = agedQuery.data ?? [];
  const trend = trendQuery.data ?? [];
  const top = topQuery.data ?? [];
  const totalOverdue = aged.reduce((s, b) => s + b.amountOmr, 0);
  return (
    <div className="space-y-6">
      {/* Aged Receivables */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            Aged Receivables
            <span className="ml-auto text-sm font-normal text-red-600 font-semibold">Total: OMR {totalOverdue.toFixed(3)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agedQuery.isLoading ? <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div> : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {aged.map((b) => (
                <div key={b.label} className={`rounded-xl p-4 border ${
                  b.label === '0–30 days' ? 'bg-amber-50 border-amber-200' :
                  b.label === '31–60 days' ? 'bg-orange-50 border-orange-200' :
                  b.label === '61–90 days' ? 'bg-red-50 border-red-200' :
                  'bg-red-100 border-red-300'
                }`}>
                  <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
                  <p className="text-xl font-bold mt-1">OMR {b.amountOmr.toFixed(3)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{b.count} invoice{b.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue Trend */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            Revenue Trend — Last 6 Months (OMR)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendQuery.isLoading ? <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `OMR ${Number(v).toFixed(3)}`} />
                <Legend />
                <Bar dataKey="invoiced" name="Invoiced" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Clients */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            Top Clients by Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topQuery.isLoading ? <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div> : top.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No billing data yet. Generate invoices to see top clients.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">#</th>
                    <th scope="col" className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Company ID</th>
                    <th scope="col" className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Total Invoiced</th>
                    <th scope="col" className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c, i) => (
                    <tr key={c.companyId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3 font-medium">Company #{c.companyId}</td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-700">OMR {c.totalOmr.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{c.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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

function BillingReportButton({ month, year, companyId }: { month: number; year: number; companyId?: number }) {
  const generateReport = trpc.reports.generateBillingSummary.useMutation({
    onSuccess: (data) => {
      toast.success("Report generated!");
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="outline" size="sm"
      onClick={() => generateReport.mutate({ month, year, companyId })}
      disabled={generateReport.isPending}
      className="gap-1">
      {generateReport.isPending ? <RefreshCw size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
      PDF Report
    </Button>
  );
}

export default function BillingEnginePage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
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
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: new Date().toISOString().split("T")[0], method: "bank_transfer", reference: "", notes: "" });

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
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <CreditCard size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Billing Engine</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monthly OMR invoicing, Omani PRO officer payouts, revenue tracking, and financial reporting
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">OMR Invoicing</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Officer Payouts</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">PDF Reports</span>
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Overdue Tracking</span>
          </div>
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
          <BillingReportButton month={Number(filterMonth) || now.month} year={Number(filterYear) || now.year} companyId={activeCompanyId ?? undefined} />
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
          <TabsTrigger value="intelligence" className="gap-1.5">
            <BarChart2 size={14} />
            Financial Intelligence
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
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice #</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Officer</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Due Date</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
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
                          {inv.dueDate ? fmtDate(inv.dueDate) : "—"}
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
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Officer</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Track</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Collected</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Commission</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Net Payout</th>
                    <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
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

        {/* ── Financial Intelligence Tab ── */}
        <TabsContent value="intelligence">
          <FinancialIntelligencePanel />
        </TabsContent>
      </Tabs>

      {/* ── Generate Invoices Dialog ── */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <FileText size={18} />
              Generate Monthly Invoices
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This will create OMR 100 invoices for all active officer-company assignments for the selected period.
              Existing invoices are skipped automatically.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <DialogTitle className="flex flex-wrap items-center gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* ── Invoice Detail Panel (Full-featured) ── */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedInvoice(null)}>
          <div className="w-full max-w-md bg-background border-l shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
              <div>
                <h2 className="font-bold text-sm">Invoice Detail</h2>
                <p className="text-xs text-muted-foreground font-mono">{selectedInvoice.invoiceNumber}</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-muted-foreground hover:text-foreground p-1 text-lg leading-none">&times;</button>
            </div>
            <div className="p-4 space-y-5">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_CONFIG[selectedInvoice.status]?.color}`}>
                  {STATUS_CONFIG[selectedInvoice.status]?.icon}
                  {STATUS_CONFIG[selectedInvoice.status]?.label}
                </span>
                {selectedInvoice.status === "overdue" && (
                  <span className="text-xs text-red-600 font-medium">⚠ Payment overdue</span>
                )}
              </div>
              {/* Invoice Summary */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Officer</span>
                  <span className="font-medium">{selectedInvoice.officerName ?? `Officer #${selectedInvoice.officerId}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Period</span>
                  <span>{MONTHS[(selectedInvoice.billingMonth ?? 1) - 1]} {selectedInvoice.billingYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span>#{selectedInvoice.companyId}</span>
                </div>
                {selectedInvoice.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due Date</span>
                    <span className={selectedInvoice.status === "overdue" ? "text-red-600 font-medium" : ""}>
                      {fmtDate(selectedInvoice.dueDate)}
                    </span>
                  </div>
                )}
                {selectedInvoice.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid On</span>
                    <span className="text-emerald-700 font-medium">{fmtDate(selectedInvoice.paidAt)}</span>
                  </div>
                )}
              </div>
              {/* Line Items */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line Items</p>
                <div className="space-y-1.5 bg-muted/20 rounded-lg p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">PRO Officer Monthly Fee</span>
                    <span className="font-medium">{formatOMR(selectedInvoice.amountOmr)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">VAT (5%)</span>
                    <span className="font-medium">{formatOMR(Number(selectedInvoice.amountOmr) * 0.05)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold border-t pt-1.5 mt-1">
                    <span>Total Due</span>
                    <span className="text-blue-700">{formatOMR(Number(selectedInvoice.amountOmr) * 1.05)}</span>
                  </div>
                </div>
              </div>
              {/* Payment History */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment History</p>
                {selectedInvoice.status === "paid" ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-medium text-emerald-800">Payment Received</p>
                      <p className="text-emerald-700">{formatOMR(selectedInvoice.amountOmr)} · {selectedInvoice.paidAt ? fmtDate(selectedInvoice.paidAt) : "Date unknown"}</p>
                      {selectedInvoice.notes && <p className="text-emerald-600 mt-0.5">{selectedInvoice.notes}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">
                    No payments recorded yet
                  </div>
                )}
              </div>
              {/* Notes */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
                <Textarea className="mt-1.5 text-sm" rows={2} value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} />
              </div>
              {/* Actions */}
              <div className="flex flex-col gap-2 pt-1">
                {selectedInvoice.status !== "paid" && (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => { setPaymentForm(f => ({ ...f, amount: String(selectedInvoice.amountOmr) })); setShowPaymentDialog(true); }}
                  >
                    <BanknoteIcon size={14} className="mr-1.5" />
                    Record Payment
                  </Button>
                )}
                {selectedInvoice.status !== "paid" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      toast.success(`Reminder sent for invoice ${selectedInvoice.invoiceNumber}`);
                    }}
                  >
                    <FileText size={14} className="mr-1.5" />
                    Send Reminder
                  </Button>
                )}
                {selectedInvoice.status === "pending" && (
                  <Button
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => updateStatusMutation.mutate({ invoiceId: selectedInvoice.id, status: "overdue", notes: invoiceNotes })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Mark Overdue
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setSelectedInvoice(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Record Payment Dialog ── */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BanknoteIcon size={18} className="text-emerald-600" />
              Record Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Amount (OMR)</Label>
              <Input className="mt-1" type="number" step="0.001" value={paymentForm.amount} onChange={(e) => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Payment Date</Label>
              <Input className="mt-1" type="date" value={paymentForm.date} onChange={(e) => setPaymentForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm(f => ({ ...f, method: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="online">Online Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference / Transaction ID</Label>
              <Input className="mt-1" placeholder="Bank ref, cheque no., etc." value={paymentForm.reference} onChange={(e) => setPaymentForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea className="mt-1 text-sm" rows={2} value={paymentForm.notes} onChange={(e) => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!paymentForm.amount || markPaidMutation.isPending}
              onClick={() => {
                if (selectedInvoice) {
                  markPaidMutation.mutate({
                    invoiceId: selectedInvoice.id,
                    notes: `${paymentForm.method.replace(/_/g, " ")} · Ref: ${paymentForm.reference || "N/A"} · ${paymentForm.notes || ""}`.trim(),
                  });
                  setShowPaymentDialog(false);
                }
              }}
            >
              {markPaidMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

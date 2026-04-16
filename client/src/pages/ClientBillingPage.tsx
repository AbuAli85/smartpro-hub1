import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { isRTL } from "@/lib/i18n";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  FileText,
  CreditCard,
  TrendingUp,
  Search,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "void";

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientName?: string | null;
  issueDate: string;
  dueDate: string;
  totalOmr: string;
  paidOmr: string;
  balanceOmr: string;
  status: InvoiceStatus;
}

// ─── Status badge helper ───────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  const cfg: Record<InvoiceStatus, { cls: string; icon: React.ReactNode }> = {
    draft: { cls: "bg-gray-100 text-gray-700 border-gray-200", icon: <FileText className="w-3 h-3" /> },
    sent: { cls: "bg-blue-50 text-blue-700 border-blue-200", icon: <Clock className="w-3 h-3" /> },
    partial: { cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertCircle className="w-3 h-3" /> },
    paid: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    overdue: { cls: "bg-red-50 text-red-700 border-red-200", icon: <AlertCircle className="w-3 h-3" /> },
    void: { cls: "bg-gray-100 text-gray-400 border-gray-200", icon: <Ban className="w-3 h-3" /> },
  };
  const { cls, icon } = cfg[status] ?? cfg.draft;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", cls)}>
      {icon}
      {t(`clientBilling.invoiceStatuses.${status}`)}
    </span>
  );
}

// ─── Record Payment Dialog ─────────────────────────────────────────────────────

function RecordPaymentDialog({
  invoice,
  open,
  onClose,
  companyId,
  t,
}: {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  companyId?: number;
  t: (k: string) => string;
}) {
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "cash" | "card" | "other">("bank");
  const [reference, setReference] = useState("");

  const mutation = trpc.clientBilling.recordPayment.useMutation({
    onSuccess: () => {
      toast.success(t("clientBilling.invoiceList.recordPaymentDialog.success"));
      utils.clientBilling.listInvoices.invalidate();
      utils.clientBilling.getARAgingSummary.invalidate();
      utils.clientBilling.getCashFlowProjection.invalidate();
      onClose();
      setAmount("");
      setReference("");
    },
    onError: () => {
      toast.error(t("clientBilling.invoiceList.recordPaymentDialog.error"));
    },
  });

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("clientBilling.invoiceList.recordPaymentDialog.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.invoiceNumber} — {invoice.clientName}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("clientBilling.invoiceList.recordPaymentDialog.amountLabel")}</Label>
            <Input
              type="number"
              step="0.001"
              min="0.001"
              max={invoice.balanceOmr}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Max ${Number(invoice.balanceOmr).toFixed(3)}`}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("clientBilling.invoiceList.recordPaymentDialog.methodLabel")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["bank", "cash", "card", "other"] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`clientBilling.invoiceList.recordPaymentDialog.methods.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("clientBilling.invoiceList.recordPaymentDialog.referenceLabel")}</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t("clientBilling.invoiceList.recordPaymentDialog.referencePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("clientBilling.invoiceList.recordPaymentDialog.cancel")}
          </Button>
          <Button
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                invoiceId: invoice.id,
                amountOmr: Number(amount),
                paymentMethod: method,
                reference: reference || undefined,
                companyId,
              })
            }
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
                {t("clientBilling.invoiceList.recordPaymentDialog.submitting")}
              </>
            ) : (
              t("clientBilling.invoiceList.recordPaymentDialog.submit")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Generate Monthly Dialog ───────────────────────────────────────────────────

function GenerateMonthlyDialog({
  open,
  onClose,
  companyId,
  t,
}: {
  open: boolean;
  onClose: () => void;
  companyId?: number;
  t: (k: string) => string;
}) {
  const utils = trpc.useUtils();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const mutation = trpc.clientBilling.generateMonthlyInvoices.useMutation({
    onSuccess: (data) => {
      toast.success(
        t("clientBilling.invoiceList.generateDialog.success")
          .replace("{{count}}", String(data.created ?? 0))
          .replace("{{skipped}}", String(data.skipped ?? 0))
      );
      utils.clientBilling.listInvoices.invalidate();
      onClose();
    },
    onError: () => {
      toast.error(t("clientBilling.invoiceList.generateDialog.error"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("clientBilling.invoiceList.generateDialog.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("clientBilling.invoiceList.generateDialog.description")}
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("clientBilling.invoiceList.generateDialog.monthLabel")}</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {new Date(2000, m - 1, 1).toLocaleString("default", { month: "long" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("clientBilling.invoiceList.generateDialog.yearLabel")}</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("clientBilling.invoiceList.generateDialog.cancel")}
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({ month: Number(month), year: Number(year), companyId })
            }
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
                {t("clientBilling.invoiceList.generating")}
              </>
            ) : (
              t("clientBilling.invoiceList.generateDialog.confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice List Tab ──────────────────────────────────────────────────────────

function InvoiceListTab({ companyId, t, rtl }: { companyId?: number; t: (k: string) => string; rtl: boolean }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);

  const { data, isLoading, refetch } = trpc.clientBilling.listInvoices.useQuery(
    {
      companyId,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    },
    { enabled: true }
  );

  const invoices: Invoice[] = useMemo(() => {
    const raw = (data as Invoice[] | undefined) ?? [];
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter(
      (inv) =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.clientName?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const statuses: (InvoiceStatus | "all")[] = ["all", "draft", "sent", "partial", "paid", "overdue", "void"];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className={cn("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground", rtl ? "end-3" : "start-3")} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("clientBilling.invoiceList.searchPlaceholder")}
            className={cn(rtl ? "pe-9" : "ps-9")}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("clientBilling.invoiceList.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all"
                  ? t("clientBilling.invoiceList.allStatuses")
                  : t(`clientBilling.invoiceStatuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={() => setShowGenerate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t("clientBilling.invoiceList.generateMonthly")}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin me-2" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <FileText className="w-10 h-10 opacity-30" />
          <p className="font-medium">{t("clientBilling.invoiceList.noInvoices")}</p>
          <p className="text-sm">{t("clientBilling.invoiceList.noInvoicesHint")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(["invoiceNo", "client", "issueDate", "dueDate", "total", "paid", "balance", "status", "actions"] as const).map(
                  (col) => (
                    <th
                      key={col}
                      className={cn(
                        "px-4 py-3 font-medium text-muted-foreground whitespace-nowrap",
                        col === "actions" ? "text-end" : "text-start"
                      )}
                    >
                      {t(`clientBilling.invoiceList.columns.${col}`)}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 font-medium">{inv.clientName ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.issueDate}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.dueDate}</td>
                  <td className="px-4 py-3 font-medium">{Number(inv.totalOmr).toFixed(3)}</td>
                  <td className="px-4 py-3 text-emerald-600">{Number(inv.paidOmr).toFixed(3)}</td>
                  <td className={cn("px-4 py-3 font-semibold", Number(inv.balanceOmr) > 0 ? "text-red-600" : "text-emerald-600")}>
                    {Number(inv.balanceOmr).toFixed(3)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    {Number(inv.balanceOmr) > 0 && inv.status !== "void" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => setPaymentTarget(inv)}
                      >
                        <CreditCard className="w-3 h-3" />
                        {t("clientBilling.invoiceList.actions.recordPayment")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordPaymentDialog
        invoice={paymentTarget}
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        companyId={companyId}
        t={t}
      />
      <GenerateMonthlyDialog
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        companyId={companyId}
        t={t}
      />
    </div>
  );
}

// ─── AR Aging Tab ──────────────────────────────────────────────────────────────

interface AgingBuckets {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

function ARAgingTab({ companyId, t }: { companyId?: number; t: (k: string) => string }) {
  const { data, isLoading } = trpc.clientBilling.getARAgingSummary.useQuery({ companyId });
  const buckets = data as AgingBuckets | undefined;

  const bucketKeys: (keyof Omit<AgingBuckets, "total">)[] = [
    "current",
    "days1to30",
    "days31to60",
    "days61to90",
    "over90",
  ];

  const bucketColors: Record<string, string> = {
    current: "bg-emerald-500",
    days1to30: "bg-amber-400",
    days31to60: "bg-orange-500",
    days61to90: "bg-red-500",
    over90: "bg-red-800",
  };

  const total = buckets?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("clientBilling.arAging.title")}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{t("clientBilling.arAging.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin me-2" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <CheckCircle2 className="w-10 h-10 opacity-30 text-emerald-500" />
          <p className="font-medium">{t("clientBilling.arAging.noData")}</p>
          <p className="text-sm">{t("clientBilling.arAging.noDataHint")}</p>
        </div>
      ) : (
        <>
          {/* Total card */}
          <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("clientBilling.arAging.totalOutstanding")}</p>
              <p className="text-3xl font-bold mt-1">{total.toFixed(3)} <span className="text-base font-normal text-muted-foreground">OMR</span></p>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
          </div>

          {/* Stacked bar */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
              {bucketKeys.map((key) => {
                const val = buckets?.[key] ?? 0;
                const pct = total > 0 ? (val / total) * 100 : 0;
                if (pct < 0.5) return null;
                return (
                  <div
                    key={key}
                    className={cn("h-full transition-all", bucketColors[key])}
                    style={{ width: `${pct}%` }}
                    title={`${t(`clientBilling.arAging.buckets.${key}`)}: ${val.toFixed(3)} OMR`}
                  />
                );
              })}
            </div>

            {/* Legend rows */}
            <div className="space-y-2">
              {bucketKeys.map((key) => {
                const val = buckets?.[key] ?? 0;
                const pct = total > 0 ? (val / total) * 100 : 0;
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-3 h-3 rounded-sm flex-shrink-0", bucketColors[key])} />
                      <span className="text-muted-foreground">{t(`clientBilling.arAging.buckets.${key}`)}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground text-xs">{pct.toFixed(1)}%</span>
                      <span className="font-medium tabular-nums w-24 text-end">{val.toFixed(3)} OMR</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cash Flow Tab ─────────────────────────────────────────────────────────────

interface ProjectionRow {
  month: string;
  inflowOmr: number;
  closingBalanceOmr: number;
}

interface CashFlowData {
  openingBalanceOmr: number;
  assumedMonthlyInflowOmr: number;
  projection: ProjectionRow[];
}

function CashFlowTab({ companyId, t }: { companyId?: number; t: (k: string) => string }) {
  const [horizon, setHorizon] = useState(12);

  const { data, isLoading } = trpc.clientBilling.getCashFlowProjection.useQuery(
    { companyId, horizonMonths: horizon },
    { enabled: true }
  );
  const cf = data as CashFlowData | undefined;
  const projection = cf?.projection ?? [];

  const maxBalance = useMemo(
    () => Math.max(...projection.map((r) => r.closingBalanceOmr), cf?.openingBalanceOmr ?? 0, 1),
    [projection, cf]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("clientBilling.cashFlow.title")}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{t("clientBilling.cashFlow.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("clientBilling.cashFlow.horizonLabel")}:</span>
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 6, 12, 24].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("clientBilling.cashFlow.horizonMonths").replace("{{n}}", String(n))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin me-2" />
        </div>
      ) : projection.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <TrendingUp className="w-10 h-10 opacity-30" />
          <p className="font-medium">{t("clientBilling.cashFlow.noData")}</p>
          <p className="text-sm">{t("clientBilling.cashFlow.noDataHint")}</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground">{t("clientBilling.cashFlow.openingBalance")}</p>
              <p className="text-2xl font-bold mt-1">
                {(cf?.openingBalanceOmr ?? 0).toFixed(3)}{" "}
                <span className="text-sm font-normal text-muted-foreground">OMR</span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground">{t("clientBilling.cashFlow.assumedMonthlyInflow")}</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">
                {(cf?.assumedMonthlyInflowOmr ?? 0).toFixed(3)}{" "}
                <span className="text-sm font-normal text-muted-foreground">OMR</span>
              </p>
            </div>
          </div>

          {/* Bar chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-end gap-1 h-40 overflow-x-auto pb-2">
              {projection.map((row) => {
                const pct = maxBalance > 0 ? (row.closingBalanceOmr / maxBalance) * 100 : 0;
                return (
                  <div key={row.month} className="flex flex-col items-center gap-1 flex-1 min-w-[32px]">
                    <div
                      className="w-full rounded-t-sm bg-primary/80 hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                      title={`${row.month}: ${row.closingBalanceOmr.toFixed(3)} OMR`}
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                      {row.month.slice(0, 7)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("clientBilling.cashFlow.month")}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t("clientBilling.cashFlow.inflow")}</th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">{t("clientBilling.cashFlow.closingBalance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projection.map((row) => (
                  <tr key={row.month} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{row.month}</td>
                    <td className="px-4 py-3 text-end text-emerald-600">{row.inflowOmr.toFixed(3)}</td>
                    <td className="px-4 py-3 text-end font-semibold">{row.closingBalanceOmr.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientBillingPage() {
  const { t, i18n } = useTranslation("billing");
  const rtl = isRTL(i18n.language);
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t("clientBilling.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("clientBilling.pageSubtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="invoices" className="space-y-6">
        <TabsList className="h-10">
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="w-4 h-4" />
            {t("clientBilling.tabs.invoices")}
          </TabsTrigger>
          <TabsTrigger value="arAging" className="gap-2">
            <AlertCircle className="w-4 h-4" />
            {t("clientBilling.tabs.arAging")}
          </TabsTrigger>
          <TabsTrigger value="cashFlow" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            {t("clientBilling.tabs.cashFlow")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <InvoiceListTab companyId={companyId} t={t} rtl={rtl} />
        </TabsContent>
        <TabsContent value="arAging">
          <ARAgingTab companyId={companyId} t={t} />
        </TabsContent>
        <TabsContent value="cashFlow">
          <CashFlowTab companyId={companyId} t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

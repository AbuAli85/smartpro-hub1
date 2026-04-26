/**
 * Phase 3 — Payroll run execution, invoice issuance, profitability (assignment-centered).
 * Phase 3.5 — clearer forecast vs executed semantics, detail panels, state-aware actions.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, Info } from "lucide-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VIEW_COPY } from "@shared/promoterFinancialViewSemantics";
import { formatWarningAckForDisplay } from "@shared/promoterFinancialWarningAck";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";

function monthBounds(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

const viewSemanticsLabel: Record<string, string> = {
  forecast: "Forecast",
  executed: "Executed",
  mixed: "Mixed",
  incomplete: "Incomplete",
};

export default function PromoterFinanceHubPage() {
  const { user } = useAuth();
  const { activeCompanyId, activeCompany } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;
  const { caps: myCaps, loading: capsLoading } = useMyCapabilities();
  const isPlatformAdmin = Boolean(user && canAccessGlobalAdminProcedures(user));
  /** Matches server `requirePromoterFinanceControl`: approve, export, finalize payroll, issue/mark paid invoices.
   * canApprovePayroll is true for company_admin and finance_admin — same roles as before.
   * capsLoading guard prevents privileged buttons from flashing before capabilities resolve. */
  const canFinanceFinalize = !capsLoading && (isPlatformAdmin || myCaps.canApprovePayroll || myCaps.canRunPayroll);
  const [periodStart, setPeriodStart] = useState(() => monthBounds(new Date()).start);
  const [periodEnd, setPeriodEnd] = useState(() => monthBounds(new Date()).end);
  const [ackKeys, setAckKeys] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [profitMode, setProfitMode] = useState<"forecast" | "executed">("forecast");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const runsQuery = trpc.promoterFinancialOps.listPayrollRuns.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const runDetailQuery = trpc.promoterFinancialOps.getPayrollRun.useQuery(
    { companyId, runId: selectedRunId! },
    { enabled: !!companyId && selectedRunId != null && selectedRunId > 0 },
  );

  const invoicesQuery = trpc.promoterFinancialOps.listInvoices.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const invoiceDetailQuery = trpc.promoterFinancialOps.getInvoice.useQuery(
    { companyId, invoiceId: selectedInvoiceId! },
    { enabled: !!companyId && selectedInvoiceId != null && selectedInvoiceId > 0 },
  );

  const profitQuery = trpc.promoterFinancialOps.profitabilitySummary.useQuery(
    { companyId, periodStartYmd: periodStart, periodEndYmd: periodEnd, mode: profitMode },
    { enabled: !!companyId },
  );

  const invAfterList = invoicesQuery.data?.[0]?.id;
  React.useEffect(() => {
    if (selectedInvoiceId == null && invAfterList != null) {
      setSelectedInvoiceId(invAfterList);
    }
  }, [invAfterList, selectedInvoiceId]);

  const createRun = trpc.promoterFinancialOps.createPayrollRunFromStaging.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
    },
  });

  const submitReview = trpc.promoterFinancialOps.submitPayrollRunForReview.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
      void utils.promoterFinancialOps.getPayrollRun.invalidate();
    },
  });

  const approveRun = trpc.promoterFinancialOps.approvePayrollRun.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
      void utils.promoterFinancialOps.getPayrollRun.invalidate();
    },
  });

  const exportRun = trpc.promoterFinancialOps.exportPayrollRun.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
      void utils.promoterFinancialOps.getPayrollRun.invalidate();
    },
  });

  const markPaid = trpc.promoterFinancialOps.markPayrollRunPaid.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
      void utils.promoterFinancialOps.getPayrollRun.invalidate();
    },
  });

  const createInvoices = trpc.promoterFinancialOps.createInvoicesFromStaging.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listInvoices.invalidate(),
  });

  const issueInv = trpc.promoterFinancialOps.issueInvoice.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listInvoices.invalidate();
      void utils.promoterFinancialOps.getInvoice.invalidate();
    },
  });

  const markInvoicePaidMut = trpc.promoterFinancialOps.markInvoicePaid.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listInvoices.invalidate();
      void utils.promoterFinancialOps.getInvoice.invalidate();
    },
  });

  const ackParsed = useMemo(() => {
    const keys = ackKeys
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return keys.length ? keys : undefined;
  }, [ackKeys]);

  const semantics = profitQuery.data?.viewSemantics ?? "incomplete";
  const showMixedWarning =
    profitQuery.data?.meta &&
    (profitQuery.data.meta.forecastRevenue > 0 || profitQuery.data.meta.forecastCost > 0) &&
    (profitQuery.data.meta.executedRevenue > 0 || profitQuery.data.meta.executedCost > 0);

  return (
    <TooltipProvider>
      <div className="container max-w-7xl py-8 space-y-6">
        <HubBreadcrumb
          items={[
            { label: "HR", href: "/hr/employees" },
            { label: "Promoter finance (Phase 3)", href: "/hr/promoter-finance" },
          ]}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-primary" />
              Promoter finance execution
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Payroll runs and invoices from staging snapshots. Staging:{" "}
              <Link href="/hr/promoter-staging" className="text-primary underline">
                promoter staging
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label>Period start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Period end</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label>Warning ack keys (comma-separated)</Label>
            <Input
              placeholder="e.g. low_attendance_vs_overlap, monthly_estimate_only"
              value={ackKeys}
              onChange={(e) => setAckKeys(e.target.value)}
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <Label>Reviewer note (for estimate/proration)</Label>
            <Input value={reviewerNote} onChange={(e) => setReviewerNote(e.target.value)} />
          </div>
        </div>

        <Tabs defaultValue="payroll">
          <TabsList>
            <TabsTrigger value="payroll">Payroll runs</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="profit">Profitability</TabsTrigger>
          </TabsList>

          <TabsContent value="payroll" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Create run from payroll staging</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!companyId || createRun.isPending}
                  onClick={() =>
                    createRun.mutate({
                      companyId,
                      periodStartYmd: periodStart,
                      periodEndYmd: periodEnd,
                      acceptedWarningKeys: ackParsed,
                      reviewerNote: reviewerNote || undefined,
                    })
                  }
                >
                  {createRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create payroll run"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Runs</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Select a row to inspect frozen lines and warning overrides. Approve, export, and mark paid require
                  company or finance admin.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto space-y-4">
                {runsQuery.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>ID</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total accrued (OMR)</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(runsQuery.data ?? []).map((r) => (
                        <TableRow
                          key={r.id}
                          data-state={selectedRunId === r.id ? "selected" : undefined}
                          className={selectedRunId === r.id ? "bg-muted/50" : undefined}
                        >
                          <TableCell>
                            <Button size="sm" variant="ghost" type="button" onClick={() => setSelectedRunId(r.id)}>
                              View
                            </Button>
                          </TableCell>
                          <TableCell>{r.id}</TableCell>
                          <TableCell className="text-xs">
                            {r.periodStartYmd} — {r.periodEndYmd}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.status}</Badge>
                          </TableCell>
                          <TableCell className="tabular-nums">{r.totalAccruedOmr}</TableCell>
                          <TableCell className="flex flex-wrap gap-1">
                            {r.status === "draft" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  disabled={submitReview.isPending}
                                  onClick={() => submitReview.mutate({ companyId, runId: r.id })}
                                >
                                  Submit for review
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  type="button"
                                  disabled={approveRun.isPending || !canFinanceFinalize}
                                  title={
                                    !canFinanceFinalize
                                      ? "Only company or finance administrators can approve payroll runs"
                                      : undefined
                                  }
                                  onClick={() => approveRun.mutate({ companyId, runId: r.id })}
                                >
                                  Approve
                                </Button>
                              </>
                            )}
                            {r.status === "review_ready" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                type="button"
                                disabled={approveRun.isPending || !canFinanceFinalize}
                                title={
                                  !canFinanceFinalize
                                    ? "Only company or finance administrators can approve payroll runs"
                                    : undefined
                                }
                                onClick={() => approveRun.mutate({ companyId, runId: r.id })}
                              >
                                Approve
                              </Button>
                            )}
                            {(r.status === "approved" || r.status === "exported" || r.status === "paid") && (
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={exportRun.isPending || !canFinanceFinalize}
                                title={
                                  !canFinanceFinalize
                                    ? "Only company or finance administrators can export payroll"
                                    : undefined
                                }
                                onClick={() =>
                                  exportRun.mutate(
                                    { companyId, runId: r.id },
                                    {
                                      onSuccess: (res) => {
                                        if (res.csvText) {
                                          const blob = new Blob([res.csvText], { type: "text/csv" });
                                          const a = document.createElement("a");
                                          a.href = URL.createObjectURL(blob);
                                          a.download = `payroll-run-${r.id}-v${res.exportGeneration ?? ""}.csv`;
                                          a.click();
                                        }
                                      },
                                    },
                                  )
                                }
                              >
                                Export CSV
                              </Button>
                            )}
                            {(r.status === "approved" || r.status === "exported") && (
                              <Button
                                size="sm"
                                type="button"
                                disabled={markPaid.isPending || !canFinanceFinalize}
                                title={
                                  !canFinanceFinalize
                                    ? "Only company or finance administrators can mark payroll paid"
                                    : undefined
                                }
                                onClick={() => markPaid.mutate({ companyId, runId: r.id })}
                              >
                                Mark paid
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {selectedRunId != null && (
                  <Card className="border-dashed">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Run detail — #{selectedRunId}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3">
                      {runDetailQuery.isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : runDetailQuery.data ? (
                        <>
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge>{runDetailQuery.data.run.status}</Badge>
                            <span className="text-muted-foreground text-xs">
                              Lines: {runDetailQuery.data.lines.length} · Total:{" "}
                              {runDetailQuery.data.run.totalAccruedOmr} OMR
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Warning override</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatWarningAckForDisplay(runDetailQuery.data.warningAck)}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">Export / artifact</span>
                            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                              <li>Generation: {runDetailQuery.data.run.exportGeneration ?? 0}</li>
                              {runDetailQuery.data.run.exportCsvUrl && (
                                <li>
                                  <a
                                    className="text-primary underline"
                                    href={runDetailQuery.data.run.exportCsvUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Stored CSV
                                  </a>
                                </li>
                              )}
                              {runDetailQuery.data.run.exportedAt && (
                                <li>Exported at: {String(runDetailQuery.data.run.exportedAt)}</li>
                              )}
                            </ul>
                          </div>
                          <div className="max-h-56 overflow-auto scrollbar-hidden border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Assignment</TableHead>
                                  <TableHead className="text-xs">Accrued</TableHead>
                                  <TableHead className="text-xs">Readiness</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {runDetailQuery.data.lines.map((ln) => (
                                  <TableRow key={ln.id}>
                                    <TableCell className="font-mono text-xs">{ln.assignmentId}</TableCell>
                                    <TableCell className="tabular-nums text-xs">{ln.accruedPayOmr}</TableCell>
                                    <TableCell className="text-xs">{ln.readinessSnapshot}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-xs">Could not load run.</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Create draft invoices from billing staging</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  disabled={!companyId || createInvoices.isPending}
                  onClick={() =>
                    createInvoices.mutate({
                      companyId,
                      periodStartYmd: periodStart,
                      periodEndYmd: periodEnd,
                      monthlyBillingMode: "flat_if_any_overlap",
                      acceptedWarningKeys: ackParsed,
                      reviewerNote: reviewerNote || undefined,
                    })
                  }
                >
                  {createInvoices.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create invoices"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invoices</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Select View for line items and warning snapshot. Issue and mark paid require company or finance
                  admin.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto space-y-4">
                {invoicesQuery.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>No.</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invoicesQuery.data ?? []).map((inv) => (
                        <TableRow
                          key={inv.id}
                          className={selectedInvoiceId === inv.id ? "bg-muted/50" : undefined}
                        >
                          <TableCell>
                            <Button size="sm" variant="ghost" type="button" onClick={() => setSelectedInvoiceId(inv.id)}>
                              View
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell>{inv.clientCompanyId}</TableCell>
                          <TableCell className="text-xs">
                            {inv.periodStartYmd} — {inv.periodEndYmd}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {inv.totalOmr} {inv.currencyCode}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="flex flex-wrap gap-1">
                            {(inv.status === "draft" || inv.status === "review_ready") && (
                              <Button
                                size="sm"
                                type="button"
                                disabled={issueInv.isPending || !canFinanceFinalize}
                                title={
                                  !canFinanceFinalize
                                    ? "Only company or finance administrators can issue invoices"
                                    : undefined
                                }
                                onClick={() => issueInv.mutate({ companyId, invoiceId: inv.id })}
                              >
                                Issue
                              </Button>
                            )}
                            {(inv.status === "issued" ||
                              inv.status === "sent" ||
                              inv.status === "partially_paid") && (
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={markInvoicePaidMut.isPending || !canFinanceFinalize}
                                title={
                                  !canFinanceFinalize
                                    ? "Only company or finance administrators can mark invoices paid"
                                    : undefined
                                }
                                onClick={() => markInvoicePaidMut.mutate({ companyId, invoiceId: inv.id })}
                              >
                                Mark paid
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {selectedInvoiceId != null && (
                  <Card className="border-dashed">
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Invoice detail — #{selectedInvoiceId}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-3">
                      {invoiceDetailQuery.isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : invoiceDetailQuery.data ? (
                        <>
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge>{invoiceDetailQuery.data.invoice.status}</Badge>
                            <span className="text-muted-foreground text-xs font-mono">
                              {invoiceDetailQuery.data.invoice.invoiceNumber}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Client company: {invoiceDetailQuery.data.invoice.clientCompanyId} · Monthly mode:{" "}
                            {invoiceDetailQuery.data.invoice.monthlyBillingMode}
                          </p>
                          <div>
                            <span className="font-medium">Warning override</span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatWarningAckForDisplay(invoiceDetailQuery.data.warningAck)}
                            </p>
                          </div>
                          <div className="max-h-48 overflow-auto scrollbar-hidden border rounded-md">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Assignment</TableHead>
                                  <TableHead className="text-xs">Line total</TableHead>
                                  <TableHead className="text-xs">Estimate</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {invoiceDetailQuery.data.lines.map((ln) => (
                                  <TableRow key={ln.id}>
                                    <TableCell className="font-mono text-xs">{ln.assignmentId}</TableCell>
                                    <TableCell className="tabular-nums text-xs">{ln.lineTotalOmr}</TableCell>
                                    <TableCell className="text-xs">
                                      {ln.monthlyEstimateOnly ? "yes" : "no"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      ) : (
                        <p className="text-muted-foreground text-xs">Could not load invoice.</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profit" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2 items-center">
                <Label>View mode</Label>
                <select
                  className="border rounded-md h-9 px-2 text-sm bg-background"
                  value={profitMode}
                  onChange={(e) => setProfitMode(e.target.value as "forecast" | "executed")}
                >
                  <option value="forecast">Forecast (staging-based)</option>
                  <option value="executed">Executed (finalized runs + issued invoices)</option>
                </select>
              </div>
              {profitQuery.data && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={semantics === "mixed" ? "default" : "outline"} className="gap-1">
                      {viewSemanticsLabel[semantics] ?? semantics}
                      <Info className="h-3 w-3" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-xs space-y-1">
                    <p>{VIEW_COPY.forecastMargin}</p>
                    <p>{VIEW_COPY.executedMargin}</p>
                    <p>{VIEW_COPY.mixed}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {showMixedWarning && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Mixed forecast and executed data this period</AlertTitle>
                <AlertDescription className="text-xs">
                  {VIEW_COPY.mixed} Switch the view mode to see staging-based vs finalized totals; do not treat them as
                  interchangeable.
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  Margin summary
                  {profitMode === "forecast" && (
                    <Badge variant="secondary">Provisional — staging only</Badge>
                  )}
                  {profitMode === "executed" && (
                    <Badge variant="secondary">Finalized slices only</Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  <strong>Forecast:</strong> {VIEW_COPY.forecastBilling} {VIEW_COPY.forecastPayroll}{" "}
                  <strong>Executed:</strong> {VIEW_COPY.issuedBilling} {VIEW_COPY.executedPayroll}
                </p>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-3 text-sm">
                {profitQuery.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <div>
                      <div className="text-muted-foreground text-xs">Revenue ({profitMode})</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {profitQuery.data?.revenue?.toFixed?.(3) ?? profitQuery.data?.revenue ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Payroll cost ({profitMode})</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {profitQuery.data?.payrollCost?.toFixed?.(3) ?? profitQuery.data?.payrollCost ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Gross margin</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {profitQuery.data?.grossMargin?.toFixed?.(3) ?? profitQuery.data?.grossMargin ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {profitQuery.data?.grossMarginPercent != null
                          ? `${profitQuery.data.grossMarginPercent.toFixed(1)}%`
                          : ""}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Excluded / incomplete (this view)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Rows blocked in forecast, or payroll runs / invoices not in a finalized state for executed mode.
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto max-h-64">
                {(profitQuery.data?.exclusions?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">None for the selected mode.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Kind</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                        <TableHead className="text-xs">Assignment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(profitQuery.data?.exclusions ?? []).map((ex, i) => (
                        <TableRow key={`${ex.kind}-${i}`}>
                          <TableCell className="text-xs font-mono">{ex.kind}</TableCell>
                          <TableCell className="text-xs">{ex.reason}</TableCell>
                          <TableCell className="text-xs font-mono">{ex.assignmentId ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

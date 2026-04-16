/**
 * Phase 3 — Payroll run execution, invoice issuance, profitability (assignment-centered).
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
import { Loader2, DollarSign } from "lucide-react";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function monthBounds(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export default function PromoterFinanceHubPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;
  const [periodStart, setPeriodStart] = useState(() => monthBounds(new Date()).start);
  const [periodEnd, setPeriodEnd] = useState(() => monthBounds(new Date()).end);
  const [ackKeys, setAckKeys] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [profitMode, setProfitMode] = useState<"forecast" | "executed">("forecast");

  const utils = trpc.useUtils();

  const runsQuery = trpc.promoterFinancialOps.listPayrollRuns.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const invoicesQuery = trpc.promoterFinancialOps.listInvoices.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const profitQuery = trpc.promoterFinancialOps.profitabilitySummary.useQuery(
    { companyId, periodStartYmd: periodStart, periodEndYmd: periodEnd, mode: profitMode },
    { enabled: !!companyId },
  );

  const createRun = trpc.promoterFinancialOps.createPayrollRunFromStaging.useMutation({
    onSuccess: () => {
      void utils.promoterFinancialOps.listPayrollRuns.invalidate();
    },
  });

  const approveRun = trpc.promoterFinancialOps.approvePayrollRun.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listPayrollRuns.invalidate(),
  });

  const exportRun = trpc.promoterFinancialOps.exportPayrollRun.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listPayrollRuns.invalidate(),
  });

  const markPaid = trpc.promoterFinancialOps.markPayrollRunPaid.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listPayrollRuns.invalidate(),
  });

  const createInvoices = trpc.promoterFinancialOps.createInvoicesFromStaging.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listInvoices.invalidate(),
  });

  const issueInv = trpc.promoterFinancialOps.issueInvoice.useMutation({
    onSuccess: () => void utils.promoterFinancialOps.listInvoices.invalidate(),
  });

  const ackParsed = useMemo(() => {
    const keys = ackKeys
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return keys.length ? keys : undefined;
  }, [ackKeys]);

  return (
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
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {runsQuery.isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total accrued (OMR)</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runsQuery.data ?? []).map((r) => (
                      <TableRow key={r.id}>
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
                            <Button
                              size="sm"
                              variant="secondary"
                              type="button"
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
                              onClick={() =>
                                exportRun.mutate(
                                  { companyId, runId: r.id },
                                  {
                                    onSuccess: (res) => {
                                      if (res.csvText) {
                                        const blob = new Blob([res.csvText], { type: "text/csv" });
                                        const a = document.createElement("a");
                                        a.href = URL.createObjectURL(blob);
                                        a.download = `payroll-run-${r.id}.csv`;
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
                          {r.status !== "paid" && r.status !== "cancelled" && (
                            <Button
                              size="sm"
                              type="button"
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
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {invoicesQuery.isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      <TableRow key={inv.id}>
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
                        <TableCell>
                          {inv.status === "draft" && (
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => issueInv.mutate({ companyId, invoiceId: inv.id })}
                            >
                              Issue
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Label>View</Label>
            <select
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={profitMode}
              onChange={(e) => setProfitMode(e.target.value as "forecast" | "executed")}
            >
              <option value="forecast">Forecast (staging)</option>
              <option value="executed">Executed (runs + issued invoices)</option>
            </select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Margin summary</CardTitle>
              <p className="text-xs text-muted-foreground">
                Forecast uses staging only. Executed uses approved/paid payroll runs and issued invoices overlapping
                the period.
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

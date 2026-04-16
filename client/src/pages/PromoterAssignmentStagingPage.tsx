/**
 * Phase 2 — Payroll & billing staging, execution summary (assignment-centered).
 * Phase 2.5 — Mismatch visibility, readiness, monthly billing mode, trust strip.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { Loader2, Users } from "lucide-react";
import { Link } from "wouter";
import type { MismatchSignal } from "@shared/promoterAssignmentMismatchSignals";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthBounds(d: Date): { start: string; end: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

type ReadinessFilter = "all" | "ready" | "warning" | "blocked" | "needs_action";

function filterRows<T extends { readiness: string }>(rows: T[], filter: ReadinessFilter): T[] {
  if (filter === "all") return rows;
  if (filter === "needs_action") return rows.filter((r) => r.readiness !== "ready");
  return rows.filter((r) => r.readiness === filter);
}

function readinessBadgeClass(readiness: string): string {
  if (readiness === "ready") return "bg-emerald-600 hover:bg-emerald-600";
  if (readiness === "warning") return "bg-amber-600 hover:bg-amber-600 text-white";
  if (readiness === "not_applicable") return "bg-slate-500 hover:bg-slate-500";
  return "";
}

export default function PromoterAssignmentStagingPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;
  const [periodStart, setPeriodStart] = useState(() => monthBounds(new Date()).start);
  const [periodEnd, setPeriodEnd] = useState(() => monthBounds(new Date()).end);
  const [filter, setFilter] = useState<ReadinessFilter>("all");
  const [monthlyBillingMode, setMonthlyBillingMode] = useState<"flat_if_any_overlap" | "prorated_by_calendar_days">(
    "flat_if_any_overlap",
  );
  const [mismatchCategory, setMismatchCategory] = useState<"all" | MismatchSignal>("all");

  const { data: exec, isLoading: execLoading } = trpc.promoterAssignmentOps.executionSummary.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const { data: mismatchAgg, isLoading: mismatchLoading } = trpc.promoterAssignmentOps.mismatchSummary.useQuery(
    { companyId, dateFromYmd: periodStart, dateToYmd: periodEnd },
    { enabled: !!companyId },
  );

  const { data: mismatchRows, isLoading: mismatchRowsLoading } = trpc.promoterAssignmentOps.mismatchDetail.useQuery(
    {
      companyId,
      dateFromYmd: periodStart,
      dateToYmd: periodEnd,
      category: mismatchCategory,
      limit: 150,
    },
    { enabled: !!companyId },
  );

  const payrollQuery = trpc.promoterAssignmentOps.payrollStaging.useQuery(
    { companyId, periodStartYmd: periodStart, periodEndYmd: periodEnd },
    { enabled: !!companyId },
  );

  const billingQuery = trpc.promoterAssignmentOps.billingStaging.useQuery(
    {
      companyId,
      periodStartYmd: periodStart,
      periodEndYmd: periodEnd,
      monthlyBillingMode,
    },
    { enabled: !!companyId },
  );

  const payrollRows = useMemo(
    () => filterRows(payrollQuery.data?.rows ?? [], filter),
    [payrollQuery.data, filter],
  );

  const billingRows = useMemo(
    () => filterRows(billingQuery.data?.rows ?? [], filter),
    [billingQuery.data, filter],
  );

  const bySignal = mismatchAgg?.bySignal ?? {};

  const mismatchCards = [
    { key: "unlinked_attendance", label: "Unlinked attendance" },
    { key: "wrong_site_attendance", label: "Wrong site" },
    { key: "future_assignment_attendance_attempt", label: "Future assignment" },
    { key: "suspended_assignment_attendance_attempt", label: "Suspended assignment" },
    { key: "multiple_operational_assignments", label: "Ambiguous resolution" },
  ] as const;

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <HubBreadcrumb
        items={[
          { label: "HR", href: "/hr/employees" },
          { label: "Promoter assignment staging", href: "/hr/promoter-staging" },
        ]}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Promoter execution & staging
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assignment-centered attendance linkage, payroll staging, and billing staging. Back to{" "}
            <Link href="/hr/promoter-assignment-ops" className="text-primary underline">
              operations
            </Link>
            . Phase 3 finance:{" "}
            <Link href="/hr/promoter-finance" className="text-primary underline">
              payroll &amp; invoices
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Execution trust strip — today + period staging readiness */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Execution trust strip</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
          {execLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div>
                <div className="text-muted-foreground text-xs">Operational assignments (today)</div>
                <div className="text-lg font-semibold tabular-nums">{exec?.operationalAssignmentsToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Linked attendance (today)</div>
                <div className="text-lg font-semibold tabular-nums">{exec?.attendanceResolvedToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Mismatch signals (today)</div>
                <div className="text-lg font-semibold tabular-nums">{exec?.mismatchIssueCountToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Payroll ready (period)</div>
                <div className="text-lg font-semibold tabular-nums">
                  {payrollQuery.data?.summary?.ready ?? "—"}
                  {payrollQuery.data?.summary != null && (
                    <span className="text-muted-foreground font-normal text-xs ml-1">
                      / {payrollQuery.data.summary.totalRows}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Billing ready (period)</div>
                <div className="text-lg font-semibold tabular-nums">
                  {billingQuery.data?.summary?.ready ?? "—"}
                  {billingQuery.data?.summary != null && (
                    <span className="text-muted-foreground font-normal text-xs ml-1">
                      / {billingQuery.data.summary.totalRows}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Today&apos;s execution (summary)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3 text-sm">
          {execLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <div>
                <div className="text-muted-foreground text-xs">Unresolved attendance</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.attendanceUnresolvedToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Future-assignment attempts (today)</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.futureAssignmentAttendanceAttempts ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Suspended attempts (placeholder)</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.suspendedAttemptedAttendance ?? "—"}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mismatch dashboard */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Mismatch &amp; compliance (selected period)</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Classified sample up to 2k rows · total clock rows in range:{" "}
              {mismatchLoading ? "…" : (mismatchAgg?.totalAttendanceInRange ?? "—")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Label className="text-xs sr-only">Mismatch category</Label>
            <select
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={mismatchCategory}
              onChange={(e) => setMismatchCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              <option value="none">No mismatch only</option>
              <option value="unlinked_attendance">Unlinked</option>
              <option value="wrong_site_attendance">Wrong site</option>
              <option value="future_assignment_attendance_attempt">Future assignment</option>
              <option value="suspended_assignment_attendance_attempt">Suspended</option>
              <option value="multiple_operational_assignments">Ambiguous</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {mismatchCards.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 ${
                  mismatchCategory === c.key ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setMismatchCategory(mismatchCategory === c.key ? "all" : c.key)}
              >
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {mismatchLoading ? "—" : (bySignal[c.key as keyof typeof bySignal] ?? 0)}
                </div>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            Issues in sample: {mismatchLoading ? "…" : (mismatchAgg?.issuesCount ?? "—")} · Ambiguous:{" "}
            {mismatchAgg?.ambiguousResolutionCases ?? "—"}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Assignment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mismatchRowsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : (
                  (mismatchRows ?? [])
                    .filter((r) => r.mismatchSignal !== "none")
                    .slice(0, 50)
                    .map((r) => (
                      <TableRow key={r.attendanceRecordId}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.businessDateYmd} {r.checkIn instanceof Date ? r.checkIn.toISOString().slice(11, 16) : ""}
                        </TableCell>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          <span className="font-mono">{r.mismatchSignal}</span>
                          <div className="text-muted-foreground mt-0.5">{r.reason}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.siteName ?? "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{r.promoterAssignmentId ?? "—"}</TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>Period start</Label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Period end</Label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setPeriodStart(todayYmd())}>
          Today as start
        </Button>
        <div className="space-y-1">
          <Label>Row readiness</Label>
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background"
            value={filter}
            onChange={(e) => setFilter(e.target.value as ReadinessFilter)}
          >
            <option value="all">All rows</option>
            <option value="ready">Ready only</option>
            <option value="warning">Warnings only</option>
            <option value="blocked">Blocked only</option>
            <option value="needs_action">Needs action (not ready)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Monthly billing rule</Label>
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background max-w-[260px]"
            value={monthlyBillingMode}
            onChange={(e) =>
              setMonthlyBillingMode(e.target.value as "flat_if_any_overlap" | "prorated_by_calendar_days")
            }
          >
            <option value="flat_if_any_overlap">per_month: flat if any overlap</option>
            <option value="prorated_by_calendar_days">per_month: prorated by calendar days</option>
          </select>
        </div>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll staging</TabsTrigger>
          <TabsTrigger value="billing">Billing staging</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Payroll staging summary</CardTitle>
              {payrollQuery.data?.summary && (
                <p className="text-xs text-muted-foreground">
                  Total {payrollQuery.data.summary.totalRows} · Ready {payrollQuery.data.summary.ready} · Warning{" "}
                  {payrollQuery.data.summary.warning} · Blocked {payrollQuery.data.summary.blocked}
                  {payrollQuery.data.summary.topWarnings?.length ? (
                    <span className="block mt-1">
                      Top warnings:{" "}
                      {payrollQuery.data.summary.topWarnings.map((w) => `${w.reason} (${w.count})`).join(", ")}
                    </span>
                  ) : null}
                </p>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {payrollQuery.isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Overlap days</TableHead>
                      <TableHead>Att. days</TableHead>
                      <TableHead>Readiness</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead>Blockers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollRows.map((r) => (
                      <TableRow key={r.assignmentId}>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell>{r.brandName}</TableCell>
                        <TableCell>{r.assignmentStatus}</TableCell>
                        <TableCell className="tabular-nums">{r.overlapDays}</TableCell>
                        <TableCell className="tabular-nums">{r.attendanceDaysInPeriod}</TableCell>
                        <TableCell>
                          <Badge
                            variant={r.readiness === "ready" ? "default" : "destructive"}
                            className={readinessBadgeClass(r.readiness)}
                          >
                            {r.readiness}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] text-xs text-amber-800 dark:text-amber-200">
                          {(r.warnings ?? []).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                          {r.blockers.join(", ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="billing" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Billing staging summary</CardTitle>
              {billingQuery.data?.summary && (
                <p className="text-xs text-muted-foreground">
                  Total {billingQuery.data.summary.totalRows} · Ready {billingQuery.data.summary.ready} · Warning{" "}
                  {billingQuery.data.summary.warning} · Blocked {billingQuery.data.summary.blocked} · Amount (resolved){" "}
                  {billingQuery.data.summary.totalBillableAmount}
                </p>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {billingQuery.isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Units</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Monthly</TableHead>
                      <TableHead>Readiness</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead>Blockers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingRows.map((r) => (
                      <TableRow key={r.assignmentId}>
                        <TableCell className="font-medium">{r.employeeName}</TableCell>
                        <TableCell>{r.brandName}</TableCell>
                        <TableCell>{r.billingModel ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{r.billableUnits ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">
                          {r.billableAmount != null ? `${r.billableAmount} ${r.currencyCode}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{r.monthlyBillingMode}</div>
                          {r.billingModel === "per_month" && (
                            <div className="text-muted-foreground mt-1">
                              {r.monthlyProrationSensitive ? "Proration-sensitive" : "Not proration-sensitive"} ·{" "}
                              {r.monthlyEstimateOnly ? "Estimate under flat overlap rule" : "—"}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={r.readiness === "ready" ? "default" : "destructive"}
                            className={readinessBadgeClass(r.readiness)}
                          >
                            {r.readiness}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] text-xs text-amber-800 dark:text-amber-200">
                          {(r.warnings ?? []).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                          {r.blockers.join(", ") || "—"}
                        </TableCell>
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
  );
}

/**
 * Phase 2 — Payroll & billing staging, execution summary (assignment-centered).
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

export default function PromoterAssignmentStagingPage() {
  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;
  const [periodStart, setPeriodStart] = useState(() => monthBounds(new Date()).start);
  const [periodEnd, setPeriodEnd] = useState(() => monthBounds(new Date()).end);
  const [filter, setFilter] = useState<"all" | "ready" | "blocked">("all");

  const { data: exec, isLoading: execLoading } = trpc.promoterAssignmentOps.executionSummary.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const payrollQuery = trpc.promoterAssignmentOps.payrollStaging.useQuery(
    { companyId, periodStartYmd: periodStart, periodEndYmd: periodEnd },
    { enabled: !!companyId },
  );

  const billingQuery = trpc.promoterAssignmentOps.billingStaging.useQuery(
    { companyId, periodStartYmd: periodStart, periodEndYmd: periodEnd },
    { enabled: !!companyId },
  );

  const payrollRows = useMemo(() => {
    const rows = payrollQuery.data?.rows ?? [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.readiness === filter);
  }, [payrollQuery.data, filter]);

  const billingRows = useMemo(() => {
    const rows = billingQuery.data?.rows ?? [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.readiness === filter);
  }, [billingQuery.data, filter]);

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
            .
          </p>
        </div>
      </div>

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
                <div className="text-muted-foreground text-xs">Operational assignments</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.operationalAssignmentsToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Attendance resolved (linked)</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.attendanceResolvedToday ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Unresolved attendance</div>
                <div className="text-xl font-semibold tabular-nums">{exec?.attendanceUnresolvedToday ?? "—"}</div>
              </div>
            </>
          )}
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
          <Label>Readiness</Label>
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "ready" | "blocked")}
          >
            <option value="all">All rows</option>
            <option value="ready">Ready only</option>
            <option value="blocked">Blocked only</option>
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
                  Total {payrollQuery.data.summary.totalRows} · Ready {payrollQuery.data.summary.ready} · Blocked{" "}
                  {payrollQuery.data.summary.blocked}
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
                          <Badge variant={r.readiness === "ready" ? "default" : "destructive"}>
                            {r.readiness}
                          </Badge>
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
                  Total {billingQuery.data.summary.totalRows} · Ready {billingQuery.data.summary.ready} · Blocked{" "}
                  {billingQuery.data.summary.blocked} · Amount (resolved) {billingQuery.data.summary.totalBillableAmount}
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
                      <TableHead>Readiness</TableHead>
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
                        <TableCell>
                          <Badge variant={r.readiness === "ready" ? "default" : "destructive"}>
                            {r.readiness}
                          </Badge>
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

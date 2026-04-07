import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Award, TrendingDown, TrendingUp, Minus } from "lucide-react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    on_track: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
    watch: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    at_risk: "bg-orange-600/20 text-orange-800 dark:text-orange-200",
    critical: "bg-red-600/20 text-red-900 dark:text-red-200",
  };
  return <Badge className={map[status] ?? ""}>{status.replace(/_/g, " ")}</Badge>;
}

function TrendIcon({ t }: { t: "improving" | "flat" | "declining" }) {
  if (t === "improving") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (t === "declining") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function HRAccountabilityPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [dept, setDept] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();

  const { data: employees } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    for (const e of employees ?? []) {
      if (e.department) s.add(e.department);
    }
    return Array.from(s).sort();
  }, [employees]);

  const {
    data: team,
    isLoading: teamLoading,
    error: teamErr,
  } = trpc.accountabilityPerformance.listTeamScorecards.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      year,
      month,
      department: dept === "all" ? undefined : dept,
      limit: 150,
    },
    { enabled: activeCompanyId != null }
  );

  const { data: scorecard, isLoading: scLoading } = trpc.accountabilityPerformance.getPersonScorecard.useQuery(
    { employeeId: selectedId!, companyId: activeCompanyId ?? undefined, year, month },
    { enabled: activeCompanyId != null && selectedId != null }
  );

  const { data: acc } = trpc.accountabilityPerformance.getAccountability.useQuery(
    { employeeId: selectedId!, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && selectedId != null }
  );

  const { data: departments } = trpc.hr.listDepartments.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const upsert = trpc.accountabilityPerformance.upsertAccountability.useMutation({
    onSuccess: async () => {
      toast.success("Accountability saved");
      await utils.accountabilityPerformance.getAccountability.invalidate();
      await utils.accountabilityPerformance.listTeamScorecards.invalidate();
      await utils.accountabilityPerformance.getPersonScorecard.invalidate();
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });

  const [formResp, setFormResp] = useState("");
  const [formKpi, setFormKpi] = useState("");
  const [formCadence, setFormCadence] = useState<"daily" | "weekly" | "biweekly" | "monthly">("weekly");
  const [formDept, setFormDept] = useState<string>("");
  const [formEsc, setFormEsc] = useState<string>("");
  const [formRoleKey, setFormRoleKey] = useState("");
  const [formNotes, setFormNotes] = useState("");

  React.useEffect(() => {
    if (!acc) return;
    const o = acc.overlay;
    setFormResp((o?.responsibilities ?? []).join("\n"));
    setFormKpi((o?.kpiCategoryKeys ?? []).join(", "));
    setFormCadence((o?.reviewCadence as typeof formCadence) ?? "weekly");
    setFormDept(o?.departmentId != null ? String(o.departmentId) : "");
    setFormEsc(o?.escalationEmployeeId != null ? String(o.escalationEmployeeId) : "");
    setFormRoleKey(o?.businessRoleKey ?? "");
    setFormNotes(o?.notes ?? "");
  }, [acc, selectedId]);

  function saveAccountability() {
    if (selectedId == null || activeCompanyId == null) return;
    const deptId =
      formDept === "" || formDept === "__none" ? null : Number.parseInt(formDept, 10);
    const escId =
      formEsc.trim() === "" ? null : Number.parseInt(formEsc.trim(), 10);
    if (deptId != null && Number.isNaN(deptId)) {
      toast.error("Invalid department id");
      return;
    }
    if (escId != null && Number.isNaN(escId)) {
      toast.error("Invalid escalation employee id");
      return;
    }
    upsert.mutate({
      companyId: activeCompanyId,
      employeeId: selectedId,
      responsibilities: formResp
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      kpiCategoryKeys: formKpi
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      reviewCadence: formCadence,
      departmentId: deptId,
      escalationEmployeeId: escId,
      businessRoleKey: formRoleKey === "" ? null : formRoleKey,
      notes: formNotes === "" ? null : formNotes,
    });
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Award className="h-7 w-7" />
            Accountability &amp; scorecards
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Person-level ownership, blended signals (tasks, KPI, attendance, requests), and underperformance
            detection for managers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((n, i) => (
                <SelectItem key={n} value={String(i + 1)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {teamErr && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load team scorecards</AlertTitle>
          <AlertDescription>{teamErr.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>People</CardTitle>
            <CardDescription>Ranked by risk (severity), then composite score.</CardDescription>
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">Department filter</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {deptOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamLoading && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {(team?.rows ?? []).map((row) => (
                    <TableRow
                      key={row.employeeId}
                      className={selectedId === row.employeeId ? "bg-muted/50" : "cursor-pointer"}
                      onClick={() => setSelectedId(row.employeeId)}
                    >
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.department ?? "—"}</div>
                      </TableCell>
                      <TableCell>{statusBadge(row.assessment.status)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          <TrendIcon t={row.trend} />
                          {row.compositeScore}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Person detail</CardTitle>
            <CardDescription>
              {selectedId == null
                ? "Select a person from the list."
                : `${scorecard?.employee.firstName ?? ""} ${scorecard?.employee.lastName ?? ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedId == null && (
              <p className="text-sm text-muted-foreground">Choose a row to load signals and accountability.</p>
            )}
            {selectedId != null && scLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {scorecard && (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  {statusBadge(scorecard.assessment.status)}
                  <Badge variant="outline">Risk: {scorecard.riskLevel}</Badge>
                  <Badge variant="secondary">Composite {scorecard.compositeScore}</Badge>
                  <Badge variant="outline" className="gap-1">
                    <TrendIcon t={scorecard.trend} /> Trend
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border p-3 space-y-1">
                    <div className="font-medium">Tasks</div>
                    <div>Overdue: {scorecard.signals.overdueTaskCount}</div>
                    <div>Open: {scorecard.signals.openTaskCount}</div>
                    <div>Blocked: {scorecard.signals.blockedTaskCount}</div>
                    <div className="text-muted-foreground text-xs">
                      Completed (7d / prev 7d): {scorecard.signals.tasksCompletedLast7d} /{" "}
                      {scorecard.signals.tasksCompletedPrev7d}
                    </div>
                  </div>
                  <div className="rounded-md border p-3 space-y-1">
                    <div className="font-medium">KPI &amp; attendance</div>
                    <div>
                      KPI avg:{" "}
                      {scorecard.signals.kpiAvgPct != null ? `${Math.round(scorecard.signals.kpiAvgPct)}%` : "—"}
                    </div>
                    <div>Weak metrics (&lt;50%): {scorecard.signals.kpiWeakMetricCount}</div>
                    <div>
                      Late / absent (14d): {scorecard.signals.attendanceLateCount} /{" "}
                      {scorecard.signals.attendanceAbsentCount}
                    </div>
                    <div>Pending requests: {scorecard.signals.pendingEmployeeRequests}</div>
                  </div>
                </div>

                {scorecard.assessment.reasons.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="text-sm font-medium mb-1">Reasons</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {scorecard.assessment.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {scorecard.assessment.recommendedManagerActions.length > 0 && (
                  <div className="rounded-md border p-3">
                    <div className="text-sm font-medium mb-1">Recommended manager actions</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {scorecard.assessment.recommendedManagerActions.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">Effective accountability</div>
                  <div className="text-sm text-muted-foreground">
                    Role: {scorecard.accountability.displayRole ?? "—"} · Dept:{" "}
                    {scorecard.accountability.departmentLabel ?? "—"} · Cadence:{" "}
                    {scorecard.accountability.reviewCadence}
                  </div>
                  <ul className="list-disc pl-5 text-sm">
                    {(scorecard.accountability.responsibilities ?? []).map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="text-sm font-medium">Edit accountability (HR / performance managers)</div>
                  <div className="grid gap-2">
                    <Label>Department (directory)</Label>
                    <Select
                      value={formDept === "" ? "__none" : formDept}
                      onValueChange={(v) => setFormDept(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— None —</SelectItem>
                        {(departments ?? []).map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label>Business role key</Label>
                    <Input
                      value={formRoleKey}
                      onChange={(e) => setFormRoleKey(e.target.value)}
                      placeholder="e.g. marketing_manager, ops_lead"
                    />
                    <Label>Responsibilities (one per line)</Label>
                    <Textarea
                      rows={4}
                      value={formResp}
                      onChange={(e) => setFormResp(e.target.value)}
                      placeholder="Campaign execution, reporting, lead follow-up…"
                    />
                    <Label>KPI category keys (comma-separated)</Label>
                    <Input
                      value={formKpi}
                      onChange={(e) => setFormKpi(e.target.value)}
                      placeholder="leads, campaigns, collections…"
                    />
                    <Label>Review cadence</Label>
                    <Select value={formCadence} onValueChange={(v) => setFormCadence(v as typeof formCadence)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Bi-weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <Label>Escalation employee id</Label>
                    <Input value={formEsc} onChange={(e) => setFormEsc(e.target.value)} placeholder="Optional" />
                    <Label>Notes</Label>
                    <Textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
                    <Button type="button" onClick={saveAccountability} disabled={upsert.isPending}>
                      {upsert.isPending ? "Saving…" : "Save accountability"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

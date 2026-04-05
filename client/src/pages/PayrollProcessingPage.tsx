import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign, Users, CheckCircle, Clock, AlertCircle, Play, Download,
  Eye, Plus, RefreshCw, Banknote, Calculator, CreditCard, Settings,
  ChevronRight, FileText, TrendingUp, Pencil, Check, X,
  ShieldAlert, ShieldCheck, ShieldX, ShieldOff, ExternalLink
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Compliance helpers ────────────────────────────────────────────────────────
type ComplianceLevel = "expired" | "expiring_30" | "expiring_90" | "ok" | "no_data";

const COMPLIANCE_CONFIG: Record<ComplianceLevel, {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
  rowClass: string;
}> = {
  expired: {
    label: "Expired",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700",
    icon: <ShieldX size={11} />,
    rowClass: "bg-red-50/40 dark:bg-red-900/10",
  },
  expiring_30: {
    label: "Exp. <30d",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700",
    icon: <ShieldAlert size={11} />,
    rowClass: "bg-orange-50/30 dark:bg-orange-900/10",
  },
  expiring_90: {
    label: "Exp. <90d",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700",
    icon: <ShieldAlert size={11} />,
    rowClass: "",
  },
  ok: {
    label: "Compliant",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700",
    icon: <ShieldCheck size={11} />,
    rowClass: "",
  },
  no_data: {
    label: "No Docs",
    badgeClass: "bg-muted text-muted-foreground border border-border",
    icon: <ShieldOff size={11} />,
    rowClass: "",
  },
};

function ComplianceBadge({ level, tooltip }: { level: ComplianceLevel; tooltip?: string }) {
  const cfg = COMPLIANCE_CONFIG[level];
  return (
    <span title={tooltip} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.badgeClass}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ComplianceSummaryPanel({ runId }: { runId: number }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.payroll.getRunCompliance.useQuery({ runId });
  if (isLoading) return <Skeleton className="h-16 rounded-lg" />;
  if (!data) return null;
  const { summary } = data;
  const hasIssues = summary.expired > 0 || summary.expiring30 > 0;
  return (
    <div className={`rounded-lg border p-3 ${
      summary.expired > 0
        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
        : summary.expiring30 > 0
        ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
        : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {summary.expired > 0 ? (
            <ShieldX size={16} className="text-red-600 dark:text-red-400 shrink-0" />
          ) : summary.expiring30 > 0 ? (
            <ShieldAlert size={16} className="text-orange-600 dark:text-orange-400 shrink-0" />
          ) : (
            <ShieldCheck size={16} className="text-green-600 dark:text-green-400 shrink-0" />
          )}
          <div>
            <p className={`text-xs font-semibold ${
              summary.expired > 0 ? "text-red-800 dark:text-red-300"
              : summary.expiring30 > 0 ? "text-orange-800 dark:text-orange-300"
              : "text-green-800 dark:text-green-300"
            }`}>
              {summary.expired > 0
                ? `${summary.expired} employee${summary.expired > 1 ? "s" : ""} with EXPIRED documents — action required`
                : summary.expiring30 > 0
                ? `${summary.expiring30} employee${summary.expiring30 > 1 ? "s" : ""} with documents expiring within 30 days`
                : "All employee documents are compliant"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.expired > 0 && `${summary.expired} expired · `}
              {summary.expiring30 > 0 && `${summary.expiring30} expiring <30d · `}
              {summary.expiring90 > 0 && `${summary.expiring90} expiring <90d · `}
              {summary.ok > 0 && `${summary.ok} compliant · `}
              {summary.noData > 0 && `${summary.noData} no docs`}
            </p>
          </div>
        </div>
        {hasIssues && (
          <button
            onClick={() => navigate("/company/documents")}
            className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground underline shrink-0">
            View Alerts <ExternalLink size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const fmt = (n: number | string | null | undefined) => `OMR ${Number(n ?? 0).toFixed(3)}`;
const fmtShort = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(3);

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400", icon: <Clock size={12} /> },
  processing: { label: "Processing", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: <RefreshCw size={12} className="animate-spin" /> },
  approved: { label: "Approved", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400", icon: <CheckCircle size={12} /> },
  paid: { label: "Paid", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle size={12} /> },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: <X size={12} /> },
};

// ─── Run Payroll Tab ──────────────────────────────────────────────────────────
function RunPayrollTab() {
  const now = new Date();
  const { activeCompanyId } = useActiveCompany();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), notes: "" });
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [editLine, setEditLine] = useState<any | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<number | null>(null);
  const [markPaidConfirm, setMarkPaidConfirm] = useState<number | null>(null);

  const { data: runs, isLoading: runsLoading, refetch: refetchRuns } = trpc.payroll.listRuns.useQuery({ year: selectedYear, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: runDetail, isLoading: runDetailLoading } = trpc.payroll.getRun.useQuery(
    { runId: selectedRunId! }, { enabled: !!selectedRunId }
  );
  const { data: runCompliance } = trpc.payroll.getRunCompliance.useQuery(
    { runId: selectedRunId! }, { enabled: !!selectedRunId }
  );

  const createRun = trpc.payroll.createRun.useMutation({
    onSuccess: (data) => {
      toast.success(`Payroll run created for ${MONTHS[createForm.month - 1]} ${createForm.year} — ${data.employeeCount} employees`);
      setCreateOpen(false);
      setSelectedRunId(data.runId);
      refetchRuns();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveRun = trpc.payroll.approveRun.useMutation({
    onSuccess: () => { toast.success("Payroll run approved"); setApproveConfirm(null); refetchRuns(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.payroll.markPaid.useMutation({
    onSuccess: () => { toast.success("Payroll marked as paid"); setMarkPaidConfirm(null); refetchRuns(); },
    onError: (e) => toast.error(e.message),
  });

  const updateLine = trpc.payroll.updateLineItem.useMutation({
    onSuccess: () => { toast.success("Line item updated"); setEditLine(null); },
    onError: (e) => toast.error(e.message),
  });

  const generatePayslip = trpc.payroll.generatePayslip.useMutation({
    onSuccess: (data) => { window.open(data.url, "_blank"); },
    onError: (e) => toast.error(e.message),
  });

  const generateWps = trpc.payroll.generateWpsFile.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `WPS_export.csv`;
      a.click();
      toast.success("WPS file downloaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{runs?.length ?? 0} payroll runs</span>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Play size={15} /> Run Payroll
        </Button>
      </div>

      {/* Payroll runs list */}
      {runsLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : !runs?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Calculator size={40} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No payroll runs for {selectedYear}</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Run Payroll" to process salaries for your team</p>
            <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
              <Play size={14} /> Run First Payroll
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const sc = statusConfig[run.status] ?? statusConfig.draft;
            const isSelected = selectedRunId === run.id;
            return (
              <Card key={run.id} className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                onClick={() => setSelectedRunId(isSelected ? null : run.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <DollarSign size={18} className="text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{MONTHS[run.periodMonth - 1]} {run.periodYear}</p>
                        <p className="text-xs text-muted-foreground">{run.employeeCount} employees</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground">Total Net</p>
                        <p className="font-bold text-green-600">{fmt(run.totalNet)}</p>
                      </div>
                      <Badge className={`gap-1 ${sc.color}`}>{sc.icon}{sc.label}</Badge>
                      <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isSelected ? "rotate-90" : ""}`} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4" onClick={(e) => e.stopPropagation()}>
                      {/* Summary KPIs */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Total Gross", value: fmt(run.totalGross), color: "text-foreground" },
                          { label: "Total Deductions", value: fmt(run.totalDeductions), color: "text-red-600" },
                          { label: "Total Net Pay", value: fmt(run.totalNet), color: "text-green-600" },
                        ].map(k => (
                          <div key={k.label} className="bg-muted/40 rounded-lg p-3 text-center">
                            <p className="text-xs text-muted-foreground">{k.label}</p>
                            <p className={`font-bold text-sm mt-1 ${k.color}`}>{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Compliance summary panel */}
                      {selectedRunId && <ComplianceSummaryPanel runId={selectedRunId} />}

                      {/* Line items table */}
                      {runDetailLoading ? (
                        <Skeleton className="h-40 rounded-lg" />
                      ) : runDetail?.lines.length ? (
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead>Employee</TableHead>
                                <TableHead className="hidden sm:table-cell">Compliance</TableHead>
                                <TableHead className="text-right">Basic</TableHead>
                                <TableHead className="text-right">Allowances</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Deductions</TableHead>
                                <TableHead className="text-right font-bold">Net Pay</TableHead>
                                <TableHead className="w-20"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {runDetail.lines.map(({ line, emp }) => {
                                const allowances = Number(line.housingAllowance ?? 0) + Number(line.transportAllowance ?? 0) + Number(line.otherAllowances ?? 0) + Number(line.overtimePay ?? 0);
                                const empCompliance = line.employeeId && runCompliance?.complianceByEmployee
                                  ? (runCompliance.complianceByEmployee as Record<number, any>)[line.employeeId]
                                  : undefined;
                                const compLevel: ComplianceLevel = empCompliance?.overallLevel ?? "no_data";
                                const rowHighlight = COMPLIANCE_CONFIG[compLevel].rowClass;
                                const tooltip = empCompliance ? [
                                  empCompliance.workPermit?.level !== "ok" && empCompliance.workPermit?.level !== "no_data"
                                    ? `Work Permit: ${empCompliance.workPermit?.daysRemaining != null ? (empCompliance.workPermit.daysRemaining < 0 ? "EXPIRED" : `${empCompliance.workPermit.daysRemaining}d remaining`) : "no data"}` : "",
                                  empCompliance.visa?.level !== "ok" && empCompliance.visa?.level !== "no_data"
                                    ? `Visa: ${empCompliance.visa?.daysRemaining != null ? (empCompliance.visa.daysRemaining < 0 ? "EXPIRED" : `${empCompliance.visa.daysRemaining}d remaining`) : "no data"}` : "",
                                  empCompliance.passport?.level !== "ok" && empCompliance.passport?.level !== "no_data"
                                    ? `Passport: ${empCompliance.passport?.daysRemaining != null ? (empCompliance.passport.daysRemaining < 0 ? "EXPIRED" : `${empCompliance.passport.daysRemaining}d remaining`) : "no data"}` : "",
                                ].filter(Boolean).join(" | ") : "";
                                return (
                                  <TableRow key={line.id} className={`hover:bg-muted/20 ${rowHighlight}`}>
                                    <TableCell className="font-medium">
                                      {emp?.firstName} {emp?.lastName}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                      <ComplianceBadge level={compLevel} tooltip={tooltip || undefined} />
                                    </TableCell>
                                    <TableCell className="text-right text-sm">{fmtShort(line.basicSalary)}</TableCell>
                                    <TableCell className="text-right text-sm text-blue-600">+{fmtShort(allowances)}</TableCell>
                                    <TableCell className="text-right text-sm">{fmtShort(line.grossSalary)}</TableCell>
                                    <TableCell className="text-right text-sm text-red-600">-{fmtShort(line.totalDeductions)}</TableCell>
                                    <TableCell className="text-right font-bold text-green-600">{fmtShort(line.netSalary)}</TableCell>
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Button size="icon" variant="ghost" className="h-7 w-7"
                                          onClick={() => setEditLine({ ...line, empName: `${emp?.firstName} ${emp?.lastName}` })}>
                                          <Pencil size={13} />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7"
                                          onClick={() => generatePayslip.mutate({ lineId: line.id })}
                                          disabled={generatePayslip.isPending}>
                                          <FileText size={13} />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      ) : null}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {run.status === "draft" && (() => {
                          const hasExpired = (runCompliance?.summary?.expired ?? 0) > 0;
                          return (
                            <div className="flex items-center gap-2">
                              <Button size="sm" className="gap-2"
                                disabled={hasExpired}
                                onClick={() => setApproveConfirm(run.id)}
                                title={hasExpired ? "Cannot approve: some employees have expired documents. Please renew before approving payroll." : undefined}>
                                <CheckCircle size={14} /> Approve Payroll
                              </Button>
                              {hasExpired && (
                                <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                  <ShieldX size={12} /> {runCompliance!.summary.expired} expired doc{runCompliance!.summary.expired > 1 ? "s" : ""} — renew to approve
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {run.status === "approved" && (
                          <Button size="sm" variant="outline" className="gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                            onClick={() => setMarkPaidConfirm(run.id)}>
                            <Banknote size={14} /> Mark as Paid
                          </Button>
                        )}
                        {(run.status === "approved" || run.status === "paid") && (
                          <Button size="sm" variant="outline" className="gap-2"
                            onClick={() => generateWps.mutate({ runId: run.id })}
                            disabled={generateWps.isPending}>
                            <Download size={14} /> Export WPS
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Run Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play size={18} className="text-primary" /> Run Payroll
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/40 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium">What happens when you run payroll:</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li>✓ Salaries calculated from your salary configurations</li>
                <li>✓ PASI contributions auto-calculated (7% for Omani nationals)</li>
                <li>✓ Active salary loans auto-deducted</li>
                <li>✓ Unpaid leave days auto-deducted (÷ 26 working days)</li>
                <li>✓ Payslips generated for each employee</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Month</Label>
                <Select value={String(createForm.month)} onValueChange={(v) => setCreateForm(f => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Select value={String(createForm.year)} onValueChange={(v) => setCreateForm(f => ({ ...f, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. Includes Eid bonus" value={createForm.notes}
                onChange={(e) => setCreateForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createRun.mutate({ ...createForm, companyId: activeCompanyId ?? undefined })} disabled={createRun.isPending} className="gap-2">
              {createRun.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              Run Payroll for {MONTHS[createForm.month - 1]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Line Item Dialog */}
      {editLine && (
        <Dialog open={!!editLine} onOpenChange={() => setEditLine(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adjust: {editLine.empName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {[
                { key: "housingAllowance", label: "Housing Allowance" },
                { key: "transportAllowance", label: "Transport Allowance" },
                { key: "otherAllowances", label: "Other Allowances" },
                { key: "overtimePay", label: "Overtime Pay" },
                { key: "loanDeduction", label: "Loan Deduction" },
                { key: "absenceDeduction", label: "Absence Deduction" },
                { key: "otherDeductions", label: "Other Deductions" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <Label className="w-40 text-sm">{label}</Label>
                  <Input type="number" step="0.001" min="0" className="flex-1"
                    value={editLine[key] ?? 0}
                    onChange={(e) => setEditLine((l: any) => ({ ...l, [key]: Number(e.target.value) }))} />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditLine(null)}>Cancel</Button>
              <Button onClick={() => updateLine.mutate({ lineId: editLine.id, housingAllowance: editLine.housingAllowance, transportAllowance: editLine.transportAllowance, otherAllowances: editLine.otherAllowances, overtimePay: editLine.overtimePay, loanDeduction: editLine.loanDeduction, absenceDeduction: editLine.absenceDeduction, otherDeductions: editLine.otherDeductions, companyId: activeCompanyId ?? undefined })} disabled={updateLine.isPending}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Approve confirm */}
      <Dialog open={!!approveConfirm} onOpenChange={() => setApproveConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve Payroll Run?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This will approve the payroll run and allow it to be marked as paid. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveConfirm(null)}>Cancel</Button>
            <Button onClick={() => approveRun.mutate({ runId: approveConfirm!, companyId: activeCompanyId ?? undefined })} disabled={approveRun.isPending}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid confirm */}
      <Dialog open={!!markPaidConfirm} onOpenChange={() => setMarkPaidConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mark as Paid?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Confirm that salaries have been transferred to employee bank accounts via WPS or other method.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidConfirm(null)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              onClick={() => markPaid.mutate({ runId: markPaidConfirm!, companyId: activeCompanyId ?? undefined })} disabled={markPaid.isPending}>
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Salary Setup Tab ─────────────────────────────────────────────────────────
function SalarySetupTab() {
  const { activeCompanyId } = useActiveCompany();
  const { data: employees, isLoading } = trpc.team.listMembers.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: configs, refetch: refetchConfigs } = trpc.payroll.listSalaryConfigs.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const [editEmp, setEditEmp] = useState<any | null>(null);
  const [form, setForm] = useState({
    basicSalary: 0, housingAllowance: 0, transportAllowance: 0,
    otherAllowances: 0, pasiRate: 11.5, incomeTaxRate: 0,
    effectiveFrom: new Date().toISOString().split("T")[0], notes: "",
  });

  const upsert = trpc.payroll.upsertSalaryConfig.useMutation({
    onSuccess: () => { toast.success("Salary configuration saved"); setEditEmp(null); refetchConfigs(); },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (emp: any) => {
    const config = configs?.find((c: any) => c.employeeId === emp.id);
    setForm({
      basicSalary: config ? Number(config.basicSalary) : Number(emp.salary ?? 0),
      housingAllowance: config ? Number(config.housingAllowance) : 0,
      transportAllowance: config ? Number(config.transportAllowance) : 0,
      otherAllowances: config ? Number(config.otherAllowances) : 0,
      pasiRate: config ? Number(config.pasiRate) : 11.5,
      incomeTaxRate: config ? Number(config.incomeTaxRate) : 0,
      effectiveFrom: new Date().toISOString().split("T")[0],
      notes: config?.notes ?? "",
    });
    setEditEmp(emp);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-medium mb-1">Set up salary configurations before running payroll</p>
        <p className="text-xs opacity-80">Each employee's basic salary, housing, transport, and other allowances are used to auto-calculate their monthly payslip. PASI (7%) is auto-applied for Omani nationals.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !employees?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Users size={36} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No active employees</p>
            <p className="text-sm text-muted-foreground mt-1">Add employees first from My Team</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Basic Salary</TableHead>
                <TableHead className="text-right">Housing</TableHead>
                <TableHead className="text-right">Transport</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp: any) => {
                const config = configs?.find((c: any) => c.employeeId === emp.id);
                const basic = config ? Number(config.basicSalary) : Number(emp.salary ?? 0);
                const housing = config ? Number(config.housingAllowance) : 0;
                const transport = config ? Number(config.transportAllowance) : 0;
                const other = config ? Number(config.otherAllowances) : 0;
                const gross = basic + housing + transport + other;
                return (
                  <TableRow key={emp.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div>
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-muted-foreground">{emp.position ?? emp.department}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{fmtShort(basic)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtShort(housing)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtShort(transport)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmtShort(other)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtShort(gross)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => openEdit(emp)}>
                        <Pencil size={11} /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit salary config dialog */}
      <Dialog open={!!editEmp} onOpenChange={() => setEditEmp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={16} /> Salary Config: {editEmp?.firstName} {editEmp?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "basicSalary", label: "Basic Salary (OMR)" },
                { key: "housingAllowance", label: "Housing Allowance" },
                { key: "transportAllowance", label: "Transport Allowance" },
                { key: "otherAllowances", label: "Other Allowances" },
                { key: "pasiRate", label: "PASI Rate (%)" },
                { key: "incomeTaxRate", label: "Income Tax Rate (%)" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input type="number" step="0.001" min="0" className="mt-1"
                    value={(form as any)[key]}
                    onChange={(e) => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs">Effective From</Label>
              <DateInput className="mt-1" value={form.effectiveFrom}
                onChange={(e) => setForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Optional notes" className="mt-1" value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {/* Preview */}
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
              <p className="font-medium text-sm mb-2">Calculated Preview</p>
              <div className="flex justify-between"><span>Gross Salary</span><span className="font-medium">{fmt(form.basicSalary + form.housingAllowance + form.transportAllowance + form.otherAllowances)}</span></div>
              <div className="flex justify-between text-red-600"><span>PASI (7% of basic)</span><span>- {fmt(form.basicSalary * 0.07)}</span></div>
              <Separator className="my-1" />
              <div className="flex justify-between font-bold text-green-600"><span>Estimated Net</span><span>{fmt(form.basicSalary + form.housingAllowance + form.transportAllowance + form.otherAllowances - form.basicSalary * 0.07)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
            <Button onClick={() => upsert.mutate({ employeeId: editEmp.id, ...form })} disabled={upsert.isPending}>
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Loans Tab ────────────────────────────────────────────────────────────────
function LoansTab() {
  const { activeCompanyId } = useActiveCompany();
  const { data: loans, isLoading, refetch } = trpc.payroll.listLoans.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: employees } = trpc.team.listMembers.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: 0, loanAmount: 0, monthlyDeduction: 0, startMonth: new Date().getMonth() + 1, startYear: new Date().getFullYear(), reason: "" });

  const createLoan = trpc.payroll.createLoan.useMutation({
    onSuccess: () => { toast.success("Loan created"); setCreateOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const cancelLoan = trpc.payroll.cancelLoan.useMutation({
    onSuccess: () => { toast.success("Loan cancelled"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const loanStatusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{loans?.length ?? 0} salary loans</p>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New Loan
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : !loans?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <CreditCard size={36} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No salary loans</p>
            <p className="text-sm text-muted-foreground mt-1">Salary loans are auto-deducted during payroll runs</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Loan Amount</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.map((loan: any) => (
                <TableRow key={loan.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{loan.employeeFirstName} {loan.employeeLastName}</TableCell>
                  <TableCell className="text-right">{fmt(loan.loanAmount)}</TableCell>
                  <TableCell className="text-right text-red-600">-{fmt(loan.monthlyDeduction)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(loan.balanceRemaining)}</TableCell>
                  <TableCell>
                    <Badge className={loanStatusColor[loan.status] ?? ""}>{loan.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {loan.status === "active" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() => cancelLoan.mutate({ loanId: loan.id })}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Loan Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CreditCard size={16} /> New Salary Loan</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Employee</Label>
              <Select value={String(form.employeeId)} onValueChange={(v) => setForm(f => ({ ...f, employeeId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Loan Amount (OMR)</Label>
                <Input type="number" step="0.001" min="0" value={form.loanAmount}
                  onChange={(e) => setForm(f => ({ ...f, loanAmount: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Monthly Deduction (OMR)</Label>
                <Input type="number" step="0.001" min="0" value={form.monthlyDeduction}
                  onChange={(e) => setForm(f => ({ ...f, monthlyDeduction: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Start Month</Label>
                <Select value={String(form.startMonth)} onValueChange={(v) => setForm(f => ({ ...f, startMonth: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Year</Label>
                <Input type="number" value={form.startYear}
                  onChange={(e) => setForm(f => ({ ...f, startYear: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Input placeholder="e.g. Personal emergency" value={form.reason}
                onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            {form.loanAmount > 0 && form.monthlyDeduction > 0 && (
              <div className="bg-muted/40 rounded-lg p-3 text-xs">
                <p className="font-medium mb-1">Repayment schedule</p>
                <p className="text-muted-foreground">
                  {Math.ceil(form.loanAmount / form.monthlyDeduction)} months to repay
                  ({fmt(form.monthlyDeduction)}/month)
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createLoan.mutate(form)} disabled={createLoan.isPending || !form.employeeId}>
              Create Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PayrollProcessingPage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const now = new Date();

  const { data: runs } = trpc.payroll.listRuns.useQuery({ year: now.getFullYear(), companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: employees } = trpc.team.listMembers.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: loans } = trpc.payroll.listLoans.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const thisMonthRun = runs?.find(r => r.periodMonth === now.getMonth() + 1 && r.periodYear === now.getFullYear());
  const activeLoans = loans?.filter((l: any) => l.status === "active").length ?? 0;
  const totalNetThisYear = runs?.filter(r => r.status !== "cancelled").reduce((s, r) => s + Number(r.totalNet ?? 0), 0) ?? 0;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Payroll Processing</h1>
        <p className="text-muted-foreground mt-1">
          Calculate and process salaries for your {employees?.length ?? 0} active employees
        </p>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Employees", value: employees?.length ?? 0, icon: <Users size={18} />, color: "text-blue-600" },
          { label: "This Month", value: thisMonthRun ? `${statusConfig[thisMonthRun.status]?.label}` : "Not run", icon: <Calendar size={18} />, color: thisMonthRun ? "text-green-600" : "text-amber-600" },
          { label: "Active Loans", value: activeLoans, icon: <CreditCard size={18} />, color: "text-red-600" },
          { label: `${now.getFullYear()} Total Net`, value: fmt(totalNetThisYear), icon: <TrendingUp size={18} />, color: "text-green-600" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/50 ${kpi.color}`}>{kpi.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={`font-bold text-sm ${kpi.color}`}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="run">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="run" className="gap-2"><Play size={14} />Run Payroll</TabsTrigger>
          <TabsTrigger value="setup" className="gap-2"><Settings size={14} />Salary Setup</TabsTrigger>
          <TabsTrigger value="loans" className="gap-2"><CreditCard size={14} />Loans</TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="run"><RunPayrollTab /></TabsContent>
          <TabsContent value="setup"><SalarySetupTab /></TabsContent>
          <TabsContent value="loans"><LoansTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// Need Calendar import
import { Calendar } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

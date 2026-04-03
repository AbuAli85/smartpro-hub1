import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign, FileText, Users, CheckCircle, Clock, AlertCircle,
  Play, Download, Eye, ChevronRight, Plus, RefreshCw, Banknote,
  TrendingUp, Calculator, CreditCard, Settings, XCircle
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number | string | null | undefined) => `OMR ${Number(n ?? 0).toFixed(3)}`;

function PayrollReportButton() {
  const { activeCompanyId } = useActiveCompany();
  const generateReport = trpc.reports.generateWorkforceReport.useMutation({
    onSuccess: (data) => {
      toast.success("Workforce report generated!");
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="outline" size="sm"
      onClick={() => generateReport.mutate({ companyId: activeCompanyId ?? undefined })}
      disabled={generateReport.isPending}
      className="gap-1">
      {generateReport.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
      Workforce PDF
    </Button>
  );
}
const statusColor: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  approved: "bg-indigo-100 text-indigo-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  on_hold: "bg-gray-100 text-gray-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-blue-100 text-blue-800",
};

export default function PayrollEnginePage() {
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), notes: "" });
  const [editLine, setEditLine] = useState<any | null>(null);

  // Salary Config state
  const [salaryConfigOpen, setSalaryConfigOpen] = useState(false);
  const [salaryConfigForm, setSalaryConfigForm] = useState({
    employeeId: 0,
    basicSalary: 0,
    housingAllowance: 0,
    transportAllowance: 0,
    otherAllowances: 0,
    pasiRate: 11.5,
    incomeTaxRate: 0,
    effectiveFrom: new Date().toISOString().split("T")[0],
    effectiveTo: "",
    notes: "",
  });

  // Loan state
  const [loanOpen, setLoanOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    employeeId: 0,
    loanAmount: 0,
    monthlyDeduction: 0,
    startMonth: now.getMonth() + 1,
    startYear: now.getFullYear(),
    reason: "",
  });

  const { data: summary, refetch: refetchSummary } = trpc.payroll.getSummary.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: runs, refetch: refetchRuns } = trpc.payroll.listRuns.useQuery({ year: selectedYear, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: runDetail, refetch: refetchDetail } = trpc.payroll.getRun.useQuery(
    { runId: selectedRunId! },
    { enabled: !!selectedRunId }
  );
  const { data: salaryConfigs, refetch: refetchConfigs } = trpc.payroll.listSalaryConfigs.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: loans, refetch: refetchLoans } = trpc.payroll.listLoans.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: empListData } = trpc.workforce.employees.list.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const empList = empListData?.items;

  const createRun = trpc.payroll.createRun.useMutation({
    onSuccess: (d) => {
      toast.success(`Payroll run created — ${d.employeeCount} employees, net ${fmt(d.totalNet)}`);
      setCreateOpen(false);
      refetchRuns();
      refetchSummary();
    },
    onError: (e) => toast.error(e.message),
  });

  const approveRun = trpc.payroll.approveRun.useMutation({
    onSuccess: () => { toast.success("Payroll approved"); refetchRuns(); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = trpc.payroll.markPaid.useMutation({
    onSuccess: () => { toast.success("Payroll marked as paid"); refetchRuns(); refetchDetail(); refetchSummary(); },
    onError: (e) => toast.error(e.message),
  });

  const generatePayslip = trpc.payroll.generatePayslip.useMutation({
    onSuccess: (d) => {
      toast.success("Payslip generated");
      window.open(d.url, "_blank");
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const generateWps = trpc.payroll.generateWpsFile.useMutation({
    onSuccess: (d) => {
      toast.success("WPS file generated");
      window.open(d.url, "_blank");
      refetchDetail();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLine = trpc.payroll.updateLineItem.useMutation({
    onSuccess: () => { toast.success("Line item updated"); setEditLine(null); refetchDetail(); },
    onError: (e) => toast.error(e.message),
  });

  const upsertSalaryConfig = trpc.payroll.upsertSalaryConfig.useMutation({
    onSuccess: () => {
      toast.success("Salary configuration saved");
      setSalaryConfigOpen(false);
      refetchConfigs();
    },
    onError: (e) => toast.error(e.message),
  });

  const createLoan = trpc.payroll.createLoan.useMutation({
    onSuccess: () => {
      toast.success("Loan created successfully");
      setLoanOpen(false);
      refetchLoans();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelLoan = trpc.payroll.cancelLoan.useMutation({
    onSuccess: () => { toast.success("Loan cancelled"); refetchLoans(); },
    onError: (e) => toast.error(e.message),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const openSalaryConfigForEmployee = (emp: any) => {
    setSalaryConfigForm({
      employeeId: emp.id,
      basicSalary: Number(emp.salary ?? 0),
      housingAllowance: 0,
      transportAllowance: 0,
      otherAllowances: 0,
      pasiRate: 11.5,
      incomeTaxRate: 0,
      effectiveFrom: new Date().toISOString().split("T")[0],
      effectiveTo: "",
      notes: "",
    });
    setSalaryConfigOpen(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm">
              <Banknote size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">Payroll Engine</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                WPS-compliant payroll runs, salary configs, PASI deductions, salary loans, and OMR payslip generation
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">WPS Compliant</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">PASI Deductions</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">OMR Payslips</span>
            <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Salary Loans</span>
          </div>
        </div>
        <div className="flex gap-2">
          <PayrollReportButton />
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus size={16} /> New Payroll Run
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Paid YTD",      value: fmt(summary?.totalPaidYTD),              bg: "stat-gradient-4" },
          { label: "Last Run Employees",  value: summary?.lastRun?.employeeCount ?? 0,    bg: "stat-gradient-1" },
          { label: "Pending Approval",    value: summary?.pendingApproval ?? 0,           bg: "stat-gradient-gold" },
          { label: "Last Run Net (OMR)",  value: fmt(summary?.lastRun?.totalNet),         bg: "stat-gradient-2" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-white shadow-sm`}>
            <p className="text-xl font-black">{s.value}</p>
            <p className="text-xs text-white/70 mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="runs">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="runs">Payroll Runs</TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedRunId}>Run Detail</TabsTrigger>
          <TabsTrigger value="salary-config">Salary Config</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
        </TabsList>

        {/* Payroll Runs Tab */}
        <TabsContent value="runs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchRuns()} className="gap-1">
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>WPS</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!runs?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payroll runs found for {selectedYear}</TableCell></TableRow>
                )}
                {runs?.map(run => (
                  <TableRow key={run.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{MONTHS[(run.periodMonth ?? 1) - 1]} {run.periodYear}</TableCell>
                    <TableCell>{run.employeeCount}</TableCell>
                    <TableCell>{fmt(run.totalGross)}</TableCell>
                    <TableCell className="text-red-600">-{fmt(run.totalDeductions)}</TableCell>
                    <TableCell className="font-semibold text-green-700">{fmt(run.totalNet)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[run.status] ?? ""}`}>
                        {run.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {run.wpsFileUrl
                        ? <a href={run.wpsFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Download size={12} /> Download</a>
                        : <span className="text-muted-foreground text-xs">—</span>
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedRunId(run.id)} className="gap-1 text-xs">
                          <Eye size={12} /> View
                        </Button>
                        {run.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={() => approveRun.mutate({ runId: run.id, companyId: activeCompanyId ?? undefined })} className="gap-1 text-xs text-indigo-600">
                            <CheckCircle size={12} /> Approve
                          </Button>
                        )}
                        {run.status === "approved" && (
                          <Button size="sm" variant="ghost" onClick={() => markPaid.mutate({ runId: run.id, companyId: activeCompanyId ?? undefined })} className="gap-1 text-xs text-green-600">
                            <Banknote size={12} /> Mark Paid
                          </Button>
                        )}
                        {(run.status === "approved" || run.status === "paid") && !run.wpsFileUrl && (
                          <Button size="sm" variant="ghost" onClick={() => generateWps.mutate({ runId: run.id, companyId: activeCompanyId ?? undefined })} className="gap-1 text-xs text-purple-600">
                            <FileText size={12} /> WPS
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Run Detail Tab */}
        <TabsContent value="detail" className="space-y-4">
          {runDetail && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {MONTHS[(runDetail.run.periodMonth ?? 1) - 1]} {runDetail.run.periodYear} — Payroll Detail
                  </h2>
                  <p className="text-sm text-muted-foreground">{runDetail.lines.length} employees</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {runDetail.run.status === "draft" && (
                    <Button onClick={() => approveRun.mutate({ runId: runDetail.run.id, companyId: activeCompanyId ?? undefined })} variant="outline" className="gap-2">
                      <CheckCircle size={14} /> Approve Run
                    </Button>
                  )}
                  {runDetail.run.status === "approved" && (
                    <>
                      <Button onClick={() => markPaid.mutate({ runId: runDetail.run.id, companyId: activeCompanyId ?? undefined })} className="gap-2 bg-green-600 hover:bg-green-700">
                        <Banknote size={14} /> Mark All Paid
                      </Button>
                      {!runDetail.run.wpsFileUrl && (
                        <Button onClick={() => generateWps.mutate({ runId: runDetail.run.id, companyId: activeCompanyId ?? undefined })} variant="outline" className="gap-2">
                          <FileText size={14} /> Generate WPS File
                        </Button>
                      )}
                    </>
                  )}
                  {runDetail.run.wpsFileUrl && (
                    <a href={runDetail.run.wpsFileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="gap-2"><Download size={14} /> Download WPS</Button>
                    </a>
                  )}
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-blue-600 font-medium uppercase">Total Gross</p>
                    <p className="text-xl font-bold text-blue-900">{fmt(runDetail.run.totalGross)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-red-600 font-medium uppercase">Total Deductions</p>
                    <p className="text-xl font-bold text-red-900">-{fmt(runDetail.run.totalDeductions)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4">
                    <p className="text-xs text-green-600 font-medium uppercase">Total Net</p>
                    <p className="text-xl font-bold text-green-900">{fmt(runDetail.run.totalNet)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Line Items Table */}
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Basic</TableHead>
                      <TableHead>Allowances</TableHead>
                      <TableHead>Gross</TableHead>
                      <TableHead>PASI</TableHead>
                      <TableHead>Other Ded.</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runDetail.lines.map(({ line, emp: employee }) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {employee?.firstName} {employee?.lastName}
                          {line.ibanNumber && <p className="text-xs text-muted-foreground">{line.bankName} ••••{line.ibanNumber.slice(-4)}</p>}
                        </TableCell>
                        <TableCell>{fmt(line.basicSalary)}</TableCell>
                        <TableCell className="text-blue-700">
                          +{fmt(Number(line.housingAllowance ?? 0) + Number(line.transportAllowance ?? 0) + Number(line.otherAllowances ?? 0) + Number(line.overtimePay ?? 0))}
                        </TableCell>
                        <TableCell className="font-medium">{fmt(line.grossSalary)}</TableCell>
                        <TableCell className="text-red-600">-{fmt(line.pasiDeduction)}</TableCell>
                        <TableCell className="text-red-600">-{fmt(Number(line.loanDeduction ?? 0) + Number(line.absenceDeduction ?? 0) + Number(line.otherDeductions ?? 0))}</TableCell>
                        <TableCell className="font-bold text-green-700">{fmt(line.netSalary)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[line.status] ?? ""}`}>
                            {line.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {runDetail.run.status === "draft" && (
                              <Button size="sm" variant="ghost" onClick={() => setEditLine({ ...line, employeeName: `${employee?.firstName} ${employee?.lastName}` })} className="text-xs">
                                Edit
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => generatePayslip.mutate({ lineId: line.id, companyId: activeCompanyId ?? undefined })} className="gap-1 text-xs text-blue-600">
                              <FileText size={12} /> Payslip
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Salary Config Tab */}
        <TabsContent value="salary-config" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Salary Configurations</h2>
              <p className="text-sm text-muted-foreground">Define base salary, allowances, and deduction rates per employee</p>
            </div>
            <Button onClick={() => { setSalaryConfigForm(f => ({ ...f, employeeId: 0 })); setSalaryConfigOpen(true); }} className="gap-2">
              <Plus size={16} /> New Config
            </Button>
          </div>

          {/* Employee quick-config cards */}
          {empList && empList.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {empList.map((emp: any) => {
                const cfg = salaryConfigs?.find(c => c.employeeId === emp.id);
                return (
                  <Card key={emp.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-sm">{emp.firstName} {emp.lastName}</p>
                          <p className="text-xs text-muted-foreground">{emp.jobTitle ?? "—"} · {emp.nationality ?? "—"}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openSalaryConfigForEmployee(emp)} className="gap-1 text-xs">
                          <Settings size={12} /> Configure
                        </Button>
                      </div>
                      {cfg ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span className="text-muted-foreground">Basic Salary</span><span className="font-medium">{fmt(cfg.basicSalary)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Housing</span><span>{fmt(cfg.housingAllowance)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{fmt(cfg.transportAllowance)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">PASI Rate</span><span>{cfg.pasiRate}%</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Effective From</span><span>{cfg.effectiveFrom ? fmtDate(cfg.effectiveFrom) : "—"}</span></div>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                          No salary config set. Using employee record defaults.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Full config table */}
          <Card>
            <CardHeader><CardTitle className="text-base">All Salary Configurations</CardTitle></CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Basic Salary</TableHead>
                  <TableHead>Housing</TableHead>
                  <TableHead>Transport</TableHead>
                  <TableHead>Other</TableHead>
                  <TableHead>PASI Rate</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!salaryConfigs?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No salary configurations yet. Click "Configure" on an employee card above.</TableCell></TableRow>
                )}
                {salaryConfigs?.map(cfg => (
                  <TableRow key={cfg.id}>
                    <TableCell className="font-medium">{cfg.employeeFirstName} {cfg.employeeLastName}</TableCell>
                    <TableCell className="font-semibold text-green-700">{fmt(cfg.basicSalary)}</TableCell>
                    <TableCell>{fmt(cfg.housingAllowance)}</TableCell>
                    <TableCell>{fmt(cfg.transportAllowance)}</TableCell>
                    <TableCell>{fmt(cfg.otherAllowances)}</TableCell>
                    <TableCell>{cfg.pasiRate}%</TableCell>
                    <TableCell>{cfg.effectiveFrom ? fmtDate(cfg.effectiveFrom) : "—"}</TableCell>
                    <TableCell>{cfg.effectiveTo ? fmtDate(cfg.effectiveTo) : <span className="text-green-600 text-xs font-medium">Active</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Employee Loans</h2>
              <p className="text-sm text-muted-foreground">Manage salary advances and monthly deductions</p>
            </div>
            <Button onClick={() => setLoanOpen(true)} className="gap-2">
              <Plus size={16} /> New Loan
            </Button>
          </div>

          {/* Loan summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg"><CreditCard size={20} className="text-blue-700" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Loans</p>
                  <p className="text-lg font-bold">{loans?.filter(l => l.status === "active").length ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg"><DollarSign size={20} className="text-red-700" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Outstanding</p>
                  <p className="text-lg font-bold">{fmt(loans?.filter(l => l.status === "active").reduce((s, l) => s + Number(l.balanceRemaining ?? 0), 0))}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg"><CheckCircle size={20} className="text-green-700" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed Loans</p>
                  <p className="text-lg font-bold">{loans?.filter(l => l.status === "completed").length ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Loan Amount</TableHead>
                  <TableHead>Monthly Deduction</TableHead>
                  <TableHead>Balance Remaining</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loans?.length && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No loans recorded yet</TableCell></TableRow>
                )}
                {loans?.map(loan => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">{loan.employeeFirstName} {loan.employeeLastName}</TableCell>
                    <TableCell>{fmt(loan.loanAmount)}</TableCell>
                    <TableCell className="text-red-600">-{fmt(loan.monthlyDeduction)}/mo</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-semibold">{fmt(loan.balanceRemaining)}</span>
                        {loan.status === "active" && Number(loan.loanAmount) > 0 && (
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, ((Number(loan.loanAmount) - Number(loan.balanceRemaining)) / Number(loan.loanAmount)) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{MONTHS[(loan.startMonth ?? 1) - 1]} {loan.startYear}</TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-32 truncate">{loan.reason ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[loan.status] ?? ""}`}>
                        {loan.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {loan.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-red-600"
                          onClick={() => { if (confirm("Cancel this loan?")) cancelLoan.mutate({ loanId: loan.id }); }}
                        >
                          <XCircle size={12} className="mr-1" /> Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Run Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A new payroll run will automatically pull all active employees and pre-fill their salaries, allowances, and PASI deductions. You can adjust individual line items before approving.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Month</Label>
                <Select value={String(createForm.month)} onValueChange={(v) => setCreateForm(f => ({ ...f, month: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Year</Label>
                <Select value={String(createForm.year)} onValueChange={(v) => setCreateForm(f => ({ ...f, year: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input placeholder="e.g. Includes Eid bonus" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>PASI auto-calculated:</strong> 7% of basic salary for Omani nationals. Adjust per employee after creation.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createRun.mutate({ ...createForm, companyId: activeCompanyId ?? undefined })} disabled={createRun.isPending} className="gap-2">
              {createRun.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              Generate Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Line Item Dialog */}
      <Dialog open={!!editLine} onOpenChange={(o) => !o && setEditLine(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Adjust: {editLine?.employeeName}</DialogTitle></DialogHeader>
          {editLine && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { key: "housingAllowance", label: "Housing Allowance" },
                  { key: "transportAllowance", label: "Transport Allowance" },
                  { key: "otherAllowances", label: "Other Allowances" },
                  { key: "overtimePay", label: "Overtime Pay" },
                  { key: "loanDeduction", label: "Loan Deduction" },
                  { key: "absenceDeduction", label: "Absence Deduction" },
                  { key: "otherDeductions", label: "Other Deductions" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label} (OMR)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editLine[key] ?? 0}
                      onChange={e => setEditLine((l: any) => ({ ...l, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name</Label>
                  <Input value={editLine.bankName ?? ""} onChange={e => setEditLine((l: any) => ({ ...l, bankName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IBAN</Label>
                  <Input value={editLine.ibanNumber ?? ""} onChange={e => setEditLine((l: any) => ({ ...l, ibanNumber: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLine(null)}>Cancel</Button>
            <Button onClick={() => editLine && updateLine.mutate({
              lineId: editLine.id,
              housingAllowance: Number(editLine.housingAllowance ?? 0),
              transportAllowance: Number(editLine.transportAllowance ?? 0),
              otherAllowances: Number(editLine.otherAllowances ?? 0),
              overtimePay: Number(editLine.overtimePay ?? 0),
              loanDeduction: Number(editLine.loanDeduction ?? 0),
              absenceDeduction: Number(editLine.absenceDeduction ?? 0),
              otherDeductions: Number(editLine.otherDeductions ?? 0),
              bankName: editLine.bankName,
              ibanNumber: editLine.ibanNumber,
              companyId: activeCompanyId ?? undefined,
            })} disabled={updateLine.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salary Config Dialog */}
      <Dialog open={salaryConfigOpen} onOpenChange={setSalaryConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Salary Configuration</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={salaryConfigForm.employeeId ? String(salaryConfigForm.employeeId) : ""}
                onValueChange={(v) => setSalaryConfigForm(f => ({ ...f, employeeId: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {empList?.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>{emp.firstName} {emp.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Basic Salary (OMR)</Label>
                <Input type="number" step="0.001" value={salaryConfigForm.basicSalary} onChange={e => setSalaryConfigForm(f => ({ ...f, basicSalary: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Housing Allowance (OMR)</Label>
                <Input type="number" step="0.001" value={salaryConfigForm.housingAllowance} onChange={e => setSalaryConfigForm(f => ({ ...f, housingAllowance: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Transport Allowance (OMR)</Label>
                <Input type="number" step="0.001" value={salaryConfigForm.transportAllowance} onChange={e => setSalaryConfigForm(f => ({ ...f, transportAllowance: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Other Allowances (OMR)</Label>
                <Input type="number" step="0.001" value={salaryConfigForm.otherAllowances} onChange={e => setSalaryConfigForm(f => ({ ...f, otherAllowances: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PASI Rate (%)</Label>
                <Input type="number" step="0.01" value={salaryConfigForm.pasiRate} onChange={e => setSalaryConfigForm(f => ({ ...f, pasiRate: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Income Tax Rate (%)</Label>
                <Input type="number" step="0.01" value={salaryConfigForm.incomeTaxRate} onChange={e => setSalaryConfigForm(f => ({ ...f, incomeTaxRate: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Effective From</Label>
                <Input type="date" value={salaryConfigForm.effectiveFrom} onChange={e => setSalaryConfigForm(f => ({ ...f, effectiveFrom: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Effective To (optional)</Label>
                <Input type="date" value={salaryConfigForm.effectiveTo} onChange={e => setSalaryConfigForm(f => ({ ...f, effectiveTo: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="e.g. Salary revision after performance review" value={salaryConfigForm.notes} onChange={e => setSalaryConfigForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              <strong>Note:</strong> Saving a new config will close the current active config for this employee. The new config takes effect from the "Effective From" date.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalaryConfigOpen(false)}>Cancel</Button>
            <Button
              onClick={() => upsertSalaryConfig.mutate({
                ...salaryConfigForm,
                effectiveTo: salaryConfigForm.effectiveTo || undefined,
                notes: salaryConfigForm.notes || undefined,
              })}
              disabled={upsertSalaryConfig.isPending || !salaryConfigForm.employeeId}
            >
              {upsertSalaryConfig.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : null}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Loan Dialog */}
      <Dialog open={loanOpen} onOpenChange={setLoanOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Employee Loan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select
                value={loanForm.employeeId ? String(loanForm.employeeId) : ""}
                onValueChange={(v) => setLoanForm(f => ({ ...f, employeeId: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
                <SelectContent>
                  {empList?.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>{emp.firstName} {emp.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Loan Amount (OMR)</Label>
                <Input type="number" step="0.001" value={loanForm.loanAmount} onChange={e => setLoanForm(f => ({ ...f, loanAmount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Monthly Deduction (OMR)</Label>
                <Input type="number" step="0.001" value={loanForm.monthlyDeduction} onChange={e => setLoanForm(f => ({ ...f, monthlyDeduction: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Month</Label>
                <Select value={String(loanForm.startMonth)} onValueChange={(v) => setLoanForm(f => ({ ...f, startMonth: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start Year</Label>
                <Select value={String(loanForm.startYear)} onValueChange={(v) => setLoanForm(f => ({ ...f, startYear: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {loanForm.loanAmount > 0 && loanForm.monthlyDeduction > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                <strong>Repayment estimate:</strong> {Math.ceil(loanForm.loanAmount / loanForm.monthlyDeduction)} months
                ({fmt(loanForm.loanAmount / Math.ceil(loanForm.loanAmount / loanForm.monthlyDeduction))} avg/month)
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea placeholder="e.g. Medical emergency, home purchase..." value={loanForm.reason} onChange={e => setLoanForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createLoan.mutate({
                ...loanForm,
                reason: loanForm.reason || undefined,
              })}
              disabled={createLoan.isPending || !loanForm.employeeId || loanForm.loanAmount <= 0 || loanForm.monthlyDeduction <= 0}
            >
              {createLoan.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : null}
              Create Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

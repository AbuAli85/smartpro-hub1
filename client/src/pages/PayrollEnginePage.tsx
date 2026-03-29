import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import {
  DollarSign, FileText, Users, CheckCircle, Clock, AlertCircle,
  Play, Download, Eye, ChevronRight, Plus, RefreshCw, Banknote,
  TrendingUp, Calculator
} from "lucide-react";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number | string | null | undefined) => `OMR ${Number(n ?? 0).toFixed(3)}`;
const statusColor: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  approved: "bg-indigo-100 text-indigo-800",
  paid: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  on_hold: "bg-gray-100 text-gray-800",
};

export default function PayrollEnginePage() {
  const { user } = useAuth();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear(), notes: "" });
  const [editLine, setEditLine] = useState<any | null>(null);

  const { data: summary, refetch: refetchSummary } = trpc.payroll.getSummary.useQuery();
  const { data: runs, refetch: refetchRuns } = trpc.payroll.listRuns.useQuery({ year: selectedYear });
  const { data: runDetail, refetch: refetchDetail } = trpc.payroll.getRun.useQuery(
    { runId: selectedRunId! },
    { enabled: !!selectedRunId }
  );

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

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payroll Engine</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage payroll cycles, payslips, and WPS submissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus size={16} /> New Payroll Run
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg"><DollarSign size={20} className="text-green-700" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Total Paid YTD</p>
              <p className="text-lg font-bold">{fmt(summary?.totalPaidYTD)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Users size={20} className="text-blue-700" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Last Run Employees</p>
              <p className="text-lg font-bold">{summary?.lastRun?.employeeCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg"><Clock size={20} className="text-yellow-700" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="text-lg font-bold">{summary?.pendingApproval ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><TrendingUp size={20} className="text-purple-700" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Last Run Net</p>
              <p className="text-lg font-bold">{fmt(summary?.lastRun?.totalNet)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Payroll Runs</TabsTrigger>
          <TabsTrigger value="detail" disabled={!selectedRunId}>Run Detail</TabsTrigger>
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
                          <Button size="sm" variant="ghost" onClick={() => approveRun.mutate({ runId: run.id })} className="gap-1 text-xs text-indigo-600">
                            <CheckCircle size={12} /> Approve
                          </Button>
                        )}
                        {run.status === "approved" && (
                          <Button size="sm" variant="ghost" onClick={() => markPaid.mutate({ runId: run.id })} className="gap-1 text-xs text-green-600">
                            <Banknote size={12} /> Mark Paid
                          </Button>
                        )}
                        {(run.status === "approved" || run.status === "paid") && !run.wpsFileUrl && (
                          <Button size="sm" variant="ghost" onClick={() => generateWps.mutate({ runId: run.id })} className="gap-1 text-xs text-purple-600">
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
                    <Button onClick={() => approveRun.mutate({ runId: runDetail.run.id })} variant="outline" className="gap-2">
                      <CheckCircle size={14} /> Approve Run
                    </Button>
                  )}
                  {runDetail.run.status === "approved" && (
                    <>
                      <Button onClick={() => markPaid.mutate({ runId: runDetail.run.id })} className="gap-2 bg-green-600 hover:bg-green-700">
                        <Banknote size={14} /> Mark All Paid
                      </Button>
                      {!runDetail.run.wpsFileUrl && (
                        <Button onClick={() => generateWps.mutate({ runId: runDetail.run.id })} variant="outline" className="gap-2">
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
                            <Button size="sm" variant="ghost" onClick={() => generatePayslip.mutate({ lineId: line.id })} className="gap-1 text-xs text-blue-600">
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
            <Button onClick={() => createRun.mutate(createForm)} disabled={createRun.isPending} className="gap-2">
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
            })} disabled={updateLine.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

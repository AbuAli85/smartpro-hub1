import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  FileText, Download, TrendingUp, Users, Shield, CreditCard,
  Loader2, FileBarChart, Receipt, UserCheck, AlertCircle
} from "lucide-react";

const MONTHS = [
  { value: 1, label: "January" }, { value: 2, label: "February" },
  { value: 3, label: "March" }, { value: 4, label: "April" },
  { value: 5, label: "May" }, { value: 6, label: "June" },
  { value: 7, label: "July" }, { value: 8, label: "August" },
  { value: 9, label: "September" }, { value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

function downloadPdf(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Billing Summary Report ───────────────────────────────────────────────────
function BillingReportCard() {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const gen = trpc.reports.generateBillingSummary.useMutation({
    onSuccess: (data) => {
      downloadPdf(data.url, data.filename);
      toast.success(`${data.filename} downloaded.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Receipt className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Billing Summary</CardTitle>
            <CardDescription className="text-xs">Monthly PRO officer invoices and payment status</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)} className="text-xs">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="w-full h-8 text-xs"
          disabled={gen.isPending}
          onClick={() => gen.mutate({ month, year })}
        >
          {gen.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Generating…</> : <><Download className="h-3 w-3 mr-1.5" />Download PDF</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Payslip Report ───────────────────────────────────────────────────────────
function PayslipReportCard() {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [runId, setRunId] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const { data: runsData } = trpc.payroll.listRuns.useQuery({}, { retry: false });
  const runs = runsData ?? [];

  const gen = trpc.reports.generatePayslip.useMutation({
    onSuccess: (data) => {
      downloadPdf(data.url, data.filename);
      toast.success(`${data.filename} downloaded.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <FileText className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <CardTitle className="text-base">Employee Payslip</CardTitle>
            <CardDescription className="text-xs">Individual payslip PDF for any payroll run</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Payroll Run</Label>
          <Select value={runId} onValueChange={setRunId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a run…" /></SelectTrigger>
            <SelectContent>
              {runs.map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)} className="text-xs">
                  {MONTHS.find(m => m.value === r.periodMonth)?.label} {r.periodYear} — {r.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Employee ID</Label>
          <Input
            className="h-8 text-xs"
            placeholder="Enter employee ID…"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
        </div>
        <Button
          className="w-full h-8 text-xs"
          disabled={gen.isPending || !runId || !employeeId}
          onClick={() => gen.mutate({ runId: Number(runId), employeeId: Number(employeeId) })}
        >
          {gen.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Generating…</> : <><Download className="h-3 w-3 mr-1.5" />Download Payslip</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Workforce Report ─────────────────────────────────────────────────────────
function WorkforceReportCard() {
  const gen = trpc.reports.generateWorkforceReport.useMutation({
    onSuccess: (data) => {
      downloadPdf(data.url, data.filename);
      toast.success(`${data.filename} downloaded.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Users className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-base">Workforce Report</CardTitle>
            <CardDescription className="text-xs">Full employee roster, work permits, and open cases</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          Generates a comprehensive snapshot of your entire workforce: employee list, work permit status, expiry dates, and all open government cases.
        </p>
        <Button
          className="w-full h-8 text-xs"
          disabled={gen.isPending}
          onClick={() => gen.mutate({})}
        >
          {gen.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Generating…</> : <><Download className="h-3 w-3 mr-1.5" />Download PDF</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Compliance Report ────────────────────────────────────────────────────────
function ComplianceReportCard() {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const gen = trpc.reports.generateComplianceReport.useMutation({
    onSuccess: (data) => {
      downloadPdf(data.url, data.filename);
      toast.success(`${data.filename} downloaded.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">MoL Compliance Report</CardTitle>
            <CardDescription className="text-xs">Monthly compliance certificate register for MoL submission</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)} className="text-xs">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="w-full h-8 text-xs"
          disabled={gen.isPending}
          onClick={() => gen.mutate({ month, year })}
        >
          {gen.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Generating…</> : <><Download className="h-3 w-3 mr-1.5" />Download PDF</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Officer Payout Report ────────────────────────────────────────────────────
function OfficerPayoutReportCard() {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [officerId, setOfficerId] = useState("");

  const { data: officersData } = trpc.officers.list.useQuery({}, { retry: false });
  const officers = officersData ?? [];

  const gen = trpc.reports.generateOfficerPayoutReport.useMutation({
    onSuccess: (data) => {
      downloadPdf(data.url, data.filename);
      toast.success(`${data.filename} downloaded.`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10">
            <UserCheck className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <CardTitle className="text-base">Officer Payout Statement</CardTitle>
            <CardDescription className="text-xs">Track A/B payout breakdown per officer per month</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Officer</Label>
          <Select value={officerId} onValueChange={setOfficerId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select officer…" /></SelectTrigger>
            <SelectContent>
              {officers.map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)} className="text-xs">{o.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)} className="text-xs">{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          className="w-full h-8 text-xs"
          disabled={gen.isPending || !officerId}
          onClick={() => gen.mutate({ officerId: Number(officerId), month, year })}
        >
          {gen.isPending ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Generating…</> : <><Download className="h-3 w-3 mr-1.5" />Download PDF</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { user } = useAuth();

  const reportTypes = [
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "payslip", label: "Payslip", icon: FileText },
    { id: "workforce", label: "Workforce", icon: TrendingUp },
    { id: "compliance", label: "Compliance", icon: Shield },
    { id: "officer", label: "Officer Payout", icon: UserCheck },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PDF Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Generate and download professional PDF reports for billing, payroll, workforce, and compliance.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1.5">
          <FileBarChart className="h-3 w-3" />
          5 Report Types
        </Badge>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
        <AlertCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          All reports are generated server-side as professional PDFs and stored securely in cloud storage. 
          Downloads open automatically. Reports reflect data at the time of generation.
        </p>
      </div>

      {/* Report cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <BillingReportCard />
        <PayslipReportCard />
        <WorkforceReportCard />
        <ComplianceReportCard />
        <OfficerPayoutReportCard />
      </div>

      {/* Quick reference */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Report Reference Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Receipt className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Billing Summary</p>
                  <p className="text-muted-foreground">Lists all PRO officer invoices for the selected month. Shows paid, pending, and overdue amounts. Use for monthly reconciliation.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Employee Payslip</p>
                  <p className="text-muted-foreground">Individual payslip showing earnings breakdown (basic, housing, transport), deductions (PASI, loans), and net pay. Required for WPS compliance.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Workforce Report</p>
                  <p className="text-muted-foreground">Complete employee roster with work permit status, expiry dates, and open government cases. Use for HR audits and MoL inspections.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">MoL Compliance Report</p>
                  <p className="text-muted-foreground">Lists all compliance certificates issued for the month with officer PASI numbers. Required for Ministry of Labour submissions.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <UserCheck className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Officer Payout Statement</p>
                  <p className="text-muted-foreground">Detailed payout breakdown for a specific officer: Track A commission or Track B fixed salary, active assignments, and payment status.</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

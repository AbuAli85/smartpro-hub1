import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BarChart3, TrendingUp, Users, FileText, Shield, Briefcase, Building2, Calendar, Clock, Plus, Play, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function StatCard({ title, value, icon, sub }: { title: string; value: string | number; icon: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: companyStats } = trpc.analytics.companyStats.useQuery();
  const { data: contractsOverview } = trpc.analytics.contractsOverview.useQuery();
  const { data: proOverview } = trpc.analytics.proServicesOverview.useQuery();
  const { data: crmPipeline } = trpc.analytics.dealsPipeline.useQuery();
  const { data: hrStats } = trpc.analytics.hrOverview.useQuery();

  const moduleData = [
    { name: "Sanad", value: companyStats?.sanadApplications ?? 0, color: "#3b82f6" },
    { name: "PRO Services", value: companyStats?.proServices ?? 0, color: "#8b5cf6" },
    { name: "Contracts", value: companyStats?.contracts ?? 0, color: "#f97316" },
    { name: "Marketplace", value: 0, color: "#10b981" },
    { name: "HR", value: companyStats?.employees ?? 0, color: "#f59e0b" },
    { name: "CRM", value: companyStats?.contacts ?? 0, color: "#ef4444" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={24} className="text-[var(--smartpro-orange)]" />
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Cross-module reporting and business intelligence</p>
      </div>

      {/* Platform Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Companies" value={platformStats?.companies ?? 0} icon={<Building2 size={18} />} />
        <StatCard title="Total Users" value={platformStats?.users ?? 0} icon={<Users size={18} />} />
        <StatCard title="Contracts" value={platformStats?.contracts ?? 0} icon={<FileText size={18} />} />
        <StatCard title="PRO Services" value={platformStats?.proServices ?? 0} icon={<Shield size={18} />} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Platform Overview</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="pro">PRO Services</TabsTrigger>
          <TabsTrigger value="crm">CRM Pipeline</TabsTrigger>
          <TabsTrigger value="hr">HR</TabsTrigger>
          <TabsTrigger value="reports">Scheduled Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Module Activity Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Module Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={moduleData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {moduleData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Module Distribution Pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Activity Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={moduleData.filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {moduleData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                {moduleData.every((d) => d.value === 0) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No data yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Sanad Applications" value={companyStats?.sanadApplications ?? 0} icon={<Building2 size={18} />} />
            <StatCard title="PRO Services" value={companyStats?.proServices ?? 0} icon={<Shield size={18} />} />
            <StatCard title="Employees" value={companyStats?.employees ?? 0} icon={<Briefcase size={18} />} />
            <StatCard title="CRM Contacts" value={companyStats?.contacts ?? 0} icon={<Users size={18} />} />
          </div>
        </TabsContent>

        <TabsContent value="contracts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contracts by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {contractsOverview && Array.isArray(contractsOverview) && contractsOverview.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={contractsOverview} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No contract data yet
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contracts by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {contractsOverview && Array.isArray(contractsOverview) && contractsOverview.some((c) => c.count > 0) ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={contractsOverview.filter((c) => c.count > 0)} cx="50%" cy="50%" outerRadius={100} dataKey="count" nameKey="status"
                        label={({ status, count }: { status: string; count: number }) => `${status}: ${count}`}>
                        {contractsOverview.filter((c) => c.count > 0).map((_: unknown, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No contract data yet
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pro" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">PRO Services by Status</CardTitle>
            </CardHeader>
            <CardContent>
                {proOverview && Array.isArray(proOverview) && proOverview.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={proOverview} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                    No PRO service data yet
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crm" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {crmPipeline?.map((stage: any) => (
              <Card key={stage.stage}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground capitalize">{stage.stage?.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold mt-1">{stage.count}</p>
                  <p className="text-xs text-muted-foreground">OMR {Number(stage.totalValue ?? 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {(!crmPipeline || crmPipeline.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground text-sm">
                No CRM pipeline data yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="hr" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Employees" value={hrStats?.totalEmployees ?? 0} icon={<Users size={18} />} />
            <StatCard title="Active" value={hrStats?.activeEmployees ?? 0} icon={<Users size={18} />} />
            <StatCard title="Open Positions" value={0} icon={<Briefcase size={18} />} />
            <StatCard title="Pending Leave" value={hrStats?.pendingLeave ?? 0} icon={<TrendingUp size={18} />} />
          </div>
          {hrStats?.byDepartment && hrStats.byDepartment.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employees by Department</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={hrStats.byDepartment.map((d: { dept: string; count: number }) => ({ department: d.dept, count: d.count }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Scheduled Reports Tab ── */}
        <TabsContent value="reports" className="space-y-5">
          <ScheduledReportsTab />
        </TabsContent>

        {/* ── Custom Report Builder Tab ── */}
        <TabsContent value="builder" className="space-y-5">
          <CustomReportBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Scheduled Reports Component ──────────────────────────────────────────────

const REPORT_TYPES = [
  { value: "platform_overview", label: "Platform Overview" },
  { value: "contracts_summary", label: "Contracts Summary" },
  { value: "pro_services", label: "PRO Services Report" },
  { value: "hr_payroll", label: "HR & Payroll Report" },
  { value: "crm_pipeline", label: "CRM Pipeline Report" },
  { value: "marketplace_bookings", label: "Marketplace Bookings" },
  { value: "subscription_billing", label: "Subscription & Billing" },
];

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "dashboard", label: "Dashboard Only" },
  { value: "email_dashboard", label: "Email + Dashboard" },
];

function ScheduledReportsTab() {
  const utils = trpc.useUtils();
  const { data: reports = [], isLoading } = trpc.analytics.listReports.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "platform_overview",
    frequency: "weekly",
    channel: "email_dashboard",
    recipients: "",
  });

  const createMutation = trpc.analytics.createReport.useMutation({
    onSuccess: () => {
      toast.success(`Report "${form.name}" scheduled`);
      setOpen(false);
      setForm({ name: "", type: "platform_overview", frequency: "weekly", channel: "email_dashboard", recipients: "" });
      utils.analytics.listReports.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.analytics.updateReportStatus.useMutation({
    onSuccess: () => { toast.success("Report status updated"); utils.analytics.listReports.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.analytics.deleteReport.useMutation({
    onSuccess: () => { toast.success("Report deleted"); utils.analytics.listReports.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const runNowMutation = trpc.analytics.runReportNow.useMutation({
    onSuccess: (_, vars) => {
      const r = reports.find(x => x.id === vars.id);
      toast.success(`Running "${r?.name ?? "report"}" now — results will be delivered to recipients`);
      utils.analytics.listReports.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.name || !form.recipients) {
      toast.error("Please fill in all required fields");
      return;
    }
    createMutation.mutate({
      name: form.name,
      type: form.type,
      frequency: form.frequency as "daily" | "weekly" | "monthly" | "quarterly",
      channel: form.channel as "email" | "dashboard" | "email_dashboard",
      recipients: form.recipients,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Scheduled Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Automate report delivery to stakeholders on a recurring schedule</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600">
              <Plus size={14} /> New Report
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Schedule New Report</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Report Name *</Label>
                <Input placeholder="e.g. Weekly Executive Summary" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Report Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Frequency</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Recipients (email) *</Label>
                <Input placeholder="admin@company.com, ceo@company.com" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} />
                <p className="text-xs text-muted-foreground">Comma-separated email addresses</p>
              </div>
              <Button className="w-full" onClick={handleCreate}>
                Schedule Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "Active Reports", value: reports.filter(r => r.status === "active").length, color: "text-green-600 bg-green-50" },
          { label: "Paused Reports", value: reports.filter(r => r.status === "paused").length, color: "text-amber-600 bg-amber-50" },
          { label: "Total Scheduled", value: reports.length, color: "text-blue-600 bg-blue-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-lg p-4 ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Reports list */}
      {isLoading ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground text-sm">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <Calendar size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No scheduled reports yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first scheduled report to automate delivery</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm truncate">{report.name}</p>
                    <Badge className={`text-[10px] shrink-0 ${report.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`} variant="outline">
                      {report.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {REPORT_TYPES.find(t => t.value === report.type)?.label} · {report.frequency} · {CHANNELS.find(c => c.value === report.channel)?.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Recipients: {report.recipients ?? "—"}</p>
                  <div className="flex items-center gap-4 mt-2">
                    {report.nextRunAt && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock size={11} /> Next: {new Date(report.nextRunAt).toLocaleDateString()}
                      </div>
                    )}
                    {report.lastRunAt && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar size={11} /> Last: {new Date(report.lastRunAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Run Now"
                    disabled={runNowMutation.isPending}
                    onClick={() => runNowMutation.mutate({ id: report.id })}>
                    <Play size={13} className="text-green-600" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Download Last Report" onClick={() => toast.info("Downloading last report...")}>
                    <Download size={13} className="text-blue-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-7 text-xs ${report.status === "active" ? "text-amber-600 border-amber-200" : "text-green-600 border-green-200"}`}
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ id: report.id, status: report.status === "active" ? "paused" : "active" })}
                  >
                    {report.status === "active" ? "Pause" : "Resume"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate({ id: report.id })}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Report Builder ────────────────────────────────────────────────────

const BUILDER_MODULES = [
  { id: "contracts", label: "Contracts", fields: ["status", "type", "value", "party", "date_range"] },
  { id: "pro", label: "PRO Services", fields: ["service_type", "status", "expiry", "assignee"] },
  { id: "hr", label: "HR", fields: ["department", "leave_type", "payroll_period", "attendance_date"] },
  { id: "crm", label: "CRM", fields: ["deal_stage", "contact_status", "pipeline", "close_date"] },
  { id: "marketplace", label: "Marketplace", fields: ["provider_category", "booking_status", "rating", "date_range"] },
  { id: "sanad", label: "Sanad Offices", fields: ["office_emirate", "service_type", "application_status"] },
];

const AGGREGATIONS = ["Count", "Sum", "Average", "Min", "Max"];
const CHART_TYPES = ["Bar Chart", "Line Chart", "Pie Chart", "Table"];

function CustomReportBuilder() {
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [aggregation, setAggregation] = useState("Count");
  const [chartType, setChartType] = useState("Bar Chart");
  const [reportName, setReportName] = useState("");
  const [dateRange, setDateRange] = useState("last_30_days");
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const module = BUILDER_MODULES.find(m => m.id === selectedModule);

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const handleGenerate = async () => {
    if (!selectedModule || selectedFields.length === 0) {
      toast.error("Please select a module and at least one field");
      return;
    }
    setGenerating(true);
    // Simulate report generation (real implementation would call a tRPC procedure)
    await new Promise(r => setTimeout(r, 1200));
    setGenerating(false);
    setGenerated(true);
    toast.success("Report generated successfully");
  };

  const handleExport = () => {
    const reportData = {
      name: reportName || `${selectedModule}_report`,
      module: selectedModule,
      fields: selectedFields,
      aggregation,
      chartType,
      dateRange,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${reportData.name}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report configuration exported");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Custom Report Builder</h2>
          <p className="text-sm text-muted-foreground">Build ad-hoc reports by selecting modules, fields, and visualisation type</p>
        </div>
        {generated && (
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download size={14} /> Export Config
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Step 1: Module & Config */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">1. Configure</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Report Name</Label>
                <Input placeholder="e.g. Monthly Contracts" value={reportName} onChange={e => setReportName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Module</Label>
                <Select value={selectedModule} onValueChange={v => { setSelectedModule(v); setSelectedFields([]); setGenerated(false); }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select module..." /></SelectTrigger>
                  <SelectContent>
                    {BUILDER_MODULES.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date Range</Label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                    <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                    <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                    <SelectItem value="this_year">This Year</SelectItem>
                    <SelectItem value="all_time">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Aggregation</Label>
                <Select value={aggregation} onValueChange={setAggregation}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGGREGATIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chart Type</Label>
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHART_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Field Selection */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">2. Select Fields</CardTitle>
            </CardHeader>
            <CardContent>
              {!module ? (
                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Select a module first</div>
              ) : (
                <div className="space-y-2">
                  {module.fields.map(field => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field)}
                        onChange={() => toggleField(field)}
                        className="rounded"
                      />
                      <span className="text-sm capitalize">{field.replace(/_/g, " ")}</span>
                    </label>
                  ))}
                  {selectedFields.length > 0 && (
                    <p className="text-xs text-muted-foreground pt-2 border-t">{selectedFields.length} field{selectedFields.length > 1 ? "s" : ""} selected</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Preview */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">3. Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!generated ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Configure your report and click Generate to preview results
                  </div>
                  <Button className="w-full gap-2" onClick={handleGenerate} disabled={generating || !selectedModule || selectedFields.length === 0}>
                    {generating ? (
                      <><span className="animate-spin">⟳</span> Generating...</>
                    ) : (
                      <><TrendingUp size={14} /> Generate Report</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Report Summary</p>
                    <p className="text-sm font-semibold">{reportName || `${module?.label} Report`}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Module: <strong className="text-foreground">{module?.label}</strong></span>
                      <span>Fields: <strong className="text-foreground">{selectedFields.length}</strong></span>
                      <span>Aggregation: <strong className="text-foreground">{aggregation}</strong></span>
                      <span>Chart: <strong className="text-foreground">{chartType}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {selectedFields.map(f => (
                        <Badge key={f} variant="secondary" className="text-xs capitalize">{f.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="flex-1 gap-1 text-xs h-8" onClick={handleGenerate} disabled={generating}>
                      <TrendingUp size={12} /> Regenerate
                    </Button>
                    <Button variant="outline" className="flex-1 gap-1 text-xs h-8" onClick={handleExport}>
                      <Download size={12} /> Export
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full gap-1 text-xs h-8" onClick={() => { setGenerated(false); setSelectedModule(""); setSelectedFields([]); setReportName(""); }}>
                    Start New Report
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

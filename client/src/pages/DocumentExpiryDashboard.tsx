import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  AlertTriangle, Clock, FileX, FileCheck, Download, Search,
  RefreshCw, ChevronRight, Calendar, Building2, Globe, BarChart2, X,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { fmtDate } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type DocStatus = "expired" | "expiring_soon";
type DocType = "visa" | "work_permit";

interface DocRow {
  employeeId: number;
  employeeName: string;
  employeeNumber: string | null;
  department: string | null;
  nationality: string | null;
  docType: DocType;
  docNumber: string | null;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  status: DocStatus;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DOC_TYPE_LABELS: Record<DocType, string> = {
  visa: "Residence Visa",
  work_permit: "Work Permit",
};

const DOC_TYPE_COLORS: Record<DocType, string> = {
  visa: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  work_permit: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

/** Build 6-month forward timeline buckets (plus an "Overdue" bucket for expired) */
function buildTimeline(rows: DocRow[]) {
  const now = new Date();
  // Generate 6 future months
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(getMonthKey(d));
  }

  const buckets: Record<string, { visa: DocRow[]; work_permit: DocRow[] }> = {
    overdue: { visa: [], work_permit: [] },
  };
  for (const m of months) {
    buckets[m] = { visa: [], work_permit: [] };
  }

  for (const row of rows) {
    if (!row.expiryDate) continue;
    const expDate = new Date(row.expiryDate);
    if (expDate < now) {
      buckets["overdue"][row.docType].push(row);
    } else {
      const key = getMonthKey(expDate);
      if (buckets[key]) {
        buckets[key][row.docType].push(row);
      }
    }
  }

  const chartData = [
    {
      key: "overdue",
      label: "Overdue",
      visa: buckets["overdue"].visa.length,
      work_permit: buckets["overdue"].work_permit.length,
      total: buckets["overdue"].visa.length + buckets["overdue"].work_permit.length,
      rows: [...buckets["overdue"].visa, ...buckets["overdue"].work_permit],
      isOverdue: true,
    },
    ...months.map((m) => ({
      key: m,
      label: getMonthLabel(m),
      visa: buckets[m].visa.length,
      work_permit: buckets[m].work_permit.length,
      total: buckets[m].visa.length + buckets[m].work_permit.length,
      rows: [...buckets[m].visa, ...buckets[m].work_permit],
      isOverdue: false,
    })),
  ];

  return chartData;
}

function StatusBadge({ status, days }: { status: DocStatus; days: number | null }) {
  if (status === "expired") {
    const ago = days != null ? Math.abs(days) : null;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
        <FileX className="w-3 h-3" />
        {ago != null ? `Expired ${ago}d ago` : "Expired"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <Clock className="w-3 h-3" />
      {days != null ? `Expires in ${days}d` : "Expiring soon"}
    </span>
  );
}

function StatCard({
  icon: Icon, label, value, color, active, onClick,
}: {
  icon: React.ElementType; label: string; value: number; color: string;
  active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-150 ${
        active
          ? "border-foreground/30 bg-card shadow-md ring-1 ring-foreground/10"
          : "border-border bg-card hover:border-foreground/20 hover:bg-card/80"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`p-2 rounded-lg bg-current/5`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </button>
  );
}

// Custom tooltip for the bar chart
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const visa = payload.find((p: any) => p.dataKey === "visa")?.value ?? 0;
  const wp = payload.find((p: any) => p.dataKey === "work_permit")?.value ?? 0;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-blue-400 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
        Residence Visa: <span className="font-bold ml-1">{visa}</span>
      </p>
      <p className="text-purple-400 flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
        Work Permit: <span className="font-bold ml-1">{wp}</span>
      </p>
      <p className="text-muted-foreground text-xs mt-1 border-t border-border pt-1">
        Total: <span className="font-semibold text-foreground">{visa + wp}</span>
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentExpiryDashboard() {
  const { activeCompany, expiryWarningDays } = useActiveCompany();
  const warnDays = expiryWarningDays ?? 30;

  const [statusFilter, setStatusFilter] = useState<"all" | "expired" | "expiring_soon">("all");
  const [docTypeFilter, setDocTypeFilter] = useState<"all" | "visa" | "work_permit">("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Fetch ALL expiring docs (no status/docType filter — we do it client-side)
  const { data, isLoading, refetch, isFetching } = trpc.hr.getExpiringDocuments.useQuery(
    { companyId: activeCompany?.id, warnDays },
    { enabled: Boolean(activeCompany?.id) }
  );

  const allRows: DocRow[] = (data?.rows ?? []) as DocRow[];
  const stats = data?.stats ?? { total: 0, expired: 0, expiringSoon: 0 };

  // Timeline data (all rows, no filter)
  const timelineData = useMemo(() => buildTimeline(allRows), [allRows]);

  // Departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set(allRows.map((r) => r.department).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [allRows]);

  // Apply all filters
  const filtered = useMemo(() => {
    let rows = allRows;

    // Month drill-down filter
    if (selectedMonthKey) {
      const bucket = timelineData.find((b) => b.key === selectedMonthKey);
      if (bucket) rows = bucket.rows as DocRow[];
    }

    // Status filter
    if (statusFilter === "expired") rows = rows.filter((r) => r.status === "expired");
    else if (statusFilter === "expiring_soon") rows = rows.filter((r) => r.status === "expiring_soon");

    // Doc type filter
    if (docTypeFilter !== "all") rows = rows.filter((r) => r.docType === docTypeFilter);

    // Dept filter
    if (deptFilter !== "all") rows = rows.filter((r) => r.department === deptFilter);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.employeeName.toLowerCase().includes(q) ||
        (r.employeeNumber ?? "").toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q) ||
        (r.nationality ?? "").toLowerCase().includes(q) ||
        (r.docNumber ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [allRows, selectedMonthKey, statusFilter, docTypeFilter, deptFilter, search, timelineData]);

  // Export to CSV
  const handleExport = () => {
    const headers = ["Employee", "Emp #", "Department", "Nationality", "Document Type", "Doc Number", "Expiry Date", "Days Until Expiry", "Status"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [
        `"${r.employeeName}"`,
        r.employeeNumber ?? "",
        `"${r.department ?? ""}"`,
        `"${r.nationality ?? ""}"`,
        DOC_TYPE_LABELS[r.docType],
        r.docNumber ?? "",
        r.expiryDate ? fmtDate(new Date(r.expiryDate)) : "",
        r.daysUntilExpiry ?? "",
        r.status === "expired" ? "Expired" : "Expiring Soon",
      ].join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `document-expiry-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedBucket = selectedMonthKey
    ? timelineData.find((b) => b.key === selectedMonthKey)
    : null;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
              Document Expiry Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Showing documents expiring within{" "}
              <span className="font-semibold text-foreground">{warnDays} days</span> or already expired
              {activeCompany && <span> · {activeCompany.name}</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Renewals &amp; expiry:</span>
              <Link href="/alerts" className="text-primary hover:underline">
                Expiry alerts
              </Link>
              <span className="text-muted-foreground/60">·</span>
              <Link href="/renewal-workflows" className="text-primary hover:underline">
                Renewal workflows
              </Link>
              <span className="text-muted-foreground/60">·</span>
              <Link href="/subscriptions" className="text-primary hover:underline">
                Subscriptions
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={AlertTriangle}
            label="Total Alerts"
            value={stats.total}
            color="text-foreground"
            active={statusFilter === "all" && !selectedMonthKey}
            onClick={() => { setStatusFilter("all"); setSelectedMonthKey(null); }}
          />
          <StatCard
            icon={FileX}
            label="Expired"
            value={stats.expired}
            color="text-red-400"
            active={statusFilter === "expired" && !selectedMonthKey}
            onClick={() => { setStatusFilter("expired"); setSelectedMonthKey(null); }}
          />
          <StatCard
            icon={Clock}
            label="Expiring Soon"
            value={stats.expiringSoon}
            color="text-amber-400"
            active={statusFilter === "expiring_soon" && !selectedMonthKey}
            onClick={() => { setStatusFilter("expiring_soon"); setSelectedMonthKey(null); }}
          />
          <StatCard
            icon={FileCheck}
            label="Warning Threshold"
            value={warnDays}
            color="text-emerald-400"
          />
        </div>

        {/* Timeline Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                Expiry Timeline
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Click a bar to drill down into that month's documents
              </p>
            </div>
            {selectedMonthKey && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
                onClick={() => setSelectedMonthKey(null)}
              >
                <X className="w-3.5 h-3.5" />
                Clear month filter
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-2 pb-4 px-2">
            {isLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                <RefreshCw className="w-5 h-5 animate-spin mr-2 opacity-50" />
                Loading timeline...
              </div>
            ) : allRows.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                <FileCheck className="w-6 h-6 mr-2 text-emerald-400 opacity-60" />
                No expiring documents to display
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={timelineData}
                  margin={{ top: 4, right: 16, left: -8, bottom: 0 }}
                  barCategoryGap="28%"
                  onClick={(e) => {
                    if (e?.activePayload?.[0]) {
                      const key = (e.activePayload[0].payload as any).key;
                      setSelectedMonthKey((prev) => (prev === key ? null : key));
                      setStatusFilter("all");
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                        {value === "visa" ? "Residence Visa" : "Work Permit"}
                      </span>
                    )}
                  />
                  <Bar dataKey="visa" name="visa" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={48}>
                    {timelineData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.isOverdue ? "#ef4444" : "#60a5fa"}
                        opacity={selectedMonthKey && selectedMonthKey !== entry.key ? 0.35 : 1}
                        stroke={selectedMonthKey === entry.key ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={selectedMonthKey === entry.key ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="work_permit" name="work_permit" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {timelineData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry.isOverdue ? "#f97316" : "#a78bfa"}
                        opacity={selectedMonthKey && selectedMonthKey !== entry.key ? 0.35 : 1}
                        stroke={selectedMonthKey === entry.key ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={selectedMonthKey === entry.key ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Month drill-down banner */}
        {selectedBucket && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-foreground font-medium">
              Showing {selectedBucket.total} document{selectedBucket.total !== 1 ? "s" : ""} expiring in{" "}
              <span className="text-amber-400">{selectedBucket.label}</span>
            </span>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              onClick={() => setSelectedMonthKey(null)}
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}

        {/* Filters */}
        <Card className="border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, emp #, department, nationality..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-background"
                />
              </div>
              <Select value={docTypeFilter} onValueChange={(v) => setDocTypeFilter(v as any)}>
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents</SelectItem>
                  <SelectItem value="visa">Residence Visa</SelectItem>
                  <SelectItem value="work_permit">Work Permit</SelectItem>
                </SelectContent>
              </Select>
              {departments.length > 0 && (
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="w-[160px] bg-background">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(search || docTypeFilter !== "all" || deptFilter !== "all" || selectedMonthKey) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setDocTypeFilter("all");
                    setDeptFilter("all");
                    setSelectedMonthKey(null);
                    setStatusFilter("all");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-border">
          <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {filtered.length} document{filtered.length !== 1 ? "s" : ""} requiring attention
              {selectedBucket && (
                <span className="ml-2 text-xs font-normal text-amber-400">
                  · {selectedBucket.label}
                </span>
              )}
            </CardTitle>
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Expired
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Expiring soon
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                Loading documents...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FileCheck className="w-12 h-12 mx-auto mb-3 text-emerald-400 opacity-60" />
                <p className="font-semibold text-foreground mb-1">
                  {allRows.length === 0 ? "No expiring documents found" : "No results match your filters"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {allRows.length === 0
                    ? `All active employee documents are valid beyond the ${warnDays}-day warning threshold.`
                    : "Try adjusting your search or filter criteria."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-5 py-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Department</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Nationality</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Document</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Doc Number</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((row, idx) => (
                      <tr
                        key={`${row.employeeId}-${row.docType}-${idx}`}
                        className={`group hover:bg-muted/20 transition-colors ${
                          row.status === "expired" ? "bg-red-500/3" : "bg-amber-500/3"
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-1 h-8 rounded-full flex-shrink-0 ${
                                row.status === "expired" ? "bg-red-500" : "bg-amber-500"
                              }`}
                            />
                            <div>
                              <Link href="/my-team">
                                <span className="font-medium text-foreground hover:text-primary cursor-pointer">
                                  {row.employeeName}
                                </span>
                              </Link>
                              {row.employeeNumber && (
                                <p className="text-xs text-muted-foreground">{row.employeeNumber}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                            {row.department ?? <span className="italic opacity-50">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                            {row.nationality ?? <span className="italic opacity-50">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${DOC_TYPE_COLORS[row.docType]}`}>
                            {DOC_TYPE_LABELS[row.docType]}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                          {row.docNumber ?? <span className="italic opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-sm">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            {row.expiryDate ? fmtDate(new Date(row.expiryDate)) : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} days={row.daysUntilExpiry} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href="/my-team">
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0">
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground text-center pb-2">
          Warning threshold is configurable in{" "}
          <Link href="/company/settings">
            <span className="underline cursor-pointer hover:text-foreground">Company Settings → HR Compliance</span>
          </Link>
          . Currently set to <strong>{warnDays} days</strong>.
        </p>
      </div>
    </DashboardLayout>
  );
}

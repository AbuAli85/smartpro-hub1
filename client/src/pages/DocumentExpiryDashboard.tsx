import { useState, useMemo } from "react";
import { Link } from "wouter";
import { AlertTriangle, Clock, FileX, FileCheck, Download, Search, Filter, RefreshCw, ChevronRight, Calendar, User, Building2, Globe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { fmtDate } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  icon: Icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  active?: boolean;
  onClick?: () => void;
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
        <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("-400", "-500/10").replace("-500", "-500/10")}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
    </button>
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

  const { data, isLoading, refetch, isFetching } = trpc.hr.getExpiringDocuments.useQuery(
    {
      companyId: activeCompany?.id,
      warnDays,
      docType: docTypeFilter,
      status: statusFilter,
    },
    { enabled: Boolean(activeCompany?.id) }
  );

  const rows: DocRow[] = (data?.rows ?? []) as DocRow[];
  const stats = data?.stats ?? { total: 0, expired: 0, expiringSoon: 0 };

  // Departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set(rows.map((r) => r.department).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [rows]);

  // Client-side search + dept filter
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (deptFilter !== "all" && r.department !== deptFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.employeeName.toLowerCase().includes(q) ||
        (r.employeeNumber ?? "").toLowerCase().includes(q) ||
        (r.department ?? "").toLowerCase().includes(q) ||
        (r.nationality ?? "").toLowerCase().includes(q) ||
        (r.docNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, deptFilter]);

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
              Showing documents expiring within <span className="font-semibold text-foreground">{warnDays} days</span> or already expired
              {activeCompany && <span> · {activeCompany.name}</span>}
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
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <StatCard
            icon={FileX}
            label="Expired"
            value={stats.expired}
            color="text-red-400"
            active={statusFilter === "expired"}
            onClick={() => setStatusFilter("expired")}
          />
          <StatCard
            icon={Clock}
            label="Expiring Soon"
            value={stats.expiringSoon}
            color="text-amber-400"
            active={statusFilter === "expiring_soon"}
            onClick={() => setStatusFilter("expiring_soon")}
          />
          <StatCard
            icon={FileCheck}
            label="Warning Threshold"
            value={warnDays}
            color="text-emerald-400"
          />
        </div>

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
              {(search || docTypeFilter !== "all" || deptFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(""); setDocTypeFilter("all"); setDeptFilter("all"); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear filters
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
                  {rows.length === 0 ? "No expiring documents found" : "No results match your filters"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {rows.length === 0
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
                        {/* Left accent bar */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-1 h-8 rounded-full flex-shrink-0 ${
                                row.status === "expired" ? "bg-red-500" : "bg-amber-500"
                              }`}
                            />
                            <div>
                              <Link href={`/my-team`}>
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
          <Link href="/company-settings">
            <span className="underline cursor-pointer hover:text-foreground">Company Settings → HR Compliance</span>
          </Link>
          . Currently set to <strong>{warnDays} days</strong>.
        </p>
      </div>
    </DashboardLayout>
  );
}

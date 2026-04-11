import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Search, Users, AlertTriangle, Clock, CheckCircle2, XCircle,
  ChevronRight, Filter, Download, RefreshCw, Eye, ClipboardList,
} from "lucide-react";
import { buildProfileChangeQueueHref } from "@shared/profileChangeRequestQueueUrl";

const PERMIT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "text-emerald-700", bg: "bg-emerald-100" },
  expiring_soon: { label: "Expiring Soon", color: "text-amber-700", bg: "bg-amber-100" },
  expired: { label: "Expired", color: "text-red-700", bg: "bg-red-100" },
  in_grace: { label: "In Grace", color: "text-orange-700", bg: "bg-orange-100" },
  cancelled: { label: "Cancelled", color: "text-gray-700", bg: "bg-gray-100" },
  transferred: { label: "Transferred", color: "text-blue-700", bg: "bg-blue-100" },
  pending_update: { label: "Pending Update", color: "text-purple-700", bg: "bg-purple-100" },
  unknown: { label: "Unknown", color: "text-gray-600", bg: "bg-gray-100" },
};

function ExpiryBadge({ days }: { days: number | null }) {
  if (days == null) return null;
  if (days < 0) return <Badge className="bg-red-100 text-red-700 text-xs">Expired {Math.abs(days)}d ago</Badge>;
  if (days <= 30) return <Badge className="bg-red-100 text-red-700 text-xs">{days}d left</Badge>;
  if (days <= 90) return <Badge className="bg-amber-100 text-amber-700 text-xs">{days}d left</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 text-xs">{days}d left</Badge>;
}

export default function WorkforceEmployeesPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [permitStatus, setPermitStatus] = useState<string>("all");
  const [expiringFilter, setExpiringFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { activeCompanyId } = useActiveCompany();

  const { data, isLoading, refetch } = trpc.workforce.employees.list.useQuery({
    query: query || undefined,
    permitStatus: permitStatus !== "all" ? (permitStatus as "active" | "expiring_soon" | "expired" | "in_grace" | "cancelled" | "transferred" | "pending_update" | "unknown") : undefined,
    expiringWithinDays: expiringFilter === "30" ? 30 : expiringFilter === "90" ? 90 : undefined,
    page,
    pageSize: 20,
    companyId: activeCompanyId ?? undefined,
  }, { enabled: activeCompanyId != null });

  const { data: wfStats } = trpc.workforce.dashboardStats.useQuery(undefined, {
    enabled: activeCompanyId != null,
    staleTime: 60_000,
  });
  const pendingProfileRequests = wfStats?.pendingProfileChangeRequests ?? 0;

  const employees = data?.items ?? [];

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workforce Employees</h1>
          <p className="text-muted-foreground text-sm mt-0.5">MOL-enhanced employee profiles with permit health indicators</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/workforce/permits/upload")}>
            Upload MOL Certificate
          </Button>
        </div>
      </div>

      {pendingProfileRequests > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200/80 bg-indigo-50/90 dark:bg-indigo-950/40 dark:border-indigo-800 px-4 py-3">
          <ClipboardList className="h-5 w-5 text-indigo-600 dark:text-indigo-300 shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-medium text-indigo-950 dark:text-indigo-100">
              {pendingProfileRequests} pending profile change request{pendingProfileRequests === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-indigo-800/90 dark:text-indigo-200/80">
              Open the company queue to review and resolve employee-submitted updates.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => navigate(buildProfileChangeQueueHref({ status: "pending" }))}
          >
            Open queue
          </Button>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, Civil ID, passport, permit no..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={permitStatus} onValueChange={(v) => { setPermitStatus(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Permit Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring_soon">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="in_grace">In Grace</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={expiringFilter} onValueChange={(v) => { setExpiringFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Expiry Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Expiry</SelectItem>
            <SelectItem value="30">Expiring in 30 days</SelectItem>
            <SelectItem value="90">Expiring in 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Civil ID</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Nationality</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Work Permit</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Permit Status</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Expiry</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Occupation</th>
                  <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No employees found. Upload MOL certificates to populate workforce data.</p>
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => {
                    const permitCfg = PERMIT_STATUS_CONFIG[emp.permitStatus ?? "unknown"] ?? PERMIT_STATUS_CONFIG.unknown;
                    return (
                      <tr key={emp.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-muted-foreground">{emp.email ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{emp.civilId ?? "—"}</td>
                        <td className="px-4 py-3 text-xs">{emp.nationality ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs">{emp.activePermitNumber ?? "—"}</td>
                        <td className="px-4 py-3">
                          {emp.permitStatus ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${permitCfg.bg} ${permitCfg.color}`}>
                              {permitCfg.label}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No permit</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ExpiryBadge days={emp.daysToExpiry} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-32 truncate">
                          {emp.occupationTitle ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => navigate(`/workforce/employees/${emp.id}`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => navigate(`/workforce/cases/new?employeeId=${emp.id}`)}
                            >
                              + Case
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && employees.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {employees.length} employees
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={employees.length < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

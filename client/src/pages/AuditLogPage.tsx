import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Search, RefreshCw, Download, Eye, Clock, User, Building2, AlertTriangle } from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const ENTITY_COLORS: Record<string, string> = {
  contract: "bg-blue-100 text-blue-700",
  employee: "bg-green-100 text-green-700",
  work_permit: "bg-orange-100 text-orange-700",
  company: "bg-purple-100 text-purple-700",
  user: "bg-gray-100 text-gray-700",
  invoice: "bg-yellow-100 text-yellow-700",
  payroll: "bg-teal-100 text-teal-700",
  officer: "bg-red-100 text-red-700",
  sanad: "bg-indigo-100 text-indigo-700",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  login: "bg-gray-100 text-gray-700",
  logout: "bg-gray-100 text-gray-700",
  export: "bg-yellow-100 text-yellow-700",
  approve: "bg-teal-100 text-teal-700",
  reject: "bg-orange-100 text-orange-700",
};

function getActionColor(action: string) {
  const key = Object.keys(ACTION_COLORS).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLORS[key] : "bg-gray-100 text-gray-700";
}

function getEntityColor(entity: string) {
  const key = Object.keys(ENTITY_COLORS).find((k) => entity.toLowerCase().includes(k));
  return key ? ENTITY_COLORS[key] : "bg-gray-100 text-gray-700";
}

interface AuditEntry {
  _key?: string;
  source?: "audit_event" | "audit_log";
  id: number;
  userId: number | null;
  companyId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export default function AuditLogPage() {
  const [limit, setLimit] = useState(100);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { data: logs = [], isLoading, refetch, isFetching } = trpc.analytics.auditLogs.useQuery(
    { limit },
    { refetchInterval: 30000 }
  );

  const filtered = useMemo(() => {
    return (logs as AuditEntry[]).filter((log) => {
      const matchSearch =
        !search ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.entityType.toLowerCase().includes(search.toLowerCase()) ||
        String(log.entityId ?? "").includes(search) ||
        String(log.userId ?? "").includes(search);
      const matchEntity = entityFilter === "all" || log.entityType === entityFilter;
      const matchAction =
        actionFilter === "all" || log.action.toLowerCase().includes(actionFilter.toLowerCase());
      return matchSearch && matchEntity && matchAction;
    });
  }, [logs, search, entityFilter, actionFilter]);

  const entityTypes = useMemo(
    () => Array.from(new Set((logs as AuditEntry[]).map((l) => l.entityType))).sort(),
    [logs]
  );

  const actionTypes = useMemo(() => {
    const actions = Array.from(new Set((logs as AuditEntry[]).map((l) => l.action))).sort();
    return actions;
  }, [logs]);

  function exportCSV() {
    const header = [
      "Source",
      "Row key",
      "ID",
      "Timestamp",
      "User ID",
      "Company ID",
      "Action",
      "Entity Type",
      "Entity ID",
      "IP Address",
    ];
    const rows = filtered.map((l) => [
      l.source ?? "",
      l._key ?? "",
      l.id,
      new Date(l.createdAt).toISOString(),
      l.userId ?? "",
      l.companyId ?? "",
      l.action,
      l.entityType,
      l.entityId ?? "",
      l.ipAddress ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Summary stats
  const stats = useMemo(() => {
    const total = (logs as AuditEntry[]).length;
    const today = (logs as AuditEntry[]).filter(
      (l) => new Date(l.createdAt).toDateString() === new Date().toDateString()
    ).length;
    const deletes = (logs as AuditEntry[]).filter((l) => l.action.toLowerCase().includes("delete")).length;
    const uniqueUsers = new Set((logs as AuditEntry[]).map((l) => l.userId).filter(Boolean)).size;
    return { total, today, deletes, uniqueUsers };
  }, [logs]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield size={24} className="text-orange-500" />
            Audit Log Viewer
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Merged timeline: operational <span className="font-medium text-foreground/80">audit_events</span> (workforce,
            HR performance, etc.) plus <span className="font-medium text-foreground/80">audit_logs</span> for platform
            access/role changes. HR-sensitive event types respect your permissions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download size={14} className="mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: stats.total, icon: Clock, color: "text-blue-500" },
          { label: "Today", value: stats.today, icon: Clock, color: "text-green-500" },
          { label: "Delete Actions", value: stats.deletes, icon: AlertTriangle, color: "text-red-500" },
          { label: "Active Users", value: stats.uniqueUsers, icon: User, color: "text-purple-500" },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <s.icon size={20} className={s.color} />
              <div>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search actions, entities, IDs..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entityTypes.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
                <SelectItem value="250">Last 250</SelectItem>
                <SelectItem value="500">Last 500</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {(logs as AuditEntry[]).length} events
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              <RefreshCw size={20} className="animate-spin mr-2" /> Loading audit log...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Shield size={32} className="opacity-30" />
              <p className="text-sm">No audit events found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Source</TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Company ID</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow
                      key={log._key ?? `row-${log.source ?? "x"}-${log.id}`}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedEntry(log)}
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-normal ${
                            log.source === "audit_log"
                              ? "border-violet-300 text-violet-800 bg-violet-50 dark:bg-violet-950/30"
                              : "border-sky-300 text-sky-800 bg-sky-50 dark:bg-sky-950/30"
                          }`}
                        >
                          {log.source === "audit_log" ? "Access / role" : "Activity"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{log.id}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-muted-foreground" />
                          {fmtDateTime(log.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs font-normal ${getActionColor(log.action)}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs font-normal ${getEntityColor(log.entityType)}`}>
                          {log.entityType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.entityId ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.userId ? (
                          <span className="flex flex-wrap items-center gap-1">
                            <User size={12} className="text-muted-foreground" />
                            {log.userId}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.companyId ? (
                          <span className="flex flex-wrap items-center gap-1">
                            <Building2 size={12} className="text-muted-foreground" />
                            {log.companyId}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {log.ipAddress ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); setSelectedEntry(log); }}
                        >
                          <Eye size={13} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Shield size={18} className="text-orange-500" />
              Audit {selectedEntry?.source === "audit_log" ? "access" : "activity"} #{selectedEntry?.id}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  {
                    label: "Source",
                    value:
                      selectedEntry.source === "audit_log"
                        ? "audit_logs (platform access / membership)"
                        : "audit_events (operational)",
                  },
                  { label: "Row key", value: selectedEntry._key ?? "—" },
                  { label: "Timestamp", value: fmtDateTime(selectedEntry.createdAt) },
                  { label: "Action", value: selectedEntry.action },
                  { label: "Entity Type", value: selectedEntry.entityType },
                  { label: "Entity ID", value: selectedEntry.entityId ?? "—" },
                  { label: "User ID", value: selectedEntry.userId ?? "—" },
                  { label: "Company ID", value: selectedEntry.companyId ?? "—" },
                  { label: "IP Address", value: selectedEntry.ipAddress ?? "—" },
                  { label: "User Agent", value: selectedEntry.userAgent ? selectedEntry.userAgent.slice(0, 60) + "..." : "—" },
                ].map((f) => (
                  <div key={f.label} className="bg-muted/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                    <div className="font-medium text-sm break-all">{String(f.value ?? "")}</div>
                  </div>
                ))}
              </div>
              {Boolean(selectedEntry.oldValues) && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Previous Values</div>
                  <pre className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3 text-xs overflow-x-auto text-red-800 dark:text-red-300">
                    {String(JSON.stringify(selectedEntry.oldValues as object, null, 2))}
                  </pre>
                </div>
              )}
              {Boolean(selectedEntry.newValues) && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">New Values</div>
                  <pre className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3 text-xs overflow-x-auto text-green-800 dark:text-green-300">
                    {String(JSON.stringify(selectedEntry.newValues as object, null, 2))}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

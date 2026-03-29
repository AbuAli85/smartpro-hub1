import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Info,
  RefreshCw,
  Search,
  Shield,
  User,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "high" | "medium" | "low";
type AlertCategory =
  | "work_permit"
  | "visa"
  | "resident_card"
  | "labour_card"
  | "pro_service"
  | "sanad_licence"
  | "officer_document"
  | "employee_document";

interface ExpiryAlert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  daysUntilExpiry: number;
  expiryDate: Date | string;
  entityId: number;
  entityName: string;
  companyId?: number;
  companyName?: string;
  description: string;
  actionUrl?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string; icon: React.ReactNode; border: string }> = {
  critical: {
    label: "Critical",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: <AlertCircle size={14} className="text-red-600" />,
  },
  high: {
    label: "High",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    icon: <AlertTriangle size={14} className="text-orange-600" />,
  },
  medium: {
    label: "Medium",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: <Clock size={14} className="text-amber-600" />,
  },
  low: {
    label: "Low",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: <Info size={14} className="text-blue-600" />,
  },
};

const CATEGORY_LABELS: Record<AlertCategory, { label: string; icon: React.ReactNode }> = {
  work_permit: { label: "Work Permit", icon: <Shield size={13} /> },
  visa: { label: "Visa", icon: <FileText size={13} /> },
  resident_card: { label: "Resident Card", icon: <User size={13} /> },
  labour_card: { label: "Labour Card", icon: <FileText size={13} /> },
  pro_service: { label: "PRO Service", icon: <Shield size={13} /> },
  sanad_licence: { label: "Sanad Licence", icon: <Building2 size={13} /> },
  officer_document: { label: "Officer Document", icon: <User size={13} /> },
  employee_document: { label: "Employee Document", icon: <FileText size={13} /> },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpiryAlertsPage() {
  const [maxDays, setMaxDays] = useState("90");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const triggerRenewal = trpc.alerts.triggerRenewal.useMutation({
    onSuccess: (data) => {
      setRenewingId(null);
      alert(data.message);
    },
    onError: () => setRenewingId(null),
  });

  const alertsQuery = trpc.alerts.getExpiryAlerts.useQuery({
    maxDays: parseInt(maxDays),
    severity: filterSeverity !== "all" ? (filterSeverity as AlertSeverity) : undefined,
    category: filterCategory !== "all" ? (filterCategory as AlertCategory) : undefined,
  });

  const alerts: ExpiryAlert[] = alertsQuery.data?.alerts ?? [];
  const summary = alertsQuery.data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

  // Client-side search filter
  const filtered = search
    ? alerts.filter(
        (a) =>
          a.entityName.toLowerCase().includes(search.toLowerCase()) ||
          a.companyName?.toLowerCase().includes(search.toLowerCase()) ||
          a.description.toLowerCase().includes(search.toLowerCase())
      )
    : alerts;

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="text-primary" size={26} />
            Expiry & Renewal Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track upcoming expirations across work permits, visas, documents, and licences
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => alertsQuery.refetch()}
          disabled={alertsQuery.isFetching}
        >
          <RefreshCw size={14} className={`mr-1.5 ${alertsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(["critical", "high", "medium", "low"] as AlertSeverity[]).map((sev) => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = summary[sev] ?? 0;
          return (
            <Card
              key={sev}
              className={`border cursor-pointer transition-all hover:shadow-md ${filterSeverity === sev ? "ring-2 ring-primary" : ""}`}
              onClick={() => setFilterSeverity(filterSeverity === sev ? "all" : sev)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-xs font-medium uppercase tracking-wide ${cfg.color}`}>{cfg.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${cfg.color}`}>{count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {sev === "critical" ? "≤ 7 days" : sev === "high" ? "≤ 30 days" : sev === "medium" ? "≤ 60 days" : "≤ 90 days"}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${cfg.bg} border ${cfg.border}`}>
                    {cfg.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-muted/40 p-3 rounded-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm bg-background"
            placeholder="Search alerts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={maxDays} onValueChange={setMaxDays}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7 days</SelectItem>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
            <SelectItem value="180">Next 180 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44 h-8 text-sm bg-background">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {(Object.keys(CATEGORY_LABELS) as AlertCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {(filterSeverity !== "all" || filterCategory !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setFilterSeverity("all"); setFilterCategory("all"); setSearch(""); }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Alerts List */}
      {alertsQuery.isLoading ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
          Loading alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-xl">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-500" />
          <p className="font-semibold text-lg">No alerts found</p>
          <p className="text-muted-foreground text-sm mt-1">
            {summary.total === 0
              ? "All documents and permits are up to date within the selected period."
              : "No alerts match the current filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground px-1">
            Showing <strong>{filtered.length}</strong> alert{filtered.length !== 1 ? "s" : ""}
            {summary.total !== filtered.length ? ` (filtered from ${summary.total})` : ""}
          </p>
          {filtered.map((alert) => {
            const sev = SEVERITY_CONFIG[alert.severity];
            const cat = CATEGORY_LABELS[alert.category];
            const expDate = new Date(alert.expiryDate);
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-4 rounded-xl border ${sev.border} ${sev.bg} transition-all hover:shadow-sm`}
              >
                {/* Severity indicator */}
                <div className={`mt-0.5 p-1.5 rounded-lg bg-white/60 border ${sev.border}`}>
                  {sev.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold ${sev.color}`}>{alert.entityName}</span>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${sev.color} border-current/30`}>
                      {sev.label}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-white/60 px-2 py-0.5 rounded-full border border-muted">
                      {cat.icon}
                      {cat.label}
                    </span>
                  </div>
                  <p className={`text-sm ${sev.color}`}>{alert.description}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    {alert.companyName && (
                      <span className="flex flex-wrap items-center gap-1">
                        <Building2 size={11} />
                        {alert.companyName}
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-1">
                      <Clock size={11} />
                      Expires {expDate.toLocaleDateString("en-OM", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>

                {/* Days badge + action */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`text-center px-3 py-1.5 rounded-lg bg-white/70 border ${sev.border}`}>
                    <div className={`text-xl font-bold ${sev.color}`}>{alert.daysUntilExpiry}</div>
                    <div className={`text-xs ${sev.color} opacity-80`}>days</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {alert.actionUrl && (
                      <Link href={alert.actionUrl}>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                          View
                          <ExternalLink size={11} />
                        </Button>
                      </Link>
                    )}
                    {["work_permit", "visa", "resident_card", "labour_card"].includes(alert.category) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                        disabled={renewingId === alert.id || triggerRenewal.isPending}
                        onClick={() => {
                          setRenewingId(alert.id);
                          triggerRenewal.mutate({
                            alertId: alert.id,
                            category: alert.category as "work_permit",
                            entityId: alert.entityId,
                            companyId: alert.companyId,
                          });
                        }}
                      >
                        {renewingId === alert.id ? <RefreshCw size={11} className="animate-spin" /> : null}
                        Renew
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

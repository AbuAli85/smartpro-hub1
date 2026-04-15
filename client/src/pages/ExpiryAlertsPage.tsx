import React, { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
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
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { renewalsTrail } from "@/components/hub/hubCrumbs";

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

// ─── Static config (visual tokens only — labels come from i18n) ───────────────

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    labelKey: string;
    daysKey: string;
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
  }
> = {
  critical: {
    labelKey: "severity.critical",
    daysKey: "severity.criticalDays",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-800",
    icon: <AlertCircle size={14} className="text-red-600 dark:text-red-400" />,
  },
  high: {
    labelKey: "severity.high",
    daysKey: "severity.highDays",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-800",
    icon: <AlertTriangle size={14} className="text-orange-600 dark:text-orange-400" />,
  },
  medium: {
    labelKey: "severity.medium",
    daysKey: "severity.mediumDays",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
    icon: <Clock size={14} className="text-amber-600 dark:text-amber-400" />,
  },
  low: {
    labelKey: "severity.low",
    daysKey: "severity.lowDays",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    icon: <Info size={14} className="text-blue-600 dark:text-blue-400" />,
  },
};

const CATEGORY_CONFIG: Record<AlertCategory, { labelKey: string; icon: React.ReactNode }> = {
  work_permit:       { labelKey: "category.work_permit",       icon: <Shield size={13} /> },
  visa:              { labelKey: "category.visa",              icon: <FileText size={13} /> },
  resident_card:     { labelKey: "category.resident_card",     icon: <User size={13} /> },
  labour_card:       { labelKey: "category.labour_card",       icon: <FileText size={13} /> },
  pro_service:       { labelKey: "category.pro_service",       icon: <Shield size={13} /> },
  sanad_licence:     { labelKey: "category.sanad_licence",     icon: <Building2 size={13} /> },
  officer_document:  { labelKey: "category.officer_document",  icon: <User size={13} /> },
  employee_document: { labelKey: "category.employee_document", icon: <FileText size={13} /> },
};

/** Categories that support one-click renewal trigger */
const RENEWABLE_CATEGORIES: AlertCategory[] = [
  "work_permit",
  "visa",
  "resident_card",
  "labour_card",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExpiryAlertsPage() {
  const { t, i18n } = useTranslation("alerts");
  const { user } = useAuth();
  const isPlatform = seesPlatformOperatorNav(user);
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const [maxDays, setMaxDays] = useState("90");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const triggerRenewal = trpc.alerts.triggerRenewal.useMutation({
    onSuccess: (data) => {
      setRenewingId(null);
      toast.success(data.message);
      void utils.alerts.getExpiryAlerts.invalidate();
      void utils.alerts.getAlertBadgeCount.invalidate();
    },
    onError: (e) => { setRenewingId(null); toast.error(e.message); },
  });

  const maxDaysNum = Math.min(365, Math.max(1, parseInt(maxDays, 10) || 90));
  const alertsQuery = trpc.alerts.getExpiryAlerts.useQuery(
    {
      maxDays: maxDaysNum,
      severity: filterSeverity !== "all" ? (filterSeverity as AlertSeverity) : undefined,
      category: filterCategory !== "all" ? (filterCategory as AlertCategory) : undefined,
      companyId: activeCompanyId ?? undefined,
    },
    { enabled: isPlatform || activeCompanyId != null },
  );

  const alerts: ExpiryAlert[] = alertsQuery.data?.alerts ?? [];
  const summary = alertsQuery.data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

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
      <HubBreadcrumb items={renewalsTrail(t("page.breadcrumb", "Expiry alerts"))} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">
              {t("sourceBadges.ministryOfLabour")}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
              {t("sourceBadges.pasi")}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
              {t("sourceBadges.ropVisa")}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200">
              {t("sourceBadges.crRenewal")}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 text-teal-700 border border-teal-200">
              {t("sourceBadges.sanadLicence")}
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Bell className="text-orange-500" size={26} />
            {t("page.title", "Expiry & Renewal Alerts")}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("page.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => alertsQuery.refetch()}
          disabled={alertsQuery.isFetching}
        >
          <RefreshCw size={14} className={`mr-1.5 ${alertsQuery.isFetching ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>

      {/* ── Severity summary cards ──────────────────────────────────────────── */}
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
                    <p className={`text-xs font-medium uppercase tracking-wide ${cfg.color}`}>
                      {t(cfg.labelKey)}
                    </p>
                    <p className={`text-3xl font-bold mt-1 ${cfg.color}`}>{count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t(cfg.daysKey)}
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

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center bg-muted/40 p-3 rounded-lg">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm bg-background"
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Days window */}
        <Select value={maxDays} onValueChange={setMaxDays}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("filters.next7Days")}</SelectItem>
            <SelectItem value="30">{t("filters.next30Days")}</SelectItem>
            <SelectItem value="60">{t("filters.next60Days")}</SelectItem>
            <SelectItem value="90">{t("filters.next90Days")}</SelectItem>
            <SelectItem value="180">{t("filters.next180Days")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-44 h-8 text-sm bg-background">
            <SelectValue placeholder={t("filters.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allCategories")}</SelectItem>
            {(Object.keys(CATEGORY_CONFIG) as AlertCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {t(CATEGORY_CONFIG[cat].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Severity filter */}
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-36 h-8 text-sm bg-background">
            <SelectValue placeholder={t("filters.allSeverities")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allSeverities")}</SelectItem>
            {(["critical", "high", "medium", "low"] as AlertSeverity[]).map((sev) => (
              <SelectItem key={sev} value={sev}>
                {t(SEVERITY_CONFIG[sev].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(filterSeverity !== "all" || filterCategory !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setFilterSeverity("all"); setFilterCategory("all"); setSearch(""); }}
          >
            <Filter size={12} className="me-1" />
            {t("actions.clearFilters")}
          </Button>
        )}
      </div>

      {/* ── Alerts list ────────────────────────────────────────────────────── */}
      {alertsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-48" />
                <div className="h-3 bg-muted rounded w-72" />
                <div className="h-3 bg-muted rounded w-36" />
              </div>
              <div className="w-14 h-14 rounded-lg bg-muted shrink-0" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        /* ── Empty state ──────────────────────────────────────────────────── */
        <div className="text-center py-16 border-2 border-dashed rounded-xl">
          <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-500" />
          <p className="font-semibold text-lg">{t("emptyState.title", "No alerts found")}</p>
          <p className="text-muted-foreground text-sm mt-1">
            {summary.total === 0
              ? t("emptyState.allUpToDate")
              : t("emptyState.noMatch")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground px-1">
            <Trans
              t={t}
              i18nKey="list.showing"
              count={filtered.length}
              values={{ count: filtered.length }}
              components={{ bold: <strong /> }}
            />
            {summary.total !== filtered.length && (
              <> {t("list.filteredFrom", { total: summary.total })}</>
            )}
          </p>

          {filtered.map((alert) => {
            const sev = SEVERITY_CONFIG[alert.severity];
            const cat = CATEGORY_CONFIG[alert.category];
            const expDate = new Date(alert.expiryDate);
            const dateLocale = i18n.language === "ar-OM" ? "ar-EG" : "en-GB";
            return (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-4 rounded-xl border ${sev.border} ${sev.bg} transition-all hover:shadow-sm`}
              >
                {/* Severity indicator */}
                <div className={`mt-0.5 p-1.5 rounded-lg bg-background/60 border ${sev.border}`}>
                  {sev.icon}
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold ${sev.color}`}>{alert.entityName}</span>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${sev.color} border-current/30`}>
                      {t(sev.labelKey)}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full border border-muted">
                      {cat.icon}
                      {t(cat.labelKey)}
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
                      {t("list.expires")}{" "}
                      {expDate.toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Days badge + action buttons */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className={`text-center px-3 py-1.5 rounded-lg bg-background/70 border ${sev.border}`}>
                    <div className={`text-xl font-bold ${sev.color}`}>{alert.daysUntilExpiry}</div>
                    <div className={`text-xs ${sev.color} opacity-80`}>{t("list.days")}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {alert.actionUrl && (
                      <Link href={alert.actionUrl}>
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                          {t("actions.view")}
                          <ExternalLink size={11} />
                        </Button>
                      </Link>
                    )}
                    {RENEWABLE_CATEGORIES.includes(alert.category) && (
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
                        {t("actions.renew")}
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

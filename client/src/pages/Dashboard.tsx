import { trpc } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { clientNavItemVisible, normalizeClientPath, seesPlatformOperatorNav, getRoleDefaultRoute } from "@shared/clientNav";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BarChart3,
  Briefcase, Building2, CheckCircle2, Clock, FileText,
  Shield, ShoppingBag, TrendingUp, Users, Banknote,
  Globe, Zap, RefreshCw, Award, MapPin, Calendar,
  ChevronDown, ChevronRight, Activity, Bell, Target, CircleDollarSign, Truck, ClipboardList, Download,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { WorkforceHealthWidget } from "@/components/WorkforceHealthWidget";
import { ContractKpiWidget } from "@/components/contracts/ContractKpiWidget";
import { OwnerSetupChecklist } from "@/components/OwnerSetupChecklist";
import { ExecutiveControlTower } from "@/components/dashboard/ExecutiveControlTower";
import { ManagementCadencePanel } from "@/components/dashboard/ManagementCadencePanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One-line roll-up for owner resolution (non-zero counts only). */
function compactResolutionSummary(rs: {
  stalledFollowUpCount: number;
  inFollowUpCount: number;
  needsAssignmentCount: number;
  interventionDueWithin7DaysCount: number;
  taskDueOverdueCount: number;
  needsTaggedTaskCount: number;
  missingOwnerCount: number;
  monitorNoTagCount: number;
}): string {
  const parts: string[] = [];
  if (rs.stalledFollowUpCount) parts.push(`${rs.stalledFollowUpCount} stalled`);
  if (rs.inFollowUpCount) parts.push(`${rs.inFollowUpCount} in follow-up`);
  if (rs.needsAssignmentCount) parts.push(`${rs.needsAssignmentCount} need owner`);
  if (rs.interventionDueWithin7DaysCount) parts.push(`${rs.interventionDueWithin7DaysCount} due ≤7d`);
  if (rs.taskDueOverdueCount) parts.push(`${rs.taskDueOverdueCount} task overdue`);
  if (rs.needsTaggedTaskCount) parts.push(`${rs.needsTaggedTaskCount} need HR task`);
  if (rs.missingOwnerCount) parts.push(`${rs.missingOwnerCount} no CRM owner`);
  if (rs.monitorNoTagCount) parts.push(`${rs.monitorNoTagCount} monitor`);
  return parts.slice(0, 6).join(" · ");
}

/* ── KPI Stat Card ─────────────────────────────────────────────────────── */
function StatCard({
  title, value, icon, gradient, change, sub,
}: {
  title: string; value: number | string; icon: React.ReactNode;
  gradient: string; change?: string; sub?: string;
}) {
  return (
    <div className={`${gradient} rounded-2xl p-5 text-white shadow-sm`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">{icon}</div>
        {change && (
          <span className="text-[10px] font-semibold bg-white/15 px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <TrendingUp size={9} /> {change}
          </span>
        )}
      </div>
      <p className="text-3xl font-black mt-1">{value}</p>
      <p className="text-white/70 text-xs font-medium mt-0.5 uppercase tracking-wide">{title}</p>
      {sub && <p className="text-white/50 text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

/* ── Module Quick-Access Card ──────────────────────────────────────────── */
function ModuleCard({
  title, description, href, icon, count, tag, tagColor,
}: {
  title: string; description: string; href: string; icon: React.ReactNode;
  count?: number; tag?: string; tagColor?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group h-full">
        <CardContent className="p-4 h-full flex flex-col">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-[var(--smartpro-orange)] group-hover:text-white transition-colors shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h3 className="font-semibold text-sm text-foreground">{title}</h3>
                {count !== undefined && count > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{count}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </div>
          {tag && (
            <div className="mt-3 flex items-center justify-between">
              <span className={`module-chip ${tagColor ?? "module-chip-gov"}`}>{tag}</span>
              <ArrowRight size={13} className="text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { t, i18n } = useTranslation(["dashboard", "nav", "common", "executive"]);
  const { user } = useAuth();
  const { activeCompanyId, activeCompany, loading: companyLoading, companies } = useActiveCompany();
  const [, navigate] = useLocation();
  const { data: stats, isLoading } = trpc.companies.myStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const [navPrefsEpoch, setNavPrefsEpoch] = useState(0);

  // Fetch custom role redirect settings for this company
  const { data: roleRedirectData } = trpc.companies.getRoleRedirectSettings.useQuery(
    { companyId: activeCompanyId ?? 0 },
    { enabled: activeCompanyId != null && !companyLoading }
  );

  // Smart redirect: send non-admin roles to their appropriate page (custom or system default)
  useEffect(() => {
    if (companyLoading) return;
    const memberRole = activeCompany?.role ?? null;
    if (!memberRole) return;
    // Platform admins and company_admin stay on the main dashboard
    if (seesPlatformOperatorNav(user)) return;
    if (memberRole === "company_admin" || (memberRole as string) === "owner") return;
    // Check for a custom redirect configured by the company admin; fall back to system default
    const customRoute = roleRedirectData?.settings?.[memberRole];
    const targetRoute = customRoute || getRoleDefaultRoute(memberRole);
    if (targetRoute && targetRoute !== "/dashboard" && targetRoute !== "/" && targetRoute !== "/control-tower") {
      navigate(targetRoute);
    }
  }, [activeCompany?.role, companyLoading, roleRedirectData]);

  useEffect(() => {
    const fn = () => setNavPrefsEpoch((n) => n + 1);
    window.addEventListener("smartpro-nav-prefs-changed", fn);
    return () => window.removeEventListener("smartpro-nav-prefs-changed", fn);
  }, []);

  const navOpts = useMemo(
    () => ({
      hasCompanyWorkspace: Boolean(myCompany?.company?.id),
      companyWorkspaceLoading: myCompanyLoading,
      hasCompanyMembership: companies.length > 0,
    }),
    [myCompany?.company?.id, myCompanyLoading, companies.length],
  );

  const showHref = useMemo(() => {
    const hidden = getHiddenNavHrefs();
    return (href: string) => clientNavItemVisible(href, user, hidden, navOpts);
  }, [user, navOpts, navPrefsEpoch]);

  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery(
    { daysAhead: 30, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: hrStats } = trpc.hr.getDashboardStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: aiInsights } = trpc.operations.getAiInsights.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: opsSnapshot } = trpc.operations.getDailySnapshot.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && !seesPlatformOperatorNav(user), staleTime: 60_000 },
  );
  const { data: omanisation } = trpc.compliance.getOmanisationStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && !seesPlatformOperatorNav(user) },
  );
  const { data: todaysTasks } = trpc.operations.getTodaysTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: auditFeed } = trpc.analytics.auditLogs.useQuery(
    { limit: 8, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: businessPulse } = trpc.operations.getOwnerBusinessPulse.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && !seesPlatformOperatorNav(user), staleTime: 60_000 },
  );
  const deriveRoleView = useCallback((): "ceo" | "admin" | "hr" | "finance" | "compliance" => {
    const role = activeCompany?.role;
    if (role === "finance_admin") return "finance";
    if (role === "hr_admin") return "hr";
    if (role === "reviewer" || role === "external_auditor") return "compliance";
    return "admin";
  }, [activeCompany?.role]);
  const [roleView, setRoleView] = useState<"ceo" | "admin" | "hr" | "finance" | "compliance">("admin");
  useEffect(() => {
    setRoleView(deriveRoleView());
  }, [deriveRoleView]);
  const { data: roleQueue, isLoading: roleQueueLoading } = trpc.operations.getRoleActionQueue.useQuery(
    { companyId: activeCompanyId ?? 0, roleView },
    { enabled: activeCompanyId != null && !seesPlatformOperatorNav(user), staleTime: 60_000 },
  );
  const now = new Date();
  const { data: wpsStatus } = trpc.compliance.getWpsStatus.useQuery(
    { companyId: activeCompanyId ?? undefined, month: now.getMonth() + 1, year: now.getFullYear() },
    { enabled: activeCompanyId != null && !seesPlatformOperatorNav(user), staleTime: 60_000 },
  );
  const utils = trpc.useUtils();
  const downloadOwnerResolutionPack = useCallback(
    async (format: "csv" | "json") => {
      if (activeCompanyId == null) return;
      const pack = await utils.operations.exportOwnerResolutionPack.fetch({ format, companyId: activeCompanyId });
      const blob = new Blob([pack.body], { type: pack.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pack.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [activeCompanyId, utils],
  );

  /** Hide duplicate renewal list when Resolution queue already surfaces renewal follow-through. */
  const accountControlCardVisible = useMemo(() => {
    if (!businessPulse?.accountPortfolio) return false;
    const ap = businessPulse.accountPortfolio;
    const hideRenewalDup = (businessPulse.ownerResolution?.renewalReadiness.length ?? 0) > 0;
    const showRenewal = ap.renewalRisk.length > 0 && !hideRenewalDup;
    return (
      showRenewal ||
      ap.stalledDelivery.length > 0 ||
      ap.combinedRisk.length > 0 ||
      ap.executiveFollowUp.length > 0
    );
  }, [businessPulse]);

  const pipelineCashDeliveryGrid = useMemo(() => {
    if (!businessPulse) return null;
    const bp = businessPulse;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={14} className="text-[var(--smartpro-orange)]" />
              Commercial
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Open pipeline (OMR)</span>
              <span className="font-semibold tabular-nums">
                {bp.commercial.pipelineValueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Leads / prospects</span>
              <span>
                {bp.commercial.contactsLeads} / {bp.commercial.contactsProspects}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Open deals</span>
              <span className="font-medium">{bp.commercial.dealsOpen}</span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Quotes draft / sent</span>
              <span>
                {bp.commercial.quotationsDraft} / {bp.commercial.quotationsSent}
              </span>
            </div>
            <Link href="/quotations?filter=accepted" className="flex justify-between gap-2 text-xs hover:opacity-80">
              <span className="text-muted-foreground">Accepted quotes → no contract</span>
              <span className={bp.commercial.quotationsAcceptedUnconverted > 0 ? "text-amber-700 font-semibold" : ""}>
                {bp.commercial.quotationsAcceptedUnconverted}
              </span>
            </Link>
            <Link href="/quotations?filter=accepted" className="flex justify-between gap-2 text-xs hover:opacity-80">
              <span className="text-muted-foreground">Won deals — accepted, still no contract</span>
              <span className={(bp.commercial.wonDealsAwaitingSignedAgreement ?? 0) > 0 ? "text-amber-700 font-semibold" : ""}>
                {bp.commercial.wonDealsAwaitingSignedAgreement ?? 0}
              </span>
            </Link>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Contracts awaiting signature</span>
              <span className={bp.commercial.contractsPendingSignature > 0 ? "text-amber-700 font-semibold" : ""}>
                {bp.commercial.contractsPendingSignature}
              </span>
            </div>
            <Link href="/crm" className="flex justify-between gap-2 text-xs hover:opacity-80">
              <span className="text-muted-foreground">Won deals → no linked quote</span>
              <span className={bp.commercial.closedWonDealsWithoutLinkedQuote > 0 ? "text-amber-700 font-semibold" : ""}>
                {bp.commercial.closedWonDealsWithoutLinkedQuote}
              </span>
            </Link>
            <Link href="/contracts" className="flex justify-between gap-2 text-xs hover:opacity-80">
              <span className="text-muted-foreground">Contracts ending (30d)</span>
              <span className={bp.commercial.contractsExpiringNext30Days > 0 ? "text-amber-700 font-semibold" : ""}>
                {bp.commercial.contractsExpiringNext30Days}
              </span>
            </Link>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CircleDollarSign size={14} className="text-emerald-600" />
              Collections & subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">PRO/officer overdue (OMR)</span>
              <span className={`font-semibold tabular-nums ${bp.finance.proBillingOverdueOmr > 0 ? "text-red-700" : ""}`}>
                {bp.finance.proBillingOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">PRO invoices pending</span>
              <span>{bp.finance.proBillingPendingCount}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Platform subscription overdue</span>
              <span className={`font-semibold tabular-nums ${bp.finance.subscriptionOverdueOmr > 0 ? "text-red-700" : ""}`}>
                {bp.finance.subscriptionOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">Subscription issued (unpaid)</span>
              <span>{bp.finance.subscriptionIssuedUnpaidCount}</span>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/60">
              Officer billing: use client portal or billing (operator). Subscription: company billing settings.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck size={14} className="text-blue-600" />
              Delivery load
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link href="/pro" className="flex justify-between gap-2 hover:opacity-80">
              <span className="text-muted-foreground">Open PRO requests</span>
              <span className="font-semibold">{bp.delivery.openProServices}</span>
            </Link>
            <Link href="/workforce/cases" className="flex justify-between gap-2 hover:opacity-80">
              <span className="text-muted-foreground">Government cases</span>
              <span className="font-semibold">{bp.delivery.openGovernmentCases}</span>
            </Link>
            <Link href="/marketplace" className="flex justify-between gap-2 hover:opacity-80">
              <span className="text-muted-foreground">Active marketplace bookings</span>
              <span className="font-semibold">{bp.delivery.activeBookings}</span>
            </Link>
            <Link href="/hr/tasks" className="flex justify-between gap-2 hover:opacity-80 text-xs">
              <span className="text-muted-foreground">Internal tasks overdue</span>
              <span className={`font-semibold ${bp.delivery.employeeTasksOverdue > 0 ? "text-amber-800" : ""}`}>
                {bp.delivery.employeeTasksOverdue}
              </span>
            </Link>
            <Link href="/hr/tasks" className="flex justify-between gap-2 hover:opacity-80 text-xs">
              <span className="text-muted-foreground">Internal tasks blocked</span>
              <span className={`font-semibold ${bp.delivery.employeeTasksBlocked > 0 ? "text-amber-800" : ""}`}>
                {bp.delivery.employeeTasksBlocked}
              </span>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }, [businessPulse]);

  const quickAccessModules = useMemo(() => {
    const items = [
      {
        key: "sanad",
        href: "/sanad",
        title: t("dashboard:modules.sanadOfficeManagement", "Sanad Office Management"),
        description: t("dashboard:modules.sanadOfficeDesc", "Government service centres — applications, staff, and performance tracking"),
        icon: <Building2 size={18} />,
        count: stats?.sanadApplications,
        tag: t("dashboard:tags.government", "Government"),
        tagColor: "module-chip-gov",
      },
      {
        key: "pro",
        href: "/pro",
        title: t("dashboard:modules.proVisaServices", "PRO & Visa Services"),
        description: t("dashboard:modules.proVisaDesc", "Work permits, residence visas, labour cards, PASI, and MHRSD filings"),
        icon: <Shield size={18} />,
        count: stats?.proServices,
        tag: t("dashboard:tags.compliance", "Compliance"),
        tagColor: "module-chip-legal",
      },
      {
        key: "hr",
        href: "/hr/employees",
        title: t("dashboard:modules.hrWorkforceHub", "HR & Workforce Hub"),
        description: t("dashboard:modules.hrWorkforceDesc", "Employees, leave management, payroll, WPS, and Omanisation tracking"),
        icon: <Briefcase size={18} />,
        count: stats?.pendingLeave,
        tag: t("dashboard:tags.humanResources", "Human Resources"),
        tagColor: "module-chip-hr",
      },
      {
        key: "contracts",
        href: "/contracts",
        title: t("dashboard:modules.smartContracts", "Smart Contracts"),
        description: t("dashboard:modules.smartContractsDesc", "Draft, negotiate, and digitally sign contracts with full audit trail"),
        icon: <FileText size={18} />,
        count: stats?.contracts,
        tag: t("dashboard:tags.legal", "Legal"),
        tagColor: "module-chip-legal",
      },
      {
        key: "marketplace",
        href: "/marketplace",
        title: t("dashboard:modules.serviceMarketplace", "Service Marketplace"),
        description: t("dashboard:modules.serviceMarketplaceDesc", "Connect with verified PRO service providers across Oman and GCC"),
        icon: <ShoppingBag size={18} />,
        tag: t("dashboard:tags.marketplace", "Marketplace"),
        tagColor: "module-chip-biz",
      },
      {
        key: "crm",
        href: "/crm",
        title: t("dashboard:modules.crmPipeline", "CRM & Pipeline"),
        description: t("dashboard:modules.crmPipelineDesc", "Manage clients, deals, and business development pipeline"),
        icon: <Users size={18} />,
        count: stats?.deals,
        tag: t("dashboard:tags.business", "Business"),
        tagColor: "module-chip-biz",
      },
      {
        key: "payroll",
        href: "/payroll",
        title: t("dashboard:modules.payrollEngine", "Payroll Engine"),
        description: t("dashboard:modules.payrollEngineDesc", "WPS-compliant payroll, PASI deductions, salary loans, and payslips"),
        icon: <Banknote size={18} />,
        tag: t("dashboard:tags.finance", "Finance"),
        tagColor: "module-chip-fin",
      },
      {
        key: "alerts",
        href: "/alerts",
        title: t("dashboard:modules.expiryAlerts", "Expiry Alerts"),
        description: t("dashboard:modules.expiryAlertsDesc", "Real-time alerts for visas, permits, contracts, and compliance deadlines"),
        icon: <Bell size={18} />,
        count: alertBadge?.count,
        tag: t("dashboard:tags.compliance", "Compliance"),
        tagColor: "module-chip-legal",
      },
    ];
    return items.filter((m) => showHref(m.href));
  }, [showHref, stats, alertBadge, t]);

  const platformToolLinks = useMemo(() => {
    const items = [
      { href: "/renewal-workflows", icon: <RefreshCw size={13} />, label: t("dashboard:renewalWorkflows", "Renewal Workflows") },
      { href: "/billing", icon: <Banknote size={13} />, label: t("dashboard:billingEngine", "Billing Engine") },
      { href: "/omani-officers", icon: <Users size={13} />, label: t("dashboard:omaniProOfficers", "Omani PRO Officers") },
      { href: "/workforce", icon: <BarChart3 size={13} />, label: t("dashboard:workforceDashboard", "Workforce Dashboard") },
      { href: "/reports", icon: <FileText size={13} />, label: t("common:pdfReports", "PDF Reports") },
      { href: "/audit-log", icon: <Shield size={13} />, label: t("common:auditLog", "Audit Log") },
    ];
    return items.filter((item) => showHref(item.href));
  }, [showHref, t]);

  const showPlatformOverview = seesPlatformOperatorNav(user);
  const queueTop10 = (roleQueue ?? []).slice(0, 10);
  const riskCounts = useMemo(() => {
    const list = roleQueue ?? [];
    const payrollBlocked = list.filter((i) => i.type === "payroll_blocker" && (i.status === "blocked" || i.status === "overdue")).length;
    const expiredPermits = list.filter((i) => i.type === "permit_expiry" && i.status === "overdue").length;
    const overdueGovCases = list.filter((i) => i.type === "government_case_overdue" && i.status === "overdue").length;
    return { payrollBlocked, expiredPermits, overdueGovCases };
  }, [roleQueue]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("dashboard:goodMorning", "Good morning") : hour < 17 ? t("dashboard:goodAfternoon", "Good afternoon") : t("dashboard:goodEvening", "Good evening");
  const dateStr = new Date().toLocaleDateString(i18n.language === "ar-OM" ? "ar-OM" : "en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="p-5 md:p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-foreground">
              {greeting}, {user?.name?.split(" ")[0] ?? "there"} 👋
            </h1>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 flex-wrap">
            {myCompany && (
              <span className="flex items-center gap-1">
                <Building2 size={12} /> {myCompany.company.name}
              </span>
            )}
            <span className="text-border">·</span>
            <span className="flex items-center gap-1"><MapPin size={12} /> Sultanate of Oman</span>
            <span className="text-border">·</span>
            <span className="flex items-center gap-1"><Calendar size={12} /> {dateStr}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {showHref("/alerts") && alertBadge && alertBadge.critical > 0 && (
            <Link href="/alerts">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-red-100 transition-colors">
                <AlertTriangle size={15} className="text-red-600" />
                <span className="text-xs text-red-700 font-semibold">
                  {alertBadge.critical} Critical Alert{alertBadge.critical > 1 ? "s" : ""}
                </span>
                <ChevronRight size={12} className="text-red-500" />
              </div>
            </Link>
          )}
          {showHref("/pro") && expiringDocs && expiringDocs.length > 0 && (
            <Link href="/pro">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-amber-100 transition-colors">
                <Clock size={15} className="text-amber-600" />
                <span className="text-xs text-amber-700 font-semibold">
                  {expiringDocs.length} Expiring Soon
                </span>
                <ChevronRight size={12} className="text-amber-500" />
              </div>
            </Link>
          )}
        </div>
      </div>

      {!showPlatformOverview && activeCompanyId && (
        <>
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target size={14} className="text-[var(--smartpro-orange)]" />
                  Role Focus
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">View as</span>
                  <Select value={roleView} onValueChange={(v: "ceo" | "admin" | "hr" | "finance" | "compliance") => setRoleView(v)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ceo">CEO</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This view prioritizes urgent actions for the selected role without changing permissions.
              </p>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Card className={`border ${riskCounts.payrollBlocked > 0 ? "border-red-200 bg-red-50/40" : "border-border/70"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Payroll blocked</p>
                <p className="text-2xl font-black mt-1">{riskCounts.payrollBlocked}</p>
                <div className="mt-2 text-xs">
                  <Link href="/payroll" className="text-[var(--smartpro-orange)] hover:underline">Open payroll</Link>
                </div>
              </CardContent>
            </Card>
            <Card className={`border ${riskCounts.expiredPermits > 0 ? "border-red-200 bg-red-50/40" : "border-border/70"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Expired permits</p>
                <p className="text-2xl font-black mt-1">{riskCounts.expiredPermits}</p>
                <div className="mt-2 text-xs">
                  <Link href="/workforce/permits?status=expired" className="text-[var(--smartpro-orange)] hover:underline">Open permits</Link>
                </div>
              </CardContent>
            </Card>
            <Card className={`border ${riskCounts.overdueGovCases > 0 ? "border-red-200 bg-red-50/40" : "border-border/70"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Overdue gov. cases</p>
                <p className="text-2xl font-black mt-1">{riskCounts.overdueGovCases}</p>
                <div className="mt-2 text-xs">
                  <Link href="/workforce/cases?status=overdue" className="text-[var(--smartpro-orange)] hover:underline">Open cases</Link>
                </div>
              </CardContent>
            </Card>
            <Card className={`border ${(wpsStatus?.status && wpsStatus.status !== "paid" && wpsStatus.status !== "not_generated") ? "border-amber-200 bg-amber-50/40" : "border-border/70"}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">WPS status</p>
                <p className="text-lg font-black mt-1 capitalize">{String(wpsStatus?.status ?? "not_generated").replace(/_/g, " ")}</p>
                <div className="mt-2 text-xs">
                  <Link href="/payroll" className="text-[var(--smartpro-orange)] hover:underline">Open WPS run</Link>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList size={14} className="text-blue-600" />
                Top Action Queue
                {queueTop10.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">{queueTop10.length}</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Most urgent operational actions, normalized across payroll, workforce, HR, and compliance.
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {roleQueueLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : queueTop10.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">No urgent work detected.</div>
              ) : queueTop10.map((item) => (
                <Link href={item.href} key={item.id}>
                  <div className="rounded-lg border border-border/70 px-3 py-2 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{item.title}</p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          item.severity === "critical"
                            ? "border-red-200 text-red-700"
                            : item.severity === "high"
                              ? "border-amber-200 text-amber-700"
                              : item.severity === "medium"
                                ? "border-blue-200 text-blue-700"
                                : "border-slate-200 text-slate-700"
                        }`}
                      >
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.reason}</p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{item.ownerUserId ? `Owner #${item.ownerUserId}` : "Owner: unassigned"}</span>
                      <span>{item.dueAt ? `Due ${fmtDate(item.dueAt)}` : "No due date"}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <OwnerSetupChecklist />
          {opsSnapshot && (opsSnapshot.attentionQueue?.length ?? 0) > 0 && (
            <Card className="border-orange-200 bg-orange-50/90 dark:bg-orange-950/25 dark:border-orange-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Needs your attention
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {opsSnapshot.attentionQueue.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground font-normal">
                  Action items for this workspace — open a row to resolve or delegate.
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {opsSnapshot.attentionQueue.slice(0, 8).map((item) => (
                  <Link key={item.key} href={item.href}>
                    <div className="flex items-start gap-2 rounded-lg border border-orange-100 bg-background/80 px-3 py-2 hover:bg-background transition-colors">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          item.severity === "critical"
                            ? "bg-red-500"
                            : item.severity === "high"
                              ? "bg-amber-500"
                              : "bg-blue-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{item.detail}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
                {showHref("/operations") && (
                  <Button asChild variant="outline" size="sm" className="w-full text-xs mt-1">
                    <Link href="/operations">Open full operations detail</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Admin Platform Stats ── */}
      {showPlatformOverview && platformStats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity size={13} /> {t("dashboard:platformOverview", "Platform Overview")}
            </h2>
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                {t("dashboard:fullAnalytics", "Full Analytics")} <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title={t("dashboard:companies", "Companies")} value={platformStats.companies} icon={<Building2 size={20} />} gradient="stat-gradient-1" sub={t("dashboard:registeredEntities", "Registered entities")} />
            <StatCard title={t("dashboard:totalUsers", "Total Users")} value={platformStats.users} icon={<Users size={20} />} gradient="stat-gradient-2" change="+12% MoM" />
            <StatCard title={t("dashboard:contracts", "Contracts")} value={platformStats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub={t("dashboard:activeAgreements", "Active agreements")} />
            <StatCard title={t("dashboard:proServices", "PRO Services")} value={platformStats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-4" sub={t("dashboard:managedDocuments", "Managed documents")} />
          </div>
        </div>
      )}

      {/* ── Company KPI Stats ── */}
      {!showPlatformOverview && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 size={13} /> {t("dashboard:commandCenter", "Command center — your business at a glance")}
            </h2>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {showHref("/operations") && (
                <Link href="/operations">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                    {t("dashboard:operationsDetail", "Operations detail")} <ArrowUpRight size={11} />
                  </Button>
                </Link>
              )}
              <Link href="/analytics">
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                  Analytics <ArrowUpRight size={11} />
                </Button>
              </Link>
            </div>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title={t("dashboard:employees", "Employees")} value={stats.employees} icon={<Users size={20} />} gradient="stat-gradient-1" sub={t("dashboard:activeWorkforce", "Active workforce")} />
              <StatCard title={t("dashboard:proServices", "PRO Services")} value={stats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-2" sub={t("dashboard:managedDocuments", "Managed documents")} />
              <StatCard title={t("dashboard:contracts", "Contracts")} value={stats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub={t("dashboard:activeAgreements", "Active agreements")} />
              <StatCard title={t("dashboard:crmContacts", "CRM Contacts")} value={stats.contacts} icon={<Users size={20} />} gradient="stat-gradient-4" sub={t("dashboard:clientsLeads", "Clients & leads")} />
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold mb-1">{t("noCompanyLinked", { ns: "executive" })}</h3>
                <p className="text-sm text-muted-foreground mb-4">{t("noCompanyLinkedDesc", { ns: "executive" })}</p>
                <Button asChild size="sm"><Link href="/onboarding">{t("setUpCompany", { ns: "executive" })}</Link></Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Cash received (paid) — server-authoritative revenue snapshot ── */}
      {!showPlatformOverview && activeCompanyId && businessPulse?.revenue && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <CircleDollarSign size={13} className="text-emerald-600" /> {t("cashReceived", { ns: "executive" })}
            </h2>
            {showHref("/finance/overview") && (
              <Link href="/finance/overview">
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                  {t("financeOverview", { ns: "executive" })} <ArrowUpRight size={11} />
                </Button>
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-border/80">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("today", { ns: "executive" })}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-2xl font-black tabular-nums text-foreground">
                  OMR{" "}
                  {businessPulse.revenue.combinedPaid.todayOmr.toLocaleString("en-OM", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  PRO {businessPulse.revenue.officerProPaid.todayOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} · Sub{" "}
                  {businessPulse.revenue.platformSubscriptionPaid.todayOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("thisWeek", { ns: "executive" })}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-2xl font-black tabular-nums text-foreground">
                  OMR{" "}
                  {businessPulse.revenue.combinedPaid.weekOmr.toLocaleString("en-OM", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  PRO {businessPulse.revenue.officerProPaid.weekOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} · Sub{" "}
                  {businessPulse.revenue.platformSubscriptionPaid.weekOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/80">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{t("monthToDate", { ns: "executive" })}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-2xl font-black tabular-nums text-foreground">
                  OMR{" "}
                  {businessPulse.revenue.combinedPaid.monthToDateOmr.toLocaleString("en-OM", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  })}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  PRO {businessPulse.revenue.officerProPaid.monthToDateOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} · Sub{" "}
                  {businessPulse.revenue.platformSubscriptionPaid.monthToDateOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </CardContent>
            </Card>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug max-w-4xl">{businessPulse.revenue.basis}</p>
        </div>
      )}

      {!showPlatformOverview && activeCompanyId && businessPulse?.managementCadence && (
        <ManagementCadencePanel bundle={businessPulse.managementCadence} />
      )}

      {!showPlatformOverview && activeCompanyId && businessPulse?.controlTower && (
        <ExecutiveControlTower
          tower={businessPulse.controlTower}
          showHref={showHref}
          execution={businessPulse.execution}
          companyId={activeCompanyId!}
          memberRole={activeCompany?.role ?? null}
          roleExecution={businessPulse.roleExecution}
        />
      )}

      {/* ── Commercial → contract → cash → delivery (one glance; collapsed when Owner workspace is shown) ── */}
      {!showPlatformOverview && activeCompanyId && businessPulse && (
        <div className="space-y-3">
          {businessPulse.controlTower ? (
            <Collapsible defaultOpen={false} className="group rounded-lg border border-dashed border-border/60 bg-muted/10">
              <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                    <Target size={13} /> Pipeline, cash & delivery
                  </h2>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                    Optional — open for pipeline, collections snapshot, and delivery load when you need the raw numbers.
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 px-3 pb-3 pt-0">
                <div className="flex flex-wrap gap-1 justify-end border-t border-border/40 pt-3">
                  {showHref("/crm") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/crm">CRM pipeline</Link>
                    </Button>
                  )}
                  {showHref("/quotations") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/quotations">Quotations</Link>
                    </Button>
                  )}
                  {showHref("/contracts") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/contracts">Contracts</Link>
                    </Button>
                  )}
                  {showHref("/finance/overview") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/finance/overview">Finance</Link>
                    </Button>
                  )}
                  {showHref("/subscriptions") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/subscriptions">Subscriptions</Link>
                    </Button>
                  )}
                </div>
                {pipelineCashDeliveryGrid}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <Target size={13} /> Pipeline, cash & delivery
                </h2>
                <div className="flex flex-wrap gap-1 justify-end">
                  {showHref("/crm") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/crm">CRM pipeline</Link>
                    </Button>
                  )}
                  {showHref("/quotations") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/quotations">Quotations</Link>
                    </Button>
                  )}
                  {showHref("/contracts") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/contracts">Contracts</Link>
                    </Button>
                  )}
                  {showHref("/finance/overview") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/finance/overview">Finance</Link>
                    </Button>
                  )}
                  {showHref("/subscriptions") && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/subscriptions">Subscriptions</Link>
                    </Button>
                  )}
                </div>
              </div>
              {pipelineCashDeliveryGrid}
            </>
          )}

          {businessPulse.ownerResolution &&
            (businessPulse.ownerResolution.rankedAccountsForReview.length > 0 ||
              businessPulse.ownerResolution.renewalReadiness.length > 0 ||
              businessPulse.ownerResolution.collectionsFollowUp.length > 0) && (
            <Card className="border-primary/25 bg-primary/[0.03]">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <CardTitle
                      className="text-sm flex items-center gap-2"
                      title={businessPulse.ownerResolution.basis}
                    >
                      <ClipboardList size={14} className="text-primary" />
                      Resolution queue
                    </CardTitle>
                    <p
                      className="text-[10px] text-muted-foreground font-normal mt-1"
                      title={`Export v${businessPulse.ownerResolution.exportMeta.schemaVersion} · ${businessPulse.ownerResolution.exportRows.length} row(s)`}
                    >
                      Updated {fmtDateTimeShort(new Date(businessPulse.ownerResolution.exportMeta.generatedAt))} · CSV/JSON
                      packs available
                    </p>
                    {businessPulse.ownerResolution.reviewSummary && (
                      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                        {compactResolutionSummary(businessPulse.ownerResolution.reviewSummary) || "No roll-up alerts."}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => downloadOwnerResolutionPack("csv")}
                      title="Download CSV (exportRows + review fields)"
                    >
                      <Download size={12} className="mr-1" />
                      CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => downloadOwnerResolutionPack("json")}
                      title="Download JSON pack for leadership / integrations"
                    >
                      <Download size={12} className="mr-1" />
                      JSON
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/crm">CRM</Link>
                    </Button>
                    {showHref("/workspace") && (
                      <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                        <Link href="/workspace">Team workspace</Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/contracts">Contracts</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/client-portal?tab=invoices">Collections</Link>
                    </Button>
                    <Button variant="default" size="sm" className="text-xs h-7" asChild>
                      <Link href="/hr/tasks">Tasks</Link>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {businessPulse.ownerResolution.rankedAccountsForReview.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Leadership review (priority)
                    </p>
                    <ul className="space-y-2">
                      {businessPulse.ownerResolution.rankedAccountsForReview.slice(0, 6).map((row) => (
                        <li
                          key={`rank-${row.contactId}`}
                          className="rounded-md border border-border/70 p-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <Link href={row.primaryHref} className="font-medium hover:underline">
                              {row.displayName}
                            </Link>
                            <span className="text-[10px] text-muted-foreground ml-1">
                              · score {row.priorityScore} — {row.rankReason}
                            </span>
                            {row.workflow && (
                              <p className="text-[9px] text-muted-foreground mt-0.5">
                                {row.workflow.accountableOwnerLabel ? (
                                  <span>Accountable: {row.workflow.accountableOwnerLabel}</span>
                                ) : (
                                  <span className="text-amber-800 dark:text-amber-200">No CRM owner</span>
                                )}
                                {row.workflow.hasOpenEmployeeTask ? (
                                  <span className="ml-1">· Tagged task open</span>
                                ) : (
                                  <span className="ml-1">· No tagged HR task</span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="outline" className="text-[9px]">
                              {row.tier.replace("_", " ")}
                            </Badge>
                            {row.workflow?.review && (
                              <Badge
                                variant="outline"
                                className="text-[8px] max-w-[140px] truncate capitalize"
                                title={row.workflow.review.reviewBasis}
                              >
                                {row.workflow.review.workflowScope === "crm_contact" ? "CRM" : "Billing"} ·{" "}
                                {row.workflow.review.reviewBucket.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {row.workflow?.accountabilityGap !== "none" && (
                              <Badge variant="outline" className="text-[8px] border-amber-300 text-amber-900">
                                Gap: {row.workflow.accountabilityGap.replace("_", " ")}
                              </Badge>
                            )}
                            {row.workflow?.isTaskDueOverdue && (
                              <Badge variant="outline" className="text-[8px] border-red-200 text-red-800">
                                Task overdue
                              </Badge>
                            )}
                            <Button variant="default" size="sm" className="h-7 text-[10px]" asChild>
                              <Link href={row.nextAction.href} title={row.nextAction.basis}>
                                {row.nextAction.label}
                              </Link>
                            </Button>
                            {row.contractHref && (
                              <Link href={row.contractHref} className="text-[10px] text-[var(--smartpro-orange)] hover:underline">
                                Contract
                              </Link>
                            )}
                            {row.workflow && (
                              <>
                                <Link href={row.workflow.tasksHref} className="text-[10px] text-muted-foreground hover:underline">
                                  Tasks
                                </Link>
                                <Button variant="secondary" size="sm" className="h-7 text-[10px] px-2" asChild>
                                  <Link href={row.workflow.followUpCreateHref} title="Open Task Manager with prefilled tagged task">
                                    Create task
                                  </Link>
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  {businessPulse.ownerResolution.renewalReadiness.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Renewal readiness</p>
                      <ul className="space-y-1.5">
                        {businessPulse.ownerResolution.renewalReadiness.slice(0, 4).map((r) => (
                          <li key={`rr-${r.contactId}`} className="rounded-md border border-border/60 p-2 space-y-1">
                            <div className="flex justify-between gap-2 flex-wrap">
                              <Link href={r.primaryHref} className="font-medium hover:underline">
                                {r.displayName}
                              </Link>
                              {r.daysUntilEnd != null && (
                                <span className="text-[10px] text-muted-foreground">{r.daysUntilEnd}d to end</span>
                              )}
                            </div>
                            {r.postureSummary && (
                              <p className="text-[9px] text-muted-foreground">{r.postureSummary}</p>
                            )}
                            {r.workflow?.review && (
                              <Badge variant="outline" className="text-[8px] w-fit font-normal" title={r.workflow.review.reviewBasis}>
                                CRM · {r.workflow.review.reviewBucket.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {r.workflow && (
                              <div className="flex flex-wrap gap-1 items-center text-[9px]">
                                {r.workflow.renewalInterventionDueAt && (
                                  <span className="text-muted-foreground">
                                    Intervention by {r.workflow.renewalInterventionDueAt}
                                  </span>
                                )}
                                {r.workflow.accountabilityGap !== "none" && (
                                  <Badge variant="outline" className="text-[8px] h-5 border-amber-300 text-amber-900">
                                    {r.workflow.accountabilityGap.replace("_", " ")}
                                  </Badge>
                                )}
                                {r.workflow.hasOpenEmployeeTask ? (
                                  <span className="text-emerald-800 dark:text-emerald-200">Tagged task</span>
                                ) : (
                                  <span className="text-muted-foreground">No tagged task</span>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-[10px] w-full sm:w-auto" asChild>
                                <Link href={r.nextAction.href} title={r.nextAction.basis}>
                                  {r.nextAction.label}
                                </Link>
                              </Button>
                              {r.workflow && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" asChild>
                                    <Link href={r.workflow.tasksHref}>HR tasks</Link>
                                  </Button>
                                  <Button variant="secondary" size="sm" className="h-7 text-[10px] px-2" asChild>
                                    <Link href={r.workflow.followUpCreateHref} title="Prefill tagged HR task">
                                      Create task
                                    </Link>
                                  </Button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {businessPulse.ownerResolution.collectionsFollowUp.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Overdue officer billing (workspace)
                      </p>
                      <p className="text-[9px] text-muted-foreground">{businessPulse.ownerResolution.collectionsWorkspaceNote}</p>
                      <ul className="space-y-1.5">
                        {businessPulse.ownerResolution.collectionsFollowUp.map((c) => (
                          <li key={c.id} className="rounded-md border border-red-200/60 bg-red-50/30 dark:bg-red-950/20 p-2 flex flex-wrap justify-between gap-2">
                            <div>
                              <span className="font-mono text-[10px]">{c.invoiceNumber}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">
                                {c.billingMonth}/{c.billingYear}
                              </span>
                              {c.workflow && (
                                <span className="block text-[9px] text-muted-foreground mt-0.5 space-y-0.5">
                                  <span className="text-[8px] block">
                                    Workspace billing · {c.workflow.review.reviewBucket.replace(/_/g, " ")}
                                  </span>
                                  {c.workflow.hasOpenEmployeeTask ? "Tagged collections task" : "No tagged task — "}
                                  {!c.workflow.hasOpenEmployeeTask && (
                                    <span className="font-mono text-[8px] break-all">{c.workflow.taskTagConvention}</span>
                                  )}
                                </span>
                              )}
                            </div>
                            <span className="font-semibold text-red-800 tabular-nums">
                              OMR {c.amountOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </span>
                            <div className="w-full flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                                <Link href={c.nextAction.href}>{c.nextAction.label}</Link>
                              </Button>
                              {c.workflow && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" asChild>
                                    <Link href={c.workflow.tasksHref}>HR tasks</Link>
                                  </Button>
                                  <Button variant="secondary" size="sm" className="h-7 text-[10px] px-2" asChild>
                                    <Link href={c.workflow.followUpCreateHref} title="Prefill tagged collections task">
                                      Create task
                                    </Link>
                                  </Button>
                                </>
                              )}
                              {c.overlapNote && (
                                <span className="text-[9px] text-amber-800 self-center">{c.overlapNote}</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {(businessPulse.postSale.serviceContractsStalledNoDeliveryCount > 0 ||
            businessPulse.finance.proBillingOverdueCount > 0 ||
            businessPulse.commercial.contractsExpiringNext30Days > 0 ||
            businessPulse.postSale.combinedExecutionAndCollectionRisk) && (
            <Card className="border-amber-200/70 bg-amber-50/25 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-700" />
                  Post-sale risk
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-3 text-xs">
                  <Link
                    href={businessPulse.postSale.deepLinks.stalledContracts}
                    className={`rounded-md border px-2 py-1.5 hover:bg-muted/50 ${businessPulse.postSale.serviceContractsStalledNoDeliveryCount > 0 ? "border-amber-300 bg-amber-50/80 dark:bg-amber-950/40" : "border-border/60"}`}
                  >
                    <span className="text-muted-foreground block">Won → no delivery touch</span>
                    <span className={`font-semibold tabular-nums ${businessPulse.postSale.serviceContractsStalledNoDeliveryCount > 0 ? "text-amber-900" : ""}`}>
                      {businessPulse.postSale.serviceContractsStalledNoDeliveryCount}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">derived</span>
                  </Link>
                  <Link
                    href="/client-portal?tab=invoices"
                    className={`rounded-md border px-2 py-1.5 hover:bg-muted/50 ${businessPulse.finance.proBillingOverdueCount > 0 ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : "border-border/60"}`}
                  >
                    <span className="text-muted-foreground block">Billed (PRO) — overdue</span>
                    <span className={`font-semibold tabular-nums ${businessPulse.finance.proBillingOverdueCount > 0 ? "text-red-800" : ""}`}>
                      {businessPulse.finance.proBillingOverdueCount} · OMR{" "}
                      {businessPulse.finance.proBillingOverdueOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </span>
                  </Link>
                  <Link
                    href="/contracts"
                    className={`rounded-md border px-2 py-1.5 hover:bg-muted/50 ${businessPulse.commercial.contractsExpiringNext30Days > 0 ? "border-amber-300" : "border-border/60"}`}
                  >
                    <span className="text-muted-foreground block">Contracts expiring (30d)</span>
                    <span className="font-semibold tabular-nums">{businessPulse.commercial.contractsExpiringNext30Days}</span>
                  </Link>
                  <Link
                    href={businessPulse.postSale.deepLinks.proJobs}
                    className="rounded-md border border-border/60 px-2 py-1.5 hover:bg-muted/50"
                  >
                    <span className="text-muted-foreground block">Completed PRO + fees (90d)</span>
                    <span className="font-semibold tabular-nums">{businessPulse.postSale.completedProWithFeesLast90dCount}</span>
                    <span className="text-[10px] text-muted-foreground block">billing hint</span>
                  </Link>
                </div>
                {businessPulse.postSale.combinedExecutionAndCollectionRisk && (
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Stalled delivery and overdue PRO billing — combined revenue risk.
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground leading-snug border-t border-border/60 pt-2">
                  <span className="font-medium">Stalled delivery:</span> {businessPulse.postSale.stalledDeliveryBasis}{" "}
                  <span className="font-medium">Billing follow-up:</span> {businessPulse.postSale.completedWorkBillingCaveat}
                </p>
              </CardContent>
            </Card>
          )}

          {accountControlCardVisible && businessPulse.accountPortfolio && (
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle
                    className="text-sm flex items-center gap-2"
                    title={businessPulse.accountPortfolio.basis}
                  >
                    <Users size={14} className="text-[var(--smartpro-orange)]" />
                    Account control
                  </CardTitle>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/crm">CRM</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/contracts">Contracts</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/quotations?filter=accepted">Accepted quotes</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/pro">PRO</Link>
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-normal pt-1">
                  {businessPulse.accountPortfolio.tenantCollectionsScopeNote} Rule-based tiers; hover the section title for the full derivation basis.
                  {businessPulse.ownerResolution && businessPulse.ownerResolution.renewalReadiness.length > 0 && (
                    <span className="block mt-1">
                      Renewal follow-through is summarized in <span className="font-medium">Resolution queue</span> above — this block focuses on delivery and combined risk signals.
                    </span>
                  )}
                </p>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4 text-xs">
                {businessPulse.accountPortfolio.renewalRisk.length > 0 &&
                  !(businessPulse.ownerResolution && businessPulse.ownerResolution.renewalReadiness.length > 0) && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Renewal risk</p>
                    <ul className="space-y-2">
                      {businessPulse.accountPortfolio.renewalRisk.map((row) => (
                        <li key={row.contactId} className="rounded-md border border-border/60 p-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Link href={row.primaryHref} className="font-medium hover:underline">
                              {row.displayName}
                            </Link>
                            {row.companyLabel && (
                              <span className="text-muted-foreground text-[10px]">· {row.companyLabel}</span>
                            )}
                            <Badge
                              variant="outline"
                              className={
                                row.tier === "urgent"
                                  ? "text-[9px] border-red-200 text-red-800"
                                  : row.tier === "at_risk"
                                    ? "text-[9px] border-orange-200 text-orange-800"
                                    : "text-[9px]"
                              }
                            >
                              {row.tier.replace("_", " ")}
                            </Badge>
                          </div>
                          {row.nearestExpiryEndDate && (
                            <p className="text-[10px] text-muted-foreground">Ends {row.nearestExpiryEndDate}</p>
                          )}
                          {row.renewalWeakFollowUp && (
                            <p className="text-[10px] text-amber-800">Weak follow-up — no touch 21+ days</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {row.sampleContractHref && (
                              <Link href={row.sampleContractHref} className="text-[10px] text-[var(--smartpro-orange)] font-medium hover:underline">
                                Open contract
                              </Link>
                            )}
                            <Link href={row.primaryHref} className="text-[10px] text-muted-foreground hover:underline">
                              Account →
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {businessPulse.accountPortfolio.stalledDelivery.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Delivery stall (linked)</p>
                    <ul className="space-y-2">
                      {businessPulse.accountPortfolio.stalledDelivery.map((row) => (
                        <li key={`sd-${row.contactId}`} className="rounded-md border border-border/60 p-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={row.primaryHref} className="font-medium hover:underline">
                              {row.displayName}
                            </Link>
                            <span className="text-[10px] text-muted-foreground">
                              {row.signals.stalledServiceContractsCount} stalled (derived)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {row.sampleContractHref && (
                              <Link href={row.sampleContractHref} className="text-[10px] text-[var(--smartpro-orange)] font-medium hover:underline">
                                Open contract
                              </Link>
                            )}
                            <Link href="/pro" className="text-[10px] text-muted-foreground hover:underline">
                              PRO →
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {businessPulse.accountPortfolio.combinedRisk.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Combined risk</p>
                    <ul className="space-y-2">
                      {businessPulse.accountPortfolio.combinedRisk.map((row) => (
                        <li key={`cr-${row.contactId}`} className="rounded-md border border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 p-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={row.primaryHref} className="font-medium hover:underline">
                              {row.displayName}
                            </Link>
                            <Badge variant="outline" className="text-[9px] border-red-200 text-red-900">
                              {row.tier.replace("_", " ")}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground line-clamp-2">{row.reasons[0] ?? "Renewal, delivery, or collections pressure."}</p>
                          <div className="flex flex-wrap gap-2">
                            {row.sampleContractHref && (
                              <Link href={row.sampleContractHref} className="text-[10px] text-[var(--smartpro-orange)] font-medium hover:underline">
                                Contract
                              </Link>
                            )}
                            <Link href="/client-portal?tab=invoices" className="text-[10px] text-muted-foreground hover:underline">
                              Collections →
                            </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {businessPulse.accountPortfolio.executiveFollowUp.length > 0 && (
                  <div className="space-y-1.5 md:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Executive follow-up</p>
                    <ul className="grid sm:grid-cols-2 gap-2">
                      {businessPulse.accountPortfolio.executiveFollowUp.map((row) => (
                        <li key={`ex-${row.contactId}`} className="rounded-md border border-border/60 p-2">
                          <Link href={row.primaryHref} className="font-medium hover:underline">
                            {row.displayName}
                          </Link>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {row.tier === "urgent" ? "Urgent tier" : "At risk + stale activity (45d+)"}
                          </p>
                          <Link href={row.primaryHref} className="text-[10px] text-[var(--smartpro-orange)] mt-1 inline-block hover:underline">
                            Open account →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {businessPulse.revenueRealization &&
            (businessPulse.revenueRealization.billingFollowThroughPressure ||
              businessPulse.revenueRealization.recentCompletedProForBillingReview.length > 0 ||
              businessPulse.revenueRealization.marketplaceCompletedWithAmountLast90d.count > 0) && (
            <Card className="border-emerald-200/60 bg-emerald-50/20 dark:bg-emerald-950/15">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2" title={businessPulse.revenueRealization.basis}>
                    <Banknote size={14} className="text-emerald-700" />
                    Revenue protection
                  </CardTitle>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/pro">PRO</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/client-portal?tab=invoices">Collections</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
                      <Link href="/marketplace">Marketplace</Link>
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-normal pt-1">{businessPulse.revenueRealization.caveat}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {businessPulse.revenueRealization.billingFollowThroughPressure && (
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    Billing follow-through pressure: fee-bearing PRO completions in the lookback while officer billing cycles are pending or overdue (workspace-level, not per job).
                  </p>
                )}
                <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  <span>
                    PRO + fees (90d):{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {businessPulse.revenueRealization.completedProWithFeesLast90dCount}
                    </span>
                  </span>
                  <span>
                    Cycles pending:{" "}
                    <span className="font-semibold text-foreground tabular-nums">{businessPulse.revenueRealization.proBillingPendingCount}</span>
                  </span>
                  <span>
                    Overdue:{" "}
                    <span className="font-semibold text-red-800 tabular-nums">
                      {businessPulse.revenueRealization.proBillingOverdueCount} · OMR{" "}
                      {businessPulse.revenueRealization.proBillingOverdueOmr.toLocaleString("en-OM", {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      })}
                    </span>
                  </span>
                </div>
                {businessPulse.revenueRealization.recentCompletedProForBillingReview.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent completed PRO (billing review)</p>
                    <ul className="space-y-1">
                      {businessPulse.revenueRealization.recentCompletedProForBillingReview.map((s) => (
                        <li key={s.id} className="flex flex-wrap justify-between gap-2 text-[11px]">
                          <Link href={s.proListHref} className="font-medium text-foreground hover:underline">
                            {s.serviceNumber}
                          </Link>
                          <span className="text-muted-foreground tabular-nums">
                            OMR {s.feesOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {businessPulse.revenueRealization.marketplaceCompletedWithAmountLast90d.count > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Marketplace: {businessPulse.revenueRealization.marketplaceCompletedWithAmountLast90d.count} completed with amount (90d), OMR{" "}
                    {businessPulse.revenueRealization.marketplaceCompletedWithAmountLast90d.totalAmountOmr.toLocaleString("en-OM", {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}{" "}
                    — no invoice linkage in schema.
                  </p>
                )}
                {businessPulse.revenueRealization.nextRecommendedActions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
                    {businessPulse.revenueRealization.nextRecommendedActions.slice(0, 4).map((a) => (
                      <Button key={a.label + a.href} variant="outline" size="sm" className="h-7 text-[10px]" asChild>
                        <Link href={a.href} title={a.basis}>
                          {a.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── HR Live Stats ── */}
      {!showPlatformOverview && activeCompanyId && hrStats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity size={13} /> Today's HR Snapshot
            </h2>
            <Link href="/hr/today-board">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Today's Board <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link href="/hr/attendance">
              <div className="bg-emerald-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <CheckCircle2 size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Present Today</span>
                </div>
                <p className="text-3xl font-black">{hrStats.todayPresent}</p>
                <p className="text-white/60 text-[10px] mt-1">of {hrStats.activeEmployees} active</p>
              </div>
            </Link>
            <Link href="/hr/leave">
              <div className="bg-amber-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Calendar size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Pending Leave</span>
                </div>
                <p className="text-3xl font-black">{hrStats.pendingLeave}</p>
                <p className="text-white/60 text-[10px] mt-1">Awaiting approval</p>
              </div>
            </Link>
            <Link href="/hr/kpi">
              <div className="bg-blue-500 rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <TrendingUp size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">KPI Avg</span>
                </div>
                <p className="text-3xl font-black">{hrStats.kpiAvgPct > 0 ? `${hrStats.kpiAvgPct}%` : "—"}</p>
                <p className="text-white/60 text-[10px] mt-1">{hrStats.kpiTargetsCount} targets this month</p>
              </div>
            </Link>
            <Link href="/payroll">
              <div className={`${
                hrStats.payrollStatus === "paid" ? "bg-teal-500" :
                hrStats.payrollStatus === "approved" ? "bg-indigo-500" :
                hrStats.payrollStatus === "draft" ? "bg-slate-500" : "bg-slate-400"
              } rounded-2xl p-4 text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                    <Banknote size={16} />
                  </div>
                  <span className="text-white/70 text-xs uppercase tracking-wide font-medium">Payroll</span>
                </div>
                <p className="text-3xl font-black capitalize">{hrStats.payrollStatus ?? "—"}</p>
                <p className="text-white/60 text-[10px] mt-1">{hrStats.payrollMonth ?? "No run this month"}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Promoter Contract KPIs (compact) ── */}
      {!showPlatformOverview && activeCompanyId && showHref("/hr/contracts") && (
        <div className="rounded-xl border bg-card/80 shadow-sm p-4">
          <ContractKpiWidget variant="compact" />
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Module Quick Access — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Zap size={13} /> {t("dashboard:quickAccess", "Quick Access")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quickAccessModules.map((m) => (
              <ModuleCard
                key={m.key}
                title={m.title}
                description={m.description}
                href={m.href}
                icon={m.icon}
                count={m.count}
                tag={m.tag}
                tagColor={m.tagColor}
              />
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Workforce Health Widget */}
          {showHref("/hr/employees") && <WorkforceHealthWidget />}
          {/* Omanisation — server metrics only (no placeholder scores) */}
          {omanisation && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award size={15} className="text-[var(--smartpro-orange)]" />
                  {t("dashboard:omanisationCompliance", "Omanisation & compliance")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{t("dashboard:currentRateVsTarget", "Current rate vs target")}</span>
                    <span className="font-semibold">
                      {omanisation.pct}% / {omanisation.targetPct}%
                    </span>
                  </div>
                  <Progress value={Math.min(100, omanisation.pct)} className="h-2" />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Gap to target: {omanisation.gap} pts · {omanisation.omani} Omani of {omanisation.total} active employees
                  </p>
                </div>
                {showHref("/compliance") && (
                  <Button asChild variant="outline" size="sm" className="w-full text-xs gap-1">
                    <Link href="/compliance">
                      Open compliance dashboard <ArrowRight size={11} />
                    </Link>
                  </Button>
                )}
                {showHref("/reports") && (
                  <Button asChild variant="ghost" size="sm" className="w-full text-xs gap-1 h-8">
                    <Link href="/reports">PDF compliance report</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Expiring Documents */}
          {showHref("/pro") && expiringDocs && expiringDocs.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                  <Clock size={15} className="text-amber-600" />
                  {t("dashboard:expiringDocuments", "Expiring Documents")}
                  <Badge className="ml-auto bg-amber-100 text-amber-800 border-amber-200 text-xs">{expiringDocs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {expiringDocs.slice(0, 4).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-amber-100 last:border-0">
                      <div>
                        <div className="text-xs font-medium text-foreground">{doc.employeeName}</div>
                        <div className="text-[10px] text-muted-foreground">{doc.serviceType?.replace(/_/g, " ")}</div>
                      </div>
                      <span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">
                        {doc.expiryDate ? fmtDateLong(doc.expiryDate) : "N/A"}
                      </span>
                    </div>
                  ))}
                </div>
                {expiringDocs.length > 4 && (
                  <Button asChild variant="ghost" size="sm" className="mt-2 w-full text-amber-700 text-xs h-7">
                    <Link href="/pro">+{expiringDocs.length - 4} more documents</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Platform Links */}
          {platformToolLinks.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe size={15} className="text-[var(--smartpro-teal)]" />
                  {t("dashboard:platformTools", "Platform Tools")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {platformToolLinks.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      <span className="text-muted-foreground">{item.icon}</span>
                      <span className="text-xs font-medium text-foreground">{item.label}</span>
                      <ChevronRight size={11} className="ml-auto text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Rule-based alerts (hidden when Executive control tower narrative is present) + Today’s Tasks + Recent Activity ── */}
      <div
        className={`grid grid-cols-1 gap-5 ${
          !businessPulse?.controlTower ? "lg:grid-cols-3" : "lg:grid-cols-2"
        }`}
      >

        {!businessPulse?.controlTower && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap size={14} className="text-amber-500" /> {t("dashboard:operationalAlerts", "Operational alerts")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiInsights && aiInsights.length > 0 ? aiInsights.map((ins, i) => (
                <div key={i} className={`p-3 rounded-lg border-l-4 ${
                  ins.severity === "critical" ? "border-red-500 bg-red-50" :
                  ins.severity === "warning" ? "border-amber-500 bg-amber-50" :
                  "border-blue-500 bg-blue-50"
                }`}>
                  <p className="text-xs font-semibold text-foreground">{ins.titleKey ? t(`operations:${ins.titleKey}`, { ...ins.titleParams, defaultValue: ins.title }) : ins.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ins.descriptionKey ? t(`operations:${ins.descriptionKey}`, { defaultValue: ins.description }) : ins.description}</p>
                  {ins.actionUrl &&
                    (!ins.actionUrl.startsWith("/") ||
                      showHref(normalizeClientPath(ins.actionUrl))) && (
                    <Link href={ins.actionUrl}>
                      <Button variant="link" size="sm" className="h-5 p-0 text-xs mt-1 gap-1">
                        {ins.actionLabelKey ? t(`operations:${ins.actionLabelKey}`, { defaultValue: ins.actionLabel }) : ins.actionLabel} <ArrowRight size={10} />
                      </Button>
                    </Link>
                  )}
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap size={28} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">{t("dashboard:noCriticalAlerts", "No critical alerts today")}</p>
                  <p className="text-[10px] mt-0.5 opacity-60">{t("dashboard:allSystemsNormal", "All systems operating normally")}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Today’s Tasks */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" /> {t("dashboard:todaysTasks", "Today's Tasks")}
              {todaysTasks && todaysTasks.totalTasks > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">{todaysTasks.totalTasks}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {todaysTasks && todaysTasks.totalTasks > 0 ? todaysTasks.casesDue.slice(0, 6).map((task, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  task.priority === "urgent" ? "bg-red-500" :
                  task.priority === "high" ? "bg-amber-500" : "bg-blue-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate capitalize">{task.caseType.replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">Gov. Case #{task.id}</p>
                </div>
                <Link href="/workforce/cases">
                  <ChevronRight size={12} className="text-muted-foreground hover:text-foreground" />
                </Link>
              </div>
            )) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 size={28} className="mx-auto mb-2 opacity-20" />
                <p className="text-xs">{t("dashboard:allClear", "All clear for today")}</p>
                <p className="text-[10px] mt-0.5 opacity-60">{t("dashboard:noPendingTasks", "No pending tasks")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity — real audit events from DB */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity size={14} className="text-blue-500" /> {t("dashboard:recentActivity", "Recent Activity")}
              </CardTitle>
              {showHref("/audit-log") && (
                <Link href="/audit-log">
                  <Button variant="ghost" size="sm" className="text-xs gap-1 h-6">
                    {t("common:all", "All")} <ArrowUpRight size={10} />
                  </Button>
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {auditFeed && auditFeed.length > 0 ? auditFeed.slice(0, 6).map((ev, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={11} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate capitalize">{String(ev.action).replace(/_/g, " ")} {String(ev.entityType).replace(/_/g, " ")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(ev.createdAt).toLocaleTimeString("en-OM", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )) : (
              <div className="space-y-2">
                {[t("dashboard:platformInitialized", "Platform initialized"), t("dashboard:pasiModuleReady", "PASI module ready"), t("dashboard:sanadServicesActive", "Sanad services active")].map((msg, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={11} className="text-emerald-600" />
                    </div>
                    <p className="text-xs text-muted-foreground">{msg}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

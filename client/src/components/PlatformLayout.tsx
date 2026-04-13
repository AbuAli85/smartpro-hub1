import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import QuickActionsButton from "@/components/QuickActionsButton";
import {
  Activity,
  BarChart2,
  BarChart3,
  Banknote,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  HelpCircle,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  BookMarked,
  CreditCard,
  Mail,
  Star,
  Target,
  UserCheck,
  UserCircle,
  ShieldCheck,
  Users,
  X,
  Zap,
  ListTodo,
  Megaphone,
  LayoutGrid,
  Home,
  AlertTriangle,
  QrCode,
  ClipboardList,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  SunMedium,
  ClipboardCheck,
  TrendingDown,
  Network,
  Sparkles,
  UserSquare2,
  Crown,
  Radar,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isRTL } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  clientNavItemVisible,
  seesPlatformOperatorNav,
  isPortalClientNav,
  isCompanyOwnerNav,
  shouldUsePortalOnlyShell,
  shouldUsePreRegistrationShell,
  getMemberRoleLabel,
  getMemberRoleColor,
  isFieldEmployee,
} from "@shared/clientNav";
import { ClientAccessGate } from "@/components/ClientAccessGate";
import { SignInCallbackErrorBanner } from "@/components/SignInCallbackErrorBanner";
import { SignInTroubleshootingNote } from "@/components/SignInTroubleshootingNote";
import { AuditModeBanner } from "@/components/AuditModeBanner";
import { getHiddenNavHrefs } from "@/lib/navVisibility";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { OnboardingProgressWidget } from "@/components/OnboardingProgressWidget";
import { useOnboardingAutoComplete } from "@/hooks/useOnboardingAutoComplete";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  children?: NavItem[];
}

const navGroups = [
  // ── CONTROL (decision layer) ───────────────────────────────────────────────
  {
    label: "Control",
    items: [
      { label: "Control Tower", href: "/control-tower", icon: <Radar size={18} /> },
    ],
  },
  // ── OVERVIEW ──────────────────────────────────────────────────────────────
  {
    label: "Overview",
    items: [
      { label: "Executive Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} /> },
      { label: "Operations Centre", href: "/operations", icon: <Activity size={18} /> },
      { label: "Analytics", href: "/analytics", icon: <BarChart3 size={18} /> },
      { label: "Compliance Centre", href: "/compliance", icon: <CheckCircle2 size={18} /> },
    ],
  },
  // ── GOVERNMENT SERVICES ───────────────────────────────────────────────────
  {
    label: "Government Services",
    items: [
      { label: "Sanad Offices", href: "/sanad", icon: <Building2 size={18} /> },
      { label: "Office Dashboard", href: "/sanad/office-dashboard", icon: <BarChart3 size={18} /> },
      { label: "Partner onboarding", href: "/sanad/partner-onboarding", icon: <Sparkles size={18} /> },
      { label: "Sanad Marketplace", href: "/sanad/marketplace", icon: <Store size={18} /> },
      { label: "Catalogue Admin", href: "/sanad/catalogue-admin", icon: <BookMarked size={18} /> },
      { label: "Ratings Moderation", href: "/sanad/ratings-moderation", icon: <Star size={18} /> },
      { label: "PRO Services", href: "/pro", icon: <Shield size={18} /> },
    ],
  },
  // ── MY COMPANY ────────────────────────────────────────────────────────────
  // Purpose: company identity, settings, access control, and company-level documents.
  // Employee/HR data lives exclusively under Human Resources.
  {
    label: "My Company",
    items: [
      { label: "Workspace", href: "/workspace", icon: <LayoutGrid size={18} /> },
      { label: "My Portal", href: "/my-portal", icon: <Home size={18} /> },
      { label: "Company Profile", href: "/company/profile", icon: <Building2 size={18} /> },
      { label: "Company Admin", href: "/company-admin", icon: <Crown size={18} /> },
      { label: "Team Access & Roles", href: "/company/team-access", icon: <UserCheck size={18} /> },
      { label: "Multi-Company Roles", href: "/company/multi-company-roles", icon: <ShieldCheck size={18} /> },
      { label: "Company Settings", href: "/company/settings", icon: <Settings size={18} /> },
      { label: "Email Templates", href: "/company/email-preview", icon: <Mail size={18} /> },
      { label: "Company Documents", href: "/company/documents", icon: <FolderOpen size={18} /> },
    ],
  },
  // ── OPERATIONS (commercial) ────────────────────────────────────────────────
  {
    label: "Operations",
    items: [
      { label: "Company Hub", href: "/company/hub", icon: <Building2 size={18} /> },
      { label: "CRM", href: "/crm", icon: <Users size={18} /> },
      { label: "Quotations", href: "/quotations", icon: <Target size={18} /> },
      { label: "Contracts", href: "/contracts", icon: <FileText size={18} /> },
      { label: "Marketplace", href: "/marketplace", icon: <ShoppingBag size={18} /> },
    ],
  },
  // ── PEOPLE (HR) ───────────────────────────────────────────────────────────
  {
    label: "People",
    items: [
      { label: "My Team", href: "/my-team", icon: <Users size={18} /> },
      { label: "Attendance", href: "/hr/attendance", icon: <Clock size={18} /> },
      { label: "Payroll Engine", href: "/payroll", icon: <Banknote size={18} /> },
      { label: "Performance & Growth", href: "/hr/performance", icon: <Sparkles size={18} /> },
      { label: "Task Manager", href: "/hr/tasks", icon: <ListTodo size={18} /> },
      { label: "Recruitment", href: "/hr/recruitment", icon: <BookOpen size={18} /> },
      { label: "Departments", href: "/hr/departments", icon: <Building2 size={18} /> },
      { label: "Org Chart", href: "/hr/org-chart", icon: <Network size={18} /> },
      { label: "Workforce Intelligence", href: "/hr/workforce-intelligence", icon: <Activity size={18} /> },
      { label: "HR Performance & Automation", href: "/hr/executive-dashboard", icon: <Globe size={18} /> },
      { label: "Org Structure", href: "/hr/org-structure", icon: <LayoutGrid size={18} /> },
      { label: "Profile Completeness", href: "/hr/completeness", icon: <UserCheck size={18} /> },
      { label: "Leave & Requests", href: "/hr/leave", icon: <Calendar size={18} /> },
      { label: "Leave Balances", href: "/hr/leave-balance", icon: <CalendarCheck size={18} /> },
      { label: "Finance Overview", href: "/finance/overview", icon: <TrendingDown size={18} /> },
      { label: "Attendance Sites", href: "/hr/attendance-sites", icon: <QrCode size={18} /> },
      { label: "Shift Templates", href: "/hr/shift-templates", icon: <CalendarDays size={18} /> },
      { label: "Employee Schedules", href: "/hr/employee-schedules", icon: <CalendarRange size={18} /> },
      { label: "Holiday Calendar", href: "/hr/holidays", icon: <SunMedium size={18} /> },
      { label: "Today's Board", href: "/hr/today-board", icon: <CalendarClock size={18} /> },
      { label: "Monthly Report", href: "/hr/monthly-report", icon: <BarChart2 size={18} /> },
      { label: "HR Documents", href: "/hr/documents-dashboard", icon: <FileText size={18} /> },
      { label: "HR Letters", href: "/hr/letters", icon: <Mail size={18} /> },
      { label: "Promoter Agreements", href: "/hr/contracts", icon: <UserSquare2 size={18} /> },
      { label: "Employee Requests", href: "/hr/employee-requests", icon: <ClipboardList size={18} /> },
      { label: "Announcements", href: "/hr/announcements", icon: <Megaphone size={18} /> },
      { label: "KPI & Performance", href: "/hr/kpi", icon: <Target size={18} /> },
    ],
  },
  // ── COMPLIANCE (regulatory / workforce) ─────────────────────────────────
  {
    label: "Compliance",
    items: [
      { label: "Work Permits", href: "/workforce/permits", icon: <Shield size={18} /> },
      { label: "Government Cases", href: "/workforce/cases", icon: <ClipboardCheck size={18} /> },
      { label: "Expiry Dashboard", href: "/hr/expiry-dashboard", icon: <AlertTriangle size={18} /> },
      { label: "Portal Sync", href: "/workforce/sync", icon: <RefreshCw size={18} /> },
      { label: "Workforce Dashboard", href: "/workforce", icon: <BarChart3 size={18} /> },
      { label: "Workforce Employees", href: "/workforce/employees", icon: <Briefcase size={18} /> },
      { label: "Profile requests", href: "/workforce/profile-change-requests", icon: <ClipboardList size={18} /> },
      { label: "Document Vault", href: "/workforce/documents", icon: <FolderOpen size={18} /> },
    ],
  },
  // ── SHARED OMANI PRO ──────────────────────────────────────────────────────
  {
    label: "Shared Omani PRO",
    items: [
      { label: "Officer Registry", href: "/omani-officers", icon: <UserCheck size={18} /> },
      { label: "Assignments", href: "/officer-assignments", icon: <Building2 size={18} /> },
      { label: "Billing Engine", href: "/billing", icon: <CreditCard size={18} /> },
      { label: "SLA Management", href: "/sla-management", icon: <Shield size={18} /> },
    ],
  },
  // ── PLATFORM (admin-only) ─────────────────────────────────────────────────
  {
    label: "Platform",
    items: [
      { label: "Client Portal", href: "/client-portal", icon: <UserCircle size={18} /> },
      { label: "Subscriptions", href: "/subscriptions", icon: <Zap size={18} /> },
      { label: "Expiry Alerts", href: "/alerts", icon: <Bell size={18} /> },
      { label: "Renewal Workflows", href: "/renewal-workflows", icon: <Zap size={18} /> },
      { label: "Platform Operations", href: "/platform-ops", icon: <Globe size={18} /> },
      { label: "PDF Reports", href: "/reports", icon: <BarChart2 size={18} /> },
      { label: "Audit Log", href: "/audit-log", icon: <Shield size={18} /> },
      { label: "User Roles & Access", href: "/user-roles", icon: <ShieldCheck size={18} /> },
      { label: "Admin Panel", href: "/admin", icon: <Settings size={18} /> },
      { label: "SANAD Intelligence", href: "/admin/sanad", icon: <Network size={18} /> },
    ],
  },
];

// Map English label strings to nav translation keys
const NAV_GROUP_KEYS: Record<string, string> = {
  "Control": "control",
  "Overview": "overview",
  "Government Services": "governmentServices",
  "My Company": "myCompany",
  "Operations": "operations",
  "People": "people",
  "Compliance": "compliance",
  "Shared Omani PRO": "sharedOmaniPro",
  "Platform": "platform",
  "Your company": "platform",
};
const NAV_ITEM_KEYS: Record<string, string> = {
  "Control Tower": "controlTower",
  "Executive Dashboard": "executiveDashboard",
  "Operations Centre": "operationsCentre",
  "Analytics": "analytics",
  "Compliance Centre": "complianceCentre",
  "Sanad Offices": "sanadOffices",
  "Office Dashboard": "officeDashboard",
  "Sanad Marketplace": "sanadMarketplace",
  "Catalogue Admin": "catalogueAdmin",
  "Ratings Moderation": "ratingsModeration",
  "PRO Services": "proServices",
  "Workspace": "workspace",
  "My Portal": "myPortal",
  "Company Profile": "companyProfile",
  "Team Access & Roles": "teamAccessRoles",
  "Multi-Company Roles": "multiCompanyRoles",
  "Company Settings": "companySettings",
  "Email Templates": "emailTemplates",
  "Company Documents": "companyDocuments",
  "Company Hub": "companyHub",
  "Quotations": "quotations",
  "Contracts": "contracts",
  "Marketplace": "marketplace",
  "CRM": "crm",
  "My Team": "myTeam",
  "Recruitment": "recruitment",
  "Departments": "departments",
  "Org Chart": "orgChart",
  "Workforce Intelligence": "workforceIntelligence",
  "HR Performance & Automation": "hrPerformanceAutomation",
  "Org Structure": "orgStructure",
  "Profile Completeness": "profileCompleteness",
  "Leave & Requests": "leaveRequests",
  "Leave Balances": "leaveBalances",
  "Finance Overview": "financeOverview",
  "Payroll Engine": "payrollEngine",
  "Attendance": "attendance",
  "Attendance Sites": "attendanceSites",
  "Shift Templates": "shiftTemplates",
  "Employee Schedules": "employeeSchedules",
  "Holiday Calendar": "holidayCalendar",
  "Today's Board": "todaysBoard",
  "Monthly Report": "monthlyReport",
  "HR Documents": "hrDocuments",
  "Document Expiry": "documentExpiry",
  "HR Letters": "hrLetters",
  "Promoter Agreements": "promoterAgreements",
  "Employee Requests": "employeeRequests",
  "Task Manager": "taskManager",
  "Announcements": "announcements",
  "Performance & Growth": "performanceGrowth",
  "KPI & Performance": "kpiPerformance",
  "Workforce Dashboard": "workforceDashboard",
  "Workforce Employees": "workforceEmployees",
  "Profile requests": "profileChangeRequests",
  "Work Permits": "workPermits",
  "Government Cases": "governmentCases",
  "Expiry Dashboard": "expiryDashboard",
  "Document Vault": "documentVault",
  "Portal Sync": "portalSync",
  "Officer Registry": "officerRegistry",
  "Assignments": "assignments",
  "Billing Engine": "billingEngine",
  "SLA Management": "slaManagement",
  "Company Admin": "companyAdmin",
  "Client Portal": "clientPortal",
  "Subscriptions": "subscriptions",
  "Expiry Alerts": "expiryAlerts",
  "Renewal Workflows": "renewalWorkflows",
  "Platform Operations": "platformOpsLabel",
  "PDF Reports": "pdfReports",
  "Audit Log": "auditLog",
  "User Roles & Access": "userRolesAccess",
  "Admin Panel": "adminPanel",
  "SANAD Intelligence": "sanadIntelligence",
};
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useTranslation("nav");
  const { activeCompanyId, companies, activeCompany } = useActiveCompany();
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const effectiveMemberRole = myCompany?.member?.role ?? activeCompany?.role ?? null;
  const { data: wfStats } = trpc.workforce.dashboardStats.useQuery(undefined, {
    enabled: activeCompanyId != null && Boolean(myCompany?.company?.id),
    staleTime: 60_000,
  });
  const [navPrefsEpoch, setNavPrefsEpoch] = useState(0);

  useEffect(() => {
    const onPrefs = () => setNavPrefsEpoch((n) => n + 1);
    window.addEventListener("smartpro-nav-prefs-changed", onPrefs);
    return () => window.removeEventListener("smartpro-nav-prefs-changed", onPrefs);
  }, []);

  const visibleNavGroups = useMemo(() => {
    const hiddenOptional = getHiddenNavHrefs();
    const platformNav = seesPlatformOperatorNav(user);
    return navGroups
      .map((group) => ({
        ...group,
        label:
          group.label === "Platform" && !platformNav ? "Your company" : group.label,
        items: group.items.filter((item) =>
          clientNavItemVisible(item.href, user, hiddenOptional, {
            hasCompanyWorkspace: Boolean(myCompany?.company?.id),
            companyWorkspaceLoading: myCompanyLoading,
            memberRole: effectiveMemberRole,
            hasCompanyMembership: companies.length > 0,
          }),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [
    user,
    navPrefsEpoch,
    myCompany?.company?.id,
    myCompany?.member?.role,
    activeCompany?.role,
    myCompanyLoading,
    companies.length,
  ]);

  return (
    <div className="flex flex-col h-full sidebar-nav">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-[var(--sidebar-border)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-md">
            <span className="text-white font-black text-sm tracking-tight">SP</span>
          </div>
          <div>
            <div className="text-white font-black text-sm leading-none tracking-tight">{t("brandTitle")}</div>
            <div className="text-[10px] text-white/45 leading-none mt-0.5">{t("brandSubtitle")}</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Company Switcher */}
      <div className="border-b border-[var(--sidebar-border)]">
        <CompanySwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleNavGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {NAV_GROUP_KEYS[group.label] ? t(NAV_GROUP_KEYS[group.label], group.label) : group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                const pendingProfileReq =
                  item.href === "/workforce/profile-change-requests"
                    ? (wfStats?.pendingProfileChangeRequests ?? 0)
                    : 0;
                return (
                  <Link
                    key={`${group.label}-${item.href}`}
                    href={item.href}
                    onClick={onClose}
                    className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                  >
                    {item.icon}
                    <span className="flex-1">{NAV_ITEM_KEYS[item.label] ? t(NAV_ITEM_KEYS[item.label], item.label) : item.label}</span>
                    {pendingProfileReq > 0 ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-5 min-w-[1.25rem] justify-center shrink-0 bg-white/15 text-white border-white/20"
                      >
                        {pendingProfileReq > 99 ? "99+" : pendingProfileReq}
                      </Badge>
                    ) : null}
                    {isActive && <ChevronRight size={14} className="opacity-60 shrink-0" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Onboarding progress widget */}
      <OnboardingProgressWidget />

      {/* Language switcher */}
      <div className="px-3 pb-2">
        <LanguageSwitcher className="w-full justify-start text-white/70 border-white/10 hover:bg-white/5 hover:text-white" />
      </div>

      {/* User */}
      <div className="px-3 py-4 border-t border-[var(--sidebar-border)]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-semibold">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <div className="text-xs font-medium text-white/90 truncate">{user?.name ?? "User"}</div>
                <div className="text-[10px] text-white/40 truncate">{user?.email ?? ""}</div>
              </div>
              <ChevronDown size={14} className="text-white/40 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/onboarding-guide">
                <HelpCircle size={14} className="mr-2" /> {t("onboardingGuideLink", "Onboarding guide")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/preferences">
                <Settings size={14} className="mr-2" /> {t("navigationPreferences", "Navigation preferences")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut size={14} className="mr-2" /> {t("signOut", "Sign out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { activeCompanyId, loading: companiesLoading } = useActiveCompany();
  const utils = trpc.useUtils();
  const { data: proServices } = trpc.pro.list.useQuery(
    { status: "expiring_soon", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: contracts } = trpc.contracts.list.useQuery(
    { status: "pending_signature", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: leaveRequests } = trpc.hr.listLeave.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  // Automation notifications (company-scoped; skip when no workspace to avoid 403)
  const automationQueriesEnabled =
    isAuthenticated && activeCompanyId != null && !companiesLoading;
  const { data: automationUnread } = trpc.automation.getUnreadCount.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: automationQueriesEnabled, refetchInterval: 30_000 },
  );
  const { data: automationNotifs = [] } = trpc.automation.listNotifications.useQuery(
    { limit: 5, unreadOnly: true, companyId: activeCompanyId ?? undefined },
    { enabled: open && automationQueriesEnabled },
  );
  const markRead = trpc.automation.markNotificationsRead.useMutation({
    onSuccess: () => {
      utils.automation.getUnreadCount.invalidate();
      utils.automation.listNotifications.invalidate();
    },
  });
  const businessNotifications = useMemo(() => {
    const items: { id: string; title: string; desc: string; type: "warning" | "info" | "action" }[] = [];
    (proServices ?? []).slice(0, 3).forEach((s) => {
      if (s.expiryDate) {
        const days = Math.ceil((new Date(s.expiryDate).getTime() - Date.now()) / 86400000);
        if (days <= 30) items.push({ id: `pro-${s.id}`, title: "Document Expiring", desc: `${s.serviceType} expires in ${days}d`, type: "warning" });
      }
    });
    (contracts ?? []).slice(0, 3).forEach((c) => {
      items.push({ id: `contract-${c.id}`, title: "Signature Required", desc: `${c.title} awaiting signature`, type: "action" });
    });
    (leaveRequests ?? [])
      .filter((l) => l.status === "pending")
      .slice(0, 3)
      .forEach((l) => {
        items.push({
          id: `leave-${l.id}`,
          title: "Leave Request",
          desc: "Leave request pending approval",
          type: "info",
        });
      });
    const criticalCount = alertBadge?.critical ?? 0;
    const totalExpiring = alertBadge?.count ?? 0;
    if (criticalCount > 0) {
      items.push({ id: "expiry-critical", title: `${criticalCount} Critical Expir${criticalCount === 1 ? "y" : "ies"}`, desc: `${criticalCount} item${criticalCount === 1 ? "" : "s"} expire within 7 days`, type: "warning" });
    } else if (totalExpiring > 0) {
      items.push({ id: "expiry-upcoming", title: `${totalExpiring} Upcoming Expir${totalExpiring === 1 ? "y" : "ies"}`, desc: `${totalExpiring} item${totalExpiring === 1 ? "" : "s"} expire within 30 days`, type: "info" });
    }
    return items;
  }, [proServices, contracts, leaveRequests, alertBadge]);
  const automationUnreadCount = automationUnread?.count ?? 0;
  const totalUnread = businessNotifications.length + automationUnreadCount;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)}>
        <Bell size={18} />
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <span className="font-semibold text-sm">Notifications</span>
              {totalUnread > 0 && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => markRead.mutate({ all: true, companyId: activeCompanyId ?? undefined })}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {automationNotifs.length > 0 && (
                <>
                  <div className="px-4 py-1.5 bg-amber-50">
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Automation Alerts</span>
                  </div>
                  {automationNotifs.map((n) => (
                    <button
                      key={`auto-${n.id}`}
                      className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        markRead.mutate({ ids: [n.id], companyId: activeCompanyId ?? undefined });
                        if (n.link) {
                          navigate(n.link);
                          setOpen(false);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-amber-500" />
                        <div><p className="text-xs font-medium">{n.title}</p><p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p></div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {businessNotifications.length === 0 && automationNotifs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                businessNotifications.map((n) => (
                  <div key={n.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        n.type === "warning" ? "bg-amber-500" : n.type === "action" ? "bg-blue-500" : "bg-green-500"
                      }`} />
                      <div><p className="text-xs font-medium">{n.title}</p><p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p></div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {automationUnreadCount > 0 && (
              <div className="px-4 py-2 border-t">
                <button className="text-xs text-primary hover:underline w-full text-center" onClick={() => { navigate("/hr/workforce-intelligence"); setOpen(false); }}>
                  View all automation alerts →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  // Auto-complete onboarding steps when user visits relevant pages
  useOnboardingAutoComplete();

  // Auto-close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);
  const { data: layoutCompany } = trpc.companies.myCompany.useQuery(
    undefined,
    { enabled: isAuthenticated },
  );
  const isAuditor = layoutCompany?.member?.role === "external_auditor";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center animate-pulse">
            <span className="text-white font-bold">SP</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading SmartPRO...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-sm space-y-4">
          <SignInCallbackErrorBanner />
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl">SP</span>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">SmartPRO Hub</h1>
              <p className="text-muted-foreground mt-2 text-sm">
                End-to-end business services platform for GCC enterprises
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {["Sanad Offices", "PRO Services", "Contracts", "HR & CRM"].map((f) => (
                <div key={f} className="flex items-center gap-1.5 bg-muted rounded-md px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--smartpro-orange)]" />
                  {f}
                </div>
              ))}
            </div>
            <Button asChild className="w-full" size="lg">
              <a href={getLoginUrl()}>Sign in to SmartPRO</a>
            </Button>
            <SignInTroubleshootingNote className="text-left" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip to main content — visible only on keyboard focus */}
      <a href="#main-content" className="skip-to-main">Skip to main content</a>

      {/* Mobile overlay — always rendered, opacity animated */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col h-full" aria-label="Main navigation">
        <SidebarContent />
      </aside>

      {/* Sidebar - mobile */}
      <aside
        id="mobile-sidebar"
        className={`fixed inset-y-0 z-50 lg:hidden transform transition-transform duration-200 ease-in-out w-72 ${
          isRTL() ? "right-0" : "left-0"
        } ${
          sidebarOpen ? "translate-x-0" : isRTL() ? "translate-x-full" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
        aria-hidden={!sidebarOpen}
        aria-modal={sidebarOpen ? "true" : "false"}
      >
        <SidebarContent onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0" role="banner">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-sidebar"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>

        {/* Content */}
        <main id="main-content" className="flex-1 overflow-y-auto pb-16 lg:pb-0" role="main">
          {isAuditor && (
            <AuditModeBanner companyName={layoutCompany?.company?.name} />
          )}
          <ClientAccessGate>{children}</ClientAccessGate>
        </main>
        {/* Quick Actions floating button */}
        <QuickActionsButton />
      </div>
      {/* Mobile bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}

function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { activeCompanyId, activeCompany, loading: companiesLoading, companies } = useActiveCompany();
  const { data: myCompany, isLoading: companyLoading } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && !companiesLoading },
  );
  const effectiveMemberRole = myCompany?.member?.role ?? activeCompany?.role ?? null;
  const platform = seesPlatformOperatorNav(user);
  const portalShell = shouldUsePortalOnlyShell(user, {
    hasCompanyWorkspace: Boolean(myCompany?.company?.id),
    companyWorkspaceLoading: companyLoading,
    memberRole: effectiveMemberRole,
  });
  const preRegShell = shouldUsePreRegistrationShell(user, {
    hasCompanyMembership: companies.length > 0,
  });

  const tabs = useMemo(() => {
    if (preRegShell) {
      return [
        { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
        { href: "/onboarding", icon: <Building2 size={20} />, label: "Set up" },
      ];
    }
    if (platform) {
      return [
        { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
        { href: "/alerts", icon: <Bell size={20} />, label: "Alerts" },
        { href: "/contracts", icon: <FileText size={20} />, label: "Contracts" },
        { href: "/hr/employees", icon: <Users size={20} />, label: "HR" },
        { href: "/crm", icon: <Briefcase size={20} />, label: "CRM" },
      ];
    }
    if (portalShell) {
      return [
        { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
        { href: "/alerts", icon: <Bell size={20} />, label: "Alerts" },
        { href: "/client-portal", icon: <UserCircle size={20} />, label: "Portal" },
        { href: "/contracts", icon: <FileText size={20} />, label: "Contracts" },
        { href: "/company/hub", icon: <Building2 size={20} />, label: "Hub" },
      ];
    }
    if (isFieldEmployee(effectiveMemberRole)) {
      return [
        { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
        { href: "/my-portal", icon: <Home size={20} />, label: "My Portal" },
        { href: "/workspace", icon: <LayoutGrid size={20} />, label: "Workspace" },
      ];
    }
    return [
      { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
      { href: "/alerts", icon: <Bell size={20} />, label: "Alerts" },
      { href: "/operations", icon: <Activity size={20} />, label: "Ops" },
      { href: "/company/hub", icon: <Building2 size={20} />, label: "Hub" },
      { href: "/hr/employees", icon: <Users size={20} />, label: "HR" },
    ];
  }, [platform, portalShell, preRegShell, effectiveMemberRole]);

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-center justify-around h-16">
      {tabs.map((tab) => {
        const active = location === tab.href || (tab.href !== "/dashboard" && location.startsWith(tab.href));
        return (
          <Link key={tab.href} href={tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

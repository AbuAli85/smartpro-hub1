import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import QuickActionsButton from "@/components/QuickActionsButton";
import {
  Activity,
  Bell,
  Briefcase,
  Building2,
  ChevronDown,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isRTL } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  seesPlatformOperatorNav,
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { OnboardingProgressWidget } from "@/components/OnboardingProgressWidget";
import { useOnboardingAutoComplete } from "@/hooks/useOnboardingAutoComplete";
import { filterVisibleNavGroups } from "@/config/platformNav";
import { PlatformSidebarNav } from "@/components/PlatformSidebarNav";
import type { ClientNavOptions } from "@shared/clientNav";
function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation("nav");
  const { activeCompanyId, companies, activeCompany } = useActiveCompany();
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const effectiveMemberRole = myCompany?.member?.role ?? activeCompany?.role ?? null;
  const navExtraAllowedHrefs = useMemo(() => {
    const ext = (myCompany?.company as { roleNavExtensions?: Record<string, string[]> } | undefined)
      ?.roleNavExtensions;
    const r = effectiveMemberRole;
    if (!ext || !r) return null;
    const list = ext[r];
    return Array.isArray(list) && list.length > 0 ? list : null;
  }, [myCompany?.company, effectiveMemberRole]);
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

  const platformNav = seesPlatformOperatorNav(user);

  const visibleNavGroups = useMemo(() => {
    const navOptions: ClientNavOptions = {
      hasCompanyWorkspace: Boolean(myCompany?.company?.id),
      companyWorkspaceLoading: myCompanyLoading,
      memberRole: effectiveMemberRole,
      hasCompanyMembership: companies.length > 0,
      navExtraAllowedHrefs,
    };
    return filterVisibleNavGroups(user, navOptions);
  }, [
    user,
    navPrefsEpoch,
    myCompany?.company?.id,
    myCompany?.member?.role,
    activeCompany?.role,
    navExtraAllowedHrefs,
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

      <PlatformSidebarNav
        groups={visibleNavGroups}
        onClose={onClose}
        t={t}
        platformNav={platformNav}
        pendingProfileReq={wfStats?.pendingProfileChangeRequests ?? 0}
      />

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
        { href: "/my-portal", icon: <Home size={20} />, label: "Home" },
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

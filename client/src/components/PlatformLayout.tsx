import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
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
  Star,
  Target,
  UserCheck,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  clientNavItemVisible,
  seesPlatformOperatorNav,
  isPortalClientNav,
  isCompanyOwnerNav,
  shouldUsePortalOnlyShell,
} from "@shared/clientNav";
import { ClientAccessGate } from "@/components/ClientAccessGate";
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

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  children?: NavItem[];
}

const navGroups = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard size={18} /> },
      { label: "Operations Centre", href: "/operations", icon: <Activity size={18} /> },
      { label: "Analytics", href: "/analytics", icon: <BarChart3 size={18} /> },
      { label: "Compliance", href: "/compliance", icon: <CheckCircle2 size={18} /> },
    ],
  },
  {
    label: "Government Services",
    items: [
      { label: "Sanad Offices", href: "/sanad", icon: <Building2 size={18} /> },
      { label: "Office Dashboard", href: "/sanad/office-dashboard", icon: <BarChart3 size={18} /> },
      { label: "Sanad Marketplace", href: "/sanad/marketplace", icon: <Store size={18} /> },
      { label: "Catalogue Admin", href: "/sanad/catalogue-admin", icon: <BookMarked size={18} /> },
      { label: "Ratings Moderation", href: "/sanad/ratings-moderation", icon: <Star size={18} /> },
      { label: "PRO Services", href: "/pro", icon: <Shield size={18} /> },
    ],
  },
  {
    label: "My Company",
    items: [
      { label: "Business Dashboard", href: "/business/dashboard", icon: <LayoutDashboard size={18} /> },
      { label: "My Team", href: "/my-team", icon: <Users size={18} /> },
      { label: "Operations", href: "/company/operations", icon: <Activity size={18} /> },
      { label: "Company Documents", href: "/company/documents", icon: <FolderOpen size={18} /> },
      { label: "Document Dashboard", href: "/hr/documents-dashboard", icon: <FileText size={18} /> },
      { label: "Run Payroll", href: "/payroll/process", icon: <Banknote size={18} /> },
      { label: "Company Workspace", href: "/company/workspace", icon: <Building2 size={18} /> },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Company hub", href: "/company/hub", icon: <Building2 size={18} /> },
      { label: "Quotations", href: "/quotations", icon: <Target size={18} /> },
      { label: "Contracts", href: "/contracts", icon: <FileText size={18} /> },
      { label: "Marketplace", href: "/marketplace", icon: <ShoppingBag size={18} /> },
      { label: "CRM", href: "/crm", icon: <Users size={18} /> },
    ],
  },
  {
    label: "Human Resources",
    items: [
      { label: "Employees", href: "/hr/employees", icon: <Briefcase size={18} /> },
      { label: "Recruitment", href: "/hr/recruitment", icon: <BookOpen size={18} /> },
      { label: "Leave & Payroll", href: "/hr/leave", icon: <Calendar size={18} /> },
      { label: "Payroll Engine", href: "/payroll", icon: <Banknote size={18} /> },
      { label: "Run Payroll", href: "/payroll/process", icon: <Banknote size={18} /> },
      { label: "Attendance", href: "/hr/attendance", icon: <Clock size={18} /> },
    ],
  },
  {
    label: "Workforce Hub",
    items: [
      { label: "WF Dashboard", href: "/workforce", icon: <BarChart3 size={18} /> },
      { label: "WF Employees", href: "/workforce/employees", icon: <Users size={18} /> },
      { label: "Work Permits", href: "/workforce/permits", icon: <Shield size={18} /> },
      { label: "Gov. Cases", href: "/workforce/cases", icon: <Briefcase size={18} /> },
      { label: "Document Vault", href: "/workforce/documents", icon: <FolderOpen size={18} /> },
      { label: "Portal Sync", href: "/workforce/sync", icon: <RefreshCw size={18} /> },
    ],
  },
  {
    label: "Shared Omani PRO",
    items: [
      { label: "Officer Registry", href: "/omani-officers", icon: <UserCheck size={18} /> },
      { label: "Assignments", href: "/officer-assignments", icon: <Building2 size={18} /> },
      { label: "Billing Engine", href: "/billing", icon: <CreditCard size={18} /> },
      { label: "SLA Management", href: "/sla-management", icon: <Shield size={18} /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Company Admin", href: "/company-admin", icon: <Building2 size={18} /> },
      { label: "Client Portal", href: "/client-portal", icon: <UserCircle size={18} /> },
      { label: "Subscriptions", href: "/subscriptions", icon: <Zap size={18} /> },
      { label: "Expiry Alerts", href: "/alerts", icon: <Bell size={18} /> },
      { label: "Renewal Workflows", href: "/renewal-workflows", icon: <Zap size={18} /> },
      { label: "Platform Ops", href: "/platform-ops", icon: <Globe size={18} /> },
      { label: "PDF Reports", href: "/reports", icon: <BarChart2 size={18} /> },
      { label: "Audit Log", href: "/audit-log", icon: <Shield size={18} /> },
      { label: "Admin Panel", href: "/admin", icon: <Settings size={18} /> },
    ],
  },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { data: myCompany, isLoading: myCompanyLoading } = trpc.companies.myCompany.useQuery();
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
            memberRole: myCompany?.member?.role ?? null,
          }),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [user, navPrefsEpoch, myCompany?.company?.id, myCompanyLoading]);

  return (
    <div className="flex flex-col h-full sidebar-nav">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-[var(--sidebar-border)]">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-md">
            <span className="text-white font-black text-sm tracking-tight">SP</span>
          </div>
          <div>
            <div className="text-white font-black text-sm leading-none tracking-tight">SmartPRO</div>
            <div className="text-[10px] text-white/45 leading-none mt-0.5">Business Services Hub · Oman</div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Company badge */}
      {myCompany && (
        <div className="px-4 py-3 border-b border-[var(--sidebar-border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5">
            <Building2 size={14} className="text-white/60 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-xs text-white/70 truncate block">{myCompany.company.name}</span>
              {user && (
                <span className="text-[10px] text-white/40 uppercase tracking-wide">
                  {seesPlatformOperatorNav(user)
                    ? "Platform"
                    : isPortalClientNav(user)
                      ? "Client access"
                      : isCompanyOwnerNav(user)
                        ? "Owner"
                        : "Team"}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleNavGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight size={14} className="opacity-60" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

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
                <HelpCircle size={14} className="mr-2" /> Onboarding guide
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/preferences">
                <Settings size={14} className="mr-2" /> Navigation preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut size={14} className="mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: proServices } = trpc.pro.list.useQuery({ status: "expiring_soon" });
  const { data: contracts } = trpc.contracts.list.useQuery({ status: "pending_signature" });
  const { data: leaveRequests } = trpc.hr.listLeave.useQuery({});
  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery();
  const notifications = useMemo(() => {
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
    (leaveRequests ?? []).slice(0, 3).forEach((l) => {
      items.push({ id: `leave-${l.id}`, title: "Leave Request", desc: `Leave request pending approval`, type: "info" });
    });
    // Expiry alerts from the alerts engine
    const criticalCount = alertBadge?.critical ?? 0;
    const totalExpiring = alertBadge?.count ?? 0;
    if (criticalCount > 0) {
      items.push({ id: "expiry-critical", title: `${criticalCount} Critical Expir${criticalCount === 1 ? "y" : "ies"}`, desc: `${criticalCount} item${criticalCount === 1 ? "" : "s"} expire within 7 days`, type: "warning" });
    } else if (totalExpiring > 0) {
      items.push({ id: "expiry-upcoming", title: `${totalExpiring} Upcoming Expir${totalExpiring === 1 ? "y" : "ies"}`, desc: `${totalExpiring} item${totalExpiring === 1 ? "" : "s"} expire within 30 days`, type: "info" });
    }
    return items;
  }, [proServices, contracts, leaveRequests, alertBadge]);
  const unread = notifications.length;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(!open)}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <span className="font-semibold text-sm">Notifications</span>
              {unread > 0 && <span className="text-xs text-muted-foreground">{unread} unread</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">All caught up!</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="px-4 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        n.type === "warning" ? "bg-amber-500" : n.type === "action" ? "bg-blue-500" : "bg-green-500"
                      }`} />
                      <div>
                        <p className="text-xs font-medium">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm px-4">
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
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip to main content — visible only on keyboard focus */}
      <a href="#main-content" className="skip-to-main">Skip to main content</a>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col h-full" aria-label="Main navigation">
        <SidebarContent />
      </aside>

      {/* Sidebar - mobile */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 z-50 lg:hidden transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
        aria-hidden={!sidebarOpen}
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
      </div>
      {/* Mobile bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}

function MobileBottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: myCompany, isLoading: companyLoading } = trpc.companies.myCompany.useQuery();
  const platform = seesPlatformOperatorNav(user);
  const portalShell = shouldUsePortalOnlyShell(user, {
    hasCompanyWorkspace: Boolean(myCompany?.company?.id),
    companyWorkspaceLoading: companyLoading,
  });

  const tabs = useMemo(() => {
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
    return [
      { href: "/dashboard", icon: <LayoutDashboard size={20} />, label: "Home" },
      { href: "/alerts", icon: <Bell size={20} />, label: "Alerts" },
      { href: "/operations", icon: <Activity size={20} />, label: "Ops" },
      { href: "/company/hub", icon: <Building2 size={20} />, label: "Hub" },
      { href: "/hr/employees", icon: <Users size={20} />, label: "HR" },
    ];
  }, [platform, portalShell]);

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

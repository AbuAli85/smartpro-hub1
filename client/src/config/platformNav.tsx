import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart2,
  BarChart3,
  Banknote,
  Bell,
  BookOpen,
  BookMarked,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Globe,
  Home,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  Mail,
  Megaphone,
  Network,
  QrCode,
  Radar,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  SunMedium,
  Target,
  TrendingDown,
  UserCheck,
  UserCircle,
  UserSquare2,
  Users,
  SlidersHorizontal,
} from "lucide-react";
import { clientNavItemVisible, type ClientNavOptions } from "@shared/clientNav";
import { getHiddenNavHrefs } from "@/lib/navVisibility";

/**
 * Platform sidebar — final Business OS tree (labels + routes + icons).
 *
 * **Sources of truth**
 * - This file: structure, `NavTier`, hub `activePathPrefixes`, default labels.
 * - `shared/clientNav.ts` (`clientNavItemVisible`): RBAC, shells, optional hidden prefs.
 * - `shared/roleNavConfig.ts`: tenant `roleNavExtensions` allowlists.
 *
 * **Naming**
 * - **Team Directory** (`/my-team`) = HR people directory; **Team Access** (`/company/team-access`) = access;
 *   **Roles & permissions** (`/company-admin`) = membership roles & roster (distinct from directory).
 */

/** Semantic layer for analytics, onboarding, and future AI routing. */
export type NavIntent = "overview" | "workspace" | "insight" | "governance" | "marketplace" | "system";

/** Section priority: rendering, disclosure, and header weight in PlatformSidebarNav. */
export type NavTier = "primary" | "secondary" | "tertiary";

export type NavLeafDef = {
  kind: "leaf";
  id: string;
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: LucideIcon;
  intent: NavIntent;
  activePathPrefixes?: string[];
  hubPrimary?: boolean;
};

export type NavBranchDef = {
  kind: "branch";
  id: string;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  intent: NavIntent;
  children: NavLeafDef[];
};

export type NavItemDef = NavLeafDef | NavBranchDef;

export type NavGroupDef = {
  id: string;
  labelKey: string;
  defaultGroupLabel: string;
  items: NavItemDef[];
  tier?: NavTier;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

type LeafOpts = { intent: NavIntent; activePathPrefixes?: string[]; hubPrimary?: boolean };

function leaf(
  id: string,
  labelKey: string,
  defaultLabel: string,
  href: string,
  icon: LucideIcon,
  opts: LeafOpts,
): NavLeafDef {
  return {
    kind: "leaf",
    id,
    labelKey,
    defaultLabel,
    href,
    icon,
    intent: opts.intent,
    activePathPrefixes: opts.activePathPrefixes,
    hubPrimary: opts.hubPrimary,
  };
}

function branch(
  id: string,
  labelKey: string,
  defaultLabel: string,
  icon: LucideIcon,
  intent: NavIntent,
  children: NavLeafDef[],
): NavBranchDef {
  return { kind: "branch", id, labelKey, defaultLabel, icon, children, intent };
}

/**
 * Canonical ordered nav groups (A→J). Role filtering does not reorder — empty groups drop out.
 */
export const PLATFORM_NAV_GROUP_DEFS: readonly NavGroupDef[] = [
  /* A — Control */
  {
    id: "control",
    labelKey: "controlGroup",
    defaultGroupLabel: "Control",
    tier: "primary",
    items: [
      leaf("overview.controlTower", "controlTower", "Control Tower", "/control-tower", Radar, { intent: "overview" }),
      leaf("overview.businessOverview", "businessOverview", "Business Overview", "/dashboard", LayoutDashboard, {
        intent: "overview",
      }),
      leaf("overview.operationsOverview", "operationsOverview", "Operations Overview", "/operations", Activity, {
        intent: "overview",
      }),
      leaf("overview.analytics", "analytics", "Analytics", "/analytics", BarChart3, { intent: "overview" }),
      leaf("overview.complianceCentre", "complianceCentre", "Compliance Centre", "/compliance", CheckCircle2, {
        intent: "overview",
      }),
    ],
  },
  /* B — Government services / partner (Sanad) */
  {
    id: "govPartner",
    labelKey: "govPartnerGroup",
    defaultGroupLabel: "Government services & partners",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("gov.sanadOffices", "sanadOffices", "Sanad Offices", "/sanad", Building2, { intent: "system" }),
      leaf("gov.officeDashboard", "officeDashboard", "Office Dashboard", "/sanad/office-dashboard", BarChart3, {
        intent: "system",
      }),
      leaf("gov.partnerOnboarding", "partnerOnboarding", "Partner Onboarding", "/sanad/partner-onboarding", Sparkles, {
        intent: "system",
      }),
      leaf("gov.catalogueAdmin", "catalogueAdmin", "Catalogue Administration", "/sanad/catalogue-admin", BookMarked, {
        intent: "system",
      }),
      leaf("gov.ratingsModeration", "ratingsModeration", "Ratings Moderation", "/sanad/ratings-moderation", Star, {
        intent: "system",
      }),
    ],
  },
  /* C — Company */
  {
    id: "company",
    labelKey: "companyGroup",
    defaultGroupLabel: "Company",
    tier: "primary",
    items: [
      leaf("co.workspace", "workspace", "Company Workspace", "/workspace", LayoutGrid, { intent: "workspace" }),
      leaf("co.companyProfile", "companyProfile", "Company Profile", "/company/profile", Building2, { intent: "workspace" }),
      leaf("co.companyDocuments", "companyDocuments", "Company Documents", "/company/documents", FolderOpen, {
        intent: "workspace",
      }),
      leaf("co.contracts", "contracts", "Contracts", "/contracts", FileText, { intent: "workspace" }),
      leaf("co.companySettings", "companySettings", "Workspace Settings", "/company/settings", SlidersHorizontal, {
        intent: "workspace",
      }),
      leaf("co.emailTemplates", "emailTemplates", "Email Templates", "/company/email-preview", Mail, { intent: "workspace" }),
    ],
  },
  /* D — People & HR */
  {
    id: "peopleHr",
    labelKey: "peopleHrGroup",
    defaultGroupLabel: "People & HR",
    tier: "primary",
    items: [
      leaf("people.employeeHome", "employeeHome", "Employee Home", "/my-portal", Home, { intent: "workspace" }),
      leaf("people.teamDirectory", "teamDirectory", "Team Directory", "/my-team", Users, { intent: "workspace" }),
      branch(
        "people.scheduling",
        "schedulingTime",
        "Scheduling & Attendance",
        CalendarClock,
        "workspace",
        [
          leaf("people.attendance", "attendance", "Attendance", "/hr/attendance", Clock, { intent: "workspace" }),
          leaf("people.attendanceSites", "attendanceSites", "Attendance sites", "/hr/attendance-sites", QrCode, {
            intent: "workspace",
          }),
          leaf("people.shiftTemplates", "shiftTemplates", "Shift templates", "/hr/shift-templates", CalendarDays, {
            intent: "workspace",
          }),
          leaf("people.employeeSchedules", "employeeSchedules", "Employee schedules", "/hr/employee-schedules", CalendarRange, {
            intent: "workspace",
          }),
          leaf("people.holidayCalendar", "holidayCalendar", "Holiday calendar", "/hr/holidays", SunMedium, {
            intent: "workspace",
          }),
          leaf("people.todaysBoard", "todaysBoard", "Today's board", "/hr/today-board", CalendarClock, {
            intent: "workspace",
          }),
          leaf("people.monthlyReport", "monthlyReport", "Monthly report", "/hr/monthly-report", BarChart2, {
            intent: "workspace",
          }),
        ],
      ),
      branch(
        "people.leave",
        "leaveGroup",
        "Leave",
        Calendar,
        "workspace",
        [
          leaf("people.leaveRequests", "leaveRequests", "Leave & requests", "/hr/leave", Calendar, {
            intent: "workspace",
          }),
          leaf("people.leaveBalances", "leaveBalances", "Leave balances", "/hr/leave-balance", CalendarCheck, {
            intent: "workspace",
          }),
        ],
      ),
      leaf(
        "people.organizationHub",
        "organizationHub",
        "Organization",
        "/organization",
        Network,
        {
          intent: "workspace",
          hubPrimary: true,
          activePathPrefixes: [
            "/organization",
            "/hr/org-chart",
            "/hr/org-structure",
            "/hr/departments",
          ],
        },
      ),
      leaf(
        "people.hrInsightsHub",
        "hrInsightsHub",
        "HR Insights",
        "/hr/insights",
        Activity,
        {
          intent: "insight",
          hubPrimary: true,
          activePathPrefixes: [
            "/hr/insights",
            "/hr/workforce-intelligence",
            "/hr/executive-dashboard",
            "/hr/kpi",
            "/hr/performance",
          ],
        },
      ),
      leaf("people.payroll", "payrollEngine", "Payroll Engine", "/payroll", Banknote, { intent: "workspace" }),
      leaf("people.tasks", "taskManager", "Task Manager", "/hr/tasks", ListTodo, { intent: "workspace" }),
      leaf("people.recruitment", "recruitment", "Recruitment", "/hr/recruitment", BookOpen, { intent: "workspace" }),
      leaf("people.announcements", "announcements", "Announcements", "/hr/announcements", Megaphone, {
        intent: "workspace",
      }),
      leaf("people.profileCompleteness", "profileCompleteness", "Profile completeness", "/hr/completeness", UserCheck, {
        intent: "workspace",
      }),
      branch(
        "people.hrDocs",
        "hrDocumentsGroup",
        "HR documents & requests",
        FileText,
        "workspace",
        [
          leaf("people.hrDocuments", "hrDocuments", "HR documents", "/hr/documents-dashboard", FileText, {
            intent: "workspace",
          }),
          leaf("people.hrLetters", "hrLetters", "HR letters", "/hr/letters", Mail, { intent: "workspace" }),
          leaf("people.employeeRequests", "employeeRequests", "Employee requests", "/hr/employee-requests", ClipboardList, {
            intent: "workspace",
          }),
          leaf("people.promoterAgreements", "promoterAgreements", "Promoter agreements", "/hr/contracts", UserSquare2, {
            intent: "workspace",
          }),
        ],
      ),
      leaf(
        "people.profileChangeReq",
        "profileChangeRequests",
        "Profile change requests",
        "/workforce/profile-change-requests",
        ClipboardList,
        { intent: "governance" },
      ),
      leaf("people.complianceVaultHr", "complianceVault", "Compliance vault", "/workforce/documents", FolderOpen, {
        intent: "governance",
      }),
      leaf("people.financeOverview", "financeOverview", "Finance overview", "/finance/overview", TrendingDown, {
        intent: "insight",
      }),
    ],
  },
  /* E — Operations */
  {
    id: "operations",
    labelKey: "operations",
    defaultGroupLabel: "Operations",
    tier: "primary",
    items: [
      leaf("ops.companyHub", "companyHub", "Company hub", "/company/hub", Building2, { intent: "workspace" }),
      leaf("ops.crm", "crm", "CRM & Pipeline", "/crm", Users, { intent: "workspace" }),
      leaf("ops.quotations", "quotations", "Quotations", "/quotations", Target, { intent: "workspace" }),
    ],
  },
  /* F — Marketplace */
  {
    id: "marketplaceSection",
    labelKey: "marketplaceSection",
    defaultGroupLabel: "Marketplace",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("mp.service", "serviceMarketplace", "Service marketplace", "/marketplace", ShoppingBag, {
        intent: "marketplace",
      }),
      leaf("mp.sanad", "sanadMarketplace", "Sanad marketplace", "/sanad/marketplace", Store, { intent: "marketplace" }),
    ],
  },
  /* G — Compliance & workforce */
  {
    id: "complianceWorkforce",
    labelKey: "complianceWorkforceGroup",
    defaultGroupLabel: "Compliance & workforce",
    tier: "primary",
    items: [
      leaf(
        "compliance.renewalsHub",
        "renewalsExpiryHub",
        "Renewals & Expiry",
        "/compliance/renewals",
        Bell,
        {
          intent: "governance",
          hubPrimary: true,
          activePathPrefixes: [
            "/compliance/renewals",
            "/alerts",
            "/hr/expiry-dashboard",
            "/renewal-workflows",
            "/subscriptions",
          ],
        },
      ),
      leaf("compliance.workPermits", "workPermits", "Work permits", "/workforce/permits", Shield, { intent: "governance" }),
      leaf("compliance.governmentCases", "governmentCases", "Government cases", "/workforce/cases", ClipboardCheck, {
        intent: "governance",
      }),
      leaf("compliance.portalSync", "portalSync", "Portal sync", "/workforce/sync", RefreshCw, { intent: "governance" }),
      leaf("compliance.workforceDashboard", "workforceDashboard", "Workforce overview", "/workforce", BarChart3, {
        intent: "governance",
      }),
      leaf("compliance.workforceEmployees", "workforceEmployees", "Workforce employees", "/workforce/employees", Briefcase, {
        intent: "governance",
      }),
    ],
  },
  /* H — Access & permissions */
  {
    id: "access",
    labelKey: "accessPermissionsGroup",
    defaultGroupLabel: "Access & permissions",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("access.teamAccess", "teamAccess", "Team access", "/company/team-access", UserCheck, {
        intent: "governance",
      }),
      leaf("access.rolesPermissions", "rolesPermissions", "Roles & permissions", "/company-admin", Shield, {
        intent: "governance",
      }),
      leaf("access.crossCompany", "crossCompanyAccess", "Cross-company access", "/company/multi-company-roles", ShieldCheck, {
        intent: "governance",
      }),
      leaf("access.platformAccess", "platformAccessControl", "Platform access control", "/user-roles", ShieldCheck, {
        intent: "governance",
      }),
    ],
  },
  /* I — Shared Omani PRO */
  {
    id: "proShared",
    labelKey: "proSharedGroup",
    defaultGroupLabel: "Shared Omani PRO",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("gov.proServices", "proServices", "PRO Services", "/pro", Shield, { intent: "system" }),
      leaf("sop.officers", "officerRegistry", "Officer registry", "/omani-officers", UserCheck, { intent: "workspace" }),
      leaf("sop.assignments", "assignments", "Assignments", "/officer-assignments", Building2, { intent: "workspace" }),
      leaf("sop.billing", "billingEngine", "Billing engine", "/billing", CreditCard, { intent: "workspace" }),
      leaf("sop.sla", "slaManagement", "SLA management", "/sla-management", Shield, { intent: "workspace" }),
    ],
  },
  /* J — Platform & admin */
  {
    id: "platform",
    labelKey: "platformAdminGroup",
    defaultGroupLabel: "Platform & admin",
    tier: "tertiary",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      leaf("plat.clientPortal", "clientPortal", "Client portal", "/client-portal", UserCircle, { intent: "system" }),
      leaf("plat.platformOps", "platformOpsLabel", "Platform operations", "/platform-ops", Globe, { intent: "system" }),
      leaf("plat.navIntegrity", "navIntegrity", "Nav integrity", "/nav-integrity", ShieldCheck, { intent: "system" }),
      leaf("plat.pdfReports", "pdfReports", "PDF reports", "/reports", BarChart2, { intent: "system" }),
      leaf("plat.auditLog", "auditLog", "Audit log", "/audit-log", Shield, { intent: "system" }),
      leaf("plat.adminPanel", "adminPanel", "Admin panel", "/admin", Settings, { intent: "system" }),
      leaf("plat.sanadIntelligence", "sanadIntelligence", "Sanad intelligence", "/admin/sanad", Network, {
        intent: "system",
      }),
    ],
  },
];

/** Stable ordered group ids for tests and diagnostics. */
export const PLATFORM_NAV_GROUP_IDS: readonly string[] = PLATFORM_NAV_GROUP_DEFS.map((g) => g.id);

function filterItem(
  item: NavItemDef,
  user: Parameters<typeof clientNavItemVisible>[1],
  hiddenOptional: Set<string>,
  options: ClientNavOptions | undefined,
): NavItemDef | null {
  if (item.kind === "leaf") {
    if (!clientNavItemVisible(item.href, user, hiddenOptional, options)) {
      return null;
    }
    return item;
  }
  const nextChildren = item.children
    .map((c) => filterItem(c, user, hiddenOptional, options))
    .filter((c): c is NavLeafDef => c != null);
  if (nextChildren.length === 0) return null;
  return { ...item, children: nextChildren };
}

export function filterVisibleNavGroups(
  user: Parameters<typeof clientNavItemVisible>[1],
  options: ClientNavOptions | undefined,
): NavGroupDef[] {
  const hiddenOptional = getHiddenNavHrefs();
  return PLATFORM_NAV_GROUP_DEFS.map((g) => ({
    ...g,
    items: g.items
      .map((item) => filterItem(item, user, hiddenOptional, options))
      .filter((item): item is NavItemDef => item != null),
  })).filter((g) => g.items.length > 0);
}

export function isLeafActive(href: string, location: string): boolean {
  if (location === href) return true;
  if (href !== "/" && location.startsWith(`${href}/`)) return true;
  return false;
}

export function isNavLeafActive(leaf: NavLeafDef, location: string): boolean {
  if (isLeafActive(leaf.href, location)) return true;
  if (!leaf.activePathPrefixes?.length) return false;
  return leaf.activePathPrefixes.some((p) => {
    if (location === p) return true;
    if (p !== "/" && location.startsWith(`${p}/`)) return true;
    return false;
  });
}

function subtreeContainsActive(item: NavItemDef, location: string): boolean {
  if (item.kind === "leaf") return isNavLeafActive(item, location);
  return item.children.some((c) => subtreeContainsActive(c, location));
}

export function groupContainsActiveRoute(group: NavGroupDef, location: string): boolean {
  for (const item of group.items) {
    if (subtreeContainsActive(item, location)) return true;
  }
  return false;
}

export function branchShouldShowOpen(item: NavBranchDef, location: string): boolean {
  return subtreeContainsActive(item, location);
}

import type { LucideIcon } from "lucide-react";
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
  BookMarked,
  SlidersHorizontal,
} from "lucide-react";
import { clientNavItemVisible, type ClientNavOptions } from "@shared/clientNav";
import { getHiddenNavHrefs } from "@/lib/navVisibility";

/**
 * Platform sidebar — implementation notes (2026 refactor)
 *
 * **Sources of truth**
 * - `PLATFORM_NAV_GROUP_DEFS`: canonical tree (labels, routes, icons, hub prefixes, tiers).
 * - `shared/clientNav.ts` (`clientNavItemVisible`): role, portal shell, optional prefs, platform-only hrefs.
 * - `shared/roleNavConfig.ts`: company-configured nav extensions (not duplicated here).
 *
 * **What changed**
 * - Information architecture: business-first sections (Control → Company → People → Operations → Gov),
 *   then PRO, Marketplace, Sanad partners, Access, Platform/admin — instead of a long flat mix.
 * - Group metadata: `tier`, `collapsible`, `defaultCollapsed` for progressive disclosure (see PlatformSidebarNav).
 * - Naming aligned to business language; routes preserved unless already shared by hub prefixes.
 *
 * **Policy**
 * - Do not encode RBAC duplicates here; visibility stays centralized in `clientNavItemVisible`.
 */

/** Semantic layer for analytics, onboarding, and future AI routing. */
export type NavIntent = "overview" | "workspace" | "insight" | "governance" | "marketplace" | "system";

/** Sidebar section priority — drives disclosure + header emphasis in the shell. */
export type NavTier = "primary" | "secondary" | "tertiary";

export type NavLeafDef = {
  kind: "leaf";
  id: string;
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: LucideIcon;
  intent: NavIntent;
  /** Treat these paths as active for this item (hub + legacy deep links). */
  activePathPrefixes?: string[];
  /** Stronger sidebar emphasis — primary hub entry points. */
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
  /** Default: primary. */
  tier?: NavTier;
  /** Whole-group disclosure (secondary/tertiary); primary groups stay always open. */
  collapsible?: boolean;
  /** When `collapsible`, start collapsed until route-active or user expands. */
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
 * Canonical platform navigation tree (labels + routes + icons).
 * Role gating is applied in filterVisibleNavGroups — do not duplicate rules here.
 *
 * Order: executive control → company → people → operations → government/compliance →
 * PRO → marketplace → Sanad network → access → platform/admin.
 */
export const PLATFORM_NAV_GROUP_DEFS: readonly NavGroupDef[] = [
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
      leaf("overview.analytics", "analytics", "Analytics", "/analytics", BarChart3, { intent: "overview" }),
    ],
  },
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
      leaf("co.companyAdmin", "companyAdmin", "Member administration", "/company-admin", Users, { intent: "workspace" }),
      leaf("co.companySettings", "companySettings", "Workspace Settings", "/company/settings", SlidersHorizontal, {
        intent: "workspace",
      }),
      leaf("co.emailTemplates", "emailTemplates", "Email Templates", "/company/email-preview", Mail, { intent: "workspace" }),
    ],
  },
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
        "Attendance & scheduling",
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
      leaf("people.recruitment", "recruitment", "Recruitment", "/hr/recruitment", BookOpen, { intent: "workspace" }),
      leaf("people.announcements", "announcements", "Announcements", "/hr/announcements", Megaphone, {
        intent: "workspace",
      }),
      leaf("people.profileCompleteness", "profileCompleteness", "Profile completeness", "/hr/completeness", UserCheck, {
        intent: "workspace",
      }),
      leaf("people.financeOverview", "financeOverview", "Finance overview", "/finance/overview", TrendingDown, {
        intent: "insight",
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
    ],
  },
  {
    id: "operations",
    labelKey: "operations",
    defaultGroupLabel: "Operations",
    tier: "primary",
    items: [
      leaf("overview.operationsOverview", "operationsOverview", "Operations overview", "/operations", Activity, {
        intent: "overview",
      }),
      leaf("ops.companyHub", "operationsHub", "Operations hub", "/company/hub", Building2, { intent: "workspace" }),
      leaf("ops.crm", "crm", "CRM & Pipeline", "/crm", Users, { intent: "workspace" }),
      leaf("ops.quotations", "quotations", "Quotations", "/quotations", Target, { intent: "workspace" }),
      leaf("ops.contracts", "contracts", "Contracts", "/contracts", FileText, { intent: "workspace" }),
      leaf("ops.tasks", "taskManager", "Task Manager", "/hr/tasks", ListTodo, { intent: "workspace" }),
    ],
  },
  {
    id: "govCompliance",
    labelKey: "govComplianceGroup",
    defaultGroupLabel: "Government & compliance",
    tier: "primary",
    items: [
      leaf("overview.complianceCentre", "complianceCentre", "Compliance Centre", "/compliance", CheckCircle2, {
        intent: "overview",
      }),
      leaf(
        "compliance.renewalsHub",
        "renewalsExpiryHub",
        "Renewals & expiry",
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
      leaf(
        "compliance.profileRequests",
        "profileChangeRequests",
        "Profile change requests",
        "/workforce/profile-change-requests",
        ClipboardList,
        { intent: "governance" },
      ),
      leaf("compliance.complianceVault", "complianceVault", "Compliance vault", "/workforce/documents", FolderOpen, {
        intent: "governance",
      }),
    ],
  },
  {
    id: "proShared",
    labelKey: "proSharedGroup",
    defaultGroupLabel: "PRO & Omani PRO",
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
      leaf("gov.ratingsModeration", "ratingsModeration", "Ratings moderation", "/sanad/ratings-moderation", Star, {
        intent: "system",
      }),
      leaf("gov.catalogueAdmin", "catalogueAdmin", "Catalogue administration", "/sanad/catalogue-admin", BookMarked, {
        intent: "system",
      }),
    ],
  },
  {
    id: "sanadPartners",
    labelKey: "sanadPartnersGroup",
    defaultGroupLabel: "Sanad & partners",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("gov.sanadOffices", "sanadOffices", "Sanad offices", "/sanad", Building2, { intent: "system" }),
      leaf("gov.partnerOnboarding", "partnerOnboarding", "Partner onboarding", "/sanad/partner-onboarding", Sparkles, {
        intent: "system",
      }),
      leaf("gov.officeDashboard", "officeDashboard", "Office dashboard", "/sanad/office-dashboard", BarChart3, {
        intent: "system",
      }),
    ],
  },
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
      leaf("access.crossCompany", "crossCompanyAccess", "Cross-company access", "/company/multi-company-roles", ShieldCheck, {
        intent: "governance",
      }),
      leaf("access.platformAccess", "platformAccessControl", "Platform access control", "/user-roles", ShieldCheck, {
        intent: "governance",
      }),
    ],
  },
  {
    id: "platform",
    labelKey: "platformAdminGroup",
    defaultGroupLabel: "Platform & admin",
    tier: "tertiary",
    collapsible: true,
    defaultCollapsed: true,
    items: [
      leaf("plat.adminPanel", "adminPanel", "Admin panel", "/admin", Settings, { intent: "system" }),
      leaf("plat.auditLog", "auditLog", "Audit log", "/audit-log", Shield, { intent: "system" }),
      leaf("plat.pdfReports", "pdfReports", "PDF reports", "/reports", BarChart2, { intent: "system" }),
      leaf("plat.platformOps", "platformOpsLabel", "Platform operations", "/platform-ops", Globe, { intent: "system" }),
      leaf("plat.navIntegrity", "navIntegrity", "Nav integrity", "/nav-integrity", ShieldCheck, { intent: "system" }),
      leaf("plat.sanadIntelligence", "sanadIntelligence", "Sanad intelligence", "/admin/sanad", Network, {
        intent: "system",
      }),
      leaf("plat.clientPortal", "clientPortal", "Client portal", "/client-portal", UserCircle, { intent: "system" }),
    ],
  },
];

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

/** Active if current path matches this exact leaf or a deeper segment under it. */
export function isLeafActive(href: string, location: string): boolean {
  if (location === href) return true;
  if (href !== "/" && location.startsWith(`${href}/`)) return true;
  return false;
}

/** Sidebar active state including hub `activePathPrefixes`. */
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

/** True if any visible item under this group matches the current location (for section expansion). */
export function groupContainsActiveRoute(group: NavGroupDef, location: string): boolean {
  for (const item of group.items) {
    if (subtreeContainsActive(item, location)) return true;
  }
  return false;
}

export function branchShouldShowOpen(item: NavBranchDef, location: string): boolean {
  return subtreeContainsActive(item, location);
}

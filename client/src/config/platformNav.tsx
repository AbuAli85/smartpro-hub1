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
  Layers,
  ListTodo,
  Mail,
  Megaphone,
  MessageSquare,
  Network,
  PhoneCall,
  QrCode,
  Radar,
  Receipt,
  RefreshCw,
  Scale,
  Settings,
  Shield,
  ShieldAlert,
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
  Users2,
  SlidersHorizontal,
} from "lucide-react";
import { clientNavItemVisible, shouldUsePortalOnlyShell, type ClientNavOptions } from "@shared/clientNav";
import { normalizeAppPath } from "@shared/normalizeAppPath";
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

export type NavAttentionLevel = "none" | "low" | "medium";
export type NavBadgeTone = "neutral" | "warning" | "critical";
export type NavBadgeKey =
  | "teamAccessPendingInvites"
  | "renewalsAttention"
  | "governmentCasesOpen"
  | "taskManagerOpen";

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
  /** Optional V1 sidebar badge metadata (count/tone is resolved at runtime). */
  badgeMeta?: { key: NavBadgeKey };
  /** Reserved for future “needs attention” styling tiers. */
  attentionLevel?: NavAttentionLevel;
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

type LeafOpts = {
  intent: NavIntent;
  activePathPrefixes?: string[];
  hubPrimary?: boolean;
  badgeMeta?: NavLeafDef["badgeMeta"];
  attentionLevel?: NavAttentionLevel;
};

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
    badgeMeta: opts.badgeMeta,
    attentionLevel: opts.attentionLevel,
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
 *
 * Route ownership (regression guard — see `platformNavRouteMatrix.test.ts`):
 * - **control**: executive dashboards & org-wide KPIs (`/operations`, `/finance/overview`, `/compliance` centre, etc.)
 * - **govPartner**: Sanad office network surfaces (offices, dashboard, partner onboarding)
 * - **company**: company profile, commercial contracts, workspace settings
 * - **peopleHr**: HR module (`/hr/*`), employee portal, directory (excludes `/hr/tasks` — company ops live under Operations)
 * - **operations**: revenue execution + company task manager (hub, CRM, quotes, `/hr/tasks`)
 * - **marketplaceSection**: service discovery + Sanad marketplace + catalogue administration
 * - **platform**: ratings moderation (platform governance) lives with other admin tools
 * - **complianceWorkforce**: government workforce compliance (`/workforce/*` except profile-change queue grouped under People for HR workflow)
 * - **access**: membership access & roles
 * - **proShared**: Omani PRO pillar
 * - **getStarted**: create / learn paths for users with no company yet (filtered like other groups)
 * - **clientWorkspace**: defined only in {@link CLIENT_PORTAL_SHELL_GROUP_DEFS} (explicit whitelist; not part of tenant OS tree)
 * - **platform**: internal / global admin
 */

/**
 * End-customer portal shell — explicit whitelist only (`/client/*` + session settings).
 * Rendered instead of {@link PLATFORM_NAV_GROUP_DEFS} when `shouldUsePortalOnlyShell` is true (see `filterVisibleNavGroups`).
 */
export const CLIENT_PORTAL_SHELL_GROUP_DEFS: readonly NavGroupDef[] = [
  {
    id: "clientWorkspace",
    labelKey: "clientPortalShellGroup",
    defaultGroupLabel: "My account",
    tier: "primary",
    collapsible: false,
    items: [
      leaf("cp.dashboard", "clientDashboard", "Dashboard", "/client", LayoutDashboard, {
        intent: "workspace",
        activePathPrefixes: ["/client"],
      }),
      leaf("cp.services", "clientPortalServices", "Services", "/client/engagements", Layers, {
        intent: "workspace",
        activePathPrefixes: ["/client/engagements"],
      }),
      leaf("cp.documents", "clientDocuments", "Documents", "/client/documents", FolderOpen, {
        intent: "workspace",
      }),
      leaf("cp.invoices", "clientPortalInvoicesPayments", "Invoices & payments", "/client/invoices", Receipt, {
        intent: "workspace",
      }),
      leaf("cp.messages", "clientMessages", "Messages", "/client/messages", MessageSquare, {
        intent: "workspace",
      }),
      leaf("cp.team", "clientTeam", "Team", "/client/team", Users2, {
        intent: "workspace",
      }),
      leaf("cp.settings", "clientPortalSettings", "Settings", "/preferences", Settings, {
        intent: "workspace",
      }),
    ],
  },
];

/** Company workspace + operator nav (excludes {@link CLIENT_PORTAL_SHELL_GROUP_DEFS}). */
export const PLATFORM_NAV_GROUP_DEFS: readonly NavGroupDef[] = [
  /* A0 — Get started (create workspace; visible when allowed by clientNav) */
  {
    id: "getStarted",
    labelKey: "getStartedGroup",
    defaultGroupLabel: "Get started",
    tier: "primary",
    items: [
      leaf("getStarted.create", "createCompanyWorkspace", "Create company workspace", "/company/create", Building2, {
        intent: "workspace",
      }),
      leaf("getStarted.guide", "learnSmartPRO", "Learn SmartPRO", "/onboarding-guide", BookOpen, {
        intent: "overview",
      }),
    ],
  },
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
      leaf("control.financeOverview", "financeOverview", "Finance overview", "/finance/overview", TrendingDown, {
        intent: "insight",
      }),
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
          leaf(
            "people.attendanceAnomalies",
            "attendanceAnomalies",
            "Anomaly report",
            "/hr/attendance-anomalies",
            ShieldAlert,
            { intent: "workspace" },
          ),
          leaf(
            "people.attendanceReconciliation",
            "attendanceReconciliation",
            "Reconciliation",
            "/hr/attendance-reconciliation",
            Scale,
            { intent: "workspace" },
          ),
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
          leaf(
            "people.promoterAssignmentOps",
            "promoterAssignmentOps",
            "Assignment operations",
            "/hr/promoter-assignment-ops",
            Users,
            { intent: "workspace" },
          ),
        ],
      ),
      leaf(
        "people.profileChangeReq",
        "profileChangeRequests",
        "Profile change requests",
        "/workforce/profile-change-requests",
        ClipboardList,
        {
          intent: "governance",
          attentionLevel: "low",
        },
      ),
    ],
  },
  /* E — Operations */
  {
    id: "operations",
    labelKey: "operations",
    defaultGroupLabel: "Operations",
    tier: "primary",
    items: [
      leaf("ops.companyHub", "companyHub", "Company hub", "/company/hub", Building2, {
        intent: "workspace",
      }),
      leaf("ops.tasks", "taskManager", "Task Manager", "/hr/tasks", ListTodo, {
        intent: "workspace",
        badgeMeta: { key: "taskManagerOpen" },
      }),
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
      leaf("mp.catalogueAdmin", "catalogueAdmin", "Catalogue administration", "/sanad/catalogue-admin", BookMarked, {
        intent: "system",
      }),
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
          badgeMeta: { key: "renewalsAttention" },
        },
      ),
      leaf("compliance.workPermits", "workPermits", "Work permits", "/workforce/permits", Shield, { intent: "governance" }),
      leaf("compliance.governmentCases", "governmentCases", "Government cases", "/workforce/cases", ClipboardCheck, {
        intent: "governance",
        badgeMeta: { key: "governmentCasesOpen" },
      }),
      leaf("compliance.portalSync", "portalSync", "Portal sync", "/workforce/sync", RefreshCw, { intent: "governance" }),
      leaf("compliance.workforceDashboard", "workforceDashboard", "Workforce overview", "/workforce", BarChart3, {
        intent: "governance",
      }),
      leaf("compliance.workforceEmployees", "workforceEmployees", "Workforce employees", "/workforce/employees", Briefcase, {
        intent: "governance",
      }),
      leaf(
        "compliance.workforceDocVault",
        "workforceDocumentVault",
        "Workforce document vault",
        "/workforce/documents",
        FolderOpen,
        { intent: "governance" },
      ),
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
        badgeMeta: { key: "teamAccessPendingInvites" },
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
  /* I — Omani PRO (network) */
  {
    id: "proShared",
    labelKey: "proSharedGroup",
    defaultGroupLabel: "Omani PRO services",
    tier: "secondary",
    collapsible: true,
    defaultCollapsed: false,
    items: [
      leaf("gov.proServices", "proServices", "PRO Services", "/pro", Shield, { intent: "system" }),
      leaf("sop.officers", "officerRegistry", "Officer registry", "/omani-officers", UserCheck, { intent: "workspace" }),
      leaf("sop.assignments", "assignments", "Assignments", "/officer-assignments", Building2, { intent: "workspace" }),
      leaf("sop.billing", "billingEngine", "Billing engine", "/billing", CreditCard, { intent: "workspace" }),
      leaf("sop.clientBilling", "clientBilling", "Client billing", "/client-billing", FileText, { intent: "workspace" }),
      leaf("sop.collections", "collections", "Collections & AR", "/collections", PhoneCall, { intent: "workspace" }),
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
      leaf("plat.platformOps", "platformOpsLabel", "Platform operations", "/platform-ops", Globe, { intent: "system" }),
      leaf("plat.navIntegrity", "navIntegrity", "Nav integrity", "/nav-integrity", ShieldCheck, { intent: "system" }),
      leaf("plat.pdfReports", "pdfReports", "PDF reports", "/reports", BarChart2, { intent: "system" }),
      leaf("plat.auditLog", "auditLog", "Audit log", "/audit-log", Shield, { intent: "system" }),
      leaf("plat.ratingsModeration", "ratingsModeration", "Ratings moderation", "/sanad/ratings-moderation", Star, {
        intent: "system",
      }),
      leaf("plat.adminPanel", "adminPanel", "Admin panel", "/admin", Settings, { intent: "system" }),
      leaf("plat.sanadIntelligence", "sanadIntelligence", "Sanad intelligence", "/admin/sanad", Network, {
        intent: "system",
      }),
    ],
  },
];

/** Stable ordered group ids for tests and diagnostics (company + operator shell only). */
export const PLATFORM_NAV_GROUP_IDS: readonly string[] = PLATFORM_NAV_GROUP_DEFS.map((g) => g.id);

/** All sidebar groups for ownership / active tests (platform tree + client portal whitelist). */
export const ALL_SIDEBAR_NAV_GROUP_DEFS: readonly NavGroupDef[] = [
  ...PLATFORM_NAV_GROUP_DEFS,
  ...CLIENT_PORTAL_SHELL_GROUP_DEFS,
];

function walkItemsForLeaves(items: readonly NavItemDef[], out: NavLeafDef[]): void {
  for (const item of items) {
    if (item.kind === "leaf") out.push(item);
    else walkItemsForLeaves(item.children, out);
  }
}

/** Flatten visible sidebar groups for active-state resolution (avoids cross-shell false positives). */
export function collectLeavesFromNavGroups(groups: readonly NavGroupDef[]): NavLeafDef[] {
  const out: NavLeafDef[] = [];
  for (const g of groups) walkItemsForLeaves(g.items, out);
  return out;
}

/** Leaves in the company / operator nav tree only. */
export const PLATFORM_NAV_ALL_LEAVES: readonly NavLeafDef[] = (() => {
  const out: NavLeafDef[] = [];
  for (const g of PLATFORM_NAV_GROUP_DEFS) walkItemsForLeaves(g.items, out);
  return out;
})();

const CLIENT_PORTAL_NAV_ALL_LEAVES: readonly NavLeafDef[] = (() => {
  const out: NavLeafDef[] = [];
  for (const g of CLIENT_PORTAL_SHELL_GROUP_DEFS) walkItemsForLeaves(g.items, out);
  return out;
})();

/** Union of platform + client-portal leaves for sidebar active-state (e.g. `/preferences` on portal users). */
export const SIDEBAR_NAV_ALL_LEAVES: readonly NavLeafDef[] = (() => {
  const seen = new Set<string>();
  const out: NavLeafDef[] = [];
  for (const l of PLATFORM_NAV_ALL_LEAVES) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  for (const l of CLIENT_PORTAL_NAV_ALL_LEAVES) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
})();

/** Higher score = more specific match for `loc` (disambiguates `/sanad` vs `/sanad/marketplace`, etc.). */
function navLeafMatchScore(leaf: NavLeafDef, loc: string): number {
  if (loc === leaf.href) return 1_000_000 + leaf.href.length;
  if (leaf.href !== "/" && loc.startsWith(`${leaf.href}/`)) return 500_000 + leaf.href.length;
  if (leaf.activePathPrefixes?.length) {
    let best = 0;
    for (const p of leaf.activePathPrefixes) {
      if (loc === p) best = Math.max(best, 400_000 + p.length);
      else if (p !== "/" && loc.startsWith(`${p}/`)) best = Math.max(best, 300_000 + p.length);
    }
    if (best > 0) return best;
  }
  return -1;
}

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

function filterNavGroups(
  defs: readonly NavGroupDef[],
  user: Parameters<typeof clientNavItemVisible>[1],
  hiddenOptional: Set<string>,
  options: ClientNavOptions | undefined,
): NavGroupDef[] {
  return defs
    .map((g) => ({
      ...g,
      items: g.items
        .map((item) => filterItem(item, user, hiddenOptional, options))
        .filter((item): item is NavItemDef => item != null),
    }))
    .filter((g) => g.items.length > 0);
}

export function filterVisibleNavGroups(
  user: Parameters<typeof clientNavItemVisible>[1],
  options: ClientNavOptions | undefined,
): NavGroupDef[] {
  const hiddenOptional = getHiddenNavHrefs();
  if (shouldUsePortalOnlyShell(user, options)) {
    return filterNavGroups(CLIENT_PORTAL_SHELL_GROUP_DEFS, user, hiddenOptional, options);
  }
  return filterNavGroups(PLATFORM_NAV_GROUP_DEFS, user, hiddenOptional, options);
}

/** Normalized pathname for active matching (query/hash stripped, trailing slash collapsed). */
export function normalizeNavPathForMatching(location: string): string {
  const n = normalizeAppPath(location);
  return n || "/";
}

export function isLeafActive(href: string, location: string): boolean {
  const loc = normalizeNavPathForMatching(location);
  if (loc === href) return true;
  if (href !== "/" && loc.startsWith(`${href}/`)) return true;
  return false;
}

/**
 * @param visibleNavGroups When set, only leaves from these groups compete for “active” (sidebar shell isolation).
 */
export function isNavLeafActive(
  leaf: NavLeafDef,
  location: string,
  visibleNavGroups?: readonly NavGroupDef[],
): boolean {
  const loc = normalizeNavPathForMatching(location);
  const pool =
    visibleNavGroups != null && visibleNavGroups.length > 0
      ? collectLeavesFromNavGroups(visibleNavGroups)
      : SIDEBAR_NAV_ALL_LEAVES;
  const candidates = pool.filter((l) => navLeafMatchScore(l, loc) >= 0);
  if (candidates.length === 0) return false;
  const best = candidates.reduce((a, b) => (navLeafMatchScore(b, loc) > navLeafMatchScore(a, loc) ? b : a));
  return best.id === leaf.id;
}

function subtreeContainsActive(
  item: NavItemDef,
  location: string,
  visibleNavGroups?: readonly NavGroupDef[],
): boolean {
  if (item.kind === "leaf") return isNavLeafActive(item, location, visibleNavGroups);
  return item.children.some((c) => subtreeContainsActive(c, location, visibleNavGroups));
}

export function groupContainsActiveRoute(
  group: NavGroupDef,
  location: string,
  visibleNavGroups?: readonly NavGroupDef[],
): boolean {
  for (const item of group.items) {
    if (subtreeContainsActive(item, location, visibleNavGroups)) return true;
  }
  return false;
}

export function branchShouldShowOpen(
  item: NavBranchDef,
  location: string,
  visibleNavGroups?: readonly NavGroupDef[],
): boolean {
  return subtreeContainsActive(item, location, visibleNavGroups);
}

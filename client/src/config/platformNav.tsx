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
  AlertTriangle,
  Clock,
  CreditCard,
  Crown,
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
  Zap,
  BookMarked,
} from "lucide-react";
import { clientNavItemVisible, type ClientNavOptions } from "@shared/clientNav";
import { getHiddenNavHrefs } from "@/lib/navVisibility";

export type NavLeafDef = {
  kind: "leaf";
  id: string;
  labelKey: string;
  defaultLabel: string;
  href: string;
  icon: LucideIcon;
};

export type NavBranchDef = {
  kind: "branch";
  id: string;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  children: NavLeafDef[];
};

export type NavItemDef = NavLeafDef | NavBranchDef;

export type NavGroupDef = {
  id: string;
  labelKey: string;
  defaultGroupLabel: string;
  items: NavItemDef[];
};

function leaf(
  id: string,
  labelKey: string,
  defaultLabel: string,
  href: string,
  icon: LucideIcon,
): NavLeafDef {
  return { kind: "leaf", id, labelKey, defaultLabel, href, icon };
}

function branch(
  id: string,
  labelKey: string,
  defaultLabel: string,
  icon: LucideIcon,
  children: NavLeafDef[],
): NavBranchDef {
  return { kind: "branch", id, labelKey, defaultLabel, icon, children };
}

/**
 * Canonical platform navigation tree (labels + routes + icons).
 * Role gating is applied in filterVisibleNavGroups — do not duplicate rules here.
 */
export const PLATFORM_NAV_GROUP_DEFS: readonly NavGroupDef[] = [
  {
    id: "overview",
    labelKey: "overview",
    defaultGroupLabel: "Overview",
    items: [
      leaf("overview.controlTower", "controlTower", "Control Tower", "/control-tower", Radar),
      leaf("overview.businessOverview", "businessOverview", "Business Overview", "/dashboard", LayoutDashboard),
      leaf("overview.operationsOverview", "operationsOverview", "Operations Overview", "/operations", Activity),
      leaf("overview.analytics", "analytics", "Analytics", "/analytics", BarChart3),
      leaf("overview.complianceCentre", "complianceCentre", "Compliance Centre", "/compliance", CheckCircle2),
    ],
  },
  {
    id: "governmentServices",
    labelKey: "governmentServices",
    defaultGroupLabel: "Government Services",
    items: [
      leaf("gov.sanadOffices", "sanadOffices", "Sanad Offices", "/sanad", Building2),
      leaf("gov.officeDashboard", "officeDashboard", "Office Dashboard", "/sanad/office-dashboard", BarChart3),
      leaf("gov.partnerOnboarding", "partnerOnboarding", "Partner onboarding", "/sanad/partner-onboarding", Sparkles),
      leaf("gov.catalogueAdmin", "catalogueAdmin", "Catalogue Admin", "/sanad/catalogue-admin", BookMarked),
      leaf("gov.ratingsModeration", "ratingsModeration", "Ratings Moderation", "/sanad/ratings-moderation", Star),
      leaf("gov.proServices", "proServices", "PRO Services", "/pro", Shield),
    ],
  },
  {
    id: "myCompany",
    labelKey: "myCompany",
    defaultGroupLabel: "My Company",
    items: [
      leaf("co.workspace", "workspace", "Workspace", "/workspace", LayoutGrid),
      leaf("co.companyProfile", "companyProfile", "Company Profile", "/company/profile", Building2),
      leaf("co.companyAdmin", "companyAdmin", "Company Admin", "/company-admin", Crown),
      leaf("co.companySettings", "companySettings", "Company Settings", "/company/settings", Settings),
      leaf("co.emailTemplates", "emailTemplates", "Email Templates", "/company/email-preview", Mail),
      leaf("co.companyDocuments", "companyDocuments", "Company Documents", "/company/documents", FolderOpen),
    ],
  },
  {
    id: "people",
    labelKey: "people",
    defaultGroupLabel: "People",
    items: [
      leaf("people.employeeHome", "employeeHome", "Employee Home", "/my-portal", Home),
      leaf("people.teamDirectory", "teamDirectory", "Team Directory", "/my-team", Users),
      branch(
        "people.scheduling",
        "schedulingTime",
        "Scheduling & attendance",
        CalendarClock,
        [
          leaf("people.attendance", "attendance", "Attendance", "/hr/attendance", Clock),
          leaf("people.attendanceSites", "attendanceSites", "Attendance sites", "/hr/attendance-sites", QrCode),
          leaf("people.shiftTemplates", "shiftTemplates", "Shift templates", "/hr/shift-templates", CalendarDays),
          leaf("people.employeeSchedules", "employeeSchedules", "Employee schedules", "/hr/employee-schedules", CalendarRange),
          leaf("people.holidayCalendar", "holidayCalendar", "Holiday calendar", "/hr/holidays", SunMedium),
          leaf("people.todaysBoard", "todaysBoard", "Today's board", "/hr/today-board", CalendarClock),
          leaf("people.monthlyReport", "monthlyReport", "Monthly report", "/hr/monthly-report", BarChart2),
        ],
      ),
      branch(
        "people.leave",
        "leaveGroup",
        "Leave",
        Calendar,
        [
          leaf("people.leaveRequests", "leaveRequests", "Leave & requests", "/hr/leave", Calendar),
          leaf("people.leaveBalances", "leaveBalances", "Leave balances", "/hr/leave-balance", CalendarCheck),
        ],
      ),
      branch(
        "people.organization",
        "organization",
        "Organization",
        Network,
        [
          leaf("people.orgChart", "orgChart", "Org chart", "/hr/org-chart", Network),
          leaf("people.orgStructure", "orgStructure", "Org structure", "/hr/org-structure", LayoutGrid),
          leaf("people.departments", "departments", "Departments", "/hr/departments", Building2),
        ],
      ),
      branch(
        "people.hrInsights",
        "hrInsights",
        "HR insights",
        Activity,
        [
          leaf("people.workforceIntelligence", "workforceIntelligence", "Workforce intelligence", "/hr/workforce-intelligence", Activity),
          leaf("people.hrOperationsHealth", "hrOperationsHealth", "HR operations health", "/hr/executive-dashboard", Globe),
          leaf("people.kpiPerformance", "kpiPerformance", "KPIs & performance", "/hr/kpi", Target),
          leaf("people.performanceGrowth", "performanceGrowth", "Performance & growth", "/hr/performance", Sparkles),
        ],
      ),
      leaf("people.payroll", "payrollEngine", "Payroll", "/payroll", Banknote),
      leaf("people.tasks", "taskManager", "Task manager", "/hr/tasks", ListTodo),
      leaf("people.recruitment", "recruitment", "Recruitment", "/hr/recruitment", BookOpen),
      leaf("people.announcements", "announcements", "Announcements", "/hr/announcements", Megaphone),
      leaf("people.profileCompleteness", "profileCompleteness", "Profile completeness", "/hr/completeness", UserCheck),
      leaf("people.financeOverview", "financeOverview", "Finance overview", "/finance/overview", TrendingDown),
      branch(
        "people.hrDocs",
        "hrDocumentsGroup",
        "HR documents & requests",
        FileText,
        [
          leaf("people.hrDocuments", "hrDocuments", "HR documents", "/hr/documents-dashboard", FileText),
          leaf("people.hrLetters", "hrLetters", "HR letters", "/hr/letters", Mail),
          leaf("people.employeeRequests", "employeeRequests", "Employee requests", "/hr/employee-requests", ClipboardList),
          leaf("people.promoterAgreements", "promoterAgreements", "Promoter agreements", "/hr/contracts", UserSquare2),
        ],
      ),
    ],
  },
  {
    id: "operations",
    labelKey: "operations",
    defaultGroupLabel: "Operations",
    items: [
      leaf("ops.companyHub", "companyHub", "Company hub", "/company/hub", Building2),
      leaf("ops.crm", "crm", "CRM", "/crm", Users),
      leaf("ops.quotations", "quotations", "Quotations", "/quotations", Target),
      leaf("ops.contracts", "contracts", "Contracts", "/contracts", FileText),
    ],
  },
  {
    id: "marketplaceSection",
    labelKey: "marketplaceSection",
    defaultGroupLabel: "Marketplace",
    items: [
      leaf("mp.service", "serviceMarketplace", "Service marketplace", "/marketplace", ShoppingBag),
      leaf("mp.sanad", "sanadMarketplace", "Sanad marketplace", "/sanad/marketplace", Store),
    ],
  },
  {
    id: "compliance",
    labelKey: "compliance",
    defaultGroupLabel: "Compliance",
    items: [
      branch(
        "compliance.renewals",
        "renewalsExpiry",
        "Renewals & expiry",
        Bell,
        [
          leaf("compliance.expiryAlerts", "expiryAlerts", "Expiry alerts", "/alerts", Bell),
          leaf("compliance.expiryDashboard", "expiryDashboard", "Expiry dashboard", "/hr/expiry-dashboard", AlertTriangle),
          leaf("compliance.renewalWorkflows", "renewalWorkflows", "Renewal workflows", "/renewal-workflows", Zap),
          leaf("compliance.subscriptions", "subscriptions", "Subscriptions", "/subscriptions", Zap),
        ],
      ),
      leaf("compliance.workPermits", "workPermits", "Work permits", "/workforce/permits", Shield),
      leaf("compliance.governmentCases", "governmentCases", "Government cases", "/workforce/cases", ClipboardCheck),
      leaf("compliance.portalSync", "portalSync", "Portal sync", "/workforce/sync", RefreshCw),
      leaf("compliance.workforceDashboard", "workforceDashboard", "Workforce overview", "/workforce", BarChart3),
      leaf("compliance.workforceEmployees", "workforceEmployees", "Workforce employees", "/workforce/employees", Briefcase),
      leaf("compliance.profileRequests", "profileChangeRequests", "Profile change requests", "/workforce/profile-change-requests", ClipboardList),
      leaf("compliance.complianceVault", "complianceVault", "Compliance vault", "/workforce/documents", FolderOpen),
    ],
  },
  {
    id: "access",
    labelKey: "access",
    defaultGroupLabel: "Access",
    items: [
      leaf("access.companyRoles", "companyRolesPermissions", "Company roles & permissions", "/company/team-access", UserCheck),
      leaf("access.crossCompany", "crossCompanyAccess", "Cross-company access", "/company/multi-company-roles", ShieldCheck),
      leaf("access.platformAccess", "platformAccessControl", "Platform access control", "/user-roles", ShieldCheck),
    ],
  },
  {
    id: "sharedOmaniPro",
    labelKey: "sharedOmaniPro",
    defaultGroupLabel: "Shared Omani PRO",
    items: [
      leaf("sop.officers", "officerRegistry", "Officer registry", "/omani-officers", UserCheck),
      leaf("sop.assignments", "assignments", "Assignments", "/officer-assignments", Building2),
      leaf("sop.billing", "billingEngine", "Billing engine", "/billing", CreditCard),
      leaf("sop.sla", "slaManagement", "SLA management", "/sla-management", Shield),
    ],
  },
  {
    id: "platform",
    labelKey: "platform",
    defaultGroupLabel: "Platform",
    items: [
      leaf("plat.clientPortal", "clientPortal", "Client portal", "/client-portal", UserCircle),
      leaf("plat.platformOps", "platformOpsLabel", "Platform operations", "/platform-ops", Globe),
      leaf("plat.pdfReports", "pdfReports", "PDF reports", "/reports", BarChart2),
      leaf("plat.auditLog", "auditLog", "Audit log", "/audit-log", Shield),
      leaf("plat.adminPanel", "adminPanel", "Admin panel", "/admin", Settings),
      leaf("plat.sanadIntelligence", "sanadIntelligence", "SANAD intelligence", "/admin/sanad", Network),
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

function subtreeContainsActive(item: NavItemDef, location: string): boolean {
  if (item.kind === "leaf") return isLeafActive(item.href, location);
  return item.children.some((c) => subtreeContainsActive(c, location));
}

export function branchShouldShowOpen(item: NavBranchDef, location: string): boolean {
  return subtreeContainsActive(item, location);
}

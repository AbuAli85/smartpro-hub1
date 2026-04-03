import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  seesPlatformOperatorNav,
  isCompanyOwnerNav,
  seesLeadershipCompanyNav,
  isPortalClientNav,
} from "@/lib/navVisibility";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  BarChart2,
  Bell,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  RefreshCw,
  Settings,
  Shield,
  ShoppingBag,
  Smartphone,
  Star,
  Target,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoleKey = "owner" | "member" | "finance" | "hr" | "client";

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  roles: RoleKey[]; // which roles see this section
}

// ─── Sections definition ──────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  { id: "your-role",      title: "Understanding Your Role",        icon: <Shield size={16} />,        roles: ["owner","member","finance","hr","client"] },
  { id: "signin",         title: "Signing In & the Dashboard",     icon: <LayoutDashboard size={16} />, roles: ["owner","member","finance","hr","client"] },
  { id: "sidebar",        title: "Navigating the Sidebar",         icon: <ChevronRight size={16} />,  roles: ["owner","member","finance","hr","client"] },
  { id: "hub",            title: "Company Hub — Your Launchpad",   icon: <Building2 size={16} />,     roles: ["owner","member","finance","hr","client"] },
  { id: "owner",          title: "Company Owner Walkthrough",      icon: <Star size={16} />,          roles: ["owner"] },
  { id: "member",         title: "Team Member Walkthrough",        icon: <Users size={16} />,         roles: ["member","finance","hr"] },
  { id: "finance",        title: "Finance Admin Walkthrough",      icon: <Wallet size={16} />,        roles: ["finance"] },
  { id: "hr",             title: "HR Admin Walkthrough",           icon: <Briefcase size={16} />,     roles: ["hr"] },
  { id: "client",         title: "Client Portal Walkthrough",      icon: <Globe size={16} />,         roles: ["client"] },
  { id: "alerts",         title: "Expiry Alerts",                  icon: <Bell size={16} />,          roles: ["owner","member","finance","hr","client"] },
  { id: "preferences",    title: "Personalising Your Navigation",  icon: <Settings size={16} />,      roles: ["owner","member","finance","hr"] },
  { id: "mobile",         title: "Mobile Access",                  icon: <Smartphone size={16} />,    roles: ["owner","member","finance","hr","client"] },
  { id: "help",           title: "Getting Help",                   icon: <HelpCircle size={16} />,    roles: ["owner","member","finance","hr","client"] },
];

const STORAGE_KEY = "smartpro-onboarding-read";

function getReadSections(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function saveReadSections(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ id, title, icon, isRead, onToggle }: {
  id: string; title: string; icon: React.ReactNode;
  isRead: boolean; onToggle: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[var(--smartpro-orange)]">{icon}</span>
        <h2 id={id} className="text-xl font-semibold scroll-mt-24">{title}</h2>
      </div>
      <button
        aria-label={isRead ? `Mark "${title}" as unread` : `Mark "${title}" as read`}
        onClick={() => onToggle(id)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isRead
          ? <><CheckCircle2 size={15} className="text-green-500" /> Done</>
          : <><Circle size={15} /> Mark done</>}
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-[var(--smartpro-orange)]/15 text-[var(--smartpro-orange)] text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="flex-1 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200 leading-relaxed">
      {children}
    </div>
  );
}

function ModuleTag({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href}>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-xs font-medium transition-colors cursor-pointer">
        <span className="text-[var(--smartpro-orange)]">{icon}</span>
        {label}
      </span>
    </Link>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingGuidePage() {
  const { activeCompanyId } = useActiveCompany();
  const { user } = useAuth();
  const { data: myCompany } = trpc.companies.myCompany.useQuery({ companyId: activeCompanyId ?? undefined });

  const [readSections, setReadSections] = useState<Set<string>>(getReadSections);

  useEffect(() => { saveReadSections(readSections); }, [readSections]);

  const toggleRead = (id: string) => {
    setReadSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Determine role
  const isPlatform = seesPlatformOperatorNav(user);
  const isOwner    = isCompanyOwnerNav(user);
  const isFinance  = user?.platformRole === "finance_admin";
  const isHR       = user?.platformRole === "hr_admin";
  const isClient   = isPortalClientNav(user) && !myCompany?.company?.id;

  const roleKey: RoleKey = isPlatform || isOwner ? "owner"
    : isFinance ? "finance"
    : isHR      ? "hr"
    : isClient  ? "client"
    : "member";

  const roleBadge = isPlatform ? "Platform" : isOwner ? "Owner" : isFinance ? "Finance" : isHR ? "HR Admin" : isClient ? "Client Access" : "Team";
  const roleBadgeColor = isPlatform ? "bg-purple-500/20 text-purple-300" : isOwner ? "bg-[var(--smartpro-orange)]/20 text-[var(--smartpro-orange)]" : isFinance ? "bg-blue-500/20 text-blue-300" : isHR ? "bg-teal-500/20 text-teal-300" : isClient ? "bg-gray-500/20 text-gray-300" : "bg-green-500/20 text-green-300";

  const visibleSections = SECTIONS.filter(s => s.roles.includes(roleKey));
  const readCount = visibleSections.filter(s => readSections.has(s.id)).length;
  const progress = visibleSections.length > 0 ? Math.round((readCount / visibleSections.length) * 100) : 0;

  return (
    <div id="main-content" className="flex gap-6 max-w-6xl mx-auto px-4 py-8">

      {/* ── Sticky Table of Contents ── */}
      <aside className="hidden xl:block w-56 shrink-0">
        <div className="sticky top-24 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-2">On this page</p>
          {visibleSections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {readSections.has(s.id)
                ? <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                : <Circle size={12} className="shrink-0" />}
              {s.title}
            </a>
          ))}
          <Separator className="my-3" />
          <div className="px-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progress</span>
              <span>{readCount}/{visibleSections.length}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
            {progress === 100 && (
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                <CheckCircle2 size={12} /> All done!
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 space-y-10">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">Onboarding Guide</h1>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleBadgeColor}`}>
              {roleBadge}
            </span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            Welcome to SmartPRO Hub — the unified business services platform for Omani companies.
            This guide is personalised for your <strong>{roleBadge}</strong> role and walks you through
            every module you have access to. Mark sections as done as you go.
          </p>
          {/* Mobile progress */}
          <div className="xl:hidden mt-4 flex items-center gap-3">
            <Progress value={progress} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground shrink-0">{readCount}/{visibleSections.length} sections</span>
          </div>
        </div>

        {/* ── Section 1: Your Role ── */}
        <section>
          <SectionHeader id="your-role" title="Understanding Your Role" icon={<Shield size={16} />} isRead={readSections.has("your-role")} onToggle={toggleRead} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            SmartPRO Hub uses a role-based navigation system. Your role determines which modules appear in your sidebar
            and what actions you can perform. The platform sets this automatically when your company administrator invites you —
            you do not need to configure anything.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Badge</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">What you can access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { role: "Company Owner", badge: "Owner", access: "All company modules + Company Admin + Renewal Workflows + Payroll + Reports", highlight: roleKey === "owner" },
                  { role: "Team Member", badge: "Team", access: "Core modules: Dashboard, Operations, PRO Services, Contracts, CRM, HR, Workforce Hub, Marketplace", highlight: roleKey === "member" },
                  { role: "Finance Admin", badge: "Finance", access: "All team modules + Payroll Engine + PDF Reports", highlight: roleKey === "finance" },
                  { role: "HR Admin", badge: "HR Admin", access: "All team modules + Payroll Engine + PDF Reports", highlight: roleKey === "hr" },
                  { role: "Client / Portal", badge: "Client Access", access: "Dashboard, Client Portal, Contracts, Expiry Alerts, Company Hub, Preferences", highlight: roleKey === "client" },
                ].map(row => (
                  <tr key={row.role} className={row.highlight ? "bg-[var(--smartpro-orange)]/5" : ""}>
                    <td className="px-4 py-2.5 font-medium">{row.role} {row.highlight && <span className="ml-1 text-[10px] text-[var(--smartpro-orange)] font-bold uppercase">← you</span>}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="text-xs">{row.badge}</Badge></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.access}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <InfoBox>
            Hiding a module from your sidebar (via Preferences) does not delete any data — it simply keeps your workspace focused.
            You can re-enable any optional module at any time.
          </InfoBox>
        </section>

        {/* ── Section 2: Signing In ── */}
        <section>
          <SectionHeader id="signin" title="Signing In & the Dashboard" icon={<LayoutDashboard size={16} />} isRead={readSections.has("signin")} onToggle={toggleRead} />
          <Step n={1}><strong>Sign in.</strong> Navigate to your SmartPRO Hub URL and click <em>Sign in to SmartPRO</em>. You will be redirected to the Manus OAuth login page. Use the credentials provided by your company administrator.</Step>
          <Step n={2}><strong>Land on the Dashboard.</strong> After signing in you arrive at the <ModuleTag href="/dashboard" label="Dashboard" icon={<LayoutDashboard size={12} />} />. It shows a personalised greeting, KPI cards (active employees, open contracts, pending PRO services, compliance status), Quick Access tiles, a Compliance Status panel, and an Operations Centre summary.</Step>
          <Step n={3}><strong>Check the notification bell.</strong> The bell icon (top-right) shows unread alerts: expiring permits, pending contract signatures, and leave requests awaiting approval.</Step>
        </section>

        {/* ── Section 3: Sidebar ── */}
        <section>
          <SectionHeader id="sidebar" title="Navigating the Sidebar" icon={<ChevronRight size={16} />} isRead={readSections.has("sidebar")} onToggle={toggleRead} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The sidebar on the left is your primary navigation tool. It is divided into labelled sections that group related modules together.
            Not all sections are visible to every role — items that do not apply to your role are hidden automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { section: "Overview", items: "Dashboard, Operations Centre, Analytics, Compliance", icon: <LayoutDashboard size={15} /> },
              { section: "Government Services", items: "Sanad Offices, PRO Services, Sanad Marketplace", icon: <Globe size={15} /> },
              { section: "Business", items: "Company Hub, Quotations, Contracts, Marketplace, CRM", icon: <Briefcase size={15} /> },
              { section: "Human Resources", items: "Employees, Recruitment, Leave & Payroll, Payroll Engine, Attendance", icon: <Users size={15} /> },
              { section: "Workforce Hub", items: "WF Dashboard, WF Employees, Work Permits, Gov. Cases, Document Vault, Portal Sync", icon: <Shield size={15} /> },
              { section: "Your Company", items: "Company Admin, Client Portal, Subscriptions, Expiry Alerts, Renewal Workflows, PDF Reports", icon: <Building2 size={15} /> },
            ].map(row => (
              <Card key={row.section} className="bg-muted/30">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-[var(--smartpro-orange)]">{row.icon}</span>
                    {row.section}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-xs text-muted-foreground">{row.items}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            On <strong>desktop</strong>, the sidebar is always visible. On <strong>mobile</strong>, tap the ☰ menu (top-left) to open it, or use the bottom navigation bar.
          </p>
        </section>

        {/* ── Section 4: Company Hub ── */}
        <section>
          <SectionHeader id="hub" title="Company Hub — Your Launchpad" icon={<Building2 size={16} />} isRead={readSections.has("hub")} onToggle={toggleRead} />
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The <ModuleTag href="/company/hub" label="Company Hub" icon={<Building2 size={12} />} /> is the best starting point for any new member.
            It presents your company's modules as a department-by-department launchpad, making it easy to understand what the platform does and where each function lives.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { dept: "Sales & BD", href: "/crm", icon: <Target size={14} /> },
              { dept: "Marketing", href: "/analytics", icon: <Megaphone size={14} /> },
              { dept: "Operations", href: "/operations", icon: <LayoutDashboard size={14} /> },
              { dept: "Finance", href: "/billing", icon: <Wallet size={14} /> },
              { dept: "HR", href: "/hr/employees", icon: <Users size={14} /> },
              { dept: "Legal", href: "/contracts", icon: <FileText size={14} /> },
              { dept: "Government", href: "/pro", icon: <Shield size={14} /> },
              { dept: "Workforce", href: "/workforce", icon: <Briefcase size={14} /> },
            ].map(d => (
              <Link key={d.dept} href={d.href}>
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer">
                  <span className="text-[var(--smartpro-orange)]">{d.icon}</span>
                  <span className="text-xs font-medium">{d.dept}</span>
                  <ChevronRight size={10} className="ml-auto text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Section 5a: Owner Walkthrough ── */}
        {visibleSections.some(s => s.id === "owner") && (
          <section>
            <SectionHeader id="owner" title="Company Owner Walkthrough" icon={<Star size={16} />} isRead={readSections.has("owner")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">As a company owner, you have the broadest access on the platform. Your first-day checklist:</p>
            <Step n={1}><strong>Complete your company profile.</strong> Go to <ModuleTag href="/company-admin" label="Company Admin" icon={<Building2 size={12} />} />. Fill in your trade licence number, CR number, registered address, and authorised signatory. This information is used automatically on contracts, WPS files, and government submissions.</Step>
            <Step n={2}><strong>Invite your team.</strong> Inside Company Admin, open the <em>Members</em> tab. Click <em>Invite Member</em>, enter the email address, and choose a role. The invited user receives an email with a sign-in link.</Step>
            <Step n={3}><strong>Set up renewal workflows.</strong> Go to <ModuleTag href="/renewal-workflows" label="Renewal Workflows" icon={<Zap size={12} />} />. Configure automated reminders for visa renewals, work permit renewals, and contract expiry with lead times (e.g., 60 days, 30 days, 7 days before expiry).</Step>
            <Step n={4}><strong>Review your subscription.</strong> Go to <ModuleTag href="/subscriptions" label="Subscriptions" icon={<Zap size={12} />} /> to confirm your current plan (Basic / Professional / Enterprise) and the features it includes.</Step>
            <Step n={5}><strong>Explore the Operations Centre.</strong> Go to <ModuleTag href="/operations" label="Operations Centre" icon={<LayoutDashboard size={12} />} />. This is your daily command view: cases due today, SLA breaches, officer workload, and AI-generated operational insights.</Step>
          </section>
        )}

        {/* ── Section 5b: Team Member Walkthrough ── */}
        {visibleSections.some(s => s.id === "member") && (
          <section>
            <SectionHeader id="member" title="Team Member Walkthrough" icon={<Users size={16} />} isRead={readSections.has("member")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">Your day-to-day work centres on four areas: PRO services, contracts, CRM, and HR.</p>

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Shield size={14} className="text-[var(--smartpro-orange)]" /> PRO Services</h3>
            <p className="text-sm text-muted-foreground mb-3">Manage government service requests — visa applications, work permits, labour cards, and MHRSD filings.</p>
            <Step n={1}>Click <strong>New PRO Case</strong> (top-right of the <ModuleTag href="/pro" label="PRO Services" icon={<Shield size={12} />} /> page).</Step>
            <Step n={2}>Select the service type (e.g., New Work Permit, Visa Renewal, Labour Card) and fill in employee details.</Step>
            <Step n={3}>Attach required documents and submit. The case appears in the list with status <em>Draft</em>.</Step>
            <Step n={4}>Click any case row to open the detail panel — it shows the full timeline, document checklist, fee breakdown, and a "Next Action" prompt.</Step>

            <Separator className="my-4" />

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><FileText size={14} className="text-[var(--smartpro-orange)]" /> Contracts</h3>
            <Step n={1}>Click <strong>New Contract</strong> in <ModuleTag href="/contracts" label="Contracts" icon={<FileText size={12} />} />.</Step>
            <Step n={2}>Choose a template or use <strong>AI Draft</strong> to generate a first draft from a prompt.</Step>
            <Step n={3}>Add signatories and send for e-signature. Track signing status in the contract list.</Step>
            <Step n={4}>Watch the <em>Expiring in 30 days</em> KPI card at the top — it alerts you to contracts that need renewal.</Step>

            <Separator className="my-4" />

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Users size={14} className="text-[var(--smartpro-orange)]" /> CRM</h3>
            <Step n={1}>Add key contacts via <strong>New Contact</strong> in <ModuleTag href="/crm" label="CRM" icon={<Users size={12} />} />.</Step>
            <Step n={2}>Create a deal in the <em>Deals</em> tab and assign it to a pipeline stage.</Step>
            <Step n={3}>Log calls, emails, and meetings in the <em>Communications</em> tab of any contact's detail panel.</Step>
            <Step n={4}>Monitor the pipeline KPI bar at the top — it shows total deal value by stage in OMR.</Step>
          </section>
        )}

        {/* ── Section 5c: Finance Admin Walkthrough ── */}
        {visibleSections.some(s => s.id === "finance") && (
          <section>
            <SectionHeader id="finance" title="Finance Admin Walkthrough" icon={<Wallet size={16} />} isRead={readSections.has("finance")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">In addition to everything a team member can access, you have two additional modules: Payroll Engine and PDF Reports.</p>

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><CreditCard size={14} className="text-[var(--smartpro-orange)]" /> Payroll Engine</h3>
            <Step n={1}>Go to <ModuleTag href="/payroll" label="Payroll Engine" icon={<CreditCard size={12} />} /> and click <strong>New Run</strong>. Select the pay period — the system pulls in all active employees with their salary configurations.</Step>
            <Step n={2}>Review line items — gross pay, PASI deductions, loans, and net pay are calculated automatically. Edit any line item if needed.</Step>
            <Step n={3}>Click <strong>Approve</strong> to lock the figures, then <strong>Mark Paid</strong> after the bank transfer.</Step>
            <Step n={4}>Click <strong>WPS Export</strong> to download the Wage Protection System file for submission to the Ministry of Labour.</Step>
            <Step n={5}>Click any employee row to view and download their individual payslip (stored as an HTML document in S3).</Step>

            <Separator className="my-4" />

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><BarChart2 size={14} className="text-[var(--smartpro-orange)]" /> PDF Reports</h3>
            <p className="text-sm text-muted-foreground mb-2">Generate scheduled or on-demand reports across all modules. Use the <strong>Custom Report Builder</strong> (3-step wizard: choose module → select fields → choose chart type), then export as JSON or schedule delivery by email.</p>
          </section>
        )}

        {/* ── Section 5d: HR Admin Walkthrough ── */}
        {visibleSections.some(s => s.id === "hr") && (
          <section>
            <SectionHeader id="hr" title="HR Admin Walkthrough" icon={<Briefcase size={16} />} isRead={readSections.has("hr")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">In addition to team member access, you have Payroll Engine and PDF Reports. Your primary focus areas are:</p>

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Users size={14} className="text-[var(--smartpro-orange)]" /> Employees</h3>
            <Step n={1}>Go to <ModuleTag href="/hr/employees" label="Employees" icon={<Users size={12} />} /> and click <strong>Add Employee</strong>. Fill in personal details, civil ID, passport number, and salary information.</Step>
            <Step n={2}>Click any employee row to open the detail panel — it shows document expiry countdowns, leave balance, and payslips.</Step>
            <Step n={3}>Monitor the Omanisation gauge on the HR page — it shows your company's current ratio against the required quota.</Step>

            <Separator className="my-4" />

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Clock size={14} className="text-[var(--smartpro-orange)]" /> Leave & Attendance</h3>
            <Step n={1}>Review and approve leave requests in <ModuleTag href="/hr/leave" label="Leave & Payroll" icon={<Clock size={12} />} />. Pending requests appear at the top.</Step>
            <Step n={2}>Log and review daily attendance in <ModuleTag href="/hr/attendance" label="Attendance" icon={<Clock size={12} />} />. The weekly chart shows attendance patterns across the team.</Step>

            <Separator className="my-4" />

            <h3 className="text-base font-semibold mb-2 flex items-center gap-2"><Shield size={14} className="text-[var(--smartpro-orange)]" /> Workforce Hub</h3>
            <p className="text-sm text-muted-foreground mb-2">The Workforce Hub is the government-compliance layer of HR, connecting to MOL (Ministry of Labour) data.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: "Work Permits", href: "/workforce/permits", desc: "View all permits with expiry dates, occupation codes, and renewal status.", icon: <Shield size={13} /> },
                { label: "Gov. Cases", href: "/workforce/cases", desc: "Submit and track government service cases (new permits, transfers, cancellations).", icon: <Briefcase size={13} /> },
                { label: "Document Vault", href: "/workforce/documents", desc: "Upload and verify employee documents with S3 storage.", icon: <FolderOpen size={13} /> },
                { label: "Portal Sync", href: "/workforce/sync", desc: "Trigger a sync with the MOL portal to refresh permit data.", icon: <RefreshCw size={13} /> },
              ].map(item => (
                <Link key={item.label} href={item.href}>
                  <Card className="bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer h-full">
                    <CardContent className="p-3 flex gap-2">
                      <span className="text-[var(--smartpro-orange)] mt-0.5 shrink-0">{item.icon}</span>
                      <div>
                        <p className="text-xs font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Section 5e: Client Portal Walkthrough ── */}
        {visibleSections.some(s => s.id === "client") && (
          <section>
            <SectionHeader id="client" title="Client Portal Walkthrough" icon={<Globe size={16} />} isRead={readSections.has("client")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">
              Your portal gives you a clear view of all services SmartPRO manages on your behalf — without exposing internal company tools.
            </p>
            <Step n={1}>Go to <ModuleTag href="/client-portal" label="Client Portal" icon={<Globe size={12} />} />. You will see: active contracts, PRO service status, pending invoices, and expiring permits.</Step>
            <Step n={2}>Open <ModuleTag href="/contracts" label="Contracts" icon={<FileText size={12} />} /> to view contracts shared with you, check signing status, and download executed copies.</Step>
            <Step n={3}>Check <ModuleTag href="/alerts" label="Expiry Alerts" icon={<Bell size={12} />} /> for a consolidated list of all upcoming expiry dates — permits, contracts, and subscriptions.</Step>
          </section>
        )}

        {/* ── Section 6: Expiry Alerts ── */}
        <section>
          <SectionHeader id="alerts" title="Expiry Alerts — Never Miss a Deadline" icon={<Bell size={16} />} isRead={readSections.has("alerts")} onToggle={toggleRead} />
          <p className="text-sm text-muted-foreground mb-4">
            The <ModuleTag href="/alerts" label="Expiry Alerts" icon={<Bell size={12} />} /> page is available to all roles and aggregates expiry dates from every module.
            Alerts are colour-coded: <span className="text-red-400 font-medium">red</span> for overdue or expiring within 7 days,
            <span className="text-amber-400 font-medium"> amber</span> for within 30 days,
            <span className="text-green-400 font-medium"> green</span> for within 60 days.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium">Alert type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Source module</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Default lead time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {[
                  ["Work permit expiry", "Workforce Hub", "60 days"],
                  ["Residence visa expiry", "PRO Services", "60 days"],
                  ["Contract expiry", "Contracts", "30 days"],
                  ["Subscription renewal", "Subscriptions", "30 days"],
                  ["Employee document expiry", "HR / Document Vault", "30 days"],
                ].map(([type, source, lead]) => (
                  <tr key={type}>
                    <td className="px-4 py-2.5">{type}</td>
                    <td className="px-4 py-2.5">{source}</td>
                    <td className="px-4 py-2.5">{lead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(roleKey === "owner") && (
            <InfoBox>
              As a company owner, you can configure lead times and notification recipients in{" "}
              <Link href="/renewal-workflows" className="underline underline-offset-2 font-medium">Renewal Workflows</Link>.
            </InfoBox>
          )}
        </section>

        {/* ── Section 7: Preferences ── */}
        {visibleSections.some(s => s.id === "preferences") && (
          <section>
            <SectionHeader id="preferences" title="Personalising Your Navigation" icon={<Settings size={16} />} isRead={readSections.has("preferences")} onToggle={toggleRead} />
            <p className="text-sm text-muted-foreground mb-4">
              If you work primarily in one or two areas, you can hide optional modules to keep the sidebar focused.
            </p>
            <Step n={1}>Go to <ModuleTag href="/preferences" label="Navigation Preferences" icon={<Settings size={12} />} /> (also accessible via the link in the sidebar footer).</Step>
            <Step n={2}>Toggle any of the five optional modules off: <strong>Analytics, Compliance, Marketplace, Recruitment, Quotations</strong>. The module disappears from the sidebar immediately.</Step>
            <Step n={3}>Your preference is saved in your browser and persists across sessions. To restore a hidden module, return to Preferences and toggle it back on.</Step>
            <InfoBox>
              Only optional modules can be toggled. Core modules (Dashboard, PRO Services, Contracts, HR, Workforce Hub) are always visible and cannot be hidden.
            </InfoBox>
          </section>
        )}

        {/* ── Section 8: Mobile ── */}
        <section>
          <SectionHeader id="mobile" title="Mobile Access" icon={<Smartphone size={16} />} isRead={readSections.has("mobile")} onToggle={toggleRead} />
          <p className="text-sm text-muted-foreground mb-4">
            SmartPRO Hub is fully responsive. On mobile devices, the interface adapts automatically.
            The sidebar collapses — tap the <strong>☰ menu</strong> (top-left) to open it.
            A <strong>bottom navigation bar</strong> provides quick access to your five most-used destinations, tailored to your role.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium">Your role</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Bottom tabs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                <tr className={roleKey === "owner" ? "bg-[var(--smartpro-orange)]/5" : ""}><td className="px-4 py-2.5">Platform staff / Owner</td><td className="px-4 py-2.5">Home · Alerts · Contracts · HR · CRM</td></tr>
                <tr className={["member","finance","hr"].includes(roleKey) ? "bg-[var(--smartpro-orange)]/5" : ""}><td className="px-4 py-2.5">Company member / HR / Finance</td><td className="px-4 py-2.5">Home · Alerts · Operations · Hub · HR</td></tr>
                <tr className={roleKey === "client" ? "bg-[var(--smartpro-orange)]/5" : ""}><td className="px-4 py-2.5">Portal client</td><td className="px-4 py-2.5">Home · Alerts · Portal · Contracts · Hub</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            For document uploads, use your device's file picker. Supported formats: PDF, JPG, PNG, WebM, MP3 (max 16 MB).
          </p>
        </section>

        {/* ── Section 9: Help ── */}
        <section>
          <SectionHeader id="help" title="Getting Help" icon={<HelpCircle size={16} />} isRead={readSections.has("help")} onToggle={toggleRead} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-1 flex items-center gap-2"><HelpCircle size={14} className="text-[var(--smartpro-orange)]" /> In-platform help</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-2">
                  <li>The <Link href="/company/hub" className="underline underline-offset-2">Company Hub</Link> provides a department overview at any time.</li>
                  <li>Each module page has a KPI bar — hover over any metric for a tooltip.</li>
                  <li>Detail panels show a "Next Action" prompt for cases and PRO services.</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-1 flex items-center gap-2"><Megaphone size={14} className="text-[var(--smartpro-orange)]" /> Support contact</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 mt-2">
                  <li>Email: <strong>support@smartpro.om</strong></li>
                  <li>For urgent compliance matters, contact your assigned SmartPRO Client Services officer directly.</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-400" /> Common first-day questions</h3>
          <div className="space-y-3">
            {[
              {
                q: "I cannot see the Payroll module.",
                a: "Payroll is only visible to company_admin, finance_admin, and hr_admin roles. Ask your company owner to update your role if you need access.",
              },
              {
                q: "I cannot see the Company Admin settings.",
                a: "Company Admin is only visible to company_admin. It contains sensitive configuration — only the company owner has access.",
              },
              {
                q: "A module I need is missing from my sidebar.",
                a: "First check Navigation Preferences to ensure it has not been toggled off. If it is not listed there, it may require a higher role — contact your company owner.",
              },
              {
                q: "My document upload failed.",
                a: "Files must be under 16 MB. Supported formats are PDF, JPG, PNG, WebM, MP3, WAV, and M4A. Ensure you have a stable internet connection when uploading.",
              },
            ].map(item => (
              <div key={item.q} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium mb-1">{item.q}</p>
                <p className="text-xs text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Completion Banner ── */}
        {progress === 100 && (
          <Card className="border-green-500/30 bg-green-500/10">
            <CardContent className="p-5 flex items-center gap-4">
              <CheckCircle2 size={32} className="text-green-400 shrink-0" />
              <div>
                <p className="font-semibold text-green-300">You have completed the onboarding guide!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You are ready to use SmartPRO Hub. Start with the{" "}
                  <Link href="/company/hub" className="underline underline-offset-2 text-[var(--smartpro-orange)]">Company Hub</Link>{" "}
                  or head straight to your most-used module.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

      </main>
    </div>
  );
}

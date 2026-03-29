import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BarChart3,
  Briefcase, Building2, CheckCircle2, Clock, FileText,
  Shield, ShoppingBag, TrendingUp, Users, Banknote,
  Globe, Zap, RefreshCw, Award, MapPin, Calendar,
  ChevronRight, Activity, Bell,
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

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

/* ── Compliance Status Row ─────────────────────────────────────────────── */
function ComplianceRow({ label, status, pct }: { label: string; status: "ok" | "warn" | "critical"; pct: number }) {
  const colors = { ok: "bg-emerald-500", warn: "bg-amber-500", critical: "bg-red-500" };
  const labels = { ok: "Compliant", warn: "Review Needed", critical: "Action Required" };
  const textColors = { ok: "text-emerald-700 bg-emerald-50", warn: "text-amber-700 bg-amber-50", critical: "text-red-700 bg-red-50" };
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${textColors[status]}`}>{labels[status]}</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.companies.myStats.useQuery();
  const { data: myCompany } = trpc.companies.myCompany.useQuery();
  const { data: expiringDocs } = trpc.pro.expiringDocuments.useQuery({ daysAhead: 30 });
  const { data: platformStats } = trpc.analytics.platformStats.useQuery();
  const { data: alertBadge } = trpc.alerts.getAlertBadgeCount.useQuery();

  const isAdmin = user?.role === "admin";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-OM", {
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
          {alertBadge && alertBadge.critical > 0 && (
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
          {expiringDocs && expiringDocs.length > 0 && (
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

      {/* ── Admin Platform Stats ── */}
      {isAdmin && platformStats && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity size={13} /> Platform Overview
            </h2>
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Full Analytics <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Companies" value={platformStats.companies} icon={<Building2 size={20} />} gradient="stat-gradient-1" sub="Registered entities" />
            <StatCard title="Total Users" value={platformStats.users} icon={<Users size={20} />} gradient="stat-gradient-2" change="+12% MoM" />
            <StatCard title="Contracts" value={platformStats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub="Active agreements" />
            <StatCard title="PRO Services" value={platformStats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-4" sub="Managed documents" />
          </div>
        </div>
      )}

      {/* ── Company KPI Stats ── */}
      {!isAdmin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 size={13} /> Your Company Overview
            </h2>
            <Link href="/analytics">
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                Analytics <ArrowUpRight size={11} />
              </Button>
            </Link>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Employees" value={stats.employees} icon={<Users size={20} />} gradient="stat-gradient-1" sub="Active workforce" />
              <StatCard title="PRO Services" value={stats.proServices} icon={<Shield size={20} />} gradient="stat-gradient-2" sub="Managed documents" />
              <StatCard title="Contracts" value={stats.contracts} icon={<FileText size={20} />} gradient="stat-gradient-3" sub="Active agreements" />
              <StatCard title="CRM Contacts" value={stats.contacts} icon={<Users size={20} />} gradient="stat-gradient-4" sub="Clients & leads" />
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 size={32} className="mx-auto text-muted-foreground mb-3" />
                <h3 className="font-bold mb-1">No company linked</h3>
                <p className="text-sm text-muted-foreground mb-4">Create or join a company to access all features.</p>
                <Button asChild size="sm"><Link href="/admin">Set up company</Link></Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Module Quick Access — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Zap size={13} /> Quick Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModuleCard
              title="Sanad Office Management"
              description="Government service centres — applications, staff, and performance tracking"
              href="/sanad"
              icon={<Building2 size={18} />}
              count={stats?.sanadApplications}
              tag="Government"
              tagColor="module-chip-gov"
            />
            <ModuleCard
              title="PRO & Visa Services"
              description="Work permits, residence visas, labour cards, PASI, and MHRSD filings"
              href="/pro"
              icon={<Shield size={18} />}
              count={stats?.proServices}
              tag="Compliance"
              tagColor="module-chip-legal"
            />
            <ModuleCard
              title="HR & Workforce Hub"
              description="Employees, leave management, payroll, WPS, and Omanisation tracking"
              href="/hr/employees"
              icon={<Briefcase size={18} />}
              count={stats?.pendingLeave}
              tag="Human Resources"
              tagColor="module-chip-hr"
            />
            <ModuleCard
              title="Smart Contracts"
              description="Draft, negotiate, and digitally sign contracts with full audit trail"
              href="/contracts"
              icon={<FileText size={18} />}
              count={stats?.contracts}
              tag="Legal"
              tagColor="module-chip-legal"
            />
            <ModuleCard
              title="Service Marketplace"
              description="Connect with verified PRO service providers across Oman and GCC"
              href="/marketplace"
              icon={<ShoppingBag size={18} />}
              tag="Marketplace"
              tagColor="module-chip-biz"
            />
            <ModuleCard
              title="CRM & Pipeline"
              description="Manage clients, deals, and business development pipeline"
              href="/crm"
              icon={<Users size={18} />}
              count={stats?.deals}
              tag="Business"
              tagColor="module-chip-biz"
            />
            <ModuleCard
              title="Payroll Engine"
              description="WPS-compliant payroll, PASI deductions, salary loans, and payslips"
              href="/payroll"
              icon={<Banknote size={18} />}
              tag="Finance"
              tagColor="module-chip-fin"
            />
            <ModuleCard
              title="Expiry Alerts"
              description="Real-time alerts for visas, permits, contracts, and compliance deadlines"
              href="/alerts"
              icon={<Bell size={18} />}
              count={alertBadge?.count}
              tag="Compliance"
              tagColor="module-chip-legal"
            />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Compliance Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award size={15} className="text-[var(--smartpro-orange)]" />
                Compliance Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ComplianceRow label="PASI Contributions" status="ok" pct={98} />
              <ComplianceRow label="Work Permit Renewals" status={expiringDocs && expiringDocs.length > 3 ? "warn" : "ok"} pct={expiringDocs ? Math.max(40, 100 - expiringDocs.length * 8) : 92} />
              <ComplianceRow label="Omanisation Quota" status="ok" pct={85} />
              <ComplianceRow label="WPS Salary Transfers" status="ok" pct={100} />
              <ComplianceRow label="Labour Law Filings" status="ok" pct={94} />
              <div className="mt-3 pt-3 border-t border-border">
                <Link href="/reports">
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                    View Compliance Report <ArrowRight size={11} />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Expiring Documents */}
          {expiringDocs && expiringDocs.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                  <Clock size={15} className="text-amber-600" />
                  Expiring Documents
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
                        {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString("en-OM", { day: "numeric", month: "short" }) : "N/A"}
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe size={15} className="text-[var(--smartpro-teal)]" />
                Platform Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {[
                { href: "/renewal-workflows", icon: <RefreshCw size={13} />, label: "Renewal Workflows" },
                { href: "/billing", icon: <Banknote size={13} />, label: "Billing Engine" },
                { href: "/omani-officers", icon: <Users size={13} />, label: "Omani PRO Officers" },
                { href: "/workforce", icon: <BarChart3 size={13} />, label: "Workforce Dashboard" },
                { href: "/reports", icon: <FileText size={13} />, label: "PDF Reports" },
                { href: "/audit-log", icon: <Shield size={13} />, label: "Audit Log" },
              ].map((item) => (
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
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <Activity size={13} /> Recent Activity
          </h2>
          <Link href="/analytics">
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
              View all <ArrowUpRight size={11} />
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {[
                { icon: <CheckCircle2 size={14} className="text-emerald-600" />, bg: "bg-emerald-50", text: "SmartPRO platform is fully operational", time: "Now", sub: "All 12 modules active" },
                { icon: <Shield size={14} className="text-blue-600" />, bg: "bg-blue-50", text: "PASI compliance check completed", time: "Today", sub: "98.7% contribution rate" },
                { icon: <Building2 size={14} className="text-violet-600" />, bg: "bg-violet-50", text: "Sanad office management ready", time: "Today", sub: "Government services module" },
                { icon: <Globe size={14} className="text-teal-600" />, bg: "bg-teal-50", text: "GCC multi-region support enabled", time: "Today", sub: "Oman, UAE, KSA, Qatar, Bahrain" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/60 last:border-0">
                  <div className={`w-7 h-7 rounded-full ${item.bg} flex items-center justify-center shrink-0`}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{item.text}</div>
                    <div className="text-xs text-muted-foreground">{item.sub}</div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

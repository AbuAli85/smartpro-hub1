import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Building2,
  Users,
  DollarSign,
  MapPin,
  BarChart2,
  Globe,
  ShieldCheck,
  Activity,
  ArrowUpRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function omr(n: number) {
  return `OMR ${n.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

const CHART_COLORS = [
  "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#84cc16", "#ec4899", "#6366f1",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card className="border border-border/60">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent ?? "bg-primary/10"}`}>
            <Icon size={20} className={accent ? "text-white" : "text-primary"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Finance View ─────────────────────────────────────────────────────────────

function FinanceView() {
  const now = new Date();
  const [ebitdaYear, setEbitdaYear] = useState(now.getFullYear());
  const [ebitdaMonth, setEbitdaMonth] = useState(now.getMonth() + 1);

  const { data: summary, isLoading: summaryLoading } = trpc.platformOps.getPlatformSummary.useQuery();
  const { data: trend } = trpc.platformOps.getMonthlyRevenueTrend.useQuery({ months: 12 });
  const { data: sanadPayments } = trpc.platformOps.getSanadCentrePayments.useQuery();
  const { data: ebitda } = trpc.platformOps.getEBITDA.useQuery({ year: ebitdaYear, month: ebitdaMonth });
  const { data: topCompanies } = trpc.platformOps.getTopCompaniesByRevenue.useQuery({ limit: 10 });

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const trendReversed = [...(trend ?? [])].reverse();

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Revenue"
          value={omr(summary?.totalRevenueOmr ?? 0)}
          sub="All billing cycles"
          icon={DollarSign}
          accent="bg-[var(--smartpro-orange)]"
        />
        <KPICard
          title="Collected"
          value={omr(summary?.totalRevenuePaidOmr ?? 0)}
          sub="Paid invoices"
          icon={TrendingUp}
          accent="bg-emerald-500"
        />
        <KPICard
          title="Outstanding"
          value={omr(summary?.totalRevenuePendingOmr ?? 0)}
          sub="Pending invoices"
          icon={Activity}
          accent="bg-amber-500"
        />
        <KPICard
          title="Active Assignments"
          value={summary?.totalActiveAssignments ?? 0}
          sub={`${summary?.totalOfficers ?? 0} officers total`}
          icon={Users}
          accent="bg-blue-500"
        />
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 size={16} className="text-primary" />
            Monthly Revenue Trend (Last 12 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendReversed.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No billing data yet — generate monthly cycles to see revenue trends.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendReversed} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}`} />
                <Tooltip
                  formatter={(v: number, name: string) => [omr(v), name === "paidOmr" ? "Paid" : "Pending"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="paidOmr" name="Paid" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="pendingOmr" name="Pending" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* EBITDA + Sanad Payments row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* EBITDA Calculator */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              EBITDA Estimate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select value={String(ebitdaYear)} onValueChange={(v) => setEbitdaYear(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(ebitdaMonth)} onValueChange={(v) => setEbitdaMonth(Number(v))}>
                <SelectTrigger className="h-8 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: "Revenue", value: ebitda?.revenue ?? 0, color: "text-emerald-600" },
                { label: "Officer Payouts", value: -(ebitda?.payouts ?? 0), color: "text-red-500" },
                { label: "Est. Overhead (15%)", value: -(ebitda?.overhead ?? 0), color: "text-amber-500" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className={`font-medium ${row.color}`}>{omr(Math.abs(row.value))}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-1">
                <span className="font-semibold">EBITDA</span>
                <div className="text-right">
                  <span className={`font-bold text-base ${(ebitda?.ebitda ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {omr(ebitda?.ebitda ?? 0)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">({ebitda?.margin ?? 0}% margin)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sanad Centre Payments */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              Sanad Centre Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!sanadPayments || sanadPayments.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                No Sanad centres registered yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {sanadPayments.map((c) => (
                  <div key={c.officeId} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-xs font-medium">{c.officeName}</p>
                      <p className="text-xs text-muted-foreground">{c.governorate} · {c.officerCount} officer{c.officerCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-emerald-600">{omr(c.totalPaidOmr)}</p>
                      {c.totalPendingOmr > 0 && (
                        <p className="text-xs text-amber-500">{omr(c.totalPendingOmr)} pending</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Companies */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowUpRight size={16} className="text-primary" />
            Top Companies by Billing Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!topCompanies || topCompanies.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
              No billing data yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 text-muted-foreground font-medium">#</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Company</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Billed</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Paid</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Cycles</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompanies.map((c, i) => (
                    <tr key={c.companyId} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium">{c.companyName}</td>
                      <td className="py-2 text-right">{omr(c.totalBilledOmr)}</td>
                      <td className="py-2 text-right text-emerald-600">{omr(c.paidOmr)}</td>
                      <td className="py-2 text-right text-muted-foreground">{c.cycleCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Regional View ────────────────────────────────────────────────────────────

function RegionalView() {
  const { data: regional } = trpc.platformOps.getRegionalCapacity.useQuery();
  const { data: workOrders } = trpc.platformOps.getWorkOrderVolume.useQuery();
  const { data: summary } = trpc.platformOps.getPlatformSummary.useQuery();

  const totalCapacity = (regional ?? []).reduce((s, r) => s + r.maxCapacity, 0);
  const totalActive = (regional ?? []).reduce((s, r) => s + r.activeAssignments, 0);

  return (
    <div className="space-y-6">
      {/* Platform-wide capacity KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Sanad Centres"
          value={summary?.totalSanadCentres ?? 0}
          sub="Registered offices"
          icon={Building2}
          accent="bg-blue-500"
        />
        <KPICard
          title="Active Officers"
          value={summary?.totalOfficers ?? 0}
          sub="Across all governorates"
          icon={Users}
          accent="bg-[var(--smartpro-orange)]"
        />
        <KPICard
          title="Total Capacity"
          value={totalCapacity}
          sub="Max company slots"
          icon={ShieldCheck}
          accent="bg-emerald-500"
        />
        <KPICard
          title="Platform Utilisation"
          value={`${summary?.avgOfficerUtilisation ?? 0}%`}
          sub="Active / max capacity"
          icon={Activity}
          accent="bg-purple-500"
        />
      </div>

      {/* Capacity by Governorate */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            Officer Capacity by Governorate
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!regional || regional.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No Sanad offices with governorate data yet. Add governorate to Sanad offices to see regional breakdown.
            </div>
          ) : (
            <div className="space-y-3">
              {regional.map((r) => (
                <div key={r.governorate} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium flex items-center gap-1.5">
                      <MapPin size={11} className="text-muted-foreground" />
                      {r.governorate}
                    </span>
                    <span className="text-muted-foreground">
                      {r.activeAssignments}/{r.maxCapacity} slots · {r.officerCount} officer{r.officerCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        r.utilisationPct >= 90 ? "bg-red-500" :
                        r.utilisationPct >= 70 ? "bg-amber-500" :
                        "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, r.utilisationPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{r.utilisationPct}% utilised</span>
                    <span>{r.availableSlots} slot{r.availableSlots !== 1 ? "s" : ""} available</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capacity chart + Work order breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Capacity bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart2 size={16} className="text-primary" />
              Capacity vs. Active Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!regional || regional.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={regional} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="governorate" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="maxCapacity" name="Max Capacity" fill="#e2e8f0" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="activeAssignments" name="Active" fill="#f97316" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Work order pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe size={16} className="text-primary" />
              Work Orders by Service Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!workOrders || workOrders.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No work order data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={workOrders}
                    dataKey="count"
                    nameKey="serviceType"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ serviceType, percent }) => `${serviceType} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {workOrders.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── User Stats View ──────────────────────────────────────────────────────────

function UsersView() {
  const { data: userStats } = trpc.platformOps.getUserStats.useQuery();

  const roleColors: Record<string, string> = {
    super_admin: "bg-red-100 text-red-700 border-red-200",
    platform_admin: "bg-orange-100 text-orange-700 border-orange-200",
    company_admin: "bg-blue-100 text-blue-700 border-blue-200",
    company_member: "bg-sky-100 text-sky-700 border-sky-200",
    reviewer: "bg-purple-100 text-purple-700 border-purple-200",
    client: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard
          title="Total Users"
          value={userStats?.total ?? 0}
          sub="All platform users"
          icon={Users}
          accent="bg-blue-500"
        />
        <KPICard
          title="Admin Users"
          value={(userStats?.byRole ?? []).filter((r) => r.role === "super_admin" || r.role === "platform_admin").reduce((s, r) => s + r.count, 0)}
          sub="super_admin + platform_admin"
          icon={ShieldCheck}
          accent="bg-red-500"
        />
        <KPICard
          title="Company Users"
          value={(userStats?.byRole ?? []).filter((r) => r.role === "company_admin" || r.role === "company_member").reduce((s, r) => s + r.count, 0)}
          sub="company_admin + company_member"
          icon={Building2}
          accent="bg-emerald-500"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users size={16} className="text-primary" />
            Users by Platform Role
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!userStats || userStats.byRole.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">No user data.</div>
          ) : (
            <div className="space-y-3">
              {userStats.byRole.map((r) => (
                <div key={r.role} className="flex items-center justify-between">
                  <Badge variant="outline" className={`text-xs font-medium ${roleColors[r.role] ?? "bg-gray-100 text-gray-700"}`}>
                    {r.role.replace(/_/g, " ")}
                  </Badge>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, (r.count / (userStats.total || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 text-right">{r.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Role access map ─────────────────────────────────────────────────────────
// Defines which tabs each platform role can see
const ROLE_TAB_ACCESS: Record<string, string[]> = {
  super_admin:      ["finance", "regional", "users"],
  platform_admin:   ["finance", "regional", "users"],
  finance_admin:    ["finance"],
  regional_manager: ["regional"],
  client_services:  ["users"],
  hr_admin:         ["users"],
  // company roles see nothing (should not reach this page)
  company_admin:    [],
  company_member:   [],
  reviewer:         [],
  client:           [],
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlatformOpsPage() {
  const { user } = useAuth();
  const platformRole = (user as { platformRole?: string } | null)?.platformRole ?? "client";
  const allowedTabs = ROLE_TAB_ACCESS[platformRole] ?? [];

  // Default to first allowed tab, or "finance" for admins
  const defaultTab = allowedTabs[0] ?? "finance";

  // If user has no access at all, show access denied
  if (allowedTabs.length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <ShieldCheck size={48} className="text-muted-foreground/30" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Platform Operations is only available to platform administrators and internal staff.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Your role: <Badge variant="outline" className="text-xs">{platformRole.replace(/_/g, " ")}</Badge>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Globe size={22} className="text-[var(--smartpro-orange)]" />
            Platform Operations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Internal management dashboard — finance, regional capacity, and user analytics
          </p>
        </div>
        <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200 font-medium">
          {platformRole.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Tabs — only show tabs the current role is allowed to see */}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-9">
          {allowedTabs.includes("finance") && (
            <TabsTrigger value="finance" className="text-xs gap-1.5">
              <TrendingUp size={13} />
              Finance
            </TabsTrigger>
          )}
          {allowedTabs.includes("regional") && (
            <TabsTrigger value="regional" className="text-xs gap-1.5">
              <MapPin size={13} />
              Regional
            </TabsTrigger>
          )}
          {allowedTabs.includes("users") && (
            <TabsTrigger value="users" className="text-xs gap-1.5">
              <Users size={13} />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        {allowedTabs.includes("finance") && (
          <TabsContent value="finance" className="mt-4">
            <FinanceView />
          </TabsContent>
        )}
        {allowedTabs.includes("regional") && (
          <TabsContent value="regional" className="mt-4">
            <RegionalView />
          </TabsContent>
        )}
        {allowedTabs.includes("users") && (
          <TabsContent value="users" className="mt-4">
            <UsersView />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

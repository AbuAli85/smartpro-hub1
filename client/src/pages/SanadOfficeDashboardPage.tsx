import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users,
  TrendingUp,
  Building2,
  Star,
  CheckCircle2,
  Clock,
  XCircle,
  Briefcase,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Award,
  Wallet,
  Activity,
  ClipboardList,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SERVICE_TYPE_LABELS: Record<string, string> = {
  work_permit: "Work Permit",
  work_permit_renewal: "WP Renewal",
  work_permit_cancellation: "WP Cancellation",
  labor_card: "Labour Card",
  labor_card_renewal: "Labour Card Renewal",
  residence_visa: "Residence Visa",
  residence_visa_renewal: "RV Renewal",
  visit_visa: "Visit Visa",
  exit_reentry: "Exit/Re-entry",
  commercial_registration: "CR",
  commercial_registration_renewal: "Commercial Registration Renewal",
  business_license: "Business Licence",
  document_typing: "Typing",
  document_translation: "Translation",
  document_attestation: "Attestation",
  pasi_registration: "PASI",
  omanisation_report: "Omanisation",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#60a5fa",
  in_progress: "#f59e0b",
  awaiting_documents: "#f97316",
  awaiting_payment: "#a78bfa",
  completed: "#22c55e",
  rejected: "#ef4444",
  cancelled: "#6b7280",
};

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#60a5fa", "#a78bfa", "#f97316", "#94a3b8", "#6b7280"];

function CapacityBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">No ratings</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm font-semibold">{value.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">/5</span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  accent?: string;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${accent ?? ""}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="p-2 rounded-lg bg-muted">
              <Icon className="w-5 h-5 text-muted-foreground" />
            </div>
            {trend && <TrendIcon className={`w-4 h-4 ${trendColor}`} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SanadOfficeDashboardPage() {
  const [selectedOfficeId, setSelectedOfficeId] = useState<number | null>(null);

  // Load all sanad offices so the user can pick one
  const { data: providers = [] } = trpc.sanad.listProviders.useQuery(undefined);
  const offices = providers.filter((p) => p.status === "active");

  const officeId = selectedOfficeId ?? (offices[0]?.id ?? null);

  const { data: dashboard, isLoading: dashLoading } = trpc.sanad.officeDashboard.useQuery(
    { officeId: officeId! },
    { enabled: officeId !== null }
  );

  const { data: officers = [], isLoading: officersLoading } = trpc.sanad.officerPerformance.useQuery(
    { officeId: officeId! },
    { enabled: officeId !== null }
  );

  const { data: earningsTrend = [] } = trpc.sanad.earningsTrend.useQuery(
    { officeId: officeId! },
    { enabled: officeId !== null }
  );

  const { data: woStats } = trpc.sanad.workOrderStats.useQuery(
    { officeId: officeId! },
    { enabled: officeId !== null }
  );

  const selectedOffice = offices.find((o) => o.id === officeId);

  if (offices.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        <Building2 className="w-12 h-12 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-semibold">No Sanad Offices Found</h2>
        <p className="text-muted-foreground text-sm">Register a Sanad office first to view its performance dashboard.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sanad Office Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Monitor officer performance, earnings, and work order metrics
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="h-9" asChild>
            <Link href="/sanad/catalogue-admin">Centre profile &amp; catalogue</Link>
          </Button>
          <Select
            value={String(officeId)}
            onValueChange={(v) => setSelectedOfficeId(Number(v))}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select office" />
            </SelectTrigger>
            <SelectContent>
              {offices.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedOffice && (
            <Badge variant={selectedOffice.isVerified ? "default" : "secondary"}>
              {selectedOffice.isVerified ? "Verified" : "Unverified"}
            </Badge>
          )}
        </div>
      </div>

      {officeId != null && (
        <Card className="border-primary/25 bg-gradient-to-r from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-primary shrink-0" aria-hidden />
              Business sector survey — gov &amp; business bridge
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm max-w-3xl leading-relaxed">
              Use your <strong>same SmartPRO login</strong> as this dashboard. Opening the survey from here attributes
              responses to <strong>{selectedOffice?.name ?? "your office"}</strong>, helping map how PRO offices connect
              regulators and businesses.
            </p>
            <Button className="shrink-0" asChild>
              <Link href={`/survey/oman-business-sector-2026?officeId=${officeId}`}>Open survey</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {dashLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-16 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : dashboard ? (
        <>
          {/* ── KPI Row 1 — Workforce ───────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Workforce Overview
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Total Officers"
                value={dashboard.totalOfficers}
                subtitle={`${dashboard.activeOfficers} active`}
                icon={Users}
              />
              <KpiCard
                title="Active Assignments"
                value={dashboard.totalActiveAssignments}
                subtitle={`${dashboard.totalOfficers * 10 - dashboard.totalActiveAssignments} slots available`}
                icon={Building2}
              />
              <KpiCard
                title="Track A Officers"
                value={dashboard.trackAOfficers}
                subtitle="Platform employed"
                icon={Award}
              />
              <KpiCard
                title="Track B Officers"
                value={dashboard.trackBOfficers}
                subtitle="Sanad employed"
                icon={Briefcase}
              />
            </div>
          </div>

          {/* ── KPI Row 2 — Financials ──────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Monthly Financials
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Monthly Revenue"
                value={`OMR ${dashboard.totalMonthlyRevenue.toFixed(0)}`}
                subtitle="From company assignments"
                icon={TrendingUp}
                trend="up"
                accent="text-emerald-600"
              />
              <KpiCard
                title="Salary Cost"
                value={`OMR ${dashboard.totalMonthlySalaries.toFixed(0)}`}
                subtitle="Track B officer salaries"
                icon={Wallet}
                trend="down"
              />
              <KpiCard
                title="Net Earnings"
                value={`OMR ${dashboard.netMonthlyEarnings.toFixed(0)}`}
                subtitle="Revenue minus salaries"
                icon={BarChart3}
                trend={dashboard.netMonthlyEarnings >= 0 ? "up" : "down"}
                accent={dashboard.netMonthlyEarnings >= 0 ? "text-emerald-600" : "text-red-600"}
              />
              <KpiCard
                title="Avg Client Rating"
                value={dashboard.avgRating !== null ? `${dashboard.avgRating.toFixed(1)} / 5` : "—"}
                subtitle="Across all work orders"
                icon={Star}
              />
            </div>
          </div>

          {/* ── KPI Row 3 — Work Orders ─────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Work Order Performance
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                title="Total Work Orders"
                value={dashboard.totalWorkOrders}
                subtitle="All time"
                icon={Activity}
              />
              <KpiCard
                title="Completed"
                value={dashboard.completedWorkOrders}
                subtitle={`${dashboard.completionRate}% completion rate`}
                icon={CheckCircle2}
                accent="text-emerald-600"
              />
              <KpiCard
                title="In Progress"
                value={dashboard.inProgressWorkOrders}
                subtitle="Currently active"
                icon={Clock}
                accent="text-amber-600"
              />
              <KpiCard
                title="Rejected"
                value={dashboard.rejectedWorkOrders}
                subtitle="Needs attention"
                icon={XCircle}
                accent={dashboard.rejectedWorkOrders > 0 ? "text-red-600" : ""}
              />
            </div>
          </div>

          {/* ── Charts Row ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Earnings Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Earnings Trend (6 months)</CardTitle>
              </CardHeader>
              <CardContent>
                {earningsTrend.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No earnings data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={earningsTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => [`OMR ${value.toFixed(0)}`, ""]}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="totalEarnings" name="Net Earnings" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="trackBRevenue" name="Track B Revenue" stroke="#60a5fa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="trackBSalaryCost" name="Salary Cost" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Work Orders by Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Work Orders by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {!woStats || woStats.byStatus.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                    No work orders yet
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-6">
                    <ResponsiveContainer width="50%" height={200}>
                      <PieChart>
                        <Pie
                          data={woStats.byStatus}
                          dataKey="total"
                          nameKey="status"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                        >
                          {woStats.byStatus.map((entry, i) => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, name: string) => [v, name.replace(/_/g, " ")]} contentStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-1.5">
                      {woStats.byStatus.map((s) => (
                        <div key={s.status} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: STATUS_COLORS[s.status] ?? "#94a3b8" }}
                            />
                            <span className="capitalize">{s.status.replace(/_/g, " ")}</span>
                          </div>
                          <span className="font-semibold">{s.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Service Type Breakdown ──────────────────────────────────────── */}
          {woStats && woStats.byServiceType.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Work Orders by Service Type</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={woStats.byServiceType.slice(0, 10)} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="serviceType"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => SERVICE_TYPE_LABELS[v] ?? v}
                      angle={-35}
                      textAnchor="end"
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number, name: string) => [v, name]}
                      labelFormatter={(l) => SERVICE_TYPE_LABELS[l] ?? l}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total" name="Total" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ── Officer Performance Table ───────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Officer Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {officersLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : officers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No officers assigned to this office yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Officer</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Track</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Capacity</th>
                        <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Revenue</th>
                        <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Salary</th>
                        <th scope="col" className="text-right px-4 py-3 font-medium text-muted-foreground">Net</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">WOs</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Done</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Rate%</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Rating</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officers.map((o, idx) => (
                        <tr key={o.id} className={`border-b last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium">{o.fullName}</div>
                            {o.fullNameAr && (
                              <div className="text-xs text-muted-foreground" dir="rtl">{o.fullNameAr}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={o.employmentTrack === "platform" ? "default" : "secondary"} className="text-xs">
                              {o.employmentTrack === "platform" ? "Track A" : "Track B"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 min-w-32">
                            <div className="text-xs text-muted-foreground mb-1">
                              {o.activeAssignments}/{o.maxCompanies} companies
                            </div>
                            <CapacityBar pct={o.capacityPct} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-600">
                            OMR {o.monthlyRevenue.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            OMR {o.monthlySalary.toFixed(0)}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-semibold ${o.netEarnings >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            OMR {o.netEarnings.toFixed(0)}
                          </td>
                          <td className="px-4 py-3 text-center">{o.totalWorkOrders}</td>
                          <td className="px-4 py-3 text-center text-emerald-600">{o.completedWorkOrders}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${o.completionRate >= 80 ? "text-emerald-600" : o.completionRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {o.completionRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StarRating value={o.avgRating} />
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                o.status === "active" ? "default" :
                                o.status === "on_leave" ? "secondary" : "outline"
                              }
                              className="text-xs capitalize"
                            >
                              {o.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Recent Work Orders ──────────────────────────────────────────── */}
          {woStats && woStats.recentOrders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Work Orders</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Service</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Beneficiary</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th scope="col" className="text-center px-4 py-3 font-medium text-muted-foreground">Rating</th>
                        <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {woStats.recentOrders.map((wo, idx) => (
                        <tr key={wo.id} className={`border-b last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{wo.referenceNumber}</td>
                          <td className="px-4 py-3">{SERVICE_TYPE_LABELS[wo.serviceType] ?? wo.serviceType}</td>
                          <td className="px-4 py-3">{wo.companyName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{wo.beneficiaryName ?? "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className="text-xs capitalize"
                              style={{ background: STATUS_COLORS[wo.status] + "22", color: STATUS_COLORS[wo.status], borderColor: STATUS_COLORS[wo.status] + "44" }}
                              variant="outline"
                            >
                              {wo.status.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {wo.rating ? (
                              <div className="flex items-center justify-center gap-0.5">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span className="text-xs font-semibold">{wo.rating}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {fmtDate(wo.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          Select a Sanad office to view its dashboard.
        </div>
      )}
    </div>
  );
}

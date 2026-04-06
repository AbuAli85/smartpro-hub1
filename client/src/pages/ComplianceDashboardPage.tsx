import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Users, FileText,
  DollarSign, TrendingUp, Building2, Globe, ChevronRight, RefreshCw, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-orange-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function GradeCircle({ score, grade }: { score: number; grade: string }) {
  const color = grade === "A" ? "#22c55e" : grade === "B" ? "#84cc16" : grade === "C" ? "#f59e0b" : grade === "D" ? "#f97316" : "#ef4444";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112">
        <circle cx="56" cy="56" r="40" fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="56" cy="56" r="40" fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="text-center">
        <p className="text-3xl font-black" style={{ color }}>{grade}</p>
        <p className="text-xs text-muted-foreground">{score}/100</p>
      </div>
    </div>
  );
}

export default function ComplianceDashboardPage() {
  const { user } = useAuth();
  const isPlatform = seesPlatformOperatorNav(user);
  const { activeCompanyId } = useActiveCompany();
  const scopeEnabled = isPlatform || activeCompanyId != null;
  const companyScope = { companyId: activeCompanyId ?? undefined };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: score, isLoading: scoreLoading, refetch } = trpc.compliance.getComplianceScore.useQuery(companyScope, {
    enabled: scopeEnabled,
  });
  const { data: omanisation, isLoading: omanLoading } = trpc.compliance.getOmanisationStats.useQuery(companyScope, {
    enabled: scopeEnabled,
  });
  const { data: pasi } = trpc.compliance.getPasiStatus.useQuery(
    { month: currentMonth, year: currentYear, ...companyScope },
    { enabled: scopeEnabled },
  );
  const { data: wps } = trpc.compliance.getWpsStatus.useQuery(
    { month: currentMonth, year: currentYear, ...companyScope },
    { enabled: scopeEnabled },
  );
  const { data: permitMatrix } = trpc.compliance.getPermitMatrix.useQuery(companyScope, { enabled: scopeEnabled });

  const failedChecks = score?.checks?.filter((c) => c.status === "fail").length ?? 0;
  const wpsBlocked =
    wps &&
    wps.status !== "paid" &&
    wps.status !== "not_generated";
  const permitCritical =
    (permitMatrix?.summary.expired ?? 0) > 0 || (permitMatrix?.summary.expiring ?? 0) > 0;
  const pasiOpen = pasi && pasi.status !== "paid" && pasi.status !== "not_calculated";
  const omanGap = (omanisation?.gap ?? 0) > 0;
  const complianceAttention =
    scopeEnabled &&
    !scoreLoading &&
    (failedChecks > 0 || wpsBlocked || permitCritical || pasiOpen || omanGap);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Compliance Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Omanisation · PASI · WPS · Work Permits · Labour Law · {format(now, "MMMM yyyy")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {complianceAttention && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 dark:bg-red-950/25 dark:border-red-900/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Compliance & payroll follow-up</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[
                  failedChecks > 0 ? `${failedChecks} failed check(s)` : null,
                  omanGap ? `Omanisation gap ${omanisation?.gap}%` : null,
                  pasiOpen ? "PASI not fully settled" : null,
                  wpsBlocked ? "WPS not marked paid" : null,
                  permitCritical
                    ? `${permitMatrix?.summary.expired ?? 0} expired / ${permitMatrix?.summary.expiring ?? 0} expiring permits`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/payroll">
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                Payroll & WPS <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            <Link href="/workforce">
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                Permits <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            <Link href="/alerts">
              <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1">
                Alerts <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Overall Score + Checks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-sm border-0">
          <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
            {scoreLoading ? (
              <div className="w-28 h-28 rounded-full bg-muted animate-pulse" />
            ) : (
              <GradeCircle score={score?.score ?? 0} grade={score?.grade ?? "N/A"} />
            )}
            <div className="text-center">
              <p className="font-bold text-lg">Overall Compliance Score</p>
              <p className="text-sm text-muted-foreground">
                {score?.grade === "A" ? "Excellent — fully compliant" :
                 score?.grade === "B" ? "Good — minor issues" :
                 score?.grade === "C" ? "Fair — action required" :
                 score?.grade === "D" ? "Poor — urgent attention" :
                 "Critical — immediate action"}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Compliance Checks</h3>
          {score?.checks.map((check, i) => (
            <Card key={i} className={`border-l-4 shadow-sm ${check.status === "pass" ? "border-l-green-500" : check.status === "warn" ? "border-l-orange-500" : "border-l-red-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <StatusIcon status={check.status} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm">{check.name}</p>
                      <span className="text-xs text-muted-foreground">Weight: {check.weight}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Omanisation */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Omanisation Quota
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {omanLoading ? (
              <div className="h-20 bg-muted animate-pulse rounded-lg" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-black">{omanisation?.pct ?? 0}%</p>
                    <p className="text-sm text-muted-foreground">{omanisation?.omani ?? 0} Omani of {omanisation?.total ?? 0} employees</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-muted-foreground">Target</p>
                    <p className="text-2xl font-black text-emerald-600">{omanisation?.targetPct ?? 35}%</p>
                    {(omanisation?.gap ?? 0) > 0 && (
                      <p className="text-xs text-red-600 font-semibold">Gap: {omanisation?.gap}%</p>
                    )}
                  </div>
                </div>
                <div>
                  <Progress
                    value={omanisation?.pct ?? 0}
                    className={`h-3 ${(omanisation?.pct ?? 0) >= (omanisation?.targetPct ?? 35) ? "[&>div]:bg-green-500" : "[&>div]:bg-orange-500"}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span className="text-orange-600 font-semibold">Target: {omanisation?.targetPct ?? 35}%</span>
                    <span>100%</span>
                  </div>
                </div>
                {(omanisation?.byDepartment?.length ?? 0) > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">By Department</p>
                    {omanisation?.byDepartment.slice(0, 5).map((dept) => (
                      <div key={dept.department} className="flex items-center gap-2">
                        <span className="text-xs w-28 truncate text-muted-foreground">{dept.department}</span>
                        <Progress value={dept.pct} className={`flex-1 h-1.5 ${dept.meetsTarget ? "[&>div]:bg-green-500" : "[&>div]:bg-orange-500"}`} />
                        <span className="text-xs font-semibold w-8 text-right">{dept.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* PASI & WPS */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                PASI Contributions — {format(now, "MMMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black">OMR {(pasi?.totalContribution ?? 0).toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">{pasi?.employees?.length ?? 0} employees enrolled</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                  pasi?.status === "paid" ? "bg-green-100 text-green-700" :
                  pasi?.status === "approved" ? "bg-blue-100 text-blue-700" :
                  pasi?.status === "not_calculated" ? "bg-gray-100 text-gray-600" :
                  "bg-orange-100 text-orange-700"
                }`}>
                  {pasi?.status === "not_calculated" ? "Not Calculated" : pasi?.status?.replace(/_/g, " ").toUpperCase() ?? "—"}
                </div>
              </div>
              <Link href="/payroll">
                <Button variant="ghost" size="sm" className="mt-3 w-full text-xs gap-1">
                  View Payroll <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                WPS Status — {format(now, "MMMM yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black">OMR {(wps?.totalNetOmr ?? 0).toFixed(3)}</p>
                  <p className="text-sm text-muted-foreground">{wps?.employeeCount ?? 0} employees</p>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                  wps?.status === "paid" ? "bg-green-100 text-green-700" :
                  wps?.status === "submitted" ? "bg-blue-100 text-blue-700" :
                  wps?.status === "generated" ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {wps?.status === "not_generated" ? "Not Generated" : wps?.status?.replace(/_/g, " ").toUpperCase() ?? "—"}
                </div>
              </div>
              {wps?.wpsFileUrl && (
                <a href={wps.wpsFileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="mt-3 w-full text-xs gap-1">
                    <FileText className="w-3 h-3" />
                    Download WPS File
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Permit Matrix */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              Work Permit Validity Matrix
            </CardTitle>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Valid</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Expiring</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Expired</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />No Permit</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: "Valid", value: permitMatrix?.summary.valid ?? 0, color: "text-green-600" },
              { label: "Expiring (30d)", value: permitMatrix?.summary.expiring ?? 0, color: "text-orange-600" },
              { label: "Expired", value: permitMatrix?.summary.expired ?? 0, color: "text-red-600" },
              { label: "Total Employees", value: permitMatrix?.summary.total ?? 0, color: "text-slate-700" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Department breakdown */}
          {(permitMatrix?.byDepartment?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="text-left py-2 font-semibold">Department</th>
                    <th scope="col" className="text-center py-2 font-semibold">Total</th>
                    <th scope="col" className="text-center py-2 font-semibold text-green-600">Valid</th>
                    <th scope="col" className="text-center py-2 font-semibold text-orange-600">Expiring</th>
                    <th scope="col" className="text-center py-2 font-semibold text-red-600">Expired</th>
                    <th scope="col" className="text-center py-2 font-semibold text-gray-500">No Permit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {permitMatrix?.byDepartment.map((dept) => (
                    <tr key={dept.department} className="hover:bg-muted/30">
                      <td className="py-2 font-medium">{dept.department}</td>
                      <td className="text-center py-2">{dept.total}</td>
                      <td className="text-center py-2 text-green-600 font-semibold">{dept.valid}</td>
                      <td className="text-center py-2 text-orange-600 font-semibold">{dept.expiring}</td>
                      <td className="text-center py-2 text-red-600 font-semibold">{dept.expired}</td>
                      <td className="text-center py-2 text-gray-500">{dept.noPermit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(permitMatrix?.byDepartment?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No employee data available. Add employees to see the permit matrix.</p>
          )}

          <div className="mt-4 flex gap-2">
            <Link href="/workforce">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <Users className="w-3 h-3" />
                Manage Workforce
              </Button>
            </Link>
            <Link href="/renewal-workflows">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                Trigger Renewals
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

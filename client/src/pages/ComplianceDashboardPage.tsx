import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Users, FileText,
  DollarSign, Globe, ChevronRight, RefreshCw, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
<<<<<<< Updated upstream
import { arSA } from "date-fns/locale/ar-SA";
import { enUS } from "date-fns/locale/en-US";
=======
import { ar as arLocale, enUS } from "date-fns/locale";
>>>>>>> Stashed changes
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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

/** Normalize common display typos in department names from imported data */
function formatDepartmentLabel(name: string, t: TFunction<"compliance">): string {
  const fixed = name.replace(/\bEntery\b/gi, "Entry");
  if (fixed === "Unassigned") return t("unassignedDepartment");
  return fixed;
}

type ComplianceCheckRow = {
  id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  weight: number;
  meta: Record<string, string | number>;
};

function localizedCheckNameAndDetail(check: ComplianceCheckRow, t: TFunction<"compliance">) {
  const name = t(`checkNames.${check.id}`, { defaultValue: check.name });
  const meta = check.meta ?? {};
  let detail = check.detail;
  switch (check.id) {
    case "omanisation_quota":
      detail = t("checkDetails.omanisation_quota", {
        pct: Number(meta.pct ?? 0),
        target: Number(meta.target ?? 35),
      });
      break;
    case "work_permit_validity": {
      const n = Number(meta.expiredCount ?? 0);
      detail = n === 0 ? t("checkDetails.work_permit_valid_ok") : t("checkDetails.work_permit_valid_expired", { count: n });
      break;
    }
    case "upcoming_renewals": {
      const n = Number(meta.expiringCount ?? 0);
      detail = n === 0 ? t("checkDetails.upcoming_renewals_ok") : t("checkDetails.upcoming_renewals_expiring", { count: n });
      break;
    }
    case "wps_compliance": {
      const v = String(meta.variant ?? "not_generated");
      detail = t(`checkDetails.wps_${v}` as "checkDetails.wps_paid", { defaultValue: check.detail });
      break;
    }
    default:
      break;
  }
  return { name, detail };
}

function formatPasiStatusLabel(status: string | undefined, t: TFunction<"compliance">) {
  if (!status) return "—";
  if (status === "not_calculated") return t("pasiStatus.not_calculated");
  const key = `pasiStatus.${status}`;
  const translated = t(key as "pasiStatus.paid");
  if (translated !== key) return translated;
  return status.replace(/_/g, " ").toUpperCase();
}

function formatWpsStatusLabel(status: string | undefined, t: TFunction<"compliance">) {
  if (!status) return "—";
  if (status === "not_generated") return t("wpsStatus.not_generated");
  const key = `wpsStatus.${status}`;
  const translated = t(key as "wpsStatus.paid");
  if (translated !== key) return translated;
  return status.replace(/_/g, " ").toUpperCase();
}

export default function ComplianceDashboardPage() {
  const { t, i18n } = useTranslation("compliance");
<<<<<<< Updated upstream
  const dateLocale = i18n.language === "ar-OM" ? arSA : enUS;
=======
>>>>>>> Stashed changes
  const { user } = useAuth();
  const isPlatform = seesPlatformOperatorNav(user);
  const { activeCompanyId } = useActiveCompany();
  const scopeEnabled = isPlatform || activeCompanyId != null;
  const companyScope = { companyId: activeCompanyId ?? undefined };
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
<<<<<<< Updated upstream
  const monthYearLabel = format(now, "MMMM yyyy", { locale: dateLocale });
=======
  const isArabic = i18n.language === "ar-OM";
  const dateFnsLocale = isArabic ? arLocale : enUS;
>>>>>>> Stashed changes

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
  const { data: opsSnapshot } = trpc.operations.getDailySnapshot.useQuery(companyScope, { enabled: scopeEnabled && !isPlatform });

  const failedChecks = score?.checks?.filter((c) => c.status === "fail").length ?? 0;
  const wpsBlocked = wps && wps.status !== "paid" && wps.status !== "not_generated";
  const permitCritical = (permitMatrix?.summary.expired ?? 0) > 0 || (permitMatrix?.summary.expiring ?? 0) > 0;
  const pasiOpen = pasi && pasi.status !== "paid" && pasi.status !== "not_calculated";
  const omanGap = (omanisation?.gap ?? 0) > 0;
  const arRisk = !isPlatform && (opsSnapshot?.overdueInvoices?.count ?? 0) > 0;
  const payrollBlocked =
    !isPlatform &&
    ((opsSnapshot?.payrollDraftThisMonth ?? 0) > 0 || (opsSnapshot?.pendingPayrollApprovals ?? 0) > 0);
  const complianceAttention =
    scopeEnabled &&
    !scoreLoading &&
    (failedChecks > 0 || wpsBlocked || permitCritical || pasiOpen || omanGap || arRisk || payrollBlocked);

<<<<<<< Updated upstream
  const attentionParts: string[] = [];
  if (failedChecks > 0) attentionParts.push(t("attention.failedChecks", { count: failedChecks }));
  if (omanGap) attentionParts.push(t("attention.omanisationGap", { gap: omanisation?.gap ?? 0 }));
  if (pasiOpen) attentionParts.push(t("attention.pasiUnsettled"));
  if (wpsBlocked) attentionParts.push(t("attention.wpsNotPaid"));
  if (permitCritical) {
    attentionParts.push(
      t("attention.permitsExpiredExpiring", {
        expired: permitMatrix?.summary.expired ?? 0,
        expiring: permitMatrix?.summary.expiring ?? 0,
      }),
    );
  }
  if (arRisk) {
    attentionParts.push(
      t("attention.overdueAr", {
        amount: (opsSnapshot?.overdueInvoices?.totalOmr ?? 0).toFixed(3),
        count: opsSnapshot?.overdueInvoices?.count ?? 0,
      }),
    );
  }
  if (payrollBlocked) attentionParts.push(t("attention.payrollBlocked"));
=======
  /** Translate a check using its stable id + status + meta */
  function localizeCheck(check: {
    id?: string;
    name: string;
    status: "pass" | "warn" | "fail";
    detail: string;
    meta?: Record<string, number | string>;
  }) {
    const id = check.id;
    if (!id) return { name: check.name, detail: check.detail };
    const nameKey = `checkNames.${id}`;
    const detailKey = `checkDetails.${id}_${check.status}`;
    const meta = check.meta ?? {};
    return {
      name: t(nameKey as Parameters<typeof t>[0], check.name),
      detail: t(detailKey as Parameters<typeof t>[0], { ...meta, defaultValue: check.detail }),
    };
  }

  /** Translate department label — fix "Entery" typo and "Unassigned" */
  function formatDeptLabel(dept: string) {
    if (dept === "Unassigned") return t("unassignedDepartment");
    return dept.replace(/\bEntery\b/g, "Entry");
  }

  /** Translate PASI status badge */
  function pasiStatusLabel(status?: string) {
    if (!status) return "—";
    const key = `pasiStatus.${status}`;
    return t(key as Parameters<typeof t>[0], status.replace(/_/g, " ").toUpperCase());
  }

  /** Translate WPS status badge */
  function wpsStatusLabel(status?: string) {
    if (!status) return "—";
    const key = `wpsStatus.${status}`;
    return t(key as Parameters<typeof t>[0], status.replace(/_/g, " ").toUpperCase());
  }

  /** Build attention detail line from structured keys */
  const attentionParts: string[] = [
    failedChecks > 0 ? t("attention.failedChecks", { count: failedChecks }) : "",
    omanGap ? t("attention.omanisationGap", { gap: omanisation?.gap }) : "",
    pasiOpen ? t("attention.pasiNotSettled") : "",
    wpsBlocked ? t("attention.wpsNotPaid") : "",
    permitCritical
      ? t("attention.permitsIssue", {
          expired: permitMatrix?.summary.expired ?? 0,
          expiring: permitMatrix?.summary.expiring ?? 0,
        })
      : "",
    arRisk
      ? t("attention.overdueReceivables", {
          amount: (opsSnapshot?.overdueInvoices?.totalOmr ?? 0).toFixed(3),
          count: opsSnapshot?.overdueInvoices?.count,
        })
      : "",
    payrollBlocked ? t("attention.payrollBlocked") : "",
  ].filter(Boolean);

  const monthLabel = format(now, "MMMM yyyy", { locale: dateFnsLocale });
>>>>>>> Stashed changes

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
<<<<<<< Updated upstream
              {t("subtitle", { month: monthYearLabel })}
=======
              {t("subtitle", { month: monthLabel })}
>>>>>>> Stashed changes
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          {t("refresh")}
        </Button>
      </div>

      {/* Attention strip */}
      {complianceAttention && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 dark:bg-red-950/25 dark:border-red-900/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("attentionTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {attentionParts.join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Link href="/payroll">
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                {t("payrollWps")} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            <Link href="/workforce">
              <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                {t("permits")} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            <Link href="/alerts">
              <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white gap-1">
                {t("alerts")} <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
            {arRisk && (
              <Link href="/billing">
                <Button size="sm" variant="secondary" className="h-8 text-xs gap-1">
                  {t("overdueAr")} <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            )}
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
              <p className="font-bold text-lg">{t("overallScore")}</p>
              <p className="text-sm text-muted-foreground">
                {score?.grade === "A" ? t("gradeExcellent") :
                 score?.grade === "B" ? t("gradeGood") :
                 score?.grade === "C" ? t("gradeFair") :
                 score?.grade === "D" ? t("gradePoor") :
                 t("gradeCritical")}
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="lg:col-span-2 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">{t("checksSection")}</h3>
          {score?.checks.map((check, i) => {
<<<<<<< Updated upstream
            const row = check as ComplianceCheckRow;
            const { name, detail } = localizedCheckNameAndDetail(row, t);
            return (
            <Card key={i} className={`border-l-4 shadow-sm ${check.status === "pass" ? "border-l-green-500" : check.status === "warn" ? "border-l-orange-500" : "border-l-red-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <StatusIcon status={check.status} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm">{name}</p>
                      <span className="text-xs text-muted-foreground shrink-0">{t("weightLabel", { weight: check.weight })}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
=======
            const { name, detail } = localizeCheck(check);
            return (
              <Card key={i} className={`border-l-4 shadow-sm ${check.status === "pass" ? "border-l-green-500" : check.status === "warn" ? "border-l-orange-500" : "border-l-red-500"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon status={check.status} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{name}</p>
                        <span className="text-xs text-muted-foreground">{t("weight")}: {check.weight}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
>>>>>>> Stashed changes
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Omanisation */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              {t("omanisationCardTitle")}
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
                    <p className="text-sm text-muted-foreground">
<<<<<<< Updated upstream
                      {t("omaniOfEmployees", { omani: omanisation?.omani ?? 0, total: omanisation?.total ?? 0 })}
=======
                      {t("omanisationOf", { omani: omanisation?.omani ?? 0, total: omanisation?.total ?? 0 })}
>>>>>>> Stashed changes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-muted-foreground">{t("target")}</p>
                    <p className="text-2xl font-black text-emerald-600">{omanisation?.targetPct ?? 35}%</p>
                    {(omanisation?.gap ?? 0) > 0 && (
<<<<<<< Updated upstream
                      <p className="text-xs text-red-600 font-semibold">{t("gapLabel", { gap: omanisation?.gap ?? 0 })}</p>
=======
                      <p className="text-xs text-red-600 font-semibold">{t("gap")}: {omanisation?.gap}%</p>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
                    <span className="text-orange-600 font-semibold">
                      {t("target")}: {omanisation?.targetPct ?? 35}%
                    </span>
=======
                    <span className="text-orange-600 font-semibold">{t("target")}: {omanisation?.targetPct ?? 35}%</span>
>>>>>>> Stashed changes
                    <span>100%</span>
                  </div>
                </div>
                {(omanisation?.byDepartment?.length ?? 0) > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">{t("byDepartment")}</p>
                    {omanisation?.byDepartment.slice(0, 5).map((dept) => (
                      <div key={dept.department} className="flex items-center gap-2">
<<<<<<< Updated upstream
                        <span className="text-xs w-28 truncate text-muted-foreground" title={formatDepartmentLabel(dept.department, t)}>
                          {formatDepartmentLabel(dept.department, t)}
                        </span>
=======
                        <span className="text-xs w-28 truncate text-muted-foreground">{formatDeptLabel(dept.department)}</span>
>>>>>>> Stashed changes
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

        {/* PASI + WPS */}
        <div className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
<<<<<<< Updated upstream
                {t("pasiCardTitle", { month: monthYearLabel })}
=======
                {t("pasiCardTitle", { month: monthLabel })}
>>>>>>> Stashed changes
              </CardTitle>
              <p className="text-xs text-muted-foreground font-normal">{t("pasiAuthorityHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black">OMR {(pasi?.totalContribution ?? 0).toFixed(3)}</p>
<<<<<<< Updated upstream
                  <p className="text-sm text-muted-foreground">{t("employeesEnrolled", { count: pasi?.employees?.length ?? 0 })}</p>
=======
                  <p className="text-sm text-muted-foreground">
                    {t("employeesEnrolled", { count: pasi?.employees?.length ?? 0 })}
                  </p>
>>>>>>> Stashed changes
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                  pasi?.status === "paid" ? "bg-green-100 text-green-700" :
                  pasi?.status === "approved" ? "bg-blue-100 text-blue-700" :
                  pasi?.status === "not_calculated" ? "bg-gray-100 text-gray-600" :
                  "bg-orange-100 text-orange-700"
                }`}>
<<<<<<< Updated upstream
                  {formatPasiStatusLabel(pasi?.status, t)}
=======
                  {pasiStatusLabel(pasi?.status)}
>>>>>>> Stashed changes
                </div>
              </div>
              <Link href="/payroll">
                <Button variant="ghost" size="sm" className="mt-3 w-full text-xs gap-1">
                  {t("viewPayroll")} <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
<<<<<<< Updated upstream
                {t("wpsCardTitle", { month: monthYearLabel })}
=======
                {t("wpsCardTitle", { month: monthLabel })}
>>>>>>> Stashed changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black">OMR {(wps?.totalNetOmr ?? 0).toFixed(3)}</p>
<<<<<<< Updated upstream
                  <p className="text-sm text-muted-foreground">{t("wpsEmployees", { count: wps?.employeeCount ?? 0 })}</p>
=======
                  <p className="text-sm text-muted-foreground">
                    {t("employees", { count: wps?.employeeCount ?? 0 })}
                  </p>
>>>>>>> Stashed changes
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
                  wps?.status === "paid" ? "bg-green-100 text-green-700" :
                  wps?.status === "submitted" ? "bg-blue-100 text-blue-700" :
                  wps?.status === "generated" ? "bg-yellow-100 text-yellow-700" :
                  "bg-red-100 text-red-700"
                }`}>
<<<<<<< Updated upstream
                  {formatWpsStatusLabel(wps?.status, t)}
=======
                  {wpsStatusLabel(wps?.status)}
>>>>>>> Stashed changes
                </div>
              </div>
              {wps?.wpsFileUrl && (
                <a href={wps.wpsFileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="mt-3 w-full text-xs gap-1">
                    <FileText className="w-3 h-3" />
<<<<<<< Updated upstream
                    {t("downloadWpsFile")}
=======
                    {t("downloadWps")}
>>>>>>> Stashed changes
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-600" />
              {t("permitMatrixTitle")}
            </CardTitle>
<<<<<<< Updated upstream
            <div className="flex flex-wrap gap-3 text-xs">
=======
            <div className="flex gap-3 text-xs">
>>>>>>> Stashed changes
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{t("legendValid")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{t("legendExpiring")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{t("legendExpired")}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />{t("legendNoPermit")}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
<<<<<<< Updated upstream
              { labelKey: "summaryValid" as const, value: permitMatrix?.summary.valid ?? 0, color: "text-green-600" },
              { labelKey: "summaryExpiring" as const, value: permitMatrix?.summary.expiring ?? 0, color: "text-orange-600" },
              { labelKey: "summaryExpired" as const, value: permitMatrix?.summary.expired ?? 0, color: "text-red-600" },
=======
              { labelKey: "legendValid" as const, value: permitMatrix?.summary.valid ?? 0, color: "text-green-600" },
              { labelKey: "summaryExpiring30d" as const, value: permitMatrix?.summary.expiring ?? 0, color: "text-orange-600" },
              { labelKey: "legendExpired" as const, value: permitMatrix?.summary.expired ?? 0, color: "text-red-600" },
>>>>>>> Stashed changes
              { labelKey: "summaryTotalEmployees" as const, value: permitMatrix?.summary.total ?? 0, color: "text-slate-700" },
            ].map((s) => (
              <div key={s.labelKey} className="text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{t(s.labelKey)}</p>
              </div>
            ))}
          </div>
          {/* Department breakdown */}
          {(permitMatrix?.byDepartment?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
<<<<<<< Updated upstream
                    <th scope="col" className="text-start py-2 font-semibold">{t("deptColDepartment")}</th>
                    <th scope="col" className="text-center py-2 font-semibold">{t("deptColTotal")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-green-600">{t("deptColValid")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-orange-600">{t("deptColExpiring")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-red-600">{t("deptColExpired")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-gray-500">{t("deptColNoPermit")}</th>
=======
                    <th scope="col" className="text-left py-2 font-semibold">{t("colDepartment")}</th>
                    <th scope="col" className="text-center py-2 font-semibold">{t("colTotal")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-green-600">{t("colValid")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-orange-600">{t("colExpiring")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-red-600">{t("colExpired")}</th>
                    <th scope="col" className="text-center py-2 font-semibold text-gray-500">{t("colNoPermit")}</th>
>>>>>>> Stashed changes
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {permitMatrix?.byDepartment.map((dept) => (
                    <tr key={dept.department} className="hover:bg-muted/30">
<<<<<<< Updated upstream
                      <td className="py-2 font-medium">{formatDepartmentLabel(dept.department, t)}</td>
=======
                      <td className="py-2 font-medium">{formatDeptLabel(dept.department)}</td>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
            <p className="text-sm text-muted-foreground text-center py-6">{t("permitMatrixEmpty")}</p>
=======
            <p className="text-sm text-muted-foreground text-center py-6">{t("noEmployeeData")}</p>
>>>>>>> Stashed changes
          )}
          <div className="mt-4 flex gap-2">
            <Link href="/workforce">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <Users className="w-3 h-3" />
                {t("manageWorkforce")}
              </Button>
            </Link>
            <Link href="/renewal-workflows">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                {t("triggerRenewals")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

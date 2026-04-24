import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  Activity, Users, Calendar, AlertTriangle, CheckCircle2,
  MapPin, Clock, ShieldAlert,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  variant = "neutral",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: "neutral" | "warn" | "ok";
}) {
  const colorMap = {
    neutral: "text-slate-600 bg-slate-50",
    warn: value > 0 ? "text-amber-600 bg-amber-50" : "text-muted-foreground bg-muted/40",
    ok: "text-emerald-600 bg-emerald-50",
  };
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-3 ${colorMap[variant]}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-xs mt-0.5 text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ── Issue section ─────────────────────────────────────────────────────────────

function IssueSection({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children ?? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            {emptyText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Employee row ──────────────────────────────────────────────────────────────

function EmpRow({
  name,
  sub,
  ctaLabel,
  ctaHref,
  canFix,
  contactAdminHint,
}: {
  name: string;
  sub?: string | null;
  ctaLabel: string;
  ctaHref: string;
  canFix: boolean;
  contactAdminHint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
      <div>
        <span className="text-sm font-medium">{name}</span>
        {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
      </div>
      {canFix ? (
        <Button asChild size="sm" variant="outline" className="h-7 text-xs shrink-0">
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">{contactAdminHint}</span>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AttendanceSetupHealthPage() {
  const { t } = useTranslation("hr");
  const { activeCompanyId } = useActiveCompany();
  const { caps } = useMyCapabilities();

  const { data, isLoading } = trpc.attendance.getSetupHealth.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, staleTime: 30_000 },
  );

  const canManageSchedules = caps?.canManageEmployeeSchedules === true;
  const canManageShifts = caps?.canManageShiftTemplates === true;
  const canManageSites = caps?.canManageAttendanceSites === true;
  const contactHint = t("attendance.setupHealthPage.contactAdminHint");

  if (isLoading || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const {
    activeEmployeesCount,
    scheduledTodayCount,
    missingSchedulesCount,
    employeesWithoutScheduleToday,
    employeesWithoutPortalAccess,
    employeesWithScheduleConflicts,
    employeesWithMissingShift,
    employeesWithMissingSite,
    hasMoreSetupIssues,
  } = data;

  const missingPortalCount = employeesWithoutPortalAccess.length;
  const conflictCount = employeesWithScheduleConflicts.length;
  const missingSetupCount = employeesWithMissingShift.length + employeesWithMissingSite.length;

  const totalIssues =
    employeesWithoutScheduleToday.length +
    missingPortalCount +
    conflictCount +
    missingSetupCount;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Activity size={24} className="text-[var(--smartpro-orange)]" />
        <div>
          <h1 className="text-2xl font-bold">{t("attendance.setupHealthPage.title")}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {t("attendance.setupHealthPage.description")}
          </p>
        </div>
      </div>

      {/* ── All-clear ──────────────────────────────────────────────────────── */}
      {totalIssues === 0 && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription>{t("attendance.setupHealthPage.allClear")}</AlertDescription>
        </Alert>
      )}

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.activeEmployees")}
          value={activeEmployeesCount}
          icon={<Users className="h-4 w-4" />}
          variant="ok"
        />
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.scheduledToday")}
          value={scheduledTodayCount}
          icon={<Calendar className="h-4 w-4" />}
          variant="neutral"
        />
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.missingSchedules")}
          value={missingSchedulesCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant="warn"
        />
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.missingPortalAccess")}
          value={missingPortalCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          variant="warn"
        />
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.scheduleConflicts")}
          value={conflictCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          variant="warn"
        />
        <SummaryCard
          label={t("attendance.setupHealthPage.summary.missingSetup")}
          value={missingSetupCount}
          icon={<Clock className="h-4 w-4" />}
          variant="warn"
        />
      </div>

      {/* ── Capped-list notice ─────────────────────────────────────────────── */}
      {hasMoreSetupIssues && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("attendance.setupHealthPage.hasMoreIssues")}</AlertDescription>
        </Alert>
      )}

      {/* ── Section A: Without schedule today ─────────────────────────────── */}
      <IssueSection
        title={t("attendance.setupHealthPage.sections.withoutSchedule.title")}
        emptyText={t("attendance.setupHealthPage.sections.withoutSchedule.empty")}
      >
        {employeesWithoutScheduleToday.length > 0 && (
          <div>
            {employeesWithoutScheduleToday.map((emp) => (
              <EmpRow
                key={emp.employeeId}
                name={emp.employeeName}
                sub={emp.departmentName}
                ctaLabel={t("attendance.setupHealthPage.sections.withoutSchedule.cta")}
                ctaHref={`/hr/employee-schedules?employeeId=${emp.employeeId}`}
                canFix={canManageSchedules}
                contactAdminHint={contactHint}
              />
            ))}
          </div>
        )}
      </IssueSection>

      {/* ── Section B: Without portal access ──────────────────────────────── */}
      <IssueSection
        title={t("attendance.setupHealthPage.sections.withoutPortal.title")}
        emptyText={t("attendance.setupHealthPage.sections.withoutPortal.empty")}
      >
        {employeesWithoutPortalAccess.length > 0 && (
          <div>
            {employeesWithoutPortalAccess.map((emp) => {
              const ctaLabel =
                emp.suggestedAction === "add_email"
                  ? t("attendance.setupHealthPage.sections.withoutPortal.ctaAddEmail")
                  : t("attendance.setupHealthPage.sections.withoutPortal.ctaInvite");
              return (
                <EmpRow
                  key={emp.employeeId}
                  name={emp.employeeName}
                  sub={emp.email}
                  ctaLabel={ctaLabel}
                  ctaHref={`/hr/employees`}
                  canFix={true}
                  contactAdminHint={contactHint}
                />
              );
            })}
          </div>
        )}
      </IssueSection>

      {/* ── Section C: Schedule conflicts ─────────────────────────────────── */}
      <IssueSection
        title={t("attendance.setupHealthPage.sections.conflicts.title")}
        emptyText={t("attendance.setupHealthPage.sections.conflicts.empty")}
      >
        {employeesWithScheduleConflicts.length > 0 && (
          <div>
            {employeesWithScheduleConflicts.map((emp) => (
              <EmpRow
                key={emp.employeeId}
                name={emp.employeeName}
                sub={t("attendance.setupHealthPage.sections.conflicts.scheduleCount", {
                  count: emp.scheduleCount,
                })}
                ctaLabel={t("attendance.setupHealthPage.sections.conflicts.cta")}
                ctaHref="/hr/employee-schedules"
                canFix={canManageSchedules}
                contactAdminHint={contactHint}
              />
            ))}
          </div>
        )}
      </IssueSection>

      {/* ── Section D: Missing shift template ─────────────────────────────── */}
      <IssueSection
        title={t("attendance.setupHealthPage.sections.missingShift.title")}
        emptyText={t("attendance.setupHealthPage.sections.missingShift.empty")}
      >
        {employeesWithMissingShift.length > 0 && (
          <div>
            {employeesWithMissingShift.map((emp) => (
              <EmpRow
                key={emp.employeeId}
                name={emp.employeeName}
                sub={
                  emp.scheduleId != null
                    ? t("attendance.setupHealthPage.sections.missingShift.scheduleId", {
                        id: emp.scheduleId,
                      })
                    : undefined
                }
                ctaLabel={t("attendance.setupHealthPage.sections.missingShift.cta")}
                ctaHref="/hr/attendance/shift-templates"
                canFix={canManageShifts}
                contactAdminHint={contactHint}
              />
            ))}
          </div>
        )}
      </IssueSection>

      {/* ── Section E: Missing attendance site ────────────────────────────── */}
      <IssueSection
        title={t("attendance.setupHealthPage.sections.missingSite.title")}
        emptyText={t("attendance.setupHealthPage.sections.missingSite.empty")}
      >
        {employeesWithMissingSite.length > 0 && (
          <div>
            {employeesWithMissingSite.map((emp) => (
              <EmpRow
                key={emp.employeeId}
                name={emp.employeeName}
                sub={
                  emp.scheduleId != null
                    ? t("attendance.setupHealthPage.sections.missingSite.scheduleId", {
                        id: emp.scheduleId,
                      })
                    : undefined
                }
                ctaLabel={t("attendance.setupHealthPage.sections.missingSite.cta")}
                ctaHref="/hr/attendance/sites"
                canFix={canManageSites}
                contactAdminHint={contactHint}
              />
            ))}
          </div>
        )}
      </IssueSection>
    </div>
  );
}

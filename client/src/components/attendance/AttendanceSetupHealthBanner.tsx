import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Settings, Users, MapPin, Clock, Calendar, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { Capabilities } from "@/hooks/useMyCapabilities";

type BlockerKey =
  | "no_active_employees"
  | "no_employees_with_portal_access"
  | "no_attendance_sites"
  | "no_shift_templates"
  | "no_schedules_today";

const BLOCKER_ICON: Record<BlockerKey, React.ReactNode> = {
  no_active_employees: <Users className="h-4 w-4" />,
  no_employees_with_portal_access: <Users className="h-4 w-4" />,
  no_attendance_sites: <MapPin className="h-4 w-4" />,
  no_shift_templates: <Clock className="h-4 w-4" />,
  no_schedules_today: <Calendar className="h-4 w-4" />,
};

const BLOCKER_ROUTE: Record<BlockerKey, string> = {
  no_active_employees: "/hr/employees",
  no_employees_with_portal_access: "/hr/employees",
  no_attendance_sites: "/hr/attendance/sites",
  no_shift_templates: "/hr/attendance/shift-templates",
  no_schedules_today: "/hr/attendance/schedules",
};

/** Returns the capability required to fix a given setup blocker, or null if always allowed. */
function blockerCapability(key: BlockerKey): keyof Capabilities | null {
  switch (key) {
    case "no_attendance_sites": return "canManageAttendanceSites";
    case "no_shift_templates": return "canManageShiftTemplates";
    case "no_schedules_today": return "canManageEmployeeSchedules";
    default: return null; // employee blockers use general HR edit access
  }
}

export function AttendanceSetupHealthBanner({
  companyId,
  caps,
  className,
}: {
  companyId: number | null | undefined;
  caps?: Partial<Capabilities>;
  className?: string;
}) {
  const { t } = useTranslation("hr");

  const { data, isLoading } = trpc.attendance.getSetupHealth.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: companyId != null, staleTime: 60_000 },
  );

  if (isLoading || !data || data.blockers.length === 0) return null;

  const blockers = data.blockers as BlockerKey[];

  const hasDetailIssues =
    (data.employeesWithoutScheduleToday?.length ?? 0) > 0 ||
    (data.employeesWithoutPortalAccess?.length ?? 0) > 0 ||
    (data.employeesWithScheduleConflicts?.length ?? 0) > 0 ||
    (data.employeesWithMissingShift?.length ?? 0) > 0 ||
    (data.employeesWithMissingSite?.length ?? 0) > 0;

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        <Settings className="h-4 w-4" />
        {t("attendance.setupHealth.title")}
      </AlertTitle>
      <AlertDescription>
        <p className="mb-3 text-sm">{t("attendance.setupHealth.description")}</p>
        <ul className="space-y-2">
          {blockers.map((key) => {
            const capKey = blockerCapability(key);
            const canFix = !caps || !capKey || caps[capKey] === true;
            return (
              <li key={key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  {BLOCKER_ICON[key]}
                  {t(`attendance.setupHealth.blockers.${key}`)}
                </span>
                {canFix ? (
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs shrink-0">
                    <Link href={BLOCKER_ROUTE[key]}>
                      {t("attendance.setupHealth.fixCta")}
                    </Link>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("attendance.setupHealth.contactAdminHint")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {hasDetailIssues && (
          <div className="mt-3">
            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Link href="/hr/attendance/setup-health">
                <ExternalLink className="h-3 w-3" />
                {t("attendance.setupHealth.viewAffected")}
              </Link>
            </Button>
          </div>
        )}
        {data.holidayToday && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("attendance.setupHealth.holidayTodayNote")}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

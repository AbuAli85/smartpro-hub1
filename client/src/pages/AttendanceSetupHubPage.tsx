import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HubBreadcrumb } from "@/components/hub/HubBreadcrumb";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Circle,
  Clock,
  ListTodo,
  MapPin,
  QrCode,
  SunMedium,
  XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = "done" | "pending" | "blocked";

interface SetupStep {
  key: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  status: StepStatus;
}

interface NextAction {
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLOCKER_PRIORITY = [
  "no_active_employees",
  "no_attendance_sites",
  "no_shift_templates",
  "no_schedules_today",
  "no_employees_with_portal_access",
] as const;

const NEXT_ACTION_MAP: Record<string, NextAction> = {
  no_active_employees: {
    label: "Add active employees",
    description:
      "No active employees found. Add at least one employee before configuring attendance.",
    href: "/hr/employees",
    ctaLabel: "Manage employees",
  },
  no_attendance_sites: {
    label: "Create your first attendance site",
    description:
      "Attendance sites define where employees can check in. Add at least one site with a location or QR code.",
    href: "/hr/attendance-sites",
    ctaLabel: "Add attendance site",
  },
  no_shift_templates: {
    label: "Create a shift template",
    description:
      "Shift templates define working hours and break rules. Create at least one before assigning employee schedules.",
    href: "/hr/shift-templates",
    ctaLabel: "Create shift template",
  },
  no_schedules_today: {
    label: "Assign employee schedules",
    description:
      "Active employees have no schedule for today. Assign each employee a site and shift so attendance can be tracked.",
    href: "/hr/employee-schedules",
    ctaLabel: "Assign schedules",
  },
  no_employees_with_portal_access: {
    label: "Invite employees to the portal",
    description:
      "Employees need portal access to check in via QR code. Send invitations from the employee list.",
    href: "/hr/employees",
    ctaLabel: "Manage employees",
  },
};

function deriveNextAction(blockers: string[]): NextAction | null {
  for (const key of BLOCKER_PRIORITY) {
    if (blockers.includes(key)) return NEXT_ACTION_MAP[key] ?? null;
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AttendanceSetupHubPage() {
  const { activeCompanyId } = useActiveCompany();
  const currentYear = new Date().getFullYear();

  const { data: health, isLoading: healthLoading } =
    trpc.attendance.getSetupHealth.useQuery(
      { companyId: activeCompanyId ?? undefined },
      { enabled: activeCompanyId != null, staleTime: 30_000 },
    );

  const { data: holidays, isLoading: holidaysLoading } =
    trpc.scheduling.listHolidays.useQuery(
      { companyId: activeCompanyId ?? undefined, year: currentYear },
      { enabled: activeCompanyId != null },
    );

  const isLoading = healthLoading || holidaysLoading;

  const sitesCount = health?.attendanceSitesCount ?? 0;
  const shiftsCount = health?.activeShiftTemplatesCount ?? 0;
  const scheduledToday = health?.scheduledTodayCount ?? 0;
  const unscheduled = health?.missingSchedulesCount ?? 0;
  const activeEmps = health?.activeEmployeesCount ?? 0;
  const holidayCount = holidays?.length ?? 0;
  const blockers = health?.blockers ?? [];
  const canTrack = health?.canTrackToday ?? false;

  const steps: SetupStep[] = [
    {
      key: "sites",
      label: "Attendance Sites",
      description:
        sitesCount > 0
          ? `${sitesCount} active site${sitesCount !== 1 ? "s" : ""} configured`
          : "No active sites — employees cannot check in yet",
      href: "/hr/attendance-sites",
      ctaLabel: sitesCount > 0 ? "Manage sites" : "Add site",
      status: sitesCount > 0 ? "done" : "pending",
    },
    {
      key: "shifts",
      label: "Shift Templates",
      description:
        shiftsCount > 0
          ? `${shiftsCount} active shift template${shiftsCount !== 1 ? "s" : ""}`
          : "No shift templates — define working hours before assigning schedules",
      href: "/hr/shift-templates",
      ctaLabel: shiftsCount > 0 ? "Manage shifts" : "Create shift",
      status: shiftsCount > 0 ? "done" : "pending",
    },
    {
      key: "schedules",
      label: "Employee Schedules",
      description:
        activeEmps === 0
          ? "No active employees to schedule"
          : unscheduled === 0
            ? "All active employees have a schedule for today"
            : `${unscheduled} employee${unscheduled !== 1 ? "s" : ""} without a schedule today`,
      href: "/hr/employee-schedules",
      ctaLabel: unscheduled > 0 ? "Assign schedules" : "Manage schedules",
      status: activeEmps > 0 && unscheduled === 0 ? "done" : "pending",
    },
    {
      key: "holidays",
      label: "Holiday Calendar",
      description:
        holidayCount > 0
          ? `${holidayCount} holiday${holidayCount !== 1 ? "s" : ""} configured for ${currentYear}`
          : `No holidays set for ${currentYear} — optional but recommended`,
      href: "/hr/holidays",
      ctaLabel: holidayCount > 0 ? "Manage holidays" : "Add holidays",
      status: holidayCount > 0 ? "done" : "pending",
    },
    {
      key: "checkin",
      label: "QR Check-in Ready",
      description: canTrack
        ? "All prerequisites met — employees can now check in via QR code"
        : blockers.length > 0
          ? "Complete the steps above to enable QR check-in"
          : "Verify site QR codes work before going live",
      href: "/hr/attendance-sites",
      ctaLabel: "View QR sites",
      status: canTrack ? "done" : blockers.length > 0 ? "blocked" : "pending",
    },
  ];

  const nextAction = health != null ? deriveNextAction(blockers) : null;
  const allDone = !isLoading && blockers.length === 0 && activeEmps > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <HubBreadcrumb
        items={[
          { label: "Home", href: "/dashboard" },
          { label: "Attendance", href: "/hr/attendance" },
          { label: "Attendance Setup" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ListTodo className="h-7 w-7 text-primary" />
          Attendance Setup
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure sites, shifts, and schedules before your team starts checking in.
        </p>
      </div>

      {/* ── Readiness strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <ReadinessTile
          label="Active sites"
          value={isLoading ? null : sitesCount}
          positive={sitesCount > 0}
        />
        <ReadinessTile
          label="Shift templates"
          value={isLoading ? null : shiftsCount}
          positive={shiftsCount > 0}
        />
        <ReadinessTile
          label="Scheduled today"
          value={isLoading ? null : scheduledToday}
          positive={scheduledToday > 0}
        />
        <ReadinessTile
          label="Unscheduled"
          value={isLoading ? null : unscheduled}
          positive={unscheduled === 0}
          invertColor
        />
        <ReadinessTile
          label="Holidays this year"
          value={isLoading ? null : holidayCount}
          positive={holidayCount > 0}
        />
      </div>

      {/* ── All-clear banner ─────────────────────────────────────────────── */}
      {allDone && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 px-4 py-3 flex items-start gap-3 text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Attendance setup is complete</p>
            <p className="text-xs opacity-80 mt-0.5">
              All configuration steps are done. Employees can check in using QR codes.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 gap-1 border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-200"
          >
            <Link href="/hr/attendance">
              Open attendance <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* ── Next step card ───────────────────────────────────────────────── */}
      {!isLoading && !allDone && nextAction != null && (
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" />
              Recommended next step
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="font-medium text-sm">{nextAction.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{nextAction.description}</p>
            </div>
            <Button asChild size="sm" className="gap-1">
              <Link href={nextAction.href}>
                {nextAction.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Setup checklist ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            Setup checklist
          </CardTitle>
          <CardDescription>
            Complete each step to enable full attendance tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step) => (
                <ChecklistRow key={step.key} step={step} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Setup health details link ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Per-employee health check
          </CardTitle>
          <CardDescription>
            See which employees are missing schedules, portal access, or have schedule
            conflicts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/hr/attendance/setup-health">
              Open setup health report <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Quick actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction label="Add attendance site" href="/hr/attendance-sites" icon={MapPin} />
          <QuickAction label="Create shift template" href="/hr/shift-templates" icon={Clock} />
          <QuickAction label="Assign schedule" href="/hr/employee-schedules" icon={CalendarRange} />
          <QuickAction label="Open QR sites" href="/hr/attendance-sites" icon={QrCode} />
          <QuickAction label="Holiday calendar" href="/hr/holidays" icon={SunMedium} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReadinessTile({
  label,
  value,
  positive,
  invertColor = false,
}: {
  label: string;
  value: number | null;
  positive: boolean;
  invertColor?: boolean;
}) {
  const accent = invertColor
    ? value === 0
      ? "text-emerald-600"
      : "text-amber-600"
    : positive
      ? "text-emerald-600"
      : "text-muted-foreground";

  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-tight">
        {label}
      </p>
      {value === null ? (
        <Skeleton className="h-7 w-10 mt-1" />
      ) : (
        <p className={`text-xl font-bold tabular-nums mt-0.5 ${accent}`}>{value}</p>
      )}
    </div>
  );
}

function ChecklistRow({ step }: { step: SetupStep }) {
  const statusIcon = {
    done: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
    pending: <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />,
    blocked: <XCircle className="h-5 w-5 text-muted-foreground/25 shrink-0" />,
  }[step.status];

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        step.status === "blocked" ? "bg-muted/10 opacity-60" : "bg-muted/20"
      }`}
    >
      {statusIcon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{step.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.description}</p>
      </div>
      {step.status === "blocked" ? (
        <Button size="sm" variant="ghost" className="shrink-0 h-7 text-xs" disabled>
          {step.ctaLabel}
        </Button>
      ) : (
        <Button
          asChild
          size="sm"
          variant={step.status === "done" ? "ghost" : "outline"}
          className="shrink-0 h-7 text-xs gap-1"
        >
          <Link href={step.href}>
            {step.ctaLabel}
            {step.status === "pending" && <ArrowRight className="h-3 w-3" />}
          </Link>
        </Button>
      )}
    </div>
  );
}

function QuickAction({
  label,
  href,
  icon: Icon,
}: {
  label: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link href={href}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}

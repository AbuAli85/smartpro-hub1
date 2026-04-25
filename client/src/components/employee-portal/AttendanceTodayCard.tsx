import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fmtDateLong } from "@/lib/dateUtils";
import {
  getCheckInDenialPresentation,
  checkInDenialCardAccentClass,
  checkInDenialInlineBadgeClass,
  checkInDenialSeverityPlainLabel,
} from "@/lib/attendanceDenialHints";
import { toastAttendanceMutationError } from "@/lib/attendanceMutationFeedback";
import {
  getAttendanceTodayStripPresentation,
  type ServerEligibilityHints,
} from "@/lib/employeePortalOverviewPresentation";
import { groupAttendanceRecords } from "@/lib/employeeAttendanceState";
import { CheckInEligibilityReasonCode } from "@shared/attendanceCheckInEligibility";
import { buildEmployeeTodayAttendanceStatus } from "@shared/employeeTodayAttendanceStatus";
import { shouldOfferManualAttendanceFallback } from "@shared/manualAttendanceFallback";
import {
  SHIFT_STATUS_LABEL,
  type TodayShiftEntry,
} from "@shared/employeeDayShiftStatus";
import { CHECKOUT_COMPLETION_THRESHOLD_PERCENT } from "@shared/attendanceCheckoutPolicy";
import {
  UserCheck,
  Clock,
  LogIn,
  AlertCircle,
  MapPin,
  Calendar,
  CalendarCheck,
  ChevronRight,
  ListChecks,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function formatTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return fmtDateLong(ts);
}

function formatShiftDisplayName(name: string | null | undefined): string {
  if (!name?.trim()) return "Shift";
  return name.replace(/\bshfit\b/gi, "shift").trim();
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

// ---------------------------------------------------------------------------
// Per-shift row used inside AttendanceTodayCard multi-shift panel
// ---------------------------------------------------------------------------

export function TodayShiftRow({
  shift,
  openShiftName,
  onCheckIn,
  onCheckOut,
  mutating,
}: {
  shift: TodayShiftEntry & { isActiveShift?: boolean };
  openShiftName: string | null;
  onCheckIn: () => void;
  onCheckOut: () => void;
  mutating: boolean;
}) {
  const cfg = SHIFT_STATUS_LABEL[shift.status];
  const isActive = !!shift.isActiveShift;
  const fmt = (d: Date) =>
    new Date(d).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Muscat",
    });

  const windowOpensAt = (() => {
    try {
      const [h, m] = shift.shiftStart.split(":").map(Number);
      const totalM = (h ?? 0) * 60 + (m ?? 0) - shift.gracePeriodMinutes;
      const adj = ((totalM % 1440) + 1440) % 1440;
      return `${String(Math.floor(adj / 60)).padStart(2, "0")}:${String(adj % 60).padStart(2, "0")}`;
    } catch {
      return shift.shiftStart;
    }
  })();

  const blockedByOpenShift =
    shift.status === "window_open" && !shift.canCheckIn && !shift.checkIn && !!openShiftName;

  return (
    <div
      className={[
        "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors",
        isActive
          ? "border-green-400/60 bg-green-50/60 dark:border-green-700/50 dark:bg-green-950/20"
          : "border-border/70 bg-background/60",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {isActive && (
            <span
              aria-label="Currently active shift"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500"
            />
          )}
          <span className="text-sm font-medium">{shift.shiftName ?? "Shift"}</span>
          <span className="text-xs text-muted-foreground">
            {shift.shiftStart}–{shift.shiftEnd}
          </span>
          <Badge
            variant="outline"
            className={`h-5 border py-0 text-[10px] font-semibold ${cfg.badgeClass}`}
          >
            {cfg.label}
          </Badge>
        </div>
        {shift.checkIn && (
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              In:{" "}
              <span className="font-medium text-foreground">{fmt(new Date(shift.checkIn))}</span>
            </span>
            {shift.checkOut ? (
              <span>
                Out:{" "}
                <span className="font-medium text-foreground">{fmt(new Date(shift.checkOut))}</span>
              </span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-300">Not checked out</span>
            )}
            {shift.durationMinutes != null && <span>{shift.durationMinutes}m</span>}
          </div>
        )}
        {shift.status === "early_checkout" && shift.earlyMinutes != null && (
          <p className="text-[11px] font-medium text-orange-700 dark:text-orange-300">
            Checked out early &middot; {shift.earlyMinutes} min short of completion
          </p>
        )}
        {!shift.checkIn && shift.status === "upcoming" && (
          <p className="text-xs text-muted-foreground">Window opens {windowOpensAt}</p>
        )}
        {blockedByOpenShift && (
          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
            Check out from <span className="font-semibold">{openShiftName}</span> first
          </p>
        )}
        {shift.siteName && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {shift.siteName}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        {shift.canCheckIn && (
          <Button
            size="sm"
            className="min-h-8 gap-1.5 bg-green-600 text-xs font-semibold text-white hover:bg-green-700 touch-manipulation"
            disabled={mutating}
            onClick={onCheckIn}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Check in
          </Button>
        )}
        {shift.canCheckOut && (
          <Button
            size="sm"
            variant="destructive"
            className="min-h-8 text-xs font-semibold touch-manipulation"
            disabled={mutating}
            onClick={onCheckOut}
          >
            <LogIn className="h-3.5 w-3.5 rotate-180" aria-hidden />
            Check out
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance log grouped by shift
// ---------------------------------------------------------------------------

export function AttendanceLogGrouped({
  realAttRecords,
  attRecords,
}: {
  realAttRecords: any[];
  attRecords: any[];
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groups = groupAttendanceRecords(realAttRecords);

  const canonicalCfg = (status: string): { label: string; cls: string; dotCls: string } => {
    if (status === "in_progress") {
      return { label: "Active", cls: "border-green-300 text-green-700 bg-green-50 dark:bg-green-900/15", dotCls: "bg-green-500" };
    }
    if (status === "completed" || status === "early_checkout" || status === "checked_out") {
      return { label: "Completed", cls: "border-emerald-300 text-emerald-700 bg-emerald-50", dotCls: "bg-emerald-500" };
    }
    return { label: status, cls: "border-gray-300 text-gray-600 bg-gray-50", dotCls: "bg-gray-400" };
  };

  const renderRecord = (r: any, isSub = false) => {
    const cout = r.checkOut ? new Date(r.checkOut) : null;
    const cin = new Date(r.checkIn);
    const dMin = cout ? Math.round((cout.getTime() - cin.getTime()) / 60_000) : null;
    const dur = dMin != null ? (dMin >= 60 ? `${Math.floor(dMin / 60)}h ${dMin % 60}m` : `${dMin}m`) : null;
    const status: string = r.completionStatus ?? (cout ? "checked_out" : "in_progress");
    const cfg = canonicalCfg(status);

    return (
      <div
        key={`rec-${r.id}`}
        className={`flex items-start justify-between py-2 text-sm gap-2 ${isSub ? "pl-5 opacity-80" : ""}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-2 h-7 rounded-full shrink-0 mt-0.5 ${cfg.dotCls}`} />
          <div className="min-w-0">
            {!isSub && (
              <p className="font-medium">
                {cin.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                {r.shiftName && (
                  <span className="ml-2 text-[10px] font-semibold text-primary/80">
                    {r.shiftName}
                    {r.shiftStart && r.shiftEnd ? ` ${r.shiftStart}–${r.shiftEnd}` : ""}
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              In: {formatTime(r.checkIn)}
              {cout ? ` · Out: ${formatTime(r.checkOut)}` : " · Open session"}
              {r.siteName ? ` · ${r.siteName}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          {dur && <p className="text-sm font-semibold text-green-700">{dur}</p>}
          <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>
            {cfg.label}
          </Badge>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.groupKey} className="border-b last:border-0">
          {renderRecord(group.primary, false)}
          {group.earlier.length > 0 && (
            <div className="pb-1.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.groupKey)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-5"
                aria-expanded={expandedGroups.has(group.groupKey)}
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 shrink-0 transition-transform",
                    expandedGroups.has(group.groupKey) && "rotate-90",
                  )}
                />
                Earlier activity ({group.earlier.length})
              </button>
              {expandedGroups.has(group.groupKey) && (
                <div className="mt-1 rounded-md border border-border/50 bg-muted/20 divide-y divide-border/40 mx-2">
                  {group.earlier.map((r) => renderRecord(r, true))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {attRecords.length > 0 && (
        <div className="pt-3 mt-1 border-t">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pb-2">
            HR record &mdash; official status
          </p>
          {attRecords.map((r: any) => (
            <div key={`hr-${r.id}`} className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-8 rounded-full shrink-0 ${
                  r.status === "present" ? "bg-green-500" :
                  r.status === "late" ? "bg-amber-400" :
                  r.status === "absent" ? "bg-red-500" :
                  r.status === "half_day" ? "bg-blue-400" :
                  r.status === "remote" ? "bg-purple-500" : "bg-gray-400"
                }`} />
                <div>
                  <p className="font-medium">
                    {formatDate(r.date)}
                    <span className="ml-3 text-[10px] font-normal text-muted-foreground uppercase tracking-wide">HR record</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.checkIn ? `In: ${formatTime(r.checkIn)}` : ""}
                    {r.checkOut ? ` · Out: ${formatTime(r.checkOut)}` : ""}
                    {!r.checkIn && !r.checkOut ? "No time recorded" : ""}
                  </p>
                </div>
              </div>
              <Badge
                variant={r.status === "present" ? "default" : r.status === "absent" ? "destructive" : "secondary"}
                className="capitalize text-xs"
              >
                {r.status?.replace("_", " ") ?? r.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
      {realAttRecords.length > 0 && attRecords.length === 0 && (
        <div className="pt-3 mt-1 border-t">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">HR record</p>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Pending HR posting
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            Your self-service records are saved. HR will post the official attendance result &mdash; usually by end of day.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Today Card
// ---------------------------------------------------------------------------

export default function AttendanceTodayCard({
  employeeId,
  companyId,
  todaySchedule,
  operationalHints,
  operationalHintsReady,
  onViewRequests,
}: {
  employeeId: number | null;
  companyId: number | null;
  todaySchedule?: any;
  operationalHints: ServerEligibilityHints | null | undefined;
  operationalHintsReady: boolean;
  onViewRequests?: () => void;
}) {
  const utils = trpc.useUtils();
  const handleCheckInRef = useRef<() => void>(() => {});
  const handleCheckOutRef = useRef<() => void>(() => {});
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualJustification, setManualJustification] = useState("");
  const [manualScheduleId, setManualScheduleId] = useState<number | null>(null);
  const [showEarlyCheckoutDialog, setShowEarlyCheckoutDialog] = useState(false);
  const [earlyCheckoutReason, setEarlyCheckoutReason] = useState("");
  const [pendingCheckoutArgs, setPendingCheckoutArgs] = useState<{
    companyId?: number;
    siteToken?: string;
    lat?: number;
    lng?: number;
  } | null>(null);
  const [corrDate, setCorrDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [corrCheckIn, setCorrCheckIn] = useState("");
  const [corrCheckOut, setCorrCheckOut] = useState("");
  const [corrReason, setCorrReason] = useState("");
  const corrDateInputRef = useRef<HTMLInputElement>(null);

  const { data: todayRec, isLoading: todayRecLoading, refetch: refetchToday } = trpc.attendance.myToday.useQuery(
    { companyId: companyId ?? undefined },
    {
      enabled: !!employeeId && companyId != null,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );
  const { data: myCorrList, refetch: refetchCorr } = trpc.attendance.myCorrections.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: !!employeeId && companyId != null },
  );
  const { data: todayShiftsData } = trpc.attendance.myTodayShifts.useQuery(
    { companyId: companyId ?? undefined },
    {
      enabled: !!employeeId && companyId != null,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  const submitCorr = trpc.attendance.submitCorrection.useMutation({
    onSuccess: () => {
      toast.success("Correction request submitted — HR will review it");
      setShowCorrForm(false);
      setCorrDate(new Date().toISOString().split("T")[0]);
      setCorrCheckIn(""); setCorrCheckOut(""); setCorrReason("");
      refetchCorr();
      utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
    },
    onError: (e) =>
      toast.error("Couldn't submit correction", {
        description: e.message || "Try again or contact HR.",
      }),
  });

  const doCheckIn = trpc.attendance.checkIn.useMutation({
    onSuccess: (data) => {
      toast.success("Checked in", { description: "Time recorded for today." });
      if (data.promoterLinkageHint) {
        toast.message("Assignment linkage", { description: (data.promoterLinkageHint as { message: string } | null)?.message ?? "" });
      }
      refetchToday();
      utils.employeePortal.getMyAttendanceRecords.invalidate();
      utils.employeePortal.getMyAttendanceSummary.invalidate();
      utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.attendance.myTodayShifts.invalidate();
    },
    onError: (e) => {
      void utils.attendance.myTodayShifts.invalidate();
      toastAttendanceMutationError(e.message, () => handleCheckInRef.current());
    },
  });

  const doCheckOut = trpc.attendance.checkOut.useMutation({
    onSuccess: async (_result, variables) => {
      await refetchToday();
      await utils.employeePortal.getMyOperationalHints.invalidate();
      const hints = await utils.employeePortal.getMyOperationalHints.fetch({
        companyId: companyId ?? undefined,
      });
      if (variables.earlyCheckoutReason) {
        toast.success("Checked out early", {
          description: "Reason recorded. HR may follow up.",
        });
      } else if (hints && !hints.allShiftsHaveClosedAttendance) {
        toast.success("Checked out", {
          description:
            "You have another shift today — check in again when it starts (or when the check-in window opens).",
        });
      } else {
        toast.success("Checked out", { description: "Your time is saved for today." });
      }
      utils.employeePortal.getMyAttendanceRecords.invalidate();
      utils.employeePortal.getMyAttendanceSummary.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.attendance.myTodayShifts.invalidate();
    },
    onError: (e) => toastAttendanceMutationError(e.message, () => handleCheckOutRef.current()),
  });

  const manualCheckInMutation = trpc.attendance.submitManualCheckIn.useMutation({
    onSuccess: () => {
      toast.success("Request sent — HR will review your manual attendance");
      setShowManualDialog(false);
      setManualJustification("");
      refetchToday();
      utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.attendance.myManualCheckIns.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.attendance.myToday.invalidate();
    },
    onError: (e) =>
      toast.error("Couldn't submit manual request", { description: e.message || "Try again or contact HR." }),
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const rawCheckIn = todayRec?.checkIn ? new Date(todayRec.checkIn) : null;
  const rawCheckOut = todayRec?.checkOut ? new Date(todayRec.checkOut) : null;
  const checkIn: Date | null = operationalHintsReady && operationalHints?.shiftCheckIn
    ? new Date(operationalHints.shiftCheckIn)
    : rawCheckIn;
  const checkOut: Date | null = operationalHintsReady && operationalHints?.shiftCheckOut
    ? new Date(operationalHints.shiftCheckOut)
    : rawCheckOut;
  const pendingCorr = (myCorrList ?? []).filter((c: any) => c.status === "pending").length;

  const hoursToday = checkIn && checkOut
    ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(1)
    : checkIn ? "Active Shift" : null;

  const shift = todaySchedule?.shift ?? null;
  const site = todaySchedule?.site ?? null;
  const isHoliday = todaySchedule?.isHoliday ?? false;
  const hasSchedule = todaySchedule?.hasSchedule ?? (!!shift);
  const isWorkingDay = todaySchedule?.isWorkingDay ?? (!isHoliday && !!shift);
  const workingDays: number[] = todaySchedule?.workingDays ?? [];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const workingDayNames = workingDays.map((d: number) => DAY_NAMES[d]).join(", ");
  const siteToken: string | null = site?.qrToken ?? null;

  const attStrip = getAttendanceTodayStripPresentation({
    hasSchedule,
    isWorkingDay,
    hasShift: !!shift,
    checkIn,
    checkOut,
    shiftStartTime: shift?.startTime,
    shiftEndTime: shift?.endTime,
    workingDayNames,
    attendanceLoading: todayRecLoading,
    serverHintsReady: operationalHintsReady,
    serverHints: operationalHintsReady ? operationalHints ?? null : undefined,
  });

  const attendanceMutating = doCheckIn.isPending || doCheckOut.isPending;

  function handleCheckIn(overrideSiteToken?: string) {
    if (attendanceMutating) return;
    const token = overrideSiteToken ?? siteToken;
    if (!token) {
      toast.error("No site on your schedule - contact HR.");
      return;
    }
    const enforceGeo = overrideSiteToken ? false : !!site?.enforceGeofence;
    const collectGps = enforceGeo || !!overrideSiteToken;
    if (collectGps) {
      if (!navigator.geolocation) {
        toast.warning("This device can't share location.");
        doCheckIn.mutate({ siteToken: token });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          doCheckIn.mutate({
            siteToken: token,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => {
          toast.message("Location not shared", {
            description: "Trying without GPS. Enable Location if check-in fails.",
          });
          doCheckIn.mutate({ siteToken: token });
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
      );
    } else {
      doCheckIn.mutate({ siteToken: token });
    }
  }

  function isCheckingOutEarly(): boolean {
    const activeShift = todayShifts.find((s) => s.canCheckOut);
    if (!activeShift?.checkIn) return false;
    const workedMin = (Date.now() - new Date(activeShift.checkIn).getTime()) / 60_000;
    const [sh, sm] = activeShift.shiftStart.split(":").map(Number);
    const [eh, em] = activeShift.shiftEnd.split(":").map(Number);
    let shiftMin = (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0));
    if (shiftMin <= 0) shiftMin += 1440;
    const required = Math.ceil((shiftMin * CHECKOUT_COMPLETION_THRESHOLD_PERCENT) / 100);
    return workedMin < required;
  }

  function executeCheckOut(args: { companyId?: number; siteToken?: string; lat?: number; lng?: number; earlyCheckoutReason?: string }) {
    doCheckOut.mutate(args);
    setShowEarlyCheckoutDialog(false);
    setEarlyCheckoutReason("");
    setPendingCheckoutArgs(null);
  }

  function handleCheckOut() {
    if (attendanceMutating) return;
    const baseArgs = { companyId: companyId ?? undefined, siteToken: siteToken ?? undefined };
    const gatherGpsAndCheckout = (extraArgs?: { earlyCheckoutReason?: string }) => {
      if (site?.enforceGeofence) {
        if (!navigator.geolocation) {
          toast.warning("This device can't share location.");
          executeCheckOut({ ...baseArgs, ...extraArgs });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => executeCheckOut({ ...baseArgs, ...extraArgs, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {
            toast.message("Location not shared", {
              description: "Trying without GPS. Enable Location if check-out fails.",
            });
            executeCheckOut({ ...baseArgs, ...extraArgs });
          },
          { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
        );
      } else {
        executeCheckOut({ ...baseArgs, ...extraArgs });
      }
    };
    if (isCheckingOutEarly()) {
      setPendingCheckoutArgs(baseArgs);
      setShowEarlyCheckoutDialog(true);
    } else {
      gatherGpsAndCheckout();
    }
  }

  function handleConfirmEarlyCheckout() {
    if (!pendingCheckoutArgs) return;
    const args = pendingCheckoutArgs;
    if (site?.enforceGeofence && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => executeCheckOut({ ...args, lat: pos.coords.latitude, lng: pos.coords.longitude, earlyCheckoutReason: earlyCheckoutReason || undefined }),
        () => executeCheckOut({ ...args, earlyCheckoutReason: earlyCheckoutReason || undefined }),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
      );
    } else {
      executeCheckOut({ ...args, earlyCheckoutReason: earlyCheckoutReason || undefined });
    }
  }

  handleCheckInRef.current = handleCheckIn;
  handleCheckOutRef.current = handleCheckOut;

  const betweenShifts = attStrip.betweenShiftsPendingNext;

  const todayShifts = todayShiftsData?.shifts ?? [];
  const showMultiShiftPanel = todayShifts.length >= 2;

  const denialPresentation =
    operationalHintsReady &&
    operationalHints?.checkInDenialCode &&
    !attStrip.attendanceInconsistent &&
    !attStrip.showCheckIn &&
    (!checkIn || betweenShifts)
      ? getCheckInDenialPresentation(operationalHints.checkInDenialCode)
      : null;

  const checkoutUnavailableExplain =
    operationalHintsReady &&
    !!checkIn &&
    !checkOut &&
    !attStrip.showCheckOut &&
    !attStrip.attendanceInconsistent;

  const correctionEmphasis =
    attStrip.attendanceInconsistent ||
    !!denialPresentation?.correctionPrimary ||
    (operationalHintsReady &&
      operationalHints?.checkInDenialCode === CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT);

  const tooEarlyBlock =
    !attStrip.showCheckIn &&
    operationalHintsReady &&
    operationalHints?.checkInDenialCode === CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY &&
    !!operationalHints.checkInOpensAt &&
    (!checkIn || betweenShifts);

  const todayStatus = buildEmployeeTodayAttendanceStatus({
    hints: operationalHints,
    hintsReady: operationalHintsReady,
    attendanceInconsistent: attStrip.attendanceInconsistent,
    checkIn,
    checkOut,
    isHoliday,
    hasSchedule,
    isWorkingDay,
  });

  const resolvedAttendanceSiteId = site?.id ?? operationalHints?.assignedSiteId ?? undefined;

  const manualFallbackCta =
    operationalHintsReady &&
    !isHoliday &&
    shouldOfferManualAttendanceFallback({
      denialCode: operationalHints?.checkInDenialCode,
      hasPendingManualCheckIn: !!operationalHints?.hasPendingManualCheckIn,
      canCheckIn: !!operationalHints?.canCheckIn,
      siteId: resolvedAttendanceSiteId,
    }) &&
    !tooEarlyBlock &&
    !attStrip.attendanceInconsistent &&
    !!companyId &&
    resolvedAttendanceSiteId != null;

  function openManualDialog() {
    if (operationalHints) {
      const pre = `${operationalHints.businessDate} · ${site?.name ?? "Site"} · ${operationalHints.eligibilityHeadline}. ${operationalHints.eligibilityDetail}`;
      setManualJustification((prev) => (prev.trim() ? prev : pre));
    }
    if (todayShiftsData?.shifts && todayShiftsData.shifts.length >= 2) {
      const active = todayShiftsData.shifts.find((s) => s.isActiveShift) ?? todayShiftsData.shifts[0];
      setManualScheduleId(active?.scheduleId ?? null);
    } else {
      setManualScheduleId(null);
    }
    setShowManualDialog(true);
  }

  function submitManualFromPortal() {
    const sid = site?.id ?? operationalHints?.assignedSiteId;
    if (!companyId || sid == null) return;
    const j = manualJustification.trim();
    if (j.length < 10) {
      toast.error("Please enter at least 10 characters explaining why you need manual attendance.");
      return;
    }
    const shiftIntent =
      operationalHints?.businessDate && manualScheduleId != null
        ? { requestedBusinessDate: operationalHints.businessDate, requestedScheduleId: manualScheduleId }
        : {};
    if (siteToken) {
      manualCheckInMutation.mutate({ siteToken, justification: j, ...shiftIntent });
    } else {
      manualCheckInMutation.mutate({ companyId, siteId: sid, justification: j, ...shiftIntent });
    }
  }

  const shiftProgressPct = useMemo(() => {
    if (!shift?.startTime || !shift?.endTime || !isWorkingDay) return null;
    const now = new Date();
    const toWall = (hhmm: string): Date => {
      const [h, m] = hhmm.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const start = toWall(shift.startTime);
    let end = toWall(shift.endTime);
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    const total = end.getTime() - start.getTime();
    if (total <= 0) return null;
    const elapsed = Math.max(0, Math.min(now.getTime() - start.getTime(), total));
    return Math.round((elapsed / total) * 100);
  }, [shift, isWorkingDay]);

  const isShiftActive = useMemo(() => {
    if (!shift?.startTime || !shift?.endTime || !isWorkingDay || !checkIn || !!checkOut) return false;
    return shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100;
  }, [shift, isWorkingDay, checkIn, checkOut, shiftProgressPct]);

  const shiftRenderMode: "active" | "upcoming" | "no_shift" = (() => {
    if (!hasSchedule || !shift || !isWorkingDay || isHoliday) return "no_shift";
    if (isShiftActive) return "active";
    if (operationalHintsReady && operationalHints?.resolvedShiftPhase === "active") return "active";
    if (operationalHintsReady && operationalHints?.resolvedShiftPhase === "upcoming") return "upcoming";
    if (shiftProgressPct !== null && shiftProgressPct <= 0) return "upcoming";
    if (shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100) return "active";
    return "upcoming";
  })();

  const upcomingNextShift = shiftRenderMode === "active"
    ? (todayShifts.find((s) => s.status === "upcoming") ?? null)
    : null;

  const [shiftSecondsLeft, setShiftSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!shift?.startTime || !shift?.endTime || !isWorkingDay) {
      setShiftSecondsLeft(null);
      return;
    }
    const calcRemaining = () => {
      const now = new Date();
      const toWall = (hhmm: string): Date => {
        const [h, m] = hhmm.split(":").map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return d;
      };
      const start = toWall(shift.startTime);
      let end = toWall(shift.endTime);
      if (end <= start) end = new Date(end.getTime() + 86_400_000);
      const remaining = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
      if (now.getTime() < start.getTime() || now.getTime() >= end.getTime()) {
        return null;
      }
      return remaining;
    };
    setShiftSecondsLeft(calcRemaining());
    const id = setInterval(() => setShiftSecondsLeft(calcRemaining()), 1000);
    return () => clearInterval(id);
  }, [shift, isWorkingDay]);

  const shiftCountdownLabel = useMemo(() => {
    if (shiftSecondsLeft === null || shiftSecondsLeft <= 0) return null;
    const h = Math.floor(shiftSecondsLeft / 3600);
    const m = Math.floor((shiftSecondsLeft % 3600) / 60);
    const s = shiftSecondsLeft % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }, [shiftSecondsLeft]);

  const attendanceNextStepCaption =
    todayRecLoading || isHoliday
      ? null
      : betweenShifts
        ? attStrip.showCheckIn
          ? "Tap Check in for your next shift (or when the window opens)."
          : attStrip.showCheckOut
            ? operationalHintsReady && operationalHints?.resolvedShiftPhase === "ended"
              ? "Your shift window has ended — tap Check out to save your time."
              : "Tap Check out above when you finish this block."
            : tooEarlyBlock
              ? "Check-in for your next shift opens below — wait for that time."
              : denialPresentation
                ? denialPresentation.nextStep
                : operationalHints?.eligibilityDetail ??
                  "You have another shift today — check in when it starts."
        : checkIn && checkOut
          ? operationalHintsReady && operationalHints?.allShiftsHaveClosedAttendance
            ? "Day complete — checked in and out for every shift."
            : null
          : attStrip.showCheckIn
            ? "Tap Check in above to start your time."
            : attStrip.showCheckOut
              ? operationalHintsReady && operationalHints?.resolvedShiftPhase === "ended"
                ? "Your shift window has ended — tap Check out to save your time."
                : "Tap Check out above when you leave."
              : tooEarlyBlock
                ? "Check-in opens below — wait for that time."
                : denialPresentation
                  ? denialPresentation.nextStep
                  : checkIn && !checkOut
                    ? "Still clocked in — check out when you finish."
                    : null;

  return (
    <div id="portal-attendance-today" className="scroll-mt-24 space-y-3">
      {/* Shift Banner */}
      {isHoliday ? (
        <Card className="border-purple-200 bg-purple-50/60 dark:bg-purple-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold text-purple-700 dark:text-purple-300">{todaySchedule?.holiday?.name ?? "Public Holiday"}</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">No attendance required today.</p>
            </div>
          </CardContent>
        </Card>
      ) : shiftRenderMode === "active" && shift ? (
        <Card className="border-green-400/60 bg-green-50/40 dark:border-green-600/40 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ring-2 ring-green-400/60 ring-offset-1"
                  style={{ backgroundColor: "#22c55e22" }}
                >
                  <Clock className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{formatShiftDisplayName(shift.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {shift.startTime} &ndash; {shift.endTime}
                    {site ? ` · ${site.name}` : ""}
                    {shift.gracePeriodMinutes > 0 ? ` · ${shift.gracePeriodMinutes}min grace` : ""}
                  </p>
                  {workingDayNames && (
                    <p className="text-xs text-muted-foreground mt-0.5">Working days: {workingDayNames}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right shrink-0 max-w-[160px]">
                <Badge
                  variant="outline"
                  className="text-xs border-green-400 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-300"
                >
                  Active
                </Badge>
                {operationalHintsReady && operationalHints?.shiftDetailLine && (
                  <span className="text-[10px] text-muted-foreground leading-tight">{operationalHints.shiftDetailLine}</span>
                )}
              </div>
            </div>
            {shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100 && (
              <div className="mt-3 space-y-1.5">
                {shiftCountdownLabel && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Time remaining</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-green-700 dark:text-green-400">
                      {shiftCountdownLabel}
                    </span>
                  </div>
                )}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{shift.startTime}</span>
                    <span className="font-medium text-green-700 dark:text-green-400">{shiftProgressPct}% through shift</span>
                    <span>{shift.endTime}</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-1000"
                      style={{ width: `${shiftProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : shiftRenderMode === "upcoming" && shift ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: shift?.color ? `${shift.color}22` : "#6366f122" }}
                >
                  <Clock className="w-5 h-5" style={{ color: shift?.color ?? "#6366f1" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm">{formatShiftDisplayName(shift.name)}</p>
                  <p className="text-xs text-muted-foreground">
                    {shift.startTime} &ndash; {shift.endTime}
                    {site ? ` · ${site.name}` : ""}
                    {shift.gracePeriodMinutes > 0 ? ` · ${shift.gracePeriodMinutes}min grace` : ""}
                  </p>
                  {workingDayNames && (
                    <p className="text-xs text-muted-foreground mt-0.5">Working days: {workingDayNames}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right shrink-0 max-w-[160px]">
                <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5">
                  Upcoming
                </Badge>
                {operationalHintsReady && operationalHints?.shiftDetailLine && (
                  <span className="text-[10px] text-muted-foreground leading-tight">{operationalHints.shiftDetailLine}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : todaySchedule !== undefined && todaySchedule !== null && !todaySchedule.hasSchedule ? (
        <Card className="border-muted">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">No shift assigned — contact HR.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Next shift mini-card */}
      {upcomingNextShift && (
        <Card className="border-slate-200/80 bg-slate-50/40 dark:border-slate-700/40 dark:bg-slate-950/10">
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">Next shift</p>
                <p className="text-sm font-medium truncate">{formatShiftDisplayName(upcomingNextShift.shiftName)}</p>
                <p className="text-xs text-muted-foreground">
                  {upcomingNextShift.shiftStart}&ndash;{upcomingNextShift.shiftEnd}
                  {upcomingNextShift.siteName ? ` · ${upcomingNextShift.siteName}` : ""}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] border-slate-300 text-slate-600 bg-slate-50 shrink-0">
              Upcoming
            </Badge>
          </CardContent>
        </Card>
      )}

      {operationalHintsReady && (
        <div
          className="rounded-lg border border-border/80 bg-background/80 px-3 py-2.5 shadow-sm"
          role="status"
          aria-live="polite"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Today status</p>
          <p className="text-sm font-medium text-foreground mt-0.5 leading-snug">{todayStatus.primaryLine}</p>
          {todayStatus.secondaryLine ? (
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{todayStatus.secondaryLine}</p>
          ) : null}
        </div>
      )}

      {operationalHintsReady &&
        (operationalHints?.hasPendingCorrection ||
          operationalHints?.hasPendingManualCheckIn ||
          attStrip.attendanceInconsistent) && (
        <div
          className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100 space-y-1.5"
          role="status"
        >
          <p className="font-semibold text-amber-950 dark:text-amber-50">Needs HR review</p>
          <ul className="list-disc pl-4 space-y-0.5 leading-snug">
            {operationalHints?.hasPendingCorrection ? (
              <li>Correction request pending — HR will update your times when they decide.</li>
            ) : null}
            {operationalHints?.hasPendingManualCheckIn ? (
              <li>
                Manual check-in request pending
                {operationalHints.pendingManualCheckInCount > 1
                  ? ` (${operationalHints.pendingManualCheckInCount})` : ""}
                {" "}
                — HR must approve before it counts as attendance.
              </li>
            ) : null}
            {attStrip.attendanceInconsistent ? (
              <li>Attendance data looks inconsistent — use Fix attendance so HR can correct the record.</li>
            ) : null}
          </ul>
        </div>
      )}

      {/* Today's check-in/out status card */}
      {todayRecLoading ? (
        <Card className="border-border/80">
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </CardContent>
        </Card>
      ) : (
        <Card
          className={cn(
            attStrip.usePositiveCardStyle
              ? "border-green-200 bg-green-50/50 dark:bg-green-950/10"
              : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10",
            denialPresentation ? checkInDenialCardAccentClass(denialPresentation.severity) : null,
          )}
        >
          <CardContent className="p-4">
            {attendanceNextStepCaption && (
              <p className="mb-3 text-sm font-semibold leading-snug text-foreground" role="status">
                {attendanceNextStepCaption}
              </p>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${attStrip.usePositiveCardStyle ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}
                >
                  <UserCheck className={`h-5 w-5 ${attStrip.usePositiveCardStyle ? "text-green-600" : "text-amber-600"}`} />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  {checkIn ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">In</p>
                          <p className="font-bold text-green-700 dark:text-green-400">
                            {checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        {checkOut ? (
                          <div>
                            <p className="text-xs text-muted-foreground">Out</p>
                            <p className="font-bold text-muted-foreground">
                              {checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        ) : operationalHintsReady && operationalHints?.resolvedShiftPhase === "ended" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            <span className="sr-only">Status: </span>
                            Active &mdash; check out to close
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20">
                            <span className="sr-only">Status: </span>
                            Active
                          </Badge>
                        )}
                        {hoursToday && (
                          <div>
                            <p className="text-xs text-muted-foreground">Time</p>
                            <p className="text-sm font-semibold">
                              {hoursToday}
                              {typeof hoursToday === "string" && hoursToday !== "Active Shift" ? "h" : ""}
                            </p>
                          </div>
                        )}
                      </div>
                      {operationalHintsReady &&
                        operationalHints?.resolvedShiftPhase === "ended" &&
                        checkIn &&
                        !checkOut &&
                        !betweenShifts && (
                          <p className="mt-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                            {operationalHints.shiftDetailLine ??
                              "Shift window has ended — tap Check out to save your time, or use Fix attendance if the times are wrong."}
                          </p>
                        )}
                      {operationalHintsReady &&
                        operationalHints?.minutesLateAfterGrace != null &&
                        checkIn &&
                        !checkOut && (
                          <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                            You checked in {operationalHints.minutesLateAfterGrace} min after the grace window. If HR should adjust the time, tap Fix attendance to submit a correction.
                          </p>
                        )}
                      {betweenShifts && upcomingNextShift && (
                        <p className="mt-1 text-xs leading-snug text-amber-900/90 dark:text-amber-100/90">
                          This shift is complete. Your next shift starts at {upcomingNextShift.shiftStart}
                          {upcomingNextShift.siteName ? ` · ${upcomingNextShift.siteName}` : ""}. Check in again when that window opens.
                        </p>
                      )}
                      {betweenShifts && !upcomingNextShift && shift && (
                        <p className="mt-1 text-xs leading-snug text-amber-900/90 dark:text-amber-100/90">
                          Earlier block finished. Next shift: {shift.startTime} &ndash; {shift.endTime}
                          {site?.name ? ` · ${site.name}` : ""}. Check in when that window opens.
                        </p>
                      )}
                      {denialPresentation && betweenShifts && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="mt-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-semibold",
                                checkInDenialInlineBadgeClass(denialPresentation.severity),
                              )}
                            >
                              <span className="sr-only">
                                {checkInDenialSeverityPlainLabel(denialPresentation.severity)}:{" "}
                              </span>
                              {denialPresentation.shortLabel}
                            </Badge>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {checkInDenialSeverityPlainLabel(denialPresentation.severity)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium leading-snug text-foreground">
                            {denialPresentation.nextStep}
                          </p>
                        </div>
                      )}
                      {todayRec?.siteName && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" /> {todayRec.siteName}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p
                        className={`text-sm font-semibold leading-snug ${
                          attStrip.attendanceInconsistent
                            ? "text-red-700 dark:text-red-400"
                            : !isWorkingDay && hasSchedule
                              ? "text-muted-foreground"
                              : "text-amber-800 dark:text-amber-200"
                        }`}
                      >
                        {attStrip.attendanceInconsistent ? attStrip.inconsistentHeadline : attStrip.notCheckedInHeadline}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {attStrip.attendanceInconsistent ? attStrip.inconsistentSubline : attStrip.notCheckedInSubline}
                      </p>
                      {denialPresentation && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="mt-2 rounded-md border border-border/70 bg-background/60 px-2.5 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-semibold",
                                checkInDenialInlineBadgeClass(denialPresentation.severity),
                              )}
                            >
                              <span className="sr-only">
                                {checkInDenialSeverityPlainLabel(denialPresentation.severity)}:{" "}
                              </span>
                              {denialPresentation.shortLabel}
                            </Badge>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {checkInDenialSeverityPlainLabel(denialPresentation.severity)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-medium leading-snug text-foreground">
                            {denialPresentation.nextStep}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[11rem]">
                {attStrip.showCheckIn && (
                  <Button
                    className="min-h-12 gap-2 bg-green-600 px-6 text-base font-semibold text-white hover:bg-green-700 touch-manipulation disabled:opacity-60"
                    disabled={attendanceMutating}
                    onClick={() => handleCheckIn()}
                  >
                    <UserCheck className="h-5 w-5 shrink-0" />
                    {doCheckIn.isPending ? "Checking in..." : "Check in now"}
                  </Button>
                )}
                {!attStrip.showCheckIn &&
                  (!checkIn || betweenShifts) &&
                  operationalHintsReady &&
                  operationalHints?.checkInDenialCode === CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY &&
                  operationalHints.checkInOpensAt && (
                    <div className="flex w-full flex-col gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled
                        className="min-h-12 w-full cursor-default touch-manipulation border-dashed opacity-95"
                        aria-describedby="att-too-early-hint"
                      >
                        <Clock className="h-5 w-5 shrink-0" />
                        Opens {operationalHints.checkInOpensAt}
                      </Button>
                      <p id="att-too-early-hint" className="text-center text-[10px] text-muted-foreground sm:text-left">
                        Server time &mdash; check in from then.
                      </p>
                    </div>
                  )}
                {attStrip.showCheckOut && (
                  <Button
                    className="min-h-12 gap-2 bg-red-600 px-6 text-base font-semibold text-white shadow-sm hover:bg-red-700 touch-manipulation disabled:opacity-60 dark:bg-red-700 dark:hover:bg-red-600"
                    disabled={attendanceMutating}
                    onClick={handleCheckOut}
                  >
                    <LogIn className="h-5 w-5 shrink-0 rotate-180" aria-hidden />
                    {doCheckOut.isPending ? "Checking out..." : "Check out now"}
                  </Button>
                )}
                {attStrip.showCorrectionButton && (
                  <div className="flex w-full flex-col gap-1">
                    <Button
                      variant={correctionEmphasis ? "default" : "outline"}
                      className={cn(
                        "min-h-11 gap-2 touch-manipulation disabled:opacity-60 sm:min-h-12",
                        correctionEmphasis && "ring-2 ring-primary/25",
                        !correctionEmphasis && attStrip.showCheckIn && "border-dashed",
                      )}
                      disabled={attendanceMutating}
                      onClick={() => setShowCorrForm(true)}
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" /> Fix attendance
                      {pendingCorr > 0 && (
                        <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                          {pendingCorr}
                        </span>
                      )}
                    </Button>
                    {(attStrip.showCheckIn || attStrip.showCheckOut) && !correctionEmphasis && (
                      <p className="text-center text-[10px] text-muted-foreground sm:text-left">
                        Wrong times or missed check-in? Submit a correction &mdash; HR reviews and updates your record.
                      </p>
                    )}
                  </div>
                )}
                {manualFallbackCta && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 w-full touch-manipulation border-dashed border-primary/30 bg-background text-sm font-semibold"
                    disabled={attendanceMutating || manualCheckInMutation.isPending}
                    onClick={openManualDialog}
                  >
                    Can&apos;t check in? Request manual attendance
                  </Button>
                )}
              </div>
            </div>
            {checkoutUnavailableExplain && (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <span className="font-semibold">Check-out not available yet.</span> Your session may still be opening &mdash; try refreshing in a moment. If this persists, contact HR.
              </div>
            )}
            {operationalHintsReady && (
              <p className="mt-3 border-t border-border/60 pt-2 text-[10px] leading-snug text-muted-foreground">
                Times use your schedule and company rules.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Multi-shift panel */}
      {showMultiShiftPanel && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <CalendarCheck className="h-3.5 w-3.5" />
                Today&apos;s shifts
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {todayShifts.filter((s) => s.status === "completed" || s.status === "checked_out" || s.status === "early_checkout").length}/{todayShifts.length} completed
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {(() => {
              const openShift = todayShifts.find((s) => s.status === "checked_in");
              const openShiftName = openShift?.shiftName ?? openShift?.shiftStart ?? null;
              return todayShifts.map((s) => (
                <TodayShiftRow
                  key={s.scheduleId}
                  shift={s}
                  openShiftName={openShiftName}
                  onCheckIn={() => handleCheckIn(s.siteToken ?? undefined)}
                  onCheckOut={handleCheckOut}
                  mutating={attendanceMutating}
                />
              ));
            })()}
          </CardContent>
        </Card>
      )}

      {/* Pending requests indicator — links to the Requests tab */}
      {(pendingCorr > 0 || operationalHints?.hasPendingManualCheckIn) && (
        <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 dark:text-amber-100 leading-snug">
              {[
                pendingCorr > 0 ? `${pendingCorr} correction${pendingCorr > 1 ? "s" : ""}` : null,
                operationalHints?.hasPendingManualCheckIn ? "manual attendance" : null,
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              pending HR review
            </p>
          </div>
          {onViewRequests && (
            <button
              type="button"
              onClick={onViewRequests}
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0"
            >
              See Requests
            </button>
          )}
        </div>
      )}

      {/* Manual attendance dialog */}
      <Dialog
        open={showManualDialog}
        onOpenChange={(open) => {
          setShowManualDialog(open);
          if (!open) setManualScheduleId(null);
        }}
      >
        <DialogContent aria-describedby="manual-attendance-dialog-desc">
          <DialogHeader>
            <DialogTitle>Request manual attendance</DialogTitle>
            <DialogDescription id="manual-attendance-dialog-desc">
              HR reviews every manual request before it counts as attendance. Explain what blocked normal check-in &mdash; include date and site if relevant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {operationalHints ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Date (Asia/Muscat):</span>{" "}
                  {operationalHints.businessDate}
                </p>
                {site?.name ? (
                  <p>
                    <span className="font-medium text-foreground">Site:</span> {site.name}
                  </p>
                ) : null}
                <p>
                  <span className="font-medium text-foreground">What blocked check-in:</span>{" "}
                  {operationalHints.eligibilityHeadline} &mdash; {operationalHints.eligibilityDetail}
                </p>
              </div>
            ) : null}

            {todayShiftsData && todayShiftsData.shifts.length >= 2 && (
              <div className="space-y-1.5">
                <Label htmlFor="manualShiftSelect">
                  Which shift is this request for?{" "}
                  <span className="text-muted-foreground font-normal">(required)</span>
                </Label>
                <select
                  id="manualShiftSelect"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={manualScheduleId ?? ""}
                  onChange={(e) =>
                    setManualScheduleId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">— Select a shift —</option>
                  {todayShiftsData.shifts.map((s) => (
                    <option key={s.scheduleId} value={s.scheduleId}>
                      {s.shiftName ?? "Shift"} &middot; {s.shiftStart}&ndash;{s.shiftEnd}
                      {s.siteName ? ` · ${s.siteName}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  HR uses your selection to attribute this request to the correct shift row.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="manualJustification">Your explanation (required, min. 10 characters)</Label>
              <Textarea
                id="manualJustification"
                value={manualJustification}
                onChange={(e) => setManualJustification(e.target.value)}
                rows={4}
                placeholder="Why you could not check in normally..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitManualFromPortal}
              disabled={
                manualCheckInMutation.isPending ||
                manualJustification.trim().length < 10 ||
                (todayShiftsData != null &&
                  todayShiftsData.shifts.length >= 2 &&
                  manualScheduleId == null)
              }
            >
              {manualCheckInMutation.isPending ? "Sending..." : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Early checkout confirmation dialog */}
      <Dialog
        open={showEarlyCheckoutDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowEarlyCheckoutDialog(false);
            setEarlyCheckoutReason("");
            setPendingCheckoutArgs(null);
          }
        }}
      >
        <DialogContent aria-describedby="early-checkout-dialog-desc">
          <DialogHeader>
            <DialogTitle>Checking out early?</DialogTitle>
            <DialogDescription id="early-checkout-dialog-desc">
              You are checking out before completing the required shift duration. HR will see this as an early checkout, not a completed shift.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              const s = todayShifts.find((x) => x.canCheckOut);
              if (!s) return null;
              const [sh, sm] = s.shiftStart.split(":").map(Number);
              const [eh, em] = s.shiftEnd.split(":").map(Number);
              let shiftMin = (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0));
              if (shiftMin <= 0) shiftMin += 1440;
              const required = Math.ceil((shiftMin * CHECKOUT_COMPLETION_THRESHOLD_PERCENT) / 100);
              return (
                <div className="rounded-md border bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  <p className="font-medium">{s.shiftName ?? "Shift"}: {s.shiftStart}&ndash;{s.shiftEnd}</p>
                  <p className="text-xs mt-1">
                    Minimum work required: {required} min &middot; Shift duration: {shiftMin} min
                  </p>
                </div>
              );
            })()}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="early-checkout-reason">
                Reason for early checkout{" "}
                <span className="text-muted-foreground">(optional but recommended)</span>
              </label>
              <textarea
                id="early-checkout-reason"
                className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                maxLength={500}
                placeholder="e.g. Completed tasks early, personal emergency, manager approval..."
                value={earlyCheckoutReason}
                onChange={(e) => setEarlyCheckoutReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowEarlyCheckoutDialog(false);
                setEarlyCheckoutReason("");
                setPendingCheckoutArgs(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmEarlyCheckout}
              disabled={doCheckOut.isPending}
            >
              {doCheckOut.isPending ? "Checking out..." : "Check out early"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction request dialog */}
      <Dialog open={showCorrForm} onOpenChange={setShowCorrForm}>
        <DialogContent
          aria-describedby="attendance-correction-dialog-desc"
          aria-busy={submitCorr.isPending}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => corrDateInputRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle>Request Attendance Correction</DialogTitle>
            <DialogDescription id="attendance-correction-dialog-desc">
              Wrong or missing times? This request does not change your live check-in / check-out buttons &mdash; HR reviews it separately. Track status in the list below after you send.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="corrDate">Date</Label>
              <DateInput
                ref={corrDateInputRef}
                id="corrDate"
                value={corrDate}
                onChange={(e) => setCorrDate(e.target.value)}
                max={todayStr}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="corrIn">Correct Check-in Time</Label>
                <Input id="corrIn" type="time" value={corrCheckIn} onChange={(e) => setCorrCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="corrOut">Correct Check-out Time</Label>
                <Input id="corrOut" type="time" value={corrCheckOut} onChange={(e) => setCorrCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="corrReason">Reason <span className="text-red-500">*</span></Label>
              <p id="corr-reason-hint" className="text-xs text-muted-foreground">
                At least 10 characters (required by HR).
              </p>
              <Textarea
                id="corrReason"
                value={corrReason}
                onChange={(e) => setCorrReason(e.target.value)}
                placeholder="What should HR fix?"
                rows={3}
                aria-describedby="corr-reason-hint"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrForm(false)}>Cancel</Button>
            <Button
              disabled={companyId == null || !corrReason.trim() || corrReason.trim().length < 10 || submitCorr.isPending}
              onClick={() =>
                companyId != null &&
                submitCorr.mutate({
                  companyId,
                  requestedDate: corrDate,
                  requestedCheckIn: corrCheckIn || undefined,
                  requestedCheckOut: corrCheckOut || undefined,
                  reason: corrReason,
                })
              }
            >
              {submitCorr.isPending ? "Submitting..." : "Submit correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

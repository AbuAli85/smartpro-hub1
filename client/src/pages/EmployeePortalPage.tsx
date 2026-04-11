import React, { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import {
  User, Calendar, FileText, CheckSquare, Bell, BellRing,
  Clock, AlertCircle, ChevronRight, Megaphone,
  DollarSign, LogIn, Plus, Check, X, Building2, Briefcase,
  Phone, Mail, MapPin, Shield, ChevronLeft, ChevronRight as ChevronRightIcon,
  CreditCard, UserCheck, Edit2, Save, Download, QrCode,
  AlertTriangle, Info, Wallet, Timer, BarChart2, CalendarCheck,
  FileCheck, FilePlus, ExternalLink, RefreshCw, Star, ArrowLeftRight, Repeat,
  Target, Activity, Award, ListChecks, PieChart, TrendingDown, Flame, Trophy,
  Play,
} from "lucide-react";
import { fmtDateLong, fmtDateTime } from "@/lib/dateUtils";
import { getDueUrgency } from "@/lib/taskSla";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { SignInCallbackErrorBanner } from "@/components/SignInCallbackErrorBanner";
import { SignInTroubleshootingNote } from "@/components/SignInTroubleshootingNote";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RequestsCalendar } from "@/components/RequestsCalendar";
import { DateInput } from "@/components/ui/date-input";
import { OMAN_LEAVE_PORTAL_DEFAULTS } from "@shared/omanLeavePolicyDefaults";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { cn } from "@/lib/utils";
import {
  getCheckInDenialPresentation,
  checkInDenialCardAccentClass,
  checkInDenialInlineBadgeClass,
  checkInDenialSeverityPlainLabel,
} from "@/lib/attendanceDenialHints";
import { toastAttendanceMutationError } from "@/lib/attendanceMutationFeedback";
import {
  computeProductivityScore,
  titleCaseFirstName,
} from "@/lib/employeePortalUtils";
import {
  getAttendanceTodayStripPresentation,
  getOverviewShiftCardPresentation,
  type ServerEligibilityHints,
} from "@/lib/employeePortalOverviewPresentation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmployeePortalOverview } from "@/components/employee-portal/EmployeePortalOverview";
import { EmployeePortalMoreHub } from "@/components/employee-portal/EmployeePortalMoreHub";
import { EmployeePortalBottomNav } from "@/components/employee-portal/EmployeePortalBottomNav";
import { EmployeePortalTaskCard } from "@/components/employee-portal/EmployeePortalTaskCard";
import { CheckInEligibilityReasonCode } from "@shared/attendanceCheckInEligibility";

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  emergency: "Emergency Leave",
  unpaid: "Unpaid Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  other: "Other Leave",
};

const LEAVE_TYPE_COLOR: Record<string, string> = {
  annual: "bg-blue-100 text-blue-700",
  sick: "bg-amber-100 text-amber-700",
  emergency: "bg-red-100 text-red-700",
  unpaid: "bg-slate-100 text-slate-700",
  maternity: "bg-pink-100 text-pink-700",
  paternity: "bg-purple-100 text-purple-700",
  other: "bg-gray-100 text-gray-700",
};

/** Labels aligned with `employee_documents.documentType` (HR vault → portal). */
const DOC_LABELS: Record<string, string> = {
  mol_work_permit_certificate: "MOL work permit certificate",
  passport: "Passport",
  visa: "Visa",
  resident_card: "Resident card",
  labour_card: "Labour card",
  employment_contract: "Employment contract",
  civil_id: "Civil ID",
  medical_certificate: "Medical certificate",
  photo: "Photograph",
  other: "Other",
  // Legacy / alternate keys if older rows exist
  work_permit: "Work permit",
  national_id: "National ID",
  contract: "Employment contract",
  certificate: "Certificate",
};

const DOC_ICONS: Record<string, React.ReactElement> = {
  mol_work_permit_certificate: <FileText className="w-4 h-4 text-amber-500" />,
  passport: <Shield className="w-4 h-4 text-blue-500" />,
  visa: <FileCheck className="w-4 h-4 text-green-500" />,
  resident_card: <UserCheck className="w-4 h-4 text-violet-500" />,
  labour_card: <Briefcase className="w-4 h-4 text-orange-500" />,
  employment_contract: <FileText className="w-4 h-4 text-primary" />,
  civil_id: <User className="w-4 h-4 text-purple-500" />,
  medical_certificate: <Activity className="w-4 h-4 text-teal-500" />,
  photo: <User className="w-4 h-4 text-sky-500" />,
  other: <FileText className="w-4 h-4 text-muted-foreground" />,
  work_permit: <FileText className="w-4 h-4 text-amber-500" />,
  national_id: <User className="w-4 h-4 text-purple-500" />,
  contract: <FileText className="w-4 h-4 text-primary" />,
  certificate: <Star className="w-4 h-4 text-yellow-500" />,
};

function formatTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return fmtDateLong(ts);
}

/** Normalize common typos in shift names from admin-entered data */
function formatShiftDisplayName(name: string | null | undefined): string {
  if (!name?.trim()) return "Shift";
  return name.replace(/\bshfit\b/gi, "shift").trim();
}

/** Text color for "days left" — full bucket should not look like a warning */
function leaveRemainingTone(remaining: number, total: number): string {
  if (total <= 0) return "text-foreground";
  if (remaining <= 2) return "text-red-600";
  if (remaining / total <= 0.2) return "text-amber-600";
  return "text-foreground";
}

function calcDays(start: string | Date, end: string | Date): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1;
}

function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

// ── Attendance Today Card ──────────────────────────────────────────────────
function AttendanceTodayCard({
  employeeId,
  companyId,
  todaySchedule,
  operationalHints,
  operationalHintsReady,
}: {
  employeeId: number | null;
  companyId: number | null;
  todaySchedule?: any;
  operationalHints: ServerEligibilityHints | null | undefined;
  operationalHintsReady: boolean;
}) {
  const utils = trpc.useUtils();
  const handleCheckInRef = useRef<() => void>(() => {});
  const handleCheckOutRef = useRef<() => void>(() => {});
  const [showCorrForm, setShowCorrForm] = useState(false);
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
    },
    onError: (e) =>
      toast.error("Couldn’t submit correction", {
        description: e.message || "Try again or contact HR.",
      }),
  });
  // Direct check-in / check-out mutations
  const doCheckIn = trpc.attendance.checkIn.useMutation({
    onSuccess: () => {
      toast.success("Checked in", { description: "Time recorded for today." });
      refetchToday();
      utils.employeePortal.getMyAttendanceRecords.invalidate();
      utils.employeePortal.getMyAttendanceSummary.invalidate();
      utils.employeePortal.getMyOperationalHints.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (e) => toastAttendanceMutationError(e.message, () => handleCheckInRef.current()),
  });
  const doCheckOut = trpc.attendance.checkOut.useMutation({
    onSuccess: async () => {
      await refetchToday();
      await utils.employeePortal.getMyOperationalHints.invalidate();
      const hints = await utils.employeePortal.getMyOperationalHints.fetch({
        companyId: companyId ?? undefined,
      });
      if (hints && !hints.allShiftsHaveClosedAttendance) {
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
    },
    onError: (e) => toastAttendanceMutationError(e.message, () => handleCheckOutRef.current()),
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const checkIn = todayRec?.checkIn ? new Date(todayRec.checkIn) : null;
  const checkOut = todayRec?.checkOut ? new Date(todayRec.checkOut) : null;
  const pendingCorr = (myCorrList ?? []).filter((c: any) => c.status === "pending").length;

  const hoursToday = checkIn && checkOut
    ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(1)
    : checkIn ? "Active Shift" : null;

  // Derive shift info from todaySchedule (now getMyActiveSchedule)
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

  function handleCheckIn() {
    if (attendanceMutating) return;
    if (!siteToken) {
      toast.error("No site on your schedule — contact HR.");
      return;
    }
    if (site?.enforceGeofence) {
      if (!navigator.geolocation) {
        toast.warning("This device can’t share location.");
        doCheckIn.mutate({ siteToken: siteToken! });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          doCheckIn.mutate({
            siteToken: siteToken!,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => {
          toast.message("Location not shared", {
            description: "Trying without GPS. Enable Location if check-in fails.",
          });
          doCheckIn.mutate({ siteToken: siteToken! });
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
      );
    } else {
      doCheckIn.mutate({ siteToken: siteToken! });
    }
  }

  function handleCheckOut() {
    if (attendanceMutating) return;
    if (site?.enforceGeofence) {
      if (!navigator.geolocation) {
        toast.warning("This device can’t share location.");
        doCheckOut.mutate({ companyId: companyId ?? undefined, siteToken: siteToken ?? undefined });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          doCheckOut.mutate({
            companyId: companyId ?? undefined,
            siteToken: siteToken ?? undefined,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => {
          toast.message("Location not shared", {
            description: "Trying without GPS. Enable Location if check-out fails.",
          });
          doCheckOut.mutate({ companyId: companyId ?? undefined, siteToken: siteToken ?? undefined });
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
      );
    } else {
      doCheckOut.mutate({ companyId: companyId ?? undefined, siteToken: siteToken ?? undefined });
    }
  }

  handleCheckInRef.current = handleCheckIn;
  handleCheckOutRef.current = handleCheckOut;

  const betweenShifts = attStrip.betweenShiftsPendingNext;

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

  // --- Active shift indicator helpers ---
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
    if (end <= start) end = new Date(end.getTime() + 86_400_000); // overnight
    const total = end.getTime() - start.getTime();
    if (total <= 0) return null;
    const elapsed = Math.max(0, Math.min(now.getTime() - start.getTime(), total));
    return Math.round((elapsed / total) * 100);
  }, [shift, isWorkingDay]);

  // True when now is inside the shift window and employee is clocked in (not yet out)
  const isShiftActive = useMemo(() => {
    if (!shift?.startTime || !shift?.endTime || !isWorkingDay || !checkIn || !!checkOut) return false;
    return shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100;
  }, [shift, isWorkingDay, checkIn, checkOut, shiftProgressPct]);

  // Live countdown: remaining seconds until shift end (ticks every second)
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
      // Only show countdown when inside the shift window
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
            ? "Tap Check out above when you finish this block."
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
              ? "Tap Check out above when you leave."
              : tooEarlyBlock
                ? "Check-in opens below — wait for that time."
                : denialPresentation
                  ? denialPresentation.nextStep
                  : checkIn && !checkOut
                    ? "Still clocked in — check out when you finish."
                    : null;

  return (
    <div id="portal-attendance-today" className="scroll-mt-24 space-y-3">
      {/* Shift / Schedule Banner */}
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
      ) : hasSchedule && shift ? (
        <Card className={cn(
          isWorkingDay ? "border-primary/20 bg-primary/5" : "border-muted bg-muted/30",
          isShiftActive && "border-green-400/60 bg-green-50/40 dark:border-green-600/40 dark:bg-green-950/20"
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                {/* Shift icon — pulses green when active */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    isShiftActive && "ring-2 ring-green-400/60 ring-offset-1"
                  )}
                  style={{ backgroundColor: isShiftActive ? "#22c55e22" : (shift?.color ? `${shift.color}22` : "#6366f122") }}
                >
                  <Clock className="w-5 h-5" style={{ color: isShiftActive ? "#16a34a" : (shift?.color ?? "#6366f1") }} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-sm">{formatShiftDisplayName(shift.name)}</p>
                    {/* Active Now pulsing badge */}
                    {isShiftActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-600" />
                        </span>
                        Active Now
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {shift.startTime} – {shift.endTime}
                    {site ? ` · ${site.name}` : ""}
                    {shift.gracePeriodMinutes > 0 ? ` · ${shift.gracePeriodMinutes}min grace` : ""}
                  </p>
                  {workingDayNames && (
                    <p className="text-xs text-muted-foreground mt-0.5">Working days: {workingDayNames}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right shrink-0 max-w-[160px]">
                {operationalHintsReady && operationalHints?.shiftStatusLabel && (
                  <>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 font-medium">
                      {operationalHints.shiftStatusLabel}
                    </Badge>
                    {operationalHints.shiftDetailLine ? (
                      <span className="text-[10px] text-muted-foreground leading-tight">{operationalHints.shiftDetailLine}</span>
                    ) : null}
                  </>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    isShiftActive
                      ? "border-green-400 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-300"
                      : isWorkingDay
                        ? "border-green-300 text-green-700 bg-green-50"
                        : "border-gray-300 text-gray-600 bg-gray-50"
                  )}
                >
                  {isShiftActive ? "On Shift" : isWorkingDay ? "Working Day" : "Day Off"}
                </Badge>
              </div>
            </div>
            {/* Shift time-window progress bar + countdown — only shown during active window */}
            {isWorkingDay && shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100 && (
              <div className="mt-3 space-y-1.5">
                {/* Countdown timer row */}
                {isShiftActive && shiftCountdownLabel && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Time remaining</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-green-700 dark:text-green-400">
                      {shiftCountdownLabel}
                    </span>
                  </div>
                )}
                {/* Progress bar */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{shift.startTime}</span>
                    <span className={cn("font-medium", isShiftActive ? "text-green-700 dark:text-green-400" : "")}>
                      {shiftProgressPct}% through shift
                    </span>
                    <span>{shift.endTime}</span>
                  </div>
                  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        isShiftActive ? "bg-green-500" : "bg-primary/50"
                      )}
                      style={{ width: `${shiftProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
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

      {operationalHintsReady && operationalHints?.hasPendingCorrection && (
        <div
          className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          Correction pending — HR will update your record.
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
                        ) : (
                          <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:bg-green-900/20">
                            <span className="sr-only">Status: </span>
                            On shift
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
                        operationalHints?.minutesLateAfterGrace != null &&
                        checkIn &&
                        !checkOut && (
                          <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                            You checked in {operationalHints.minutesLateAfterGrace} min after the grace window — use Fix
                            attendance if HR should adjust the record.
                          </p>
                        )}
                      {betweenShifts && shift && (
                        <p className="mt-1 text-xs leading-snug text-amber-900/90 dark:text-amber-100/90">
                          Earlier block finished. Next shift on your schedule: {shift.startTime} – {shift.endTime}
                          {site?.name ? ` · ${site.name}` : ""}. Check in again when that shift starts.
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
                    onClick={handleCheckIn}
                  >
                    <UserCheck className="h-5 w-5 shrink-0" />
                    {doCheckIn.isPending ? "Checking in…" : "Check in now"}
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
                        Server time — check in from then.
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
                    {doCheckOut.isPending ? "Checking out…" : "Check out now"}
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
                        Wrong times? HR reviews corrections.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {checkoutUnavailableExplain && (
              <div
                role="status"
                aria-live="polite"
                className="mt-3 rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <span className="font-semibold">Can’t check out yet.</span> Refresh, or contact HR if you need to clock out.
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

      {/* Correction requests history */}
      {(myCorrList ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> My Correction Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(myCorrList as any[]).slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                <div>
                  <p className="font-medium">{c.requestedDate}</p>
                  {(c.requestedCheckIn || c.requestedCheckOut) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.requestedCheckIn && <span>In {String(c.requestedCheckIn).slice(0, 5)}</span>}
                      {c.requestedCheckIn && c.requestedCheckOut && <span> · </span>}
                      {c.requestedCheckOut && <span>Out {String(c.requestedCheckOut).slice(0, 5)}</span>}
                      <span className="text-[10px]"> (Asia/Muscat)</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{c.reason}</p>
                  {c.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground mt-1">With HR for review — you&apos;ll see the result here.</p>
                  )}
                  {c.status === "approved" && (
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-200/90 mt-1">
                      Approved{c.adminNote ? ` — HR note: ${c.adminNote}` : " — times updated when HR saved the decision."}
                    </p>
                  )}
                  {c.status === "rejected" && (
                    <p className="text-[11px] text-red-800 dark:text-red-200/90 mt-1">
                      Not approved{c.adminNote ? ` — HR: ${c.adminNote}` : "."} Contact HR if you disagree.
                    </p>
                  )}
                </div>
                {c.status === "pending"
                  ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50"><span className="sr-only">Status: </span>Pending</Badge>
                  : c.status === "approved"
                  ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50"><span className="sr-only">Status: </span>Approved</Badge>
                  : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50"><span className="sr-only">Status: </span>Rejected</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
              Wrong or missing times? This request does not change your live check-in / check-out buttons — HR reviews it separately. Track status in the list below after you send.
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
                })}>
              {submitCorr.isPending ? "Submitting…" : "Submit correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ── Main Component ─────────────────────────────────────────────────────────
export default function EmployeePortalPage() {
  const { user, isAuthenticated } = useAuth();
  const loginUrl = getLoginUrl();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (activeTab === "more") setActiveTab("profile");
  }, [activeTab]);
  // KPI state
  const [kpiMonth, setKpiMonth] = useState(() => new Date().getMonth() + 1);
  const [kpiYear, setKpiYear] = useState(() => new Date().getFullYear());
  const [showLogActivityDialog, setShowLogActivityDialog] = useState(false);
  const [logTargetId, setLogTargetId] = useState<number | null>(null);
  const [logTargetName, setLogTargetName] = useState("");
  const [logMetricType, setLogMetricType] = useState<string>("custom");
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logClientName, setLogClientName] = useState("");
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split("T")[0]);
  // Expense claims state
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expenseCategory, setExpenseCategory] = useState<string>("travel");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("OMR");
  const [expenseDesc, setExpenseDesc] = useState("");
  // Work log state
  const [showWorkLogDialog, setShowWorkLogDialog] = useState(false);
  const [workLogDate, setWorkLogDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [workLogHours, setWorkLogHours] = useState("");
  const [workLogDesc, setWorkLogDesc] = useState("");
  const [workLogProject, setWorkLogProject] = useState("");
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const leaveTypeSelectRef = useRef<HTMLButtonElement>(null);
  const shiftRequestTypeSelectRef = useRef<HTMLButtonElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Attendance month navigation
  const today = useMemo(() => new Date(), []);
  const [attMonth, setAttMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [attSelectedDay, setAttSelectedDay] = useState<string | null>(null);

  // Leave form
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Leave filter
  const [leaveFilter, setLeaveFilter] = useState<string>("all");

  const [empTaskDetail, setEmpTaskDetail] = useState<any | null>(null);
  const [completeTaskId, setCompleteTaskId] = useState<number | null>(null);
  // Shift request dialog
  const [showShiftRequestDialog, setShowShiftRequestDialog] = useState(false);
  const [calView, setCalView] = useState<"calendar" | "list">("calendar");
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [shiftReqType, setShiftReqType] = useState<string>("time_off");
  const [shiftReqDate, setShiftReqDate] = useState("");
  const [shiftReqEndDate, setShiftReqEndDate] = useState("");
  const [shiftReqTime, setShiftReqTime] = useState("");
  const [shiftReqReason, setShiftReqReason] = useState("");
  /** Preferred shift template id when request type is shift_change (sent as preferredShiftId). */
  const [shiftPreferredShiftId, setShiftPreferredShiftId] = useState("");
  const [shiftReqFilter, setShiftReqFilter] = useState<string>("all");
  const [shiftReqAttachmentUrl, setShiftReqAttachmentUrl] = useState<string | null>(null);
  const [shiftReqAttachmentName, setShiftReqAttachmentName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Profile edit state
  const [editingContact, setEditingContact] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");
  const [portalClock, setPortalClock] = useState(0);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { companies: myCompanies, activeCompany: activeCompanyCtx, activeCompanyId } = useActiveCompany();

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = trpc.employeePortal.getMyProfile.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: companyInfo } = trpc.employeePortal.getMyCompanyInfo.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: leaveData, isLoading: leaveLoading, refetch: refetchLeave } = trpc.employeePortal.getMyLeave.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: attData, isLoading: attLoading } = trpc.employeePortal.getMyAttendanceSummary.useQuery(
    { month: attMonth, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: realAttData } = trpc.employeePortal.getMyAttendanceRecords.useQuery(
    { month: attMonth, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: payroll, isLoading: payrollLoading } = trpc.employeePortal.getMyPayroll.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: docs, isLoading: docsLoading } = trpc.employeePortal.getMyDocuments.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null, refetchOnWindowFocus: true },
  );
  const { data: tasks, isLoading: tasksLoading } = trpc.employeePortal.getMyTasks.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: isAuthenticated && activeCompanyId != null,
      refetchOnWindowFocus: true,
      refetchInterval: 120_000,
      refetchIntervalInBackground: false,
    },
  );
  const { data: announcements } = trpc.employeePortal.getMyAnnouncements.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: notifData, refetch: refetchNotifs } = trpc.employeePortal.getMyNotifications.useQuery(
    { limit: 30, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null, refetchInterval: 30000 },
  );
  const { data: myActiveSchedule } = trpc.scheduling.getMyActiveSchedule.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated, refetchOnWindowFocus: true, refetchInterval: 120_000, refetchIntervalInBackground: false },
  );
  const { data: todayAttendanceRecord, isLoading: todayAttendanceLoading } = trpc.attendance.myToday.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: isAuthenticated && activeCompanyId != null,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );
  const { data: operationalHints, isSuccess: operationalHintsSuccess } =
    trpc.employeePortal.getMyOperationalHints.useQuery(
      { companyId: activeCompanyId ?? undefined },
      { enabled: isAuthenticated }
    );
  const { data: workStatusSummary, isLoading: workStatusLoading } =
    trpc.employeePortal.getMyWorkStatusSummary.useQuery(
      { companyId: activeCompanyId ?? undefined },
      {
        enabled: isAuthenticated && activeCompanyId != null,
        refetchOnWindowFocus: true,
        // Poll only this compact summary — not getMyDocuments / getMyTasks — unless a concrete
        // UX issue requires list polling; those lists still refresh on window focus.
        refetchInterval: 90_000,
        refetchIntervalInBackground: false,
      }
    );
  const { data: overviewCorrectionList } = trpc.attendance.myCorrections.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: myShiftRequests } = trpc.shiftRequests.listMine.useQuery(
    {}, { enabled: isAuthenticated }
  );
  const { data: shiftTemplatesList } = trpc.scheduling.listShiftTemplates.useQuery(
    {}, { enabled: isAuthenticated, retry: false }
  );
  // KPI queries
  const { data: myKpiProgress, refetch: refetchKpi } = trpc.kpi.getMyProgress.useQuery(
    { month: kpiMonth, year: kpiYear, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: myKpiLogs, refetch: refetchKpiLogs } = trpc.kpi.listMyLogs.useQuery(
    { month: kpiMonth, year: kpiYear, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  const { data: kpiLeaderboard } = trpc.kpi.getLeaderboard.useQuery(
    { month: kpiMonth, year: kpiYear, companyId: activeCompanyId ?? undefined },
    { enabled: isAuthenticated && activeCompanyId != null },
  );
  // KPI mutations
  const logActivityMut = trpc.kpi.logActivity.useMutation({
    onSuccess: () => {
      toast.success("Activity logged successfully!");
      setShowLogActivityDialog(false);
      setLogValue(""); setLogNote(""); setLogClientName(""); setLogMetricType("custom");
      refetchKpi(); refetchKpiLogs();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Training records queries
  const { data: myTraining, refetch: refetchTraining } = trpc.financeHR.myTraining.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const updateTrainingMut = trpc.financeHR.updateTrainingStatus.useMutation({
    onSuccess: () => { refetchTraining(); toast.success("Training status updated"); },
    onError: (e: any) => toast.error(e.message),
  });
  // Self-review queries & mutations
  const { data: mySelfReviews, refetch: refetchReviews } = trpc.financeHR.mySelfReviews.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [reviewRating, setReviewRating] = useState(3);
  const [reviewAchievements, setReviewAchievements] = useState("");
  const [reviewGoals, setReviewGoals] = useState("");
  const submitReviewMut = trpc.financeHR.submitSelfReview.useMutation({
    onSuccess: () => {
      refetchReviews();
      setShowReviewDialog(false);
      setReviewPeriod(""); setReviewRating(3); setReviewAchievements(""); setReviewGoals("");
      toast.success("Self-review submitted successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });
  // Expense claims queries & mutations
  const { data: myExpenses, refetch: refetchExpenses } = trpc.financeHR.myExpenses.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const submitExpenseMut = trpc.financeHR.submitExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense claim submitted — awaiting approval");
      setShowExpenseDialog(false);
      setExpenseAmount(""); setExpenseDesc(""); setExpenseCategory("travel");
      refetchExpenses();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelExpenseMut = trpc.financeHR.cancelExpense.useMutation({
    onSuccess: () => { toast.success("Expense claim cancelled"); refetchExpenses(); },
    onError: (e: any) => toast.error(e.message),
  });
  // Work log queries & mutations
  const { data: myWorkLogs, refetch: refetchWorkLogs } = trpc.workLogs.listMine.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const addWorkLogMut = trpc.workLogs.submit.useMutation({
    onSuccess: () => {
      toast.success("Work log saved");
      setShowWorkLogDialog(false);
      setWorkLogHours(""); setWorkLogDesc(""); setWorkLogProject("");
      refetchWorkLogs();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const utils = trpc.useUtils();

  useEffect(() => {
    const id = window.setInterval(() => setPortalClock((c) => c + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const submitLeave = trpc.employeePortal.submitLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request sent", { description: "HR will review and notify you." });
      setShowLeaveDialog(false);
      setLeaveType("annual");
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveReason("");
      utils.employeePortal.getMyLeave.invalidate();
    },
    onError: (err) =>
      toast.error("Couldn’t send leave request", {
        description: err.message || "Check dates and try again.",
      }),
  });

  const cancelLeave = trpc.employeePortal.cancelLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request cancelled");
      utils.employeePortal.getMyLeave.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateContact = trpc.employeePortal.updateMyContactInfo.useMutation({
    onSuccess: () => {
      toast.success("Contact information updated");
      setEditingContact(false);
      refetchProfile();
    },
    onError: (err) => toast.error(err.message),
  });

  const markNotifRead = trpc.employeePortal.markNotificationRead.useMutation({
    onSuccess: () => {
      void refetchNotifs();
      void utils.employeePortal.getMyNotifications.invalidate();
    },
  });
  const markAllRead = trpc.employeePortal.markAllNotificationsRead.useMutation({
    onSuccess: () => {
      void refetchNotifs();
      void utils.employeePortal.getMyNotifications.invalidate();
    },
  });
  const completeTask = trpc.employeePortal.completeTask.useMutation({
    onSuccess: () => {
      toast.success("Task completed", { description: "Your manager can see this in Task Manager." });
      setCompleteTaskId(null);
      setEmpTaskDetail(null);
      utils.employeePortal.getMyTasks.invalidate();
      void utils.employeePortal.getMyWorkStatusSummary.invalidate();
    },
    onError: (err) =>
      toast.error("Couldn’t complete task", { description: err.message || "Try again in a moment." }),
  });
  const startTask = trpc.employeePortal.startTask.useMutation({
    onSuccess: () => {
      toast.success("Task in progress", { description: "Status updated for your manager." });
      utils.employeePortal.getMyTasks.invalidate();
      void utils.employeePortal.getMyWorkStatusSummary.invalidate();
    },
    onError: (err) =>
      toast.error("Couldn’t start task", { description: err.message || "Try again in a moment." }),
  });
  const toggleTaskChecklistItem = trpc.employeePortal.toggleTaskChecklistItem.useMutation({
    onSuccess: (data, vars) => {
      void utils.employeePortal.getMyTasks.invalidate();
      void utils.employeePortal.getMyWorkStatusSummary.invalidate();
      setEmpTaskDetail((t: any) => (t && t.id === vars.taskId ? { ...t, checklist: data.checklist } : t));
    },
    onError: (err) =>
      toast.error("Couldn’t update checklist", { description: err.message || "Try again." }),
  });
  const submitShiftRequest = trpc.shiftRequests.submit.useMutation({
    onSuccess: () => {
      toast.success("Request sent", { description: "HR will review and notify you." });
      setShowShiftRequestDialog(false);
      setShiftReqType("time_off");
      setShiftReqDate("");
      setShiftReqEndDate("");
      setShiftReqTime("");
      setShiftReqReason("");
      setShiftPreferredShiftId("");
      setShiftReqAttachmentUrl(null);
      setShiftReqAttachmentName(null);
      utils.shiftRequests.listMine.invalidate();
    },
    onError: (err) =>
      toast.error("Couldn’t send request", {
        description: err.message || "Check required fields and try again.",
      }),
  });
  const uploadShiftAttachment = trpc.shiftRequests.uploadAttachment.useMutation({
    onSuccess: (data) => {
      setShiftReqAttachmentUrl(data.url);
      toast.success("Document uploaded successfully");
    },
    onError: (err) =>
      toast.error("Upload failed", { description: err.message || "Try a smaller file or different format." }),
  });
  const cancelShiftRequest = trpc.shiftRequests.cancel.useMutation({
    onSuccess: () => {
      toast.success("Request cancelled");
      utils.shiftRequests.listMine.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const todayIsoDate = today.toISOString().split("T")[0];

  /** Time off: end before start (shown inline + blocks submit, same rule as leave). */
  const shiftRequestTimeOffRangeInvalid = useMemo(() => {
    if (shiftReqType !== "time_off" || !shiftReqDate?.trim() || !shiftReqEndDate?.trim()) return false;
    return new Date(`${shiftReqEndDate}T12:00:00`).getTime() < new Date(`${shiftReqDate}T12:00:00`).getTime();
  }, [shiftReqType, shiftReqDate, shiftReqEndDate]);

  const shiftRequestSubmitReady = useMemo(() => {
    if (!shiftReqDate?.trim()) return false;
    if (shiftReqReason.trim().length < 5) return false;
    if (shiftReqType === "time_off") {
      if (!shiftReqEndDate?.trim()) return false;
      if (shiftRequestTimeOffRangeInvalid) return false;
    }
    if (
      (shiftReqType === "early_leave" || shiftReqType === "late_arrival") &&
      !shiftReqTime?.trim()
    ) {
      return false;
    }
    return true;
  }, [
    shiftReqDate,
    shiftReqEndDate,
    shiftReqTime,
    shiftReqReason,
    shiftReqType,
    shiftRequestTimeOffRangeInvalid,
  ]);

  const shiftReasonTooShort =
    shiftReqReason.trim().length > 0 && shiftReqReason.trim().length < 5;

  // ── Derived data ──────────────────────────────────────────────────────────
  const leave = leaveData?.requests ?? [];
  const entitlements = leaveData?.entitlements ?? { ...OMAN_LEAVE_PORTAL_DEFAULTS };
  const balance = leaveData?.balance ?? { ...OMAN_LEAVE_PORTAL_DEFAULTS };
  const leaveYear = new Date().getFullYear();
  const attRecords = attData?.records ?? [];
  const attSummary = attData?.summary ?? { present: 0, absent: 0, late: 0, halfDay: 0, remote: 0, total: 0 };
  const realAttRecords = realAttData?.records ?? [];
  const realAttSummary = realAttData?.summary ?? { total: 0, hoursWorked: 0 };
  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];
  const pendingTasks = (tasks as any[] ?? []).filter((t: any) => t.status !== "completed" && t.status !== "cancelled").length;
  const pendingLeave = leave.filter((l: any) => l.status === "pending").length;
  const pendingShiftRequestsCount = (myShiftRequests ?? []).filter((r: any) => r.request?.status === "pending").length;
  const pendingExpensesCount = (myExpenses ?? []).filter((e: any) => e.expenseStatus === "pending").length;
  const trainingAttentionCount = ((myTraining as any[]) ?? []).filter(
    (t: any) => t.trainingStatus === "assigned" || t.trainingStatus === "overdue",
  ).length;

  // Attendance rate for current month
  const attendanceRate = attSummary.total > 0
    ? Math.round(((attSummary.present + attSummary.late) / attSummary.total) * 100)
    : null;

  const sickDaysUsedYtd = useMemo(() => {
    return leave
      .filter(
        (l: any) =>
          l.status === "approved" &&
          l.leaveType === "sick" &&
          new Date(l.startDate).getFullYear() === leaveYear
      )
      .reduce((s: number, l: any) => s + calcDays(l.startDate, l.endDate), 0);
  }, [leave, leaveYear]);

  const productivity = useMemo(
    () =>
      computeProductivityScore({
        attendanceRatePercent: attendanceRate,
        tasks: (tasks as any[]) ?? [],
      }),
    [attendanceRate, tasks]
  );

  /** Align client “now” with server instant from operational hints (countdown / phase). */
  const serverClockSkewMs = useMemo(() => {
    if (!operationalHints?.serverNowIso) return 0;
    return new Date(operationalHints.serverNowIso).getTime() - Date.now();
  }, [operationalHints?.serverNowIso]);

  const pendingOverviewCorrections = useMemo(() => {
    if (operationalHints) return operationalHints.pendingCorrectionCount;
    if (operationalHintsSuccess) return 0;
    return (overviewCorrectionList ?? []).filter((c: { status?: string }) => c.status === "pending").length;
  }, [operationalHints, operationalHintsSuccess, overviewCorrectionList]);

  const shiftOverview = useMemo(() => {
    const sh = myActiveSchedule?.shift as { startTime?: string; endTime?: string } | undefined;
    const now = new Date(Date.now() + serverClockSkewMs);
    return getOverviewShiftCardPresentation({
      startTime: sh?.startTime,
      endTime: sh?.endTime,
      now,
      attendanceLoading: todayAttendanceLoading,
      checkIn: todayAttendanceRecord?.checkIn,
      checkOut: todayAttendanceRecord?.checkOut,
      pendingCorrectionCount: pendingOverviewCorrections,
      serverHintsReady: operationalHintsSuccess,
      serverHints: operationalHintsSuccess ? operationalHints ?? null : undefined,
    });
  }, [
    myActiveSchedule?.shift,
    portalClock,
    serverClockSkewMs,
    todayAttendanceLoading,
    todayAttendanceRecord?.checkIn,
    todayAttendanceRecord?.checkOut,
    pendingOverviewCorrections,
    operationalHintsSuccess,
    operationalHints,
  ]);

  // Build attendance map for calendar
  const attMap = useMemo(() => {
    const m: Record<string, any> = {};
    attRecords.forEach((r: any) => {
      const key = new Date(r.date).toISOString().split("T")[0];
      m[key] = r;
    });
    return m;
  }, [attRecords]);

  // Build calendar days
  const calendarDays = useMemo(() => {
    const [y, mo] = attMonth.split("-").map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const firstDay = new Date(y, mo - 1, 1).getDay();
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${attMonth}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [attMonth]);

  function prevMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    if (d > today) return;
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const isCurrentMonth = attMonth === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    setAttSelectedDay(null);
  }, [attMonth]);

  // Filtered leave
  const filteredLeave = useMemo(() => {
    if (leaveFilter === "all") return leave;
    return leave.filter((l: any) => l.status === leaveFilter);
  }, [leave, leaveFilter]);

  /** Mobile-first grouping: today (due/overdue), upcoming, completed */
  const groupedPortalTasks = useMemo(() => {
    const all = (tasks as any[]) ?? [];
    const completed = all.filter((t: any) => t.status === "completed" || t.status === "cancelled");
    const open = all.filter((t: any) => t.status !== "completed" && t.status !== "cancelled");
    const today: any[] = [];
    const upcoming: any[] = [];
    for (const t of open) {
      const u = getDueUrgency(t.dueDate, t.status);
      if (u === "overdue" || u === "due_today") today.push(t);
      else upcoming.push(t);
    }
    today.sort((a, b) => (getDueUrgency(a.dueDate, a.status) === "overdue" ? 0 : 1) - (getDueUrgency(b.dueDate, b.status) === "overdue" ? 0 : 1));
    return { today, upcoming, completed };
  }, [tasks]);

  const portalTasksHasActiveWork =
    groupedPortalTasks.today.length > 0 || groupedPortalTasks.upcoming.length > 0;

  /** One gentle nudge per session when Command center shows actionable state (real data only) */
  useEffect(() => {
    if (activeTab !== "overview") return;
    const storageKey = "emp-portal-session-toasts";
    const getSeen = (): Record<string, boolean> => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Record<string, boolean>;
      } catch {
        return {};
      }
    };
    const mark = (id: string) => {
      try {
        const s = getSeen();
        s[id] = true;
        sessionStorage.setItem(storageKey, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    };

    if (!getSeen().checkin && shiftOverview.showMissedActiveWarning && !todayAttendanceRecord?.checkIn) {
      mark("checkin");
      toast.message("Check in for your shift", {
        description: "Open Attendance to record time.",
        action: { label: "Open", onClick: () => setActiveTab("attendance") },
      });
    }
    const overdueN = groupedPortalTasks.today.filter((t: any) => getDueUrgency(t.dueDate, t.status) === "overdue").length;
    if (!getSeen().overdue && overdueN > 0) {
      mark("overdue");
      toast.message(`${overdueN} overdue task${overdueN === 1 ? "" : "s"}`, {
        action: { label: "View", onClick: () => setActiveTab("tasks") },
      });
    }
  }, [
    activeTab,
    shiftOverview.showMissedActiveWarning,
    todayAttendanceRecord?.checkIn,
    groupedPortalTasks.today,
  ]);

  // Docs with expiry alerts
  const expiringDocs = useMemo(() => {
    return (docs as any[] ?? []).filter((d: any) => {
      if (!d.expiresAt) return false;
      const days = daysUntilExpiry(d.expiresAt);
      return days !== null && days <= 90;
    });
  }, [docs]);

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4">
          <SignInCallbackErrorBanner />
          <Card className="w-full">
            <CardContent className="pt-10 pb-10 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <LogIn className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Employee Portal</h2>
                <p className="text-sm text-muted-foreground mt-1">Sign in to access your personal workspace</p>
              </div>
              <Button asChild className="w-full">
                <a href={loginUrl}>Sign In</a>
              </Button>
              <SignInTroubleshootingNote />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    );
  }

  // ── Not linked — Company Member Portal ───────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card sticky top-0 z-20 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold text-sm">{user?.name?.[0] ?? user?.email?.[0] ?? "?"}</span>
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">{user?.name ?? user?.email}</p>
                <p className="text-xs text-muted-foreground">{companyInfo?.name ?? "Company Member"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
              <Button size="sm" variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
            </div>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800">
            <CardContent className="pt-5 pb-5">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-200">HR Profile Not Yet Linked</h3>
                  <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                    You are a member of <strong>{companyInfo?.name ?? "this company"}</strong> but your HR employee profile has not been linked yet.
                    Your payslips, leave, attendance, and documents will appear here once HR completes the setup.
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
                    Ask your HR manager to go to <strong>HR → Team Access &amp; Roles</strong> and click <strong>Grant Access</strong> next to your name.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          {companyInfo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Your Company
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Company</p><p className="font-medium mt-0.5">{companyInfo.name}</p></div>
                  <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Your Role</p><p className="font-medium mt-0.5 capitalize">{(companyInfo.role ?? "Member").replace(/_/g, " ")}</p></div>
                  {companyInfo.industry && <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Industry</p><p className="font-medium mt-0.5">{companyInfo.industry}</p></div>}
                  <div><p className="text-muted-foreground text-xs uppercase tracking-wide">Country</p><p className="font-medium mt-0.5">{companyInfo.country ?? "Oman"}</p></div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const emp = profile as any;
  const fullName = `${emp.firstName} ${emp.lastName}`;

  // ── Main Portal ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── Sticky Header ── */}
      <div className="border-b bg-card sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {emp.avatarUrl
                ? <img src={emp.avatarUrl} alt={fullName} className="w-10 h-10 rounded-full object-cover" />
                : <User className="w-5 h-5 text-primary" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                Welcome back, {titleCaseFirstName(emp.firstName)}
                <span className="ml-1 font-normal text-muted-foreground" aria-hidden>👋</span>
              </p>
              <p className="text-xs text-muted-foreground truncate" title={fullName}>
                <span className="sr-only">Full name: {fullName}. </span>
                {emp.position ?? "Employee"}{emp.department ? ` · ${emp.department}` : ""}
                {companyInfo ? ` · ${companyInfo.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {expiringDocs.length > 0 && (
              <Button variant="ghost" size="icon" className="relative" onClick={() => setActiveTab("documents")} title="Documents expiring soon">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {expiringDocs.length}
                </span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Open notifications menu">
                  {unreadCount > 0 ? <BellRing className="w-5 h-5 text-primary" /> : <Bell className="w-5 h-5" />}
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 z-50">
                <DropdownMenuLabel className="flex items-center justify-between gap-2">
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => activeCompanyId != null && markAllRead.mutate({ companyId: activeCompanyId })}
                    >
                      Mark all read
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.slice(0, 6).map((n: any) => (
                      <DropdownMenuItem
                        key={n.id}
                        className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                        onClick={() => {
                          if (!n.isRead) markNotifRead.mutate({ notificationId: n.id });
                        }}
                      >
                        <span className="flex w-full items-start justify-between gap-2 text-sm font-medium">
                          <span className="line-clamp-1">{n.title}</span>
                          {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                        <span className="text-[10px] text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer justify-center text-primary" onClick={() => setShowNotifications(true)}>
                  View all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto space-y-4 px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:space-y-5 sm:py-6 sm:pb-10">
        {myCompanies.length > 1 && (
          <Card className="border-dashed border-primary/25 bg-muted/20 ring-1 ring-primary/10">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Assigned companies</p>
                  <p className="text-xs text-muted-foreground truncate">
                    You have access to {myCompanies.length} companies. Active:{" "}
                    <span className="font-medium text-foreground">{activeCompanyCtx?.name ?? companyInfo?.name}</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground max-w-md">
                Switch organization from the company menu in the sidebar to work across your portfolio.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Main sections — bottom nav (mobile-first PWA) ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0" activationMode="automatic">
          {/* ══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-0 space-y-4 focus-visible:outline-none">
            <EmployeePortalOverview
              setActiveTab={setActiveTab}
              setShowLeaveDialog={setShowLeaveDialog}
              onOpenTaskById={(taskId) => {
                const t = (tasks as any[] | undefined)?.find((x: any) => x.id === taskId);
                if (t) setEmpTaskDetail(t);
              }}
              leaveTypeLabel={(k) => LEAVE_TYPE_LABEL[k] ?? k}
              myActiveSchedule={myActiveSchedule}
              shiftOverview={shiftOverview}
              todayAttendanceRecord={todayAttendanceRecord}
              todayAttendanceLoading={todayAttendanceLoading}
              operationalHintsReady={operationalHintsSuccess}
              operationalHints={operationalHintsSuccess ? operationalHints ?? null : undefined}
              workStatusLoading={workStatusLoading}
              workStatusSummary={workStatusSummary ?? undefined}
              productivity={productivity}
              attendanceRate={attendanceRate}
              attSummary={attSummary}
              leave={leave}
              leaveLoading={leaveLoading}
              balance={balance}
              entitlements={entitlements}
              leaveYear={leaveYear}
              tasks={tasks as any[]}
              tasksLoading={tasksLoading}
              expiringDocs={expiringDocs}
              announcements={announcements as any[]}
              notifications={notifications}
              myTraining={myTraining as any[] | undefined}
              mySelfReviews={mySelfReviews as any[] | undefined}
              emp={{
                phone: emp?.phone,
                emergencyContact: emp?.emergencyContact,
                emergencyPhone: emp?.emergencyPhone,
                department: emp?.department ?? null,
              }}
              pendingShiftRequests={pendingShiftRequestsCount}
              pendingExpenses={pendingExpensesCount}
              portalClock={portalClock}
              realAttCheckInsMonth={realAttSummary.total}
              sickDaysUsedYtd={sickDaysUsedYtd}
              pendingTasksCount={pendingTasks}
              pendingCorrectionCount={pendingOverviewCorrections}
              membershipRole={activeCompanyCtx?.role ?? null}
              employeePosition={(emp as { position?: string | null })?.position ?? null}
              unifiedShiftRequests={myShiftRequests ?? []}
              unifiedCorrections={overviewCorrectionList ?? []}
              unifiedExpenses={myExpenses ?? []}
            />
          </TabsContent>

          {/* ══ ATTENDANCE TAB ════════════════════════════════════════════════ */}
          <TabsContent value="attendance" className="mt-0 space-y-4 focus-visible:outline-none">
            {/* Today's Status + Correction Request */}
            <AttendanceTodayCard
              employeeId={emp.id}
              companyId={activeCompanyId}
              todaySchedule={myActiveSchedule}
              operationalHints={operationalHintsSuccess ? operationalHints ?? null : undefined}
              operationalHintsReady={operationalHintsSuccess}
            />

            {/* Real-time attendance stats (always visible; avoids “false empty” when month is new) */}
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <Card className="bg-green-50 dark:bg-green-950/20 border-0">
                  <CardContent className="p-2.5 text-center sm:p-3">
                    <p className="text-2xl font-bold text-green-700">{realAttSummary.total}</p>
                    <p className="text-xs text-muted-foreground">Check-ins</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 dark:bg-blue-950/20 border-0">
                  <CardContent className="p-2.5 text-center sm:p-3">
                    <p className="text-2xl font-bold text-blue-700">
                      {realAttSummary.total > 0 ? `${realAttSummary.hoursWorked}h` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Hours worked</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-950/20 border-0">
                  <CardContent className="p-2.5 text-center sm:p-3">
                    <p className="text-2xl font-bold text-purple-700">
                      {realAttSummary.total > 0
                        ? `${Math.round((realAttSummary.hoursWorked / realAttSummary.total) * 10) / 10}h`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg / day</p>
                  </CardContent>
                </Card>
              </div>
              {realAttSummary.total === 0 && isCurrentMonth && (
                <p className="px-1 text-center text-[10px] leading-snug text-muted-foreground">
                  Zeros until you check in this month.
                </p>
              )}
            </div>

            {/* Month nav + calendar */}
            <Card className="overflow-hidden">
              <CardHeader className="px-3 pb-2 pt-3 sm:px-6">
                <CardTitle className="text-sm flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-semibold">
                    {new Date(attMonth + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} disabled={isCurrentMonth}>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4 sm:px-6">
                {/* Summary pills (HR-marked attendance table — separate from self check-ins) */}
                {attSummary.total === 0 && !attLoading && (
                  <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                    HR-marked counts — can differ from your check-ins below.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { label: "Present", count: attSummary.present, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                    { label: "Absent", count: attSummary.absent, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
                    { label: "Late", count: attSummary.late, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                    { label: "Half Day", count: attSummary.halfDay, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                    { label: "Remote", count: attSummary.remote, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
                  ].map(({ label, count, color }) => (
                    <span key={label} className={`text-xs px-2.5 py-1 rounded-full font-medium ${color}`}>
                      {label}: {count}
                    </span>
                  ))}
                </div>

                {/* Calendar grid */}
                {attLoading ? (
                  <div className="grid grid-cols-7 gap-1">
                    {Array(35).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} className="text-xs font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={idx} />;
                      const rec = attMap[day];
                      const isToday = day === today.toISOString().split("T")[0];
                      const dayNum = parseInt(day.split("-")[2]);
                      const statusColors: Record<string, string> = {
                        present: "bg-green-500",
                        late: "bg-amber-500",
                        half_day: "bg-blue-400",
                        remote: "bg-purple-500",
                        absent: "bg-red-500",
                      };
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => setAttSelectedDay(day)}
                          className={`relative rounded-lg p-1.5 text-xs text-center transition-colors hover:bg-muted/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            isToday ? "ring-2 ring-primary" : ""
                          } ${attSelectedDay === day ? "bg-primary/10 ring-1 ring-primary/50" : ""}`}
                          title={rec ? `${rec.status} — In: ${formatTime(rec.checkIn)} Out: ${formatTime(rec.checkOut)}` : "View day details"}
                        >
                          <span className={`block text-xs font-medium mb-0.5 ${isToday ? "text-primary" : ""}`}>{dayNum}</span>
                          {rec && <div className={`w-2 h-2 rounded-full mx-auto ${statusColors[rec.status] ?? "bg-gray-400"}`} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {attSelectedDay && !attLoading && (() => {
                  const hrRec = attMap[attSelectedDay];
                  const scanRecs = realAttRecords.filter(
                    (r: any) => new Date(r.checkIn).toISOString().split("T")[0] === attSelectedDay
                  );
                  const label = new Date(`${attSelectedDay}T12:00:00`).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <div className="rounded-lg border bg-muted/20 p-3 mt-3 text-left space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{label}</p>
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setAttSelectedDay(null)}>
                          Close
                        </Button>
                      </div>
                      {scanRecs.length === 0 && !hrRec ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Nothing logged for this day yet.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 w-full touch-manipulation sm:w-auto"
                            onClick={() => document.getElementById("portal-attendance-today")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                          >
                            Today&apos;s card
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2 text-xs">
                          {scanRecs.map((r: any) => {
                            const cin = new Date(r.checkIn);
                            const cout = r.checkOut ? new Date(r.checkOut) : null;
                            const hours = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null;
                            return (
                              <div key={`sel-${r.id}`} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                                <p className="font-medium text-foreground">Your check-in record</p>
                                <p className="text-muted-foreground mt-0.5">
                                  In: {formatTime(r.checkIn)}
                                  {cout ? ` · Out: ${formatTime(r.checkOut)}` : " · Still active"}
                                  {hours ? ` · ${hours}h` : ""}
                                  {r.siteName ? ` · ${r.siteName}` : ""}
                                </p>
                              </div>
                            );
                          })}
                          {hrRec ? (
                            <div className="border-t border-border/60 pt-2">
                              <p className="font-medium text-foreground">HR-marked status</p>
                              <p className="text-muted-foreground mt-0.5 capitalize">
                                {(hrRec.status as string)?.replace("_", " ") ?? hrRec.status}
                                {hrRec.checkIn ? ` · In: ${formatTime(hrRec.checkIn)}` : ""}
                                {hrRec.checkOut ? ` · Out: ${formatTime(hrRec.checkOut)}` : ""}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
                  {[
                    { status: "present", color: "bg-green-500", label: "Present" },
                    { status: "late", color: "bg-amber-500", label: "Late" },
                    { status: "half_day", color: "bg-blue-400", label: "Half Day" },
                    { status: "remote", color: "bg-purple-500", label: "Remote" },
                    { status: "absent", color: "bg-red-500", label: "Absent" },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      {label}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Daily Attendance Records — combined QR + HR */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarCheck className="w-3.5 h-3.5" /> Daily Attendance Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attLoading ? (
                  <div className="space-y-2">
                    {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : realAttRecords.length === 0 && attRecords.length === 0 ? (
                  <div className="space-y-2 py-7 text-center text-muted-foreground">
                    <UserCheck className="mx-auto h-10 w-10 opacity-30" />
                    <div className="space-y-1 px-2">
                      <p className="text-sm font-medium text-foreground">No records yet</p>
                      <p className="mx-auto max-w-sm text-xs leading-snug">
                        Check in above. HR marks show here too.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-10 touch-manipulation text-sm"
                      onClick={() => document.getElementById("portal-attendance-today")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      Today&apos;s card
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* QR / direct check-in records */}
                    {realAttRecords.map((r: any) => {
                      const cin = new Date(r.checkIn);
                      const cout = r.checkOut ? new Date(r.checkOut) : null;
                      const hours = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null;
                      return (
                        <div key={`qr-${r.id}`} className="flex items-center justify-between py-2.5 border-b last:border-0 text-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-8 rounded-full shrink-0 ${cout ? "bg-green-500" : "bg-blue-400"}`} />
                            <div>
                              <p className="font-medium">{cin.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                              <p className="text-xs text-muted-foreground">
                                In: {formatTime(r.checkIn)}
                                {cout ? ` · Out: ${formatTime(r.checkOut)}` : " · Still working"}
                                {r.siteName ? ` · ${r.siteName}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right space-y-0.5">
                            {hours && <p className="text-sm font-semibold text-green-700">{hours}h</p>}
                            <Badge variant="outline" className={`text-xs ${cout ? "border-green-300 text-green-700 bg-green-50" : "border-blue-300 text-blue-700 bg-blue-50"}`}>
                              {!cout ? "In Progress" : "Present"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                    {/* HR-entered attendance records */}
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
                            <p className="font-medium">{formatDate(r.date)}</p>
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
              </CardContent>
            </Card>
            {/* ══ SHIFT CHANGE & TIME OFF REQUESTS ══════════════════════ */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-primary" /> HR requests
                  </CardTitle>
                  <Button size="sm" className="min-h-9 gap-1.5 touch-manipulation" onClick={() => setShowShiftRequestDialog(true)}>
                    <Plus className="h-3.5 w-3.5" /> New request
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Shift changes, time off, swaps — same form as the Requests tab.
                </p>
                {/* Filter */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {(["all", "pending", "approved", "rejected", "cancelled"] as const).map(f => (
                    <button key={f} onClick={() => setShiftReqFilter(f)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        shiftReqFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {(() => {
                  const allReqs = (myShiftRequests ?? []) as any[];
                  const filtered = shiftReqFilter === "all" ? allReqs : allReqs.filter((r: any) => r.request?.status === shiftReqFilter);
                  if (filtered.length === 0) return (
                    <div className="space-y-3 py-8 text-center text-muted-foreground">
                      <Repeat className="mx-auto mb-1 h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium text-foreground">No requests in this filter</p>
                      <p className="mx-auto max-w-xs text-xs leading-relaxed">Submit one to HR — approvals appear here.</p>
                      <Button type="button" size="sm" className="min-h-10 touch-manipulation" onClick={() => setShowShiftRequestDialog(true)}>
                        Submit HR request
                      </Button>
                    </div>
                  );
                  return (
                    <div className="divide-y">
                      {filtered.map((item: any) => {
                        const req = item.request ?? item;
                        const ps = item.preferredShift;
                        const statusColors: Record<string, string> = {
                          pending: "bg-amber-100 text-amber-700 border-amber-200",
                          approved: "bg-green-100 text-green-700 border-green-200",
                          rejected: "bg-red-100 text-red-700 border-red-200",
                          cancelled: "bg-gray-100 text-gray-500 border-gray-200",
                        };
                        const typeLabels: Record<string, string> = {
                          shift_change: "Shift Change",
                          time_off: "Time Off",
                          early_leave: "Early Leave",
                          late_arrival: "Late Arrival",
                          day_swap: "Day Swap",
                        };
                        return (
                          <div key={req.id} className="py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{typeLabels[req.requestType] ?? req.requestType}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[req.status] ?? "bg-muted text-muted-foreground"}`}>
                                    {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {formatDate(req.requestedDate)}
                                  {req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` → ${formatDate(req.requestedEndDate)}` : ""}
                                  {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                                  {ps ? ` · Preferred: ${ps.name} (${ps.startTime}–${ps.endTime})` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.reason}</p>
                                {req.adminNotes && (
                                  <p className="text-xs mt-1 text-primary italic">HR note: {req.adminNotes}</p>
                                )}
                              </div>
                              {req.status === "pending" && (
                                <Button size="sm" variant="ghost" className="text-xs text-red-500 hover:text-red-600 shrink-0"
                                  onClick={() => cancelShiftRequest.mutate({ id: req.id })}>
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
          {/* ══ LEAVE TAB ════════════════════════════════════════════════════ */}
          <TabsContent value="leave" className="mt-4 space-y-4">
            {/* Leave Balance Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Annual", key: "annual" as const, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                { label: "Sick", key: "sick" as const, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
                { label: "Emergency", key: "emergency" as const, color: "text-orange-700", bg: "bg-orange-50 dark:bg-orange-950/20" },
              ].map(({ label, key, color, bg }) => {
                const total = entitlements[key];
                const remaining = balance[key];
                return (
                  <Card key={label} className={`${bg} border-0`}>
                    <CardContent className="p-3 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{remaining}</p>
                      <p className="text-xs text-muted-foreground">{label} days left</p>
                      <div className="h-1 bg-white/50 dark:bg-black/10 rounded-full mt-1.5 overflow-hidden dark:bg-white/10">
                        <div
                          className={`h-full rounded-full ${color.replace("text-", "bg-")}`}
                          style={{ width: `${total > 0 ? (remaining / total) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="border-dashed bg-muted/20">
              <CardContent className="p-3 flex gap-2 text-[11px] text-muted-foreground leading-snug">
                <Info className="w-4 h-4 shrink-0 text-primary mt-0.5" aria-hidden />
                <div>
                  <p className="font-medium text-foreground">How balances work</p>
                  <p className="mt-1">
                    Days shown are <strong>approved</strong> leave used this calendar year against{" "}
                    <strong>the caps configured for your company</strong> (annual {entitlements.annual}, sick pool{" "}
                    {entitlements.sick}, emergency {entitlements.emergency}) — not a full legal calculation. Omani law allows longer medically
                    certified sick leave with tiered pay; treat the sick figure as a display limit unless HR confirms
                    otherwise.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Filter + New Request */}
            <div className="flex items-center justify-between gap-3">
              <Select value={leaveFilter} onValueChange={setLeaveFilter}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requests</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setShowLeaveDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Leave Request
              </Button>
            </div>

            {/* Leave list */}
            {leaveLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : filteredLeave.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No {leaveFilter !== "all" ? leaveFilter : ""} leave records found</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowLeaveDialog(true)}>
                  Submit your first leave request
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLeave.map((l: any) => {
                  const days = calcDays(l.startDate, l.endDate);
                  return (
                    <Card key={l.id} className={`${l.status === "pending" ? "border-amber-200" : l.status === "approved" ? "border-green-200" : l.status === "rejected" ? "border-red-200" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`px-2 py-1 rounded text-xs font-medium ${LEAVE_TYPE_COLOR[l.leaveType] ?? "bg-gray-100 text-gray-700"}`}>
                              {LEAVE_TYPE_LABEL[l.leaveType] ?? l.leaveType}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : l.status === "cancelled" ? "outline" : "secondary"}
                              className="capitalize"
                            >
                              {l.status}
                            </Badge>
                            {l.status === "pending" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                disabled={cancelLeave.isPending}
                                onClick={() =>
                                  activeCompanyId != null &&
                                  cancelLeave.mutate({ leaveId: l.id, companyId: activeCompanyId })}>
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">From</p>
                            <p className="font-medium">{formatDate(l.startDate)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">To</p>
                            <p className="font-medium">{formatDate(l.endDate)}</p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> {days} day{days !== 1 ? "s" : ""}</span>
                          {l.reason && <span className="italic truncate">"{l.reason}"</span>}
                        </div>
                        {l.notes && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 flex items-start gap-1">
                            <Info className="w-3 h-3 shrink-0 mt-0.5" /> HR Note: {l.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ PAYROLL TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="payroll" className="mt-4 space-y-4">
            {payrollLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (payroll as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">No payslips yet</p>
                <p className="text-xs mt-1">Payslips appear here once HR processes your salary</p>
              </div>
            ) : (
              <>
                {/* Latest payslip highlight */}
                {(payroll as any[]).length > 0 && (() => {
                  const latest = (payroll as any[])[0];
                  return (
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Latest Payslip</p>
                            <p className="font-semibold">
                              {new Date(latest.periodYear, latest.periodMonth - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Net Pay</p>
                            <p className="text-2xl font-bold text-primary">{latest.currency ?? "OMR"} {Number(latest.netSalary).toFixed(2)}</p>
                          </div>
                        </div>
                        <Separator className="my-3" />
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Basic</p>
                            <p className="font-medium">{latest.currency ?? "OMR"} {Number(latest.basicSalary).toFixed(2)}</p>
                          </div>
                          {Number(latest.allowances) > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">Allowances</p>
                              <p className="font-medium text-green-600">+{latest.currency ?? "OMR"} {Number(latest.allowances).toFixed(2)}</p>
                            </div>
                          )}
                          {Number(latest.deductions) > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">Deductions</p>
                              <p className="font-medium text-red-600">-{latest.currency ?? "OMR"} {Number(latest.deductions).toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <Badge variant={latest.status === "paid" ? "default" : "secondary"} className="capitalize">{latest.status}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* All payslips */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Payslips</p>
                  {(payroll as any[]).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                      <div>
                        <p className="font-medium text-sm">
                          {new Date(p.periodYear, p.periodMonth - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Basic: {p.currency ?? "OMR"} {Number(p.basicSalary).toFixed(2)}
                          {Number(p.allowances) > 0 && ` + ${Number(p.allowances).toFixed(2)}`}
                          {Number(p.deductions) > 0 && ` − ${Number(p.deductions).toFixed(2)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">{p.currency ?? "OMR"} {Number(p.netSalary).toFixed(2)}</p>
                        <Badge variant={p.status === "paid" ? "default" : "secondary"} className="capitalize text-xs mt-0.5">
                          {p.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ══ TASKS TAB — grouped: Today / Upcoming / Completed ═══════════════ */}
          <TabsContent id="portal-tasks" value="tasks" className="mt-0 space-y-4 scroll-mt-24 focus-visible:outline-none">
            <div
              className="flex items-stretch justify-between gap-2 rounded-xl border border-border/70 bg-muted/15 px-3 py-2.5 text-center sm:px-4"
              aria-label="Task counts"
            >
              {[
                { label: "Today", count: groupedPortalTasks.today.length, color: "text-amber-800 dark:text-amber-200" },
                { label: "Upcoming", count: groupedPortalTasks.upcoming.length, color: "text-blue-800 dark:text-blue-200" },
                { label: "Done", count: groupedPortalTasks.completed.length, color: "text-green-800 dark:text-green-200" },
              ].map((x, i) => (
                <div key={x.label} className={`min-w-0 flex-1 ${i > 0 ? "border-l border-border/50 pl-2 sm:pl-3" : ""}`}>
                  <p className={`text-lg font-bold tabular-nums leading-tight ${x.color}`}>{x.count}</p>
                  <p className="text-[10px] font-medium text-muted-foreground">{x.label}</p>
                </div>
              ))}
            </div>

            {tasksLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (tasks as any[] | undefined)?.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 py-10 text-center text-muted-foreground">
                <CheckSquare className="mx-auto mb-2 h-10 w-10 opacity-30" />
                <p className="font-medium text-foreground">No tasks yet</p>
                <p className="mx-auto mt-1 max-w-sm px-4 text-sm">Assigned work shows here. Command center has your priorities.</p>
                <Button className="mt-5 min-h-11" onClick={() => setActiveTab("overview")}>
                  Back to Command center
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {!portalTasksHasActiveWork && groupedPortalTasks.completed.length > 0 && (
                  <p className="rounded-md border border-border/40 bg-muted/10 px-2.5 py-1.5 text-center text-[11px] text-muted-foreground">
                    All caught up. Open <span className="font-medium text-foreground/80">Completed</span> below to review.
                  </p>
                )}
                <section className="space-y-2">
                  <h2 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Today &amp; overdue
                  </h2>
                  {groupedPortalTasks.today.length === 0 ? (
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground/90">Clear for today.</p>
                      <p className="mt-0.5 text-xs">No overdue or due today.</p>
                      {groupedPortalTasks.upcoming.length > 0 && (
                        <Button variant="link" className="mt-2 h-auto min-h-0 px-0 text-sm font-medium text-primary" onClick={() => document.getElementById("portal-upcoming-tasks")?.scrollIntoView({ behavior: "smooth" })}>
                          See upcoming
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {groupedPortalTasks.today.map((task: any, idx: number) => (
                        <EmployeePortalTaskCard
                          key={task.id}
                          task={task}
                          priorityFocus={idx === 0}
                          onOpenDetail={setEmpTaskDetail}
                          onMarkDone={(id) => setCompleteTaskId(id)}
                          onStart={(taskId) =>
                            startTask.mutate({ taskId, companyId: activeCompanyId ?? undefined })
                          }
                          startPending={startTask.isPending}
                          completePending={completeTask.isPending}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section id="portal-upcoming-tasks" className="scroll-mt-28 space-y-2">
                  <h2 className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
                  {groupedPortalTasks.upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No upcoming dates. New work will list here.</p>
                  ) : (
                    <div className="space-y-3">
                      {groupedPortalTasks.upcoming.map((task: any) => (
                        <EmployeePortalTaskCard
                          key={task.id}
                          task={task}
                          onOpenDetail={setEmpTaskDetail}
                          onMarkDone={(id) => setCompleteTaskId(id)}
                          onStart={(taskId) =>
                            startTask.mutate({ taskId, companyId: activeCompanyId ?? undefined })
                          }
                          startPending={startTask.isPending}
                          completePending={completeTask.isPending}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <details
                  className={`group rounded-lg border open:shadow-sm ${
                    portalTasksHasActiveWork
                      ? "border-border/50 bg-card/90"
                      : "border-border/40 border-dashed bg-transparent"
                  }`}
                >
                  <summary
                    className={`flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 touch-manipulation [&::-webkit-details-marker]:hidden sm:px-3 ${
                      portalTasksHasActiveWork
                        ? "min-h-10 text-xs font-medium text-muted-foreground"
                        : "min-h-9 text-[11px] font-medium text-muted-foreground/80"
                    }`}
                  >
                    <span className="text-muted-foreground/90">Completed</span>
                    <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {groupedPortalTasks.completed.length}
                    </span>
                  </summary>
                  <div className="space-y-2 border-t border-border/40 px-2.5 py-2 opacity-90 sm:px-3">
                    {groupedPortalTasks.completed.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Finished tasks appear here.</p>
                    ) : (
                      groupedPortalTasks.completed.map((task: any) => (
                        <EmployeePortalTaskCard
                          key={task.id}
                          task={task}
                          onOpenDetail={setEmpTaskDetail}
                          onMarkDone={() => undefined}
                          onStart={() => undefined}
                          startPending={false}
                          completePending={false}
                        />
                      ))
                    )}
                  </div>
                </details>
              </div>
            )}

            <AlertDialog open={completeTaskId !== null} onOpenChange={(o) => !completeTask.isPending && !o && setCompleteTaskId(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark complete?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Only if the work is done — HR sees this in Task Manager.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={completeTask.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={completeTask.isPending}
                    className="min-h-11 touch-manipulation disabled:opacity-60"
                    onClick={(e) => {
                      e.preventDefault();
                      if (completeTaskId == null || completeTask.isPending) return;
                      completeTask.mutate({
                        taskId: completeTaskId,
                        companyId: activeCompanyId ?? undefined,
                      });
                    }}
                  >
                    {completeTask.isPending ? "Saving…" : "Mark complete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {empTaskDetail != null && (
              <TaskDetailSheet
                task={empTaskDetail}
                open
                onOpenChange={(v) => {
                  if (!v) setEmpTaskDetail(null);
                }}
                showInternalNotes={false}
                checklistInteractive
                checklistTogglePending={toggleTaskChecklistItem.isPending}
                onToggleChecklistItem={(index, completed) => {
                  if (empTaskDetail.id == null) return;
                  toggleTaskChecklistItem.mutate({
                    taskId: empTaskDetail.id,
                    index,
                    completed,
                    companyId: activeCompanyId ?? undefined,
                  });
                }}
              />
            )}
          </TabsContent>

          {/* ══ DOCUMENTS TAB ════════════════════════════════════════════════ */}
          <TabsContent id="portal-documents" value="documents" className="mt-4 space-y-4 scroll-mt-24">
            {/* Expiry alerts */}
            {expiringDocs.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      {expiringDocs.length} document{expiringDocs.length > 1 ? "s" : ""} expiring soon — contact HR to renew
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {docsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (docs as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium">No documents on file</p>
                <p className="text-sm mt-1">Contact HR to upload your documents</p>
                <div className="mt-4 p-3 bg-muted/30 rounded-lg text-xs text-left max-w-md mx-auto space-y-1">
                  <p className="font-medium text-foreground">Same vault as HR — documents appear here when uploaded to your file</p>
                  <p className="text-muted-foreground mt-1">Examples: passport, visa, resident card, civil ID, work permit certificate, contract, medical, photo.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {(docs as any[]).map((doc: any) => {
                  const days = daysUntilExpiry(doc.expiresAt);
                  const expired = days !== null && days < 0;
                  const expiringSoon = !expired && days !== null && days <= 90;
                  return (
                    <Card key={doc.id} className={expired ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" : expiringSoon ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              {DOC_ICONS[doc.documentType] ?? <FileText className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                              {doc.fileName && <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>}
                              {doc.expiresAt && (
                                <p className={`text-xs mt-0.5 flex items-center gap-1 ${expired ? "text-red-600 font-medium" : expiringSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                                  <Clock className="w-3 h-3" />
                                  {expired ? `Expired ${Math.abs(days!)} days ago` : days === 0 ? "Expires today!" : `Expires in ${days} days — ${formatDate(doc.expiresAt)}`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                            {expiringSoon && !expired && (
                              <Badge className={`text-xs ${days !== null && days <= 30 ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
                                {days !== null && days <= 30 ? "Urgent" : "Expiring"}
                              </Badge>
                            )}
                            {doc.fileUrl && (
                              <Button size="sm" variant="outline" asChild className="h-7 text-xs">
                                <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-3 h-3 mr-1" /> View
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ PROFILE TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="profile" className="mt-0 space-y-4 focus-visible:outline-none">
            {/* Profile header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {emp.avatarUrl
                      ? <img src={emp.avatarUrl} alt={fullName} className="w-16 h-16 rounded-full object-cover" />
                      : <User className="w-8 h-8 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold">{fullName}</p>
                    {emp.firstNameAr && <p className="text-sm text-muted-foreground" dir="rtl">{emp.firstNameAr} {emp.lastNameAr}</p>}
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {emp.position ?? "Employee"}{emp.department ? ` · ${emp.department}` : ""}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {emp.employeeNumber && (
                        <Badge variant="outline" className="text-xs">#{emp.employeeNumber}</Badge>
                      )}
                      <Badge variant={emp.status === "active" ? "default" : "secondary"} className="capitalize text-xs">
                        {emp.status}
                      </Badge>
                      {emp.employmentType && (
                        <Badge variant="outline" className="text-xs capitalize">{emp.employmentType.replace("_", " ")}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Info (editable) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> Contact Information</span>
                  {!editingContact ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                      setEditPhone(emp.phone ?? "");
                      setEditEmergencyName(emp.emergencyContactName ?? "");
                      setEditEmergencyPhone(emp.emergencyContactPhone ?? "");
                      setEditingContact(true);
                    }}>
                      <Edit2 className="w-3 h-3" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingContact(false)}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs gap-1" disabled={updateContact.isPending}
                        onClick={() =>
                          activeCompanyId != null &&
                          updateContact.mutate({
                            companyId: activeCompanyId,
                            phone: editPhone || undefined,
                            emergencyContactName: editEmergencyName || undefined,
                            emergencyContactPhone: editEmergencyPhone || undefined,
                          })}>
                        <Save className="w-3 h-3" /> {updateContact.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {editingContact ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Phone Number</Label>
                      <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+968 XXXX XXXX" />
                    </div>
                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Emergency Contact</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Emergency Contact Name</Label>
                      <Input value={editEmergencyName} onChange={(e) => setEditEmergencyName(e.target.value)} placeholder="Full name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Emergency Contact Phone</Label>
                      <Input value={editEmergencyPhone} onChange={(e) => setEditEmergencyPhone(e.target.value)} placeholder="+968 XXXX XXXX" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: "Email", value: emp.email, icon: Mail },
                        { label: "Phone", value: emp.phone, icon: Phone },
                        { label: "Nationality", value: emp.nationality, icon: MapPin },
                        { label: "Date of Birth", value: emp.dateOfBirth ? formatDate(emp.dateOfBirth) : null, icon: Calendar },
                      ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {(emp.emergencyContactName || emp.emergencyContactPhone) && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact</p>
                          <div className="mt-2 grid gap-3 sm:grid-cols-2">
                            {emp.emergencyContactName && (
                              <div>
                                <p className="text-xs text-muted-foreground">Name</p>
                                <p className="mt-0.5 text-sm font-medium">{emp.emergencyContactName}</p>
                              </div>
                            )}
                            {emp.emergencyContactPhone && (
                              <div>
                                <p className="text-xs text-muted-foreground">Phone</p>
                                <p className="mt-0.5 text-sm font-medium">
                                  <a href={`tel:${emp.emergencyContactPhone}`} className="inline-flex items-center gap-1.5 hover:underline">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                    {emp.emergencyContactPhone}
                                  </a>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work + bank (single card on mobile for less scroll) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Work &amp; payroll
                </CardTitle>
                <p className="text-[11px] font-normal text-muted-foreground">Job + bank on file for payroll.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  {[
                    { label: "Company", value: companyInfo?.name, icon: Building2 },
                    { label: "Department", value: emp.department, icon: Briefcase },
                    { label: "Position / Title", value: emp.position },
                    { label: "Employment Type", value: emp.employmentType?.replace("_", " ") },
                    { label: "Hire Date", value: emp.hireDate ? formatDate(emp.hireDate) : null, icon: Calendar },
                    { label: "Status", value: emp.status },
                  ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium capitalize">
                        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                {(emp.bankName || emp.bankAccountNumber) && (
                  <>
                    <Separator />
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <CreditCard className="h-3.5 w-3.5" /> Bank
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {emp.bankName && (
                          <div>
                            <p className="text-xs text-muted-foreground">Bank name</p>
                            <p className="mt-0.5 text-sm font-medium">{emp.bankName}</p>
                          </div>
                        )}
                        {emp.bankAccountNumber && (
                          <div>
                            <p className="text-xs text-muted-foreground">Account number</p>
                            <p className="mt-0.5 text-sm font-medium">{emp.bankAccountNumber}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Documents & visa — collapsed by default to save profile scroll */}
            {(emp.passportNumber || emp.visaNumber || emp.workPermitNumber || emp.nationalId || emp.pasiNumber) && (
              <details className="group rounded-xl border border-border/80 bg-card shadow-sm open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" /> Documents &amp; visa
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="border-t border-border/60 px-4 pb-4 pt-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { label: "Passport Number", value: emp.passportNumber, icon: Shield },
                      { label: "National ID", value: emp.nationalId },
                      { label: "Visa Number", value: emp.visaNumber },
                      { label: "Visa Expiry", value: emp.visaExpiryDate ? formatDate(emp.visaExpiryDate) : null, expiry: emp.visaExpiryDate },
                      { label: "Work Permit No.", value: emp.workPermitNumber },
                      { label: "Work Permit Expiry", value: emp.workPermitExpiryDate ? formatDate(emp.workPermitExpiryDate) : null, expiry: emp.workPermitExpiryDate },
                      { label: "PASI Number", value: emp.pasiNumber },
                    ].filter((f) => f.value).map(({ label, value, icon: Icon, expiry }) => {
                      const days = expiry ? daysUntilExpiry(expiry) : null;
                      const isExpired = days !== null && days < 0;
                      const isExpiring = days !== null && days >= 0 && days <= 90;
                      return (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${isExpired ? "text-red-600" : isExpiring ? "text-amber-600" : ""}`}>
                            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                            {value}
                            {isExpired && <Badge variant="destructive" className="ml-1 text-xs">Expired</Badge>}
                            {isExpiring && !isExpired && <Badge className="ml-1 bg-amber-500 text-xs hover:bg-amber-600">{days}d</Badge>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </details>
            )}

            <EmployeePortalMoreHub
              setActiveTab={setActiveTab}
              pendingLeave={pendingLeave}
              expiringDocsCount={expiringDocs.length}
              trainingAttentionCount={trainingAttentionCount}
              pendingExpenses={pendingExpensesCount}
              pendingShiftRequests={pendingShiftRequestsCount}
            />
          </TabsContent>

          {/* ══ REQUESTS TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="requests" className="mt-0 space-y-3 focus-visible:outline-none">
            <div className="space-y-2">
              <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">New</p>
              <Button
                className="flex h-auto min-h-[3.25rem] w-full touch-manipulation items-center justify-start gap-3 py-3 text-left text-base shadow-sm"
                onClick={() => setShowLeaveDialog(true)}
              >
                <Calendar className="h-6 w-6 shrink-0" />
                <span>
                  <span className="block font-semibold">Leave</span>
                  <span className="block text-xs font-normal opacity-90">Annual, sick, emergency…</span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="flex h-auto min-h-12 w-full touch-manipulation items-center justify-start gap-3 border-2 py-2.5 text-left"
                onClick={() => setShowShiftRequestDialog(true)}
              >
                <ArrowLeftRight className="h-5 w-5 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold">HR request</span>
                  <span className="block text-xs font-normal text-muted-foreground">Shift, time block, swap, early leave…</span>
                </span>
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                  History
                </h2>
                <p className="text-[11px] text-muted-foreground">Calendar · list</p>
              </div>
              <div className="flex w-full overflow-hidden rounded-md border sm:w-auto" role="tablist" aria-label="Request view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={calView === "calendar" ? "true" : "false"}
                  onClick={() => setCalView("calendar")}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs transition-colors touch-manipulation sm:min-w-[6.5rem] ${
                    calView === "calendar" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Calendar className="h-3.5 w-3.5" /> Calendar
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={calView === "list" ? "true" : "false"}
                  onClick={() => setCalView("list")}
                  className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs transition-colors touch-manipulation sm:min-w-[6.5rem] ${
                    calView === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" /> List
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Approved</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Pending</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Rejected</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-400" /> Cancelled</span>
            </div>

            {calView === "calendar" ? (
              <RequestsCalendar
                requests={(myShiftRequests ?? []) as any[]}
                month={calMonth}
                year={calYear}
                onMonthChange={(m: number, y: number) => { setCalMonth(m); setCalYear(y); }}
                selectedDay={selectedCalDay}
                onDaySelect={setSelectedCalDay}
                onCancel={(id: number) => cancelShiftRequest.mutate({ id })}
                onNewRequest={() => setShowShiftRequestDialog(true)}
              />
            ) : (
              /* ── List View ── */
              <div className="space-y-3">
                {(() => {
                  const allReqs = (myShiftRequests ?? []) as any[];
                  const typeLabels: Record<string, string> = {
                    shift_change: "Shift Change", time_off: "Time Off",
                    early_leave: "Early Leave", late_arrival: "Late Arrival", day_swap: "Day Swap",
                  };
                  const statusConfig: Record<string, { color: string; bg: string; border: string }> = {
                    pending:   { color: "text-amber-700",  bg: "bg-amber-50 dark:bg-amber-950/20",  border: "border-amber-200 dark:border-amber-800" },
                    approved:  { color: "text-green-700",  bg: "bg-green-50 dark:bg-green-950/20",  border: "border-green-200 dark:border-green-800" },
                    rejected:  { color: "text-red-700",    bg: "bg-red-50 dark:bg-red-950/20",      border: "border-red-200 dark:border-red-800" },
                    cancelled: { color: "text-gray-500",   bg: "bg-gray-50 dark:bg-gray-900/20",    border: "border-gray-200 dark:border-gray-700" },
                  };
                  if (allReqs.length === 0) return (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                        <ArrowLeftRight className="h-10 w-10 opacity-20" />
                        <p className="text-center text-sm font-medium text-foreground">No HR requests yet</p>
                        <p className="max-w-xs text-center text-xs">Leave: top button. Other: HR request form.</p>
                        <Button size="sm" className="min-h-10 touch-manipulation" onClick={() => setShowShiftRequestDialog(true)}>
                          HR request
                        </Button>
                      </CardContent>
                    </Card>
                  );
                  return allReqs.map((item: any) => {
                    const req = item.request;
                    const ps = item.preferredShift;
                    const sc = statusConfig[req.status] ?? statusConfig.cancelled;
                    return (
                      <Card key={req.id} className={`border ${sc.border} ${sc.bg}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm">{typeLabels[req.requestType] ?? req.requestType}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${sc.border} ${sc.color}`}>
                                  {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {req.requestedDate}{req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` → ${req.requestedEndDate}` : ""}
                                {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                              </p>
                              <p className="text-xs mt-1">{req.reason}</p>
                              {ps && <p className="text-xs text-primary mt-0.5">Preferred: {ps.name} ({ps.startTime}–{ps.endTime})</p>}
                              {req.adminNotes && (
                                <p className="text-xs mt-1 italic text-muted-foreground">HR note: {req.adminNotes}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Submitted {new Date(req.createdAt).toLocaleDateString("en-GB")}
                              </p>
                            </div>
                            {req.status === "pending" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                                onClick={() => cancelShiftRequest.mutate({ id: req.id })}>
                                <X className="w-3 h-3 mr-1" /> Cancel
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>
            )}
          </TabsContent>

          {/* ══ KPI TAB ══════════════════════════════════════════════════════ */}
          <TabsContent value="kpi" className="mt-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  KPI & Performance
                </h2>
                <p className="text-xs text-muted-foreground">Track your targets, log daily activity, and view your commission</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(kpiMonth)} onValueChange={(v) => setKpiMonth(Number(v))}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                      <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(kpiYear)} onValueChange={(v) => setKpiYear(Number(v))}>
                  <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024,2025,2026,2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Commission Summary */}
            {(() => {
              const progressArr = Array.isArray(myKpiProgress) ? (myKpiProgress as any[]) : [];
              if (!progressArr.length) return null;
              const totalComm = progressArr.reduce((s: number, it: any) => s + Number(it.commissionEarned ?? 0), 0);
              const avgPct = progressArr.reduce((s: number, it: any) => s + Number(it.pct ?? 0), 0) / progressArr.length;
              if (totalComm <= 0) return null;
              return (
                <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                          <Trophy className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Commission Earned</p>
                          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                            OMR {totalComm.toFixed(3)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Overall Achievement</p>
                        <p className="text-lg font-semibold">{avgPct.toFixed(1)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* KPI Targets Progress */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> My Targets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!myKpiProgress || (myKpiProgress as any[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Target className="w-10 h-10 opacity-20" />
                    <p className="text-sm">No KPI targets set for this period</p>
                    <p className="text-xs">Contact your manager to set your targets</p>
                  </div>
                ) : (
                  (myKpiProgress as any[]).map((item: any) => {
                    const t = item.target;
                    const pct = Math.min(Number(item.pct ?? 0), 100);
                    const isOnTrack = pct >= 80;
                    const isExceeded = pct >= 100;
                    return (
                      <div key={t.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              isExceeded ? "bg-green-500" : isOnTrack ? "bg-blue-500" : "bg-amber-500"
                            }`} />
                            <span className="font-medium text-sm truncate">{t.metricName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {Number(item.achievedValue ?? 0).toLocaleString()} / {Number(item.targetValue ?? 0).toLocaleString()} {t.unit ?? ""}
                            </span>
                            <span className={`text-sm font-bold ${
                              isExceeded ? "text-green-600" : isOnTrack ? "text-blue-600" : "text-amber-600"
                            }`}>{pct.toFixed(1)}%</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => {
                                setLogTargetId(t.id);
                                setLogTargetName(t.metricName);
                                setLogDate(new Date().toISOString().split("T")[0]);
                                setShowLogActivityDialog(true);
                              }}>
                              <Plus className="w-3 h-3" /> Log
                            </Button>
                          </div>
                        </div>
                        <Progress value={pct} className="h-2" />
                        {Number(t.commissionRate ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Commission: {t.commissionType === "percentage"
                              ? `${t.commissionRate}% of value`
                              : `${t.currency ?? "OMR"} ${t.commissionRate} per unit`
                            } · Earned: <span className="font-medium text-amber-600">{t.currency ?? "OMR"} {Number(item.commissionEarned ?? 0).toFixed(3)}</span>
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Leaderboard */}
            {kpiLeaderboard && (kpiLeaderboard as any[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" /> Team Leaderboard
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(kpiLeaderboard as any[]).slice(0, 5).map((entry: any, idx: number) => (
                    <div key={entry.employeeUserId} className={`flex items-center gap-3 p-2 rounded-lg ${
                      idx === 0 ? "bg-amber-50 dark:bg-amber-950/20" :
                      idx === 1 ? "bg-slate-50 dark:bg-slate-900/20" :
                      idx === 2 ? "bg-orange-50 dark:bg-orange-950/20" : ""
                    }`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? "bg-amber-400 text-white" :
                        idx === 1 ? "bg-slate-400 text-white" :
                        idx === 2 ? "bg-orange-400 text-white" : "bg-muted text-muted-foreground"
                      }`}>{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.employee ? `${entry.employee.firstName} ${entry.employee.lastName}` : `User #${entry.employeeUserId}`}</p>
                        <p className="text-xs text-muted-foreground">{entry.employee?.department ?? ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{Number(entry.avgPct ?? 0).toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">OMR {Number(entry.totalCommission ?? 0).toFixed(3)}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Daily Activity Log */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Daily Activity Log
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {!myKpiLogs || (myKpiLogs as any[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <Activity className="w-10 h-10 opacity-20" />
                    <p className="text-sm">No activity logged for this period</p>
                    <p className="text-xs">Use the "Log" button next to each target above</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(myKpiLogs as any[]).map((log: any) => (
                      <div key={log.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <ListChecks className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{log.metricName}</p>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{log.metricType?.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.logDate).toLocaleDateString("en-GB")} · Value: <span className="font-semibold text-primary">{Number(log.valueAchieved ?? 0).toLocaleString()}</span>
                            {log.clientName ? ` · ${log.clientName}` : ""}
                          </p>
                          {log.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{log.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
           </TabsContent>

          {/* ══ EXPENSE CLAIMS TAB ═══════════════════════════════════════════════════ */}
          <TabsContent value="expenses" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  Expense Claims
                </h2>
                <p className="text-xs text-muted-foreground">Submit and track your business expense reimbursements</p>
              </div>
              <Button size="sm" onClick={() => setShowExpenseDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Submit Claim
              </Button>
            </div>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Pending", count: (myExpenses ?? []).filter((e: any) => e.expenseStatus === "pending").length, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
                { label: "Approved", count: (myExpenses ?? []).filter((e: any) => e.expenseStatus === "approved").length, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
                { label: "Rejected", count: (myExpenses ?? []).filter((e: any) => e.expenseStatus === "rejected").length, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
              ].map(({ label, count, color, bg }) => (
                <Card key={label} className={`${bg} border-0`}>
                  <CardContent className="p-3 text-center">
                    <p className={`text-xl font-bold ${color}`}>{count}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {/* Claims list */}
            <Card>
              <CardContent className="p-0">
                {(myExpenses ?? []).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No expense claims yet</p>
                    <p className="text-xs mt-1">Submit a claim for travel, meals, equipment, or other business expenses</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {(myExpenses as any[]).map((exp: any) => (
                      <div key={exp.id} className="p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm capitalize">{exp.expenseCategory?.replace(/_/g, " ")}</span>
                            <Badge variant="outline" className={`text-xs ${
                              exp.expenseStatus === "approved" ? "border-green-500 text-green-600" :
                              exp.expenseStatus === "rejected" ? "border-red-500 text-red-600" :
                              exp.expenseStatus === "paid" ? "border-blue-500 text-blue-600" :
                              "border-amber-500 text-amber-600"
                            }`}>{exp.expenseStatus}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{exp.description}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(exp.claimDate)}</p>
                          {exp.reviewNote && <p className="text-xs text-red-500 mt-1">Note: {exp.reviewNote}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-sm">{exp.currency} {Number(exp.amount).toFixed(3)}</p>
                          {exp.expenseStatus === "pending" && (
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-red-500 mt-1"
                              onClick={() => cancelExpenseMut.mutate({ id: exp.id })}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ WORK LOG TAB ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="worklog" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Timer className="w-4 h-4 text-primary" />
                  Work Log
                </h2>
                <p className="text-xs text-muted-foreground">Record your daily work hours and activities</p>
              </div>
              <Button size="sm" onClick={() => setShowWorkLogDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Log Today
              </Button>
            </div>
            {/* Weekly summary */}
            {(() => {
              const logs = (myWorkLogs as any[]) ?? [];
              const totalHours = logs.reduce((sum: number, l: any) => sum + (parseFloat(l.hoursWorked ?? "0") || 0), 0);
              const thisWeek = logs.filter((l: any) => {
                const d = new Date(l.logDate);
                const now = new Date();
                const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
                return d >= weekStart;
              });
              const weekHours = thisWeek.reduce((sum: number, l: any) => sum + (parseFloat(l.hoursWorked ?? "0") || 0), 0);
              return (
                <div className="grid grid-cols-3 gap-3">
                  <Card className="bg-blue-50 dark:bg-blue-950/20 border-0">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-bold text-blue-600">{weekHours.toFixed(1)}h</p>
                      <p className="text-xs text-muted-foreground">This Week</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 dark:bg-green-950/20 border-0">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-bold text-green-600">{totalHours.toFixed(1)}h</p>
                      <p className="text-xs text-muted-foreground">Total Logged</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-50 dark:bg-purple-950/20 border-0">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-bold text-purple-600">{logs.length}</p>
                      <p className="text-xs text-muted-foreground">Entries</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
            {/* Log list */}
            <Card>
              <CardContent className="p-0">
                {(myWorkLogs ?? []).length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Timer className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No work logs yet</p>
                    <p className="text-xs mt-1">Log your daily tasks, hours, and projects here</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {(myWorkLogs as any[]).map((log: any) => (
                      <div key={log.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{formatDate(log.logDate)}</span>
                              {log.projectName && <Badge variant="outline" className="text-xs">{log.projectName}</Badge>}
                              <Badge variant="outline" className="text-xs capitalize">{log.logCategory}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{log.taskDescription}</p>
                            {log.startTime && log.endTime && (
                              <p className="text-xs text-muted-foreground">{log.startTime} – {log.endTime}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-sm text-primary">{log.hoursWorked ? `${log.hoursWorked}h` : "—"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ TRAINING TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="training" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  My Training
                </h2>
                <p className="text-xs text-muted-foreground">Assigned courses and certifications</p>
              </div>
            </div>
            {((myTraining as any[]) ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Award className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No training assigned yet</p>
                  <p className="text-xs mt-1">Your HR team will assign training courses here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {((myTraining as any[]) ?? []).map((t: any) => {
                  const statusColor: Record<string, string> = {
                    assigned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                    overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  };
                  return (
                    <Card key={t.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{t.title}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[t.trainingStatus] ?? "bg-gray-100 text-gray-700"}`}>
                                {t.trainingStatus.replace("_", " ")}
                              </span>
                            </div>
                            {t.provider && <p className="text-xs text-muted-foreground mt-0.5">{t.provider}</p>}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              {t.dueDate && <span>Due: {t.dueDate}</span>}
                              {t.durationHours && <span>{t.durationHours}h</span>}
                              <span className="capitalize">{t.trainingCategory.replace("_", " ")}</span>
                            </div>
                            {t.score != null && <p className="text-xs font-medium text-green-600 mt-1">Score: {t.score}%</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {t.trainingStatus === "assigned" && (
                              <Button size="sm" variant="outline" onClick={() => updateTrainingMut.mutate({ id: t.id, status: "in_progress" })}>
                                Start
                              </Button>
                            )}
                            {t.trainingStatus === "in_progress" && (
                              <Button size="sm" onClick={() => updateTrainingMut.mutate({ id: t.id, status: "completed" })}>
                                <Check className="w-3.5 h-3.5 mr-1" /> Complete
                              </Button>
                            )}
                            {t.certificateUrl && (
                              <a
                                href={t.certificateUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open training certificate"
                                title="Open training certificate"
                              >
                                <Button size="sm" variant="ghost">
                                  <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                                </Button>
                              </a>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ REVIEWS TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="reviews" className="mt-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Performance Reviews
                </h2>
                <p className="text-xs text-muted-foreground">Your self-assessments and manager feedback</p>
              </div>
              <Button size="sm" onClick={() => setShowReviewDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Review
              </Button>
            </div>
            {((mySelfReviews as any[]) ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No reviews submitted yet</p>
                  <p className="text-xs mt-1">Submit a self-review to share your achievements and goals</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {((mySelfReviews as any[]) ?? []).map((r: any) => {
                  const statusColor: Record<string, string> = {
                    draft: "bg-gray-100 text-gray-700",
                    submitted: "bg-blue-100 text-blue-700",
                    reviewed: "bg-green-100 text-green-700",
                    acknowledged: "bg-purple-100 text-purple-700",
                  };
                  return (
                    <Card key={r.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{r.reviewPeriod}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.reviewStatus] ?? "bg-gray-100 text-gray-700"}`}>
                            {r.reviewStatus}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Self Rating</p>
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(i => (
                                <Star key={i} className={`w-3.5 h-3.5 ${i <= (r.selfRating ?? 0) ? "text-amber-400 fill-amber-400" : "text-gray-200"}`} />
                              ))}
                            </div>
                          </div>
                          {r.managerRating != null && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Manager Rating</p>
                              <div className="flex gap-0.5">
                                {[1,2,3,4,5].map(i => (
                                  <Star key={i} className={`w-3.5 h-3.5 ${i <= r.managerRating ? "text-blue-400 fill-blue-400" : "text-gray-200"}`} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {r.selfAchievements && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Achievements</p>
                            <p className="text-xs mt-0.5">{r.selfAchievements}</p>
                          </div>
                        )}
                        {r.selfGoals && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Goals</p>
                            <p className="text-xs mt-0.5">{r.selfGoals}</p>
                          </div>
                        )}
                        {r.managerFeedback && (
                          <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2">
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Manager Feedback</p>
                            <p className="text-xs mt-0.5">{r.managerFeedback}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      <EmployeePortalBottomNav
        activeTab={activeTab}
        onNavigate={setActiveTab}
        taskBadge={pendingTasks}
        requestBadge={pendingShiftRequestsCount}
      />

      {/* ── Self-Review Dialog ── */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Submit Self-Review</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Review Period</Label>
              <Input placeholder="e.g. Q1 2026, Jan-Mar 2026" value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Self Rating (1–5)</Label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(i => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setReviewRating(i)}
                    className={`w-9 h-9 rounded-full border-2 text-sm font-bold transition-colors ${
                      i <= reviewRating ? "border-amber-400 bg-amber-400 text-white" : "border-gray-200 text-gray-400 hover:border-amber-300"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Achievements this period</Label>
              <Textarea placeholder="What did you accomplish? Be specific." value={reviewAchievements} onChange={(e) => setReviewAchievements(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Goals for next period</Label>
              <Textarea placeholder="What are your goals for the next period?" value={reviewGoals} onChange={(e) => setReviewGoals(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>Cancel</Button>
            <Button
              disabled={!reviewPeriod || reviewAchievements.length < 10 || reviewGoals.length < 10 || submitReviewMut.isPending}
              onClick={() => submitReviewMut.mutate({ reviewPeriod, selfRating: reviewRating, selfAchievements: reviewAchievements, selfGoals: reviewGoals })}
            >
              {submitReviewMut.isPending ? "Processing..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Leave Request Dialog ── */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent
          className="sm:max-w-md"
          aria-describedby="employee-leave-dialog-desc"
          aria-busy={submitLeave.isPending}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => leaveTypeSelectRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle>Submit Leave Request</DialogTitle>
            <DialogDescription id="employee-leave-dialog-desc">
              Pick type and dates — HR confirms by notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger ref={leaveTypeSelectRef} className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual Leave ({balance.annual} days remaining)</SelectItem>
                  <SelectItem value="sick">Sick Leave ({balance.sick} days remaining)</SelectItem>
                  <SelectItem value="emergency">Emergency Leave ({balance.emergency} days remaining)</SelectItem>
                  <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                  <SelectItem value="maternity">Maternity Leave</SelectItem>
                  <SelectItem value="paternity">Paternity Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Start date <span className="text-destructive">*</span>
                </Label>
                <DateInput value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}
                  min={today.toISOString().split("T")[0]} required aria-required />
              </div>
              <div className="space-y-1.5">
                <Label>
                  End date <span className="text-destructive">*</span>
                </Label>
                <DateInput value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}
                  min={leaveStart || today.toISOString().split("T")[0]} required aria-required />
              </div>
            </div>
            {leaveStart && leaveEnd && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Timer className="w-3 h-3" /> {calcDays(leaveStart, leaveEnd)} day{calcDays(leaveStart, leaveEnd) !== 1 ? "s" : ""} requested
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Optional note for HR"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="min-h-11 w-full touch-manipulation sm:w-auto" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-12 w-full touch-manipulation text-base font-semibold sm:w-auto disabled:opacity-60"
              disabled={!leaveStart || !leaveEnd || submitLeave.isPending}
              onClick={() => {
                if (activeCompanyId == null || !leaveStart || !leaveEnd) return;
                const s = new Date(`${leaveStart}T12:00:00`).getTime();
                const e = new Date(`${leaveEnd}T12:00:00`).getTime();
                if (e < s) {
                  toast.error("Check your dates", { description: "End date must be on or after start date." });
                  return;
                }
                submitLeave.mutate({
                  companyId: activeCompanyId,
                  leaveType: leaveType as any,
                  startDate: leaveStart,
                  endDate: leaveEnd,
                  reason: leaveReason || undefined,
                });
              }}
            >
              {submitLeave.isPending ? "Sending…" : "Send leave request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Notifications Panel ── */}
      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notifications
                {unreadCount > 0 && <Badge variant="secondary">{unreadCount} unread</Badge>}
              </span>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => activeCompanyId != null && markAllRead.mutate({ companyId: activeCompanyId })}
                >
                  Mark all read
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-2 py-2">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n: any) => (
                <div key={n.id}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${!n.isRead ? "border-primary/30 bg-primary/5" : "bg-card"}`}
                  onClick={() => { if (!n.isRead) markNotifRead.mutate({ notificationId: n.id }); }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{fmtDateTime(n.createdAt)}</p>
                    </div>
                    {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Shift Change / Time Off / HR Request Dialog (same patterns as leave) ── */}
      <Dialog
        open={showShiftRequestDialog}
        onOpenChange={(open) => {
          setShowShiftRequestDialog(open);
          if (!open) setShiftPreferredShiftId("");
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          aria-describedby="employee-shift-request-dialog-desc"
          aria-busy={submitShiftRequest.isPending || uploadingAttachment}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => shiftRequestTypeSelectRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle>Submit HR request</DialogTitle>
            <DialogDescription id="employee-shift-request-dialog-desc">
              Choose the request type, required dates or time, and a short reason — HR confirms by notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="employee-shift-req-type">
                Request type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={shiftReqType}
                onValueChange={(v) => {
                  setShiftReqType(v);
                  if (v !== "shift_change") setShiftPreferredShiftId("");
                  if (v !== "time_off") setShiftReqEndDate("");
                  if (v !== "early_leave" && v !== "late_arrival") setShiftReqTime("");
                }}
              >
                <SelectTrigger
                  id="employee-shift-req-type"
                  ref={shiftRequestTypeSelectRef}
                  className="min-h-11 w-full min-w-0 touch-manipulation"
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time_off">Time off (date range)</SelectItem>
                  <SelectItem value="shift_change">Shift change</SelectItem>
                  <SelectItem value="early_leave">Early leave</SelectItem>
                  <SelectItem value="late_arrival">Late arrival</SelectItem>
                  <SelectItem value="day_swap">Day swap</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Use <span className="font-medium text-foreground/80">Time off</span> for multiple days; other types apply to a single date (and time where needed).
              </p>
            </div>

            {shiftReqType === "time_off" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="shift-req-start">
                      Start date <span className="text-destructive">*</span>
                    </Label>
                    <DateInput
                      id="shift-req-start"
                      className="min-h-11 w-full touch-manipulation"
                      value={shiftReqDate}
                      min={todayIsoDate}
                      required
                      aria-required
                      onChange={(e) => setShiftReqDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="shift-req-end">
                      End date <span className="text-destructive">*</span>
                    </Label>
                    <DateInput
                      id="shift-req-end"
                      className="min-h-11 w-full touch-manipulation"
                      value={shiftReqEndDate}
                      min={shiftReqDate || todayIsoDate}
                      required
                      aria-required
                      aria-invalid={shiftRequestTimeOffRangeInvalid ? "true" : "false"}
                      aria-describedby={shiftRequestTimeOffRangeInvalid ? "shift-req-date-range-error" : undefined}
                      onChange={(e) => setShiftReqEndDate(e.target.value)}
                    />
                  </div>
                </div>
                {shiftRequestTimeOffRangeInvalid && (
                  <p id="shift-req-date-range-error" className="text-xs font-medium text-destructive" role="alert">
                    End date must be on or after the start date.
                  </p>
                )}
                {shiftReqDate && shiftReqEndDate && !shiftRequestTimeOffRangeInvalid && (
                  <p className="text-xs text-muted-foreground">
                    <Timer className="mr-1 inline-block h-3 w-3 align-middle" aria-hidden />
                    {calcDays(shiftReqDate, shiftReqEndDate)} day{calcDays(shiftReqDate, shiftReqEndDate) !== 1 ? "s" : ""}{" "}
                    in this request
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="shift-req-single-date">
                    Date <span className="text-destructive">*</span>
                  </Label>
                  <DateInput
                    id="shift-req-single-date"
                    className="min-h-11 w-full touch-manipulation"
                    value={shiftReqDate}
                    min={todayIsoDate}
                    required
                    aria-required
                    onChange={(e) => setShiftReqDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">The calendar day this request applies to.</p>
                </div>
                {(shiftReqType === "early_leave" || shiftReqType === "late_arrival") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="shift-req-time">
                      {shiftReqType === "early_leave" ? "Time you leave" : "Time you arrive"}{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="shift-req-time"
                      type="time"
                      className="min-h-11 touch-manipulation"
                      value={shiftReqTime}
                      required
                      aria-required
                      onChange={(e) => setShiftReqTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Use the time picker — same timezone as your schedule.</p>
                  </div>
                )}
              </div>
            )}

            {shiftReqType === "shift_change" && (shiftTemplatesList ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="shift-req-preferred">Preferred shift (optional)</Label>
                <Select
                  value={shiftPreferredShiftId || "__none__"}
                  onValueChange={(v) => setShiftPreferredShiftId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="shift-req-preferred" className="min-h-11 w-full min-w-0 touch-manipulation">
                    <SelectValue placeholder="No preference — HR will propose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No preference</SelectItem>
                    {(shiftTemplatesList ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.startTime}–{s.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional — leave blank if you want HR to suggest options.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="shift-req-reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <p id="shift-req-reason-hint" className="text-xs text-muted-foreground">
                At least 5 characters so HR can act on your request.
              </p>
              <Textarea
                id="shift-req-reason"
                className="min-h-[5.5rem] touch-manipulation"
                rows={3}
                placeholder="e.g. Doctor appointment, family travel, need morning shift next week…"
                value={shiftReqReason}
                onChange={(e) => setShiftReqReason(e.target.value)}
                aria-describedby={
                  shiftReasonTooShort ? "shift-req-reason-hint shift-req-reason-error" : "shift-req-reason-hint"
                }
                aria-invalid={shiftReasonTooShort ? "true" : "false"}
              />
              {shiftReasonTooShort && (
                <p id="shift-req-reason-error" className="text-xs font-medium text-destructive" role="alert">
                  Add a few more characters (minimum 5).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shift-req-attachment-input">Supporting document (optional)</Label>
              <p className="text-xs text-muted-foreground">PDF or image, max 5 MB — e.g. appointment letter or ticket.</p>
              <div>
                {shiftReqAttachmentUrl ? (
                  <div className="flex min-h-11 items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 dark:border-green-900/50 dark:bg-green-950/20">
                    <FileCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                    <span className="flex-1 truncate text-xs text-green-800 dark:text-green-300">{shiftReqAttachmentName}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 shrink-0 touch-manipulation px-2 text-xs"
                      onClick={() => {
                        setShiftReqAttachmentUrl(null);
                        setShiftReqAttachmentName(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="shift-req-attachment-input"
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 transition-colors hover:bg-muted/50 touch-manipulation"
                  >
                    <FilePlus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-xs text-muted-foreground">
                      {uploadingAttachment ? "Uploading…" : "Tap to choose a file (PDF, image, Word)"}
                    </span>
                    <input
                      id="shift-req-attachment-input"
                      type="file"
                      className="sr-only"
                      accept="image/*,.pdf,.jpg,.jpeg,.png,.doc,.docx"
                      disabled={uploadingAttachment}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          toast.error("File too large", { description: "Maximum size is 5 MB." });
                          return;
                        }
                        setUploadingAttachment(true);
                        setShiftReqAttachmentName(file.name);
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const base64 = (ev.target?.result as string).split(",")[1];
                          uploadShiftAttachment.mutate({ fileBase64: base64, fileName: file.name, mimeType: file.type });
                          setUploadingAttachment(false);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="min-h-11 w-full touch-manipulation sm:w-auto"
              onClick={() => setShowShiftRequestDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="min-h-12 w-full touch-manipulation text-base font-semibold sm:w-auto disabled:opacity-60"
              disabled={!shiftRequestSubmitReady || submitShiftRequest.isPending || uploadingAttachment}
              onClick={() => {
                if (activeCompanyId == null) {
                  toast.error("No active workspace", { description: "Select a company and try again." });
                  return;
                }
                if (!shiftRequestSubmitReady) return;
                if (shiftReqType === "time_off" && shiftReqDate && shiftReqEndDate) {
                  const s = new Date(`${shiftReqDate}T12:00:00`).getTime();
                  const e = new Date(`${shiftReqEndDate}T12:00:00`).getTime();
                  if (e < s) {
                    toast.error("Check your dates", { description: "End date must be on or after start date." });
                    return;
                  }
                }
                if (
                  (shiftReqType === "early_leave" || shiftReqType === "late_arrival") &&
                  !shiftReqTime?.trim()
                ) {
                  toast.error("Add a time", { description: "Time is required for early leave and late arrival." });
                  return;
                }
                if (shiftReqReason.trim().length < 5) {
                  toast.error("Reason too short", { description: "Please enter at least 5 characters." });
                  return;
                }
                submitShiftRequest.mutate({
                  companyId: activeCompanyId,
                  requestType: shiftReqType as any,
                  requestedDate: shiftReqDate,
                  requestedEndDate: shiftReqType === "time_off" ? shiftReqEndDate : undefined,
                  requestedTime: shiftReqTime || undefined,
                  preferredShiftId:
                    shiftReqType === "shift_change" && shiftPreferredShiftId
                      ? Number(shiftPreferredShiftId)
                      : undefined,
                  reason: shiftReqReason.trim(),
                  attachmentUrl: shiftReqAttachmentUrl || undefined,
                });
              }}
            >
              {submitShiftRequest.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Log KPI Activity Dialog ── */}
      <Dialog open={showLogActivityDialog} onOpenChange={(o) => {
        if (!o) { setShowLogActivityDialog(false); setLogValue(""); setLogNote(""); setLogClientName(""); }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Log activity
            </DialogTitle>
            {logTargetName && (
              <DialogDescription className="text-xs">
                Target: <span className="font-medium text-foreground">{logTargetName}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <DateInput value={logDate} onChange={e => setLogDate(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Activity Type</Label>
              <Select value={logMetricType} onValueChange={setLogMetricType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_amount">Sales Amount</SelectItem>
                  <SelectItem value="client_count">Client Count</SelectItem>
                  <SelectItem value="leads_count">Leads Count</SelectItem>
                  <SelectItem value="calls_count">Calls Count</SelectItem>
                  <SelectItem value="meetings_count">Meetings Count</SelectItem>
                  <SelectItem value="proposals_count">Proposals Count</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="units_sold">Units Sold</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Value Achieved</Label>
              <input type="number" min="0" step="any" value={logValue}
                onChange={e => setLogValue(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Client / Deal Name (optional)</Label>
              <input type="text" value={logClientName}
                onChange={e => setLogClientName(e.target.value)}
                placeholder="e.g. ABC Company, John Doe"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <textarea value={logNote} onChange={e => setLogNote(e.target.value)}
                placeholder="Add context, deal details, outcome..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowLogActivityDialog(false);
              setLogValue(""); setLogNote(""); setLogClientName("");
            }}>Cancel</Button>
            <Button
              disabled={!logDate || !logValue || logActivityMut.isPending}
              onClick={() => {
                if (!logDate || !logValue) return;
                if (!activeCompanyId) {
                  toast.error("Select a company workspace to log KPI activity.");
                  return;
                }
                logActivityMut.mutate({
                  kpiTargetId: logTargetId ?? undefined,
                  metricName: logTargetName || "Activity",
                  metricType: logMetricType as any,
                  logDate,
                  valueAchieved: Number(logValue),
                  clientName: logClientName || undefined,
                  notes: logNote || undefined,
                  companyId: activeCompanyId,
                });
              }}
            >
              {logActivityMut.isPending ? "Saving..." : "Save Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Expense Claim Dialog ── */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Expense Claim</DialogTitle>
            <DialogDescription>Submit a business expense for reimbursement. Finance will review and approve.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <DateInput value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["travel","meals","accommodation","equipment","communication","training","medical","other"].map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" step="0.001" min="0" placeholder="0.000" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={expenseCurrency} onValueChange={setExpenseCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["OMR","USD","EUR","GBP","AED","SAR"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Describe the expense (e.g. Client dinner at XYZ restaurant)" value={expenseDesc} onChange={(e) => setExpenseDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
            <Button
              disabled={!expenseAmount || !expenseDesc || submitExpenseMut.isPending}
              onClick={() => {
                if (!expenseAmount || !expenseDesc) return;
                submitExpenseMut.mutate({
                  expenseDate,
                  category: expenseCategory as any,
                  amount: expenseAmount,
                  currency: expenseCurrency,
                  description: expenseDesc,
                });
              }}
            >
              {submitExpenseMut.isPending ? "Processing..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Work Log Dialog ── */}
      <Dialog open={showWorkLogDialog} onOpenChange={setShowWorkLogDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Work Activity</DialogTitle>
            <DialogDescription>Record what you worked on today.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <DateInput value={workLogDate} onChange={(e) => setWorkLogDate(e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1.5">
                <Label>Hours Worked</Label>
                <Input type="number" step="0.5" min="0.5" max="24" placeholder="8" value={workLogHours} onChange={(e) => setWorkLogHours(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Project / Task Name</Label>
              <Input placeholder="e.g. Client proposal, Marketing campaign" value={workLogProject} onChange={(e) => setWorkLogProject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What did you work on? Be specific." value={workLogDesc} onChange={(e) => setWorkLogDesc(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWorkLogDialog(false)}>Cancel</Button>
            <Button
              disabled={!workLogDesc || addWorkLogMut.isPending}
              onClick={() => {
                if (!workLogDesc) return;
                addWorkLogMut.mutate({
                  logDate: workLogDate,
                  hoursWorked: workLogHours || undefined,
                  projectName: workLogProject || undefined,
                  taskDescription: workLogDesc,
                  category: "other",
                });
              }}
            >
              {addWorkLogMut.isPending ? "Saving..." : "Save Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

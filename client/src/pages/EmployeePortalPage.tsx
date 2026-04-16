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
import { Link, useSearch } from "wouter";
import { parseEmployeePortalTabFromSearch } from "@shared/employeePortalDeepLink";
import { getLoginUrl } from "@/const";
import {
  User, Calendar, FileText, CheckSquare, Bell, BellRing,
  Clock, AlertCircle, ChevronRight, Megaphone,
  DollarSign, LogIn, Plus, Check, X, Building2, Briefcase,
  Phone, Mail, MapPin, Shield, ChevronLeft, ChevronRight as ChevronRightIcon,
  UserCheck, Save, Download, QrCode,
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
import { groupAttendanceRecords } from "@/lib/employeeAttendanceState";
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
import { EmployeeProfileTab } from "@/components/employee-portal/EmployeeProfileTab";
import { deriveProfileBooleans, type ProfileEmpData } from "@/lib/employeeProfileUtils";
import { CheckInEligibilityReasonCode } from "@shared/attendanceCheckInEligibility";
import { buildEmployeeTodayAttendanceStatus } from "@shared/employeeTodayAttendanceStatus";
import { shouldOfferManualAttendanceFallback } from "@shared/manualAttendanceFallback";
import {
  SHIFT_STATUS_LABEL,
  type TodayShiftEntry,
} from "@shared/employeeDayShiftStatus";
import { CHECKOUT_COMPLETION_THRESHOLD_PERCENT } from "@shared/attendanceCheckoutPolicy";
import { useTranslation } from "react-i18next";

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

/** Labels aligned with `employee_documents.documentType` (HR vault Ã¢â€ â€™ portal). */
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
  if (!ts) return "â€”";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "â€”";
  return fmtDateLong(ts);
}

/** Normalize common typos in shift names from admin-entered data */
function formatShiftDisplayName(name: string | null | undefined): string {
  if (!name?.trim()) return "Shift";
  return name.replace(/\bshfit\b/gi, "shift").trim();
}

/** Text color for "days left" â€” full bucket should not look like a warning */
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Per-shift row used inside AttendanceTodayCard multi-shift panel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function TodayShiftRow({
  shift,
  openShiftName,
  onCheckIn,
  onCheckOut,
  mutating,
}: {
  shift: TodayShiftEntry & { isActiveShift?: boolean };
  /**
   * Name of the currently-open (unchecked-out) shift, used to render a
   * precise "check out from X first" message on any window_open sibling row.
   */
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
            {shift.shiftStart}â€“{shift.shiftEnd}
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Attendance Log Ã¢â‚¬â€ grouped by shift Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function AttendanceLogGrouped({
  realAttRecords,
  attRecords,
}: {
  realAttRecords: any[];
  attRecords: any[];
}) {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

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
                    {r.shiftStart && r.shiftEnd ? ` ${r.shiftStart}Ã¢â‚¬â€œ${r.shiftEnd}` : ""}
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              In: {formatTime(r.checkIn)}
              {cout ? ` Ã‚Â· Out: ${formatTime(r.checkOut)}` : " Ã‚Â· Open session"}
              {r.siteName ? ` Ã‚Â· ${r.siteName}` : ""}
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
            HR record Ã¢â‚¬â€ official status
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
                    {r.checkOut ? ` Ã‚Â· Out: ${formatTime(r.checkOut)}` : ""}
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
            Your self-service records are saved. HR will post the official attendance result Ã¢â‚¬â€ usually by end of day.
          </p>
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Attendance Today Card Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualJustification, setManualJustification] = useState("");
  // Explicit shift selection â€” set in the dialog when employee has multiple shifts today.
  // Passed to submitManualCheckIn so HR approval uses it directly as scheduleId.
  const [manualScheduleId, setManualScheduleId] = useState<number | null>(null);
  // Early checkout confirmation dialog state
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
  const { data: myManualList } = trpc.attendance.myManualCheckIns.useQuery(
    { limit: 15 },
    {
      enabled: !!employeeId && companyId != null,
      // Do not retry on failure â€” the server returns [] gracefully on schema mismatch,
      // so a real error here is unlikely to self-heal on retry.
      retry: false,
    },
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
      toast.success("Correction request submitted â€” HR will review it");
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
  // Direct check-in / check-out mutations
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
            "You have another shift today â€” check in again when it starts (or when the check-in window opens).",
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
      toast.success("Request sent â€” HR will review your manual attendance");
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
  // Prefer shift-matched times from operationalHints (server-side, uses active shift window)
  // over myToday (which returns the most recent record regardless of which shift it belongs to).
  // This prevents multi-shift employees from seeing a prior shift's punch on the active shift card.
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

  function handleCheckIn(overrideSiteToken?: string) {
    if (attendanceMutating) return;
    const token = overrideSiteToken ?? siteToken;
    if (!token) {
      toast.error("No site on your schedule - contact HR.");
      return;
    }
    // For primary schedule site (no override): apply client-side geo enforcement.
    // For multi-shift override tokens: always collect GPS if available; server enforces.
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

  /** Returns true when the current time is before the shift completion threshold. */
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

  // Multi-shift panel: show when the employee has 2+ scheduled shifts today.
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
      const pre = `${operationalHints.businessDate} Â· ${site?.name ?? "Site"} Â· ${operationalHints.eligibilityHeadline}. ${operationalHints.eligibilityDetail}`;
      setManualJustification((prev) => (prev.trim() ? prev : pre));
    }
    // Pre-select the currently active shift so employees don't have to pick manually.
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

  /**
   * Canonical shift render mode â€” used to drive the banner into one of three
   * mutually exclusive states so "Active Now" and "Upcoming" never appear together.
   *
   * Priority: server-resolved phase (most authoritative) > local isShiftActive heuristic.
   */
  const shiftRenderMode: "active" | "upcoming" | "no_shift" = (() => {
    if (!hasSchedule || !shift || !isWorkingDay || isHoliday) return "no_shift";
    if (isShiftActive) return "active";
    if (operationalHintsReady && operationalHints?.resolvedShiftPhase === "active") return "active";
    if (operationalHintsReady && operationalHints?.resolvedShiftPhase === "upcoming") return "upcoming";
    // Local fallback: progress bar not yet started â†’ upcoming; inside window â†’ active
    if (shiftProgressPct !== null && shiftProgressPct <= 0) return "upcoming";
    if (shiftProgressPct !== null && shiftProgressPct > 0 && shiftProgressPct < 100) return "active";
    return "upcoming"; // schedule exists but timing unknown yet
  })();

  /**
   * If the primary shift is active, surface any upcoming shift from todayShifts so
   * it can be shown in a separate "Next shift" card rather than mixed into the same banner.
   */
  const upcomingNextShift = shiftRenderMode === "active"
    ? (todayShifts.find((s) => s.status === "upcoming") ?? null)
    : null;

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
            ? operationalHintsReady && operationalHints?.resolvedShiftPhase === "ended"
              ? "Your shift window has ended â€” tap Check out to save your time."
              : "Tap Check out above when you finish this block."
            : tooEarlyBlock
              ? "Check-in for your next shift opens below â€” wait for that time."
              : denialPresentation
                ? denialPresentation.nextStep
                : operationalHints?.eligibilityDetail ??
                  "You have another shift today â€” check in when it starts."
        : checkIn && checkOut
          ? operationalHintsReady && operationalHints?.allShiftsHaveClosedAttendance
            ? "Day complete â€” checked in and out for every shift."
            : null
          : attStrip.showCheckIn
            ? "Tap Check in above to start your time."
            : attStrip.showCheckOut
              ? operationalHintsReady && operationalHints?.resolvedShiftPhase === "ended"
                ? "Your shift window has ended â€” tap Check out to save your time."
                : "Tap Check out above when you leave."
              : tooEarlyBlock
                ? "Check-in opens below â€” wait for that time."
                : denialPresentation
                  ? denialPresentation.nextStep
                  : checkIn && !checkOut
                    ? "Still clocked in â€” check out when you finish."
                    : null;

  return (
    <div id="portal-attendance-today" className="scroll-mt-24 space-y-3">
      {/* â”€â”€ Shift Banner â€” three distinct render modes (active / upcoming / no_shift) â”€â”€ */}
      {isHoliday ? (
        /* Holiday mode */
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
        /* Active shift mode â€” green card, single "Active" badge, progress bar */
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
                    {shift.startTime} â€“ {shift.endTime}
                    {site ? ` Â· ${site.name}` : ""}
                    {shift.gracePeriodMinutes > 0 ? ` Â· ${shift.gracePeriodMinutes}min grace` : ""}
                  </p>
                  {workingDayNames && (
                    <p className="text-xs text-muted-foreground mt-0.5">Working days: {workingDayNames}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right shrink-0 max-w-[160px]">
                {/* Canonical "Active" badge â€” single source of truth, no conflicting labels */}
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
            {/* Progress bar + countdown â€” active window only */}
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
        /* Upcoming shift mode â€” neutral card, single "Upcoming" badge */
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
                    {shift.startTime} â€“ {shift.endTime}
                    {site ? ` Â· ${site.name}` : ""}
                    {shift.gracePeriodMinutes > 0 ? ` Â· ${shift.gracePeriodMinutes}min grace` : ""}
                  </p>
                  {workingDayNames && (
                    <p className="text-xs text-muted-foreground mt-0.5">Working days: {workingDayNames}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 text-right shrink-0 max-w-[160px]">
                {/* Canonical "Upcoming" badge */}
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
        /* No shift mode */
        <Card className="border-muted">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">No shift assigned â€” contact HR.</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Next shift mini-card â€” shown only when primary banner is "active" AND an upcoming
          shift exists. Keeps the two shift states on separate, clearly labelled cards. */}
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
                  {upcomingNextShift.shiftStart}â€“{upcomingNextShift.shiftEnd}
                  {upcomingNextShift.siteName ? ` Â· ${upcomingNextShift.siteName}` : ""}
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
              <li>Correction request pending â€” HR will update your times when they decide.</li>
            ) : null}
            {operationalHints?.hasPendingManualCheckIn ? (
              <li>
                Manual check-in request pending
                {operationalHints.pendingManualCheckInCount > 1
                  ? ` (${operationalHints.pendingManualCheckInCount})` : ""}
                {" "}
                â€” HR must approve before it counts as attendance.
              </li>
            ) : null}
            {attStrip.attendanceInconsistent ? (
              <li>Attendance data looks inconsistent â€” use Fix attendance so HR can correct the record.</li>
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
                            Active â€” check out to close
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
                              "Shift window has ended â€” tap Check out to save your time, or use Fix attendance if the times are wrong."}
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
                          {upcomingNextShift.siteName ? ` Â· ${upcomingNextShift.siteName}` : ""}. Check in again when that window opens.
                        </p>
                      )}
                      {betweenShifts && !upcomingNextShift && shift && (
                        <p className="mt-1 text-xs leading-snug text-amber-900/90 dark:text-amber-100/90">
                          Earlier block finished. Next shift: {shift.startTime} â€“ {shift.endTime}
                          {site?.name ? ` Â· ${site.name}` : ""}. Check in when that window opens.
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
                        Server time â€” check in from then.
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
                        Wrong times or missed check-in? Submit a correction â€” HR reviews and updates your record.
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
                <span className="font-semibold">Can't check out yet.</span> Refresh, or contact HR if you need to clock out.
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

      {/* Multi-shift panel â€” shown when 2+ shifts are scheduled today */}
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
              return todayShifts.map((shift) => (
                <TodayShiftRow
                  key={shift.scheduleId}
                  shift={shift}
                  openShiftName={openShiftName}
                  onCheckIn={() => handleCheckIn(shift.siteToken ?? undefined)}
                  onCheckOut={handleCheckOut}
                  mutating={attendanceMutating}
                />
              ));
            })()}
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
                      {c.requestedCheckIn && c.requestedCheckOut && <span> Â· </span>}
                      {c.requestedCheckOut && <span>Out {String(c.requestedCheckOut).slice(0, 5)}</span>}
                      <span className="text-[10px]"> (Asia/Muscat)</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{c.reason}</p>
                  {c.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground mt-1">With HR for review â€” you&apos;ll see the result here.</p>
                  )}
                  {c.status === "approved" && (
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-200/90 mt-1">
                      Approved{c.adminNote ? ` â€” HR note: ${c.adminNote}` : " â€” times updated when HR saved the decision."}
                    </p>
                  )}
                  {c.status === "rejected" && (
                    <p className="text-[11px] text-red-800 dark:text-red-200/90 mt-1">
                      Not approved{c.adminNote ? ` â€” HR: ${c.adminNote}` : "."} Contact HR if you disagree.
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

      {(myManualList ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> My Manual Check-in Requests
            </CardTitle>
            <p className="text-[11px] text-muted-foreground font-normal leading-snug">
              When you could not use normal check-in (for example outside the geo-fence), HR reviews these before they count.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(myManualList as { req: any; site: { name?: string | null } | null }[]).slice(0, 8).map((row) => {
              const req = row.req;
              const site = row.site;
              return (
                <div key={req.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{site?.name ?? "Attendance site"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.justification}</p>
                    {req.requestedAt && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {new Date(req.requestedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {req.status === "pending" ? (
                    <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 shrink-0">
                      <span className="sr-only">Status: </span>Pending
                    </Badge>
                  ) : req.status === "approved" ? (
                    <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 shrink-0">
                      <span className="sr-only">Status: </span>Approved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 shrink-0">
                      <span className="sr-only">Status: </span>Rejected
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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
              HR reviews every manual request before it counts as attendance. Explain what blocked normal check-in â€” include date and site if relevant.
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
                  <span className="font-medium text-foreground">System message:</span>{" "}
                  {operationalHints.eligibilityHeadline} â€” {operationalHints.eligibilityDetail}
                </p>
              </div>
            ) : null}

            {/* Shift selector â€” shown only when 2+ shifts are scheduled today */}
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
                  <option value="">â€” Select a shift â€”</option>
                  {todayShiftsData.shifts.map((s) => (
                    <option key={s.scheduleId} value={s.scheduleId}>
                      {s.shiftName ?? "Shift"} Â· {s.shiftStart}â€“{s.shiftEnd}
                      {s.siteName ? ` Â· ${s.siteName}` : ""}
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
                // If shift selector is shown, a selection is required before submission.
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
              Wrong or missing times? This request does not change your live check-in / check-out buttons â€” HR reviews it separately. Track status in the list below after you send.
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
              {submitCorr.isPending ? "Submitting..." : "Submit correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// Ã¢â€â‚¬Ã¢â€â‚¬ Main Component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export default function EmployeePortalPage() {
  const { t } = useTranslation("hr");
  const { user, isAuthenticated } = useAuth();
  const loginUrl = getLoginUrl();
  const urlSearch = useSearch();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const tab = parseEmployeePortalTabFromSearch(urlSearch);
    if (tab) setActiveTab(tab);
  }, [urlSearch]);

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

  const [portalClock, setPortalClock] = useState(0);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Queries Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
      { enabled: isAuthenticated && activeCompanyId != null },
    );
  const { data: workStatusSummary, isLoading: workStatusLoading } =
    trpc.employeePortal.getMyWorkStatusSummary.useQuery(
      { companyId: activeCompanyId ?? undefined },
      {
        enabled: isAuthenticated && activeCompanyId != null,
        refetchOnWindowFocus: true,
        // Poll only this compact summary â€” not getMyDocuments / getMyTasks â€” unless a concrete
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
  // Leaderboard requires special permission; silently ignore FORBIDDEN to avoid console noise.
  const { data: kpiLeaderboard } = trpc.kpi.getLeaderboard.useQuery(
    { month: kpiMonth, year: kpiYear, companyId: activeCompanyId ?? undefined },
    {
      enabled: isAuthenticated && activeCompanyId != null,
      retry: (failureCount, error: any) => {
        if (error?.data?.code === "FORBIDDEN") return false;
        return failureCount < 2;
      },
    },
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
      toast.success("Expense claim submitted â€” awaiting approval");
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mutations Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
      toast.error("Couldn't send leave request", {
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
      toast.error("Couldn't complete task", { description: err.message || "Try again in a moment." }),
  });
  const startTask = trpc.employeePortal.startTask.useMutation({
    onSuccess: () => {
      toast.success("Task in progress", { description: "Status updated for your manager." });
      utils.employeePortal.getMyTasks.invalidate();
      void utils.employeePortal.getMyWorkStatusSummary.invalidate();
    },
    onError: (err) =>
      toast.error("Couldn't start task", { description: err.message || "Try again in a moment." }),
  });
  const toggleTaskChecklistItem = trpc.employeePortal.toggleTaskChecklistItem.useMutation({
    onSuccess: (data, vars) => {
      void utils.employeePortal.getMyTasks.invalidate();
      void utils.employeePortal.getMyWorkStatusSummary.invalidate();
      setEmpTaskDetail((t: any) => (t && t.id === vars.taskId ? { ...t, checklist: data.checklist } : t));
    },
    onError: (err) =>
      toast.error("Couldn't update checklist", { description: err.message || "Try again." }),
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
      toast.error("Couldn't send request", {
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Derived data Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  /** Align client "now" with server instant from operational hints (countdown / phase). */
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Not authenticated Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Not linked â€” Company Member Portal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
                    Ask your HR manager to go to <strong>HR Ã¢â€ â€™ Team Access &amp; Roles</strong> and click <strong>Grant Access</strong> next to your name.
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

  const emp = profile as ProfileEmpData;
  const { fullName, arabicFullName, payrollReady, hasPhone, hasEmergencyContact } =
    deriveProfileBooleans(emp);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Main Portal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  return (
    <div className="min-h-screen bg-background">
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Sticky Header Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
              </p>
              <p className="text-xs text-muted-foreground truncate" title={fullName}>
                <span className="sr-only">Full name: {fullName}. </span>
                {[emp.position ?? "Employee", emp.department, companyInfo?.name].filter(Boolean).join(" \u00b7 ")}
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

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ Main sections â€” bottom nav (mobile-first PWA) Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0" activationMode="automatic">
          {/* Ã¢â€¢ÂÃ¢â€¢Â OVERVIEW TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                emergencyContactName: emp?.emergencyContactName,
                emergencyContactPhone: emp?.emergencyContactPhone,
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â ATTENDANCE TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
          <TabsContent value="attendance" className="mt-0 space-y-4 focus-visible:outline-none">
            {/* Today's Status + Correction Request */}
            <AttendanceTodayCard
              employeeId={emp.id}
              companyId={activeCompanyId}
              todaySchedule={myActiveSchedule}
              operationalHints={operationalHintsSuccess ? operationalHints ?? null : undefined}
              operationalHintsReady={operationalHintsSuccess}
            />

            {/* Self-service clock stats */}
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Self-service clock â€” this month
              </p>
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
                      {realAttSummary.total > 0 ? `${realAttSummary.hoursWorked}h` : "â€”"}
                    </p>
                    <p className="text-xs text-muted-foreground">Hours worked</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-950/20 border-0">
                  <CardContent className="p-2.5 text-center sm:p-3">
                    <p className="text-2xl font-bold text-purple-700">
                      {realAttSummary.total > 0
                        ? `${Math.round((realAttSummary.hoursWorked / realAttSummary.total) * 10) / 10}h`
                        : "â€”"}
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

            {/* HR-marked monthly history */}
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
                {/* HR-marked attendance summary pills */}
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Official HR attendance status
                </p>
                <p className="mb-2 text-[10px] text-muted-foreground leading-tight">
                  Counts are set by HR and may not yet reflect today&apos;s self-service clock activity.
                </p>
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
                          title={rec ? `${rec.status} â€” In: ${formatTime(rec.checkIn)} Out: ${formatTime(rec.checkOut)}` : "View day details"}
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
                          {scanRecs.length > 0 && (
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Self-service clock
                            </p>
                          )}
                          {scanRecs.map((r: any) => {
                            const cin = new Date(r.checkIn);
                            const cout = r.checkOut ? new Date(r.checkOut) : null;
                            const dMin = cout ? Math.round((cout.getTime() - cin.getTime()) / 60_000) : null;
                            const dur = dMin != null ? (dMin >= 60 ? `${Math.floor(dMin/60)}h ${dMin%60}m` : `${dMin}m`) : null;
                            const status: string = r.completionStatus ?? (cout ? "checked_out" : "in_progress");
                            // Canonical status labels for the calendar day panel
                            const canonicalLabel: Record<string, string> = {
                              in_progress: "Active",
                              completed: "Completed",
                              early_checkout: "Completed",
                              checked_out: "Completed",
                            };
                            return (
                              <div key={`sel-${r.id}`} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
                                <p className="font-medium text-foreground">
                                  {r.shiftName ?? "Shift"}
                                  {r.shiftStart && r.shiftEnd ? ` Â· ${r.shiftStart}â€“${r.shiftEnd}` : ""}
                                  {" "}
                                  <span className={`text-[10px] font-normal ${status === "in_progress" ? "text-green-600" : "text-emerald-600"}`}>
                                    {canonicalLabel[status] ?? status}
                                  </span>
                                </p>
                                <p className="text-muted-foreground mt-0.5">
                                  In: {formatTime(r.checkIn)}
                                  {cout ? ` Â· Out: ${formatTime(r.checkOut)}` : " Â· Open session"}
                                  {dur ? ` Â· ${dur}` : ""}
                                  {r.siteName ? ` Â· ${r.siteName}` : ""}
                                </p>
                              </div>
                            );
                          })}
                          {hrRec ? (
                            <div className={`${scanRecs.length > 0 ? "border-t border-border/60 pt-2" : ""}`}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">HR record</p>
                              <p className="font-medium text-foreground mt-0.5 capitalize">
                                {(hrRec.status as string)?.replace(/_/g, " ") ?? hrRec.status}
                              </p>
                              {(hrRec.checkIn || hrRec.checkOut) && (
                                <p className="text-muted-foreground">
                                  {hrRec.checkIn ? `In: ${formatTime(hrRec.checkIn)}` : ""}
                                  {hrRec.checkOut ? ` Â· Out: ${formatTime(hrRec.checkOut)}` : ""}
                                </p>
                              )}
                            </div>
                          ) : scanRecs.length > 0 ? (
                            /* Pending HR posting â€” self-service data exists but HR hasn't posted yet */
                            <div className="border-t border-border/60 pt-2">
                              <div className="flex items-center gap-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">HR record</p>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                  Pending HR posting
                                </span>
                              </div>
                              <p className="text-muted-foreground mt-1 leading-snug">
                                Your self-service record is saved. HR will post the official status â€” usually by end of day.
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

            {/* Attendance log â€” self-service punches + HR records side by side */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarCheck className="w-3.5 h-3.5" /> Attendance Log
                </CardTitle>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Self-service clock punches. HR-marked records shown separately below.
                </p>
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
                  <AttendanceLogGrouped
                    realAttRecords={realAttRecords}
                    attRecords={attRecords}
                  />
                )}
              </CardContent>
            </Card>
            {/* Ã¢â€¢ÂÃ¢â€¢Â SHIFT CHANGE & TIME OFF REQUESTS Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                  Shift changes, time off, swaps â€” same form as the Requests tab.
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
                      <p className="mx-auto max-w-xs text-xs leading-relaxed">Submit one to HR â€” approvals appear here.</p>
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
                                  {req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` Ã¢â€ â€™ ${formatDate(req.requestedEndDate)}` : ""}
                                  {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                                  {ps ? ` Â· Preferred: ${ps.name} (${ps.startTime}â€“${ps.endTime})` : ""}
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
          {/* Ã¢â€¢ÂÃ¢â€¢Â LEAVE TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                    {entitlements.sick}, emergency {entitlements.emergency}) â€” not a full legal calculation. Omani law allows longer medically
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â PAYROLL TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                          {Number(p.deductions) > 0 && ` Ã¢Ë†â€™ ${Number(p.deductions).toFixed(2)}`}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â TASKS TAB â€” grouped: Today / Upcoming / Completed Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                    Only if the work is done â€” HR sees this in Task Manager.
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
                    {completeTask.isPending ? "Saving..." : "Mark complete"}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â DOCUMENTS TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
          <TabsContent id="portal-documents" value="documents" className="mt-4 space-y-4 scroll-mt-24">
            {/* Expiry alerts */}
            {expiringDocs.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-sm font-medium">
                      {expiringDocs.length} document{expiringDocs.length > 1 ? "s" : ""} expiring soon â€” contact HR to renew
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
                  <p className="font-medium text-foreground">Same vault as HR â€” documents appear here when uploaded to your file</p>
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
                                  {expired ? `Expired ${Math.abs(days!)} days ago` : days === 0 ? "Expires today!" : `Expires in ${days} days â€” ${formatDate(doc.expiresAt)}`}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â PROFILE TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
          <TabsContent value="profile" className="mt-0 focus-visible:outline-none">
            <EmployeeProfileTab
              emp={emp}
              companyInfo={companyInfo}
              payroll={(payroll as any[]) ?? []}
              expiringDocs={expiringDocs}
              docs={(docs as any[]) ?? []}
              setActiveTab={setActiveTab}
              activeCompanyId={activeCompanyId}
              payrollReady={payrollReady}
              hasPhone={hasPhone}
              hasEmergencyContact={hasEmergencyContact}
              fullName={fullName}
              arabicFullName={arabicFullName}
              pendingLeave={pendingLeave}
              trainingAttentionCount={trainingAttentionCount}
              pendingExpensesCount={pendingExpensesCount}
              pendingShiftRequestsCount={pendingShiftRequestsCount}
            />
          </TabsContent>

          {/* Ã¢â€¢ÂÃ¢â€¢Â REQUESTS TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                  <span className="block text-xs font-normal opacity-90">Annual, sick, emergency...</span>
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
                  <span className="block text-xs font-normal text-muted-foreground">Shift, time block, swap, early leave...</span>
                </span>
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                  <ArrowLeftRight className="h-4 w-4 text-primary" />
                  History
                </h2>
                <p className="text-[11px] text-muted-foreground">Calendar Â· list</p>
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
              /* Ã¢â€â‚¬Ã¢â€â‚¬ List View Ã¢â€â‚¬Ã¢â€â‚¬ */
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
                                {req.requestedDate}{req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` Ã¢â€ â€™ ${req.requestedEndDate}` : ""}
                                {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                              </p>
                              <p className="text-xs mt-1">{req.reason}</p>
                              {ps && <p className="text-xs text-primary mt-0.5">Preferred: {ps.name} ({ps.startTime}â€“{ps.endTime})</p>}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â KPI TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                            } Â· Earned: <span className="font-medium text-amber-600">{t.currency ?? "OMR"} {Number(item.commissionEarned ?? 0).toFixed(3)}</span>
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
                            {new Date(log.logDate).toLocaleDateString("en-GB")} Â· Value: <span className="font-semibold text-primary">{Number(log.valueAchieved ?? 0).toLocaleString()}</span>
                            {log.clientName ? ` Â· ${log.clientName}` : ""}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â EXPENSE CLAIMS TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â WORK LOG TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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
                              <p className="text-xs text-muted-foreground">{log.startTime} â€“ {log.endTime}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold text-sm text-primary">{log.hoursWorked ? `${log.hoursWorked}h` : "â€”"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ã¢â€¢ÂÃ¢â€¢Â TRAINING TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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

          {/* Ã¢â€¢ÂÃ¢â€¢Â REVIEWS TAB Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Self-Review Dialog Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Submit Self-Review</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Review Period</Label>
              <Input placeholder="e.g. Q1 2026, Jan-Mar 2026" value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Self Rating (1â€“5)</Label>
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
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Leave Request Dialog Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
              Pick type and dates â€” HR confirms by notification.
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
              {submitLeave.isPending ? "Sending..." : "Send leave request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Notifications Panel Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Shift Change / Time Off / HR Request Dialog (same patterns as leave) Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
              Choose the request type, required dates or time, and a short reason â€” HR confirms by notification.
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
                    <p className="text-xs text-muted-foreground">Use the time picker â€” same timezone as your schedule.</p>
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
                    <SelectValue placeholder="No preference â€” HR will propose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No preference</SelectItem>
                    {(shiftTemplatesList ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.startTime}â€“{s.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Optional â€” leave blank if you want HR to suggest options.</p>
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
                placeholder="e.g. Doctor appointment, family travel, need morning shift next week..."
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
              <p className="text-xs text-muted-foreground">PDF or image, max 5 MB â€” e.g. appointment letter or ticket.</p>
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
                      {uploadingAttachment ? "Uploading..." : "Tap to choose a file (PDF, image, Word)"}
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
              {submitShiftRequest.isPending ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Log KPI Activity Dialog Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Expense Claim Dialog Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Work Log Dialog Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

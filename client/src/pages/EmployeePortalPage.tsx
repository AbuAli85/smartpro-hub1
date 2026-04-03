import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import {
  User, Calendar, FileText, CheckSquare, Bell, BellRing,
  Clock, TrendingUp, AlertCircle, ChevronRight, Megaphone,
  DollarSign, LogIn, Plus, Check, X, Building2, Briefcase,
  Phone, Mail, MapPin, Shield, ChevronLeft, ChevronRight as ChevronRightIcon,
  Home, CreditCard, UserCheck,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ── Types ──────────────────────────────────────────────────────────────────
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";
type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

const TASK_STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <TrendingUp className="w-4 h-4 text-blue-500" />,
  completed: <Check className="w-4 h-4 text-green-500" />,
  cancelled: <X className="w-4 h-4 text-muted-foreground" />,
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const ATTENDANCE_COLOR: Record<AttendanceStatus, string> = {
  present: "bg-green-500",
  late: "bg-amber-500",
  half_day: "bg-blue-400",
  remote: "bg-purple-500",
  absent: "bg-red-500",
};

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half Day",
  remote: "Remote",
  absent: "Absent",
};

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  work_permit: "Work Permit",
  national_id: "National ID",
  contract: "Employment Contract",
  certificate: "Certificate",
  other: "Other",
};

function formatTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return fmtDateLong(ts);
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function EmployeePortalPage() {
  const { user, isAuthenticated } = useAuth();
  const loginUrl = getLoginUrl();
  const [activeTab, setActiveTab] = useState("overview");
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Attendance month navigation
  const today = useMemo(() => new Date(), []);
  const [attMonth, setAttMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Leave form
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading } = trpc.employeePortal.getMyProfile.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: companyInfo } = trpc.employeePortal.getMyCompanyInfo.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: leaveData, isLoading: leaveLoading } = trpc.employeePortal.getMyLeave.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: attData, isLoading: attLoading } = trpc.employeePortal.getMyAttendanceSummary.useQuery(
    { month: attMonth }, { enabled: isAuthenticated }
  );
  const { data: payroll, isLoading: payrollLoading } = trpc.employeePortal.getMyPayroll.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: docs, isLoading: docsLoading } = trpc.employeePortal.getMyDocuments.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: tasks, isLoading: tasksLoading } = trpc.employeePortal.getMyTasks.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: announcements } = trpc.employeePortal.getMyAnnouncements.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: notifData, refetch: refetchNotifs } = trpc.employeePortal.getMyNotifications.useQuery(
    { limit: 30 }, { enabled: isAuthenticated, refetchInterval: 30000 }
  );

  const { data: todaySchedule } = trpc.scheduling.getMyTodaySchedule.useQuery(
    {}, { enabled: isAuthenticated }
  );

  const utils = trpc.useUtils();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const submitLeave = trpc.employeePortal.submitLeaveRequest.useMutation({
    onSuccess: () => {
      toast.success("Leave request submitted — HR will review and notify you.");
      setShowLeaveDialog(false);
      setLeaveType("annual");
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveReason("");
      utils.employeePortal.getMyLeave.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markNotifRead = trpc.employeePortal.markNotificationRead.useMutation({
    onSuccess: () => refetchNotifs(),
  });
  const markAllRead = trpc.employeePortal.markAllNotificationsRead.useMutation({
    onSuccess: () => refetchNotifs(),
  });
  const completeTask = trpc.employeePortal.completeTask.useMutation({
    onSuccess: () => {
      toast.success("Task marked as complete");
      utils.employeePortal.getMyTasks.invalidate();
    },
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const leave = leaveData?.requests ?? [];
  const balance = leaveData?.balance ?? { annual: 30, sick: 15, emergency: 5 };
  const attRecords = attData?.records ?? [];
  const attSummary = attData?.summary ?? { present: 0, absent: 0, late: 0, halfDay: 0, remote: 0, total: 0 };
  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];
  const pendingTasks = (tasks as any[] ?? []).filter((t: any) => t.status !== "completed" && t.status !== "cancelled").length;
  const pendingLeave = leave.filter((l: any) => l.status === "pending").length;

  // Build attendance map for calendar: date string → record
  const attMap = useMemo(() => {
    const m: Record<string, any> = {};
    attRecords.forEach((r: any) => {
      const key = new Date(r.date).toISOString().split("T")[0];
      m[key] = r;
    });
    return m;
  }, [attRecords]);

  // Build calendar days for the selected month
  const calendarDays = useMemo(() => {
    const [y, mo] = attMonth.split("-").map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const firstDay = new Date(y, mo - 1, 1).getDay(); // 0=Sun
    const days: (string | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${attMonth}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [attMonth]);

  // Month navigation helpers
  function prevMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const [y, m] = attMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    const now = new Date();
    if (d > now) return;
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const isCurrentMonth = attMonth === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-sm w-full">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
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

  // ── Not linked ────────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-10 pb-10 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Account Not Linked</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                You are signed in as <strong>{user?.email}</strong>, but this account is not yet linked to an employee record in your company.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Ask your HR manager to go to <strong>HR → Team Access &amp; Roles</strong> and click <strong>Grant Access</strong> next to your name.
              </p>
              <p className="text-xs text-muted-foreground mt-3 bg-muted/40 rounded-lg p-3">
                Once linked, click Refresh below and your full employee portal will appear.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => window.location.reload()}>Refresh</Button>
              <Button variant="outline" asChild><Link href="/dashboard">Go to Dashboard</Link></Button>
            </div>
          </CardContent>
        </Card>
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
                : <User className="w-5 h-5 text-primary" />
              }
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {emp.position ?? "Employee"}{emp.department ? ` · ${emp.department}` : ""}
                {companyInfo ? ` · ${companyInfo.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="relative" onClick={() => setShowNotifications(true)}>
              {unreadCount > 0 ? <BellRing className="w-5 h-5 text-primary" /> : <Bell className="w-5 h-5" />}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* ── Quick Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Annual Leave Left", value: `${balance.annual} days`, icon: Calendar, color: "text-blue-500", onClick: () => setActiveTab("leave") },
            { label: "Sick Leave Left", value: `${balance.sick} days`, icon: AlertCircle, color: "text-amber-500", onClick: () => setActiveTab("leave") },
            { label: "Pending Tasks", value: pendingTasks, icon: CheckSquare, color: "text-purple-500", onClick: () => setActiveTab("tasks") },
            { label: "This Month Present", value: `${attSummary.present} days`, icon: UserCheck, color: "text-green-500", onClick: () => setActiveTab("attendance") },
          ].map(({ label, value, icon: Icon, color, onClick }) => (
            <Card key={label} className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
              <CardContent className="p-4">
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <p className="text-lg font-bold leading-tight">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-7 h-auto text-xs">
            <TabsTrigger value="overview" className="py-2 text-xs flex flex-col gap-0.5 h-auto">
              <Home className="w-3.5 h-3.5" /><span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="py-2 text-xs flex flex-col gap-0.5 h-auto">
              <UserCheck className="w-3.5 h-3.5" /><span className="hidden sm:inline">Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="leave" className="py-2 text-xs flex flex-col gap-0.5 h-auto relative">
              <Calendar className="w-3.5 h-3.5" /><span className="hidden sm:inline">Leave</span>
              {pendingLeave > 0 && <span className="absolute top-1 right-1 w-3 h-3 bg-amber-500 rounded-full text-[8px] text-white flex items-center justify-center">{pendingLeave}</span>}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="py-2 text-xs flex flex-col gap-0.5 h-auto">
              <DollarSign className="w-3.5 h-3.5" /><span className="hidden sm:inline">Payslips</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="py-2 text-xs flex flex-col gap-0.5 h-auto relative">
              <CheckSquare className="w-3.5 h-3.5" /><span className="hidden sm:inline">Tasks</span>
              {pendingTasks > 0 && <span className="absolute top-1 right-1 w-3 h-3 bg-purple-500 rounded-full text-[8px] text-white flex items-center justify-center">{pendingTasks}</span>}
            </TabsTrigger>
            <TabsTrigger value="documents" className="py-2 text-xs flex flex-col gap-0.5 h-auto">
              <FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="py-2 text-xs flex flex-col gap-0.5 h-auto">
              <User className="w-3.5 h-3.5" /><span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
          </TabsList>

          {/* ══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Today's Schedule Banner */}
            {todaySchedule && (
              todaySchedule.isHoliday ? (
                <Card className="border-purple-200 bg-purple-50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-purple-700">{todaySchedule.holiday?.name ?? "Holiday"}</p>
                      <p className="text-xs text-purple-600">Today is a public holiday — no attendance required</p>
                    </div>
                  </CardContent>
                </Card>
              ) : todaySchedule.schedule && todaySchedule.shift ? (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">Today: {todaySchedule.shift.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {todaySchedule.shift.startTime} – {todaySchedule.shift.endTime}
                        {todaySchedule.site ? ` · ${todaySchedule.site.name}` : ""}
                      </p>
                    </div>
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: (todaySchedule.shift as any).color ?? "#6366f1" }}
                    />
                  </CardContent>
                </Card>
              ) : null
            )}
            {/* Leave Balance Bars */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Leave Balance — {new Date().getFullYear()}</span>
                  <Button size="sm" variant="outline" onClick={() => setShowLeaveDialog(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Request Leave
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Annual Leave", used: 30 - balance.annual, total: 30, color: "bg-blue-500" },
                  { label: "Sick Leave", used: 15 - balance.sick, total: 15, color: "bg-amber-500" },
                  { label: "Emergency Leave", used: 5 - balance.emergency, total: 5, color: "bg-red-500" },
                ].map(({ label, used, total, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{total - used} / {total} days remaining</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Announcements */}
            {(announcements as any[])?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary" /> Company Announcements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(announcements as any[]).slice(0, 3).map((a: any) => (
                    <div key={a.id} className={`p-3 rounded-lg border text-sm ${!a.isRead ? "border-primary/30 bg-primary/5" : "bg-muted/30"}`}>
                      <p className="font-medium">{a.title}</p>
                      {a.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(a.createdAt)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent Leave + Recent Tasks side by side on desktop */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Recent Leave</span>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setActiveTab("leave")}>
                      All <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaveLoading ? <Skeleton className="h-12" /> : leave.length === 0 ? (
                    <div className="text-center py-5 text-muted-foreground text-sm">
                      <p>No leave requests yet</p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowLeaveDialog(true)}>
                        <Plus className="w-3 h-3 mr-1" /> Submit Request
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {leave.slice(0, 4).map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between text-sm">
                          <span className="capitalize text-muted-foreground">{(l.leaveType ?? "").replace("_", " ")}</span>
                          <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize text-xs">
                            {l.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><CheckSquare className="w-4 h-4" /> My Tasks</span>
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setActiveTab("tasks")}>
                      All <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {tasksLoading ? <Skeleton className="h-12" /> : (tasks as any[]).filter((t: any) => t.status !== "completed").length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-5">No pending tasks</p>
                  ) : (
                    <div className="space-y-2">
                      {(tasks as any[]).filter((t: any) => t.status !== "completed").slice(0, 4).map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2 text-sm">
                          {TASK_STATUS_ICON[t.status as TaskStatus]}
                          <span className="flex-1 truncate">{t.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority as Priority]}`}>{t.priority}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══ ATTENDANCE TAB ════════════════════════════════════════════════ */}
          <TabsContent value="attendance" className="mt-4 space-y-4">
            {/* Month nav + summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span>{fmtDateLong(attMonth + "-01")}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} disabled={isCurrentMonth}>
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Summary pills */}
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
                      return (
                        <div
                          key={day}
                          className={`relative rounded-lg p-1.5 text-xs ${isToday ? "ring-2 ring-primary" : ""} ${rec ? "cursor-default" : ""}`}
                          title={rec ? `${ATTENDANCE_LABEL[rec.status as AttendanceStatus]} — In: ${formatTime(rec.checkIn)} Out: ${formatTime(rec.checkOut)}` : ""}
                        >
                          <span className={`block text-xs font-medium mb-0.5 ${isToday ? "text-primary" : ""}`}>{dayNum}</span>
                          {rec && (
                            <div className={`w-2 h-2 rounded-full mx-auto ${ATTENDANCE_COLOR[rec.status as AttendanceStatus]}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
                  {Object.entries(ATTENDANCE_COLOR).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      {ATTENDANCE_LABEL[status as AttendanceStatus]}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Attendance records list */}
            {attRecords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Daily Records</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {attRecords.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <p className="font-medium">{formatDate(r.date)}</p>
                        <p className="text-xs text-muted-foreground">
                          In: {formatTime(r.checkIn)} · Out: {formatTime(r.checkOut)}
                        </p>
                      </div>
                      <Badge
                        variant={r.status === "present" ? "default" : r.status === "absent" ? "destructive" : "secondary"}
                        className="capitalize"
                      >
                        {ATTENDANCE_LABEL[r.status as AttendanceStatus] ?? r.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {attRecords.length === 0 && !attLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No attendance records for this month</p>
              </div>
            )}
          </TabsContent>

          {/* ══ LEAVE TAB ════════════════════════════════════════════════════ */}
          <TabsContent value="leave" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowLeaveDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Leave Request
              </Button>
            </div>
            {leaveLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : leave.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No leave records found</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowLeaveDialog(true)}>
                  Submit your first leave request
                </Button>
              </div>
            ) : (
              leave.map((l: any) => (
                <div key={l.id} className="flex items-start justify-between p-4 rounded-lg border bg-card gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm capitalize">{(l.leaveType ?? "").replace("_", " ")} Leave</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(l.startDate)} — {formatDate(l.endDate)}
                    </p>
                    {l.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">"{l.reason}"</p>}
                    {l.notes && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">HR Note: {l.notes}</p>}
                  </div>
                  <Badge
                    variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}
                    className="capitalize shrink-0"
                  >
                    {l.status}
                  </Badge>
                </div>
              ))
            )}
          </TabsContent>

          {/* ══ PAYROLL TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="payroll" className="mt-4 space-y-2">
            {payrollLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (payroll as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No payslips yet</p>
                <p className="text-xs mt-1">Payslips appear here once HR processes your salary</p>
              </div>
            ) : (
              (payroll as any[]).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">
                      {new Date(p.periodYear, p.periodMonth - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Muscat" })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Basic: {p.currency ?? "OMR"} {Number(p.basicSalary).toFixed(2)}
                      {Number(p.allowances) > 0 && ` + ${Number(p.allowances).toFixed(2)} allowances`}
                      {Number(p.deductions) > 0 && ` − ${Number(p.deductions).toFixed(2)} deductions`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{p.currency ?? "OMR"} {Number(p.netSalary).toFixed(2)}</p>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"} className="capitalize text-xs mt-0.5">
                      {p.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* ══ TASKS TAB ════════════════════════════════════════════════════ */}
          <TabsContent value="tasks" className="mt-4 space-y-2">
            {tasksLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (tasks as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No tasks assigned to you</p>
              </div>
            ) : (
              (tasks as any[]).map((task: any) => {
                const overdue = task.status !== "completed" && task.status !== "cancelled" && task.dueDate && new Date(task.dueDate) < today;
                return (
                  <div key={task.id} className={`flex items-start gap-3 p-4 rounded-lg border bg-card ${overdue ? "border-red-200 bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                    <div className="mt-0.5 shrink-0">{TASK_STATUS_ICON[task.status as TaskStatus]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                      {task.dueDate && (
                        <p className={`text-xs mt-0.5 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                          Due: {formatDate(task.dueDate)}{overdue ? " — OVERDUE" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority as Priority]}`}>
                        {task.priority}
                      </span>
                      {task.status !== "completed" && task.status !== "cancelled" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={completeTask.isPending}
                          onClick={() => completeTask.mutate({ taskId: task.id })}>
                          Done
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ══ DOCUMENTS TAB ════════════════════════════════════════════════ */}
          <TabsContent value="documents" className="mt-4 space-y-2">
            {docsLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (docs as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No documents on file</p>
                <p className="text-sm mt-1">Contact HR to upload your documents</p>
              </div>
            ) : (
              (docs as any[]).map((doc: any) => {
                const expired = doc.expiresAt && new Date(doc.expiresAt) < today;
                const expiringSoon = !expired && doc.expiresAt && new Date(doc.expiresAt) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                return (
                  <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border bg-card gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                      {doc.expiresAt && (
                        <p className={`text-xs mt-0.5 ${expired ? "text-red-600 font-medium" : expiringSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                          Expires: {formatDate(doc.expiresAt)}{expired ? " — EXPIRED" : expiringSoon ? " — Expiring Soon" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                      {expiringSoon && !expired && <Badge className="text-xs bg-amber-500 hover:bg-amber-600">Expiring</Badge>}
                      {doc.fileUrl && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">View</a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ══ PROFILE TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="profile" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="w-4 h-4" /> My Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Basic Info */}
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: "Full Name (EN)", value: `${emp.firstName} ${emp.lastName}` },
                    { label: "Full Name (AR)", value: emp.firstNameAr ? `${emp.firstNameAr} ${emp.lastNameAr ?? ""}` : null },
                    { label: "Employee Number", value: emp.employeeNumber },
                    { label: "Email", value: emp.email, icon: Mail },
                    { label: "Phone", value: emp.phone, icon: Phone },
                    { label: "Nationality", value: emp.nationality, icon: MapPin },
                  ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                    <div key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Work Info */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Work Information</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: "Company", value: companyInfo?.name, icon: Building2 },
                      { label: "Department", value: emp.department, icon: Briefcase },
                      { label: "Position / Title", value: emp.position },
                      { label: "Employment Type", value: emp.employmentType?.replace("_", " ") },
                      { label: "Status", value: emp.status },
                      { label: "Hire Date", value: emp.hireDate ? formatDate(emp.hireDate) : null },
                    ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5 capitalize">
                          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Documents / Visa Info */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Documents & Visa</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: "Passport Number", value: emp.passportNumber, icon: Shield },
                      { label: "National ID", value: emp.nationalId },
                      { label: "Visa Number", value: emp.visaNumber },
                      { label: "Visa Expiry", value: emp.visaExpiryDate ? formatDate(emp.visaExpiryDate) : null },
                      { label: "Work Permit No.", value: emp.workPermitNumber },
                      { label: "Work Permit Expiry", value: emp.workPermitExpiryDate ? formatDate(emp.workPermitExpiryDate) : null },
                      { label: "PASI Number", value: emp.pasiNumber },
                    ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                      <div key={label}>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {(emp.bankName || emp.bankAccountNumber) && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bank Details</p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {[
                          { label: "Bank Name", value: emp.bankName, icon: CreditCard },
                          { label: "Account Number", value: emp.bankAccountNumber },
                        ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                          <div key={label}>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                              {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {(emp.emergencyContactName || emp.emergencyContactPhone) && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emergency Contact</p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {[
                          { label: "Name", value: emp.emergencyContactName },
                          { label: "Phone", value: emp.emergencyContactPhone, icon: Phone },
                        ].filter((f) => f.value).map(({ label, value, icon: Icon }) => (
                          <div key={label}>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                              {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Leave Request Dialog ── */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label>Start Date</Label>
                <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} min={today.toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} min={leaveStart || today.toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea placeholder="Briefly explain the reason..." value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button disabled={!leaveStart || !leaveEnd || submitLeave.isPending}
              onClick={() => submitLeave.mutate({ leaveType: leaveType as any, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason || undefined })}>
              {submitLeave.isPending ? "Submitting..." : "Submit Request"}
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
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllRead.mutate()}>
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
    </div>
  );
}

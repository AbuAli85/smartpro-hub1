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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import {
  User, Calendar, FileText, CheckSquare, Bell, BellRing,
  Clock, TrendingUp, AlertCircle, ChevronRight, Megaphone,
  DollarSign, LogIn, Plus, Check, X, Building2, Briefcase,
  Phone, Mail, MapPin, Shield, ChevronLeft, ChevronRight as ChevronRightIcon,
  Home, CreditCard, UserCheck, Edit2, Save, Download, QrCode,
  AlertTriangle, Info, Wallet, Timer, BarChart2, CalendarCheck,
  FileCheck, FilePlus, ExternalLink, RefreshCw, Star,
} from "lucide-react";
import { fmtDateLong, fmtDateTime } from "@/lib/dateUtils";

// ── Types ──────────────────────────────────────────────────────────────────
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

const TASK_STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <TrendingUp className="w-4 h-4 text-blue-500" />,
  completed: <Check className="w-4 h-4 text-green-500" />,
  cancelled: <X className="w-4 h-4 text-muted-foreground" />,
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

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

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  work_permit: "Work Permit",
  national_id: "National ID",
  contract: "Employment Contract",
  certificate: "Certificate",
  other: "Other",
};

const DOC_ICONS: Record<string, React.ReactElement> = {
  passport: <Shield className="w-4 h-4 text-blue-500" />,
  visa: <FileCheck className="w-4 h-4 text-green-500" />,
  work_permit: <FileText className="w-4 h-4 text-amber-500" />,
  national_id: <User className="w-4 h-4 text-purple-500" />,
  contract: <FileText className="w-4 h-4 text-primary" />,
  certificate: <Star className="w-4 h-4 text-yellow-500" />,
  other: <FileText className="w-4 h-4 text-muted-foreground" />,
};

function formatTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return fmtDateLong(ts);
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
function AttendanceTodayCard({ employeeId, attendSiteToken }: { employeeId: number | null; attendSiteToken?: string | null }) {
  const utils = trpc.useUtils();
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [corrDate, setCorrDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [corrCheckIn, setCorrCheckIn] = useState("");
  const [corrCheckOut, setCorrCheckOut] = useState("");
  const [corrReason, setCorrReason] = useState("");

  const { data: todayRec, refetch: refetchToday } = trpc.attendance.myToday.useQuery(
    undefined, { enabled: !!employeeId }
  );
  const { data: myCorrList, refetch: refetchCorr } = trpc.attendance.myCorrections.useQuery(
    {}, { enabled: !!employeeId }
  );

  const submitCorr = trpc.attendance.submitCorrection.useMutation({
    onSuccess: () => {
      toast.success("Correction request submitted — HR will review it");
      setShowCorrForm(false);
      setCorrDate(new Date().toISOString().split("T")[0]);
      setCorrCheckIn(""); setCorrCheckOut(""); setCorrReason("");
      refetchCorr();
    },
    onError: (e) => toast.error(e.message),
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const checkIn = todayRec?.checkIn ? new Date(todayRec.checkIn) : null;
  const checkOut = todayRec?.checkOut ? new Date(todayRec.checkOut) : null;
  const pendingCorr = (myCorrList ?? []).filter((c: any) => c.status === "pending").length;

  // Calculate hours worked today
  const hoursToday = checkIn && checkOut
    ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(1)
    : checkIn ? "In progress" : null;

  return (
    <div className="space-y-3">
      {/* Today's status card */}
      <Card className={checkIn ? "border-green-200 bg-green-50/50 dark:bg-green-950/10" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10"}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${checkIn ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                <UserCheck className={`w-5 h-5 ${checkIn ? "text-green-600" : "text-amber-600"}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                {checkIn ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-muted-foreground">Checked In</p>
                        <p className="font-bold text-green-700 dark:text-green-400">{checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      {checkOut ? (
                        <div>
                          <p className="text-xs text-muted-foreground">Checked Out</p>
                          <p className="font-bold text-muted-foreground">{checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      ) : (
                        <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50 dark:bg-green-900/20">
                          Currently In
                        </Badge>
                      )}
                      {hoursToday && (
                        <div>
                          <p className="text-xs text-muted-foreground">Hours</p>
                          <p className="font-semibold text-sm">{hoursToday}{typeof hoursToday === "string" && hoursToday !== "In progress" ? "h" : ""}</p>
                        </div>
                      )}
                    </div>
                    {todayRec?.siteName && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {todayRec.siteName}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400">Not checked in yet</p>
                    {attendSiteToken && (
                      <Button size="sm" variant="outline" className="mt-2 gap-1.5 border-green-300 text-green-700 hover:bg-green-50" asChild>
                        <a href={`/attend/${attendSiteToken}`} target="_blank" rel="noopener noreferrer">
                          <QrCode className="w-3.5 h-3.5" /> Check In Now
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setShowCorrForm(true)}>
              <AlertCircle className="h-3.5 w-3.5" /> Request Correction
              {pendingCorr > 0 && (
                <span className="ml-1 h-4 w-4 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center">{pendingCorr}</span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <p className="text-xs text-muted-foreground">{c.reason}</p>
                  {c.adminNote && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">HR: {c.adminNote}</p>
                  )}
                </div>
                {c.status === "pending"
                  ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">Pending</Badge>
                  : c.status === "approved"
                  ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Approved</Badge>
                  : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Rejected</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Correction request dialog */}
      <Dialog open={showCorrForm} onOpenChange={setShowCorrForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Attendance Correction</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If your check-in or check-out time is wrong or missing, submit a correction request. HR will review and approve it.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="corrDate">Date</Label>
              <Input id="corrDate" type="date" value={corrDate} onChange={(e) => setCorrDate(e.target.value)} max={todayStr} />
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
              <Textarea id="corrReason" value={corrReason} onChange={(e) => setCorrReason(e.target.value)}
                placeholder="Explain why the correction is needed…" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrForm(false)}>Cancel</Button>
            <Button
              disabled={!corrReason.trim() || corrReason.trim().length < 10 || submitCorr.isPending}
              onClick={() => submitCorr.mutate({
                requestedDate: corrDate,
                requestedCheckIn: corrCheckIn || undefined,
                requestedCheckOut: corrCheckOut || undefined,
                reason: corrReason,
              })}>
              {submitCorr.isPending ? "Submitting…" : "Submit Request"}
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

  // Leave filter
  const [leaveFilter, setLeaveFilter] = useState<string>("all");

  // Task filter
  const [taskFilter, setTaskFilter] = useState<string>("active");

  // Profile edit state
  const [editingContact, setEditingContact] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editEmergencyName, setEditEmergencyName] = useState("");
  const [editEmergencyPhone, setEditEmergencyPhone] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = trpc.employeePortal.getMyProfile.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: companyInfo } = trpc.employeePortal.getMyCompanyInfo.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: leaveData, isLoading: leaveLoading, refetch: refetchLeave } = trpc.employeePortal.getMyLeave.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: attData, isLoading: attLoading } = trpc.employeePortal.getMyAttendanceSummary.useQuery(
    { month: attMonth }, { enabled: isAuthenticated }
  );
  const { data: realAttData } = trpc.employeePortal.getMyAttendanceRecords.useQuery(
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
  const realAttRecords = realAttData?.records ?? [];
  const realAttSummary = realAttData?.summary ?? { total: 0, hoursWorked: 0 };
  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];
  const pendingTasks = (tasks as any[] ?? []).filter((t: any) => t.status !== "completed" && t.status !== "cancelled").length;
  const pendingLeave = leave.filter((l: any) => l.status === "pending").length;

  // Attendance rate for current month
  const attendanceRate = attSummary.total > 0
    ? Math.round(((attSummary.present + attSummary.late) / attSummary.total) * 100)
    : null;

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

  // Filtered leave
  const filteredLeave = useMemo(() => {
    if (leaveFilter === "all") return leave;
    return leave.filter((l: any) => l.status === leaveFilter);
  }, [leave, leaveFilter]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const all = tasks as any[] ?? [];
    if (taskFilter === "active") return all.filter((t: any) => t.status !== "completed" && t.status !== "cancelled");
    if (taskFilter === "completed") return all.filter((t: any) => t.status === "completed");
    return all;
  }, [tasks, taskFilter]);

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
              <p className="font-semibold text-sm leading-tight truncate">{fullName}</p>
              <p className="text-xs text-muted-foreground truncate">
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
            { label: "Annual Leave Left", value: `${balance.annual} days`, icon: Calendar, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/20", onClick: () => setActiveTab("leave") },
            { label: "Sick Leave Left", value: `${balance.sick} days`, icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20", onClick: () => setActiveTab("leave") },
            { label: "Pending Tasks", value: String(pendingTasks), icon: CheckSquare, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20", onClick: () => setActiveTab("tasks") },
            { label: "This Month Present", value: `${realAttSummary.total} days`, icon: UserCheck, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/20", onClick: () => setActiveTab("attendance") },
          ].map(({ label, value, icon: Icon, color, bg, onClick }) => (
            <Card key={label} className={`hover:shadow-md transition-shadow cursor-pointer ${bg} border-0`} onClick={onClick}>
              <CardContent className="p-4">
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <p className="text-xl font-bold leading-tight">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-7 h-auto">
            {[
              { value: "overview", icon: Home, label: "Overview" },
              { value: "attendance", icon: UserCheck, label: "Attendance" },
              { value: "leave", icon: Calendar, label: "Leave", badge: pendingLeave },
              { value: "payroll", icon: DollarSign, label: "Payslips" },
              { value: "tasks", icon: CheckSquare, label: "Tasks", badge: pendingTasks },
              { value: "documents", icon: FileText, label: "Docs", badge: expiringDocs.length },
              { value: "profile", icon: User, label: "Profile" },
            ].map(({ value, icon: Icon, label, badge }) => (
              <TabsTrigger key={value} value={value} className="py-2 text-xs flex flex-col gap-0.5 h-auto relative">
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
                {badge && badge > 0 && (
                  <span className="absolute top-1 right-1 w-3 h-3 bg-primary rounded-full text-[8px] text-white flex items-center justify-center">{badge}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Today's Schedule Banner */}
            {todaySchedule && (
              todaySchedule.isHoliday ? (
                <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/10">
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
                      <p className="font-semibold text-sm">Today's Shift: {todaySchedule.shift.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {todaySchedule.shift.startTime} – {todaySchedule.shift.endTime}
                        {todaySchedule.site ? ` · ${todaySchedule.site.name}` : ""}
                      </p>
                    </div>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: (todaySchedule.shift as any).color ?? "#6366f1" }} />
                  </CardContent>
                </Card>
              ) : null
            )}

            {/* Attendance Rate + Leave Balance */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Attendance Rate */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-green-500" /> This Month Attendance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attendanceRate !== null ? (
                    <>
                      <div className="flex items-end justify-between">
                        <p className="text-3xl font-bold text-green-600">{attendanceRate}%</p>
                        <p className="text-xs text-muted-foreground">{attSummary.present + attSummary.late} / {attSummary.total} days</p>
                      </div>
                      <Progress value={attendanceRate} className="h-2" />
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
                          <p className="font-bold text-green-700">{attSummary.present}</p>
                          <p className="text-muted-foreground">On Time</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                          <p className="font-bold text-amber-700">{attSummary.late}</p>
                          <p className="text-muted-foreground">Late</p>
                        </div>
                        <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
                          <p className="font-bold text-red-700">{attSummary.absent}</p>
                          <p className="text-muted-foreground">Absent</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No attendance data this month</p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setActiveTab("attendance")}>
                        View Attendance
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Leave Balance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" /> Leave Balance {new Date().getFullYear()}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLeaveDialog(true)}>
                      <Plus className="w-3 h-3 mr-1" /> Request
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Annual Leave", used: 30 - balance.annual, total: 30, color: "bg-blue-500", remaining: balance.annual },
                    { label: "Sick Leave", used: 15 - balance.sick, total: 15, color: "bg-amber-500", remaining: balance.sick },
                    { label: "Emergency Leave", used: 5 - balance.emergency, total: 5, color: "bg-red-500", remaining: balance.emergency },
                  ].map(({ label, used, total, color, remaining }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={`font-semibold ${remaining <= 2 ? "text-red-600" : remaining <= 5 ? "text-amber-600" : "text-foreground"}`}>
                          {remaining} / {total} days left
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, (used / total) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

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
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{a.title}</p>
                          {a.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>}
                        </div>
                        {!a.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(a.createdAt)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent Leave + Tasks */}
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
                          <div className="min-w-0">
                            <p className="text-sm font-medium capitalize">{LEAVE_TYPE_LABEL[l.leaveType] ?? l.leaveType}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(l.startDate)}</p>
                          </div>
                          <Badge
                            variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : l.status === "cancelled" ? "outline" : "secondary"}
                            className="capitalize text-xs shrink-0"
                          >
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
                      {(tasks as any[]).filter((t: any) => t.status !== "completed").slice(0, 4).map((t: any) => {
                        const overdue = t.dueDate && new Date(t.dueDate) < today;
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-sm">
                            {TASK_STATUS_ICON[t.status as TaskStatus]}
                            <span className={`flex-1 truncate ${overdue ? "text-red-600" : ""}`}>{t.title}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority as Priority]}`}>{t.priority}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Document Expiry Alerts */}
            {expiringDocs.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4" /> Document Expiry Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {expiringDocs.map((d: any) => {
                    const days = daysUntilExpiry(d.expiresAt);
                    return (
                      <div key={d.id} className="flex items-center justify-between text-sm">
                        <span>{DOC_LABELS[d.documentType] ?? d.documentType}</span>
                        <span className={`text-xs font-medium ${days !== null && days < 0 ? "text-red-600" : days !== null && days <= 30 ? "text-red-500" : "text-amber-600"}`}>
                          {days !== null && days < 0 ? "EXPIRED" : days !== null && days === 0 ? "Expires today" : `${days} days left`}
                        </span>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setActiveTab("documents")}>
                    View Documents
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ══ ATTENDANCE TAB ════════════════════════════════════════════════ */}
          <TabsContent value="attendance" className="mt-4 space-y-4">
            {/* Today's Status + Correction Request */}
            <AttendanceTodayCard employeeId={emp.id} />

            {/* Real-time attendance stats */}
            {realAttSummary.total > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <Card className="bg-green-50 dark:bg-green-950/20 border-0">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-700">{realAttSummary.total}</p>
                    <p className="text-xs text-muted-foreground">Check-ins</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50 dark:bg-blue-950/20 border-0">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-700">{realAttSummary.hoursWorked}h</p>
                    <p className="text-xs text-muted-foreground">Hours Worked</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 dark:bg-purple-950/20 border-0">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-purple-700">
                      {realAttSummary.total > 0 ? Math.round(realAttSummary.hoursWorked / realAttSummary.total * 10) / 10 : 0}h
                    </p>
                    <p className="text-xs text-muted-foreground">Avg/Day</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Month nav + calendar */}
            <Card>
              <CardHeader className="pb-2">
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
                      const statusColors: Record<string, string> = {
                        present: "bg-green-500",
                        late: "bg-amber-500",
                        half_day: "bg-blue-400",
                        remote: "bg-purple-500",
                        absent: "bg-red-500",
                      };
                      return (
                        <div
                          key={day}
                          className={`relative rounded-lg p-1.5 text-xs ${isToday ? "ring-2 ring-primary" : ""}`}
                          title={rec ? `${rec.status} — In: ${formatTime(rec.checkIn)} Out: ${formatTime(rec.checkOut)}` : ""}
                        >
                          <span className={`block text-xs font-medium mb-0.5 ${isToday ? "text-primary" : ""}`}>{dayNum}</span>
                          {rec && <div className={`w-2 h-2 rounded-full mx-auto ${statusColors[rec.status] ?? "bg-gray-400"}`} />}
                        </div>
                      );
                    })}
                  </div>
                )}

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

            {/* QR Check-in records */}
            {realAttRecords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <QrCode className="w-3.5 h-3.5" /> QR Check-in Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {realAttRecords.slice(0, 10).map((r: any) => {
                    const cin = new Date(r.checkIn);
                    const cout = r.checkOut ? new Date(r.checkOut) : null;
                    const hours = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null;
                    return (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                        <div>
                          <p className="font-medium">{cin.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
                          <p className="text-xs text-muted-foreground">
                            In: {formatTime(r.checkIn)}
                            {cout ? ` · Out: ${formatTime(r.checkOut)}` : " · Still in"}
                            {r.siteName ? ` · ${r.siteName}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          {hours && <p className="text-sm font-semibold text-green-700">{hours}h</p>}
                          <Badge variant="outline" className="text-xs capitalize">{r.method?.replace("_", " ") ?? "QR"}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* HR Attendance Records */}
            {attRecords.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CalendarCheck className="w-3.5 h-3.5" /> HR Attendance Records
                  </CardTitle>
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
                        {r.status?.replace("_", " ") ?? r.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {attRecords.length === 0 && realAttRecords.length === 0 && !attLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No attendance records for this month</p>
              </div>
            )}
          </TabsContent>

          {/* ══ LEAVE TAB ════════════════════════════════════════════════════ */}
          <TabsContent value="leave" className="mt-4 space-y-4">
            {/* Leave Balance Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Annual", remaining: balance.annual, total: 30, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                { label: "Sick", remaining: balance.sick, total: 15, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
                { label: "Emergency", remaining: balance.emergency, total: 5, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
              ].map(({ label, remaining, total, color, bg }) => (
                <Card key={label} className={`${bg} border-0`}>
                  <CardContent className="p-3 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{remaining}</p>
                    <p className="text-xs text-muted-foreground">{label} days left</p>
                    <div className="h-1 bg-white/50 rounded-full mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${color.replace("text-", "bg-")}`}
                        style={{ width: `${(remaining / total) * 100}%` }} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

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
                                onClick={() => cancelLeave.mutate({ leaveId: l.id })}>
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

          {/* ══ TASKS TAB ════════════════════════════════════════════════════ */}
          <TabsContent value="tasks" className="mt-4 space-y-4">
            {/* Task stats */}
            {(tasks as any[]).length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Pending", count: (tasks as any[]).filter((t: any) => t.status === "pending").length, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
                  { label: "In Progress", count: (tasks as any[]).filter((t: any) => t.status === "in_progress").length, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
                  { label: "Completed", count: (tasks as any[]).filter((t: any) => t.status === "completed").length, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/20" },
                ].map(({ label, count, color, bg }) => (
                  <Card key={label} className={`${bg} border-0`}>
                    <CardContent className="p-3 text-center">
                      <p className={`text-2xl font-bold ${color}`}>{count}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2">
              {["active", "all", "completed"].map((f) => (
                <Button key={f} size="sm" variant={taskFilter === f ? "default" : "outline"}
                  className="h-7 text-xs capitalize" onClick={() => setTaskFilter(f)}>
                  {f === "active" ? "Active" : f === "all" ? "All" : "Completed"}
                </Button>
              ))}
            </div>

            {tasksLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No {taskFilter === "active" ? "active" : taskFilter === "completed" ? "completed" : ""} tasks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task: any) => {
                  const overdue = task.status !== "completed" && task.status !== "cancelled" && task.dueDate && new Date(task.dueDate) < today;
                  return (
                    <Card key={task.id} className={overdue ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">{TASK_STATUS_ICON[task.status as TaskStatus]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`font-medium text-sm ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                                {task.title}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PRIORITY_COLOR[task.priority as Priority]}`}>
                                {task.priority}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="capitalize">{TASK_STATUS_LABEL[task.status as TaskStatus]}</span>
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : ""}`}>
                                  <Clock className="w-3 h-3" />
                                  {overdue ? "Overdue: " : "Due: "}{formatDate(task.dueDate)}
                                </span>
                              )}
                            </div>
                          </div>
                          {task.status !== "completed" && task.status !== "cancelled" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                              disabled={completeTask.isPending}
                              onClick={() => completeTask.mutate({ taskId: task.id })}>
                              <Check className="w-3 h-3 mr-1" /> Done
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ DOCUMENTS TAB ════════════════════════════════════════════════ */}
          <TabsContent value="documents" className="mt-4 space-y-4">
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
                <div className="mt-4 p-3 bg-muted/30 rounded-lg text-xs text-left max-w-xs mx-auto space-y-1">
                  <p className="font-medium text-foreground">Documents HR can upload for you:</p>
                  {["Passport copy", "Visa / Residence permit", "Work permit", "Employment contract", "Certificates"].map((d) => (
                    <p key={d} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-500" /> {d}</p>
                  ))}
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
          <TabsContent value="profile" className="mt-4 space-y-4">
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
                        onClick={() => updateContact.mutate({
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
                  <div className="grid sm:grid-cols-2 gap-3">
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
                )}
              </CardContent>
            </Card>

            {/* Work Information */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Work Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
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
                      <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5 capitalize">
                        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Documents & Visa */}
            {(emp.passportNumber || emp.visaNumber || emp.workPermitNumber || emp.nationalId || emp.pasiNumber) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Documents & Visa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
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
                          <p className={`text-sm font-medium flex items-center gap-1.5 mt-0.5 ${isExpired ? "text-red-600" : isExpiring ? "text-amber-600" : ""}`}>
                            {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                            {value}
                            {isExpired && <Badge variant="destructive" className="text-xs ml-1">Expired</Badge>}
                            {isExpiring && !isExpired && <Badge className="text-xs ml-1 bg-amber-500 hover:bg-amber-600">{days}d</Badge>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Emergency Contact */}
            {(emp.emergencyContactName || emp.emergencyContactPhone) && !editingContact && (
              <Card className="border-red-100 dark:border-red-900/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" /> Emergency Contact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {emp.emergencyContactName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm font-medium mt-0.5">{emp.emergencyContactName}</p>
                      </div>
                    )}
                    {emp.emergencyContactPhone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-sm font-medium flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                          <a href={`tel:${emp.emergencyContactPhone}`} className="hover:underline">{emp.emergencyContactPhone}</a>
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bank Details */}
            {(emp.bankName || emp.bankAccountNumber) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Bank Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {emp.bankName && (
                      <div>
                        <p className="text-xs text-muted-foreground">Bank Name</p>
                        <p className="text-sm font-medium mt-0.5">{emp.bankName}</p>
                      </div>
                    )}
                    {emp.bankAccountNumber && (
                      <div>
                        <p className="text-xs text-muted-foreground">Account Number</p>
                        <p className="text-sm font-medium mt-0.5">{emp.bankAccountNumber}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
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
                <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}
                  min={today.toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}
                  min={leaveStart || today.toISOString().split("T")[0]} />
              </div>
            </div>
            {leaveStart && leaveEnd && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Timer className="w-3 h-3" /> {calcDays(leaveStart, leaveEnd)} day{calcDays(leaveStart, leaveEnd) !== 1 ? "s" : ""} requested
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea placeholder="Briefly explain the reason..." value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button disabled={!leaveStart || !leaveEnd || submitLeave.isPending}
              onClick={() => submitLeave.mutate({
                leaveType: leaveType as any,
                startDate: leaveStart,
                endDate: leaveEnd,
                reason: leaveReason || undefined,
              })}>
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

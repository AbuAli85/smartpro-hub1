import React, { useState } from "react";
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
import { toast } from "sonner";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import {
  User, Calendar, FileText, CheckSquare, Bell, BellRing,
  Clock, TrendingUp, AlertCircle, ChevronRight, Megaphone,
  DollarSign, Briefcase, LogIn, Plus, Check, X,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

const STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
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

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  work_permit: "Work Permit",
  national_id: "National ID",
  contract: "Employment Contract",
  certificate: "Certificate",
  other: "Other",
};

export default function EmployeePortalPage() {
  const { user, isAuthenticated } = useAuth();
  const loginUrl = getLoginUrl();
  const [activeTab, setActiveTab] = useState("overview");
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Leave form state
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  // Queries
  const { data: profile, isLoading: profileLoading } = trpc.employeePortal.getMyProfile.useQuery(undefined, { enabled: isAuthenticated });
  const { data: leaveData, isLoading: leaveLoading } = trpc.employeePortal.getMyLeave.useQuery(undefined, { enabled: isAuthenticated });
  const { data: payroll, isLoading: payrollLoading } = trpc.employeePortal.getMyPayroll.useQuery(undefined, { enabled: isAuthenticated });
  const { data: docs, isLoading: docsLoading } = trpc.employeePortal.getMyDocuments.useQuery(undefined, { enabled: isAuthenticated });
  const { data: tasks, isLoading: tasksLoading } = trpc.employeePortal.getMyTasks.useQuery(undefined, { enabled: isAuthenticated });
  const { data: announcements, isLoading: annLoading } = trpc.employeePortal.getMyAnnouncements.useQuery(undefined, { enabled: isAuthenticated });
  const { data: notifData, refetch: refetchNotifs } = trpc.employeePortal.getMyNotifications.useQuery({ limit: 30 }, { enabled: isAuthenticated, refetchInterval: 30000 });

  const utils = trpc.useUtils();

  // Mutations
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
      toast.success("Task marked complete");
      utils.employeePortal.getMyTasks.invalidate();
    },
  });

  const leave = leaveData?.requests ?? [];
  const balance = leaveData?.balance ?? { annual: 0, sick: 0, emergency: 0 };
  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
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

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Account Not Linked</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Your login account (<strong>{user?.email}</strong>) is not yet linked to an employee record.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Please ask your HR manager to go to <strong>Company → Team Access</strong> and click <strong>Grant Access</strong> on your name.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emp = profile;
  const fullName = `${emp.firstName} ${emp.lastName}`;
  const pendingTasks = (tasks as any[] ?? []).filter((t: any) => t.status !== "completed" && t.status !== "cancelled").length;
  const pendingLeave = leave.filter((l: any) => l.status === "pending").length;
  const unreadAnn = (announcements as any[] ?? []).filter((a: any) => !a.isRead).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">{fullName}</p>
              <p className="text-xs text-muted-foreground">{emp.position ?? emp.department ?? "Employee"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setShowNotifications(true)}
            >
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

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Annual Leave Left", value: `${balance.annual} days`, icon: Calendar, color: "text-blue-500" },
            { label: "Sick Leave Left", value: `${balance.sick} days`, icon: AlertCircle, color: "text-amber-500" },
            { label: "Pending Tasks", value: pendingTasks, icon: CheckSquare, color: "text-purple-500" },
            { label: "Leave Requests", value: pendingLeave > 0 ? `${pendingLeave} pending` : "None pending", icon: Clock, color: "text-green-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <Icon className={`w-5 h-5 ${color} mb-2`} />
                <p className="text-lg font-bold leading-tight">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

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
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="overview" className="text-xs py-2">Overview</TabsTrigger>
            <TabsTrigger value="leave" className="text-xs py-2 relative">
              Leave
              {pendingLeave > 0 && <span className="ml-1 w-4 h-4 bg-amber-500 text-white text-[9px] rounded-full inline-flex items-center justify-center">{pendingLeave}</span>}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="text-xs py-2">Payslips</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs py-2 relative">
              Tasks
              {pendingTasks > 0 && <span className="ml-1 w-4 h-4 bg-purple-500 text-white text-[9px] rounded-full inline-flex items-center justify-center">{pendingTasks}</span>}
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-xs py-2">Docs</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {/* Announcements */}
            {annLoading ? (
              <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : (announcements as any[]).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary" />
                    Announcements
                    {unreadAnn > 0 && <Badge variant="secondary" className="text-xs">{unreadAnn} new</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(announcements as any[]).slice(0, 3).map((a: any) => (
                    <div key={a.id} className={`p-3 rounded-lg border text-sm ${!a.isRead ? "border-primary/30 bg-primary/5" : "bg-card"}`}>
                      <p className="font-medium">{a.title}</p>
                      {a.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent Leave */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Recent Leave</span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setActiveTab("leave")}>
                    View All <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaveLoading ? (
                  <div className="h-12 bg-muted animate-pulse rounded-lg" />
                ) : leave.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No leave requests yet</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowLeaveDialog(true)}>
                      <Plus className="w-3 h-3 mr-1" /> Submit Request
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leave.slice(0, 3).map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted-foreground">{(l.leaveType ?? "").replace("_", " ")} Leave</span>
                        <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize text-xs">
                          {l.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Tasks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><CheckSquare className="w-4 h-4" /> My Tasks</span>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setActiveTab("tasks")}>
                    View All <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <div className="h-12 bg-muted animate-pulse rounded-lg" />
                ) : (tasks as any[]).filter((t: any) => t.status !== "completed").length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No pending tasks</p>
                ) : (
                  <div className="space-y-2">
                    {(tasks as any[]).filter((t: any) => t.status !== "completed").slice(0, 3).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        {STATUS_ICON[t.status as TaskStatus]}
                        <span className="flex-1 truncate">{t.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLOR[t.priority as Priority]}`}>{t.priority}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Leave Tab */}
          <TabsContent value="leave" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowLeaveDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Leave Request
              </Button>
            </div>
            {leaveLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
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
                <div key={l.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm capitalize">{(l.leaveType ?? "").replace("_", " ")} Leave</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()}
                    </p>
                    {l.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">{l.reason}</p>}
                    {l.notes && <p className="text-xs text-amber-600 mt-0.5">HR Note: {l.notes}</p>}
                  </div>
                  <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                    {l.status}
                  </Badge>
                </div>
              ))
            )}
          </TabsContent>

          {/* Payroll Tab */}
          <TabsContent value="payroll" className="mt-4 space-y-2">
            {payrollLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : (payroll as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No payslips yet</p>
                <p className="text-xs mt-1">Payslips will appear here once HR processes your salary</p>
              </div>
            ) : (
              (payroll as any[]).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{p.periodMonth}/{p.periodYear}</p>
                    <p className="text-xs text-muted-foreground">
                      Basic: {p.currency} {Number(p.basicSalary).toFixed(2)}
                      {Number(p.allowances) > 0 && ` + ${Number(p.allowances).toFixed(2)} allowances`}
                      {Number(p.deductions) > 0 && ` − ${Number(p.deductions).toFixed(2)} deductions`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{p.currency} {Number(p.netSalary).toFixed(2)}</p>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"} className="capitalize text-xs">{p.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="mt-4 space-y-2">
            {tasksLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : (tasks as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No tasks assigned to you</p>
              </div>
            ) : (
              (tasks as any[]).map((task: any) => {
                const overdue = task.status !== "completed" && task.status !== "cancelled" && task.dueDate && new Date(task.dueDate) < new Date();
                return (
                  <div key={task.id} className={`flex items-start gap-3 p-4 rounded-lg border bg-card ${overdue ? "border-red-200 bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                    <div className="mt-0.5">{STATUS_ICON[task.status as TaskStatus]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                      {task.dueDate && (
                        <p className={`text-xs mt-0.5 ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                          Due: {new Date(task.dueDate).toLocaleDateString()}{overdue ? " — OVERDUE" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority as Priority]}`}>
                        {task.priority}
                      </span>
                      {task.status !== "completed" && task.status !== "cancelled" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={completeTask.isPending}
                          onClick={() => completeTask.mutate({ taskId: task.id })}
                        >
                          Done
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="mt-4 space-y-2">
            {docsLoading ? (
              <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : (docs as any[]).length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No documents on file</p>
                <p className="text-sm mt-1">Contact HR to upload your documents.</p>
              </div>
            ) : (
              (docs as any[]).map((doc: any) => {
                const expired = doc.expiresAt && new Date(doc.expiresAt) < new Date();
                const expiringSoon = !expired && doc.expiresAt && new Date(doc.expiresAt) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                return (
                  <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div>
                      <p className="font-medium text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                      <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                      {doc.expiresAt && (
                        <p className={`text-xs mt-0.5 ${expired ? "text-red-600" : expiringSoon ? "text-amber-600" : "text-muted-foreground"}`}>
                          Expires: {new Date(doc.expiresAt).toLocaleDateString()}
                          {expired ? " — EXPIRED" : expiringSoon ? " — Expiring Soon" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {expired && <Badge variant="destructive" className="text-xs">Expired</Badge>}
                      {expiringSoon && !expired && <Badge className="text-xs bg-amber-500">Expiring</Badge>}
                      <Button size="sm" variant="outline" asChild>
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">View</a>
                      </Button>
                    </div>
                  </div>
                );
              })
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
                <SelectTrigger>
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
                <Label>Start Date</Label>
                <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} min={leaveStart || new Date().toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Briefly explain the reason for your leave..."
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
            <Button
              disabled={!leaveStart || !leaveEnd || submitLeave.isPending}
              onClick={() => submitLeave.mutate({ leaveType: leaveType as any, startDate: leaveStart, endDate: leaveEnd, reason: leaveReason || undefined })}
            >
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
                <div
                  key={n.id}
                  className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${!n.isRead ? "border-primary/30 bg-primary/5" : "bg-card"}`}
                  onClick={() => { if (!n.isRead) markNotifRead.mutate({ notificationId: n.id }); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</p>
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

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User, Calendar, CheckSquare, FileText, Megaphone, Clock,
  CheckCircle2, Circle, AlertTriangle, Bell, AlertCircle,
} from "lucide-react";

type Priority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type AnnType = "announcement" | "request" | "alert" | "reminder";

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  cancelled: <AlertCircle className="w-4 h-4 text-muted-foreground" />,
};

const ANN_TYPE_CONFIG: Record<AnnType, { label: string; icon: React.ReactNode; color: string }> = {
  announcement: { label: "Announcement", icon: <Megaphone className="w-3.5 h-3.5" />, color: "bg-blue-100 text-blue-700" },
  request: { label: "Request", icon: <Bell className="w-3.5 h-3.5" />, color: "bg-purple-100 text-purple-700" },
  alert: { label: "Alert", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "bg-red-100 text-red-700" },
  reminder: { label: "Reminder", icon: <Clock className="w-3.5 h-3.5" />, color: "bg-amber-100 text-amber-700" },
};

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  resident_card: "Resident Card",
  labour_card: "Labour Card",
  employment_contract: "Employment Contract",
  civil_id: "Civil ID",
  mol_work_permit_certificate: "Work Permit",
  medical_certificate: "Medical Certificate",
  photo: "Photo",
  other: "Other",
};

export default function EmployeePortalPage() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: profile, isLoading: profileLoading } = trpc.employeePortal.getMyProfile.useQuery();
  const { data: tasks = [], isLoading: tasksLoading } = trpc.employeePortal.getMyTasks.useQuery();
  const { data: leave = [], isLoading: leaveLoading } = trpc.employeePortal.getMyLeave.useQuery();
  const { data: payroll = [], isLoading: payrollLoading } = trpc.employeePortal.getMyPayroll.useQuery();
  const { data: docs = [], isLoading: docsLoading } = trpc.employeePortal.getMyDocuments.useQuery();
  const { data: announcements = [], isLoading: annLoading } = trpc.employeePortal.getMyAnnouncements.useQuery();

  const pendingTasks = (tasks as any[]).filter((t) => t.status === "pending" || t.status === "in_progress");
  const unreadAnn = (announcements as any[]).filter((a) => !a.isRead);

  if (profileLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="h-32 bg-muted animate-pulse rounded-xl mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20 text-muted-foreground">
        <User className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">No employee profile found</p>
        <p className="text-sm mt-1">Your account is not linked to an employee record. Please contact HR.</p>
      </div>
    );
  }

  const emp = profile as any;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
              {emp.firstName?.[0]}{emp.lastName?.[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold">{emp.firstName} {emp.lastName}</h1>
              {emp.firstNameAr && <p className="text-sm text-muted-foreground" dir="rtl">{emp.firstNameAr} {emp.lastNameAr}</p>}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {emp.position && <Badge variant="secondary">{emp.position}</Badge>}
                {emp.department && <Badge variant="outline">{emp.department}</Badge>}
                {emp.employmentType && <Badge variant="outline" className="capitalize">{emp.employmentType.replace("_", " ")}</Badge>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-primary/10">
            <div>
              <p className="text-xs text-muted-foreground">Employee No.</p>
              <p className="font-medium text-sm">{emp.employeeNumber || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hire Date</p>
              <p className="font-medium text-sm">{emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nationality</p>
              <p className="font-medium text-sm">{emp.nationality || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium text-sm truncate">{emp.workEmail || emp.email || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xl font-bold">{pendingTasks.length}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-xl font-bold">{unreadAnn.length}</p>
                <p className="text-xs text-muted-foreground">Unread Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xl font-bold">{(leave as any[]).filter((l) => l.status === "pending").length}</p>
                <p className="text-xs text-muted-foreground">Pending Leave</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xl font-bold">{(docs as any[]).length}</p>
                <p className="text-xs text-muted-foreground">My Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="messages">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="messages">
            Messages {unreadAnn.length > 0 && <Badge className="ml-1.5 h-4 text-xs px-1">{unreadAnn.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            Tasks {pendingTasks.length > 0 && <Badge className="ml-1.5 h-4 text-xs px-1">{pendingTasks.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="profile">My Profile</TabsTrigger>
        </TabsList>

        {/* Messages Tab */}
        <TabsContent value="messages" className="mt-4 space-y-3">
          {annLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : (announcements as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No messages yet</p>
            </div>
          ) : (
            (announcements as any[]).map((ann: any) => {
              const tc = ANN_TYPE_CONFIG[ann.type as AnnType] ?? ANN_TYPE_CONFIG.announcement;
              const isExp = expanded === ann.id;
              return (
                <Card key={ann.id} className={ann.isRead ? "" : "border-primary/40 bg-primary/5"}>
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-start gap-2">
                      {!ann.isRead && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${tc.color}`}>
                            {tc.icon}{tc.label}
                          </span>
                          <span className="text-xs text-muted-foreground">{new Date(ann.createdAt).toLocaleDateString()}</span>
                        </div>
                        <CardTitle className="text-sm mt-1">{ann.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <p className={`text-sm text-muted-foreground ${isExp ? "" : "line-clamp-2"}`}>{ann.body}</p>
                    {ann.body.length > 100 && (
                      <button className="text-xs text-primary mt-1 hover:underline" onClick={() => setExpanded(isExp ? null : ann.id)}>
                        {isExp ? "Show less" : "Read more"}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4 space-y-2">
          {tasksLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : (tasks as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No tasks assigned to you</p>
            </div>
          ) : (
            (tasks as any[]).map((task: any) => {
              const overdue = task.status !== "completed" && task.status !== "cancelled" && task.dueDate && new Date(task.dueDate) < new Date();
              return (
                <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${overdue ? "border-red-200 bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                  {STATUS_ICON[task.status as TaskStatus]}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                    {task.dueDate && (
                      <p className={`text-xs mt-0.5 ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                        Due: {new Date(task.dueDate).toLocaleDateString()}{overdue ? " — OVERDUE" : ""}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[task.priority as Priority]}`}>
                    {task.priority}
                  </span>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* Leave Tab */}
        <TabsContent value="leave" className="mt-4 space-y-2">
          {leaveLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : (leave as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No leave records found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(leave as any[]).map((l: any) => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm capitalize">{l.leaveType?.replace("_", " ")} Leave</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()}
                      {l.totalDays && ` (${l.totalDays} days)`}
                    </p>
                    {l.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">{l.reason}</p>}
                  </div>
                  <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"} className="capitalize">
                    {l.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Payroll Tab */}
        <TabsContent value="payroll" className="mt-4 space-y-2">
          {payrollLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : (payroll as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No payroll records yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(payroll as any[]).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{p.periodMonth}/{p.periodYear}</p>
                    <p className="text-xs text-muted-foreground">
                      Basic: {p.currency} {Number(p.basicSalary).toFixed(2)}
                      {Number(p.allowances) > 0 && ` + ${p.currency} ${Number(p.allowances).toFixed(2)} allowances`}
                      {Number(p.deductions) > 0 && ` − ${p.currency} ${Number(p.deductions).toFixed(2)} deductions`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">{p.currency} {Number(p.netSalary).toFixed(2)}</p>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"} className="capitalize text-xs">{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4 space-y-2">
          {docsLoading ? (
            <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : (docs as any[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No documents on file</p>
              <p className="text-sm">Contact HR to upload your documents.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(docs as any[]).map((doc: any) => {
                const expired = doc.expiresAt && new Date(doc.expiresAt) < new Date();
                const expiringSoon = !expired && doc.expiresAt && new Date(doc.expiresAt) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
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
              })}
            </div>
          )}
        </TabsContent>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Personal Information</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ["Full Name", `${emp.firstName} ${emp.lastName}`],
                  ["Arabic Name", emp.firstNameAr ? `${emp.firstNameAr} ${emp.lastNameAr}` : null],
                  ["Nationality", emp.nationality],
                  ["Date of Birth", emp.dateOfBirth ? new Date(emp.dateOfBirth).toLocaleDateString() : null],
                  ["Gender", emp.gender],
                  ["Marital Status", emp.maritalStatus],
                  ["Civil ID", emp.civilId],
                  ["Passport No.", emp.passportNumber],
                  ["Phone", emp.phone],
                  ["Email", emp.workEmail || emp.email],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-right max-w-[60%] truncate">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Employment Details</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ["Employee No.", emp.employeeNumber],
                  ["Department", emp.department],
                  ["Position", emp.position],
                  ["Employment Type", emp.employmentType?.replace("_", " ")],
                  ["Hire Date", emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : null],
                  ["PASI No.", emp.pasiNumber],
                  ["Work Permit No.", emp.workPermitNumber],
                  ["Work Permit Expiry", emp.workPermitExpiry ? new Date(emp.workPermitExpiry).toLocaleDateString() : null],
                  ["Visa No.", emp.visaNumber],
                  ["Visa Expiry", emp.visaExpiry ? new Date(emp.visaExpiry).toLocaleDateString() : null],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium text-right max-w-[60%] truncate">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            {(emp.emergencyContactName || emp.bankName) && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Emergency Contact & Bank</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    {[
                      ["Emergency Contact", emp.emergencyContactName],
                      ["Emergency Phone", emp.emergencyContactPhone],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k as string} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {[
                      ["Bank", emp.bankName],
                      ["Account No.", emp.bankAccountNumber],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <div key={k as string} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

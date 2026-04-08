import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Briefcase, Plus, Search, CheckCircle2, Clock, AlertTriangle,
  FileText, User, ChevronRight, RefreshCw, ListChecks, Calendar
} from "lucide-react";
import { DateInput } from "@/components/ui/date-input";

const CASE_TYPE_LABELS: Record<string, string> = {
  renewal: "Permit Renewal",
  amendment: "Amendment",
  cancellation: "Cancellation",
  contract_registration: "Contract Registration",
  employee_update: "Employee Update",
  document_update: "Document Update",
  new_permit: "New Permit",
  transfer: "Transfer",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-700", bg: "bg-gray-100" },
  submitted: { label: "Submitted", color: "text-blue-700", bg: "bg-blue-100" },
  under_review: { label: "Under Review", color: "text-purple-700", bg: "bg-purple-100" },
  approved: { label: "Approved", color: "text-emerald-700", bg: "bg-emerald-100" },
  rejected: { label: "Rejected", color: "text-red-700", bg: "bg-red-100" },
  completed: { label: "Completed", color: "text-teal-700", bg: "bg-teal-100" },
  cancelled: { label: "Cancelled", color: "text-gray-500", bg: "bg-gray-50" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-gray-500" },
  normal: { label: "Normal", color: "text-blue-600" },
  high: { label: "High", color: "text-amber-600" },
  urgent: { label: "Urgent", color: "text-red-600" },
};

export default function WorkforceCasesPage() {
  const [tab, setTab] = useState("active");
  const [query, setQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    caseType: "renewal" as string,
    priority: "normal" as string,
    notes: "",
    dueDate: "",
  });

  const activeStatus = tab === "completed" ? "completed" as const
    : tab === "draft" ? "draft" as const
    : undefined;

  const { data: casesData, isLoading, refetch } = trpc.workforce.cases.list.useQuery({
    caseStatus: activeStatus,
  });

  const { data: caseDetail } = trpc.workforce.cases.getById.useQuery(
    { caseId: selectedCase! },
    { enabled: selectedCase != null }
  );

  const createMutation = trpc.workforce.cases.create.useMutation({
    onSuccess: () => {
      toast.success("Case created successfully");
      setShowCreateDialog(false);
      setCreateForm({ caseType: "renewal", priority: "normal", notes: "", dueDate: "" });
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const submitMutation = trpc.workforce.cases.submit.useMutation({
    onSuccess: () => { toast.success("Case submitted to MOL"); refetch(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const updateTaskMutation = trpc.workforce.cases.updateTask.useMutation({
    onSuccess: () => refetch(),
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const allCases = casesData?.items ?? [];
  const cases = query
    ? allCases.filter(c =>
        CASE_TYPE_LABELS[c.caseType]?.toLowerCase().includes(query.toLowerCase()) ||
        (c.notes ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (c.employeeName ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : allCases;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-primary" />
            Government Service Cases
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track MOL service requests, renewals, amendments, and cancellations
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Case
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Cases", value: cases.length, icon: Briefcase, color: "text-primary" },
          { label: "In Progress", value: cases.filter(c => ["submitted", "under_review"].includes(c.caseStatus ?? "")).length, icon: Clock, color: "text-amber-600" },
          { label: "Completed", value: cases.filter(c => c.caseStatus === "completed").length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Urgent", value: cases.filter(c => c.priority === "urgent").length, icon: AlertTriangle, color: "text-red-600" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search cases..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-4 space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : cases.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No cases found</p>
                </div>
              ) : (
                cases.map((c) => {
                  const statusCfg = STATUS_CONFIG[c.caseStatus ?? "draft"] ?? STATUS_CONFIG.draft;
                  const priorityCfg = PRIORITY_CONFIG[c.priority ?? "normal"] ?? PRIORITY_CONFIG.normal;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCase(c.id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                        selectedCase === c.id ? "border-primary bg-primary/5" : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">#{c.id}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                              {statusCfg.label}
                            </span>
                            <span className={`text-xs font-medium ${priorityCfg.color}`}>
                              {priorityCfg.label}
                            </span>
                          </div>
                          <p className="font-medium text-sm truncate">
                            {CASE_TYPE_LABELS[c.caseType] ?? c.caseType}
                          </p>
                          {c.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{c.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {c.dueDate ? (() => {
                            const hoursLeft = Math.round((new Date(c.dueDate).getTime() - Date.now()) / 3600000);
                            const isBreached = hoursLeft < 0;
                            const cls = isBreached || hoursLeft < 24
                              ? "bg-red-100 text-red-700"
                              : hoursLeft < 72
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700";
                            return (
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${cls}`}>
                                <Clock className="w-3 h-3" />
                                {isBreached
                                  ? `SLA Breached`
                                  : hoursLeft < 24
                                  ? `${hoursLeft}h left`
                                  : `${Math.round(hoursLeft / 24)}d left`}
                              </span>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              No SLA
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Case Detail Panel */}
        <div className="space-y-4">
          {selectedCase && caseDetail ? (
            <>
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Case #{caseDetail.case.id}</CardTitle>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      (STATUS_CONFIG[caseDetail.case.caseStatus ?? "draft"] ?? STATUS_CONFIG.draft).bg
                    } ${(STATUS_CONFIG[caseDetail.case.caseStatus ?? "draft"] ?? STATUS_CONFIG.draft).color}`}>
                      {(STATUS_CONFIG[caseDetail.case.caseStatus ?? "draft"] ?? STATUS_CONFIG.draft).label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="font-medium">{CASE_TYPE_LABELS[caseDetail.case.caseType] ?? caseDetail.case.caseType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Priority</p>
                      <p className={`font-medium ${(PRIORITY_CONFIG[caseDetail.case.priority ?? "normal"] ?? PRIORITY_CONFIG.normal).color}`}>
                        {(PRIORITY_CONFIG[caseDetail.case.priority ?? "normal"] ?? PRIORITY_CONFIG.normal).label}
                      </p>
                    </div>
                  </div>
                  {caseDetail.case.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{caseDetail.case.notes}</p>
                    </div>
                  )}
                  {(caseDetail.case.caseStatus === "draft" || caseDetail.case.caseStatus === "awaiting_documents") && (
                    <Button
                      className="w-full gap-2"
                      size="sm"
                      onClick={() => submitMutation.mutate({ caseId: caseDetail.case.id })}
                      disabled={submitMutation.isPending}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {submitMutation.isPending ? "Processing..." : "Submit to MOL"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Tasks */}
              {caseDetail.tasks && caseDetail.tasks.length > 0 && (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ListChecks className="w-4 h-4" /> Tasks
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {caseDetail.tasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={task.taskStatus === "completed"}
                          onChange={() => updateTaskMutation.mutate({
                            taskId: task.id,
                            taskStatus: task.taskStatus === "completed" ? "pending" : "completed",
                          })}
                          className="mt-0.5 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.taskStatus === "completed" ? "line-through text-muted-foreground" : ""}`}>
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground">{task.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Employee info */}
              {caseDetail.employee && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <User className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{caseDetail.employee.firstName} {caseDetail.employee.lastName}</p>
                      <p className="text-xs text-muted-foreground">{caseDetail.employee.nationality ?? ""}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
              <Briefcase className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Select a case to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Case Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Case</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Case Type</Label>
              <Select value={createForm.caseType} onValueChange={v => setCreateForm(f => ({ ...f, caseType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={createForm.priority} onValueChange={v => setCreateForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <DateInput
                
                value={createForm.dueDate}
                onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={createForm.notes}
                onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                caseType: createForm.caseType as "renewal" | "amendment" | "cancellation" | "contract_registration" | "employee_update" | "document_update" | "new_permit" | "transfer",
                priority: createForm.priority as "low" | "normal" | "high" | "urgent",
                notes: createForm.notes || undefined,
                dueDate: createForm.dueDate || undefined,
              })}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

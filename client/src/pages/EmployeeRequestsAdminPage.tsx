/**
 * EmployeeRequestsAdminPage — HR Admin view of all employee requests
 *
 * Route: /hr/employee-requests
 * Access: company_admin, hr_admin
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, CheckCircle2, XCircle, Clock, Filter,
  User, Calendar, MessageSquare, RefreshCw, ChevronDown,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
};

const TYPE_LABELS: Record<string, string> = {
  leave: "Leave",
  document: "Document",
  overtime: "Overtime",
  expense: "Expense",
  equipment: "Equipment",
  training: "Training",
  other: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  leave: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  document: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  overtime: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  expense: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  equipment: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  training: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function emptyRequestsSubtitle(
  statusFilter: "all" | "pending" | "approved" | "rejected" | "cancelled",
  typeFilter: string
): string {
  if (statusFilter === "pending") {
    return "All caught up! No pending requests.";
  }
  const typeLabel = typeFilter !== "all" ? (TYPE_LABELS[typeFilter] ?? typeFilter) : null;
  if (statusFilter === "all") {
    if (!typeLabel) {
      return "No leave or other employee requests match your filters yet. Portal leave requests and generic requests both show here.";
    }
    return `No ${typeLabel.toLowerCase()} requests match your filters.`;
  }
  if (typeLabel) {
    return `No ${statusFilter} ${typeLabel.toLowerCase()} requests.`;
  }
  return `No ${statusFilter} requests.`;
}

export default function EmployeeRequestsAdminPage() {
  const { activeCompany } = useActiveCompany();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "cancelled">("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [actionStatus, setActionStatus] = useState<"approved" | "rejected" | null>(null);

  const { data: requests = [], refetch, isLoading } = trpc.employeeRequests.adminList.useQuery(
    { companyId: activeCompany?.id, status: statusFilter, type: typeFilter as any },
    { enabled: !!activeCompany }
  );

  const updateMutation = trpc.employeeRequests.updateStatus.useMutation({
    onSuccess: () => {
      toast.success(`Request ${actionStatus === "approved" ? "approved" : "rejected"}`);
      setReviewRequest(null);
      setAdminNote("");
      setActionStatus(null);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLeaveMutation = trpc.hr.updateLeave.useMutation({
    onSuccess: () => {
      toast.success(`Leave request ${actionStatus === "approved" ? "approved" : "rejected"}`);
      setReviewRequest(null);
      setAdminNote("");
      setActionStatus(null);
      refetch();
      utils.hr.listLeave.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openReview(req: any, status: "approved" | "rejected") {
    setReviewRequest(req);
    setActionStatus(status);
    setAdminNote("");
  }

  function handleAction() {
    if (!reviewRequest || !actionStatus) return;
    if (reviewRequest.source === "leave_request") {
      updateLeaveMutation.mutate({
        id: reviewRequest.leaveId,
        status: actionStatus,
        notes: adminNote || undefined,
      });
      return;
    }
    updateMutation.mutate({
      requestId: reviewRequest.request.id,
      status: actionStatus,
      adminNote: adminNote || undefined,
    });
  }

  const pendingCount = requests.filter((r: any) => r.request.status === "pending").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employee Requests</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and action leave, document, and other employee requests
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["pending", "approved", "rejected", "cancelled"] as const).map((s) => {
          const count = requests.filter((r: any) => r.request.status === s).length;
          return (
            <button
              key={s}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-sm ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              <p className="text-xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter:</span>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-32 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4 h-20" />
            </Card>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-medium">No requests found</p>
            <p className="text-sm text-muted-foreground">{emptyRequestsSubtitle(statusFilter, typeFilter)}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((item: any) => {
            const req = item.request;
            const emp = item.employee;
            const rowKey =
              item.source === "leave_request" ? `leave-${item.leaveId}` : `er-${req.id}`;
            return (
              <Card key={rowKey} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 px-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                        <Badge className={`text-xs px-2 py-0 ${TYPE_COLORS[req.type] ?? ""}`}>
                          {TYPE_LABELS[req.type] ?? req.type}
                        </Badge>
                        <Badge className={`text-xs px-2 py-0 border ${STATUS_COLORS[req.status] ?? ""}`}>
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium mt-0.5">{req.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {emp.position ?? ""}{emp.department ? ` · ${emp.department}` : ""} · {fmtDate(req.createdAt)}
                      </p>
                      {req.adminNote && (
                        <p className="text-xs text-muted-foreground mt-1 italic">Note: {req.adminNote}</p>
                      )}
                    </div>
                    {req.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 border-green-500/50 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                          onClick={() => openReview(item, "approved")}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 border-red-500/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => openReview(item, "rejected")}
                        >
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!reviewRequest} onOpenChange={(o) => { if (!o) { setReviewRequest(null); setAdminNote(""); setActionStatus(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionStatus === "approved" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              {actionStatus === "approved" ? "Approve" : "Reject"} Request
            </DialogTitle>
          </DialogHeader>
          {reviewRequest && (
            <div className="space-y-4 py-2">
              <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Employee:</span> <span className="font-medium">{reviewRequest.employee.firstName} {reviewRequest.employee.lastName}</span></p>
                <p><span className="text-muted-foreground">Request:</span> <span className="font-medium">{reviewRequest.request.subject}</span></p>
                <p><span className="text-muted-foreground">Type:</span> {TYPE_LABELS[reviewRequest.request.type]}</p>
                {reviewRequest.source === "leave_request" &&
                  typeof reviewRequest.request.details === "object" &&
                  reviewRequest.request.details != null &&
                  "reason" in reviewRequest.request.details &&
                  String((reviewRequest.request.details as { reason?: string }).reason || "").trim() && (
                    <p>
                      <span className="text-muted-foreground">Employee reason:</span>{" "}
                      {String((reviewRequest.request.details as { reason: string }).reason)}
                    </p>
                  )}
              </div>
              <div className="space-y-1">
                <Label>Note to Employee (optional)</Label>
                <Textarea
                  placeholder={actionStatus === "approved" ? "e.g. Approved. Please coordinate with your manager." : "e.g. Insufficient leave balance. Please reapply next month."}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewRequest(null); setAdminNote(""); setActionStatus(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={updateMutation.isPending || updateLeaveMutation.isPending}
              className={actionStatus === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {actionStatus === "approved" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

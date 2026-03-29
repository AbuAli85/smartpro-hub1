import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, CheckCircle, XCircle, Clock, AlertCircle, User, RefreshCw,
  FileText, ChevronRight, Activity, Zap
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  triggered: "bg-blue-100 text-blue-800",
  case_created: "bg-indigo-100 text-indigo-800",
  skipped: "bg-gray-100 text-gray-800",
  failed: "bg-red-100 text-red-800",
};

const ENTITY_LABELS: Record<string, string> = {
  work_permit: "Work Permit",
  visa: "Visa",
  resident_card: "Resident Card",
  labour_card: "Labour Card",
  pro_service: "PRO Service",
  sanad_licence: "Sanad Licence",
  employee_document: "Employee Document",
};

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const runId = Number(params.id);

  const [notes, setNotes] = useState("");

  // Get the specific run from the list (no dedicated getRunDetail procedure)
  const { data: runsData, refetch } = trpc.renewalWorkflows.listRuns.useQuery(
    { pageSize: 100 },
    { enabled: !!runId && !isNaN(runId) }
  );
  const run = runsData?.items?.find(r => r.id === runId);

  if (!run && runsData) {
    return (
      <div className="p-6 text-center">
        <AlertCircle size={48} className="mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Workflow Not Found</h2>
        <p className="text-muted-foreground mb-4">The workflow run #{runId} could not be found.</p>
        <Button onClick={() => navigate("/renewal-workflows")} className="gap-2">
          <ArrowLeft size={14} /> Back to Workflows
        </Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <RefreshCw size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const entityLabel = ENTITY_LABELS[run.entityType] ?? run.entityType;

  // Build timeline from available fields
  const timeline = [
    {
      label: "Workflow Created",
      time: run.createdAt,
      icon: Zap,
      color: "text-blue-600",
      description: `Renewal workflow created for ${entityLabel} #${run.entityId}`,
    },
    run.triggeredAt && {
      label: "Workflow Triggered",
      time: run.triggeredAt,
      icon: Activity,
      color: "text-purple-600",
      description: `Triggered ${run.daysBeforeExpiry} days before expiry (${run.expiryDate ? new Date(run.expiryDate).toLocaleDateString() : "—"})`,
    },
    run.caseId && {
      label: "Government Case Created",
      time: run.triggeredAt,
      icon: FileText,
      color: "text-indigo-600",
      description: `Case #${run.caseId} created and assigned`,
    },
    run.assignedOfficerId && {
      label: "Officer Assigned",
      time: run.triggeredAt,
      icon: User,
      color: "text-green-600",
      description: `PRO Officer #${run.assignedOfficerId} assigned to handle renewal`,
    },
    run.status === "failed" && {
      label: "Workflow Failed",
      time: run.updatedAt,
      icon: XCircle,
      color: "text-red-600",
      description: run.notes ?? "Workflow encountered an error",
    },
    run.status === "skipped" && {
      label: "Workflow Skipped",
      time: run.updatedAt,
      icon: Clock,
      color: "text-gray-600",
      description: run.notes ?? "Workflow was skipped (already handled or duplicate)",
    },
  ].filter(Boolean) as any[];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/renewal-workflows")} className="gap-2">
          <ArrowLeft size={16} /> Back to Workflows
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-foreground">Workflow Run #{run.id}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[run.status] ?? ""}`}>
              {run.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-muted-foreground">
            {entityLabel} Renewal — {run.entityLabel ?? `Entity #${run.entityId}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Entity Type</p>
            <p className="font-semibold text-sm">{entityLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Days Before Expiry</p>
            <p className="font-semibold text-sm">{run.daysBeforeExpiry} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Expiry Date</p>
            <p className="font-semibold text-sm">
              {run.expiryDate ? new Date(run.expiryDate).toLocaleDateString() : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="font-semibold text-sm">
              {run.createdAt ? new Date(run.createdAt).toLocaleDateString() : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Workflow Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              {timeline.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No timeline events yet</p>
              )}
              {timeline.map((event, idx) => {
                const Icon = event.icon;
                return (
                  <div key={idx} className="flex gap-4 pb-4">
                    <div className="flex flex-col items-center">
                      <div className={`p-1.5 rounded-full bg-muted`}>
                        <Icon size={14} className={event.color} />
                      </div>
                      {idx < timeline.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-medium text-sm">{event.label}</p>
                        {event.time && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.time).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{event.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Notes */}
          {run.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{run.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Rule Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap size={14} /> Workflow Rule</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm font-medium">Rule #{run.ruleId}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Triggers {run.daysBeforeExpiry} days before {entityLabel} expiry
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-2"
                onClick={() => navigate("/renewal-workflows")}
              >
                View Rules <ChevronRight size={12} />
              </Button>
            </CardContent>
          </Card>

          {/* Linked Case */}
          {run.caseId && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText size={14} /> Linked Case</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Case #{run.caseId}</p>
                <p className="text-xs text-muted-foreground mt-1">Government service case created for this renewal</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full gap-2"
                  onClick={() => navigate("/workforce/cases")}
                >
                  View Case <ChevronRight size={12} />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Officer */}
          {run.assignedOfficerId && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><User size={14} /> Assigned Officer</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-medium">Officer #{run.assignedOfficerId}</p>
                <p className="text-xs text-muted-foreground mt-1">PRO Officer assigned to handle this renewal</p>
              </CardContent>
            </Card>
          )}

          {/* Document Checklist */}
          <Card>
            <CardHeader><CardTitle className="text-base">Renewal Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Alert Detected", done: true },
                { label: "Workflow Triggered", done: !!run.triggeredAt },
                { label: "Case Created", done: !!run.caseId },
                { label: "Officer Assigned", done: !!run.assignedOfficerId },
                { label: "Renewal Completed", done: run.status === "case_created" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.done
                    ? <CheckCircle size={14} className="text-green-600 shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground shrink-0" />
                  }
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

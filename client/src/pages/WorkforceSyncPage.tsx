import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Activity, CheckCircle2, AlertTriangle, Clock,
  Wifi, WifiOff, Play, ChevronDown, ChevronRight
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

const JOB_TYPE_LABELS: Record<string, string> = {
  full_sync: "Full Sync",
  delta_sync: "Delta Sync",
  single_permit: "Single Permit Check",
  employee_sync: "Employee Data Sync",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", color: "text-gray-600", bg: "bg-gray-100", icon: Clock },
  running: { label: "Running", color: "text-blue-700", bg: "bg-blue-100", icon: RefreshCw },
  success: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  failed: { label: "Failed", color: "text-red-700", bg: "bg-red-100", icon: AlertTriangle },
  partial_success: { label: "Partial", color: "text-amber-700", bg: "bg-amber-100", icon: AlertTriangle },
};

type SyncJob = {
  id: number;
  companyId: number;
  provider: string;
  jobType: "full_sync" | "delta_sync" | "single_permit" | "employee_sync";
  syncStatus: "pending" | "running" | "failed" | "success" | "partial_success";
  recordsFetched?: number | null;
  recordsChanged?: number | null;
  errorLog?: unknown;
  finishedAt?: Date | null;
  createdAt: Date;
};

export default function WorkforceSyncPage() {
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const { data: syncData, isLoading, refetch } = trpc.workforce.sync.list.useQuery({});

  const triggerMutation = trpc.workforce.sync.trigger.useMutation({
    onSuccess: () => { toast.success("Sync job triggered"); refetch(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const jobs: SyncJob[] = syncData?.items ?? [];
  const runningJobs = jobs.filter(j => j.syncStatus === "running" || j.syncStatus === "pending");
  const failedJobs = jobs.filter(j => j.syncStatus === "failed");
  const completedJobs = jobs.filter(j => j.syncStatus === "success");
  const lastSync = jobs.find(j => j.syncStatus === "success");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Government Portal Sync
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and manage synchronisation with Oman MOL and government portals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button
            onClick={() => triggerMutation.mutate({ jobType: "delta_sync", mode: "delta" })}
            disabled={triggerMutation.isPending}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            {triggerMutation.isPending ? "Triggering..." : "Trigger Sync"}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Jobs", value: runningJobs.length, icon: RefreshCw, color: "text-blue-600", animate: runningJobs.length > 0 },
          { label: "Completed", value: completedJobs.length, icon: CheckCircle2, color: "text-emerald-600", animate: false },
          { label: "Failed", value: failedJobs.length, icon: AlertTriangle, color: "text-red-600", animate: false },
          { label: "Last Sync", value: lastSync ? fmtTime(lastSync.createdAt) : "Never", icon: Clock, color: "text-muted-foreground", animate: false },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <stat.icon className={`w-5 h-5 ${stat.animate ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Portal Connection Status */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Portal Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: "Oman MOL Portal", status: "connected", lastCheck: "2 min ago" },
              { name: "PASI (Social Insurance)", status: "connected", lastCheck: "5 min ago" },
              { name: "ROP (Royal Oman Police)", status: "degraded", lastCheck: "15 min ago" },
            ].map((portal) => (
              <div key={portal.name} className={`flex items-center gap-3 p-3 rounded-lg border ${
                portal.status === "connected" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}>
                {portal.status === "connected" ? (
                  <Wifi className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">{portal.name}</p>
                  <p className="text-xs text-muted-foreground">Last check: {portal.lastCheck}</p>
                </div>
                <Badge variant="outline" className={`ml-auto text-xs ${
                  portal.status === "connected" ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700"
                }`}>
                  {portal.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sync Job History */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sync Job History</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No sync jobs yet. Trigger a sync to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => {
                const cfg = STATUS_CONFIG[job.syncStatus] ?? STATUS_CONFIG.pending;
                const Icon = cfg.icon;
                const isExpanded = expandedJob === job.id;

                return (
                  <div key={job.id} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    >
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <Icon className={`w-3 h-3 ${job.syncStatus === "running" || job.syncStatus === "pending" ? "animate-spin" : ""}`} />
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium flex-1">
                        {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                        <span className="text-xs text-muted-foreground ml-2">via {job.provider}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(job.createdAt)}
                      </span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-3 space-y-2 text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Records Fetched</p>
                            <p className="font-medium">{job.recordsFetched ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Records Changed</p>
                            <p className="font-medium">{job.recordsChanged ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Status</p>
                            <p className={`font-medium ${job.syncStatus === "failed" ? "text-red-600" : ""}`}>
                              {cfg.label}
                            </p>
                          </div>
                        </div>
                        {job.errorLog != null && (() => {
                          const logStr = typeof job.errorLog === "string" ? job.errorLog : JSON.stringify(job.errorLog, null, 2);
                          return (
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Error Log</p>
                              <pre className="text-xs bg-red-50 text-red-800 p-2 rounded overflow-x-auto">{logStr}</pre>
                            </div>
                          );
                        })()}
                        {job.finishedAt && (
                          <p className="text-xs text-muted-foreground">
                            Completed: {fmtDateTime(job.finishedAt)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Sync Actions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Sync Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["full_sync", "delta_sync", "single_permit", "employee_sync"] as const).map((jobType) => (
              <Button
                key={jobType}
                variant="outline"
                className="h-auto py-3 flex-col gap-1 text-xs"
                onClick={() => triggerMutation.mutate({ jobType, mode: jobType === "full_sync" ? "full" : "delta" })}
                disabled={triggerMutation.isPending}
              >
                <Play className="w-4 h-4" />
                {JOB_TYPE_LABELS[jobType]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

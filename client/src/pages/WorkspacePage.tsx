import React, { useState } from "react";
import { Link } from "wouter";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, ChevronRight, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function statusTone(s: string): string {
  const map: Record<string, string> = {
    on_track: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    watch: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    at_risk: "bg-orange-600/20 text-orange-900 dark:text-orange-200",
    critical: "bg-red-600/20 text-red-950 dark:text-red-200",
  };
  return map[s] ?? "bg-muted";
}

const KIND_LABEL: Record<string, string> = {
  request_update: "Request update",
  corrective_task: "Corrective task",
  follow_up: "Follow-up set",
  under_review: "Under review",
  escalate: "Escalated",
};

const PERFORMANCE_STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  watch: "Watch",
  at_risk: "At risk",
  critical: "Critical",
};

const TREND_LABEL: Record<string, string> = {
  improving: "Improving",
  stable: "Stable",
  declining: "Declining",
};

function urgencyLabel(u: string): string | null {
  if (u === "blocked") return "Blocked";
  if (u === "overdue") return "Overdue";
  if (u === "due_soon") return "Due soon";
  return null;
}

function interventionFollowUpLine(followUpAt: string | null): string | null {
  if (!followUpAt) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (followUpAt < today) return `Overdue · was ${followUpAt}`;
  if (followUpAt === today) return "Due today";
  return `Due ${followUpAt}`;
}

function workspaceLoadHelpText(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof TRPCClientError ? (error.data as { code?: string } | undefined)?.code : undefined;
  const looksMissingProcedure =
    code === "NOT_FOUND" ||
    /no procedure found on path\s+"workspace\./i.test(msg);
  if (!looksMissingProcedure) return null;
  return (
    "The API you are talking to does not expose this route (or /api/trpc is not the SmartPRO server). " +
    "Run the full stack from the repo root with pnpm dev (Express serves both the app and /api/trpc). " +
    "If you use a static or design preview, redeploy or open the environment that runs the Node server with the same build as this client."
  );
}

export default function WorkspacePage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.workspace.getWorkspace.useQuery(
    { companyId: activeCompanyId ?? undefined, includeTeam: true },
    { enabled: activeCompanyId != null }
  );

  const [actOpen, setActOpen] = useState(false);
  const [actTarget, setActTarget] = useState<{ employeeId: number; name: string } | null>(null);
  const [actKind, setActKind] = useState<string>("follow_up");
  const [actNote, setActNote] = useState("");
  const [actFollowUp, setActFollowUp] = useState("");
  const [actTaskTitle, setActTaskTitle] = useState("");
  const [actTaskDue, setActTaskDue] = useState("");
  const [closeInterventionTarget, setCloseInterventionTarget] = useState<{ id: number; name: string } | null>(null);

  const createIv = trpc.workspace.createIntervention.useMutation({
    onSuccess: async () => {
      toast.success("Follow-up sent");
      setActOpen(false);
      setActNote("");
      setActFollowUp("");
      setActTaskTitle("");
      setActTaskDue("");
      await utils.workspace.getWorkspace.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeIv = trpc.workspace.closeIntervention.useMutation({
    onSuccess: async () => {
      toast.success("Follow-up cleared");
      setCloseInterventionTarget(null);
      await utils.workspace.getWorkspace.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openAct(row: { employeeId: number; name: string }) {
    setActTarget(row);
    setActKind("follow_up");
    setActOpen(true);
  }

  function submitAct() {
    if (!actTarget || activeCompanyId == null) return;
    createIv.mutate({
      companyId: activeCompanyId,
      employeeId: actTarget.employeeId,
      kind: actKind as "request_update" | "corrective_task" | "follow_up" | "under_review" | "escalate",
      note: actNote.trim() || undefined,
      followUpAt: actFollowUp.trim() || undefined,
      taskTitle: actKind === "corrective_task" ? actTaskTitle.trim() || undefined : undefined,
      taskDueDate: actKind === "corrective_task" && actTaskDue.trim() ? actTaskDue.trim() : undefined,
    });
  }

  if (activeCompanyId == null) {
    return (
      <div className="container max-w-3xl py-10">
        <p className="text-muted-foreground text-sm">Select a company to open Workspace.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-3xl py-10 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    const hint = workspaceLoadHelpText(error);
    return (
      <div className="container max-w-3xl py-10">
        <Alert variant="destructive">
          <AlertTitle>Could not load workspace</AlertTitle>
          <AlertDescription className="space-y-2">
            <span className="block">{error.message}</span>
            {hint ? <span className="block text-sm opacity-90">{hint}</span> : null}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const my = data?.my;
  const team = data?.team;

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <LayoutGrid className="h-7 w-7" />
          Workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          What matters now, your next moves, and manager follow-ups — in one view.
        </p>
      </header>

      {my?.mode === "no_employee" && (
        <Alert variant={my.isAdminUnlinked ? "default" : "destructive"}>
          <AlertTitle>
            {my.isAdminUnlinked ? "No personal employee profile" : "Employee profile"}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{my.message}</p>
            {my.isAdminUnlinked ? (
              <p className="text-sm">
                <Link href="/hr/employees" className="underline font-medium text-foreground">
                  Open People (employees)
                </Link>{" "}
                to add or link your record.
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      {my?.mode === "ok" && (
        <div className="space-y-5">
          <section aria-labelledby="ws-score" className="space-y-2">
            <h2 id="ws-score" className="text-sm font-medium text-muted-foreground">
              Performance
            </h2>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Your status, trend, and what to do next.</p>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Badge className={statusTone(my.signal.status)}>{my.signal.statusLabel}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {TREND_LABEL[my.signal.trend] ?? my.signal.trend} · {my.signal.compositeScore}/100
                  </span>
                </div>
                {(my.signal.reviewState === "recovery_active" ||
                  my.signal.reviewState === "under_review" ||
                  my.signal.reviewState === "escalated") && (
                  <p className="text-xs text-foreground/90 pt-1.5 leading-snug">
                    {my.signal.reviewState === "recovery_active" && "Recovery in progress — stay aligned with your manager."}
                    {my.signal.reviewState === "under_review" && "Your review is with your manager."}
                    {my.signal.reviewState === "escalated" && "Please reach your manager today."}
                  </p>
                )}
                {my.signal.interventionFollowUpAt && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Manager follow-up:{" "}
                    <span className="font-medium text-foreground">{my.signal.interventionFollowUpAt}</span>
                  </p>
                )}
                <CardDescription className="text-xs pt-1">From tasks, goals, and attendance this period.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {my.signal.keyReasons.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Why</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {my.signal.keyReasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {my.signal.topPriorities.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Next</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {my.signal.topPriorities.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-work">
            <h2 id="ws-work" className="text-sm font-medium text-muted-foreground mb-2">
              Tasks
            </h2>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-2">Open work assigned to you — most urgent first.</p>
            <Card>
              <CardContent className="pt-6">
                {my.work.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing open — you&apos;re clear on tasks.</p>
                ) : (
                  <ul className="space-y-2">
                    {my.work.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium leading-snug">{t.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0 text-right max-w-[46%]">
                          {urgencyLabel(t.urgency) && (
                            <Badge variant="outline" className="mr-1 text-[10px] px-1 py-0">
                              {urgencyLabel(t.urgency)}
                            </Badge>
                          )}
                          {t.priority} · {t.status === "in_progress" ? "Processing" : t.status.replace(/_/g, " ")}
                          {t.dueDate ? ` · ${t.dueDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="link" className="px-0 mt-2 h-auto text-xs" asChild>
                  <Link href="/hr/tasks">
                    Open full task list <ChevronRight className="h-3 w-3 inline" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-issues">
            <h2 id="ws-issues" className="text-sm font-medium text-muted-foreground mb-2">
              Blockers
            </h2>
            <Card>
              <CardContent className="pt-6 text-sm">
                {my.issues.length === 0 ? (
                  <p className="text-muted-foreground">No blockers showing right now.</p>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {my.issues.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-review">
            <h2 id="ws-review" className="text-sm font-medium text-muted-foreground mb-2">
              Manager follow-up
            </h2>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Updates from your manager on this workspace.</p>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <p className="leading-relaxed">{my.review.summary}</p>
                {my.review.interventions.length > 0 && (
                  <ul className="space-y-2 border-t border-border/60 pt-3">
                    {my.review.interventions.map((iv) => {
                      const followLine = interventionFollowUpLine(iv.followUpAt);
                      return (
                        <li key={iv.id} className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 space-y-1">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {KIND_LABEL[iv.kind] ?? iv.kind}
                            {iv.status === "escalated" ? " · Escalated" : ""}
                          </p>
                          {followLine && <p className="text-[11px] text-muted-foreground">{followLine}</p>}
                          {iv.note && <p className="text-xs text-muted-foreground">{iv.note}</p>}
                          <p className="text-[10px] text-muted-foreground">{iv.managerLabel}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Button variant="link" className="px-0 h-auto text-xs" asChild>
                  <Link href="/hr/performance">
                    Goals &amp; reviews <ChevronRight className="h-3 w-3 inline" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-focus">
            <h2 id="ws-focus" className="text-sm font-medium text-muted-foreground mb-2">
              Role &amp; context
            </h2>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-1">Where you sit in the org — reference only.</p>
            <Card>
              <CardContent className="pt-6 text-sm">
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {my.focusLines.length === 0 ? (
                    <li>HR can add your role and responsibilities here.</li>
                  ) : (
                    my.focusLines.map((line) => <li key={line} className="text-foreground">{line}</li>)
                  )}
                </ul>
              </CardContent>
            </Card>
          </section>
        </div>
      )}

      {team && (
        <section aria-labelledby="ws-team" className="space-y-3 border-t pt-8">
          <h2 id="ws-team" className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team
          </h2>
          <p className="text-sm text-muted-foreground leading-snug">{team.progressSummary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-semibold tabular-nums">{team.teamHealth.onTrack}</div>
                <div className="text-xs text-muted-foreground">On track</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {team.teamHealth.watch}
                </div>
                <div className="text-xs text-muted-foreground">Watch</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-semibold tabular-nums text-orange-700 dark:text-orange-400">
                  {team.teamHealth.atRisk}
                </div>
                <div className="text-xs text-muted-foreground">At risk</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-semibold tabular-nums text-red-700 dark:text-red-400">
                  {team.teamHealth.critical}
                </div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Who needs attention</CardTitle>
              <CardDescription>
                Priority order. Click a name for their profile — tasks, owner, and HR context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {team.attention.length === 0 ? (
                <p className="text-muted-foreground text-sm">Everyone looks on track in this snapshot.</p>
              ) : (
                <ul className="space-y-3">
                  {team.attention.map((r) => (
                    <li key={r.employeeId} className="rounded-lg border border-border/60 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <Link
                            href={`/business/employee/${r.employeeId}`}
                            className="font-medium text-primary hover:underline block truncate"
                          >
                            {r.name}
                          </Link>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {PERFORMANCE_STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}
                            {r.openFollowUpCount > 0 && (
                              <>
                                {" "}
                                ·{" "}
                                {r.followUpOverdue
                                  ? "Follow-up overdue"
                                  : r.nextFollowUpAt
                                    ? `Next ${r.nextFollowUpAt}`
                                    : `${r.openFollowUpCount} open`}
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {r.myInterventionId != null && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] px-2"
                              disabled={closeIv.isPending}
                              onClick={() =>
                                setCloseInterventionTarget({ id: r.myInterventionId!, name: r.name })
                              }
                            >
                              Clear
                            </Button>
                          )}
                          <Button type="button" size="sm" className="h-7 text-xs" onClick={() => openAct(r)}>
                            Follow up
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-snug">{r.primaryWhy}</p>
                      <p className="text-xs text-muted-foreground leading-snug border-l-2 border-border pl-2">
                        {r.suggestedAction}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {team.decisions.pendingEmployeeRequests + team.decisions.pendingLeaveRequests > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Approvals
                </CardTitle>
                <CardDescription>Pending in HR queues.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <span className="text-2xl font-semibold tabular-nums">
                    {team.decisions.pendingEmployeeRequests}
                  </span>
                  <span className="text-muted-foreground ml-2">requests</span>
                </div>
                <div>
                  <span className="text-2xl font-semibold tabular-nums">
                    {team.decisions.pendingLeaveRequests}
                  </span>
                  <span className="text-muted-foreground ml-2">leave</span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">No pending employee or leave approvals in queue.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/hr/employee-requests">Open requests</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/hr/leave">Leave approvals</Link>
            </Button>
          </div>
        </section>
      )}

      <AlertDialog
        open={closeInterventionTarget != null}
        onOpenChange={(open) => {
          if (!open) setCloseInterventionTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              This closes your open follow-up
              {closeInterventionTarget ? ` for ${closeInterventionTarget.name}` : ""}. They can still receive a new follow-up
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={closeIv.isPending}
              onClick={() => {
                if (closeInterventionTarget == null || activeCompanyId == null) return;
                closeIv.mutate({
                  id: closeInterventionTarget.id,
                  companyId: activeCompanyId,
                });
              }}
            >
              {closeIv.isPending ? "Clearing…" : "Clear follow-up"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={actOpen} onOpenChange={setActOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Follow-up{actTarget ? ` — ${actTarget.name}` : ""}</DialogTitle>
            <DialogDescription>They get a short notification. Optional note and date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Action</Label>
              <Select value={actKind} onValueChange={setActKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="request_update">Request update</SelectItem>
                  <SelectItem value="follow_up">Set follow-up date</SelectItem>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="corrective_task">Assign corrective task</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fu">Remind me on (optional)</Label>
              <Input
                id="fu"
                type="date"
                value={actFollowUp}
                onChange={(e) => setActFollowUp(e.target.value)}
              />
            </div>
            {actKind === "corrective_task" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="tt">Task title</Label>
                  <Input id="tt" value={actTaskTitle} onChange={(e) => setActTaskTitle(e.target.value)} placeholder="What they should deliver" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="td">Due date</Label>
                  <Input id="td" type="date" value={actTaskDue} onChange={(e) => setActTaskDue(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" rows={3} value={actNote} onChange={(e) => setActNote(e.target.value)} placeholder="One line is enough." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => setActOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitAct} disabled={createIv.isPending}>
              {createIv.isPending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        More:{" "}
        <Link href="/hr/performance" className="underline underline-offset-2">
          Goals
        </Link>
        {" · "}
        <Link href="/hr/accountability" className="underline underline-offset-2">
          Accountability
        </Link>
      </p>
    </div>
  );
}

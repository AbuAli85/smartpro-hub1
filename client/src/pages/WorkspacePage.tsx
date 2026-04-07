import React, { useState } from "react";
import { Link } from "wouter";
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
  request_update: "Update requested",
  corrective_task: "Corrective task",
  follow_up: "Follow-up",
  under_review: "Under review",
  escalate: "Escalated",
};

function urgencyLabel(u: string): string | null {
  if (u === "blocked") return "Blocked";
  if (u === "overdue") return "Overdue";
  if (u === "due_soon") return "Due soon";
  return null;
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

  const createIv = trpc.workspace.createIntervention.useMutation({
    onSuccess: async () => {
      toast.success("Follow-up logged");
      setActOpen(false);
      setActNote("");
      setActFollowUp("");
      setActTaskTitle("");
      setActTaskDue("");
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
    return (
      <div className="container max-w-3xl py-10">
        <Alert variant="destructive">
          <AlertTitle>Could not load workspace</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
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
          What matters today — status, work, and team health in one calm view.
        </p>
      </header>

      {my?.mode === "no_employee" && (
        <Alert>
          <AlertTitle>Employee profile</AlertTitle>
          <AlertDescription>{my.message}</AlertDescription>
        </Alert>
      )}

      {my?.mode === "ok" && (
        <div className="space-y-6">
          <section aria-labelledby="ws-focus">
            <h2 id="ws-focus" className="text-sm font-medium text-muted-foreground mb-2">
              My focus
            </h2>
            <Card>
              <CardContent className="pt-6 text-sm">
                <ul className="list-disc pl-5 space-y-1">
                  {my.focusLines.length === 0 ? (
                    <li className="text-muted-foreground">Your role and priorities will show here when HR sets them.</li>
                  ) : (
                    my.focusLines.map((line) => <li key={line}>{line}</li>)
                  )}
                </ul>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-score" className="space-y-2">
            <h2 id="ws-score" className="text-sm font-medium text-muted-foreground">
              My score
            </h2>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusTone(my.signal.status)}>{my.signal.statusLabel}</Badge>
                  <Badge variant="outline">Trend: {my.signal.trend}</Badge>
                  <Badge variant="secondary">{my.signal.compositeScore}/100</Badge>
                  {my.signal.reviewState !== "none" && (
                    <Badge variant="outline">Review: {my.signal.reviewState.replace(/_/g, " ")}</Badge>
                  )}
                </div>
                {my.signal.interventionFollowUpAt && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Next check-in: <span className="font-medium text-foreground">{my.signal.interventionFollowUpAt}</span>
                  </p>
                )}
                <CardDescription className="text-xs pt-1">Combined from tasks, KPI, attendance, and follow-ups.</CardDescription>
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
                    <p className="text-xs font-medium text-muted-foreground mb-1">Next steps</p>
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
              My work
            </h2>
            <Card>
              <CardContent className="pt-6">
                {my.work.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open tasks — you&apos;re clear for now.</p>
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
                          {t.priority} · {t.status}
                          {t.dueDate ? ` · ${t.dueDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="link" className="px-0 mt-2 h-auto text-xs" asChild>
                  <Link href="/hr/tasks">
                    All tasks <ChevronRight className="h-3 w-3 inline" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="ws-issues">
            <h2 id="ws-issues" className="text-sm font-medium text-muted-foreground mb-2">
              My issues
            </h2>
            <Card>
              <CardContent className="pt-6 text-sm">
                {my.issues.length === 0 ? (
                  <p className="text-muted-foreground">No blockers flagged right now.</p>
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
              My review
            </h2>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <p>{my.review.summary}</p>
                {my.review.interventions.length > 0 && (
                  <ul className="space-y-2 border-t border-border/60 pt-3">
                    {my.review.interventions.map((iv) => (
                      <li key={iv.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{KIND_LABEL[iv.kind] ?? iv.kind}</span>
                        {iv.followUpAt && ` · follow-up ${iv.followUpAt}`}
                        {iv.note && ` — ${iv.note}`}
                        <span className="block text-[10px] mt-0.5">From {iv.managerLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="link" className="px-0 h-auto text-xs" asChild>
                  <Link href="/hr/performance">
                    Full performance &amp; growth <ChevronRight className="h-3 w-3 inline" />
                  </Link>
                </Button>
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
          <p className="text-sm text-muted-foreground">{team.progressSummary}</p>

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
              <CardDescription>Why, what to do, then open the person if you need detail.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {team.attention.length === 0 ? (
                <p className="text-muted-foreground text-sm">No one off-track in this snapshot.</p>
              ) : (
                <ul className="space-y-3">
                  {team.attention.map((r) => (
                    <li key={r.employeeId} className="rounded-lg border border-border/60 p-3 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/business/employee/${r.employeeId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={statusTone(r.status)} variant="secondary">
                            {r.status.replace(/_/g, " ")}
                          </Badge>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openAct(r)}>
                            Act
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/90">Why: </span>
                        {r.primaryWhy}
                      </p>
                      <p className="text-xs">
                        <span className="font-medium text-muted-foreground">Do: </span>
                        {r.suggestedAction}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Decisions
              </CardTitle>
              <CardDescription>Queues needing a decision elsewhere.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <span className="text-2xl font-semibold tabular-nums">
                  {team.decisions.pendingEmployeeRequests}
                </span>
                <span className="text-muted-foreground ml-2">employee requests</span>
              </div>
              <div>
                <span className="text-2xl font-semibold tabular-nums">
                  {team.decisions.pendingLeaveRequests}
                </span>
                <span className="text-muted-foreground ml-2">leave requests</span>
              </div>
            </CardContent>
          </Card>

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

      <Dialog open={actOpen} onOpenChange={setActOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log follow-up{actTarget ? ` — ${actTarget.name}` : ""}</DialogTitle>
            <DialogDescription>Short, practical — the person gets a notification.</DialogDescription>
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
                  <SelectItem value="follow_up">Schedule follow-up</SelectItem>
                  <SelectItem value="under_review">Mark under review</SelectItem>
                  <SelectItem value="corrective_task">Assign corrective task</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fu">Follow-up date (optional)</Label>
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
              {createIv.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        <Link href="/hr/performance" className="underline underline-offset-2">
          Deeper performance tools
        </Link>{" "}
        ·{" "}
        <Link href="/hr/accountability" className="underline underline-offset-2">
          Accountability detail
        </Link>
      </p>
    </div>
  );
}

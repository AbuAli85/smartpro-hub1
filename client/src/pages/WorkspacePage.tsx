import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LayoutGrid, ChevronRight, Users, ClipboardList } from "lucide-react";

function statusTone(s: string): string {
  const map: Record<string, string> = {
    on_track: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
    watch: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
    at_risk: "bg-orange-600/20 text-orange-900 dark:text-orange-200",
    critical: "bg-red-600/20 text-red-950 dark:text-red-200",
  };
  return map[s] ?? "bg-muted";
}

export default function WorkspacePage() {
  const { activeCompanyId } = useActiveCompany();
  const { data, isLoading, error } = trpc.workspace.getWorkspace.useQuery(
    { companyId: activeCompanyId ?? undefined, includeTeam: true },
    { enabled: activeCompanyId != null }
  );

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
                    <li className="text-muted-foreground">Add responsibilities in HR when ready.</li>
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
                <CardDescription className="text-xs pt-1">
                  One combined read — details stay in the background.
                </CardDescription>
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
                  <p className="text-sm text-muted-foreground">No open tasks right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {my.work.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start justify-between gap-3 text-sm border-b border-border/60 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium leading-snug">{t.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {t.priority} · {t.status}
                          {t.dueDate ? ` · due ${t.dueDate}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="link" className="px-0 mt-2 h-auto text-xs" asChild>
                  <Link href="/hr/tasks">
                    Open task manager <ChevronRight className="h-3 w-3 inline" />
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
                  <p className="text-muted-foreground">Nothing urgent flagged.</p>
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
              <CardContent className="pt-6 text-sm">
                <p>{my.review.summary}</p>
                <Button variant="link" className="px-0 mt-2 h-auto text-xs" asChild>
                  <Link href="/hr/performance">
                    Performance &amp; growth <ChevronRight className="h-3 w-3 inline" />
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
              <CardTitle className="text-base">Risks &amp; priorities</CardTitle>
              <CardDescription>People who need attention first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Risks</p>
                <ul className="space-y-1">
                  {team.risks.length === 0 ? (
                    <li className="text-muted-foreground">—</li>
                  ) : (
                    team.risks.map((r) => (
                      <li key={r.employeeId} className="flex justify-between gap-2">
                        <Link
                          href={`/business/employee/${r.employeeId}`}
                          className="text-primary hover:underline truncate"
                        >
                          {r.name}
                        </Link>
                        <Badge className={statusTone(r.status)} variant="secondary">
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Decisions
              </CardTitle>
              <CardDescription>Approvals waiting in the company queue.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm flex gap-6">
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
              <Link href="/hr/employee-requests">Requests</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/hr/leave">Leave</Link>
            </Button>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/hr/performance" className="underline underline-offset-2">
          Deeper performance tools
        </Link>{" "}
        when you need them.
      </p>
    </div>
  );
}

import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ListChecks } from "lucide-react";
import { domainLabel } from "../decisionPromptCopy";
import { getCommitmentHorizonLabel } from "../commitmentHorizon";
import type { ExecutiveCommitment } from "../commitmentTypes";

export type ExecutiveCommitmentsSectionProps = {
  commitments: ExecutiveCommitment[];
};

function priorityStripe(p: ExecutiveCommitment["priority"]) {
  if (p === "high") return "border-l-[3px] border-l-slate-500/80 dark:border-l-slate-400";
  if (p === "medium") return "border-l-[3px] border-l-slate-400/70 dark:border-l-slate-500";
  return "border-l-[3px] border-l-slate-300/80 dark:border-l-slate-600";
}

export function ExecutiveCommitmentsSection({ commitments }: ExecutiveCommitmentsSectionProps) {
  if (commitments.length === 0) return null;

  return (
    <section aria-label="Executive commitments" className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Executive commitments</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-1 md:grid-cols-3">
        {commitments.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg border bg-muted/20 px-3 py-2.5 shadow-sm ${priorityStripe(c.priority)}`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-foreground leading-snug">{c.title}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                {c.domain ? (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {domainLabel(c.domain)}
                  </Badge>
                ) : null}
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {getCommitmentHorizonLabel(c.horizon)}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-foreground/90 mt-1.5 leading-snug">{c.checkpoint}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
              <span className="font-medium text-muted-foreground/90">Success: </span>
              {c.successCriteria}
            </p>
            {c.href ? (
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" asChild>
                <Link href={c.href}>
                  Open area
                  <ArrowUpRight className="w-3 h-3 ml-1" aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

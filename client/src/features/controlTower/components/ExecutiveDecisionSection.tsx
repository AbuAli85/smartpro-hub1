import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Gavel } from "lucide-react";
import { domainLabel } from "../decisionPromptCopy";
import type { ExecutiveDecisionPrompt } from "../decisionPromptTypes";

export type ExecutiveDecisionSectionProps = {
  prompts: ExecutiveDecisionPrompt[];
};

function priorityStripe(p: ExecutiveDecisionPrompt["priority"]) {
  if (p === "high") return "border-l-[3px] border-l-red-400/90 dark:border-l-red-600";
  if (p === "medium") return "border-l-[3px] border-l-amber-400/80 dark:border-l-amber-600";
  return "border-l-[3px] border-l-slate-300/90 dark:border-l-slate-600";
}

export function ExecutiveDecisionSection({ prompts }: ExecutiveDecisionSectionProps) {
  if (prompts.length === 0) return null;

  return (
    <section aria-label="Executive decisions" className="space-y-3">
      <div className="flex items-center gap-2">
        <Gavel className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Executive decisions</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-1 md:grid-cols-3">
        {prompts.map((p) => (
          <div
            key={p.id}
            className={`rounded-lg border bg-card/80 px-3 py-2.5 shadow-sm ${priorityStripe(p.priority)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground leading-snug">{p.title}</h3>
              {p.domain ? (
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                  {domainLabel(p.domain)}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{p.rationale}</p>
            <p className="text-xs text-foreground/90 mt-1.5 leading-snug font-medium">{p.recommendedMove}</p>
            {p.href ? (
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" asChild>
                <Link href={p.href}>
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

import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Gavel } from "lucide-react";
import { cn } from "@/lib/utils";
import { domainLabel } from "../decisionPromptCopy";
import type { ExecutiveDecisionPrompt } from "../decisionPromptTypes";

export type ExecutiveDecisionSectionProps = {
  prompts: ExecutiveDecisionPrompt[];
  /** Presentation mode — slightly larger headings, tighter cards */
  presentation?: boolean;
};

function priorityStripe(p: ExecutiveDecisionPrompt["priority"]) {
  if (p === "high") return "border-l-[3px] border-l-red-400/90 dark:border-l-red-600";
  if (p === "medium") return "border-l-[3px] border-l-amber-400/80 dark:border-l-amber-600";
  return "border-l-[3px] border-l-slate-300/90 dark:border-l-slate-600";
}

export function ExecutiveDecisionSection({ prompts, presentation }: ExecutiveDecisionSectionProps) {
  if (prompts.length === 0) return null;

  return (
    <section aria-label="Executive decisions" className={cn("space-y-3", presentation && "space-y-2.5")}>
      <div className="flex items-center gap-2">
        <Gavel
          className={cn("text-slate-600 dark:text-slate-400 shrink-0", presentation ? "w-3.5 h-3.5" : "w-4 h-4")}
          aria-hidden
        />
        <h2 className={cn("font-semibold tracking-tight text-foreground", presentation ? "text-base" : "text-sm")}>
          Executive decisions
        </h2>
      </div>
      <div className={cn("grid sm:grid-cols-1 md:grid-cols-3", presentation ? "gap-1.5" : "gap-2")}>
        {prompts.map((p) => (
          <div
            key={p.id}
            className={cn(
              `rounded-lg border bg-card/80 shadow-sm ${priorityStripe(p.priority)}`,
              presentation ? "px-2.5 py-2" : "px-3 py-2.5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn("font-medium text-foreground leading-snug", presentation ? "text-[15px]" : "text-sm")}>
                {p.title}
              </h3>
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

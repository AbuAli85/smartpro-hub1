import React from "react";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { domainLabel } from "../decisionPromptCopy";
import type { ExecutiveReviewItem } from "../reviewTypes";

export type ExecutiveReviewSectionProps = {
  items: ExecutiveReviewItem[];
};

export function ExecutiveReviewSection({ items }: ExecutiveReviewSectionProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Operating review" className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Operating review</h2>
      </div>
      <div className="divide-y rounded-lg border bg-card/50">
        {items.map((item) => (
          <div key={item.id} className="px-3 py-2.5 space-y-1.5 first:rounded-t-lg last:rounded-b-lg">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground leading-snug">{item.title}</h3>
              {item.domain ? (
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                  {domainLabel(item.domain)}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-foreground/90 leading-snug">{item.reviewQuestion}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-medium text-muted-foreground/95">Accountability: </span>
              {item.accountabilityCheck}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-medium text-muted-foreground/95">Signal: </span>
              {item.reviewSignal}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

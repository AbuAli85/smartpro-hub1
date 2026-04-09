import React from "react";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { domainLabel } from "../decisionPromptCopy";
import type { ExecutiveReviewItem } from "../reviewTypes";

export type ExecutiveReviewSectionProps = {
  items: ExecutiveReviewItem[];
  presentation?: boolean;
};

export function ExecutiveReviewSection({ items, presentation }: ExecutiveReviewSectionProps) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Operating review" className={cn("space-y-3", presentation && "space-y-2.5")}>
      <div className="flex items-center gap-2">
        <ClipboardCheck
          className={cn("text-slate-600 dark:text-slate-400 shrink-0", presentation ? "w-3.5 h-3.5" : "w-4 h-4")}
          aria-hidden
        />
        <h2 className={cn("font-semibold tracking-tight text-foreground", presentation ? "text-base" : "text-sm")}>
          {presentation ? "Executive review" : "Operating review"}
        </h2>
      </div>
      <div className={cn("divide-y rounded-lg border bg-card/50", presentation && "shadow-sm")}>
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "space-y-1.5 first:rounded-t-lg last:rounded-b-lg",
              presentation ? "px-2.5 py-2" : "px-3 py-2.5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn("font-medium text-foreground leading-snug", presentation ? "text-[15px]" : "text-sm")}>
                {item.title}
              </h3>
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

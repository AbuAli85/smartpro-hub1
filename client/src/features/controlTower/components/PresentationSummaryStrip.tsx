import React from "react";
import { cn } from "@/lib/utils";

export type PresentationSummaryStripProps = {
  variantLabel: string;
  situationLine: string;
  outcomeLine: string | null;
  trendLine: string | null;
  interventionCount: number;
  className?: string;
};

export function PresentationSummaryStrip({
  variantLabel,
  situationLine,
  outcomeLine,
  trendLine,
  interventionCount,
  className,
}: PresentationSummaryStripProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/80 bg-muted/15 px-3 py-2.5 text-sm space-y-1.5",
        className,
      )}
      aria-label="Presentation summary"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leadership snapshot</p>
        <span className="text-[11px] text-muted-foreground">{variantLabel}</span>
      </div>
      {situationLine ? <p className="text-foreground/95 leading-snug">{situationLine}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {outcomeLine ? (
          <span>
            <span className="font-medium text-foreground/80">Outcome: </span>
            {outcomeLine}
          </span>
        ) : null}
        {trendLine ? (
          <span>
            <span className="font-medium text-foreground/80">Trend: </span>
            {trendLine}
          </span>
        ) : null}
        <span className="tabular-nums">
          <span className="font-medium text-foreground/80">Interventions: </span>
          {interventionCount}
        </span>
      </div>
    </div>
  );
}

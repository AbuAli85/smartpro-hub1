import React from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskStripCard } from "../riskStripModel";

export type RiskStripProps = {
  cards: RiskStripCard[];
  /** Optional domain load hint — secondary to card content */
  domainNarrativeLine?: string | null;
  /** Compact layout for presentation mode — less chrome */
  compact?: boolean;
};

export function RiskStrip({ cards, domainNarrativeLine, compact }: RiskStripProps) {
  return (
    <section aria-label="Risk indicators" className={cn("space-y-3", compact && "space-y-2 opacity-95")}>
      <div>
        <h2 className={cn("font-semibold tracking-tight text-foreground", compact ? "text-xs" : "text-sm")}>
          What is blocked vs building
        </h2>
        {!compact ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">Three buckets — scan left to right.</p>
        ) : null}
        {domainNarrativeLine && !compact ? (
          <p className="text-[10px] text-muted-foreground/90 mt-1 max-w-xl leading-snug">{domainNarrativeLine}</p>
        ) : domainNarrativeLine && compact ? (
          <p className="text-[10px] text-muted-foreground/85 mt-0.5 max-w-2xl leading-snug line-clamp-2">{domainNarrativeLine}</p>
        ) : null}
      </div>
      <div className={cn("grid grid-cols-1 md:grid-cols-3", compact ? "gap-2" : "gap-3")}>
        {cards.map((card) => (
          <Card
            key={card.tier}
            className={`shadow-sm overflow-hidden ${
              card.semanticClass === "blocked"
                ? "border-l-[5px] border-l-red-600 border-y border-r border-border"
                : card.semanticClass === "at_risk"
                  ? "border-l-[5px] border-l-amber-500 border-y border-r border-border"
                  : "border-l-[5px] border-l-slate-400 border-y border-r border-border"
            }`}
          >
            <CardContent className={cn(compact ? "p-2.5 sm:p-3" : "p-3 sm:p-4")}>
              <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
                <p
                  className={`${compact ? "text-xl" : "text-2xl"} font-bold tabular-nums leading-none ${
                    card.semanticClass === "blocked"
                      ? "text-red-700 dark:text-red-300"
                      : card.semanticClass === "at_risk"
                        ? "text-amber-800 dark:text-amber-200"
                        : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {card.loading ? "…" : card.count}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{card.helper}</p>
              <Link href={card.href} className="text-[11px] font-medium text-primary hover:underline inline-block mt-2">
                View details →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

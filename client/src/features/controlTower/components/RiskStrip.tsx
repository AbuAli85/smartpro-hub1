import React from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import type { RiskStripCard } from "../riskStripModel";

export type RiskStripProps = {
  cards: RiskStripCard[];
};

export function RiskStrip({ cards }: RiskStripProps) {
  return (
    <section aria-label="Risk indicators" className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-foreground">What is blocked vs building</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Three buckets — scan left to right.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{card.label}</p>
                <p
                  className={`text-2xl font-bold tabular-nums leading-none ${
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

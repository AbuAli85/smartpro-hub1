import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBriefVariantConfig } from "../briefVariantConfig";
import type { OperatingBriefVariant } from "../briefVariants";
import type { OperatingBrief } from "../operatingBriefTypes";
import { formatOperatingBriefText } from "../operatingBrief";

export type OperatingBriefSectionProps = {
  brief: OperatingBrief;
  /** When true, section is visually emphasized (brief mode) */
  emphasized?: boolean;
  variant?: OperatingBriefVariant;
};

export function OperatingBriefSection({ brief, emphasized, variant = "daily" }: OperatingBriefSectionProps) {
  const [copied, setCopied] = useState(false);
  const config = getBriefVariantConfig(variant);

  const handleCopy = useCallback(async () => {
    const text = formatOperatingBriefText(brief, variant);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [brief, variant]);

  const boardDual = variant === "board" && brief.outcomeSummary && brief.trendSummary;

  return (
    <section
      aria-label="Operating brief"
      className={cn(
        "rounded-lg border bg-card/90 p-4 space-y-4",
        emphasized && "ring-2 ring-[var(--smartpro-orange)]/30 shadow-sm border-[var(--smartpro-orange)]/25",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--smartpro-orange)] shrink-0" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Operating brief
              <span className="font-normal text-muted-foreground"> · {config.label}</span>
            </h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Generated {new Date(brief.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="text-xs shrink-0 gap-1" onClick={handleCopy}>
          <ClipboardCopy className="w-3.5 h-3.5" aria-hidden />
          {copied ? "Copied" : "Copy brief"}
        </Button>
      </div>

      <div className="space-y-3 text-sm">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situation</h3>
          <p className="text-foreground/95 leading-snug mt-1">{brief.situationSummary}</p>
        </div>

        <BriefList title="Key pressures" items={brief.keyPressures} compact={variant === "board"} />
        <BriefList title="Leadership focus" items={brief.leadershipFocus} compact={variant === "board"} />
        <BriefList title="Checkpoints" items={brief.operatingCheckpoints} compact={variant === "board"} />
        <BriefList title="Review focus" items={brief.reviewFocus} compact={variant === "board"} />

        {boardDual ? (
          <>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</h3>
              <p className="text-foreground/90 leading-snug mt-1 text-xs">{brief.outcomeSummary}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</h3>
              <p className="text-foreground/90 leading-snug mt-1 text-xs">{brief.trendSummary}</p>
            </div>
          </>
        ) : (
          <>
            {brief.outcomeSummary && config.includeOutcome ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</h3>
                <p className="text-foreground/90 leading-snug mt-1 text-xs">{brief.outcomeSummary}</p>
              </div>
            ) : null}
            {brief.trendSummary && config.includeTrend ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</h3>
                <p className="text-foreground/90 leading-snug mt-1 text-xs">{brief.trendSummary}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function BriefList({ title, items, compact }: { title: string; items: string[]; compact?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className={cn("mt-1.5 space-y-1 list-none", compact && "space-y-0.5")}>
        {items.map((line, i) => (
          <li key={i} className="text-xs text-foreground/90 leading-snug pl-2 border-l-2 border-muted">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

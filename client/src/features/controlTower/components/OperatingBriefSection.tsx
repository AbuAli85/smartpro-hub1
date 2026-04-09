import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBriefVariantConfig } from "../briefVariantConfig";
import type { OperatingBriefVariant } from "../briefVariants";
import type { OperatingBrief } from "../operatingBriefTypes";
import { formatOperatingBriefText, formatPresentationBriefText } from "../operatingBrief";
import type { ControlTowerViewMode } from "../presentationMode";

export type OperatingBriefSectionProps = {
  brief: OperatingBrief;
  /** When true, section is visually emphasized (brief / present modes) */
  emphasized?: boolean;
  variant?: OperatingBriefVariant;
  /** View mode — present applies meeting-brief typography */
  viewMode?: ControlTowerViewMode;
};

export function OperatingBriefSection({
  brief,
  emphasized,
  variant = "daily",
  viewMode = "operate",
}: OperatingBriefSectionProps) {
  const [copied, setCopied] = useState(false);
  const [copiedPresentation, setCopiedPresentation] = useState(false);
  const config = getBriefVariantConfig(variant);
  const isPresent = viewMode === "present";

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

  const handleCopyPresentation = useCallback(async () => {
    const text = formatPresentationBriefText(brief, variant);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPresentation(true);
      window.setTimeout(() => setCopiedPresentation(false), 2000);
    } catch {
      setCopiedPresentation(false);
    }
  }, [brief, variant]);

  const boardDual = variant === "board" && brief.outcomeSummary && brief.trendSummary;

  return (
    <section
      aria-label="Operating brief"
      className={cn(
        "rounded-lg border bg-card/90 space-y-4",
        isPresent ? "p-5 space-y-5 ring-1 ring-foreground/10" : "p-4 space-y-4",
        emphasized && "ring-2 ring-[var(--smartpro-orange)]/30 shadow-sm border-[var(--smartpro-orange)]/25",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText
            className={cn("text-[var(--smartpro-orange)] shrink-0", isPresent ? "w-5 h-5" : "w-4 h-4")}
            aria-hidden
          />
          <div>
            <h2
              className={cn(
                "font-semibold tracking-tight text-foreground",
                isPresent ? "text-base" : "text-sm",
              )}
            >
              Operating brief
              <span className="font-normal text-muted-foreground"> · {config.label}</span>
            </h2>
            <p className={cn("text-muted-foreground mt-0.5", isPresent ? "text-[11px]" : "text-[10px]")}>
              Generated {new Date(brief.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={handleCopy}>
            <ClipboardCopy className="w-3.5 h-3.5" aria-hidden />
            {copied ? "Copied" : "Copy brief"}
          </Button>
          {isPresent ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs gap-1"
              onClick={handleCopyPresentation}
            >
              <ClipboardCopy className="w-3.5 h-3.5" aria-hidden />
              {copiedPresentation ? "Copied" : "Copy presentation summary"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn("text-sm", isPresent && "space-y-4")}>
        <div>
          <h3
            className={cn(
              "font-semibold uppercase tracking-wide text-muted-foreground",
              isPresent ? "text-xs" : "text-xs",
            )}
          >
            Situation
          </h3>
          <p className={cn("text-foreground/95 leading-snug mt-1", isPresent && "text-[15px] leading-relaxed")}>
            {brief.situationSummary}
          </p>
        </div>

        <BriefList title="Key pressures" items={brief.keyPressures} compact={variant === "board"} present={isPresent} />
        <BriefList title="Leadership focus" items={brief.leadershipFocus} compact={variant === "board"} present={isPresent} />
        <BriefList title="Checkpoints" items={brief.operatingCheckpoints} compact={variant === "board"} present={isPresent} />
        <BriefList title="Review focus" items={brief.reviewFocus} compact={variant === "board"} present={isPresent} />

        {boardDual ? (
          <>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</h3>
              <p className={cn("text-foreground/90 leading-snug mt-1", isPresent ? "text-sm" : "text-xs")}>
                {brief.outcomeSummary}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</h3>
              <p className={cn("text-foreground/90 leading-snug mt-1", isPresent ? "text-sm" : "text-xs")}>
                {brief.trendSummary}
              </p>
            </div>
          </>
        ) : (
          <>
            {brief.outcomeSummary && config.includeOutcome ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome</h3>
                <p className={cn("text-foreground/90 leading-snug mt-1", isPresent ? "text-sm" : "text-xs")}>
                  {brief.outcomeSummary}
                </p>
              </div>
            ) : null}
            {brief.trendSummary && config.includeTrend ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trend</h3>
                <p className={cn("text-foreground/90 leading-snug mt-1", isPresent ? "text-sm" : "text-xs")}>
                  {brief.trendSummary}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function BriefList({
  title,
  items,
  compact,
  present,
}: {
  title: string;
  items: string[];
  compact?: boolean;
  present?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className={cn("mt-1.5 space-y-1 list-none", compact && "space-y-0.5", present && "mt-2 space-y-1.5")}>
        {items.map((line, i) => (
          <li
            key={i}
            className={cn(
              "text-foreground/90 leading-snug pl-2 border-l-2 border-muted",
              compact ? "text-xs" : present ? "text-sm" : "text-xs",
            )}
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

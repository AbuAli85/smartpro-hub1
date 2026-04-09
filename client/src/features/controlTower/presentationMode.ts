/**
 * Presentation-layer visibility for Control Tower view modes (P13).
 * No business logic — maps UX mode to what to show and how to emphasize.
 */

export type ControlTowerViewMode = "operate" | "brief" | "present";

export interface ControlTowerPresentationConfig {
  showQueue: boolean;
  showKpis: boolean;
  showFooter: boolean;
  showPrioritiesSection: boolean;
  showRiskStrip: boolean;
  riskStripCompact: boolean;
  emphasizeBrief: boolean;
  emphasizeDecisions: boolean;
  emphasizeCommitments: boolean;
  emphasizeReview: boolean;
  /** Softens non-brief blocks (brief mode only) */
  dimNonBriefChrome: boolean;
}

export function getControlTowerPresentationConfig(mode: ControlTowerViewMode): ControlTowerPresentationConfig {
  switch (mode) {
    case "operate":
      return {
        showQueue: true,
        showKpis: true,
        showFooter: true,
        showPrioritiesSection: true,
        showRiskStrip: true,
        riskStripCompact: false,
        emphasizeBrief: false,
        emphasizeDecisions: false,
        emphasizeCommitments: false,
        emphasizeReview: false,
        dimNonBriefChrome: false,
      };
    case "brief":
      return {
        showQueue: false,
        showKpis: true,
        showFooter: true,
        showPrioritiesSection: true,
        showRiskStrip: true,
        riskStripCompact: false,
        emphasizeBrief: true,
        emphasizeDecisions: false,
        emphasizeCommitments: false,
        emphasizeReview: false,
        dimNonBriefChrome: true,
      };
    case "present":
      return {
        showQueue: false,
        showKpis: false,
        showFooter: false,
        showPrioritiesSection: false,
        showRiskStrip: true,
        riskStripCompact: true,
        emphasizeBrief: true,
        emphasizeDecisions: true,
        emphasizeCommitments: true,
        emphasizeReview: true,
        dimNonBriefChrome: false,
      };
  }
}

/** First sentence or truncated line for compact presentation chrome */
export function presentationOneLine(text: string, maxChars = 140): string {
  const t = text.trim();
  if (!t) return "";
  const sentenceEnd = t.search(/[.!?](\s|$)/);
  const first =
    sentenceEnd > 0 ? t.slice(0, sentenceEnd + 1).trim() : t;
  if (first.length <= maxChars) return first;
  return `${first.slice(0, Math.max(0, maxChars - 1))}…`;
}

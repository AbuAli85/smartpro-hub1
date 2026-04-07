/**
 * Single source of truth for resolution workflow tags and task body shape.
 * Server and client import from here — keep strings identical for matching open tasks.
 */

export const RESOLUTION_TASK_TAG = {
  crmContact: (contactId: number) => `[RESOLUTION:crm:contact:${contactId}]`,
  billingCycle: (cycleId: number) => `[RESOLUTION:billing:cycle:${cycleId}]`,
} as const;

/** First line of task description must include this prefix for server-side matching. */
export const RESOLUTION_TAG_LINE_PREFIX = "[RESOLUTION:";

export function buildResolutionTaskDescription(input: {
  tagLine: string;
  recommendedActionLabel: string;
  recommendedBasis: string;
  contextUrl?: string | null;
  extraNotes?: string | null;
}): string {
  const lines = [
    input.tagLine,
    "",
    `Recommended action: ${input.recommendedActionLabel}`,
    `Basis: ${input.recommendedBasis}`,
  ];
  if (input.contextUrl) lines.push("", `Context: ${input.contextUrl}`);
  if (input.extraNotes?.trim()) lines.push("", input.extraNotes.trim());
  return lines.join("\n");
}

export function truncateTitle(s: string, max = 250): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

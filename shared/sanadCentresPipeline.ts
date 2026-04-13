/** Lifecycle for imported directory → onboarded Sanad partner (sanad_centres_pipeline.pipeline_status). */
export const SANAD_CENTRE_PIPELINE_STATUSES = [
  "imported",
  "contacted",
  "prospect",
  "invited",
  "registered",
  "active",
] as const;

export type SanadCentrePipelineStatus = (typeof SANAD_CENTRE_PIPELINE_STATUSES)[number];

export function parseSanadCentrePipelineStatus(
  value: string | null | undefined,
): SanadCentrePipelineStatus | undefined {
  if (!value) return undefined;
  return (SANAD_CENTRE_PIPELINE_STATUSES as readonly string[]).includes(value)
    ? (value as SanadCentrePipelineStatus)
    : undefined;
}

const ORDER: Record<SanadCentrePipelineStatus, number> = {
  imported: 0,
  contacted: 1,
  prospect: 2,
  invited: 3,
  registered: 4,
  active: 5,
};

/** Returns the higher stage (for monotonic promotions). */
export function maxPipelineStatus(
  a: SanadCentrePipelineStatus,
  b: SanadCentrePipelineStatus,
): SanadCentrePipelineStatus {
  return ORDER[a] >= ORDER[b] ? a : b;
}

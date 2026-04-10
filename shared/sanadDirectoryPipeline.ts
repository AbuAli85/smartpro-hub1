/** Aligns with `getSanadBottleneckKpis` presets for admin directory drilldown. */
export const SANAD_DIRECTORY_PIPELINE_FILTERS = [
  "stuck_onboarding",
  "licensed_no_office",
  "invited_never_linked",
  "linked_not_activated",
  "activated_unlisted",
  "public_listed_no_active_catalogue",
  "solo_owner_roster_only",
] as const;

export type SanadDirectoryPipelineFilter = (typeof SANAD_DIRECTORY_PIPELINE_FILTERS)[number];

export function parseSanadDirectoryPipeline(
  value: string | null | undefined,
): SanadDirectoryPipelineFilter | undefined {
  if (!value) return undefined;
  return (SANAD_DIRECTORY_PIPELINE_FILTERS as readonly string[]).includes(value)
    ? (value as SanadDirectoryPipelineFilter)
    : undefined;
}

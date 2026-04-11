export type ProfileRequestAgeBucket = "any" | "lt_24h" | "d1_7" | "gt_7d";

export const PROFILE_REQUEST_AGE_BUCKET_OPTIONS: { value: ProfileRequestAgeBucket; label: string }[] = [
  { value: "any", label: "Any age" },
  { value: "lt_24h", label: "Last 24 hours" },
  { value: "d1_7", label: "1–7 days old" },
  { value: "gt_7d", label: "Older than 7 days" },
];

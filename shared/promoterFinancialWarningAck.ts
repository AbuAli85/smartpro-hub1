/**
 * Phase 3.5 — standardized warning acknowledgment shape for runs and invoices.
 */

export type WarningAcknowledgmentV1 = {
  version: 1;
  acceptedWarningKeys: string[];
  reviewerNote?: string;
  recordedAt?: string;
  recordedByUserId?: number;
};

export function normalizeWarningAck(input: unknown): WarningAcknowledgmentV1 | null {
  if (input == null || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const keys = o.acceptedWarningKeys;
  if (!Array.isArray(keys)) return null;
  return {
    version: 1,
    acceptedWarningKeys: keys.map((k) => String(k)),
    reviewerNote: o.reviewerNote != null ? String(o.reviewerNote) : undefined,
    recordedAt: o.recordedAt != null ? String(o.recordedAt) : undefined,
    recordedByUserId:
      typeof o.recordedByUserId === "number" ? o.recordedByUserId : undefined,
  };
}

export function formatWarningAckForDisplay(ack: WarningAcknowledgmentV1 | null): string {
  if (!ack || ack.acceptedWarningKeys.length === 0) return "None";
  const parts = [`Keys: ${ack.acceptedWarningKeys.join(", ")}`];
  if (ack.reviewerNote?.trim()) parts.push(`Note: ${ack.reviewerNote.trim()}`);
  return parts.join(" · ");
}

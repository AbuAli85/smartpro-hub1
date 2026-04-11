/**
 * Pure helpers for employee profile change request workflow (shared client/server).
 */

export type ProfileChangeRequestStatus = "pending" | "resolved" | "rejected";

export function isTerminalProfileChangeStatus(s: ProfileChangeRequestStatus): boolean {
  return s === "resolved" || s === "rejected";
}

/** Whether an HR action can transition a row from its current status. */
export function canCloseProfileChangeRequest(status: ProfileChangeRequestStatus): boolean {
  return status === "pending";
}

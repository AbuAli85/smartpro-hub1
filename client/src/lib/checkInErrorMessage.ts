import { parseCheckInRejectionMessage } from "@shared/attendanceCheckInEligibility";

/** Strip machine code prefix from attendance.checkIn TRPC errors (CODE|human text). */
export function humanCheckInErrorMessage(raw: string): string {
  return parseCheckInRejectionMessage(raw).humanMessage;
}

/** Same wire format as check-in; check-out mutations may reuse coded errors. */
export function humanAttendanceMutationError(raw: string): string {
  return humanCheckInErrorMessage(raw);
}

import { parseCheckInRejectionMessage } from "@shared/attendanceCheckInEligibility";

/** Strip machine code prefix from attendance.checkIn TRPC errors (CODE|human text). */
export function humanCheckInErrorMessage(raw: string): string {
  return parseCheckInRejectionMessage(raw).humanMessage;
}

import { toast } from "sonner";
import { parseCheckInRejectionMessage } from "@shared/attendanceCheckInEligibility";
import { attendanceMutationIsRetryable } from "@/lib/attendanceDenialHints";

/**
 * Toast for check-in / check-out failures with optional Retry when the server code is recoverable.
 */
export function toastAttendanceMutationError(message: string, retry?: () => void): void {
  const { code, humanMessage } = parseCheckInRejectionMessage(message);
  if (retry && attendanceMutationIsRetryable(code)) {
    toast.error(humanMessage, {
      description: "Fix the issue, then tap Try again.",
      action: { label: "Try again", onClick: retry },
    });
    return;
  }
  toast.error(humanMessage);
}

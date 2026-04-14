import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared control for opening {@link OperationalIssueHistorySheet} from queue, board, overdue, corrections, and manual rows.
 */
export function OperationalIssueHistoryTrigger({
  onClick,
  className,
  label = "History",
  disabled,
}: {
  onClick: () => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-7 text-[11px] gap-1 shrink-0", className)}
      onClick={onClick}
      disabled={disabled}
    >
      <History className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}

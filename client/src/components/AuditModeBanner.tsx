/**
 * AuditModeBanner
 * Shown at the top of every page when the current user has the external_auditor role.
 * Communicates read-only access clearly and provides a link to request elevated access.
 */
import { ShieldCheck, Eye, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditModeBannerProps {
  /** The company name the auditor is reviewing */
  companyName?: string;
}

export function AuditModeBanner({ companyName }: AuditModeBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3 text-sm"
    >
      <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <Badge
          variant="outline"
          className="border-amber-400 text-amber-700 bg-amber-100 font-semibold text-xs gap-1"
        >
          <Eye className="h-3 w-3" aria-hidden="true" />
          Audit Mode — Read Only
        </Badge>
        <span className="text-amber-800">
          You are viewing{companyName ? ` ${companyName}` : ""} as an{" "}
          <strong>External Auditor</strong>. All write actions are disabled.
        </span>
      </div>
      <div className="flex items-center gap-1 text-amber-600 shrink-0 text-xs">
        <Lock className="h-3 w-3" aria-hidden="true" />
        <span className="hidden sm:inline">Write access restricted</span>
      </div>
    </div>
  );
}

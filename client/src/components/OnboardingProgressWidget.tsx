import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Sparkles, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact onboarding progress widget shown in the sidebar for new users.
 * Automatically hides once all required steps are completed.
 */
export function OnboardingProgressWidget() {
  const { i18n } = useTranslation("common");
  const isAr = i18n.language.startsWith("ar");
  const [location] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const [dismissed, setDismissed] = useState(false);

  const { data } = trpc.onboarding.getProgress.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: activeCompanyId != null,
      staleTime: 60_000,
    },
  );

  const summary = data?.summary;

  // Main dashboard already shows OwnerSetupChecklist — avoid duplicate "Getting started" UI.
  if (location === "/dashboard" || location.startsWith("/dashboard/")) return null;

  // Hide if: dismissed, no data, or all required steps done
  if (dismissed || !summary || summary.isComplete) return null;

  // Also hide if user has completed more than 80% — they're well on their way
  if (summary.percentComplete >= 80) return null;

  return (
    <div className="mx-2 mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 relative">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pr-5">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground">
          {isAr ? "دليل الإعداد" : "Getting Started"}
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={summary.percentComplete} className="h-1.5 mb-2" />

      {/* Stats */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] text-muted-foreground">
          {isAr
            ? `${summary.completed} من ${summary.total} خطوة`
            : `${summary.completed} of ${summary.total} steps`}
        </span>
        <span className="text-[10px] font-medium text-primary">
          {summary.percentComplete}%
        </span>
      </div>

      {/* Next pending step hint */}
      {data?.steps && (() => {
        const nextStep = data.steps.find((s) => s.status === "pending");
        if (!nextStep) return null;
        const title = isAr && nextStep.titleAr ? nextStep.titleAr : nextStep.titleEn;
        return (
          <p className="text-[10px] text-muted-foreground mb-2 line-clamp-1">
            {isAr ? "التالي: " : "Next: "}
            <span className="text-foreground">{title}</span>
          </p>
        );
      })()}

      {/* CTA */}
      <Link href="/onboarding-guide">
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-[11px] border-primary/30 text-primary hover:bg-primary/10"
        >
          {isAr ? "عرض قائمة التحقق" : "View Checklist"}
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

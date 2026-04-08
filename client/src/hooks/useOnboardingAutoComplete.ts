import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Maps route prefixes to onboarding step keys that should be auto-completed
 * when the user visits those pages.
 */
const ROUTE_STEP_MAP: Array<{ prefix: string; stepKey: string }> = [
  { prefix: "/preferences", stepKey: "complete_profile" },
  { prefix: "/company/settings", stepKey: "setup_company" },
  { prefix: "/company/profile", stepKey: "setup_company" },
  { prefix: "/company-admin", stepKey: "invite_team" },
  { prefix: "/company/team-access", stepKey: "invite_team" },
  { prefix: "/dashboard", stepKey: "explore_dashboard" },
  { prefix: "/hr/employees", stepKey: "add_employee" },
  { prefix: "/my-team", stepKey: "add_employee" },
  { prefix: "/contracts", stepKey: "create_contract" },
  { prefix: "/pro", stepKey: "submit_pro_service" },
  { prefix: "/compliance", stepKey: "check_compliance" },
  { prefix: "/marketplace", stepKey: "explore_marketplace" },
  { prefix: "/subscriptions", stepKey: "setup_subscription" },
];

/**
 * Hook that automatically marks onboarding steps as completed when the user
 * navigates to the relevant pages. Should be mounted once at the app level
 * (e.g., inside PlatformLayout).
 */
export function useOnboardingAutoComplete() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const completedRef = useRef<Set<string>>(new Set());

  const utils = trpc.useUtils();
  const completeStep = trpc.onboarding.completeStep.useMutation({
    onSuccess: () => {
      // Invalidate progress query so sidebar widget updates
      utils.onboarding.getProgress.invalidate();
    },
  });

  useEffect(() => {
    if (isLoading || !user || !activeCompanyId) return;

    // Find matching step for current route
    const match = ROUTE_STEP_MAP.find(({ prefix }) => location.startsWith(prefix));
    if (!match) return;

    const { stepKey } = match;

    // Skip if already auto-completed in this session
    if (completedRef.current.has(stepKey)) return;
    completedRef.current.add(stepKey);

    // Fire-and-forget auto-complete (won't override manually skipped steps)
    completeStep.mutate({
      stepKey,
      companyId: activeCompanyId,
      autoCompleted: true,
    });
  }, [location, user, activeCompanyId, isLoading]);
}

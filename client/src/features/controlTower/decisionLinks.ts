import type { ControlTowerDomain } from "./domainNarrativeTypes";
import type { ExecutiveDecisionPrompt } from "./decisionPromptTypes";

const DOMAIN_HREF: Record<ControlTowerDomain, string> = {
  payroll: "/payroll",
  workforce: "/workforce/permits",
  contracts: "/contracts",
  hr: "/hr/leave",
  compliance: "/compliance",
  operations: "/operations",
  general: "/control-tower",
};

/**
 * Conservative deep-link for a decision prompt; falls back to Control Tower.
 */
export function getDecisionPromptHref(
  prompt: Pick<ExecutiveDecisionPrompt, "domain">,
  domain?: ControlTowerDomain | null,
): string | null {
  const d = (domain ?? prompt.domain) as ControlTowerDomain | undefined;
  if (!d) return "/control-tower";
  return DOMAIN_HREF[d] ?? "/control-tower";
}

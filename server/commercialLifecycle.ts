/**
 * Derived commercial lifecycle for CRM deals — server-side only, no persisted enum.
 * Uses quotations + contracts already linked to the deal.
 */

export type CommercialLifecyclePhase =
  | "lead_only"
  | "deal_open"
  | "quote_draft"
  | "quote_sent"
  | "quote_accepted"
  | "contract_pending_signature"
  | "contract_active"
  | "renewal_due"
  | "closed_lost"
  | "won_stalled_no_quote";

export type DealLifecycleSnapshot = {
  phase: CommercialLifecyclePhase;
  label: string;
  detail: string;
};

export type QuoteLite = {
  status: "draft" | "sent" | "accepted" | "declined" | "expired" | string;
  convertedToContractId: number | null;
};

export type ContractLite = {
  id: number;
  status: string;
  endDate: Date | null;
};

export type DealLite = {
  id: number;
  stage: string;
};

function contractNeedsSignature(status: string | undefined): boolean {
  return status === "pending_signature" || status === "pending_review" || status === "draft";
}

/** Single source of truth for deal + linked quotes + resolved contracts. */
export function deriveDealLifecycle(
  deal: DealLite,
  quotes: QuoteLite[],
  contractsById: Map<number, ContractLite>,
  now: Date = new Date(),
): DealLifecycleSnapshot {
  if (deal.stage === "closed_lost") {
    return {
      phase: "closed_lost",
      label: "Closed lost",
      detail: "Opportunity ended without a win.",
    };
  }

  if (deal.stage === "closed_won") {
    if (quotes.length === 0) {
      return {
        phase: "won_stalled_no_quote",
        label: "Won — no quotation linked",
        detail: "Link a quotation to this deal so contract and billing stay aligned.",
      };
    }
    const accepted = quotes.filter((q) => q.status === "accepted");
    const hasAcceptedNoContract = accepted.some((q) => q.convertedToContractId == null);
    if (hasAcceptedNoContract) {
      return {
        phase: "quote_accepted",
        label: "Accepted — needs contract",
        detail: "Convert the accepted quote or attach a signed agreement.",
      };
    }
    const convIds = accepted.map((q) => q.convertedToContractId).filter((x): x is number => x != null);
    for (const cid of convIds) {
      const c = contractsById.get(cid);
      if (c && contractNeedsSignature(c.status)) {
        return {
          phase: "contract_pending_signature",
          label: "Contract pending signature",
          detail: "Complete signatures before operational handoff.",
        };
      }
    }
    for (const cid of convIds) {
      const c = contractsById.get(cid);
      if (c && (c.status === "signed" || c.status === "active")) {
        const end = c.endDate ? new Date(c.endDate) : null;
        const in30 = new Date(now.getTime() + 30 * 86400000);
        if (end && end >= now && end <= in30) {
          return {
            phase: "renewal_due",
            label: "Renewal / expiry soon",
            detail: "Contract end date within 30 days — plan renewal or replacement.",
          };
        }
        return {
          phase: "contract_active",
          label: "Contract active",
          detail: "Agreement in place — monitor delivery and collections.",
        };
      }
    }
    return {
      phase: "quote_accepted",
      label: "Commercial follow-up",
      detail: "Review quotation and contract linkage.",
    };
  }

  if (quotes.some((q) => q.status === "draft")) {
    return {
      phase: "quote_draft",
      label: "Draft quotation",
      detail: "Finish and send the proposal.",
    };
  }
  if (quotes.some((q) => q.status === "sent")) {
    return {
      phase: "quote_sent",
      label: "Quotation sent",
      detail: "Awaiting client response.",
    };
  }
  const acceptedOpen = quotes.find((q) => q.status === "accepted");
  if (acceptedOpen) {
    if (acceptedOpen.convertedToContractId == null) {
      return {
        phase: "quote_accepted",
        label: "Accepted — needs contract",
        detail: "Create or convert to a contract.",
      };
    }
    const c = contractsById.get(acceptedOpen.convertedToContractId);
    if (c && contractNeedsSignature(c.status)) {
      return {
        phase: "contract_pending_signature",
        label: "Contract pending signature",
        detail: "Awaiting signatures.",
      };
    }
  }

  if (deal.stage === "lead") {
    return {
      phase: "lead_only",
      label: "Lead",
      detail: "Qualify and attach a quotation when ready.",
    };
  }
  return {
    phase: "deal_open",
    label: "Open opportunity",
    detail: "Progress the deal or create a quotation.",
  };
}

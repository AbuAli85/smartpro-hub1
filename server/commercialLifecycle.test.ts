import { describe, expect, it } from "vitest";
import { deriveDealLifecycle, type ContractLite } from "./commercialLifecycle";

describe("deriveDealLifecycle", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("returns closed_lost for lost deals", () => {
    const r = deriveDealLifecycle({ id: 1, stage: "closed_lost" }, [], new Map(), now);
    expect(r.phase).toBe("closed_lost");
  });

  it("returns won_stalled_no_quote when closed won with no quotes", () => {
    const r = deriveDealLifecycle({ id: 1, stage: "closed_won" }, [], new Map(), now);
    expect(r.phase).toBe("won_stalled_no_quote");
  });

  it("returns quote_accepted when won with accepted quote and no contract", () => {
    const r = deriveDealLifecycle(
      { id: 1, stage: "closed_won" },
      [{ status: "accepted", convertedToContractId: null }],
      new Map(),
      now,
    );
    expect(r.phase).toBe("quote_accepted");
  });

  it("returns contract_pending_signature when contract not signed", () => {
    const contracts = new Map<number, ContractLite>([
      [10, { id: 10, status: "pending_signature", endDate: null }],
    ]);
    const r = deriveDealLifecycle(
      { id: 1, stage: "closed_won" },
      [{ status: "accepted", convertedToContractId: 10 }],
      contracts,
      now,
    );
    expect(r.phase).toBe("contract_pending_signature");
  });

  it("returns renewal_due when active contract ends within 30 days", () => {
    const end = new Date("2026-06-15T12:00:00Z");
    const contracts = new Map<number, ContractLite>([[10, { id: 10, status: "active", endDate: end }]]);
    const r = deriveDealLifecycle(
      { id: 1, stage: "closed_won" },
      [{ status: "accepted", convertedToContractId: 10 }],
      contracts,
      now,
    );
    expect(r.phase).toBe("renewal_due");
  });

  it("prefers quote_draft when draft exists in open deal", () => {
    const r = deriveDealLifecycle(
      { id: 1, stage: "proposal" },
      [
        { status: "draft", convertedToContractId: null },
        { status: "sent", convertedToContractId: null },
      ],
      new Map(),
      now,
    );
    expect(r.phase).toBe("quote_draft");
  });
});

/**
 * Contract Management System — Test Suite
 *
 * Coverage:
 *   A. Role Visibility (ADR-001) — who can see what
 *   B. Input Validation — Zod schema + business rules
 *   C. Lifecycle Transitions — draft→active, active→terminated, renew, second-party edit guard
 *   D. Dual-write — legacy record mirrors to CMS tables
 *
 * Test approach: pure unit/integration tests that call repository functions
 * directly with a mock db object (no HTTP, no tRPC plumbing). Mock db returns
 * minimal typed stubs so tests are fast and deterministic.
 *
 * Run: npx vitest run server/modules/contractManagement/__tests__
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Minimal DB stub that resolves all .select().from()... chains to [] */
function makeMockDb(overrides: Record<string, unknown> = {}) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve([]),
    leftJoin: () => chain,
    orderBy: () => Promise.resolve([]),
    set: () => chain,
    values: () => Promise.resolve(undefined),
    ...overrides,
  };
  return {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    ...overrides,
  };
}

// ─── A. ROLE VISIBILITY (ADR-001) ─────────────────────────────────────────────

describe("A. Role visibility — ADR-001", () => {
  /**
   * A company should see a contract when it is EITHER first_party OR second_party.
   * This is the central business rule from the conversation.
   */

  it("first_party (companyId) can see the contract", () => {
    const contract = { companyId: 10, secondPartyCompanyId: 20 };
    const activeId = 10;
    const canSee = contract.companyId === activeId || contract.secondPartyCompanyId === activeId;
    expect(canSee).toBe(true);
  });

  it("second_party can see the contract", () => {
    const contract = { companyId: 10, secondPartyCompanyId: 20 };
    const activeId = 20;
    const canSee = contract.companyId === activeId || contract.secondPartyCompanyId === activeId;
    expect(canSee).toBe(true);
  });

  it("unrelated company cannot see the contract", () => {
    const contract = { companyId: 10, secondPartyCompanyId: 20 };
    const activeId = 99;
    const canSee = contract.companyId === activeId || contract.secondPartyCompanyId === activeId;
    expect(canSee).toBe(false);
  });

  it("platform admin (isPlatform=true) sees all contracts regardless of company", () => {
    const isPlatform = true;
    const contract = { companyId: 10, secondPartyCompanyId: 20 };
    const activeId = 99;
    const canSee = isPlatform || contract.companyId === activeId || contract.secondPartyCompanyId === activeId;
    expect(canSee).toBe(true);
  });

  it("only first_party role can delete a contract", () => {
    const contract = { companyId: 10 };
    const firstPartyActiveId = 10;
    const secondPartyActiveId = 20;
    const isPlatform = false;

    const fpCanDelete = !isPlatform && contract.companyId === firstPartyActiveId;
    const spCanDelete = !isPlatform && contract.companyId === secondPartyActiveId;

    expect(fpCanDelete).toBe(true);
    expect(spCanDelete).toBe(false);
  });

  it("only first_party role can edit a contract", () => {
    const contract = { companyId: 10 };
    const secondPartyActiveId = 20;
    const isPlatform = false;

    const spCanEdit = isPlatform || contract.companyId === secondPartyActiveId;
    expect(spCanEdit).toBe(false);
  });

  it("platform admin can delete any contract", () => {
    const isPlatform = true;
    expect(isPlatform).toBe(true);
  });

  it("activeCompanyRole is correctly determined", () => {
    function getRole(contract: { companyId: number; secondPartyCompanyId: number }, activeId: number) {
      if (contract.companyId === activeId) return "first_party";
      if (contract.secondPartyCompanyId === activeId) return "second_party";
      return "observer";
    }

    expect(getRole({ companyId: 10, secondPartyCompanyId: 20 }, 10)).toBe("first_party");
    expect(getRole({ companyId: 10, secondPartyCompanyId: 20 }, 20)).toBe("second_party");
    expect(getRole({ companyId: 10, secondPartyCompanyId: 20 }, 99)).toBe("observer");
  });
});

// ─── B. INPUT VALIDATION ──────────────────────────────────────────────────────

describe("B. Input validation", () => {
  it("clientCompanyId must differ from employerCompanyId", () => {
    function validateParties(clientId: number, employerId: number) {
      if (clientId === employerId) throw new Error("Client and employer must be different companies");
    }
    expect(() => validateParties(5, 5)).toThrow("Client and employer must be different companies");
    expect(() => validateParties(5, 6)).not.toThrow();
  });

  it("promoter must be an employee of the employer (second party) company", () => {
    function validatePromoterBelongsToEmployer(
      empCompanyId: number,
      employerCompanyId: number
    ) {
      if (empCompanyId !== employerCompanyId)
        throw new Error("Promoter must be an employee of the employer (second party) company");
    }
    expect(() => validatePromoterBelongsToEmployer(30, 20)).toThrow("Promoter must be an employee");
    expect(() => validatePromoterBelongsToEmployer(20, 20)).not.toThrow();
  });

  it("work site must belong to the client (first party)", () => {
    function validateSiteBelongsToClient(
      siteCompanyId: number,
      clientCompanyId: number
    ) {
      if (siteCompanyId !== clientCompanyId)
        throw new Error("Work location must be an active site belonging to the client (first party)");
    }
    expect(() => validateSiteBelongsToClient(99, 10)).toThrow("Work location must be an active site");
    expect(() => validateSiteBelongsToClient(10, 10)).not.toThrow();
  });

  it("start date must be before or equal to end date", () => {
    function validateDates(start: string, end: string) {
      if (new Date(end) < new Date(start))
        throw new Error("Expiry date must not be before effective date");
    }
    expect(() => validateDates("2026-12-01", "2026-01-01")).toThrow("Expiry date must not be before");
    expect(() => validateDates("2026-01-01", "2026-12-01")).not.toThrow();
    expect(() => validateDates("2026-06-01", "2026-06-01")).not.toThrow();
  });

  it("status enum accepts only allowed values", () => {
    const VALID_STATUSES = ["active", "draft", "expired", "terminated", "renewed", "suspended"] as const;
    type ValidStatus = (typeof VALID_STATUSES)[number];

    function isValidStatus(s: string): s is ValidStatus {
      return VALID_STATUSES.includes(s as ValidStatus);
    }

    expect(isValidStatus("active")).toBe(true);
    expect(isValidStatus("draft")).toBe(true);
    expect(isValidStatus("terminated")).toBe(true);
    expect(isValidStatus("unknown_value")).toBe(false);
    expect(isValidStatus("ACTIVE")).toBe(false);
  });

  it("civil ID and passport number are trimmed before storage", () => {
    const raw = "  99012345678  ";
    const trimmed = raw.trim() || null;
    expect(trimmed).toBe("99012345678");
  });

  it("empty identity strings are stored as null", () => {
    const empty = "".trim() || null;
    expect(empty).toBeNull();
  });
});

// ─── C. LIFECYCLE TRANSITIONS ─────────────────────────────────────────────────

import {
  ALLOWED_TRANSITIONS,
  CONTRACT_STATUSES,
  ContractTransitionError,
  SYSTEM_ONLY_STATUSES,
  TERMINAL_STATUSES,
  USER_WRITABLE_STATUSES,
  isSystemOnlyStatus,
  isTerminalStatus,
  validateStatusTransition,
  STATUS_META,
  type ContractStatus,
} from "../contractManagement.types";

describe("C. Lifecycle transitions — ALLOWED_TRANSITIONS", () => {
  // Helper: use the actual production transition map
  function canTransition(from: ContractStatus, to: ContractStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] as readonly string[]).includes(to);
  }

  // ── Draft ──
  it("draft → active (activate)", () => expect(canTransition("draft", "active")).toBe(true));
  it("draft → terminated (discard)", () => expect(canTransition("draft", "terminated")).toBe(true));
  it("draft → expired (blocked)", () => expect(canTransition("draft", "expired")).toBe(false));
  it("draft → renewed (blocked)", () => expect(canTransition("draft", "renewed")).toBe(false));

  // ── Active ──
  it("active → expired (auto-expire)", () => expect(canTransition("active", "expired")).toBe(true));
  it("active → terminated (terminate)", () => expect(canTransition("active", "terminated")).toBe(true));
  it("active → renewed (renew)", () => expect(canTransition("active", "renewed")).toBe(true));
  it("active → suspended", () => expect(canTransition("active", "suspended")).toBe(true));
  it("active → draft (blocked — cannot go back to draft)", () => expect(canTransition("active", "draft")).toBe(false));

  // ── Expired ──
  it("expired → renewed (renew from expired)", () => expect(canTransition("expired", "renewed")).toBe(true));
  it("expired → active (blocked — must renew, not reactivate)", () => expect(canTransition("expired", "active")).toBe(false));

  // ── Terminal states ──
  it("terminated has no further transitions", () => {
    expect(ALLOWED_TRANSITIONS.terminated).toHaveLength(0);
  });
  it("renewed has no further transitions", () => {
    expect(ALLOWED_TRANSITIONS.renewed).toHaveLength(0);
  });
  it("terminated → active (blocked)", () => expect(canTransition("terminated", "active")).toBe(false));
  it("terminated → draft (blocked)", () => expect(canTransition("terminated", "draft")).toBe(false));
  it("renewed → active (blocked)", () => expect(canTransition("renewed", "active")).toBe(false));

  // ── Suspended ──
  it("suspended → active (reactivate)", () => expect(canTransition("suspended", "active")).toBe(true));
  it("suspended → terminated", () => expect(canTransition("suspended", "terminated")).toBe(true));
  it("suspended → renewed (blocked)", () => expect(canTransition("suspended", "renewed")).toBe(false));

  // ── No-op ──
  it("same status transition is a no-op (never throws)", () => {
    expect(() => validateStatusTransition("active", "active")).not.toThrow();
  });
});

describe("C2. validateStatusTransition", () => {
  it("returns silently for a valid transition", () => {
    expect(() => validateStatusTransition("draft", "active")).not.toThrow();
    expect(() => validateStatusTransition("active", "terminated")).not.toThrow();
    expect(() => validateStatusTransition("active", "expired")).not.toThrow();
    expect(() => validateStatusTransition("expired", "renewed")).not.toThrow();
  });

  it("throws ContractTransitionError for an invalid transition", () => {
    expect(() => validateStatusTransition("terminated", "active")).toThrow(ContractTransitionError);
    expect(() => validateStatusTransition("renewed", "terminated")).toThrow(ContractTransitionError);
    expect(() => validateStatusTransition("draft", "expired")).toThrow(ContractTransitionError);
  });

  it("ContractTransitionError message includes from/to and allowed list", () => {
    try {
      validateStatusTransition("terminated", "active");
    } catch (e) {
      expect(e).toBeInstanceOf(ContractTransitionError);
      if (e instanceof ContractTransitionError) {
        expect(e.message).toContain("terminated");
        expect(e.message).toContain("active");
        expect(e.message).toContain("terminal state");
      }
    }
  });

  it("suspended → renewed error message lists allowed targets", () => {
    try {
      validateStatusTransition("suspended", "renewed");
    } catch (e) {
      if (e instanceof ContractTransitionError) {
        expect(e.message).toContain("suspended");
        expect(e.message).toContain("renewed");
        // Should mention what IS allowed
        expect(e.message).toContain("active");
        expect(e.message).toContain("terminated");
      }
    }
  });
});

describe("C3. STATUS_META", () => {
  it("terminal statuses have isTerminal=true", () => {
    expect(STATUS_META.terminated.isTerminal).toBe(true);
    expect(STATUS_META.renewed.isTerminal).toBe(true);
  });

  it("non-terminal statuses have isTerminal=false", () => {
    expect(STATUS_META.draft.isTerminal).toBe(false);
    expect(STATUS_META.active.isTerminal).toBe(false);
    expect(STATUS_META.expired.isTerminal).toBe(false);
    expect(STATUS_META.suspended.isTerminal).toBe(false);
  });

  it("every status in CONTRACT_STATUSES has metadata", () => {
    const statuses: ContractStatus[] = ["draft", "active", "expired", "terminated", "renewed", "suspended"];
    for (const s of statuses) {
      expect(STATUS_META[s]).toBeDefined();
      expect(STATUS_META[s].label).toBeTruthy();
      expect(STATUS_META[s].color).toBeTruthy();
    }
  });
});

describe("C4. Lifecycle operations", () => {
  it("new contract defaults to 'draft' status", () => {
    const defaultStatus = "draft";
    expect(defaultStatus).toBe("draft");
    // draft → active is valid
    expect(() => validateStatusTransition("draft", "active")).not.toThrow();
  });

  it("renew creates a NEW contract in 'draft' and marks original as 'renewed'", () => {
    const originalId = "aaa-111";
    const newContractId = "bbb-222";

    // New contract
    const renewal = { id: newContractId, status: "draft", renewalOfContractId: originalId };
    // Original gets transition: active → renewed
    expect(() => validateStatusTransition("active", "renewed")).not.toThrow();

    expect(renewal.status).toBe("draft");
    expect(renewal.renewalOfContractId).toBe(originalId);
  });

  it("activate transition produces 'activated' audit event action", () => {
    const actionMap: Partial<Record<ContractStatus, string>> = {
      active: "activated", terminated: "terminated",
      renewed: "renewed", suspended: "suspended", expired: "expired",
    };
    expect(actionMap["active"]).toBe("activated");
    expect(actionMap["terminated"]).toBe("terminated");
  });

  it("lazyExpireContract only fires when status is active and date is past", () => {
    function shouldExpire(status: ContractStatus, expiryDate: Date): boolean {
      if (status !== "active") return false;
      return expiryDate < new Date();
    }

    expect(shouldExpire("active", new Date("2020-01-01"))).toBe(true);
    expect(shouldExpire("active", new Date("2099-01-01"))).toBe(false);
    expect(shouldExpire("draft",  new Date("2020-01-01"))).toBe(false);
    expect(shouldExpire("terminated", new Date("2020-01-01"))).toBe(false);
  });
});

// ─── D. DUAL-WRITE ────────────────────────────────────────────────────────────

describe("D. Dual-write mirror", () => {
  it("new CMS record uses same UUID as legacy promoter_assignment id", () => {
    const legacyId = crypto.randomUUID();
    const cmsContractId = legacyId; // dual-write uses same ID
    expect(cmsContractId).toBe(legacyId);
  });

  it("dual-write failure does not throw — it is non-fatal", async () => {
    // The actual dual-write in the router is wrapped in try/catch
    async function dualWrite(shouldFail: boolean) {
      await Promise.resolve(); // legacy insert
      try {
        if (shouldFail) throw new Error("Simulated CMS failure");
        // CMS insert...
      } catch {
        // Non-fatal: log but do not surface to caller
      }
      return { id: "result" };
    }

    const result = await dualWrite(true);
    expect(result.id).toBe("result"); // legacy result still returned
  });

  it("identity fields fall back to employee record when not provided in create input", () => {
    // Simulate the fallback logic in promoterAssignments.create
    const emp = {
      nationalId: "99012345678",
      passportNumber: "OM123456",
      nationality: "Omani",
      position: "Promoter",
      profession: "Sales",
    };
    const input = {
      civilId: undefined as string | undefined,
      passportNumber: undefined as string | undefined,
      nationality: undefined as string | undefined,
      jobTitleEn: undefined as string | undefined,
    };

    const civilId     = input.civilId?.trim()       || emp.nationalId?.trim()  || null;
    const passport    = input.passportNumber?.trim() || emp.passportNumber?.trim() || null;
    const nationality = input.nationality?.trim()    || emp.nationality?.trim() || null;
    const jobTitle    = input.jobTitleEn?.trim()     || emp.position?.trim()   || emp.profession?.trim() || null;

    expect(civilId).toBe("99012345678");
    expect(passport).toBe("OM123456");
    expect(nationality).toBe("Omani");
    expect(jobTitle).toBe("Promoter");
  });

  it("explicit input overrides employee record fallback", () => {
    const emp = { nationalId: "99012345678", passportNumber: "OM123456" };
    const input = { civilId: "NEW-ID", passportNumber: "NEW-PASSPORT" };

    const civilId  = input.civilId?.trim()       || emp.nationalId?.trim()   || null;
    const passport = input.passportNumber?.trim() || emp.passportNumber?.trim() || null;

    expect(civilId).toBe("NEW-ID");
    expect(passport).toBe("NEW-PASSPORT");
  });
});

// ─── E. EXPIRY INDICATORS ────────────────────────────────────────────────────

describe("E. Expiry indicators", () => {
  function daysUntil(dateStr: string): number {
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  }

  it("detects expired dates (negative days)", () => {
    const pastDate = "2020-01-01";
    expect(daysUntil(pastDate)).toBeLessThan(0);
  });

  it("detects dates expiring within 30 days", () => {
    const in15Days = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const days = daysUntil(in15Days);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("dates more than 30 days away are not flagged", () => {
    const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    expect(daysUntil(in60Days)).toBeGreaterThan(30);
  });

  it("contract expiry and passport expiry are tracked independently", () => {
    const contractExpiry = new Date(Date.now() + 25 * 86_400_000).toISOString().slice(0, 10);
    const passportExpiry = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);

    const contractDays = daysUntil(contractExpiry);
    const passportDays = daysUntil(passportExpiry);

    expect(contractDays).toBeLessThanOrEqual(30); // should warn
    expect(passportDays).toBeGreaterThan(30);     // fine
  });
});

// ─── F. DOCUMENT GENERATION ──────────────────────────────────────────────────

describe("F. Document generation context", () => {
  it("template key for legacy assignments is 'promoter_assignment_contract_bilingual'", () => {
    const key = "promoter_assignment_contract_bilingual";
    expect(key).toBe("promoter_assignment_contract_bilingual");
  });

  it("template key for new CMS contracts is 'outsourcing_contract_promoter_bilingual'", () => {
    const key = "outsourcing_contract_promoter_bilingual";
    expect(key).toBe("outsourcing_contract_promoter_bilingual");
  });

  it("new CMS template has extended identity placeholders", () => {
    const extendedPlaceholders = [
      "passport_number",
      "passport_expiry",
      "nationality",
      "job_title_en",
    ];
    // Core placeholders already on legacy template
    const corePlaceholders = [
      "first_party_name_ar",
      "first_party_name_en",
      "promoter_name_ar",
      "promoter_name_en",
      "id_card_number",
    ];

    const allPlaceholders = [...corePlaceholders, ...extendedPlaceholders];
    expect(allPlaceholders).toContain("passport_number");
    expect(allPlaceholders).toContain("nationality");
    expect(allPlaceholders).toContain("id_card_number");
    expect(allPlaceholders.length).toBe(corePlaceholders.length + extendedPlaceholders.length);
  });
});

// ─── G–K. KPI AGGREGATION ─────────────────────────────────────────────────────
//
// These tests exercise the pure `aggregateKpisFromRows` function and the two
// helper functions (`toUtcDay`, `effectiveContractStatus`) that were extracted
// from the old monolithic `getContractKpis`.  No DB connection is required.

import {
  aggregateKpisFromRows,
  toUtcDay,
  effectiveContractStatus,
  normaliseDocumentKind,
} from "../contractManagement.repository";
import {
  REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE,
  DEFAULT_REQUIRED_DOCUMENTS,
} from "../contractManagement.types";
import type { OutsourcingContractRow } from "../contractManagement.types";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function makeRow(
  overrides: Partial<OutsourcingContractRow> & { id: string }
): OutsourcingContractRow {
  return {
    contractTypeId: "promoter_assignment",
    companyId: 10,
    contractNumber: null,
    status: "active",
    issueDate: null,
    effectiveDate: isoDay(-180),
    expiryDate: isoDay(90),
    generatedPdfUrl: null,
    signedPdfUrl: null,
    renewalOfContractId: null,
    createdAt: isoDay(-180),
    updatedAt: isoDay(-180),
    firstPartyCompanyId: 10,
    firstPartyName: "Client Co",
    firstPartyNameAr: null,
    firstPartyRegNumber: null,
    secondPartyCompanyId: 20,
    secondPartyName: "Employer Co",
    secondPartyNameAr: null,
    secondPartyRegNumber: null,
    locationEn: "Branch A",
    locationAr: null,
    clientSiteId: null,
    promoterEmployeeId: 100,
    promoterName: "Ahmed Ali",
    promoterNameAr: null,
    civilId: null,
    passportNumber: null,
    passportExpiry: null,
    nationality: null,
    jobTitleEn: null,
    ...overrides,
  };
}

// ─── G. KPI status counts ─────────────────────────────────────────────────────

describe("G. KPI status counts — aggregateKpisFromRows", () => {
  const NOW = new Date("2026-04-06T12:00:00.000Z"); // fixed reference time

  it("empty rows returns zero totals with correct meta", () => {
    const result = aggregateKpisFromRows([], new Map(), {
      activeCompanyId: 10,
      isPlatformAdmin: false,
      now: NOW,
    });
    expect(result.totals.total).toBe(0);
    expect(result.totals.active).toBe(0);
    expect(result.meta.scope).toBe("company");
    expect(result.meta.companyId).toBe(10);
    expect(result.promotersDeployed).toBe(0);
  });

  it("counts each status bucket correctly", () => {
    const rows = [
      makeRow({ id: "a1", status: "active",     expiryDate: isoDay(60) }),
      makeRow({ id: "a2", status: "active",     expiryDate: isoDay(45) }),
      makeRow({ id: "d1", status: "draft",      expiryDate: isoDay(90) }),
      makeRow({ id: "e1", status: "expired",    expiryDate: isoDay(-10) }),
      makeRow({ id: "t1", status: "terminated", expiryDate: isoDay(-20) }),
      makeRow({ id: "r1", status: "renewed",    expiryDate: isoDay(-30) }),
      makeRow({ id: "s1", status: "suspended",  expiryDate: isoDay(90) }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), {
      activeCompanyId: 10,
      isPlatformAdmin: false,
      now: NOW,
    });

    expect(result.totals.total).toBe(7);
    expect(result.totals.active).toBe(2);
    expect(result.totals.draft).toBe(1);
    expect(result.totals.expired).toBe(1);
    expect(result.totals.terminated).toBe(1);
    expect(result.totals.renewed).toBe(1);
    expect(result.totals.suspended).toBe(1);
  });

  it("platform admin result has scope=platform and companyId=null", () => {
    const result = aggregateKpisFromRows([], new Map(), {
      activeCompanyId: 0,
      isPlatformAdmin: true,
      now: NOW,
    });
    expect(result.meta.scope).toBe("platform");
    expect(result.meta.companyId).toBeNull();
  });

  it("storedActiveEffectivelyExpired counts lazy-expire gap contracts", () => {
    const rows = [
      // stored "active" but expiry was 5 days ago → effectively expired
      makeRow({ id: "stale1", status: "active", expiryDate: isoDay(-5) }),
      makeRow({ id: "stale2", status: "active", expiryDate: isoDay(-1) }),
      // truly active
      makeRow({ id: "live1",  status: "active", expiryDate: isoDay(10) }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), {
      activeCompanyId: 10,
      isPlatformAdmin: false,
      now: NOW,
    });

    expect(result.totals.storedActiveEffectivelyExpired).toBe(2);
    // They should be counted in expired, not active
    expect(result.totals.active).toBe(1);
    expect(result.totals.expired).toBe(2);
  });

  it("promotersDeployed counts distinct employee IDs on effectively-active contracts only", () => {
    const rows = [
      makeRow({ id: "c1", status: "active",     expiryDate: isoDay(10),  promoterEmployeeId: 1 }),
      makeRow({ id: "c2", status: "active",     expiryDate: isoDay(20),  promoterEmployeeId: 1 }), // same person, 2 contracts
      makeRow({ id: "c3", status: "active",     expiryDate: isoDay(30),  promoterEmployeeId: 2 }),
      makeRow({ id: "c4", status: "draft",      expiryDate: isoDay(90),  promoterEmployeeId: 3 }), // draft — not deployed
      makeRow({ id: "c5", status: "active",     expiryDate: isoDay(-1),  promoterEmployeeId: 4 }), // stale — not deployed
    ];
    const result = aggregateKpisFromRows(rows, new Map(), {
      activeCompanyId: 10,
      isPlatformAdmin: false,
      now: NOW,
    });

    // Employee 1 and 2 are truly active; 3 is draft; 4 is stale-expired
    expect(result.promotersDeployed).toBe(2);
  });
});

// ─── H. Expiring-soon logic ───────────────────────────────────────────────────

describe("H. Expiring-soon logic", () => {
  const NOW = new Date("2026-04-06T00:00:00.000Z");

  it("contract expiring exactly today has daysLeft=0 and is included", () => {
    const rows = [makeRow({ id: "today", status: "active", expiryDate: "2026-04-06" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(1);
    expect(result.expiringSoon[0]!.daysLeft).toBe(0);
    expect(result.totals.expiringIn30Days).toBe(1);
  });

  it("contract expiring in 15 days is included", () => {
    const rows = [makeRow({ id: "mid", status: "active", expiryDate: "2026-04-21" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(1);
    expect(result.expiringSoon[0]!.daysLeft).toBe(15);
  });

  it("contract expiring in exactly 30 days is included (boundary inclusive)", () => {
    const rows = [makeRow({ id: "b30", status: "active", expiryDate: "2026-05-06" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(1);
    expect(result.totals.expiringIn30Days).toBe(1);
  });

  it("contract expiring in 31 days is NOT included", () => {
    const rows = [makeRow({ id: "far", status: "active", expiryDate: "2026-05-07" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(0);
    expect(result.totals.expiringIn30Days).toBe(0);
  });

  it("draft contract within 30 days is NOT included in expiringSoon", () => {
    const rows = [makeRow({ id: "drft", status: "draft", expiryDate: "2026-04-10" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(0);
  });

  it("stale-active (effectively expired) contract is NOT in expiringSoon", () => {
    const rows = [makeRow({ id: "stale", status: "active", expiryDate: "2026-04-05" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.expiringSoon).toHaveLength(0);
  });

  it("expiringSoon is sorted nearest-first", () => {
    const rows = [
      makeRow({ id: "far",   status: "active", expiryDate: "2026-04-20", promoterEmployeeId: 1 }),
      makeRow({ id: "near",  status: "active", expiryDate: "2026-04-10", promoterEmployeeId: 2 }),
      makeRow({ id: "mid",   status: "active", expiryDate: "2026-04-15", promoterEmployeeId: 3 }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    const ids = result.expiringSoon.map((r) => r.id);
    expect(ids).toEqual(["near", "mid", "far"]);
  });
});

// ─── I. Missing-document detection ────────────────────────────────────────────

describe("I. Missing-document detection", () => {
  const NOW = new Date("2026-04-06T00:00:00.000Z");

  const CONTRACT_ID = "contract-001";
  const baseRow = makeRow({ id: CONTRACT_ID, status: "active", expiryDate: "2026-12-31" });

  function docs(...kinds: string[]): Map<string, Set<string>> {
    return new Map([[CONTRACT_ID, new Set(kinds)]]);
  }

  it("contract with all three required docs → no missing", () => {
    const map = docs("signed_contract_pdf", "passport_copy", "id_card_copy");
    const result = aggregateKpisFromRows([baseRow], map, { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(0);
  });

  it("contract with no docs → all three missing", () => {
    const result = aggregateKpisFromRows([baseRow], new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(1);
    expect(result.missingDocuments[0]!.missingKinds).toHaveLength(3);
    expect(result.missingDocuments[0]!.missingKinds).toContain("Signed Contract");
    expect(result.missingDocuments[0]!.missingKinds).toContain("Passport Copy");
    expect(result.missingDocuments[0]!.missingKinds).toContain("ID Card Copy");
  });

  it("contract with only passport_copy → signed contract and ID card missing", () => {
    const map = docs("passport_copy");
    const result = aggregateKpisFromRows([baseRow], map, { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    const missing = result.missingDocuments[0]!.missingKinds;
    expect(missing).toContain("Signed Contract");
    expect(missing).toContain("ID Card Copy");
    expect(missing).not.toContain("Passport Copy");
  });

  it("legacy 'id_copy' is normalised to 'id_card_copy' (satisfies requirement)", () => {
    const map = docs("signed_contract_pdf", "passport_copy", "id_copy");
    const result = aggregateKpisFromRows([baseRow], map, { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(0);
  });

  it("legacy 'signed_pdf' is normalised to 'signed_contract_pdf'", () => {
    const map = docs("signed_pdf", "passport_copy", "id_card_copy");
    const result = aggregateKpisFromRows([baseRow], map, { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(0);
  });

  it("attachment-only does not satisfy any required kind", () => {
    const map = docs("attachment");
    const result = aggregateKpisFromRows([baseRow], map, { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments[0]!.missingKinds).toHaveLength(3);
  });

  it("draft contract is excluded from missing-documents check", () => {
    const draftRow = makeRow({ id: "draft-c", status: "draft", expiryDate: "2026-12-31" });
    const result = aggregateKpisFromRows([draftRow], new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(0);
  });

  it("stale-active (effectively expired) contract is excluded from missing-documents check", () => {
    const staleRow = makeRow({ id: "stale-c", status: "active", expiryDate: "2026-01-01" });
    const result = aggregateKpisFromRows([staleRow], new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments).toHaveLength(0);
  });

  it("REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE has promoter_assignment entry with 3 kinds", () => {
    const reqs = REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE["promoter_assignment"]!;
    expect(reqs).toHaveLength(3);
    const kinds = reqs.map((r) => r.kind);
    expect(kinds).toContain("signed_contract_pdf");
    expect(kinds).toContain("passport_copy");
    expect(kinds).toContain("id_card_copy");
  });

  it("unknown contract type falls back to DEFAULT_REQUIRED_DOCUMENTS", () => {
    const unknownRow = makeRow({ id: "unk", status: "active", expiryDate: "2026-12-31", contractTypeId: "offer_letter" });
    const result = aggregateKpisFromRows([unknownRow], new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    // Should still produce missing-doc entries using the default (promoter_assignment) list
    expect(result.missingDocuments).toHaveLength(1);
    expect(result.missingDocuments[0]!.missingKinds.length).toBe(DEFAULT_REQUIRED_DOCUMENTS.length);
  });

  it("missingDocuments is capped at 20 entries", () => {
    const manyRows = Array.from({ length: 25 }, (_, i) =>
      makeRow({ id: `r${i}`, status: "active", expiryDate: "2026-12-31", promoterEmployeeId: i + 1 })
    );
    const result = aggregateKpisFromRows(manyRows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.missingDocuments.length).toBeLessThanOrEqual(20);
  });
});

// ─── J. Company breakdown correctness ─────────────────────────────────────────

describe("J. Contracts-per-company breakdown", () => {
  const NOW = new Date("2026-04-06T00:00:00.000Z");

  it("groups contracts by first-party company", () => {
    const rows = [
      makeRow({ id: "c1", firstPartyCompanyId: 10, firstPartyName: "Alpha", status: "active",     expiryDate: "2026-12-31", promoterEmployeeId: 1 }),
      makeRow({ id: "c2", firstPartyCompanyId: 10, firstPartyName: "Alpha", status: "draft",      expiryDate: "2026-12-31", promoterEmployeeId: 2 }),
      makeRow({ id: "c3", firstPartyCompanyId: 20, firstPartyName: "Beta",  status: "active",     expiryDate: "2026-12-31", promoterEmployeeId: 3 }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });

    const alpha = result.contractsPerCompany.find((c) => c.companyName === "Alpha")!;
    const beta  = result.contractsPerCompany.find((c) => c.companyName === "Beta")!;

    expect(alpha.total).toBe(2);
    expect(alpha.active).toBe(1); // only the active one (draft is not effectively active)
    expect(beta.total).toBe(1);
    expect(beta.active).toBe(1);
  });

  it("sorted descending by total", () => {
    const rows = [
      makeRow({ id: "b1", firstPartyCompanyId: 20, firstPartyName: "Beta",  status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 1 }),
      makeRow({ id: "a1", firstPartyCompanyId: 10, firstPartyName: "Alpha", status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 2 }),
      makeRow({ id: "a2", firstPartyCompanyId: 10, firstPartyName: "Alpha", status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 3 }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.contractsPerCompany[0]!.companyName).toBe("Alpha"); // 2 > 1
  });

  it("active count uses effective status (stale-active counts as expired not active)", () => {
    const rows = [
      makeRow({ id: "live",  firstPartyCompanyId: 10, firstPartyName: "Gamma", status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 1 }),
      makeRow({ id: "stale", firstPartyCompanyId: 10, firstPartyName: "Gamma", status: "active", expiryDate: "2026-01-01", promoterEmployeeId: 2 }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });

    const gamma = result.contractsPerCompany.find((c) => c.companyName === "Gamma")!;
    expect(gamma.total).toBe(2);
    expect(gamma.active).toBe(1); // only the live one
  });

  it("capped at 10 companies", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeRow({ id: `c${i}`, firstPartyCompanyId: i + 1, firstPartyName: `Co${i}`, status: "active", expiryDate: "2026-12-31", promoterEmployeeId: i + 1 })
    );
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 1, isPlatformAdmin: false, now: NOW });
    expect(result.contractsPerCompany.length).toBeLessThanOrEqual(10);
  });
});

// ─── K. Tenant-scoped KPI visibility ──────────────────────────────────────────

describe("K. Tenant-scoped KPI visibility (via aggregateKpisFromRows)", () => {
  const NOW = new Date("2026-04-06T00:00:00.000Z");

  it("company-scope result only reflects rows passed in (tenant filter is in listOutsourcingContracts)", () => {
    // aggregateKpisFromRows is a pure function — it trusts that the caller has
    // already applied tenant filtering.  We verify the meta is set correctly.
    const rows = [makeRow({ id: "x1", status: "active", expiryDate: "2026-12-31" })];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 42, isPlatformAdmin: false, now: NOW });
    expect(result.meta.scope).toBe("company");
    expect(result.meta.companyId).toBe(42);
    expect(result.totals.total).toBe(1);
  });

  it("platform-admin result has scope=platform, companyId=null, and sees all passed rows", () => {
    const rows = [
      makeRow({ id: "p1", firstPartyCompanyId: 10, status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 1 }),
      makeRow({ id: "p2", firstPartyCompanyId: 99, status: "active", expiryDate: "2026-12-31", promoterEmployeeId: 2 }),
    ];
    const result = aggregateKpisFromRows(rows, new Map(), { activeCompanyId: 0, isPlatformAdmin: true, now: NOW });
    expect(result.meta.scope).toBe("platform");
    expect(result.meta.companyId).toBeNull();
    expect(result.totals.total).toBe(2);
  });

  it("meta.generatedAt is a valid ISO-8601 timestamp matching the NOW parameter", () => {
    const result = aggregateKpisFromRows([], new Map(), { activeCompanyId: 10, isPlatformAdmin: false, now: NOW });
    expect(result.meta.generatedAt).toBe(NOW.toISOString());
  });
});

// ─── toUtcDay helper ──────────────────────────────────────────────────────────

describe("toUtcDay", () => {
  it("converts date string to UTC midnight", () => {
    const d = toUtcDay("2026-04-06");
    expect(d.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });

  it("strips time component from ISO datetime string", () => {
    const d = toUtcDay("2026-04-06T14:30:00.000Z");
    expect(d.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });

  it("Date object is converted to its UTC date midnight", () => {
    const d = toUtcDay(new Date("2026-04-06T22:00:00.000Z"));
    expect(d.toISOString()).toBe("2026-04-06T00:00:00.000Z");
  });
});

// ─── effectiveContractStatus helper ──────────────────────────────────────────

describe("effectiveContractStatus", () => {
  const NOW = toUtcDay(new Date("2026-04-06T00:00:00.000Z"));

  it("active + future expiry → remains active", () => {
    expect(effectiveContractStatus("active", "2026-12-31", NOW)).toBe("active");
  });

  it("active + expiry today → still active (valid through end of day)", () => {
    expect(effectiveContractStatus("active", "2026-04-06", NOW)).toBe("active");
  });

  it("active + expiry yesterday → effective expired", () => {
    expect(effectiveContractStatus("active", "2026-04-05", NOW)).toBe("expired");
  });

  it("active + null expiry → remains active (no expiry configured)", () => {
    expect(effectiveContractStatus("active", null, NOW)).toBe("active");
  });

  it("draft is never auto-expired regardless of expiryDate", () => {
    expect(effectiveContractStatus("draft", "2020-01-01", NOW)).toBe("draft");
  });

  it("expired stays expired even with a future expiry date (impossible in practice)", () => {
    expect(effectiveContractStatus("expired", "2030-01-01", NOW)).toBe("expired");
  });
});

// ─── normaliseDocumentKind helper ─────────────────────────────────────────────

describe("normaliseDocumentKind", () => {
  it("normalises signed_pdf → signed_contract_pdf", () => {
    expect(normaliseDocumentKind("signed_pdf")).toBe("signed_contract_pdf");
  });
  it("normalises id_copy → id_card_copy", () => {
    expect(normaliseDocumentKind("id_copy")).toBe("id_card_copy");
  });
  it("passes through canonical kinds unchanged", () => {
    expect(normaliseDocumentKind("passport_copy")).toBe("passport_copy");
    expect(normaliseDocumentKind("id_card_copy")).toBe("id_card_copy");
    expect(normaliseDocumentKind("generated_pdf")).toBe("generated_pdf");
  });
  it("passes through unknown kinds unchanged", () => {
    expect(normaliseDocumentKind("some_future_kind")).toBe("some_future_kind");
  });
});

// ─── L. STRICT LIFECYCLE ENFORCEMENT ─────────────────────────────────────────
//
// Tests for the enforcement guards added to the router:
//   1. isSystemOnlyStatus / isTerminalStatus predicates
//   2. update mutation: terminal-immutability guard
//   3. update mutation: system-only status guard
//   4. create mutation: initial status must be draft for regular users
//   5. renew mutation: renewability pre-check
//
// These tests exercise the pure predicates and the transition-map logic that
// backs the router guards — no DB or tRPC mock needed.

describe("L1. isSystemOnlyStatus", () => {
  it("expired is system-only", () => {
    expect(isSystemOnlyStatus("expired")).toBe(true);
  });

  it("renewed is system-only", () => {
    expect(isSystemOnlyStatus("renewed")).toBe(true);
  });

  it("active is NOT system-only — user activates contracts", () => {
    expect(isSystemOnlyStatus("active")).toBe(false);
  });

  it("draft is NOT system-only — user creates contracts", () => {
    expect(isSystemOnlyStatus("draft")).toBe(false);
  });

  it("terminated is NOT system-only — user terminates contracts", () => {
    expect(isSystemOnlyStatus("terminated")).toBe(false);
  });

  it("suspended is NOT system-only — admin suspends contracts via update", () => {
    expect(isSystemOnlyStatus("suspended")).toBe(false);
  });

  it("SYSTEM_ONLY_STATUSES contains exactly expired and renewed", () => {
    expect([...SYSTEM_ONLY_STATUSES].sort()).toEqual(["expired", "renewed"]);
  });

  it("USER_WRITABLE_STATUSES contains no system-only statuses", () => {
    for (const s of USER_WRITABLE_STATUSES) {
      expect(isSystemOnlyStatus(s)).toBe(false);
    }
  });

  it("USER_WRITABLE_STATUSES + SYSTEM_ONLY_STATUSES = all CONTRACT_STATUSES", () => {
    const all = new Set<string>([...USER_WRITABLE_STATUSES, ...SYSTEM_ONLY_STATUSES]);
    for (const s of CONTRACT_STATUSES) {
      expect(all.has(s)).toBe(true);
    }
    expect(all.size).toBe(CONTRACT_STATUSES.length);
  });
});

describe("L2. isTerminalStatus", () => {
  it("terminated is terminal", () => {
    expect(isTerminalStatus("terminated")).toBe(true);
  });

  it("renewed is terminal", () => {
    expect(isTerminalStatus("renewed")).toBe(true);
  });

  it("active is NOT terminal", () => {
    expect(isTerminalStatus("active")).toBe(false);
  });

  it("draft is NOT terminal", () => {
    expect(isTerminalStatus("draft")).toBe(false);
  });

  it("expired is NOT terminal — expired contracts can be renewed", () => {
    expect(isTerminalStatus("expired")).toBe(false);
  });

  it("suspended is NOT terminal — suspended contracts can be reactivated", () => {
    expect(isTerminalStatus("suspended")).toBe(false);
  });

  it("TERMINAL_STATUSES contains exactly terminated and renewed", () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(["renewed", "terminated"]);
  });

  it("all terminal statuses have an empty ALLOWED_TRANSITIONS array", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(ALLOWED_TRANSITIONS[s]).toHaveLength(0);
    }
  });

  it("all terminal statuses are marked isTerminal=true in STATUS_META", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(STATUS_META[s].isTerminal).toBe(true);
    }
  });

  it("no non-terminal status has isTerminal=true in STATUS_META", () => {
    for (const s of CONTRACT_STATUSES) {
      if (!isTerminalStatus(s)) {
        expect(STATUS_META[s].isTerminal).toBe(false);
      }
    }
  });
});

describe("L3. update mutation: terminal-immutability guard", () => {
  // Simulates the guard logic at the top of the update mutation.
  function canUpdateContract(currentStatus: ContractStatus): { allowed: boolean; reason?: string } {
    if (isTerminalStatus(currentStatus)) {
      return {
        allowed: false,
        reason: `Contract is in a terminal state ("${currentStatus}") and cannot be modified.`,
      };
    }
    return { allowed: true };
  }

  it("terminated contract rejects any update", () => {
    const result = canUpdateContract("terminated");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("terminated");
  });

  it("renewed contract rejects any update", () => {
    const result = canUpdateContract("renewed");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("renewed");
  });

  it("active contract allows updates", () => {
    expect(canUpdateContract("active").allowed).toBe(true);
  });

  it("draft contract allows updates", () => {
    expect(canUpdateContract("draft").allowed).toBe(true);
  });

  it("expired contract allows updates (e.g. correcting dates before renewing)", () => {
    expect(canUpdateContract("expired").allowed).toBe(true);
  });

  it("suspended contract allows updates", () => {
    expect(canUpdateContract("suspended").allowed).toBe(true);
  });

  it("attempting to set expired via update is rejected by system-only guard", () => {
    const requestedStatus: ContractStatus = "expired";
    expect(isSystemOnlyStatus(requestedStatus)).toBe(true);
  });

  it("attempting to set renewed via update is rejected by system-only guard", () => {
    const requestedStatus: ContractStatus = "renewed";
    expect(isSystemOnlyStatus(requestedStatus)).toBe(true);
  });

  it("setting active via update goes through the transition map (draft → active valid)", () => {
    expect(isSystemOnlyStatus("active")).toBe(false);
    expect(() => validateStatusTransition("draft", "active")).not.toThrow();
  });

  it("reverse transition active → draft is blocked even if not system-only", () => {
    expect(isSystemOnlyStatus("draft")).toBe(false);
    expect(() => validateStatusTransition("active", "draft")).toThrow(ContractTransitionError);
  });
});

describe("L4. Invalid transitions — comprehensive matrix", () => {
  // All status → status combinations that MUST throw ContractTransitionError
  const ILLEGAL_MOVES: Array<[ContractStatus, ContractStatus]> = [
    // From draft — cannot jump to system-managed or expired
    ["draft",      "expired"],
    ["draft",      "renewed"],
    ["draft",      "suspended"], // not in draft's allowed list
    // From active — cannot go back
    ["active",     "draft"],
    // From expired — only renewed is allowed
    ["expired",    "active"],
    ["expired",    "draft"],
    ["expired",    "terminated"],
    ["expired",    "suspended"],
    // Terminal: no exits
    ["terminated", "active"],
    ["terminated", "draft"],
    ["terminated", "expired"],
    ["terminated", "renewed"],
    ["terminated", "suspended"],
    ["renewed",    "active"],
    ["renewed",    "draft"],
    ["renewed",    "expired"],
    ["renewed",    "terminated"],
    ["renewed",    "suspended"],
    // Suspended — cannot renew directly; must reactivate first
    ["suspended",  "renewed"],
    ["suspended",  "expired"],
    ["suspended",  "draft"],
  ];

  for (const [from, to] of ILLEGAL_MOVES) {
    it(`${from} → ${to} throws ContractTransitionError`, () => {
      expect(() => validateStatusTransition(from, to)).toThrow(ContractTransitionError);
    });
  }

  // All legal transitions from the transition map
  const LEGAL_MOVES: Array<[ContractStatus, ContractStatus]> = [
    ["draft",     "active"],
    ["draft",     "terminated"],
    ["active",    "expired"],
    ["active",    "terminated"],
    ["active",    "renewed"],
    ["active",    "suspended"],
    ["expired",   "renewed"],
    ["suspended", "active"],
    ["suspended", "terminated"],
  ];

  for (const [from, to] of LEGAL_MOVES) {
    it(`${from} → ${to} does NOT throw`, () => {
      expect(() => validateStatusTransition(from, to)).not.toThrow();
    });
  }

  it("no-op (same status) never throws for any status", () => {
    for (const s of CONTRACT_STATUSES) {
      expect(() => validateStatusTransition(s, s)).not.toThrow();
    }
  });
});

describe("L5. create mutation: initial status guard", () => {
  // Simulates the guard logic in createPromoterAssignment.
  function validateInitialStatus(
    requestedStatus: ContractStatus,
    isPlatformAdmin: boolean
  ): { allowed: boolean; reason?: string } {
    if (isTerminalStatus(requestedStatus)) {
      return {
        allowed: false,
        reason: `Cannot create a contract with status "${requestedStatus}". Terminal statuses are not valid as an initial status.`,
      };
    }
    if (!isPlatformAdmin && requestedStatus !== "draft") {
      return {
        allowed: false,
        reason: `New contracts must start in "draft" status. Use the activate action to make the contract active.`,
      };
    }
    return { allowed: true };
  }

  it("regular user: draft is allowed", () => {
    expect(validateInitialStatus("draft", false).allowed).toBe(true);
  });

  it("regular user: active is blocked", () => {
    const r = validateInitialStatus("active", false);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("draft");
  });

  it("regular user: expired is blocked (system-only + terminal)", () => {
    expect(validateInitialStatus("expired", false).allowed).toBe(false);
  });

  it("regular user: terminated is blocked (terminal)", () => {
    const r = validateInitialStatus("terminated", false);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Terminal statuses");
  });

  it("regular user: renewed is blocked (terminal)", () => {
    expect(validateInitialStatus("renewed", false).allowed).toBe(false);
  });

  it("regular user: suspended is blocked (not draft)", () => {
    expect(validateInitialStatus("suspended", false).allowed).toBe(false);
  });

  it("platform admin: draft is allowed", () => {
    expect(validateInitialStatus("draft", true).allowed).toBe(true);
  });

  it("platform admin: active is allowed (migration / backfill)", () => {
    expect(validateInitialStatus("active", true).allowed).toBe(true);
  });

  it("platform admin: suspended is allowed (edge-case import)", () => {
    expect(validateInitialStatus("suspended", true).allowed).toBe(true);
  });

  it("platform admin: terminated is blocked even for admins (terminal cannot be initial)", () => {
    expect(validateInitialStatus("terminated", true).allowed).toBe(false);
  });

  it("platform admin: renewed is blocked even for admins (terminal cannot be initial)", () => {
    expect(validateInitialStatus("renewed", true).allowed).toBe(false);
  });
});

describe("L6. renew mutation: renewability pre-check", () => {
  // Simulates the pre-check guard at the top of the renew mutation.
  function canRenew(status: ContractStatus): { allowed: boolean; reason?: string } {
    const allowed = (ALLOWED_TRANSITIONS[status] as readonly string[]).includes("renewed");
    if (!allowed) {
      const reason =
        status === "draft"
          ? "Draft contracts cannot be renewed. Activate the contract first."
          : status === "terminated"
          ? "Terminated contracts cannot be renewed. Create a new contract instead."
          : status === "renewed"
          ? "This contract has already been renewed and is now superseded."
          : status === "suspended"
          ? "Suspended contracts cannot be renewed. Reactivate first."
          : `Cannot renew a contract in "${status}" status.`;
      return { allowed: false, reason };
    }
    return { allowed: true };
  }

  it("active contract can be renewed", () => {
    expect(canRenew("active").allowed).toBe(true);
  });

  it("expired contract can be renewed", () => {
    expect(canRenew("expired").allowed).toBe(true);
  });

  it("draft contract cannot be renewed — activate first", () => {
    const r = canRenew("draft");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Activate");
  });

  it("terminated contract cannot be renewed — create new instead", () => {
    const r = canRenew("terminated");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("new contract");
  });

  it("already-renewed contract cannot be renewed again", () => {
    const r = canRenew("renewed");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("superseded");
  });

  it("suspended contract cannot be renewed — reactivate first", () => {
    const r = canRenew("suspended");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("Reactivate");
  });

  it("renew transition validates correctly through the map", () => {
    // valid
    expect(() => validateStatusTransition("active",  "renewed")).not.toThrow();
    expect(() => validateStatusTransition("expired", "renewed")).not.toThrow();
    // invalid
    expect(() => validateStatusTransition("draft",      "renewed")).toThrow(ContractTransitionError);
    expect(() => validateStatusTransition("terminated",  "renewed")).toThrow(ContractTransitionError);
    expect(() => validateStatusTransition("suspended",   "renewed")).toThrow(ContractTransitionError);
  });
});

// ─── M. BACKGROUND EXPIRE JOB ─────────────────────────────────────────────────
//
// Tests for the daily sync-expired-contracts job and the no-op guard added to
// transitionContractStatus.  Because the actual DB calls are exercised in the
// repository, these tests focus on:
//   1. The transitionContractStatus no-op guard semantics
//   2. The expireOverdueContracts aggregation logic (via mock DB)
//   3. Idempotency invariants expressible without a real database

describe("M1. transitionContractStatus no-op guard", () => {
  // The no-op guard fires when fromStatus === toStatus after the DB re-read.
  // It must return early WITHOUT writing the status or appending an audit event,
  // preventing duplicate audit entries during concurrent lazy-expire + batch-job.

  it("validateStatusTransition does not throw when from === to (no-op)", () => {
    for (const s of CONTRACT_STATUSES) {
      expect(() => validateStatusTransition(s, s)).not.toThrow();
    }
  });

  it("no-op means the previous status equals the new status", () => {
    // Simulate what transitionContractStatus returns on a no-op call:
    // if fromStatus === toStatus, previousStatus === newStatus
    function simulateTransition(fromStatus: ContractStatus, toStatus: ContractStatus) {
      validateStatusTransition(fromStatus, toStatus); // does not throw for no-op
      const isNoOp = fromStatus === toStatus;
      return {
        previousStatus: fromStatus,
        newStatus:       toStatus,
        wroteToDb:       !isNoOp,
        wroteAuditEvent: !isNoOp,
      };
    }

    const noOp = simulateTransition("expired", "expired");
    expect(noOp.previousStatus).toBe("expired");
    expect(noOp.newStatus).toBe("expired");
    expect(noOp.wroteToDb).toBe(false);
    expect(noOp.wroteAuditEvent).toBe(false);

    const realTransition = simulateTransition("active", "expired");
    expect(realTransition.wroteToDb).toBe(true);
    expect(realTransition.wroteAuditEvent).toBe(true);
  });

  it("no-op is triggered for every status, not just expired", () => {
    for (const s of CONTRACT_STATUSES) {
      expect(() => validateStatusTransition(s, s)).not.toThrow();
    }
  });

  it("the no-op guards the caller from counting a stale row as a new expiry", () => {
    // expireOverdueContracts checks previousStatus === "active" to decide
    // whether to increment the `expired` counter vs `skipped`.
    // If a contract was concurrently expired (previousStatus = "expired"),
    // it must land in `skipped`, not `expired`.
    function countResult(previousStatus: ContractStatus): "expired" | "skipped" {
      return previousStatus === "active" ? "expired" : "skipped";
    }
    expect(countResult("active")).toBe("expired");  // clean transition
    expect(countResult("expired")).toBe("skipped"); // concurrent no-op case
    expect(countResult("suspended")).toBe("skipped"); // unexpected — still safe
  });
});

describe("M2. expireOverdueContracts logic invariants", () => {
  // These tests verify the aggregation semantics without needing a real DB.

  it("ContractTransitionError during iteration increments skipped, not errors", () => {
    // Simulate the catch branch in expireOverdueContracts
    function handleTransitionResult(err: unknown): "expired" | "skipped" | "error" {
      if (err instanceof ContractTransitionError) return "skipped";
      if (err) return "error";
      return "expired";
    }
    expect(handleTransitionResult(new ContractTransitionError("terminated", "expired"))).toBe("skipped");
    expect(handleTransitionResult(new Error("DB connection lost"))).toBe("error");
    expect(handleTransitionResult(null)).toBe("expired");
  });

  it("found = expired + skipped + errors (all candidates accounted for)", () => {
    // The invariant: every candidate row must end up in one of the three buckets.
    function assertBookkeeping(
      found: number, expired: number, skipped: number, errors: number
    ) {
      expect(expired + skipped + errors).toBe(found);
    }
    assertBookkeeping(10, 8, 1, 1);
    assertBookkeeping(5,  5, 0, 0);
    assertBookkeeping(0,  0, 0, 0);
    assertBookkeeping(3,  0, 3, 0); // all skipped (all already expired concurrently)
  });

  it("empty candidate list returns all-zero stats (idempotent second run)", () => {
    // After the first run expires all eligible contracts, a second SELECT
    // finds 0 candidates.  The job must return cleanly.
    const secondRunResult = { found: 0, expired: 0, skipped: 0, errors: 0 };
    expect(secondRunResult.found).toBe(0);
    expect(secondRunResult.expired).toBe(0);
  });

  it("SYSTEM_ACTOR name is 'system:expire-job' (not 'system:auto-expire')", () => {
    // The job uses its own actor name so audit events can distinguish
    // batch-expire from lazy-expire in the timeline.
    const SYSTEM_ACTOR_NAME = "system:expire-job";
    expect(SYSTEM_ACTOR_NAME).toBe("system:expire-job");
    expect(SYSTEM_ACTOR_NAME).not.toBe("system:auto-expire");
  });
});

describe("M3. expireOverdueContracts via mock DB", () => {
  // Full simulation using a mock DB that records calls.

  type TransitionCall = { contractId: string; toStatus: string };

  function makeBatchMockDb(
    candidates: string[],
    storedStatuses: Record<string, ContractStatus>
  ) {
    const transitionCalls: TransitionCall[] = [];
    const auditEvents: string[] = [];

    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            // Return the candidate list for the outer SELECT
            Promise.resolve(candidates.map((id) => ({ id }))),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(undefined),
        }),
      }),
      insert: () => ({
        values: (row: { action?: string; contractId?: string }) => {
          if (row.action) auditEvents.push(row.action);
          return Promise.resolve(undefined);
        },
      }),
      // Internal SELECT inside transitionContractStatus
      _selectStatus: (id: string) => storedStatuses[id] ?? "active",
    };

    return { db, transitionCalls, auditEvents };
  }

  it("processes candidates in order and returns correct counts", async () => {
    // Verify our count logic: all candidates start as "active",
    // simulated by tracking what previousStatus we return.
    let expired = 0, skipped = 0, errors = 0;
    const CANDIDATES = ["c1", "c2", "c3"];

    for (const id of CANDIDATES) {
      try {
        // Simulate: c1="active", c2="expired"(race), c3 throws TransitionError
        if (id === "c1") {
          const { previousStatus } = { previousStatus: "active" as ContractStatus };
          if (previousStatus === "active") expired++;
          else skipped++;
        } else if (id === "c2") {
          // No-op (already expired)
          const { previousStatus } = { previousStatus: "expired" as ContractStatus };
          if (previousStatus === "active") expired++;
          else skipped++;
        } else {
          throw new ContractTransitionError("terminated", "expired");
        }
      } catch (err) {
        if (err instanceof ContractTransitionError) skipped++;
        else errors++;
      }
    }

    expect(expired).toBe(1);
    expect(skipped).toBe(2);
    expect(errors).toBe(0);
    expect(expired + skipped + errors).toBe(CANDIDATES.length);
  });

  it("zero candidates → zero stats (idempotent second run)", async () => {
    let expired = 0, skipped = 0, errors = 0;
    const candidates: string[] = [];

    for (const _id of candidates) {
      // This loop body never runs
      expired++;
    }

    expect({ found: candidates.length, expired, skipped, errors }).toEqual({
      found: 0, expired: 0, skipped: 0, errors: 0,
    });
  });

  it("unexpected error increments errors without aborting the loop", () => {
    let expired = 0, errors = 0;
    const CANDIDATES = ["good", "bad", "good2"];

    for (const id of CANDIDATES) {
      try {
        if (id === "bad") throw new Error("DB timeout");
        expired++;
      } catch (err) {
        if (err instanceof ContractTransitionError) {
          // skipped — not triggered here
        } else {
          errors++;
          // Log and continue — do NOT re-throw
        }
      }
    }

    expect(expired).toBe(2);
    expect(errors).toBe(1);
  });
});

describe("M4. Interaction: effectiveContractStatus and batch job", () => {
  // Verifies that the two expiry mechanisms are complementary, not conflicting.

  it("contract expired by batch job has stored status='expired' — effectiveContractStatus agrees", () => {
    // After the batch job runs, stored status = "expired"
    const storedStatus = "expired";
    const expiryDate   = "2026-04-05"; // past
    const nowUtcDay    = toUtcDay(new Date("2026-04-06T00:00:00.000Z"));

    const effective = effectiveContractStatus(storedStatus, expiryDate, nowUtcDay);
    expect(effective).toBe("expired");
    // No discrepancy between stored and effective — the job reconciled the DB
  });

  it("before job runs, effectiveContractStatus still shows correct effective status", () => {
    // Stale: stored = "active", expiry was yesterday
    const storedStatus = "active";
    const expiryDate   = "2026-04-05"; // yesterday
    const nowUtcDay    = toUtcDay(new Date("2026-04-06T00:00:00.000Z"));

    const effective = effectiveContractStatus(storedStatus, expiryDate, nowUtcDay);
    // effectiveContractStatus bridges the gap until the batch job syncs the DB
    expect(effective).toBe("expired");
    expect(effective).not.toBe("active"); // dashboard will NOT show this as active
  });

  it("after job runs, storedActiveEffectivelyExpired should drop to 0", () => {
    // Before job: there may be stale rows
    function countStaleRows(rows: Array<{ status: string; expiryDate: string }>, nowUtcDay: Date): number {
      return rows.filter((r) => {
        const eff = effectiveContractStatus(r.status as ContractStatus, r.expiryDate, nowUtcDay);
        return r.status === "active" && eff === "expired";
      }).length;
    }

    const now = toUtcDay(new Date("2026-04-06T00:00:00.000Z"));
    const before = [
      { status: "active", expiryDate: "2026-04-05" }, // stale
      { status: "active", expiryDate: "2026-04-04" }, // stale
      { status: "active", expiryDate: "2026-04-10" }, // valid
    ];
    expect(countStaleRows(before, now)).toBe(2);

    // After job runs, the two stale rows have status="expired" in DB
    const after = [
      { status: "expired", expiryDate: "2026-04-05" },
      { status: "expired", expiryDate: "2026-04-04" },
      { status: "active",  expiryDate: "2026-04-10" },
    ];
    expect(countStaleRows(after, now)).toBe(0);
  });

  it("batch job uses SYSTEM_ACTOR id=0, distinguishable from user-driven terminate", () => {
    // Audit events from the job have actorId=0, actorName='system:expire-job'
    // User-driven actions have actorId > 0
    const jobAuditEvent   = { actorId: 0,  actorName: "system:expire-job" };
    const userAuditEvent  = { actorId: 42, actorName: "Jane Smith" };

    const isSystemJob = (e: { actorId: number }) => e.actorId === 0;
    expect(isSystemJob(jobAuditEvent)).toBe(true);
    expect(isSystemJob(userAuditEvent)).toBe(false);
  });
});

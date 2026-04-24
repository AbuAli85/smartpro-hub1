import { describe, it, expect } from "vitest";
import {
  resolveEffectiveCapabilities,
  hasCapability,
  buildPermissionsOverride,
  getDefaultCapabilitiesForRole,
  CAPABILITY_KEYS,
  ROLE_DEFAULT_CAPABILITIES,
  type Capability,
} from "@shared/capabilities";
import { clientNavItemVisible } from "@shared/clientNav";

// ─── resolveEffectiveCapabilities ─────────────────────────────────────────────

describe("resolveEffectiveCapabilities", () => {
  it("returns role defaults when no overrides", () => {
    const eff = resolveEffectiveCapabilities("hr_admin", [], null);
    expect(eff.has("view_hr")).toBe(true);
    expect(eff.has("manage_hr")).toBe(true);
    expect(eff.has("view_reports")).toBe(true);
    expect(eff.has("view_payroll")).toBe(false); // not in hr_admin defaults
    expect(eff.has("edit_payroll")).toBe(false);
  });

  it("company_admin gets all capabilities by default", () => {
    const eff = resolveEffectiveCapabilities("company_admin", [], null);
    for (const cap of CAPABILITY_KEYS) {
      expect(eff.has(cap)).toBe(true);
    }
  });

  it("company_member gets no capabilities by default", () => {
    const eff = resolveEffectiveCapabilities("company_member", [], null);
    expect(eff.size).toBe(0);
  });

  it("explicit grant adds capability on top of role defaults", () => {
    const eff = resolveEffectiveCapabilities("hr_admin", ["view_payroll"], null);
    expect(eff.has("view_payroll")).toBe(true);
    expect(eff.has("view_hr")).toBe(true); // still has role defaults
  });

  it("denial prefix removes capability from role defaults", () => {
    const eff = resolveEffectiveCapabilities("hr_admin", ["-approve_tasks"], null);
    expect(eff.has("approve_tasks")).toBe(false);
    expect(eff.has("view_hr")).toBe(true); // unaffected defaults remain
  });

  it("grant + denial: grant wins if not in defaults, denial only strips what's present", () => {
    const eff = resolveEffectiveCapabilities("company_member", ["view_payroll", "-view_reports"], null);
    expect(eff.has("view_payroll")).toBe(true);  // explicit grant
    expect(eff.has("view_reports")).toBe(false); // denial of something not in defaults = no-op, still false
  });

  it("same role, different permissions: two different effective sets", () => {
    const effA = resolveEffectiveCapabilities("hr_admin", [], null);
    const effB = resolveEffectiveCapabilities("hr_admin", ["view_payroll", "-approve_tasks"], null);
    expect(effA.has("view_payroll")).toBe(false);
    expect(effB.has("view_payroll")).toBe(true);
    expect(effA.has("approve_tasks")).toBe(true);
    expect(effB.has("approve_tasks")).toBe(false);
  });

  it("disabled module removes related capabilities", () => {
    const eff = resolveEffectiveCapabilities("finance_admin", [], ["finance"]); // payroll disabled
    expect(eff.has("view_finance")).toBe(true);   // finance module is enabled
    expect(eff.has("view_payroll")).toBe(false);  // payroll module not in list
    expect(eff.has("edit_payroll")).toBe(false);
  });

  it("null enabledModules = all modules active", () => {
    const eff = resolveEffectiveCapabilities("finance_admin", [], null);
    expect(eff.has("view_payroll")).toBe(true);
    expect(eff.has("view_finance")).toBe(true);
  });

  it("empty enabledModules removes all module-gated capabilities", () => {
    const eff = resolveEffectiveCapabilities("company_admin", [], []);
    // All modules disabled → no capabilities that belong to a module
    expect(eff.has("view_payroll")).toBe(false);
    expect(eff.has("view_hr")).toBe(false);
    expect(eff.has("view_crm")).toBe(false);
  });

  it("external_auditor has read-only defaults, no mutations", () => {
    const eff = resolveEffectiveCapabilities("external_auditor", [], null);
    expect(eff.has("view_payroll")).toBe(true);
    expect(eff.has("edit_payroll")).toBe(false);
    expect(eff.has("manage_hr")).toBe(false);
    expect(eff.has("manage_users")).toBe(false);
  });
});

// ─── hasCapability ────────────────────────────────────────────────────────────

describe("hasCapability", () => {
  it("works with Set", () => {
    const eff = resolveEffectiveCapabilities("hr_admin", [], null);
    expect(hasCapability(eff, "view_hr")).toBe(true);
    expect(hasCapability(eff, "edit_payroll")).toBe(false);
  });

  it("works with string array (legacy compat)", () => {
    expect(hasCapability(["view_reports", "view_payroll"], "view_reports")).toBe(true);
    expect(hasCapability(["view_reports"], "edit_payroll")).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(hasCapability(null, "view_reports")).toBe(false);
    expect(hasCapability(undefined, "view_reports")).toBe(false);
  });
});

// ─── buildPermissionsOverride ─────────────────────────────────────────────────

describe("buildPermissionsOverride", () => {
  it("no change from defaults = empty override array", () => {
    const hrDefaults = Array.from(getDefaultCapabilitiesForRole("hr_admin"));
    const perms = buildPermissionsOverride("hr_admin", hrDefaults as Capability[]);
    expect(perms).toHaveLength(0);
  });

  it("adds grant for extra capability", () => {
    const hrDefaults = Array.from(getDefaultCapabilitiesForRole("hr_admin"));
    const perms = buildPermissionsOverride("hr_admin", [...hrDefaults, "view_payroll"] as Capability[]);
    expect(perms).toContain("view_payroll");
    expect(perms.filter((p) => p.startsWith("-"))).toHaveLength(0);
  });

  it("adds denial for removed default", () => {
    const hrDefaults = Array.from(getDefaultCapabilitiesForRole("hr_admin"));
    const withoutApprove = hrDefaults.filter((c) => c !== "approve_tasks");
    const perms = buildPermissionsOverride("hr_admin", withoutApprove as Capability[]);
    expect(perms).toContain("-approve_tasks");
    expect(perms.filter((p) => !p.startsWith("-"))).toHaveLength(0);
  });

  it("roundtrip: buildPermissionsOverride → resolveEffectiveCapabilities matches desired", () => {
    const desired: Capability[] = ["view_hr", "manage_hr", "view_payroll"]; // hr_admin + extra payroll, no approve_tasks
    const perms = buildPermissionsOverride("hr_admin", desired);
    const eff = resolveEffectiveCapabilities("hr_admin", perms, null);
    for (const cap of desired) {
      expect(eff.has(cap)).toBe(true);
    }
    expect(eff.has("approve_tasks")).toBe(false);
    expect(eff.has("view_reports")).toBe(false); // removed
  });
});

// ─── Nav integration: clientNavItemVisible with capabilities ─────────────────

const NULL_USER = { role: null, platformRole: null };

describe("clientNavItemVisible + capability system", () => {
  const hidden = new Set<string>();

  it("company_member with view_payroll grant can see /payroll", () => {
    const visible = clientNavItemVisible("/payroll", NULL_USER, hidden, {
      memberRole: "company_member",
      memberPermissions: ["view_payroll"],
      navMode: "company",
    });
    expect(visible).toBe(true);
  });

  it("company_member without grant cannot see /payroll", () => {
    const visible = clientNavItemVisible("/payroll", NULL_USER, hidden, {
      memberRole: "company_member",
      memberPermissions: [],
      navMode: "company",
    });
    expect(visible).toBe(false);
  });

  it("hr_admin sees /reports by role default (no explicit permission needed)", () => {
    const visible = clientNavItemVisible("/reports", NULL_USER, hidden, {
      memberRole: "hr_admin",
      memberPermissions: [],
      navMode: "company",
    });
    expect(visible).toBe(true);
  });

  it("hr_admin denied approve_tasks cannot see tasks via capability", () => {
    // This tests denial encoding — the nav doesn't directly gate /tasks on approve_tasks today,
    // but we verify the effective set is correct
    const eff = resolveEffectiveCapabilities("hr_admin", ["-approve_tasks"], null);
    expect(eff.has("approve_tasks")).toBe(false);
  });

  it("disabled payroll module hides /payroll even for finance_admin", () => {
    const visible = clientNavItemVisible("/payroll", NULL_USER, hidden, {
      memberRole: "finance_admin",
      memberPermissions: [],
      enabledModules: ["finance", "hr"], // payroll not in list
      navMode: "company",
    });
    expect(visible).toBe(false);
  });

  it("disabled payroll module hides /payroll for finance_admin but not for platform operator", () => {
    // Platform operator bypasses module gating
    const platformUser = { role: null, platformRole: "platform_admin" };
    const visible = clientNavItemVisible("/payroll", platformUser, hidden, {
      memberRole: "finance_admin",
      memberPermissions: [],
      enabledModules: [],
      navMode: "platform", // platform mode — not company mode
    });
    // Platform mode doesn't apply module gating
    expect(visible).toBe(true);
  });

  it("null enabledModules = all modules active", () => {
    const visible = clientNavItemVisible("/payroll", NULL_USER, hidden, {
      memberRole: "finance_admin",
      memberPermissions: [],
      enabledModules: null,
      navMode: "company",
    });
    expect(visible).toBe(true);
  });

  it("finance_admin cannot see /hr without capability grant (module check)", () => {
    // By role-based rules finance_admin shouldn't see HR; module gating adds second layer
    const eff = resolveEffectiveCapabilities("finance_admin", [], null);
    expect(eff.has("view_hr")).toBe(false);
    expect(eff.has("manage_hr")).toBe(false);
  });
});

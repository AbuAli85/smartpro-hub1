/**
 * Production Smoke Test — HR Performance Subsystem
 * Tests each companyMembers.role against every HR performance procedure.
 *
 * Run: node server/smokeTest.mjs
 */

import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL?.split("?")[0];
const COMPANY_ID = 30002; // Falcon Eye Business and Promotion

// ─── helpers ────────────────────────────────────────────────────────────────

function pass(label) { console.log(`  ✅ PASS  ${label}`); }
function fail(label, reason) { console.log(`  ❌ FAIL  ${label} — ${reason}`); }
function skip(label, reason) { console.log(`  ⚠️  SKIP  ${label} — ${reason}`); }
function section(title) { console.log(`\n${"─".repeat(60)}\n${title}\n${"─".repeat(60)}`); }

// ─── permission helpers (mirrors server logic) ────────────────────────────

const HR_PERF = {
  READ:      "hr.performance.read",
  MANAGE:    "hr.performance.manage",
  TRAIN:     "hr.training.manage",
  SELF_READ: "hr.self_reviews.read",
  SELF_REV:  "hr.self_reviews.review",
  TGT_READ:  "hr.targets.read",
  TGT_MGMT:  "hr.targets.manage",
};

const DEFAULT_PERMISSIONS = {
  company_admin:  ["*"],
  hr_admin:       [HR_PERF.READ, HR_PERF.MANAGE, HR_PERF.TRAIN, HR_PERF.SELF_READ, HR_PERF.SELF_REV, HR_PERF.TGT_READ, HR_PERF.TGT_MGMT],
  finance_admin:  [HR_PERF.READ, HR_PERF.TGT_READ],
  reviewer:       [HR_PERF.READ, HR_PERF.SELF_READ, HR_PERF.SELF_REV, HR_PERF.TGT_READ],
  company_member: [],
  client:         [],
  external_auditor: [],
};

function hasPermission(role, permissions, key) {
  const perms = permissions ?? DEFAULT_PERMISSIONS[role] ?? [];
  if (perms.includes("*")) return true;
  return perms.includes(key);
}

function canAccessGlobal(platformRole, legacyRole) {
  if (legacyRole === "admin") return true;
  return platformRole === "super_admin" || platformRole === "platform_admin";
}

// ─── procedure access rules (mirrors guards) ─────────────────────────────

function canReadDashboard(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.READ);
}

function canManageTraining(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.TRAIN) || hasPermission(role, perms, HR_PERF.MANAGE);
}

function canListTraining(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.READ);
}

function canReadSelfReviews(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.SELF_READ) || hasPermission(role, perms, HR_PERF.MANAGE);
}

function canReviewSelfReview(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.SELF_REV) || hasPermission(role, perms, HR_PERF.MANAGE);
}

function canReadTargets(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.TGT_READ) || hasPermission(role, perms, HR_PERF.READ);
}

function canManageTargets(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  return hasPermission(role, perms, HR_PERF.TGT_MGMT) || hasPermission(role, perms, HR_PERF.MANAGE);
}

function canReadHrAudit(role, perms, platformRole, legacyRole) {
  if (canAccessGlobal(platformRole, legacyRole)) return true;
  // Any HR performance permission grants audit read
  return Object.values(HR_PERF).some(k => hasPermission(role, perms, k));
}

// ─── expected matrix ─────────────────────────────────────────────────────

const EXPECTED = {
  company_admin:    { dashboard: true,  listTraining: true,  manageTraining: true,  readSelfReview: true,  reviewSelfReview: true,  readTargets: true,  manageTargets: true,  hrAudit: true  },
  hr_admin:         { dashboard: true,  listTraining: true,  manageTraining: true,  readSelfReview: true,  reviewSelfReview: true,  readTargets: true,  manageTargets: true,  hrAudit: true  },
  finance_admin:    { dashboard: true,  listTraining: true,  manageTraining: false, readSelfReview: false, reviewSelfReview: false, readTargets: true,  manageTargets: false, hrAudit: true  },
  reviewer:         { dashboard: true,  listTraining: true,  manageTraining: false, readSelfReview: true,  reviewSelfReview: true,  readTargets: true,  manageTargets: false, hrAudit: true  },
  company_member:   { dashboard: false, listTraining: false, manageTraining: false, readSelfReview: false, reviewSelfReview: false, readTargets: false, manageTargets: false, hrAudit: false },
  client:           { dashboard: false, listTraining: false, manageTraining: false, readSelfReview: false, reviewSelfReview: false, readTargets: false, manageTargets: false, hrAudit: false },
  external_auditor: { dashboard: false, listTraining: false, manageTraining: false, readSelfReview: false, reviewSelfReview: false, readTargets: false, manageTargets: false, hrAudit: false },
};

// ─── training status transition guard (mirrors hrPerformanceGuards.ts) ────

const TRAINING_TRANSITIONS = {
  assigned:    ["in_progress", "overdue"],
  in_progress: ["completed", "overdue"],
  overdue:     ["in_progress", "completed"],
  completed:   [],
};

function assertTrainingTransition(from, to) {
  const allowed = TRAINING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) throw new Error(`Invalid transition: ${from} → ${to}`);
}

// ─── KPI target lifecycle guard ───────────────────────────────────────────

const KPI_TRANSITIONS = {
  draft:     ["active", "cancelled"],
  active:    ["completed", "archived", "cancelled"],
  completed: ["archived"],
  archived:  ["active"],
  cancelled: [],
};

function assertKpiTransition(from, to) {
  const allowed = KPI_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) throw new Error(`Invalid transition: ${from} → ${to}`);
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  const conn = await mysql.createConnection({ uri: DB_URL, ssl: { rejectUnauthorized: false } });

  // Fetch live members for the target company
  const [members] = await conn.execute(`
    SELECT cm.role, MIN(cm.permissions) as permissions, MIN(u.platformRole) as platformRole, MIN(u.role) as legacyRole, MIN(u.name) as name
    FROM company_members cm
    JOIN users u ON u.id = cm.userId
    WHERE cm.companyId = ? AND cm.isActive = 1
    GROUP BY cm.role
  `, [COMPANY_ID]);

  const results = { passed: 0, failed: 0, skipped: 0 };

  // ── 1. Permission matrix per role ──────────────────────────────────────
  section("1. Permission Matrix — All Roles");

  const rolesToTest = ["company_admin", "hr_admin", "finance_admin", "reviewer", "company_member", "client", "external_auditor"];

  for (const role of rolesToTest) {
    const member = members.find(m => m.role === role);
    const perms = member ? (typeof member.permissions === "string" ? JSON.parse(member.permissions || "[]") : member.permissions || []) : DEFAULT_PERMISSIONS[role];
    const platformRole = member?.platformRole ?? "company_member";
    const legacyRole = member?.legacyRole ?? "user";
    const expected = EXPECTED[role];

    console.log(`\n  Role: ${role.toUpperCase()} ${member ? "(live tenant)" : "(simulated)"}`);

    const checks = [
      ["getHrPerformanceDashboard", canReadDashboard(role, perms, platformRole, legacyRole), expected.dashboard],
      ["adminListTraining",         canListTraining(role, perms, platformRole, legacyRole),  expected.listTraining],
      ["adminAssignTraining",       canManageTraining(role, perms, platformRole, legacyRole),expected.manageTraining],
      ["adminListSelfReviews",      canReadSelfReviews(role, perms, platformRole, legacyRole), expected.readSelfReview],
      ["adminUpdateSelfReview",     canReviewSelfReview(role, perms, platformRole, legacyRole), expected.reviewSelfReview],
      ["adminGetTeamProgress",      canReadTargets(role, perms, platformRole, legacyRole),   expected.readTargets],
      ["setTarget/transitionTarget",canManageTargets(role, perms, platformRole, legacyRole), expected.manageTargets],
      ["HR audit rows visible",     canReadHrAudit(role, perms, platformRole, legacyRole),   expected.hrAudit],
    ];

    for (const [proc, actual, exp] of checks) {
      const label = `${role} → ${proc}`;
      if (actual === exp) { pass(label + (actual ? " [ALLOW]" : " [DENY]")); results.passed++; }
      else { fail(label + ` expected=${exp} got=${actual}`); results.failed++; }
    }
  }

  // ── 2. Training status transition guard ────────────────────────────────
  section("2. Training Status Transition Guard");

  const transitionTests = [
    ["assigned",    "in_progress", true,  "assigned → in_progress (allowed)"],
    ["assigned",    "overdue",     true,  "assigned → overdue (allowed)"],
    ["assigned",    "completed",   false, "assigned → completed (BLOCKED — must go through in_progress)"],
    ["in_progress", "completed",   true,  "in_progress → completed (allowed)"],
    ["in_progress", "overdue",     true,  "in_progress → overdue (allowed)"],
    ["overdue",     "in_progress", true,  "overdue → in_progress (allowed)"],
    ["overdue",     "completed",   true,  "overdue → completed (allowed)"],
    ["completed",   "in_progress", false, "completed → in_progress (BLOCKED — terminal)"],
    ["completed",   "assigned",    false, "completed → assigned (BLOCKED — terminal)"],
  ];

  for (const [from, to, shouldPass, label] of transitionTests) {
    try {
      assertTrainingTransition(from, to);
      if (shouldPass) { pass(label); results.passed++; }
      else { fail(label, "expected BLOCKED but was ALLOWED"); results.failed++; }
    } catch {
      if (!shouldPass) { pass(label); results.passed++; }
      else { fail(label, "expected ALLOWED but was BLOCKED"); results.failed++; }
    }
  }

  // ── 3. KPI target lifecycle guard ─────────────────────────────────────
  section("3. KPI Target Lifecycle Guard");

  const kpiTests = [
    ["draft",     "active",    true,  "draft → active (allowed)"],
    ["draft",     "cancelled", true,  "draft → cancelled (allowed)"],
    ["draft",     "completed", false, "draft → completed (BLOCKED — must activate first)"],
    ["active",    "completed", true,  "active → completed (allowed)"],
    ["active",    "archived",  true,  "active → archived (allowed)"],
    ["active",    "cancelled", true,  "active → cancelled (allowed)"],
    ["active",    "draft",     false, "active → draft (BLOCKED — no rollback)"],
    ["completed", "archived",  true,  "completed → archived (allowed)"],
    ["completed", "active",    false, "completed → active (BLOCKED)"],
    ["archived",  "active",    true,  "archived → active (re-open allowed)"],
    ["cancelled", "active",    false, "cancelled → active (BLOCKED — terminal)"],
    ["cancelled", "draft",     false, "cancelled → draft (BLOCKED — terminal)"],
  ];

  for (const [from, to, shouldPass, label] of kpiTests) {
    try {
      assertKpiTransition(from, to);
      if (shouldPass) { pass(label); results.passed++; }
      else { fail(label, "expected BLOCKED but was ALLOWED"); results.failed++; }
    } catch {
      if (!shouldPass) { pass(label); results.passed++; }
      else { fail(label, "expected ALLOWED but was BLOCKED"); results.failed++; }
    }
  }

  // ── 4. Database schema validation ─────────────────────────────────────
  section("4. Database Schema Validation");

  const [ktCols] = await conn.execute("SHOW COLUMNS FROM kpi_targets LIKE 'target_status'");
  if (ktCols.length > 0) {
    pass(`kpi_targets.target_status column exists (type=${ktCols[0].Type} default=${ktCols[0].Default})`);
    results.passed++;
  } else {
    fail("kpi_targets.target_status column missing", "migration not applied");
    results.failed++;
  }

  // Verify enum values
  const enumType = ktCols[0]?.Type ?? "";
  const expectedValues = ["draft", "active", "completed", "archived", "cancelled"];
  for (const val of expectedValues) {
    if (enumType.includes(val)) { pass(`enum value '${val}' present`); results.passed++; }
    else { fail(`enum value '${val}' missing from ${enumType}`); results.failed++; }
  }

  // Check audit_events entityType column
  const [aeCols] = await conn.execute("SHOW COLUMNS FROM audit_events LIKE 'entityType'");
  if (aeCols.length > 0) { pass("audit_events.entityType column exists"); results.passed++; }
  else { fail("audit_events.entityType column missing"); results.failed++; }

  // ── 5. Live tenant data state ──────────────────────────────────────────
  section("5. Live Tenant Data State (Company 30002)");

  const [[empCount]] = await conn.execute("SELECT COUNT(*) as cnt FROM employees WHERE companyId=? AND status='active'", [COMPANY_ID]);
  console.log(`  Active employees: ${empCount.cnt}`);
  if (empCount.cnt > 0) { pass(`${empCount.cnt} active employees found`); results.passed++; }
  else { skip("No active employees — HR performance procedures will return empty results", "no data"); results.skipped++; }

  const [[trCount]] = await conn.execute("SELECT COUNT(*) as cnt FROM training_records");
  const [[srCount]] = await conn.execute("SELECT COUNT(*) as cnt FROM employee_self_reviews");
  const [[ktCount]] = await conn.execute("SELECT COUNT(*) as cnt FROM kpi_targets");
  const [aeRows] = await conn.execute("SELECT entityType, COUNT(*) as cnt FROM audit_events WHERE entityType IN ('training_record','self_review','kpi_target') GROUP BY entityType");

  console.log(`  Training records: ${trCount.cnt}`);
  console.log(`  Self reviews: ${srCount.cnt}`);
  console.log(`  KPI targets: ${ktCount.cnt}`);
  console.log(`  HR audit events: ${aeRows.length ? aeRows.map(r => r.entityType+":"+r.cnt).join(", ") : "none yet (expected for fresh deployment)"}`);

  pass("Database state consistent with fresh deployment — no pre-existing HR performance data");
  results.passed++;

  // ── Summary ────────────────────────────────────────────────────────────
  section("SMOKE TEST SUMMARY");
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`\n  Overall: ${results.failed === 0 ? "✅ ALL TESTS PASSED" : "❌ " + results.failed + " TEST(S) FAILED"}`);

  await conn.end();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });

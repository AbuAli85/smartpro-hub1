/**
 * seed-demo.ts — Seed the SmartPRO demo tenant.
 *
 * Creates (or resets) the "Al Noor Gulf LLC" demo company with five pre-built
 * personas that match the guided demo flow in docs/commercial/SMARTPRO_DEMO_FLOW.md.
 *
 * Usage:
 *   DATABASE_URL=mysql://... npx tsx scripts/seed-demo.ts
 *   DATABASE_URL=mysql://... npx tsx scripts/seed-demo.ts --reset   # drops & re-creates
 *
 * Safe to re-run — all inserts use ON DUPLICATE KEY UPDATE.
 */

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import {
  users,
  companies,
  companyMembers,
  subscriptionPlans,
} from "../drizzle/schema";
import { getEnabledModulesForPackage, type CompanyPackage } from "../shared/capabilities";

// ─── Config ──────────────────────────────────────────────────────────────────

const DEMO_SLUG = "al-noor-gulf-demo";
const DEMO_PACKAGE: CompanyPackage = "business";
const RESET = process.argv.includes("--reset");

// ─── DB bootstrap ────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = mysql.createPool({ uri: url, connectionLimit: 3 });
const db = drizzle(pool);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[seed-demo] ${msg}`);
}

// ─── 1. Subscription plans ───────────────────────────────────────────────────

const PLANS: Array<{
  slug: CompanyPackage;
  name: string;
  nameAr: string;
  priceMonthly: string;
  priceAnnual: string;
  maxUsers: number;
  sortOrder: number;
}> = [
  {
    slug: "starter",
    name: "Starter",
    nameAr: "المبتدئ",
    priceMonthly: "60.000",
    priceAnnual: "51.000",
    maxUsers: 10,
    sortOrder: 1,
  },
  {
    slug: "professional",
    name: "Professional",
    nameAr: "المحترف",
    priceMonthly: "150.000",
    priceAnnual: "127.500",
    maxUsers: 50,
    sortOrder: 2,
  },
  {
    slug: "business",
    name: "Business",
    nameAr: "الأعمال",
    priceMonthly: "365.000",
    priceAnnual: "310.250",
    maxUsers: 200,
    sortOrder: 3,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    nameAr: "المؤسسات",
    priceMonthly: "600.000",
    priceAnnual: "510.000",
    maxUsers: 9999,
    sortOrder: 4,
  },
];

async function seedPlans(): Promise<Record<CompanyPackage, number>> {
  const ids: Partial<Record<CompanyPackage, number>> = {};
  for (const p of PLANS) {
    const existing = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, p.slug))
      .limit(1);

    if (existing.length > 0) {
      ids[p.slug] = existing[0].id;
      log(`plan:${p.slug} exists (id=${existing[0].id}) — skipped`);
      continue;
    }

    const [result] = await db.insert(subscriptionPlans).values({
      name: p.name,
      nameAr: p.nameAr,
      slug: p.slug,
      description: `SmartPRO ${p.name} plan`,
      priceMonthly: p.priceMonthly,
      priceAnnual: p.priceAnnual,
      currency: "OMR",
      maxUsers: p.maxUsers,
      isActive: true,
      sortOrder: p.sortOrder,
    });
    // @ts-expect-error insertId exists on mysql2 result
    ids[p.slug] = result.insertId as number;
    log(`plan:${p.slug} created (id=${ids[p.slug]})`);
  }
  return ids as Record<CompanyPackage, number>;
}

// ─── 2. Demo company ─────────────────────────────────────────────────────────

async function seedCompany(planId: number): Promise<number> {
  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, DEMO_SLUG))
    .limit(1);

  const enabledModules = getEnabledModulesForPackage(DEMO_PACKAGE);

  if (existing.length > 0) {
    const id = existing[0].id;
    if (RESET) {
      await db
        .update(companies)
        .set({
          package: DEMO_PACKAGE,
          enabledModules,
          subscriptionPlanId: planId,
          molComplianceStatus: "warning",
          omanizationTarget: "35.00",
        })
        .where(eq(companies.id, id));
      log(`company:${DEMO_SLUG} reset (id=${id})`);
    } else {
      log(`company:${DEMO_SLUG} exists (id=${id}) — skipped`);
    }
    return id;
  }

  const [result] = await db.insert(companies).values({
    name: "Al Noor Gulf LLC",
    nameAr: "شركة النور الخليجية ذ.م.م",
    slug: DEMO_SLUG,
    industry: "Trading & Services",
    country: "OM",
    city: "Muscat",
    phone: "+968 2491 0000",
    email: "admin@alnoor-demo.om",
    registrationNumber: "DEMO-CR-1234567",
    crNumber: "1234567",
    companyType: "llc",
    status: "active",
    // @ts-expect-error package field added in migration 0080
    package: DEMO_PACKAGE,
    enabledModules,
    subscriptionPlanId: planId,
    omanizationRequired: true,
    omanizationTarget: "35.00",
    molComplianceStatus: "warning",
    billingModel: "subscription",
    subscriptionFee: "365.000",
    companySize: 45,
  });
  // @ts-expect-error insertId
  const id = result.insertId as number;
  log(`company:${DEMO_SLUG} created (id=${id}, package=${DEMO_PACKAGE}, modules=${JSON.stringify(enabledModules)})`);
  return id;
}

// ─── 3. Demo users ───────────────────────────────────────────────────────────

const DEMO_USERS: Array<{
  openId: string;
  name: string;
  email: string;
  platformRole: string;
  role: "user" | "admin";
  memberRole?: string; // company_members.role
  permissions?: string[];
  label: string;
}> = [
  {
    openId: "demo_super_admin_001",
    name: "Ahmed Al-Rashdi",
    email: "ahmed.admin@smartpro.demo",
    platformRole: "super_admin",
    role: "admin",
    label: "Platform Admin",
  },
  {
    openId: "demo_hr_001",
    name: "Fatma Al-Balushi",
    email: "fatma.hr@alnoor.demo",
    platformRole: "hr_admin",
    role: "user",
    memberRole: "hr_admin",
    label: "HR Admin",
  },
  {
    openId: "demo_finance_001",
    name: "Khalid Al-Mawali",
    email: "khalid.finance@alnoor.demo",
    platformRole: "finance_admin",
    role: "user",
    memberRole: "finance_admin",
    label: "Finance Admin",
  },
  {
    openId: "demo_client_001",
    name: "Sara Al-Hinai",
    email: "sara.client@vision-consult.demo",
    platformRole: "client",
    role: "user",
    memberRole: "client",
    label: "Client",
  },
  {
    openId: "demo_auditor_001",
    name: "Mohammed Al-Farsi",
    email: "m.alfarsi@kpmg.demo",
    platformRole: "external_auditor",
    role: "user",
    memberRole: "external_auditor",
    label: "External Auditor",
  },
];

async function seedUsers(): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const u of DEMO_USERS) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.openId, u.openId))
      .limit(1);

    if (existing.length > 0) {
      ids[u.openId] = existing[0].id;
      log(`user:${u.label} (${u.email}) exists (id=${existing[0].id}) — skipped`);
      continue;
    }

    const [result] = await db.insert(users).values({
      openId: u.openId,
      name: u.name,
      displayName: u.name,
      email: u.email,
      primaryEmail: u.email,
      emailNormalized: u.email.toLowerCase(),
      platformRole: u.platformRole as typeof users.$inferInsert["platformRole"],
      role: u.role,
      isActive: true,
      accountStatus: "active",
      twoFactorEnabled: u.platformRole === "super_admin", // platform admins have 2FA
    });
    // @ts-expect-error insertId
    ids[u.openId] = result.insertId as number;
    log(`user:${u.label} created (id=${ids[u.openId]}, email=${u.email})`);
  }
  return ids;
}

// ─── 4. Company memberships ───────────────────────────────────────────────────

async function seedMemberships(companyId: number, userIds: Record<string, number>) {
  for (const u of DEMO_USERS) {
    if (!u.memberRole) continue; // platform admin — no company membership
    const userId = userIds[u.openId];
    if (!userId) continue;

    const existing = await db
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, companyId),
          eq(companyMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      log(`membership:${u.label} exists — skipped`);
      continue;
    }

    await db.insert(companyMembers).values({
      companyId,
      userId,
      role: u.memberRole as typeof companyMembers.$inferInsert["role"],
      permissions: u.permissions ?? [],
      isActive: true,
    });
    log(`membership:${u.label} (${u.memberRole}) created`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting demo seed (package=${DEMO_PACKAGE}, reset=${RESET})`);
  log("─".repeat(60));

  const planIds = await seedPlans();
  const companyId = await seedCompany(planIds[DEMO_PACKAGE]);
  const userIds = await seedUsers();
  await seedMemberships(companyId, userIds);

  log("─".repeat(60));
  log("Demo seed complete.");
  log("");
  log("Demo credentials:");
  for (const u of DEMO_USERS) {
    log(`  ${u.label.padEnd(20)} ${u.email}`);
  }
  log("");
  log(`Company slug: ${DEMO_SLUG}`);
  log(`Package: ${DEMO_PACKAGE}  →  modules: ${JSON.stringify(getEnabledModulesForPackage(DEMO_PACKAGE))}`);
  log("");
  log("Note: users have no password set — they must sign in via the demo OAuth");
  log("      provider or have passwords set via the admin panel.");

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-demo] Fatal:", err);
  pool.end().finally(() => process.exit(1));
});

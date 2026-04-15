import { and, desc, eq, sql } from "drizzle-orm";
import {
  analyticsReports,
  companies,
  contracts,
  crmContacts,
  crmDeals,
  employees,
  jobPostings,
  leaveRequests,
  proServices,
  sanadApplications,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db.client";

export async function getPlatformStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalCompanies] = await db.select({ count: sql<number>`count(*)` }).from(companies);
  const [totalUsers] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [totalContracts] = await db.select({ count: sql<number>`count(*)` }).from(contracts);
  const [totalProServices] = await db.select({ count: sql<number>`count(*)` }).from(proServices);
  const [totalSanadApps] = await db.select({ count: sql<number>`count(*)` }).from(sanadApplications);
  const [totalEmployees] = await db.select({ count: sql<number>`count(*)` }).from(employees);
  const [totalDeals] = await db.select({ count: sql<number>`count(*)` }).from(crmDeals);
  const [totalContacts] = await db.select({ count: sql<number>`count(*)` }).from(crmContacts);

  return {
    companies: totalCompanies?.count ?? 0,
    users: totalUsers?.count ?? 0,
    contracts: totalContracts?.count ?? 0,
    proServices: totalProServices?.count ?? 0,
    sanadApplications: totalSanadApps?.count ?? 0,
    employees: totalEmployees?.count ?? 0,
    deals: totalDeals?.count ?? 0,
    contacts: totalContacts?.count ?? 0,
  };
}

export async function getCompanyStats(companyId: number) {
  const db = await getDb();
  if (!db) return null;

  const [totalContracts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contracts)
    .where(eq(contracts.companyId, companyId));
  const [totalProServices] = await db
    .select({ count: sql<number>`count(*)` })
    .from(proServices)
    .where(eq(proServices.companyId, companyId));
  const [totalSanadApps] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sanadApplications)
    .where(eq(sanadApplications.companyId, companyId));
  const [totalEmployees] = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(eq(employees.companyId, companyId));
  const [totalDeals] = await db
    .select({ count: sql<number>`count(*)` })
    .from(crmDeals)
    .where(eq(crmDeals.companyId, companyId));
  const [totalContacts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(crmContacts)
    .where(eq(crmContacts.companyId, companyId));
  const [pendingLeave] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "pending")));
  const [openJobs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobPostings)
    .where(and(eq(jobPostings.companyId, companyId), eq(jobPostings.status, "open")));

  return {
    contracts: totalContracts?.count ?? 0,
    proServices: totalProServices?.count ?? 0,
    sanadApplications: totalSanadApps?.count ?? 0,
    employees: totalEmployees?.count ?? 0,
    deals: totalDeals?.count ?? 0,
    contacts: totalContacts?.count ?? 0,
    pendingLeave: pendingLeave?.count ?? 0,
    openJobs: openJobs?.count ?? 0,
  };
}

export async function getAnalyticsReports(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(analyticsReports)
    .where(eq(analyticsReports.companyId, companyId))
    .orderBy(desc(analyticsReports.createdAt));
}

export async function createAnalyticsReport(data: typeof analyticsReports.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(analyticsReports).values(data);
}

export async function updateAnalyticsReport(id: number, data: Partial<typeof analyticsReports.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(analyticsReports).set(data).where(eq(analyticsReports.id, id));
}

export async function deleteAnalyticsReport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(analyticsReports).where(eq(analyticsReports.id, id));
}

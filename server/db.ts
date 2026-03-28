import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  analyticsReports,
  auditLogs,
  companies,
  companyMembers,
  companySubscriptions,
  contractTemplates,
  contracts,
  crmCommunications,
  crmContacts,
  crmDeals,
  employees,
  InsertUser,
  jobApplications,
  jobPostings,
  leaveRequests,
  marketplaceBookings,
  marketplaceProviders,
  marketplaceServices,
  notifications,
  payrollRecords,
  performanceReviews,
  proServices,
  sanadApplications,
  sanadOffices,
  subscriptionInvoices,
  subscriptionPlans,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getAllUsers(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db
      .select({ user: users, member: companyMembers })
      .from(users)
      .innerJoin(companyMembers, and(eq(companyMembers.userId, users.id), eq(companyMembers.companyId, companyId)))
      .orderBy(desc(users.createdAt));
  }
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// ─── COMPANIES ────────────────────────────────────────────────────────────────

export async function getCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies).orderBy(desc(companies.createdAt));
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result[0];
}

export async function createCompany(data: typeof companies.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(companies).values(data);
  return result[0];
}

export async function updateCompany(id: number, data: Partial<typeof companies.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function getUserCompany(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ company: companies, member: companyMembers })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.isActive, true)))
    .limit(1);
  return result[0];
}

// ─── SUBSCRIPTION PLANS ───────────────────────────────────────────────────────

export async function getSubscriptionPlans() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.sortOrder);
}

export async function getCompanySubscription(companyId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ subscription: companySubscriptions, plan: subscriptionPlans })
    .from(companySubscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, companySubscriptions.planId))
    .where(and(eq(companySubscriptions.companyId, companyId), eq(companySubscriptions.status, "active")))
    .limit(1);
  return result[0];
}

export async function getCompanyInvoices(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.companyId, companyId))
    .orderBy(desc(subscriptionInvoices.createdAt));
}

// ─── SANAD OFFICES ────────────────────────────────────────────────────────────

export async function getSanadOffices(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sanadOffices).where(eq(sanadOffices.companyId, companyId)).orderBy(desc(sanadOffices.createdAt));
}

export async function getAllSanadOffices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sanadOffices).orderBy(desc(sanadOffices.createdAt));
}

export async function createSanadOffice(data: typeof sanadOffices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(sanadOffices).values(data);
  return result[0];
}

export async function updateSanadOffice(id: number, data: Partial<typeof sanadOffices.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sanadOffices).set(data).where(eq(sanadOffices.id, id));
}

// ─── SANAD APPLICATIONS ───────────────────────────────────────────────────────

export async function getSanadApplications(companyId: number, filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(sanadApplications.companyId, companyId)];
  if (filters?.status) conditions.push(eq(sanadApplications.status, filters.status as any));
  if (filters?.type) conditions.push(eq(sanadApplications.type, filters.type as any));
  return db.select().from(sanadApplications).where(and(...conditions)).orderBy(desc(sanadApplications.createdAt));
}

export async function getAllSanadApplications(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(sanadApplications.status, filters.status as any)] : [];
  return db
    .select()
    .from(sanadApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(sanadApplications.createdAt));
}

export async function createSanadApplication(data: typeof sanadApplications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(sanadApplications).values(data);
  return result[0];
}

export async function updateSanadApplication(id: number, data: Partial<typeof sanadApplications.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sanadApplications).set(data).where(eq(sanadApplications.id, id));
}

// ─── PRO SERVICES ─────────────────────────────────────────────────────────────

export async function getProServices(companyId: number, filters?: { status?: string; serviceType?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(proServices.companyId, companyId)];
  if (filters?.status) conditions.push(eq(proServices.status, filters.status as any));
  if (filters?.serviceType) conditions.push(eq(proServices.serviceType, filters.serviceType as any));
  return db.select().from(proServices).where(and(...conditions)).orderBy(desc(proServices.createdAt));
}

export async function getAllProServices(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(proServices.status, filters.status as any)] : [];
  return db
    .select()
    .from(proServices)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(proServices.createdAt));
}

export async function getExpiringDocuments(daysAhead: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  return db
    .select()
    .from(proServices)
    .where(and(lte(proServices.expiryDate, futureDate), gte(proServices.expiryDate, new Date())))
    .orderBy(proServices.expiryDate);
}

export async function createProService(data: typeof proServices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(proServices).values(data);
  return result[0];
}

export async function updateProService(id: number, data: Partial<typeof proServices.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(proServices).set(data).where(eq(proServices.id, id));
}

// ─── MARKETPLACE ──────────────────────────────────────────────────────────────

export async function getMarketplaceProviders(filters?: { category?: string; search?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(marketplaceProviders.status, (filters?.status as any) || "active")];
  if (filters?.category) conditions.push(eq(marketplaceProviders.category, filters.category));
  if (filters?.search) {
    const s = filters.search;
    conditions.push(
      or(like(marketplaceProviders.businessName, `%${s}%`), like(marketplaceProviders.description, `%${s}%`))!
    );
  }
  return db.select().from(marketplaceProviders).where(and(...conditions)).orderBy(desc(marketplaceProviders.rating));
}

export async function getProviderById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(marketplaceProviders).where(eq(marketplaceProviders.id, id)).limit(1);
  return result[0];
}

export async function createProvider(data: typeof marketplaceProviders.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceProviders).values(data);
  return result[0];
}

export async function updateProvider(id: number, data: Partial<typeof marketplaceProviders.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(marketplaceProviders).set(data).where(eq(marketplaceProviders.id, id));
}

export async function getProviderServices(providerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketplaceServices).where(eq(marketplaceServices.providerId, providerId));
}

export async function getMarketplaceBookings(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(marketplaceBookings)
    .where(eq(marketplaceBookings.companyId, companyId))
    .orderBy(desc(marketplaceBookings.createdAt));
}

export async function createMarketplaceBooking(data: typeof marketplaceBookings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(marketplaceBookings).values(data);
  return result[0];
}

// ─── CONTRACTS ────────────────────────────────────────────────────────────────

export async function getContracts(companyId: number, filters?: { status?: string; type?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(contracts.companyId, companyId)];
  if (filters?.status) conditions.push(eq(contracts.status, filters.status as any));
  if (filters?.type) conditions.push(eq(contracts.type, filters.type as any));
  return db.select().from(contracts).where(and(...conditions)).orderBy(desc(contracts.createdAt));
}

export async function getAllContracts(filters?: { status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = filters?.status ? [eq(contracts.status, filters.status as any)] : [];
  return db
    .select()
    .from(contracts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(contracts.createdAt));
}

export async function getContractById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
  return result[0];
}

export async function createContract(data: typeof contracts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(contracts).values(data);
  return result[0];
}

export async function updateContract(id: number, data: Partial<typeof contracts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(contracts).set(data).where(eq(contracts.id, id));
}

export async function getContractTemplates(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = companyId
    ? [or(eq(contractTemplates.companyId, companyId), eq(contractTemplates.isGlobal, true))]
    : [eq(contractTemplates.isGlobal, true)];
  return db.select().from(contractTemplates).where(and(...conditions));
}

// ─── HR: EMPLOYEES ────────────────────────────────────────────────────────────

export async function getEmployees(companyId: number, filters?: { status?: string; department?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(employees.companyId, companyId)];
  if (filters?.status) conditions.push(eq(employees.status, filters.status as any));
  if (filters?.department) conditions.push(eq(employees.department, filters.department));
  return db.select().from(employees).where(and(...conditions)).orderBy(employees.firstName);
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result[0];
}

export async function createEmployee(data: typeof employees.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(employees).values(data);
  return result[0];
}

export async function updateEmployee(id: number, data: Partial<typeof employees.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(employees).set(data).where(eq(employees.id, id));
}

// ─── HR: JOB POSTINGS & APPLICATIONS ─────────────────────────────────────────

export async function getJobPostings(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobPostings).where(eq(jobPostings.companyId, companyId)).orderBy(desc(jobPostings.createdAt));
}

export async function createJobPosting(data: typeof jobPostings.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobPostings).values(data);
  return result[0];
}

export async function updateJobPosting(id: number, data: Partial<typeof jobPostings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobPostings).set(data).where(eq(jobPostings.id, id));
}

export async function getJobApplications(jobId?: number, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (jobId) conditions.push(eq(jobApplications.jobId, jobId));
  if (companyId) conditions.push(eq(jobApplications.companyId, companyId));
  return db
    .select()
    .from(jobApplications)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(jobApplications.createdAt));
}

export async function createJobApplication(data: typeof jobApplications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobApplications).values(data);
  return result[0];
}

export async function updateJobApplication(id: number, data: Partial<typeof jobApplications.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobApplications).set(data).where(eq(jobApplications.id, id));
}

// ─── HR: LEAVE REQUESTS ───────────────────────────────────────────────────────

export async function getLeaveRequests(companyId: number, employeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(leaveRequests.companyId, companyId)];
  if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId));
  return db.select().from(leaveRequests).where(and(...conditions)).orderBy(desc(leaveRequests.createdAt));
}

export async function createLeaveRequest(data: typeof leaveRequests.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(leaveRequests).values(data);
  return result[0];
}

export async function updateLeaveRequest(id: number, data: Partial<typeof leaveRequests.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id));
}

// ─── HR: PAYROLL ──────────────────────────────────────────────────────────────

export async function getPayrollRecords(companyId: number, year?: number, month?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(payrollRecords.companyId, companyId)];
  if (year) conditions.push(eq(payrollRecords.periodYear, year));
  if (month) conditions.push(eq(payrollRecords.periodMonth, month));
  return db.select().from(payrollRecords).where(and(...conditions)).orderBy(desc(payrollRecords.createdAt));
}

export async function createPayrollRecord(data: typeof payrollRecords.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(payrollRecords).values(data);
  return result[0];
}

export async function updatePayrollRecord(id: number, data: Partial<typeof payrollRecords.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(payrollRecords).set(data).where(eq(payrollRecords.id, id));
}

// ─── HR: PERFORMANCE REVIEWS ──────────────────────────────────────────────────

export async function getPerformanceReviews(companyId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(performanceReviews).where(eq(performanceReviews.companyId, companyId)).orderBy(desc(performanceReviews.createdAt));
}

export async function createPerformanceReview(data: typeof performanceReviews.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(performanceReviews).values(data);
  return result[0];
}

// ─── CRM: CONTACTS ────────────────────────────────────────────────────────────

export async function getCrmContacts(companyId: number, filters?: { status?: string; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmContacts.companyId, companyId)];
  if (filters?.status) conditions.push(eq(crmContacts.status, filters.status as any));
  if (filters?.search) {
    const s = filters.search;
    conditions.push(
      or(
        like(crmContacts.firstName, `%${s}%`),
        like(crmContacts.lastName, `%${s}%`),
        like(crmContacts.email, `%${s}%`),
        like(crmContacts.company, `%${s}%`)
      )!
    );
  }
  return db.select().from(crmContacts).where(and(...conditions)).orderBy(desc(crmContacts.createdAt));
}

export async function createCrmContact(data: typeof crmContacts.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmContacts).values(data);
  return result[0];
}

export async function updateCrmContact(id: number, data: Partial<typeof crmContacts.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(crmContacts).set(data).where(eq(crmContacts.id, id));
}

// ─── CRM: DEALS ───────────────────────────────────────────────────────────────

export async function getCrmDeals(companyId: number, filters?: { stage?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmDeals.companyId, companyId)];
  if (filters?.stage) conditions.push(eq(crmDeals.stage, filters.stage as any));
  return db.select().from(crmDeals).where(and(...conditions)).orderBy(desc(crmDeals.createdAt));
}

export async function createCrmDeal(data: typeof crmDeals.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmDeals).values(data);
  return result[0];
}

export async function updateCrmDeal(id: number, data: Partial<typeof crmDeals.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(crmDeals).set(data).where(eq(crmDeals.id, id));
}

// ─── CRM: COMMUNICATIONS ──────────────────────────────────────────────────────

export async function getCrmCommunications(companyId: number, contactId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(crmCommunications.companyId, companyId)];
  if (contactId) conditions.push(eq(crmCommunications.contactId, contactId));
  return db.select().from(crmCommunications).where(and(...conditions)).orderBy(desc(crmCommunications.createdAt));
}

export async function createCrmCommunication(data: typeof crmCommunications.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(crmCommunications).values(data);
  return result[0];
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export async function getUserNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function createNotification(data: typeof notifications.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

export async function createAuditLog(data: typeof auditLogs.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data);
}

export async function getAuditLogs(companyId?: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const conditions = companyId ? [eq(auditLogs.companyId, companyId)] : [];
  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

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

// ─── SYSTEM SETTINGS ─────────────────────────────────────────────────────────

export async function getSystemSettings(category?: string) {
  const db = await getDb();
  if (!db) return [];
  const { systemSettings } = await import("../drizzle/schema");
  const q = db.select().from(systemSettings);
  if (category) return q.where(eq(systemSettings.category, category));
  return q;
}

export async function upsertSystemSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { systemSettings } = await import("../drizzle/schema");
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy })
    .onDuplicateKeyUpdate({ set: { value, updatedBy } });
}

export async function upsertSystemSettings(settings: { key: string; value: string }[], updatedBy?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { systemSettings } = await import("../drizzle/schema");
  for (const s of settings) {
    await db
      .insert(systemSettings)
      .values({ key: s.key, value: s.value, updatedBy })
      .onDuplicateKeyUpdate({ set: { value: s.value, updatedBy } });
  }
}

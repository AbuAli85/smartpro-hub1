import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── USERS & RBAC ─────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  avatarUrl: text("avatarUrl"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  platformRole: mysqlEnum("platformRole", [
    "super_admin",
    "platform_admin",
    "company_admin",
    "company_member",
    "reviewer",
    "client",
  ])
    .default("client")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── COMPANIES (TENANTS) ──────────────────────────────────────────────────────

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  industry: varchar("industry", { length: 100 }),
  country: varchar("country", { length: 10 }).default("OM"),
  city: varchar("city", { length: 100 }),
  address: text("address"),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 255 }),
  logoUrl: text("logoUrl"),
  registrationNumber: varchar("registrationNumber", { length: 100 }),
  taxNumber: varchar("taxNumber", { length: 100 }),
  status: mysqlEnum("status", ["active", "suspended", "pending", "cancelled"]).default("active").notNull(),
  subscriptionPlanId: int("subscriptionPlanId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ─── COMPANY MEMBERSHIPS ──────────────────────────────────────────────────────

export const companyMembers = mysqlTable(
  "company_members",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", [
      "company_admin",
      "company_member",
      "reviewer",
      "client",
    ])
      .default("company_member")
      .notNull(),
    permissions: json("permissions").$type<string[]>().default([]),
    isActive: boolean("isActive").default(true).notNull(),
    invitedBy: int("invitedBy"),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cm_company").on(t.companyId),
    index("idx_cm_user").on(t.userId),
  ]
);

export type CompanyMember = typeof companyMembers.$inferSelect;

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    companyId: int("companyId"),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entityType", { length: 64 }).notNull(),
    entityId: int("entityId"),
    oldValues: json("oldValues"),
    newValues: json("newValues"),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_user").on(t.userId),
    index("idx_audit_company").on(t.companyId),
    index("idx_audit_entity").on(t.entityType, t.entityId),
  ]
);

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    companyId: int("companyId"),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    isRead: boolean("isRead").default(false).notNull(),
    link: varchar("link", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_notif_user").on(t.userId)]
);

// ─── SUBSCRIPTION PLANS ───────────────────────────────────────────────────────

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("nameAr", { length: 100 }),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  description: text("description"),
  priceMonthly: decimal("priceMonthly", { precision: 10, scale: 2 }).notNull(),
  priceAnnual: decimal("priceAnnual", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("OMR"),
  maxUsers: int("maxUsers").default(5),
  maxContracts: int("maxContracts").default(50),
  maxStorage: int("maxStorage").default(5120), // MB
  features: json("features").$type<string[]>().default([]),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

// ─── COMPANY SUBSCRIPTIONS ────────────────────────────────────────────────────

export const companySubscriptions = mysqlTable(
  "company_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    planId: int("planId").notNull(),
    status: mysqlEnum("status", ["active", "cancelled", "past_due", "trialing", "expired"]).default("active").notNull(),
    billingCycle: mysqlEnum("billingCycle", ["monthly", "annual"]).default("monthly").notNull(),
    currentPeriodStart: timestamp("currentPeriodStart").notNull(),
    currentPeriodEnd: timestamp("currentPeriodEnd").notNull(),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false),
    stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_sub_company").on(t.companyId)]
);

// ─── SUBSCRIPTION INVOICES ────────────────────────────────────────────────────

export const subscriptionInvoices = mysqlTable(
  "subscription_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    subscriptionId: int("subscriptionId").notNull(),
    invoiceNumber: varchar("invoiceNumber", { length: 50 }).notNull().unique(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    status: mysqlEnum("status", ["draft", "issued", "paid", "overdue", "cancelled"]).default("draft").notNull(),
    dueDate: timestamp("dueDate"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_inv_company").on(t.companyId)]
);

// ─── SANAD OFFICES ────────────────────────────────────────────────────────────

export const sanadOffices = mysqlTable("sanad_offices", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  licenseNumber: varchar("licenseNumber", { length: 100 }),
  location: varchar("location", { length: 255 }),
  city: varchar("city", { length: 100 }),
  governorate: varchar("governorate", { length: 100 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  managerId: int("managerId"),
  status: mysqlEnum("status", ["active", "inactive", "pending_approval", "suspended"]).default("pending_approval").notNull(),
  openingHours: json("openingHours"),
  services: json("services").$type<string[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SanadOffice = typeof sanadOffices.$inferSelect;

// ─── SANAD APPLICATIONS ───────────────────────────────────────────────────────

export const sanadApplications = mysqlTable(
  "sanad_applications",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    officeId: int("officeId"),
    applicantId: int("applicantId").notNull(),
    assignedToId: int("assignedToId"),
    applicationNumber: varchar("applicationNumber", { length: 50 }).notNull().unique(),
    type: mysqlEnum("type", [
      "visa",
      "labor_card",
      "commercial_registration",
      "work_permit",
      "residence_permit",
      "business_license",
      "other",
    ]).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "submitted",
      "under_review",
      "awaiting_documents",
      "processing",
      "approved",
      "rejected",
      "completed",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
    applicantName: varchar("applicantName", { length: 255 }),
    applicantNameAr: varchar("applicantNameAr", { length: 255 }),
    nationality: varchar("nationality", { length: 100 }),
    passportNumber: varchar("passportNumber", { length: 50 }),
    notes: text("notes"),
    rejectionReason: text("rejectionReason"),
    submittedAt: timestamp("submittedAt"),
    completedAt: timestamp("completedAt"),
    dueDate: timestamp("dueDate"),
    fees: decimal("fees", { precision: 10, scale: 2 }),
    documents: json("documents").$type<{ name: string; url: string; status: string }[]>().default([]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sanad_company").on(t.companyId),
    index("idx_sanad_status").on(t.status),
    index("idx_sanad_type").on(t.type),
  ]
);

export type SanadApplication = typeof sanadApplications.$inferSelect;

// ─── PRO SERVICES ─────────────────────────────────────────────────────────────

export const proServices = mysqlTable(
  "pro_services",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    requestedBy: int("requestedBy").notNull(),
    assignedProId: int("assignedProId"),
    serviceNumber: varchar("serviceNumber", { length: 50 }).notNull().unique(),
    serviceType: mysqlEnum("serviceType", [
      "visa_processing",
      "work_permit",
      "labor_card",
      "emirates_id",
      "oman_id",
      "residence_renewal",
      "visa_renewal",
      "permit_renewal",
      "document_attestation",
      "company_registration",
      "other",
    ]).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "assigned",
      "in_progress",
      "awaiting_documents",
      "submitted_to_authority",
      "approved",
      "rejected",
      "completed",
      "cancelled",
    ])
      .default("pending")
      .notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
    employeeName: varchar("employeeName", { length: 255 }),
    employeeNameAr: varchar("employeeNameAr", { length: 255 }),
    nationality: varchar("nationality", { length: 100 }),
    passportNumber: varchar("passportNumber", { length: 50 }),
    passportExpiry: timestamp("passportExpiry"),
    visaNumber: varchar("visaNumber", { length: 50 }),
    permitNumber: varchar("permitNumber", { length: 50 }),
    expiryDate: timestamp("expiryDate"),
    renewalAlertDays: int("renewalAlertDays").default(30),
    notes: text("notes"),
    fees: decimal("fees", { precision: 10, scale: 2 }),
    documents: json("documents").$type<{ name: string; url: string; status: string }[]>().default([]),
    completedAt: timestamp("completedAt"),
    dueDate: timestamp("dueDate"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pro_company").on(t.companyId),
    index("idx_pro_status").on(t.status),
    index("idx_pro_expiry").on(t.expiryDate),
  ]
);

export type ProService = typeof proServices.$inferSelect;

// ─── MARKETPLACE PROVIDERS ────────────────────────────────────────────────────

export const marketplaceProviders = mysqlTable(
  "marketplace_providers",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    companyId: int("companyId"),
    businessName: varchar("businessName", { length: 255 }).notNull(),
    businessNameAr: varchar("businessNameAr", { length: 255 }),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description"),
    descriptionAr: text("descriptionAr"),
    logoUrl: text("logoUrl"),
    coverUrl: text("coverUrl"),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 320 }),
    website: varchar("website", { length: 255 }),
    location: varchar("location", { length: 255 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 10 }).default("OM"),
    rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
    reviewCount: int("reviewCount").default(0),
    completedJobs: int("completedJobs").default(0),
    isVerified: boolean("isVerified").default(false),
    isFeatured: boolean("isFeatured").default(false),
    status: mysqlEnum("status", ["active", "inactive", "pending_review", "suspended"]).default("pending_review").notNull(),
    tags: json("tags").$type<string[]>().default([]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_mp_category").on(t.category),
    index("idx_mp_status").on(t.status),
    index("idx_mp_rating").on(t.rating),
  ]
);

export type MarketplaceProvider = typeof marketplaceProviders.$inferSelect;

// ─── MARKETPLACE SERVICES ─────────────────────────────────────────────────────

export const marketplaceServices = mysqlTable(
  "marketplace_services",
  {
    id: int("id").autoincrement().primaryKey(),
    providerId: int("providerId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("nameAr", { length: 255 }),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    price: decimal("price", { precision: 10, scale: 2 }),
    priceType: mysqlEnum("priceType", ["fixed", "hourly", "daily", "custom"]).default("fixed"),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    duration: int("duration"), // minutes
    isActive: boolean("isActive").default(true),
    tags: json("tags").$type<string[]>().default([]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_mps_provider").on(t.providerId)]
);

// ─── MARKETPLACE BOOKINGS ─────────────────────────────────────────────────────

export const marketplaceBookings = mysqlTable(
  "marketplace_bookings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    clientId: int("clientId").notNull(),
    providerId: int("providerId").notNull(),
    serviceId: int("serviceId").notNull(),
    bookingNumber: varchar("bookingNumber", { length: 50 }).notNull().unique(),
    status: mysqlEnum("status", [
      "pending",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "refunded",
    ])
      .default("pending")
      .notNull(),
    scheduledAt: timestamp("scheduledAt"),
    completedAt: timestamp("completedAt"),
    amount: decimal("amount", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    notes: text("notes"),
    rating: int("rating"),
    review: text("review"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_mb_company").on(t.companyId),
    index("idx_mb_client").on(t.clientId),
    index("idx_mb_provider").on(t.providerId),
  ]
);

export type MarketplaceBooking = typeof marketplaceBookings.$inferSelect;

// ─── CONTRACTS ────────────────────────────────────────────────────────────────

export const contracts = mysqlTable(
  "contracts",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    createdBy: int("createdBy").notNull(),
    contractNumber: varchar("contractNumber", { length: 50 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    titleAr: varchar("titleAr", { length: 255 }),
    type: mysqlEnum("type", [
      "employment",
      "service",
      "nda",
      "partnership",
      "vendor",
      "lease",
      "other",
    ]).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "pending_review",
      "pending_signature",
      "signed",
      "active",
      "expired",
      "terminated",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    partyAName: varchar("partyAName", { length: 255 }),
    partyBName: varchar("partyBName", { length: 255 }),
    value: decimal("value", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    startDate: timestamp("startDate"),
    endDate: timestamp("endDate"),
    signedAt: timestamp("signedAt"),
    content: text("content"),
    templateId: int("templateId"),
    googleDocId: varchar("googleDocId", { length: 255 }),
    pdfUrl: text("pdfUrl"),
    version: int("version").default(1),
    tags: json("tags").$type<string[]>().default([]),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_contract_company").on(t.companyId),
    index("idx_contract_status").on(t.status),
    index("idx_contract_type").on(t.type),
  ]
);

export type Contract = typeof contracts.$inferSelect;

// ─── CONTRACT TEMPLATES ───────────────────────────────────────────────────────

export const contractTemplates = mysqlTable("contract_templates", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  content: text("content"),
  variables: json("variables").$type<string[]>().default([]),
  isGlobal: boolean("isGlobal").default(false),
  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── CONTRACT SIGNATURES ──────────────────────────────────────────────────────

export const contractSignatures = mysqlTable("contract_signatures", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  signerName: varchar("signerName", { length: 255 }).notNull(),
  signerEmail: varchar("signerEmail", { length: 320 }).notNull(),
  signerRole: varchar("signerRole", { length: 100 }),
  status: mysqlEnum("status", ["pending", "signed", "declined", "expired"]).default("pending"),
  signedAt: timestamp("signedAt"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  signatureUrl: text("signatureUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── HR: EMPLOYEES ────────────────────────────────────────────────────────────

export const employees = mysqlTable(
  "employees",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    userId: int("userId"),
    employeeNumber: varchar("employeeNumber", { length: 50 }),
    firstName: varchar("firstName", { length: 100 }).notNull(),
    lastName: varchar("lastName", { length: 100 }).notNull(),
    firstNameAr: varchar("firstNameAr", { length: 100 }),
    lastNameAr: varchar("lastNameAr", { length: 100 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    nationality: varchar("nationality", { length: 100 }),
    passportNumber: varchar("passportNumber", { length: 50 }),
    nationalId: varchar("nationalId", { length: 50 }),
    department: varchar("department", { length: 100 }),
    position: varchar("position", { length: 100 }),
    managerId: int("managerId"),
    employmentType: mysqlEnum("employmentType", ["full_time", "part_time", "contract", "intern"]).default("full_time"),
    status: mysqlEnum("status", ["active", "on_leave", "terminated", "resigned"]).default("active").notNull(),
    hireDate: timestamp("hireDate"),
    terminationDate: timestamp("terminationDate"),
    salary: decimal("salary", { precision: 12, scale: 2 }),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    avatarUrl: text("avatarUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_emp_company").on(t.companyId),
    index("idx_emp_status").on(t.status),
    index("idx_emp_dept").on(t.department),
  ]
);

export type Employee = typeof employees.$inferSelect;

// ─── HR: JOB POSTINGS ─────────────────────────────────────────────────────────

export const jobPostings = mysqlTable(
  "job_postings",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    department: varchar("department", { length: 100 }),
    location: varchar("location", { length: 255 }),
    type: mysqlEnum("type", ["full_time", "part_time", "contract", "intern"]).default("full_time"),
    status: mysqlEnum("status", ["draft", "open", "closed", "on_hold"]).default("draft").notNull(),
    description: text("description"),
    requirements: text("requirements"),
    salaryMin: decimal("salaryMin", { precision: 10, scale: 2 }),
    salaryMax: decimal("salaryMax", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    applicationDeadline: timestamp("applicationDeadline"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_jp_company").on(t.companyId)]
);

// ─── HR: JOB APPLICATIONS ─────────────────────────────────────────────────────

export const jobApplications = mysqlTable(
  "job_applications",
  {
    id: int("id").autoincrement().primaryKey(),
    jobId: int("jobId").notNull(),
    companyId: int("companyId").notNull(),
    applicantName: varchar("applicantName", { length: 255 }).notNull(),
    applicantEmail: varchar("applicantEmail", { length: 320 }).notNull(),
    applicantPhone: varchar("applicantPhone", { length: 32 }),
    resumeUrl: text("resumeUrl"),
    coverLetter: text("coverLetter"),
    stage: mysqlEnum("stage", [
      "applied",
      "screening",
      "interview",
      "assessment",
      "offer",
      "hired",
      "rejected",
    ])
      .default("applied")
      .notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ja_job").on(t.jobId),
    index("idx_ja_company").on(t.companyId),
    index("idx_ja_stage").on(t.stage),
  ]
);

// ─── HR: LEAVE REQUESTS ───────────────────────────────────────────────────────

export const leaveRequests = mysqlTable(
  "leave_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId").notNull(),
    approvedBy: int("approvedBy"),
    leaveType: mysqlEnum("leaveType", ["annual", "sick", "emergency", "maternity", "paternity", "unpaid", "other"]).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    days: decimal("days", { precision: 4, scale: 1 }),
    reason: text("reason"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_lr_company").on(t.companyId),
    index("idx_lr_employee").on(t.employeeId),
  ]
);

// ─── HR: PAYROLL ──────────────────────────────────────────────────────────────

export const payrollRecords = mysqlTable(
  "payroll_records",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId").notNull(),
    periodMonth: int("periodMonth").notNull(),
    periodYear: int("periodYear").notNull(),
    basicSalary: decimal("basicSalary", { precision: 12, scale: 2 }).notNull(),
    allowances: decimal("allowances", { precision: 12, scale: 2 }).default("0"),
    deductions: decimal("deductions", { precision: 12, scale: 2 }).default("0"),
    taxAmount: decimal("taxAmount", { precision: 12, scale: 2 }).default("0"),
    netSalary: decimal("netSalary", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    status: mysqlEnum("status", ["draft", "approved", "paid"]).default("draft").notNull(),
    paidAt: timestamp("paidAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_pr_company").on(t.companyId),
    index("idx_pr_employee").on(t.employeeId),
    index("idx_pr_period").on(t.periodYear, t.periodMonth),
  ]
);

// ─── HR: PERFORMANCE REVIEWS ──────────────────────────────────────────────────

export const performanceReviews = mysqlTable("performance_reviews", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  reviewerId: int("reviewerId").notNull(),
  period: varchar("period", { length: 50 }).notNull(),
  overallScore: decimal("overallScore", { precision: 4, scale: 2 }),
  status: mysqlEnum("status", ["draft", "submitted", "acknowledged"]).default("draft").notNull(),
  strengths: text("strengths"),
  improvements: text("improvements"),
  goals: text("goals"),
  comments: text("comments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── CRM: CONTACTS ────────────────────────────────────────────────────────────

export const crmContacts = mysqlTable(
  "crm_contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    ownerId: int("ownerId"),
    firstName: varchar("firstName", { length: 100 }).notNull(),
    lastName: varchar("lastName", { length: 100 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    company: varchar("company", { length: 255 }),
    position: varchar("position", { length: 100 }),
    country: varchar("country", { length: 10 }),
    city: varchar("city", { length: 100 }),
    source: varchar("source", { length: 100 }),
    status: mysqlEnum("status", ["lead", "prospect", "customer", "inactive"]).default("lead").notNull(),
    tags: json("tags").$type<string[]>().default([]),
    notes: text("notes"),
    avatarUrl: text("avatarUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_crm_company").on(t.companyId),
    index("idx_crm_status").on(t.status),
  ]
);

export type CrmContact = typeof crmContacts.$inferSelect;

// ─── CRM: DEALS ───────────────────────────────────────────────────────────────

export const crmDeals = mysqlTable(
  "crm_deals",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    contactId: int("contactId"),
    ownerId: int("ownerId"),
    title: varchar("title", { length: 255 }).notNull(),
    value: decimal("value", { precision: 15, scale: 2 }),
    currency: varchar("currency", { length: 10 }).default("OMR"),
    stage: mysqlEnum("stage", [
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
    ])
      .default("lead")
      .notNull(),
    probability: int("probability").default(0),
    expectedCloseDate: timestamp("expectedCloseDate"),
    closedAt: timestamp("closedAt"),
    source: varchar("source", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_deal_company").on(t.companyId),
    index("idx_deal_stage").on(t.stage),
  ]
);

export type CrmDeal = typeof crmDeals.$inferSelect;

// ─── CRM: COMMUNICATIONS ──────────────────────────────────────────────────────

export const crmCommunications = mysqlTable(
  "crm_communications",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    contactId: int("contactId"),
    dealId: int("dealId"),
    userId: int("userId").notNull(),
    type: mysqlEnum("type", ["email", "call", "meeting", "note", "sms", "whatsapp"]).notNull(),
    subject: varchar("subject", { length: 255 }),
    content: text("content"),
    direction: mysqlEnum("direction", ["inbound", "outbound"]).default("outbound"),
    duration: int("duration"), // minutes for calls
    scheduledAt: timestamp("scheduledAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_comm_company").on(t.companyId),
    index("idx_comm_contact").on(t.contactId),
  ]
);

// ─── ANALYTICS: REPORTS ───────────────────────────────────────────────────────

export const analyticsReports = mysqlTable("analytics_reports", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  createdBy: int("createdBy").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  config: json("config"),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly", "quarterly"]).default("weekly"),
  channel: mysqlEnum("channel", ["email", "dashboard", "email_dashboard"]).default("dashboard"),
  recipients: text("recipients"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunAt: timestamp("lastRunAt"),
  status: mysqlEnum("status", ["active", "paused"]).default("active").notNull(),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalyticsReport = typeof analyticsReports.$inferSelect;

// ─── SYSTEM SETTINGS ─────────────────────────────────────────────────────────

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  category: varchar("category", { length: 50 }).default("general").notNull(),
  description: text("description"),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

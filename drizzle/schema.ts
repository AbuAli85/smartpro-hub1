import {
  boolean,
  char,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  unique,
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
    "regional_manager",
    "client_services",
    "finance_admin",
    "hr_admin",
    "company_admin",
    "company_member",
    "reviewer",
    "client",
    "external_auditor",
    "sanad_network_admin",
    "sanad_compliance_reviewer",
  ])
    .default("client")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
})

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
  // Extended Oman business profile
  crNumber: varchar("crNumber", { length: 100 }),
  occiNumber: varchar("occiNumber", { length: 100 }),
  municipalityLicenceNumber: varchar("municipalityLicenceNumber", { length: 100 }),
  laborCardNumber: varchar("laborCardNumber", { length: 100 }),
  pasiNumber: varchar("pasiNumber", { length: 100 }),
  bankName: varchar("bankName", { length: 255 }),
  bankAccountNumber: varchar("bankAccountNumber", { length: 100 }),
  bankIban: varchar("bankIban", { length: 50 }),
  omanisationTarget: decimal("omanisationTarget", { precision: 5, scale: 2 }),
  foundedYear: int("foundedYear"),
  description: text("description"),
  status: mysqlEnum("status", ["active", "suspended", "pending", "cancelled"]).default("active").notNull(),
  subscriptionPlanId: int("subscriptionPlanId"),
  expiryWarningDays: int("expiryWarningDays").default(30).notNull(),
  /** Per-role login redirect overrides. JSON: { hr_admin: "/hr/employees", finance_admin: "/payroll", ... } */
  roleRedirectSettings: json("roleRedirectSettings").$type<Record<string, string>>().default({}),
  /**
   * Optional extra sidebar/route prefixes per membership role (company admin–configured).
   * Keys: company_admin, hr_admin, finance_admin, company_member, reviewer, external_auditor.
   * Values: path prefixes (e.g. ["/hr/tasks", "/company/documents"]). Platform URLs are rejected on save.
   */
  roleNavExtensions: json("roleNavExtensions").$type<Record<string, string[]>>().default({}),
  /** Optional annual/sick/emergency caps for portal + HR leave balances; null = Oman portal defaults in shared code. */
  leavePolicyCaps: json("leavePolicyCaps").$type<Partial<Record<"annual" | "sick" | "emergency", number>> | null>(),
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
      "finance_admin",
      "hr_admin",
      "reviewer",
      "client",
      "external_auditor",
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

// ─── BUYER PORTAL — CUSTOMER ACCOUNTS (external buyer ↔ provider company) ─────

export const customerAccountStatusEnum = mysqlEnum("customer_account_status", [
  "draft",
  "active",
  "suspended",
  "closed",
]);

export const buyerMemberRoleEnum = mysqlEnum("buyer_member_role", [
  "buyer_admin",
  "buyer_finance",
  "buyer_operations",
  "buyer_viewer",
]);

export const buyerMemberStatusEnum = mysqlEnum("buyer_member_status", ["invited", "active", "revoked"]);

export const customerAccounts = mysqlTable(
  "customer_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    providerCompanyId: int("provider_company_id").notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    slug: varchar("slug", { length: 100 }),
    status: mysqlEnum("status", ["draft", "active", "suspended", "closed"]).notNull().default("active"),
    country: varchar("country", { length: 10 }).default("OM"),
    primaryContactEmail: varchar("primary_contact_email", { length: 320 }),
    primaryContactPhone: varchar("primary_contact_phone", { length: 32 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_ca_provider").on(t.providerCompanyId)],
);

export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type InsertCustomerAccount = typeof customerAccounts.$inferInsert;

export const customerAccountMembers = mysqlTable(
  "customer_account_members",
  {
    id: int("id").autoincrement().primaryKey(),
    customerAccountId: int("customer_account_id").notNull(),
    userId: int("user_id").notNull(),
    role: mysqlEnum("role", ["buyer_admin", "buyer_finance", "buyer_operations", "buyer_viewer"]).notNull(),
    status: mysqlEnum("status", ["invited", "active", "revoked"]).notNull().default("active"),
    invitedAt: timestamp("invited_at"),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cam_account").on(t.customerAccountId),
    index("idx_cam_user").on(t.userId),
    unique("uq_cam_account_user").on(t.customerAccountId, t.userId),
  ],
);

export type CustomerAccountMember = typeof customerAccountMembers.$inferSelect;
export type InsertCustomerAccountMember = typeof customerAccountMembers.$inferInsert;

/** Links PRO billing cycle invoices (`pro_billing_cycles.id`) to a buyer customer account. */
export const customerInvoiceLinks = mysqlTable(
  "customer_invoice_links",
  {
    id: int("id").autoincrement().primaryKey(),
    customerAccountId: int("customer_account_id").notNull(),
    /** `pro_billing_cycles.id` — provider invoice row scoped by `pro_billing_cycles.company_id`. */
    invoiceId: int("invoice_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_cil_account").on(t.customerAccountId),
    index("idx_cil_invoice").on(t.invoiceId),
    unique("uq_cil_account_invoice").on(t.customerAccountId, t.invoiceId),
  ],
);

export type CustomerInvoiceLink = typeof customerInvoiceLinks.$inferSelect;
export type InsertCustomerInvoiceLink = typeof customerInvoiceLinks.$inferInsert;

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
  // Provider type — what kind of service bureau this is
  providerType: mysqlEnum("providerType", [
    "pro_office",       // Public Relations Officer services
    "typing_centre",    // Document typing & translation
    "admin_bureau",     // General admin & government liaison
    "legal_services",   // Legal & notary services
    "attestation",      // Document attestation & legalisation
    "visa_services",    // Visa processing specialists
    "business_setup",   // Company formation & licensing
    "other",
  ]).default("pro_office").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("nameAr", { length: 255 }),
  description: text("description"),
  licenseNumber: varchar("licenseNumber", { length: 100 }),
  location: varchar("location", { length: 255 }),
  city: varchar("city", { length: 100 }),
  governorate: varchar("governorate", { length: 100 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  website: varchar("website", { length: 255 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  status: mysqlEnum("status", ["active", "inactive", "pending_approval", "suspended"]).default("active").notNull(),
  // Services offered by this provider (e.g. ["work_permit", "visa", "labor_card"])
  services: json("services").$type<string[]>().default([]),
  // Rating 1-5 (average of work order ratings)
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  totalOrders: int("totalOrders").default(0),
  openingHours: varchar("openingHours", { length: 255 }),
  isVerified: boolean("isVerified").default(false),
  notes: text("notes"),
  // Public marketplace fields
  isPublicListed: int("is_public_listed").default(0).notNull(),
  licenceNumber: varchar("licence_number", { length: 100 }),
  licenceExpiry: date("licence_expiry"),
  verifiedAt: timestamp("verified_at"),
  languages: varchar("languages", { length: 255 }).default("Arabic,English"),
  logoUrl: text("logo_url"),
  descriptionAr: text("description_ar"),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: int("total_reviews").default(0).notNull(),
  responseTimeHours: int("response_time_hours").default(24),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SanadOffice = typeof sanadOffices.$inferSelect;;

/** Per-user roles for a SANAD office (partner self-service RBAC). */
export const sanadOfficeMembers = mysqlTable(
  "sanad_office_members",
  {
    id: int("id").autoincrement().primaryKey(),
    sanadOfficeId: int("sanad_office_id")
      .notNull()
      .references(() => sanadOffices.id, { onDelete: "cascade" }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "manager", "staff"]).notNull().default("staff"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_sanad_office_member").on(t.sanadOfficeId, t.userId),
    index("idx_sanad_office_members_user").on(t.userId),
  ],
);
export type SanadOfficeMember = typeof sanadOfficeMembers.$inferSelect;

// ─── SANAD APPLICATIONS ───────────────────────────────────────────────────────

export const sanadApplications = mysqlTable(
  "sanad_applications",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    // The service provider (Sanad office) handling this work order
    providerId: int("providerId"),
    requestedById: int("requestedById").notNull(),
    assignedToId: int("assignedToId"),
    // Unique reference number for tracking
    referenceNumber: varchar("referenceNumber", { length: 50 }).notNull().unique(),
    // Type of government service being requested
    serviceType: mysqlEnum("serviceType", [
      "work_permit",
      "work_permit_renewal",
      "work_permit_cancellation",
      "labor_card",
      "labor_card_renewal",
      "residence_visa",
      "residence_visa_renewal",
      "visit_visa",
      "exit_reentry",
      "commercial_registration",
      "commercial_registration_renewal",
      "business_license",
      "document_typing",
      "document_translation",
      "document_attestation",
      "pasi_registration",
      "omanisation_report",
      "other",
    ]).notNull(),
    title: varchar("title", { length: 255 }),
    status: mysqlEnum("status", [
      "draft",
      "submitted",
      "in_progress",
      "awaiting_documents",
      "awaiting_payment",
      "completed",
      "rejected",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal"),
    // The person / employee this service is for
    beneficiaryName: varchar("beneficiaryName", { length: 255 }),
    beneficiaryNameAr: varchar("beneficiaryNameAr", { length: 255 }),
    nationality: varchar("nationality", { length: 100 }),
    passportNumber: varchar("passportNumber", { length: 50 }),
    employeeId: int("employeeId"),
    notes: text("notes"),
    providerNotes: text("providerNotes"),
    rejectionReason: text("rejectionReason"),
    submittedAt: timestamp("submittedAt"),
    completedAt: timestamp("completedAt"),
    dueDate: timestamp("dueDate"),
    fees: decimal("fees", { precision: 10, scale: 2 }),
    rating: int("rating"),  // 1-5 star rating given after completion
    ratingComment: text("ratingComment"),
    documents: json("documents").$type<{ name: string; url: string; status: string }[]>().default([]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sanad_company").on(t.companyId),
    index("idx_sanad_status").on(t.status),
    index("idx_sanad_service_type").on(t.serviceType),
    index("idx_sanad_provider").on(t.providerId),
  ]
);
export type SanadApplication = typeof sanadApplications.$inferSelect;;

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
    // Extended HR fields
    dateOfBirth: date("dateOfBirth"),
    gender: mysqlEnum("gender", ["male", "female"]),
    maritalStatus: mysqlEnum("maritalStatus", ["single", "married", "divorced", "widowed"]),
    profession: varchar("profession", { length: 150 }),
    visaNumber: varchar("visaNumber", { length: 50 }),
    visaExpiryDate: date("visaExpiryDate"),
    workPermitNumber: varchar("workPermitNumber", { length: 50 }),
    workPermitExpiryDate: date("workPermitExpiryDate"),
    pasiNumber: varchar("pasiNumber", { length: 50 }),
    bankName: varchar("bankName", { length: 255 }),
    bankAccountNumber: varchar("bankAccountNumber", { length: 100 }),
    emergencyContactName: varchar("emergencyContactName", { length: 255 }),
    emergencyContactPhone: varchar("emergencyContactPhone", { length: 32 }),
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

/** Employee self-service requests for HR-managed profile field corrections (system of record, not notifications-only). */
export const profileChangeRequests = mysqlTable(
  "profile_change_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId").notNull(),
    submittedByUserId: int("submittedByUserId").notNull(),
    fieldLabel: varchar("fieldLabel", { length: 100 }).notNull(),
    /** Canonical field identity (see shared/profileChangeRequestFieldKey.ts); `fieldLabel` stays display-only. */
    fieldKey: varchar("fieldKey", { length: 64 }).notNull().default("other"),
    requestedValue: varchar("requestedValue", { length: 500 }).notNull(),
    notes: varchar("notes", { length: 500 }),
    status: mysqlEnum("status", ["pending", "resolved", "rejected"]).default("pending").notNull(),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    resolvedAt: timestamp("resolvedAt"),
    resolvedByUserId: int("resolvedByUserId"),
    resolutionNote: varchar("resolutionNote", { length: 500 }),
  },
  (t) => [
    index("idx_pcr_company_employee").on(t.companyId, t.employeeId),
    index("idx_pcr_company_status").on(t.companyId, t.status),
    index("idx_pcr_employee_status_fieldkey").on(t.employeeId, t.status, t.fieldKey),
  ]
);
export type ProfileChangeRequest = typeof profileChangeRequests.$inferSelect;

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

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  employeeId: int("employeeId").notNull(),
  date: timestamp("date").notNull(),
  checkIn: timestamp("checkIn"),
  checkOut: timestamp("checkOut"),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "remote"]).default("present").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

/** First-class audit trail: HR attendance, corrections, manual check-in workflow, and self-service check-in/out. */
export const attendanceAudit = mysqlTable(
  "attendance_audit",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id"),
    hrAttendanceId: int("hr_attendance_id"),
    attendanceRecordId: int("attendance_record_id"),
    correctionId: int("correction_id"),
    manualCheckinRequestId: int("manual_checkin_request_id"),
    actorUserId: int("actor_user_id").notNull(),
    actorRole: varchar("actor_role", { length: 64 }),
    actionType: mysqlEnum("aa_action_type", [
      "hr_attendance_create",
      "hr_attendance_update",
      "hr_attendance_delete",
      "correction_approve",
      "correction_reject",
      "correction_submitted",
      "manual_checkin_approve",
      "manual_checkin_reject",
      "self_checkin_allowed",
      "self_checkin_denied",
      "self_checkout",
      "manual_checkin_submit",
      "force_checkout",
      "operational_issue_acknowledge",
      "operational_issue_resolve",
      "operational_issue_assign",
    ]).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: int("entity_id"),
    beforePayload: json("before_payload"),
    afterPayload: json("after_payload"),
    reason: text("reason"),
    source: mysqlEnum("aa_source", ["hr_panel", "employee_portal", "admin_panel", "system"])
      .notNull()
      .default("hr_panel"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_aa_company").on(t.companyId),
    index("idx_aa_actor").on(t.actorUserId),
    index("idx_aa_employee").on(t.employeeId),
    index("idx_aa_hr_att").on(t.hrAttendanceId),
    index("idx_aa_ar").on(t.attendanceRecordId),
    index("idx_aa_correction").on(t.correctionId),
    index("idx_aa_mcr").on(t.manualCheckinRequestId),
  ]
);
export type AttendanceAuditRow = typeof attendanceAudit.$inferSelect;
export type InsertAttendanceAudit = typeof attendanceAudit.$inferInsert;

/** HR triage / resolution for operational attendance exceptions (overdue checkout, missed shift, approvals). */
export const attendanceOperationalIssues = mysqlTable(
  "attendance_operational_issues",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    /** Muscat calendar day this issue belongs to (query/filter). */
    businessDateYmd: varchar("business_date_ymd", { length: 10 }).notNull(),
    issueKind: mysqlEnum("issue_kind", [
      "overdue_checkout",
      "missed_shift",
      "correction_pending",
      "manual_pending",
    ]).notNull(),
    /** Stable natural key, e.g. overdue_checkout:ar:123 */
    issueKey: varchar("issue_key", { length: 160 }).notNull(),
    attendanceRecordId: int("attendance_record_id"),
    scheduleId: int("schedule_id"),
    correctionId: int("correction_id"),
    manualCheckinRequestId: int("manual_checkin_request_id"),
    employeeId: int("employee_id"),
    status: mysqlEnum("status", ["open", "acknowledged", "resolved"]).notNull().default("open"),
    assignedToUserId: int("assigned_to_user_id"),
    acknowledgedByUserId: int("acknowledged_by_user_id"),
    acknowledgedAt: timestamp("acknowledged_at"),
    reviewedByUserId: int("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uq_aoi_company_issue_key").on(t.companyId, t.issueKey),
    index("idx_aoi_company_date").on(t.companyId, t.businessDateYmd),
    index("idx_aoi_employee").on(t.employeeId),
    index("idx_aoi_record").on(t.attendanceRecordId),
    index("idx_aoi_status").on(t.companyId, t.status),
  ],
);
export type AttendanceOperationalIssue = typeof attendanceOperationalIssues.$inferSelect;
export type InsertAttendanceOperationalIssue = typeof attendanceOperationalIssues.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFORCE & GOVERNMENT SERVICES HUB (MOL-Aligned)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── COMPANY BRANCHES ────────────────────────────────────────────────────────
export const companyBranches = mysqlTable(
  "company_branches",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    governmentBranchCode: varchar("governmentBranchCode", { length: 100 }),
    branchNameEn: varchar("branchNameEn", { length: 255 }),
    branchNameAr: varchar("branchNameAr", { length: 255 }),
    governorate: varchar("governorate", { length: 100 }),
    wilayat: varchar("wilayat", { length: 100 }),
    locality: varchar("locality", { length: 255 }),
    phone: varchar("phone", { length: 32 }),
    address: text("address"),
    isHeadquarters: boolean("isHeadquarters").default(false).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_branches_company").on(t.companyId),
    index("idx_branches_governorate").on(t.governorate),
  ]
);
export type CompanyBranch = typeof companyBranches.$inferSelect;
export type InsertCompanyBranch = typeof companyBranches.$inferInsert;

// ─── COMPANY GOVERNMENT ACCESS ────────────────────────────────────────────────
export const companyGovernmentAccess = mysqlTable(
  "company_government_access",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    provider: varchar("provider", { length: 50 }).default("mol").notNull(), // 'mol' | 'rcm' | 'rop'
    accessMode: mysqlEnum("accessMode", ["api", "rpa", "manual"]).default("manual").notNull(),
    credentialRef: varchar("credentialRef", { length: 255 }), // vault reference, never raw secret
    authorizedSignatoryName: varchar("authorizedSignatoryName", { length: 255 }),
    authorizedSignatoryCivilId: varchar("authorizedSignatoryCivilId", { length: 50 }),
    establishmentNumber: varchar("establishmentNumber", { length: 100 }),
    status: mysqlEnum("status", ["active", "inactive", "pending_verification", "suspended"]).default("pending_verification").notNull(),
    lastVerifiedAt: timestamp("lastVerifiedAt"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_gov_access_company").on(t.companyId),
    index("idx_gov_access_provider").on(t.provider),
  ]
);
export type CompanyGovernmentAccess = typeof companyGovernmentAccess.$inferSelect;
export type InsertCompanyGovernmentAccess = typeof companyGovernmentAccess.$inferInsert;

// ─── EMPLOYEE GOVERNMENT PROFILES ─────────────────────────────────────────────
export const employeeGovernmentProfiles = mysqlTable(
  "employee_government_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    employeeId: int("employeeId").notNull(),
    provider: varchar("provider", { length: 50 }).default("mol").notNull(),
    // Civil / Residency
    civilId: varchar("civilId", { length: 50 }),
    // Visa
    visaNumber: varchar("visaNumber", { length: 100 }),
    visaIssueDate: timestamp("visaIssueDate"),
    visaExpiryDate: timestamp("visaExpiryDate"),
    visaType: varchar("visaType", { length: 100 }),
    // Resident card
    residentCardNumber: varchar("residentCardNumber", { length: 100 }),
    residentCardExpiryDate: timestamp("residentCardExpiryDate"),
    // Labour card
    labourCardNumber: varchar("labourCardNumber", { length: 100 }),
    labourCardExpiryDate: timestamp("labourCardExpiryDate"),
    // Raw government payload (JSON snapshot)
    rawPayload: json("rawPayload"),
    lastSyncedAt: timestamp("lastSyncedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_egp_employee").on(t.employeeId),
    index("idx_egp_provider").on(t.provider),
    index("idx_egp_civil_id").on(t.civilId),
  ]
);
export type EmployeeGovernmentProfile = typeof employeeGovernmentProfiles.$inferSelect;
export type InsertEmployeeGovernmentProfile = typeof employeeGovernmentProfiles.$inferInsert;

// ─── WORK PERMITS ─────────────────────────────────────────────────────────────
export const workPermits = mysqlTable(
  "work_permits",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId").notNull(),
    branchId: int("branchId"),
    provider: varchar("provider", { length: 50 }).default("mol").notNull(),
    // MOL canonical identifiers
    workPermitNumber: varchar("workPermitNumber", { length: 100 }).notNull().unique(),
    labourAuthorisationNumber: varchar("labourAuthorisationNumber", { length: 100 }),
    // Dates
    issueDate: timestamp("issueDate"),
    expiryDate: timestamp("expiryDate"),
    graceDate: timestamp("graceDate"),
    statusDate: timestamp("statusDate"),
    durationMonths: int("durationMonths"),
    // Normalized status (PermitLifecycleStatus)
    permitStatus: mysqlEnum("permitStatus", [
      "active",
      "expiring_soon",
      "expired",
      "in_grace",
      "cancelled",
      "transferred",
      "pending_update",
      "unknown",
    ]).default("unknown").notNull(),
    transferStatus: varchar("transferStatus", { length: 100 }),
    skillLevel: varchar("skillLevel", { length: 100 }),
    // Occupation
    occupationCode: varchar("occupationCode", { length: 50 }),
    occupationTitleEn: varchar("occupationTitleEn", { length: 255 }),
    occupationTitleAr: varchar("occupationTitleAr", { length: 255 }),
    occupationClass: varchar("occupationClass", { length: 100 }),
    // Establishment activity
    activityCode: varchar("activityCode", { length: 50 }),
    activityNameEn: varchar("activityNameEn", { length: 255 }),
    activityNameAr: varchar("activityNameAr", { length: 255 }),
    // Work location
    workLocationGovernorate: varchar("workLocationGovernorate", { length: 100 }),
    workLocationWilayat: varchar("workLocationWilayat", { length: 100 }),
    workLocationArea: varchar("workLocationArea", { length: 255 }),
    // Government snapshot
    governmentSnapshot: json("governmentSnapshot"),
    lastSyncedAt: timestamp("lastSyncedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_wp_company").on(t.companyId),
    index("idx_wp_employee").on(t.employeeId),
    index("idx_wp_expiry").on(t.expiryDate),
    index("idx_wp_status").on(t.permitStatus),
    index("idx_wp_permit_number").on(t.workPermitNumber),
  ]
);
export type WorkPermit = typeof workPermits.$inferSelect;
export type InsertWorkPermit = typeof workPermits.$inferInsert;

// ─── EMPLOYEE DOCUMENTS (VAULT) ───────────────────────────────────────────────
export const employeeDocuments = mysqlTable(
  "employee_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId").notNull(),
    workPermitId: int("workPermitId"),
    documentType: mysqlEnum("documentType", [
      "mol_work_permit_certificate",
      "passport",
      "visa",
      "resident_card",
      "labour_card",
      "employment_contract",
      "civil_id",
      "medical_certificate",
      "photo",
      "other",
    ]).notNull(),
    fileUrl: text("fileUrl").notNull(),   // S3 CDN URL
    fileKey: varchar("fileKey", { length: 500 }).notNull(), // S3 key
    fileName: varchar("fileName", { length: 500 }).notNull(),
    mimeType: varchar("mimeType", { length: 100 }),
    fileSizeBytes: int("fileSizeBytes"),
    issuedAt: timestamp("issuedAt"),
    expiresAt: timestamp("expiresAt"),
    verificationStatus: mysqlEnum("verificationStatus", [
      "pending",
      "verified",
      "rejected",
      "expired",
    ]).default("pending").notNull(),
    source: mysqlEnum("source", ["uploaded", "government", "smartpro"]).default("uploaded").notNull(),
    metadata: json("metadata"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_edoc_company").on(t.companyId),
    index("idx_edoc_employee").on(t.employeeId),
    index("idx_edoc_work_permit").on(t.workPermitId),
    index("idx_edoc_expires").on(t.expiresAt),
    index("idx_edoc_type").on(t.documentType),
  ]
);
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
export type InsertEmployeeDocument = typeof employeeDocuments.$inferInsert;

// ─── GOVERNMENT SERVICE CASES ─────────────────────────────────────────────────
export const governmentServiceCases = mysqlTable(
  "government_service_cases",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    employeeId: int("employeeId"),
    workPermitId: int("workPermitId"),
    branchId: int("branchId"),
    // Case classification
    caseType: mysqlEnum("caseType", [
      "renewal",
      "amendment",
      "cancellation",
      "contract_registration",
      "employee_update",
      "document_update",
      "new_permit",
      "transfer",
    ]).notNull(),
    // Operational status (CaseStatus)
    caseStatus: mysqlEnum("caseStatus", [
      "draft",
      "awaiting_documents",
      "ready_for_submission",
      "submitted",
      "in_review",
      "action_required",
      "approved",
      "rejected",
      "completed",
      "cancelled",
    ]).default("draft").notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
    provider: varchar("provider", { length: 50 }).default("mol").notNull(),
    governmentReference: varchar("governmentReference", { length: 255 }),
    requestedBy: int("requestedBy"),
    assignedTo: int("assignedTo"),
    submittedAt: timestamp("submittedAt"),
    completedAt: timestamp("completedAt"),
    dueDate: timestamp("dueDate"),
    notes: text("notes"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_gsc_company").on(t.companyId),
    index("idx_gsc_employee").on(t.employeeId),
    index("idx_gsc_work_permit").on(t.workPermitId),
    index("idx_gsc_status").on(t.caseStatus),
    index("idx_gsc_type").on(t.caseType),
  ]
);
export type GovernmentServiceCase = typeof governmentServiceCases.$inferSelect;
export type InsertGovernmentServiceCase = typeof governmentServiceCases.$inferInsert;

// ─── CASE TASKS ───────────────────────────────────────────────────────────────
export const caseTasks = mysqlTable(
  "case_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    caseId: int("caseId").notNull(),
    taskType: varchar("taskType", { length: 100 }).notNull(),
    taskStatus: mysqlEnum("taskStatus", ["pending", "in_progress", "completed", "skipped", "blocked"]).default("pending").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    ownerUserId: int("ownerUserId"),
    dueAt: timestamp("dueAt"),
    completedAt: timestamp("completedAt"),
    sortOrder: int("sortOrder").default(0),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ct_case").on(t.caseId),
    index("idx_ct_status").on(t.taskStatus),
  ]
);
export type CaseTask = typeof caseTasks.$inferSelect;
export type InsertCaseTask = typeof caseTasks.$inferInsert;

// ─── GOVERNMENT SYNC JOBS ─────────────────────────────────────────────────────
export const governmentSyncJobs = mysqlTable(
  "government_sync_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    provider: varchar("provider", { length: 50 }).default("mol").notNull(),
    jobType: mysqlEnum("jobType", ["full_sync", "delta_sync", "single_permit", "employee_sync"]).notNull(),
    syncStatus: mysqlEnum("syncStatus", ["pending", "running", "success", "partial_success", "failed"]).default("pending").notNull(),
    mode: mysqlEnum("mode", ["full", "delta", "single"]).default("delta").notNull(),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    recordsFetched: int("recordsFetched").default(0).notNull(),
    recordsChanged: int("recordsChanged").default(0).notNull(),
    recordsFailed: int("recordsFailed").default(0).notNull(),
    errorCode: varchar("errorCode", { length: 100 }),
    errorMessage: text("errorMessage"),
    triggeredBy: int("triggeredBy"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_gsj_company").on(t.companyId),
    index("idx_gsj_status").on(t.syncStatus),
    index("idx_gsj_provider").on(t.provider),
  ]
);
export type GovernmentSyncJob = typeof governmentSyncJobs.$inferSelect;
export type InsertGovernmentSyncJob = typeof governmentSyncJobs.$inferInsert;

// ─── AUDIT EVENTS ─────────────────────────────────────────────────────────────
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("companyId").notNull(),
    actorUserId: int("actorUserId"),
    entityType: varchar("entityType", { length: 100 }).notNull(), // 'work_permit' | 'employee' | 'case' | ...
    entityId: int("entityId").notNull(),
    action: varchar("action", { length: 100 }).notNull(), // 'created' | 'updated' | 'certificate_ingested' | ...
    beforeState: json("beforeState"),
    afterState: json("afterState"),
    ipAddress: varchar("ipAddress", { length: 64 }),
    userAgent: text("userAgent"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ae_company").on(t.companyId),
    index("idx_ae_entity").on(t.entityType, t.entityId),
    index("idx_ae_actor").on(t.actorUserId),
    index("idx_ae_action").on(t.action),
  ]
);
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

// ─── WORKFORCE PERMIT STATUS TYPES (for type safety across app) ───────────────
export type PermitLifecycleStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "in_grace"
  | "cancelled"
  | "transferred"
  | "pending_update"
  | "unknown";

export type CaseStatusType =
  | "draft"
  | "awaiting_documents"
  | "ready_for_submission"
  | "submitted"
  | "in_review"
  | "action_required"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

// ─── SHARED OMANI PRO — OFFICER REGISTRY ─────────────────────────────────────
export const omaniProOfficers = mysqlTable(
  "omani_pro_officers",
  {
    id: int("id").autoincrement().primaryKey(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    fullNameAr: varchar("full_name_ar", { length: 255 }),
    civilId: varchar("civil_id", { length: 50 }),
    pasiNumber: varchar("pasi_number", { length: 100 }),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 255 }),
    sanadOfficeId: int("sanad_office_id"),
    employmentTrack: mysqlEnum("employment_track", ["platform", "sanad"]).notNull().default("platform"),
    monthlySalary: decimal("monthly_salary", { precision: 10, scale: 3 }).notNull().default("500.000"),
    maxCompanies: int("max_companies").notNull().default(10),
    status: mysqlEnum("status", ["active", "inactive", "on_leave", "terminated"]).notNull().default("active"),
    qualifications: text("qualifications"),
    notes: text("notes"),
    hiredAt: timestamp("hired_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_opo_status").on(t.status), index("idx_opo_track").on(t.employmentTrack)]
);
export type OmaniProOfficer = typeof omaniProOfficers.$inferSelect;
export type InsertOmaniProOfficer = typeof omaniProOfficers.$inferInsert;

// ─── SHARED OMANI PRO — COMPANY ASSIGNMENTS ───────────────────────────────────
export const officerCompanyAssignments = mysqlTable(
  "officer_company_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    officerId: int("officer_id").notNull(),
    companyId: int("company_id").notNull(),
    monthlyFee: decimal("monthly_fee", { precision: 10, scale: 3 }).notNull().default("100.000"),
    status: mysqlEnum("status", ["active", "suspended", "terminated"]).notNull().default("active"),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    terminatedAt: timestamp("terminated_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_oca_officer").on(t.officerId),
    index("idx_oca_company").on(t.companyId),
    index("idx_oca_status").on(t.status),
  ]
);
export type OfficerCompanyAssignment = typeof officerCompanyAssignments.$inferSelect;
export type InsertOfficerCompanyAssignment = typeof officerCompanyAssignments.$inferInsert;

// ─── SHARED OMANI PRO — COMPLIANCE CERTIFICATES ──────────────────────────────
export const complianceCertificates = mysqlTable(
  "compliance_certificates",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    officerId: int("officer_id").notNull(),
    periodMonth: int("period_month").notNull(),
    periodYear: int("period_year").notNull(),
    pdfUrl: varchar("pdf_url", { length: 1024 }),
    certificateNumber: varchar("certificate_number", { length: 100 }),
    workOrderCount: int("work_order_count").notNull().default(0),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_cc_company").on(t.companyId),
    index("idx_cc_officer").on(t.officerId),
  ]
);
export type ComplianceCertificate = typeof complianceCertificates.$inferSelect;
export type InsertComplianceCertificate = typeof complianceCertificates.$inferInsert;

// ─── SANAD SERVICE CATALOGUE ──────────────────────────────────────────────────
export const sanadServiceCatalogue = mysqlTable(
  "sanad_service_catalogue",
  {
    id: int("id").autoincrement().primaryKey(),
    officeId: int("office_id").notNull(),
    serviceType: varchar("service_type", { length: 100 }).notNull(),
    serviceName: varchar("service_name", { length: 255 }).notNull(),
    serviceNameAr: varchar("service_name_ar", { length: 255 }),
    priceOmr: decimal("price_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    processingDays: int("processing_days").notNull().default(3),
    description: text("description"),
    descriptionAr: text("description_ar"),
    isActive: int("is_active").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ssc_office").on(t.officeId),
    index("idx_ssc_type").on(t.serviceType),
    index("idx_ssc_active").on(t.isActive),
  ]
);
export type SanadServiceCatalogueItem = typeof sanadServiceCatalogue.$inferSelect;
export type InsertSanadServiceCatalogueItem = typeof sanadServiceCatalogue.$inferInsert;

// ─── SANAD SERVICE REQUESTS ───────────────────────────────────────────────────
export const sanadServiceRequests = mysqlTable(
  "sanad_service_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    officeId: int("office_id").notNull(),
    requesterCompanyId: int("requester_company_id"),
    requesterUserId: int("requester_user_id"),
    serviceType: varchar("service_type", { length: 100 }).notNull(),
    serviceCatalogueId: int("service_catalogue_id"),
    contactName: varchar("contact_name", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }),
    companyName: varchar("company_name", { length: 255 }),
    companyCr: varchar("company_cr", { length: 100 }),
    message: text("message"),
    status: mysqlEnum("status", ["new", "contacted", "in_progress", "completed", "declined"]).notNull().default("new"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ssr_office").on(t.officeId),
    index("idx_ssr_status").on(t.status),
    index("idx_ssr_created").on(t.createdAt),
  ]
);
export type SanadServiceRequest = typeof sanadServiceRequests.$inferSelect;
export type InsertSanadServiceRequest = typeof sanadServiceRequests.$inferInsert;

// ─── SHARED OMANI PRO — BILLING CYCLES ───────────────────────────────────────
export const proBillingCycles = mysqlTable(
  "pro_billing_cycles",
  {
    id: int("id").autoincrement().primaryKey(),
    officerId: int("officer_id").notNull(),
    companyId: int("company_id").notNull(),
    assignmentId: int("assignment_id").notNull(),
    billingMonth: int("billing_month").notNull(), // 1-12
    billingYear: int("billing_year").notNull(),
    amountOmr: decimal("amount_omr", { precision: 10, scale: 3 }).notNull().default("100.000"),
    status: mysqlEnum("status", ["pending", "paid", "overdue", "cancelled", "waived"]).notNull().default("pending"),
    invoiceNumber: varchar("invoice_number", { length: 100 }).notNull().unique(),
    paidAt: timestamp("paid_at"),
    dueDate: timestamp("due_date"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pbc_officer").on(t.officerId),
    index("idx_pbc_company").on(t.companyId),
    index("idx_pbc_status").on(t.status),
    index("idx_pbc_period").on(t.billingYear, t.billingMonth),
  ]
);
export type ProBillingCycle = typeof proBillingCycles.$inferSelect;
export type InsertProBillingCycle = typeof proBillingCycles.$inferInsert;

/** Tenant-scoped collection workflow state for receivables execution (PRO cycles + subscription invoices). */
export const collectionWorkItems = mysqlTable(
  "collection_work_items",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    sourceType: mysqlEnum("source_type", ["pro_billing_cycle", "subscription_invoice"]).notNull(),
    sourceId: int("source_id").notNull(),
    workflowStatus: mysqlEnum("workflow_status", [
      "needs_follow_up",
      "promised_to_pay",
      "escalated",
      "disputed",
      "resolved",
    ])
      .notNull()
      .default("needs_follow_up"),
    note: text("note"),
    updatedByUserId: int("updated_by_user_id"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uniq_collection_work_source").on(t.sourceType, t.sourceId),
    index("idx_cwi_company").on(t.companyId),
  ],
);
export type CollectionWorkItem = typeof collectionWorkItems.$inferSelect;
export type InsertCollectionWorkItem = typeof collectionWorkItems.$inferInsert;

// ─── SHARED OMANI PRO — OFFICER PAYOUTS ──────────────────────────────────────
export const officerPayouts = mysqlTable(
  "officer_payouts",
  {
    id: int("id").autoincrement().primaryKey(),
    officerId: int("officer_id").notNull(),
    payoutMonth: int("payout_month").notNull(), // 1-12
    payoutYear: int("payout_year").notNull(),
    employmentTrack: mysqlEnum("employment_track", ["platform", "sanad"]).notNull().default("platform"),
    // Track A (platform): commission-based
    totalCollectedOmr: decimal("total_collected_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    commissionPct: decimal("commission_pct", { precision: 5, scale: 2 }).default("12.50"), // 10-15%
    commissionOmr: decimal("commission_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    // Track B (sanad): fixed salary
    fixedSalaryOmr: decimal("fixed_salary_omr", { precision: 10, scale: 3 }).default("600.000"),
    // Final payout
    grossOmr: decimal("gross_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    deductionsOmr: decimal("deductions_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    netOmr: decimal("net_omr", { precision: 10, scale: 3 }).notNull().default("0"),
    status: mysqlEnum("status", ["pending", "approved", "paid", "on_hold"]).notNull().default("pending"),
    paidAt: timestamp("paid_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_op_officer").on(t.officerId),
    index("idx_op_status").on(t.status),
    index("idx_op_period").on(t.payoutYear, t.payoutMonth),
  ]
);
export type OfficerPayout = typeof officerPayouts.$inferSelect;
export type InsertOfficerPayout = typeof officerPayouts.$inferInsert;

// ─── AUTOMATED RENEWAL WORKFLOWS ─────────────────────────────────────────────
export const renewalWorkflowRules = mysqlTable(
  "renewal_workflow_rules",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id"), // null = platform-wide default rule
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    entityType: mysqlEnum("entity_type", [
      "work_permit", "visa", "resident_card", "labour_card",
      "sanad_licence", "officer_document", "employee_document", "pro_service"
    ]).notNull(),
    triggerDaysBefore: int("trigger_days_before").notNull().default(30), // 90/60/30/7
    autoCreateCase: boolean("auto_create_case").notNull().default(true),
    autoAssignOfficer: boolean("auto_assign_officer").notNull().default(false),
    notifyClient: boolean("notify_client").notNull().default(true),
    notifyOwner: boolean("notify_owner").notNull().default(true),
    caseType: mysqlEnum("case_type", [
      "renewal", "amendment", "cancellation", "contract_registration",
      "employee_update", "document_update", "new_permit", "transfer"
    ]).notNull().default("renewal"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: int("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_rwr_company").on(t.companyId),
    index("idx_rwr_entity").on(t.entityType),
    index("idx_rwr_active").on(t.isActive),
  ]
);
export type RenewalWorkflowRule = typeof renewalWorkflowRules.$inferSelect;
export type InsertRenewalWorkflowRule = typeof renewalWorkflowRules.$inferInsert;

export const renewalWorkflowRuns = mysqlTable(
  "renewal_workflow_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    ruleId: int("rule_id").notNull(),
    companyId: int("company_id").notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: int("entity_id").notNull(),
    entityLabel: varchar("entity_label", { length: 255 }),
    expiryDate: timestamp("expiry_date").notNull(),
    daysBeforeExpiry: int("days_before_expiry").notNull(),
    status: mysqlEnum("status", ["pending", "triggered", "case_created", "skipped", "failed"]).notNull().default("pending"),
    caseId: int("case_id"), // created government_service_case id
    assignedOfficerId: int("assigned_officer_id"),
    triggeredAt: timestamp("triggered_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_rwrun_rule").on(t.ruleId),
    index("idx_rwrun_company").on(t.companyId),
    index("idx_rwrun_entity").on(t.entityType, t.entityId),
    index("idx_rwrun_status").on(t.status),
    index("idx_rwrun_expiry").on(t.expiryDate),
  ]
);
export type RenewalWorkflowRun = typeof renewalWorkflowRuns.$inferSelect;
export type InsertRenewalWorkflowRun = typeof renewalWorkflowRuns.$inferInsert;

// ─── Sanad Ratings & Reviews ──────────────────────────────────────────────────

export const sanadRatings = mysqlTable(
  "sanad_ratings",
  {
    id: int("id").autoincrement().primaryKey(),
    officeId: int("office_id").notNull(),
    companyId: int("company_id").notNull(),
    reviewerUserId: int("reviewer_user_id").notNull(),
    serviceRequestId: int("service_request_id"), // optional link to a sanad_service_requests row
    overallRating: int("overall_rating").notNull(), // 1-5
    speedRating: int("speed_rating"), // 1-5
    qualityRating: int("quality_rating"), // 1-5
    communicationRating: int("communication_rating"), // 1-5
    reviewTitle: varchar("review_title", { length: 255 }),
    reviewBody: text("review_body"),
    isVerified: boolean("is_verified").default(false).notNull(), // verified = linked to a completed service request
    isPublished: boolean("is_published").default(true).notNull(), // moderation flag
    moderationNote: text("moderation_note"),
    moderatedBy: int("moderated_by"),
    moderatedAt: timestamp("moderated_at"),
    helpfulCount: int("helpful_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_srating_office").on(t.officeId),
    index("idx_srating_company").on(t.companyId),
    index("idx_srating_published").on(t.isPublished),
    index("idx_srating_verified").on(t.isVerified),
  ]
);
export type SanadRating = typeof sanadRatings.$inferSelect;
export type InsertSanadRating = typeof sanadRatings.$inferInsert;

export const sanadRatingReplies = mysqlTable(
  "sanad_rating_replies",
  {
    id: int("id").autoincrement().primaryKey(),
    ratingId: int("rating_id").notNull(),
    repliedByUserId: int("replied_by_user_id").notNull(),
    replyBody: text("reply_body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_srreply_rating").on(t.ratingId),
  ]
);
export type SanadRatingReply = typeof sanadRatingReplies.$inferSelect;
export type InsertSanadRatingReply = typeof sanadRatingReplies.$inferInsert;

// ─── PAYROLL ENGINE ────────────────────────────────────────────────────────────
export const payrollRuns = mysqlTable(
  "payroll_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    periodMonth: int("period_month").notNull(),
    periodYear: int("period_year").notNull(),
    runDate: timestamp("run_date").defaultNow().notNull(),
    status: mysqlEnum("status", [
      "draft",
      "processing",
      "approved",
      "paid",
      "cancelled",
      "pending_execution",
      "locked",
      "wps_generated",
      "ready_for_upload",
    ])
      .default("draft")
      .notNull(),
    totalGross: decimal("total_gross", { precision: 14, scale: 3 }).default("0"),
    totalDeductions: decimal("total_deductions", { precision: 14, scale: 3 }).default("0"),
    totalNet: decimal("total_net", { precision: 14, scale: 3 }).default("0"),
    employeeCount: int("employee_count").default(0),
    notes: text("notes"),
    createdByUserId: int("created_by_user_id"),
    approvedByUserId: int("approved_by_user_id"),
    approvedAt: timestamp("approved_at"),
    paidAt: timestamp("paid_at"),
    wpsFileUrl: varchar("wps_file_url", { length: 1024 }),
    wpsFileKey: varchar("wps_file_key", { length: 512 }),
    wpsSubmittedAt: timestamp("wps_submitted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_payrun_company").on(t.companyId),
    index("idx_payrun_period").on(t.periodYear, t.periodMonth),
    index("idx_payrun_status").on(t.status),
  ]
);
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = typeof payrollRuns.$inferInsert;

export const payrollLineItems = mysqlTable(
  "payroll_line_items",
  {
    id: int("id").autoincrement().primaryKey(),
    payrollRunId: int("payroll_run_id").notNull(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id").notNull(),
    basicSalary: decimal("basic_salary", { precision: 12, scale: 3 }).notNull(),
    housingAllowance: decimal("housing_allowance", { precision: 12, scale: 3 }).default("0"),
    transportAllowance: decimal("transport_allowance", { precision: 12, scale: 3 }).default("0"),
    otherAllowances: decimal("other_allowances", { precision: 12, scale: 3 }).default("0"),
    overtimePay: decimal("overtime_pay", { precision: 12, scale: 3 }).default("0"),
    commissionPay: decimal("commission_pay", { precision: 12, scale: 3 }).default("0"),
    grossSalary: decimal("gross_salary", { precision: 12, scale: 3 }).notNull(),
    pasiDeduction: decimal("pasi_deduction", { precision: 12, scale: 3 }).default("0"),
    incomeTax: decimal("income_tax", { precision: 12, scale: 3 }).default("0"),
    loanDeduction: decimal("loan_deduction", { precision: 12, scale: 3 }).default("0"),
    absenceDeduction: decimal("absence_deduction", { precision: 12, scale: 3 }).default("0"),
    otherDeductions: decimal("other_deductions", { precision: 12, scale: 3 }).default("0"),
    totalDeductions: decimal("total_deductions", { precision: 12, scale: 3 }).notNull(),
    netSalary: decimal("net_salary", { precision: 12, scale: 3 }).notNull(),
    bankAccount: varchar("bank_account", { length: 50 }),
    bankName: varchar("bank_name", { length: 100 }),
    ibanNumber: varchar("iban_number", { length: 34 }),
    payslipUrl: varchar("payslip_url", { length: 1024 }),
    payslipKey: varchar("payslip_key", { length: 512 }),
    status: mysqlEnum("status", ["pending", "paid", "failed", "on_hold"]).default("pending").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_pli_run").on(t.payrollRunId),
    index("idx_pli_employee").on(t.employeeId),
    index("idx_pli_company").on(t.companyId),
  ]
);
export type PayrollLineItem = typeof payrollLineItems.$inferSelect;
export type InsertPayrollLineItem = typeof payrollLineItems.$inferInsert;

// ─── CLIENT SERVICE INVOICING (tenant → external client) ─────────────────────
export const clientServiceInvoices = mysqlTable(
  "client_service_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    clientKey: varchar("client_key", { length: 255 }).notNull(),
    clientDisplayName: varchar("client_display_name", { length: 255 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull().unique(),
    periodYear: int("period_year").notNull(),
    periodMonth: int("period_month").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    subtotalOmr: decimal("subtotal_omr", { precision: 14, scale: 3 }).notNull().default("0"),
    vatOmr: decimal("vat_omr", { precision: 14, scale: 3 }).notNull().default("0"),
    totalOmr: decimal("total_omr", { precision: 14, scale: 3 }).notNull().default("0"),
    amountPaidOmr: decimal("amount_paid_omr", { precision: 14, scale: 3 }).notNull().default("0"),
    balanceOmr: decimal("balance_omr", { precision: 14, scale: 3 }).notNull().default("0"),
    status: mysqlEnum("status", ["draft", "sent", "partial", "paid", "overdue", "void"])
      .notNull()
      .default("draft"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uq_client_invoice_period").on(t.companyId, t.clientKey, t.periodYear, t.periodMonth),
    index("idx_csi_company_status").on(t.companyId, t.status),
    index("idx_csi_company_due").on(t.companyId, t.dueDate),
  ]
);
export type ClientServiceInvoice = typeof clientServiceInvoices.$inferSelect;
export type InsertClientServiceInvoice = typeof clientServiceInvoices.$inferInsert;

export const clientInvoiceLineItems = mysqlTable(
  "client_invoice_line_items",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoice_id").notNull(),
    attendanceSiteId: int("attendance_site_id"),
    description: varchar("description", { length: 512 }).notNull(),
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    unitRateOmr: decimal("unit_rate_omr", { precision: 14, scale: 3 }).notNull(),
    lineTotalOmr: decimal("line_total_omr", { precision: 14, scale: 3 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_cili_invoice").on(t.invoiceId)]
);
export type ClientInvoiceLineItem = typeof clientInvoiceLineItems.$inferSelect;
export type InsertClientInvoiceLineItem = typeof clientInvoiceLineItems.$inferInsert;

export const invoicePaymentRecords = mysqlTable(
  "invoice_payment_records",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoice_id").notNull(),
    amountOmr: decimal("amount_omr", { precision: 14, scale: 3 }).notNull(),
    paidAt: timestamp("paid_at").notNull(),
    paymentMethod: mysqlEnum("payment_method", ["bank", "cash", "card", "other"]).notNull().default("bank"),
    reference: varchar("reference", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_ipr_invoice").on(t.invoiceId)]
);
export type InvoicePaymentRecord = typeof invoicePaymentRecords.$inferSelect;
export type InsertInvoicePaymentRecord = typeof invoicePaymentRecords.$inferInsert;

// ─── RECRUITMENT: INTERVIEW SCHEDULES ─────────────────────────────────────────
export const interviewSchedules = mysqlTable(
  "interview_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    applicationId: int("application_id").notNull(),
    companyId: int("company_id").notNull(),
    interviewType: mysqlEnum("interview_type", ["phone", "video", "in_person", "technical", "panel"]).default("video").notNull(),
    scheduledAt: timestamp("scheduled_at").notNull(),
    durationMinutes: int("duration_minutes").default(60),
    location: varchar("location", { length: 512 }),
    meetingLink: varchar("meeting_link", { length: 1024 }),
    interviewerNames: text("interviewer_names"),
    status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show"]).default("scheduled").notNull(),
    feedback: text("feedback"),
    rating: int("rating"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_is_application").on(t.applicationId),
    index("idx_is_company").on(t.companyId),
    index("idx_is_scheduled").on(t.scheduledAt),
  ]
);
export type InterviewSchedule = typeof interviewSchedules.$inferSelect;
export type InsertInterviewSchedule = typeof interviewSchedules.$inferInsert;

// ─── RECRUITMENT: OFFER LETTERS ────────────────────────────────────────────────
export const offerLetters = mysqlTable(
  "offer_letters",
  {
    id: int("id").autoincrement().primaryKey(),
    applicationId: int("application_id").notNull(),
    companyId: int("company_id").notNull(),
    jobId: int("job_id").notNull(),
    applicantName: varchar("applicant_name", { length: 255 }).notNull(),
    applicantEmail: varchar("applicant_email", { length: 320 }).notNull(),
    position: varchar("position", { length: 255 }).notNull(),
    department: varchar("department", { length: 100 }),
    startDate: timestamp("start_date"),
    basicSalary: decimal("basic_salary", { precision: 12, scale: 3 }).notNull(),
    housingAllowance: decimal("housing_allowance", { precision: 12, scale: 3 }).default("0"),
    transportAllowance: decimal("transport_allowance", { precision: 12, scale: 3 }).default("0"),
    otherAllowances: decimal("other_allowances", { precision: 12, scale: 3 }).default("0"),
    totalPackage: decimal("total_package", { precision: 12, scale: 3 }).notNull(),
    probationMonths: int("probation_months").default(3),
    annualLeave: int("annual_leave").default(21),
    additionalTerms: text("additional_terms"),
    status: mysqlEnum("status", ["draft", "sent", "accepted", "rejected", "expired"]).default("draft").notNull(),
    sentAt: timestamp("sent_at"),
    respondedAt: timestamp("responded_at"),
    expiresAt: timestamp("expires_at"),
    letterUrl: varchar("letter_url", { length: 1024 }),
    letterKey: varchar("letter_key", { length: 512 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_ol_application").on(t.applicationId),
    index("idx_ol_company").on(t.companyId),
    index("idx_ol_status").on(t.status),
  ]
);
export type OfferLetter = typeof offerLetters.$inferSelect;
export type InsertOfferLetter = typeof offerLetters.$inferInsert;

// ─── E-SIGNATURE AUDIT TRAIL ─────────────────────────────────────────────────
export const contractSignatureAudit = mysqlTable("contract_signature_audit", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contract_id").notNull(),
  signatureId: int("signature_id"),
  event: mysqlEnum("event", [
    "requested", "viewed", "signed", "declined", "expired", "reminder_sent", "completed"
  ]).notNull(),
  actorName: varchar("actor_name", { length: 255 }),
  actorEmail: varchar("actor_email", { length: 320 }),
  actorUserId: int("actor_user_id"),
  actorType: mysqlEnum("actor_type", ["user", "external", "system"])
    .default("external")
    .notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: varchar("user_agent", { length: 512 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ContractSignatureAudit = typeof contractSignatureAudit.$inferSelect;

// ─── EMPLOYEE SALARY CONFIG ───────────────────────────────────────────────────
export const employeeSalaryConfigs = mysqlTable("employee_salary_configs", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  companyId: int("company_id").notNull(),
  basicSalary: decimal("basic_salary", { precision: 10, scale: 3 }).notNull().default("0.000"),
  housingAllowance: decimal("housing_allowance", { precision: 10, scale: 3 }).notNull().default("0.000"),
  transportAllowance: decimal("transport_allowance", { precision: 10, scale: 3 }).notNull().default("0.000"),
  otherAllowances: decimal("other_allowances", { precision: 10, scale: 3 }).notNull().default("0.000"),
  pasiRate: decimal("pasi_rate", { precision: 5, scale: 2 }).notNull().default("11.50"),
  incomeTaxRate: decimal("income_tax_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type EmployeeSalaryConfig = typeof employeeSalaryConfigs.$inferSelect;
export type InsertEmployeeSalaryConfig = typeof employeeSalaryConfigs.$inferInsert;

// ─── SALARY LOANS ─────────────────────────────────────────────────────────────
export const salaryLoans = mysqlTable("salary_loans", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id").notNull(),
  companyId: int("company_id").notNull(),
  loanAmount: decimal("loan_amount", { precision: 10, scale: 3 }).notNull(),
  monthlyDeduction: decimal("monthly_deduction", { precision: 10, scale: 3 }).notNull(),
  balanceRemaining: decimal("balance_remaining", { precision: 10, scale: 3 }).notNull(),
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).notNull().default("active"),
  startMonth: int("start_month").notNull(),
  startYear: int("start_year").notNull(),
  reason: varchar("reason", { length: 500 }),
  approvedBy: int("approved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type SalaryLoan = typeof salaryLoans.$inferSelect;
export type InsertSalaryLoan = typeof salaryLoans.$inferInsert;

// ─── CLIENT PORTAL TOKENS ─────────────────────────────────────────────────────
export const clientPortalTokens = mysqlTable("client_portal_tokens", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 255 }),
  createdBy: int("created_by").notNull(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ClientPortalToken = typeof clientPortalTokens.$inferSelect;
export type InsertClientPortalToken = typeof clientPortalTokens.$inferInsert;

// ─── CLIENT MESSAGES ──────────────────────────────────────────────────────────
export const clientMessages = mysqlTable("client_messages", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  senderUserId: int("sender_user_id"),
  senderName: varchar("sender_name", { length: 255 }),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  isFromClient: boolean("is_from_client").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ClientMessage = typeof clientMessages.$inferSelect;
export type InsertClientMessage = typeof clientMessages.$inferInsert;

// ─── SERVICE QUOTATIONS ───────────────────────────────────────────────────────
export const serviceQuotations = mysqlTable("service_quotations", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id"),
  referenceNumber: varchar("reference_number", { length: 50 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  subtotalOmr: decimal("subtotal_omr", { precision: 10, scale: 3 }).notNull().default("0"),
  vatOmr: decimal("vat_omr", { precision: 10, scale: 3 }).notNull().default("0"),
  totalOmr: decimal("total_omr", { precision: 10, scale: 3 }).notNull().default("0"),
  validityDays: int("validity_days").notNull().default(30),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined", "expired"]).notNull().default("draft"),
  notes: text("notes"),
  terms: text("terms"),
  pdfUrl: varchar("pdf_url", { length: 1024 }),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  declineReason: text("decline_reason"),
  convertedToContractId: int("converted_to_contract_id"),
  /** Optional CRM deal — links quotation into the commercial pipeline. */
  crmDealId: int("crm_deal_id"),
  /** Optional CRM contact — explicit customer record (may also be implied via deal). */
  crmContactId: int("crm_contact_id"),
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_sq_company").on(t.companyId),
  index("idx_sq_crm_deal").on(t.crmDealId),
  index("idx_sq_crm_contact").on(t.crmContactId),
]);
export type ServiceQuotation = typeof serviceQuotations.$inferSelect;
export type InsertServiceQuotation = typeof serviceQuotations.$inferInsert;

// ─── QUOTATION LINE ITEMS ─────────────────────────────────────────────────────
export const quotationLineItems = mysqlTable("quotation_line_items", {
  id: int("id").autoincrement().primaryKey(),
  quotationId: int("quotation_id").notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  description: text("description"),
  qty: int("qty").notNull().default(1),
  unitPriceOmr: decimal("unit_price_omr", { precision: 10, scale: 3 }).notNull(),
  discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  lineTotalOmr: decimal("line_total_omr", { precision: 10, scale: 3 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type QuotationLineItem = typeof quotationLineItems.$inferSelect;
export type InsertQuotationLineItem = typeof quotationLineItems.$inferInsert;

// ─── SERVICE SLA RULES ────────────────────────────────────────────────────────
export const serviceSlaRules = mysqlTable("service_sla_rules", {
  id: int("id").autoincrement().primaryKey(),
  serviceType: varchar("service_type", { length: 100 }).notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).notNull().default("normal"),
  targetHours: int("target_hours").notNull(),
  escalationHours: int("escalation_hours").notNull(),
  breachAction: mysqlEnum("breach_action", ["notify", "escalate", "auto_reassign"]).notNull().default("notify"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ServiceSlaRule = typeof serviceSlaRules.$inferSelect;
export type InsertServiceSlaRule = typeof serviceSlaRules.$inferInsert;

// ─── CASE SLA TRACKING ────────────────────────────────────────────────────────
export const caseSlaTracking = mysqlTable("case_sla_tracking", {
  id: int("id").autoincrement().primaryKey(),
  caseId: int("case_id").notNull(),
  ruleId: int("rule_id"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  dueAt: timestamp("due_at").notNull(),
  breachedAt: timestamp("breached_at"),
  resolvedAt: timestamp("resolved_at"),
  breachNotified: boolean("breach_notified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type CaseSlaTracking = typeof caseSlaTracking.$inferSelect;
export type InsertCaseSlaTracking = typeof caseSlaTracking.$inferInsert;

// ─── COMPANY INVITES ──────────────────────────────────────────────────────────
export const companyInvites = mysqlTable("company_invites", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["company_admin", "company_member", "finance_admin", "hr_admin", "reviewer", "client", "external_auditor"]).notNull().default("company_member"),
  token: varchar("token", { length: 128 }).notNull().unique(),
  invitedBy: int("invited_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type CompanyInvite = typeof companyInvites.$inferSelect;
export type InsertCompanyInvite = typeof companyInvites.$inferInsert;

// ─── COMPANY DOCUMENTS VAULT ─────────────────────────────────────────────────
export const companyDocuments = mysqlTable("company_documents", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  docType: varchar("doc_type", { length: 64 }).notNull(), // e.g. "cr_certificate", "occi_membership", "municipality_licence"
  title: varchar("title", { length: 255 }).notNull(),
  docNumber: varchar("doc_number", { length: 128 }),
  issuingAuthority: varchar("issuing_authority", { length: 255 }),
  issueDate: date("issue_date"),
  expiryDate: date("expiry_date"),
  fileUrl: text("file_url"),
  fileKey: varchar("file_key", { length: 512 }),
  mimeType: varchar("mime_type", { length: 64 }),
  fileSize: int("file_size"), // bytes
  notes: text("notes"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  uploadedBy: int("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type CompanyDocument = typeof companyDocuments.$inferSelect;
export type InsertCompanyDocument = typeof companyDocuments.$inferInsert;

// ─── HR LETTERS ──────────────────────────────────────────────────────────────
export const hrLetters = mysqlTable("hr_letters", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  employeeId: int("employee_id").notNull(),
  letterType: varchar("letter_type", { length: 64 }).notNull(),
  // e.g. salary_certificate | employment_verification | noc | experience_letter
  //      promotion_letter | salary_transfer_letter | leave_approval | warning_letter
  language: varchar("language", { length: 8 }).notNull().default("en"),
  // "en" | "ar" | "both"
  letterStatus: mysqlEnum("letter_status", ["draft", "issued", "voided"]).notNull().default("issued"),
  templateVersion: varchar("template_version", { length: 32 }).notNull().default("v1"),
  referenceNumber: varchar("reference_number", { length: 64 }),
  subject: varchar("subject", { length: 512 }),
  bodyEn: text("body_en"),   // English letter body (HTML)
  bodyAr: text("body_ar"),   // Arabic letter body (HTML)
  issuedTo: varchar("issued_to", { length: 255 }),  // addressee name
  purpose: text("purpose"),
  additionalNotes: text("additional_notes"),
  fieldPayload: json("field_payload").$type<Record<string, unknown> | null>(),
  dataSnapshot: json("data_snapshot").$type<Record<string, unknown> | null>(),
  issuedAt: timestamp("issued_at"),
  issuedByUserId: int("issued_by_user_id"),
  signatoryId: int("signatory_id"),
  exportCount: int("export_count").notNull().default(0),
  emailSentAt: timestamp("email_sent_at"),
  emailSendCount: int("email_send_count").notNull().default(0),
  emailLastSentTo: varchar("email_last_sent_to", { length: 255 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type HrLetter = typeof hrLetters.$inferSelect;
export type InsertHrLetter = typeof hrLetters.$inferInsert;

// ─── COMPANY SIGNATORIES (HR letters) ───────────────────────────────────────
export const companySignatories = mysqlTable(
  "company_signatories",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    nameEn: varchar("name_en", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleAr: varchar("title_ar", { length: 255 }),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_company_signatories_company").on(t.companyId)]
);
export type CompanySignatory = typeof companySignatories.$inferSelect;
export type InsertCompanySignatory = typeof companySignatories.$inferInsert;

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  nameAr: varchar("name_ar", { length: 128 }),
  description: text("description"),
  headEmployeeId: int("head_employee_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;

// ─── POSITIONS ────────────────────────────────────────────────────────────────
export const positions = mysqlTable("positions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  departmentId: int("department_id"),
  title: varchar("title", { length: 128 }).notNull(),
  titleAr: varchar("title_ar", { length: 128 }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Position = typeof positions.$inferSelect;
export type InsertPosition = typeof positions.$inferInsert;

// ─── EMPLOYEE TASKS ───────────────────────────────────────────────────────────
export const employeeTasks = mysqlTable("employee_tasks", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  assignedToEmployeeId: int("assigned_to_employee_id").notNull(),
  assignedByUserId: int("assigned_by_user_id").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).notNull().default("medium"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "cancelled", "blocked"]).notNull().default("pending"),
  dueDate: date("due_date"),
  estimatedDurationMinutes: int("estimated_duration_minutes"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  completedByUserId: int("completed_by_user_id"),
  notes: text("notes"),
  blockedReason: text("blocked_reason"),
  checklist: json("checklist").$type<{ title: string; completed: boolean }[] | null>(),
  attachmentLinks: json("attachment_links").$type<{ name: string; url: string }[] | null>(),
  notifiedOverdue: boolean("notified_overdue").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type EmployeeTask = typeof employeeTasks.$inferSelect;
export type InsertEmployeeTask = typeof employeeTasks.$inferInsert;

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  createdByUserId: int("created_by_user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  type: mysqlEnum("type", ["announcement", "request", "alert", "reminder"]).notNull().default("announcement"),
  targetEmployeeId: int("target_employee_id"), // null = all employees
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

// ─── ANNOUNCEMENT READS ───────────────────────────────────────────────────────
export const announcementReads = mysqlTable("announcement_reads", {
  id: int("id").autoincrement().primaryKey(),
  announcementId: int("announcement_id").notNull(),
  employeeId: int("employee_id").notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
});
export type AnnouncementRead = typeof announcementReads.$inferSelect;
export type InsertAnnouncementRead = typeof announcementReads.$inferInsert;

// ─── ATTENDANCE SITES ─────────────────────────────────────────────────────────
export const attendanceSites = mysqlTable("attendance_sites", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  location: varchar("location", { length: 255 }),
  // Geo-fence
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lng: decimal("lng", { precision: 10, scale: 7 }),
  radiusMeters: int("radius_meters").notNull().default(200),
  enforceGeofence: boolean("enforce_geofence").notNull().default(false),
  // Site classification
  siteType: varchar("site_type", { length: 50 }).notNull().default("office"),
  clientName: varchar("client_name", { length: 255 }),
  /** Contracted daily billing rate for this site (OMR). Used for client invoice summaries. */
  dailyRateOmr: decimal("daily_rate_omr", { precision: 10, scale: 3 }).default("0.000"),
  // Operating hours
  operatingHoursStart: varchar("operating_hours_start", { length: 5 }),
  operatingHoursEnd: varchar("operating_hours_end", { length: 5 }),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Muscat"),
  enforceHours: boolean("enforce_hours").notNull().default(false),
  // Core
  qrToken: varchar("qr_token", { length: 64 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: int("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type AttendanceSite = typeof attendanceSites.$inferSelect;
export type InsertAttendanceSite = typeof attendanceSites.$inferInsert;

// ─── ATTENDANCE RECORDS ───────────────────────────────────────────────────────
export const attendanceRecords = mysqlTable(
  "attendance_records",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id").notNull(),
    /**
     * Nullable FK to employee_schedules.id — set by self-service checkIn from the active schedule row.
     * Null for legacy records, admin-inserted rows, and approved manual check-ins (they inherit siteId instead).
     * Used for explicit shift attribution; board/report assignment still uses time-overlap for null rows.
     */
    scheduleId: int("schedule_id"),
    siteId: int("site_id"),
    siteName: varchar("site_name", { length: 128 }),
    checkIn: timestamp("check_in").notNull(),
    checkOut: timestamp("check_out"),
    checkInLat: decimal("check_in_lat", { precision: 10, scale: 7 }),
    checkInLng: decimal("check_in_lng", { precision: 10, scale: 7 }),
    checkOutLat: decimal("check_out_lat", { precision: 10, scale: 7 }),
    checkOutLng: decimal("check_out_lng", { precision: 10, scale: 7 }),
    method: mysqlEnum("method", ["qr_scan", "manual", "admin"]).notNull().default("qr_scan"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_att_rec_company_checkin").on(t.companyId, t.checkIn),
    index("idx_att_rec_employee_checkin").on(t.employeeId, t.checkIn),
  ]
);
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = typeof attendanceRecords.$inferInsert;

// ─── ATTENDANCE SESSIONS ──────────────────────────────────────────────────────
/**
 * Authoritative session model introduced in migration 0034.
 * Each row represents one uninterrupted work session (check-in → check-out).
 * Written in parallel with `attendance_records` during the dual-write transition
 * period; will become the primary source of truth once all read paths migrate.
 *
 * `business_date` (YYYY-MM-DD) is the Asia/Muscat calendar date stored
 * explicitly so queries never re-derive it from UTC timestamps.
 *
 * `open_key` is a virtual generated column (not mapped here — managed by DDL
 * in 0034_attendance_sessions.sql) that emulates a partial unique index in MySQL:
 * non-null only when status='open' AND schedule_id IS NOT NULL, preventing
 * two concurrent open sessions for the same employee+shift.
 */
export const attendanceSessions = mysqlTable(
  "attendance_sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id").notNull(),
    /** FK to employee_schedules.id; null for legacy / unattributed sessions */
    scheduleId: int("schedule_id"),
    /** Muscat calendar date YYYY-MM-DD — stored explicitly for efficient queries */
    businessDate: varchar("business_date", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["open", "closed"] as const).notNull().default("open"),
    checkInAt: timestamp("check_in_at").notNull(),
    checkOutAt: timestamp("check_out_at"),
    siteId: int("site_id"),
    siteName: varchar("site_name", { length: 128 }),
    method: mysqlEnum("method", ["qr_scan", "manual", "admin"] as const).notNull().default("qr_scan"),
    source: mysqlEnum("source", ["employee_portal", "admin_panel", "system"] as const)
      .notNull()
      .default("employee_portal"),
    checkInLat: decimal("check_in_lat", { precision: 10, scale: 7 }),
    checkInLng: decimal("check_in_lng", { precision: 10, scale: 7 }),
    checkOutLat: decimal("check_out_lat", { precision: 10, scale: 7 }),
    checkOutLng: decimal("check_out_lng", { precision: 10, scale: 7 }),
    notes: text("notes"),
    /** Back-link to the attendance_records row that spawned this session (dual-write era) */
    sourceRecordId: int("source_record_id"),
    // open_key virtual generated column is NOT declared here; it is DB-managed DDL.
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_att_sess_company_date").on(t.companyId, t.businessDate),
    index("idx_att_sess_employee_date").on(t.employeeId, t.businessDate),
    index("idx_att_sess_schedule").on(t.scheduleId),
    index("idx_att_sess_source_record").on(t.sourceRecordId),
  ]
);
export type AttendanceSession = typeof attendanceSessions.$inferSelect;
export type InsertAttendanceSession = typeof attendanceSessions.$inferInsert;

// ─── EMPLOYEE REQUESTS ────────────────────────────────────────────────────────
export const employeeRequests = mysqlTable("employee_requests", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  employeeId: int("employee_id").notNull(),
  type: mysqlEnum("type", [
    "leave",
    "document",
    "overtime",
    "expense",
    "equipment",
    "training",
    "other",
  ]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).notNull().default("pending"),
  subject: varchar("subject", { length: 255 }).notNull(),
  details: json("details"),
  adminNote: text("admin_note"),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type EmployeeRequest = typeof employeeRequests.$inferSelect;
export type InsertEmployeeRequest = typeof employeeRequests.$inferInsert;

// ─── Manual Check-in Requests ─────────────────────────────────────────────────
// Submitted by employees who are outside the geo-fence and need HR approval
export const manualCheckinRequests = mysqlTable("manual_checkin_requests", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  siteId: int("site_id").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  /**
   * Muscat calendar date (YYYY-MM-DD) the employee intends this attendance for.
   * Supplied explicitly by the employee when submitting from the portal.
   * Null for legacy requests and QR-flow fallbacks.
   */
  requestedBusinessDate: varchar("requested_business_date", { length: 10 }),
  /**
   * employee_schedules.id the employee selected as the intended shift.
   * When present, `approveManualCheckIn` uses it directly as `attendance_records.schedule_id`
   * instead of inferring from timestamp proximity.
   */
  requestedScheduleId: int("requested_schedule_id"),
  justification: text("justification").notNull(),
  lat: decimal("lat", { precision: 10, scale: 7 }),
  lng: decimal("lng", { precision: 10, scale: 7 }),
  distanceMeters: int("distance_meters"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  adminNote: text("admin_note"),
  attendanceRecordId: int("attendance_record_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ManualCheckinRequest = typeof manualCheckinRequests.$inferSelect;
export type InsertManualCheckinRequest = typeof manualCheckinRequests.$inferInsert;

// ─── Attendance Correction Requests ──────────────────────────────────────────
// Submitted by employees when their check-in/out time is wrong or missing
export const attendanceCorrections = mysqlTable("attendance_corrections", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeId: int("employee_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  attendanceRecordId: int("attendance_record_id"),
  requestedDate: varchar("requested_date", { length: 10 }).notNull(), // YYYY-MM-DD
  requestedCheckIn: varchar("requested_check_in", { length: 8 }),     // HH:MM:SS
  requestedCheckOut: varchar("requested_check_out", { length: 8 }),   // HH:MM:SS
  reason: text("reason").notNull(),
  status: mysqlEnum("ac_status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  adminNote: text("admin_note"),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type AttendanceCorrection = typeof attendanceCorrections.$inferSelect;
export type InsertAttendanceCorrection = typeof attendanceCorrections.$inferInsert;

// ─── Shift Templatess ──────────────────────────────────────────────────────────
// Reusable named shift definitions (e.g. "Morning Shift", "Evening Shift")
export const shiftTemplates = mysqlTable("shift_templates", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(), // "HH:MM" 24h
  endTime: varchar("end_time", { length: 5 }).notNull(),     // "HH:MM" 24h
  /** Paid / unpaid break within the shift — deducted from worked time in monthly reports. */
  breakMinutes: int("break_minutes").notNull().default(0),
  gracePeriodMinutes: int("grace_period_minutes").notNull().default(15),
  color: varchar("color", { length: 20 }).default("#ef4444"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type InsertShiftTemplate = typeof shiftTemplates.$inferInsert;

// ─── Employee Schedule Groups ─────────────────────────────────────────────────
// Parent record for a multi-shift roster assignment.
// Holds the shared metadata (employee, site, working days, date range) while
// each child employee_schedules row carries an individual shift template.
// Legacy employee_schedules rows where group_id IS NULL remain fully supported.
export const employeeScheduleGroups = mysqlTable(
  "employee_schedule_groups",
  {
    id: int("id").primaryKey().autoincrement(),
    companyId: int("company_id").notNull(),
    employeeUserId: int("employee_user_id").notNull(),
    siteId: int("site_id").notNull(),
    workingDays: varchar("working_days", { length: 20 }).notNull().default("0,1,2,3,4"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdByUserId: int("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_esg_company_emp_active").on(t.companyId, t.employeeUserId, t.isActive),
    index("idx_esg_company_active_dates").on(t.companyId, t.isActive, t.startDate, t.endDate),
  ]
);
export type EmployeeScheduleGroup = typeof employeeScheduleGroups.$inferSelect;
export type InsertEmployeeScheduleGroup = typeof employeeScheduleGroups.$inferInsert;

// ─── Employee Schedules ───────────────────────────────────────────────────────
// Assigns a shift template to an employee for specific days at a specific site.
// group_id links to employee_schedule_groups for multi-shift assignments;
// NULL means a standalone legacy row.
export const employeeSchedules = mysqlTable(
  "employee_schedules",
  {
    id: int("id").primaryKey().autoincrement(),
    companyId: int("company_id").notNull(),
    employeeUserId: int("employee_user_id").notNull(),
    siteId: int("site_id").notNull(),
    shiftTemplateId: int("shift_template_id").notNull(),
    /** FK to employee_schedule_groups.id — null for legacy ungrouped rows. */
    groupId: int("group_id"),
    workingDays: varchar("working_days", { length: 20 }).notNull().default("0,1,2,3,4"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdByUserId: int("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_emp_sched_company_emp_active").on(t.companyId, t.employeeUserId, t.isActive),
    index("idx_emp_sched_company_active_dates").on(t.companyId, t.isActive, t.startDate, t.endDate),
    index("idx_emp_sched_group_id").on(t.groupId),
  ]
);
export type EmployeeSchedule = typeof employeeSchedules.$inferSelect;
export type InsertEmployeeSchedule = typeof employeeSchedules.$inferInsert;

// ─── Company Holidays ─────────────────────────────────────────────────────────
// Public and company-specific holidays — attendance not required on these days
export const companyHolidays = mysqlTable("company_holidays", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  holidayDate: date("holiday_date", { mode: "string" }).notNull(),
  type: mysqlEnum("holiday_type", ["public", "company", "optional"]).notNull().default("public"),
  isRecurringYearly: boolean("is_recurring_yearly").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type CompanyHoliday = typeof companyHolidays.$inferSelect;
export type InsertCompanyHoliday = typeof companyHolidays.$inferInsert;

// ─── Shift Change & Time Off Requests ─────────────────────────────────────────
// Employee-initiated requests for schedule changes, time off, early leave, etc.
export const shiftChangeRequests = mysqlTable("shift_change_requests", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  requestType: mysqlEnum("request_type", [
    "shift_change",
    "time_off",
    "early_leave",
    "late_arrival",
    "day_swap",
  ]).notNull(),
  requestedDate: date("requested_date", { mode: "string" }).notNull(),
  requestedEndDate: date("requested_end_date", { mode: "string" }),
  preferredShiftId: int("preferred_shift_id"),
  requestedTime: varchar("requested_time", { length: 5 }),
  reason: text("reason").notNull(),
  status: mysqlEnum("request_status", ["pending", "approved", "rejected", "cancelled"]).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  attachmentUrl: varchar("attachment_url", { length: 1000 }),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ShiftChangeRequest = typeof shiftChangeRequests.$inferSelect;
export type InsertShiftChangeRequest = typeof shiftChangeRequests.$inferInsert;


// ─── Work Logs / Timesheet ─────────────────────────────────────────────────────
export const workLogs = mysqlTable("work_logs", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  logDate: date("log_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }),
  endTime: varchar("end_time", { length: 5 }),
  hoursWorked: varchar("hours_worked", { length: 10 }),
  projectName: varchar("project_name", { length: 200 }),
  taskDescription: text("task_description").notNull(),
  logCategory: mysqlEnum("log_category", ["development", "meeting", "admin", "support", "training", "other"]).notNull().default("other"),
  logStatus: mysqlEnum("log_status", ["draft", "submitted", "approved"]).notNull().default("submitted"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type WorkLog = typeof workLogs.$inferSelect;
export type InsertWorkLog = typeof workLogs.$inferInsert;

// ─── Expense Claims ────────────────────────────────────────────────────────────
export const expenseClaims = mysqlTable("expense_claims", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  claimDate: date("claim_date", { mode: "string" }).notNull(),
  expenseCategory: mysqlEnum("expense_category", ["travel", "meals", "accommodation", "equipment", "communication", "training", "medical", "other"]).notNull(),
  amount: varchar("amount", { length: 20 }).notNull(),
  currency: varchar("currency", { length: 5 }).notNull().default("OMR"),
  description: text("description").notNull(),
  receiptUrl: varchar("receipt_url", { length: 1000 }),
  expenseStatus: mysqlEnum("expense_status", ["pending", "approved", "rejected", "cancelled"]).notNull().default("pending"),
  adminNotes: text("admin_notes"),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ExpenseClaim = typeof expenseClaims.$inferSelect;
export type InsertExpenseClaim = typeof expenseClaims.$inferInsert;

// ─── Training Records ──────────────────────────────────────────────────────────
export const trainingRecords = mysqlTable("training_records", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  /** FK-style reference to `employees.id` (legacy column name `employee_user_id`). Admin assign uses employee id; employee self-serve may fall back to `users.id` when no employee row exists. */
  employeeUserId: int("employee_user_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  provider: varchar("provider", { length: 200 }),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  durationHours: int("duration_hours"),
  trainingCategory: mysqlEnum("training_category", ["technical", "compliance", "leadership", "safety", "soft_skills", "other"]).notNull().default("other"),
  trainingStatus: mysqlEnum("training_status", ["assigned", "in_progress", "completed", "overdue"]).notNull().default("assigned"),
  score: int("score"),
  certificateUrl: varchar("certificate_url", { length: 1000 }),
  assignedByUserId: int("assigned_by_user_id"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type TrainingRecord = typeof trainingRecords.$inferSelect;
export type InsertTrainingRecord = typeof trainingRecords.$inferInsert;

// ─── Employee Self-Reviews ─────────────────────────────────────────────────────
export const employeeSelfReviews = mysqlTable("employee_self_reviews", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  /** Same semantics as training_records.employee_user_id: `employees.id` (legacy name). */
  employeeUserId: int("employee_user_id").notNull(),
  reviewPeriod: varchar("review_period", { length: 50 }).notNull(),
  selfRating: int("self_rating"),
  managerRating: int("manager_rating"),
  selfAchievements: text("self_achievements"),
  selfGoals: text("self_goals"),
  managerFeedback: text("manager_feedback"),
  goalsNextPeriod: text("goals_next_period"),
  reviewStatus: mysqlEnum("review_status", ["draft", "submitted", "reviewed", "acknowledged"]).notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: int("reviewed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type EmployeeSelfReview = typeof employeeSelfReviews.$inferSelect;
export type InsertEmployeeSelfReview = typeof employeeSelfReviews.$inferInsert;

// ─── ACCOUNTABILITY (person → ownership, KPI focus, cadence) ─────────────────
/** Formal accountability overlay for an employee; merges with employees.managerId / department / position. */
export const employeeAccountability = mysqlTable(
  "employee_accountability",
  {
    id: int("id").primaryKey().autoincrement(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id").notNull(),
    departmentId: int("department_id"),
    /** Optional stable key for operating-model hooks, e.g. marketing_manager, ops_lead */
    businessRoleKey: varchar("business_role_key", { length: 64 }),
    responsibilities: json("responsibilities").$type<string[]>().default([]),
    kpiCategoryKeys: json("kpi_category_keys").$type<string[]>().default([]),
    reviewCadence: mysqlEnum("review_cadence", ["daily", "weekly", "biweekly", "monthly"])
      .notNull()
      .default("weekly"),
    /** Overrides employees.managerId for escalation when set */
    escalationEmployeeId: int("escalation_employee_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uniq_emp_accountability_company_employee").on(t.companyId, t.employeeId),
    index("idx_ea_company").on(t.companyId),
    index("idx_ea_employee").on(t.employeeId),
  ]
);
export type EmployeeAccountability = typeof employeeAccountability.$inferSelect;
export type InsertEmployeeAccountability = typeof employeeAccountability.$inferInsert;

// ─── PERFORMANCE INTERVENTIONS (lightweight manager ↔ person) ───────────────
export const performanceInterventions = mysqlTable(
  "performance_interventions",
  {
    id: int("id").primaryKey().autoincrement(),
    companyId: int("company_id").notNull(),
    employeeId: int("employee_id").notNull(),
    managerUserId: int("manager_user_id").notNull(),
    status: mysqlEnum("status", ["open", "closed", "escalated"]).notNull().default("open"),
    kind: mysqlEnum("kind", [
      "request_update",
      "corrective_task",
      "follow_up",
      "under_review",
      "escalate",
    ]).notNull(),
    followUpAt: timestamp("follow_up_at"),
    linkedTaskId: int("linked_task_id"),
    note: text("note"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pi_company").on(t.companyId),
    index("idx_pi_employee").on(t.employeeId),
    index("idx_pi_employee_open").on(t.companyId, t.employeeId, t.status),
  ]
);
export type PerformanceIntervention = typeof performanceInterventions.$inferSelect;
export type InsertPerformanceIntervention = typeof performanceInterventions.$inferInsert;

// ─── KPI Targets ───────────────────────────────────────────────────────────────
export const kpiTargets = mysqlTable("kpi_targets", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  periodYear: int("period_year").notNull(),
  periodMonth: int("period_month").notNull(),
  metricName: varchar("metric_name", { length: 200 }).notNull(),
  metricType: mysqlEnum("metric_type", ["sales_amount","client_count","leads_count","calls_count","meetings_count","proposals_count","revenue","units_sold","custom"]).notNull().default("custom"),
  targetValue: decimal("target_value", { precision: 15, scale: 2 }).notNull(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).default("0"),
  commissionType: mysqlEnum("commission_type", ["percentage","fixed_per_unit","tiered"]).default("percentage"),
  currency: varchar("currency", { length: 5 }).notNull().default("OMR"),
  notes: text("notes"),
  setByUserId: int("set_by_user_id"),
  targetStatus: mysqlEnum("target_status", ["draft", "active", "completed", "archived", "cancelled"]).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type KpiTarget = typeof kpiTargets.$inferSelect;
export type InsertKpiTarget = typeof kpiTargets.$inferInsert;

// ─── KPI Daily Logs ────────────────────────────────────────────────────────────
export const kpiDailyLogs = mysqlTable("kpi_daily_logs", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  logDate: date("log_date", { mode: "string" }).notNull(),
  metricName: varchar("metric_name", { length: 200 }).notNull(),
  metricType: mysqlEnum("metric_type", ["sales_amount","client_count","leads_count","calls_count","meetings_count","proposals_count","revenue","units_sold","custom"]).notNull().default("custom"),
  valueAchieved: decimal("value_achieved", { precision: 15, scale: 2 }).notNull(),
  clientName: varchar("client_name", { length: 300 }),
  notes: text("notes"),
  attachmentUrl: varchar("attachment_url", { length: 1000 }),
  kpiTargetId: int("kpi_target_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type KpiDailyLog = typeof kpiDailyLogs.$inferSelect;
export type InsertKpiDailyLog = typeof kpiDailyLogs.$inferInsert;

// ─── KPI Achievements (monthly rollup) ────────────────────────────────────────
export const kpiAchievements = mysqlTable("kpi_achievements", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  employeeUserId: int("employee_user_id").notNull(),
  periodYear: int("period_year").notNull(),
  periodMonth: int("period_month").notNull(),
  metricName: varchar("metric_name", { length: 200 }).notNull(),
  targetValue: decimal("target_value", { precision: 15, scale: 2 }).notNull(),
  achievedValue: decimal("achieved_value", { precision: 15, scale: 2 }).notNull().default("0"),
  achievementPct: decimal("achievement_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  commissionEarned: decimal("commission_earned", { precision: 15, scale: 2 }).notNull().default("0"),
  currency: varchar("currency", { length: 5 }).notNull().default("OMR"),
  kpiTargetId: int("kpi_target_id"),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().onUpdateNow().notNull(),
});
export type KpiAchievement = typeof kpiAchievements.$inferSelect;
export type InsertKpiAchievement = typeof kpiAchievements.$inferInsert;

// ─── AUTOMATION RULES ─────────────────────────────────────────────────────────
export const automationRules = mysqlTable("automation_rules", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  triggerType: varchar("trigger_type", { length: 100 }).notNull(),
  conditionValue: varchar("condition_value", { length: 255 }),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionPayload: text("action_payload"),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  runCount: int("run_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type AutomationRule = typeof automationRules.$inferSelect;
export type InsertAutomationRule = typeof automationRules.$inferInsert;

// ─── AUTOMATION LOGS ──────────────────────────────────────────────────────────
export const automationLogs = mysqlTable("automation_logs", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("rule_id").notNull(),
  companyId: int("company_id").notNull(),
  employeeId: int("employee_id"),
  triggerType: varchar("trigger_type", { length: 100 }).notNull(),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("success"),
  message: text("message"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type AutomationLog = typeof automationLogs.$inferSelect;

// ─── WORKFORCE HEALTH SNAPSHOTS ───────────────────────────────────────────────
export const workforceHealthSnapshots = mysqlTable("workforce_health_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("company_id").notNull(),
  snapshotDate: varchar("snapshot_date", { length: 10 }).notNull(),
  totalEmployees: int("total_employees").notNull().default(0),
  avgCompletenessScore: varchar("avg_completeness_score", { length: 10 }).notNull().default("0"),
  criticalCount: int("critical_count").notNull().default(0),
  warningCount: int("warning_count").notNull().default(0),
  incompleteCount: int("incomplete_count").notNull().default(0),
  healthyCount: int("healthy_count").notNull().default(0),
  expiringDocsCount: int("expiring_docs_count").notNull().default(0),
  expiredDocsCount: int("expired_docs_count").notNull().default(0),
  unassignedCount: int("unassigned_count").notNull().default(0),
  omanisationRate: varchar("omanisation_rate", { length: 10 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type WorkforceHealthSnapshot = typeof workforceHealthSnapshots.$inferSelect;

// ─── PROMOTER ASSIGNMENTS (HR / contracts — Google Doc generation source) ─────
export const promoterAssignments = mysqlTable(
  "promoter_assignments",
  {
    id: char("id", { length: 36 }).primaryKey(),
    companyId: int("company_id").notNull(),
    firstPartyCompanyId: int("first_party_company_id").notNull(),
    secondPartyCompanyId: int("second_party_company_id").notNull(),
    /** Optional link to client (first party) attendance site — work location is always client-scoped */
    clientSiteId: int("client_site_id").references(() => attendanceSites.id),
    promoterEmployeeId: int("promoter_employee_id").notNull(),
    locationAr: varchar("location_ar", { length: 500 }),
    locationEn: varchar("location_en", { length: 500 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    contractReferenceNumber: varchar("contract_reference_number", { length: 100 }),
    issueDate: date("issue_date"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_pa_company").on(t.companyId),
    index("idx_pa_first_party").on(t.firstPartyCompanyId),
    index("idx_pa_second_party").on(t.secondPartyCompanyId),
    index("idx_pa_employee").on(t.promoterEmployeeId),
    index("idx_pa_client_site").on(t.clientSiteId),
  ]
);
export type PromoterAssignment = typeof promoterAssignments.$inferSelect;
export type InsertPromoterAssignment = typeof promoterAssignments.$inferInsert;

// ─── DOCUMENT GENERATION (Google Docs templates & outputs) ────────────────────
export const documentTemplates = mysqlTable(
  "document_templates",
  {
    id: char("id", { length: 36 }).primaryKey(),
    /** 0 = platform-wide template; otherwise owning company id */
    companyId: int("company_id").notNull().default(0),
    key: varchar("key", { length: 191 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    documentSource: varchar("document_source", { length: 50 }).notNull().default("google_docs"),
    googleDocId: varchar("google_doc_id", { length: 255 }),
    language: varchar("language", { length: 32 }).notNull(),
    version: int("version").notNull().default(1),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    outputFormats: json("output_formats").$type<string[]>().notNull().default(["pdf"]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_dt_company").on(t.companyId),
    index("idx_dt_entity").on(t.entityType),
    unique("uq_document_templates_key_company").on(t.key, t.companyId),
  ]
);
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type InsertDocumentTemplate = typeof documentTemplates.$inferInsert;

export const documentTemplatePlaceholders = mysqlTable(
  "document_template_placeholders",
  {
    id: char("id", { length: 36 }).primaryKey(),
    templateId: char("template_id", { length: 36 })
      .notNull()
      .references(() => documentTemplates.id, { onDelete: "cascade" }),
    placeholder: varchar("placeholder", { length: 191 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    sourcePath: varchar("source_path", { length: 255 }).notNull(),
    dataType: varchar("data_type", { length: 32 }).notNull().default("string"),
    required: boolean("required").notNull().default(true),
    defaultValue: text("default_value"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_dtp_template").on(t.templateId),
    unique("uq_dtp_template_placeholder").on(t.templateId, t.placeholder),
  ]
);
export type DocumentTemplatePlaceholder = typeof documentTemplatePlaceholders.$inferSelect;
export type InsertDocumentTemplatePlaceholder = typeof documentTemplatePlaceholders.$inferInsert;

export const generatedDocuments = mysqlTable(
  "generated_documents",
  {
    id: char("id", { length: 36 }).primaryKey(),
    templateId: char("template_id", { length: 36 })
      .notNull()
      .references(() => documentTemplates.id),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: char("entity_id", { length: 36 }).notNull(),
    outputFormat: varchar("output_format", { length: 32 }).notNull(),
    sourceGoogleDocId: varchar("source_google_doc_id", { length: 255 }),
    generatedGoogleDocId: varchar("generated_google_doc_id", { length: 255 }),
    fileUrl: text("file_url"),
    /** Storage key from Forge upload */
    filePath: varchar("file_path", { length: 1024 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    generatedBy: int("generated_by"),
    companyId: int("company_id").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_gd_company").on(t.companyId),
    index("idx_gd_template").on(t.templateId),
    index("idx_gd_entity").on(t.entityType, t.entityId),
    index("idx_gd_fingerprint_created").on(
      t.companyId,
      t.templateId,
      t.entityType,
      t.entityId,
      t.outputFormat,
      t.createdAt
    ),
  ]
);
export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type InsertGeneratedDocument = typeof generatedDocuments.$inferInsert;

export const documentGenerationAuditLogs = mysqlTable(
  "document_generation_audit_logs",
  {
    id: char("id", { length: 36 }).primaryKey(),
    generatedDocumentId: char("generated_document_id", { length: 36 })
      .notNull()
      .references(() => generatedDocuments.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    actorId: int("actor_id"),
    details: json("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_dgal_doc").on(t.generatedDocumentId)]
);
export type DocumentGenerationAuditLog = typeof documentGenerationAuditLogs.$inferSelect;
export type InsertDocumentGenerationAuditLog = typeof documentGenerationAuditLogs.$inferInsert;

// ─── AGREEMENT PARTY FOUNDATION ────────────────────────────────────────────────
// Canonical counterparty identity: platform tenant, external record, or both after link.
// See docs/AGREEMENT_PARTY_FOUNDATION.md

export const businessParties = mysqlTable(
  "business_parties",
  {
    id: char("id", { length: 36 }).primaryKey(),
    displayNameEn: varchar("display_name_en", { length: 255 }).notNull(),
    displayNameAr: varchar("display_name_ar", { length: 255 }),
    legalNameEn: varchar("legal_name_en", { length: 255 }),
    legalNameAr: varchar("legal_name_ar", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    linkedCompanyId: int("linked_company_id"),
    managedByCompanyId: int("managed_by_company_id"),
    registrationNumber: varchar("registration_number", { length: 100 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),
    createdBy: int("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    /** Canonical party after admin merge; this row retained for audit only. */
    mergedIntoPartyId: char("merged_into_party_id", { length: 36 }),
  },
  (t) => [
    index("idx_bp_linked_co").on(t.linkedCompanyId),
    index("idx_bp_managed_by").on(t.managedByCompanyId),
    index("idx_bp_merged_into").on(t.mergedIntoPartyId),
  ]
);
export type BusinessParty = typeof businessParties.$inferSelect;
export type InsertBusinessParty = typeof businessParties.$inferInsert;

export const businessPartyEvents = mysqlTable(
  "business_party_events",
  {
    id: char("id", { length: 36 }).primaryKey(),
    partyId: char("party_id", { length: 36 })
      .notNull()
      .references(() => businessParties.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    actorId: int("actor_id"),
    actorName: varchar("actor_name", { length: 255 }),
    details: json("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_bpe_party").on(t.partyId)]
);
export type BusinessPartyEvent = typeof businessPartyEvents.$inferSelect;

// ─── CONTRACT MANAGEMENT SYSTEM (CMS) ─────────────────────────────────────────
// Normalized, multi-type outsourcing contract infrastructure.
// Phase 1 is promoter_assignment; schema is intentionally extensible.
// ADR-001: party role (first_party/second_party) is per-contract, never global.
//   first_party  = client  (owns the work location)
//   second_party = employer/vendor (supplies the promoter employee)

// A. Contract type registry
export const contractTypeDefs = mysqlTable("contract_type_defs", {
  id: varchar("id", { length: 50 }).primaryKey(),
  labelEn: varchar("label_en", { length: 255 }).notNull(),
  labelAr: varchar("label_ar", { length: 255 }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ContractTypeDef = typeof contractTypeDefs.$inferSelect;

// B. Contract header
export const outsourcingContracts = mysqlTable(
  "outsourcing_contracts",
  {
    id: char("id", { length: 36 }).primaryKey(),
    /** Tenant anchor: historically first-party client company; NULL when client is external-only (employer-anchored draft). */
    companyId: int("company_id"),
    contractTypeId: varchar("contract_type_id", { length: 50 })
      .notNull()
      .references(() => contractTypeDefs.id),
    contractNumber: varchar("contract_number", { length: 100 }),
    /** draft | active | expired | terminated | renewed | suspended */
    status: varchar("status", { length: 50 }).notNull().default("draft"),
    issueDate: date("issue_date"),
    effectiveDate: date("effective_date").notNull(),
    expiryDate: date("expiry_date").notNull(),
    templateVersion: int("template_version").notNull().default(1),
    generatedPdfUrl: text("generated_pdf_url"),
    signedPdfUrl: text("signed_pdf_url"),
    renewalOfContractId: char("renewal_of_contract_id", { length: 36 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdBy: int("created_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_oc_company").on(t.companyId),
    index("idx_oc_type").on(t.contractTypeId),
    index("idx_oc_status").on(t.status),
    index("idx_oc_expiry").on(t.expiryDate),
    index("idx_oc_number").on(t.contractNumber),
    index("idx_oc_renewal").on(t.renewalOfContractId),
  ]
);
export type OutsourcingContract = typeof outsourcingContracts.$inferSelect;
export type InsertOutsourcingContract = typeof outsourcingContracts.$inferInsert;

// C. Contract parties — normalized snapshot per role
export const outsourcingContractParties = mysqlTable(
  "outsourcing_contract_parties",
  {
    id: char("id", { length: 36 }).primaryKey(),
    contractId: char("contract_id", { length: 36 })
      .notNull()
      .references(() => outsourcingContracts.id, { onDelete: "cascade" }),
    /** first_party | second_party | third_party */
    partyRole: varchar("party_role", { length: 50 }).notNull(),
    /** Links to companies table when the party is a known tenant; NULL = external */
    companyId: int("company_id"),
    /** Optional FK to business_parties — canonical identity for renewals / linking */
    partyId: char("party_id", { length: 36 }),
    /** Snapshot of company name at contract-creation time for PDF stability */
    displayNameEn: varchar("display_name_en", { length: 255 }).notNull(),
    displayNameAr: varchar("display_name_ar", { length: 255 }),
    registrationNumber: varchar("registration_number", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ocp_contract").on(t.contractId),
    index("idx_ocp_role").on(t.partyRole),
    index("idx_ocp_company").on(t.companyId),
    index("idx_ocp_party").on(t.partyId),
  ]
);
export type OutsourcingContractParty = typeof outsourcingContractParties.$inferSelect;
export type InsertOutsourcingContractParty = typeof outsourcingContractParties.$inferInsert;

// D. Contract locations — work site; for promoter contracts always belongs to first_party
export const outsourcingContractLocations = mysqlTable(
  "outsourcing_contract_locations",
  {
    id: char("id", { length: 36 }).primaryKey(),
    contractId: char("contract_id", { length: 36 })
      .notNull()
      .references(() => outsourcingContracts.id, { onDelete: "cascade" }),
    /** Which party owns this location. For promoter_assignment: always 'first_party' */
    belongsToPartyRole: varchar("belongs_to_party_role", { length: 50 })
      .notNull()
      .default("first_party"),
    siteNameEn: varchar("site_name_en", { length: 500 }),
    siteNameAr: varchar("site_name_ar", { length: 500 }),
    locationEn: varchar("location_en", { length: 500 }),
    locationAr: varchar("location_ar", { length: 500 }),
    /** Optional FK to attendance_sites for auto-fill; free-text fields are authoritative */
    clientSiteId: int("client_site_id").references(() => attendanceSites.id),
    siteCode: varchar("site_code", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_ocl_contract").on(t.contractId)]
);
export type OutsourcingContractLocation = typeof outsourcingContractLocations.$inferSelect;
export type InsertOutsourcingContractLocation = typeof outsourcingContractLocations.$inferInsert;

// E. Promoter-specific details — 1:1 with outsourcing_contracts for promoter_assignment type
export const outsourcingPromoterDetails = mysqlTable(
  "outsourcing_promoter_details",
  {
    id: char("id", { length: 36 }).primaryKey(),
    contractId: char("contract_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => outsourcingContracts.id, { onDelete: "cascade" }),
    promoterEmployeeId: int("promoter_employee_id").notNull(),
    /** Second party / employer company — denormalized for fast querying */
    employerCompanyId: int("employer_company_id").notNull(),
    /** Name snapshot at contract time — authoritative for PDF generation */
    fullNameEn: varchar("full_name_en", { length: 255 }).notNull(),
    fullNameAr: varchar("full_name_ar", { length: 255 }),
    /** Oman civil ID / national ID card number */
    civilId: varchar("civil_id", { length: 50 }),
    passportNumber: varchar("passport_number", { length: 50 }),
    passportExpiry: date("passport_expiry"),
    nationality: varchar("nationality", { length: 100 }),
    jobTitleEn: varchar("job_title_en", { length: 255 }),
    jobTitleAr: varchar("job_title_ar", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_opd_contract").on(t.contractId),
    index("idx_opd_employee").on(t.promoterEmployeeId),
    index("idx_opd_employer").on(t.employerCompanyId),
  ]
);
export type OutsourcingPromoterDetail = typeof outsourcingPromoterDetails.$inferSelect;
export type InsertOutsourcingPromoterDetail = typeof outsourcingPromoterDetails.$inferInsert;

// F. Contract documents — all file attachments per contract
export const outsourcingContractDocuments = mysqlTable(
  "outsourcing_contract_documents",
  {
    id: char("id", { length: 36 }).primaryKey(),
    contractId: char("contract_id", { length: 36 })
      .notNull()
      .references(() => outsourcingContracts.id, { onDelete: "cascade" }),
    /** generated_pdf | signed_pdf | passport_copy | id_copy | attachment */
    documentKind: varchar("document_kind", { length: 50 }).notNull(),
    fileUrl: text("file_url"),
    filePath: varchar("file_path", { length: 1024 }),
    fileName: varchar("file_name", { length: 500 }),
    mimeType: varchar("mime_type", { length: 100 }),
    uploadedBy: int("uploaded_by"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_ocd_contract").on(t.contractId),
    index("idx_ocd_kind").on(t.documentKind),
  ]
);
export type OutsourcingContractDocument = typeof outsourcingContractDocuments.$inferSelect;
export type InsertOutsourcingContractDocument = typeof outsourcingContractDocuments.$inferInsert;

// G. Contract audit events — append-only timeline
export const outsourcingContractEvents = mysqlTable(
  "outsourcing_contract_events",
  {
    id: char("id", { length: 36 }).primaryKey(),
    contractId: char("contract_id", { length: 36 })
      .notNull()
      .references(() => outsourcingContracts.id, { onDelete: "cascade" }),
    /** created | activated | edited | pdf_generated | signed_uploaded |
        renewed | terminated | suspended | expiry_alerted */
    action: varchar("action", { length: 100 }).notNull(),
    actorId: int("actor_id"),
    actorName: varchar("actor_name", { length: 255 }),
    snapshotBefore: json("snapshot_before").$type<Record<string, unknown>>(),
    snapshotAfter: json("snapshot_after").$type<Record<string, unknown>>(),
    details: json("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_oce_contract").on(t.contractId),
    index("idx_oce_created").on(t.createdAt),
  ]
);
export type OutsourcingContractEvent = typeof outsourcingContractEvents.$inferSelect;
export type InsertOutsourcingContractEvent = typeof outsourcingContractEvents.$inferInsert;

// ─── SANAD NETWORK INTELLIGENCE (government partner analytics) ────────────────

export const sanadIntelImportBatches = mysqlTable(
  "sanad_intel_import_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    batchKey: varchar("batch_key", { length: 64 }).notNull().unique(),
    sourceFiles: json("source_files").$type<string[]>().notNull().default([]),
    rowCounts: json("row_counts").$type<Record<string, number>>().notNull().default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sanad_intel_batch_created").on(t.createdAt)],
);
export type SanadIntelImportBatch = typeof sanadIntelImportBatches.$inferSelect;

/** Yearly transactions / income per governorate (normalized from official SANAD exports). */
export const sanadIntelGovernorateYearMetrics = mysqlTable(
  "sanad_intel_governorate_year_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    importBatchId: int("import_batch_id").references(() => sanadIntelImportBatches.id),
    year: int("year").notNull(),
    governorateKey: varchar("governorate_key", { length: 128 }).notNull(),
    governorateLabel: varchar("governorate_label", { length: 255 }).notNull(),
    transactionCount: int("transaction_count").notNull().default(0),
    incomeAmount: decimal("income_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    sourceRef: varchar("source_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_sanad_intel_gov_year").on(t.year, t.governorateKey),
    index("idx_sanad_intel_gov_year_y").on(t.year),
    index("idx_sanad_intel_gov_year_k").on(t.governorateKey),
  ],
);
export type SanadIntelGovernorateYearMetric = typeof sanadIntelGovernorateYearMetrics.$inferSelect;

/** Latest workforce snapshot per governorate (owners / staff / total). */
export const sanadIntelWorkforceGovernorate = mysqlTable(
  "sanad_intel_workforce_governorate",
  {
    id: int("id").autoincrement().primaryKey(),
    importBatchId: int("import_batch_id").references(() => sanadIntelImportBatches.id),
    governorateKey: varchar("governorate_key", { length: 128 }).notNull(),
    governorateLabel: varchar("governorate_label", { length: 255 }).notNull(),
    ownerCount: int("owner_count").notNull().default(0),
    staffCount: int("staff_count").notNull().default(0),
    totalWorkforce: int("total_workforce").notNull().default(0),
    asOfYear: int("as_of_year"),
    sourceRef: varchar("source_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("uq_sanad_intel_workforce_gov").on(t.governorateKey), index("idx_sanad_intel_wf_k").on(t.governorateKey)],
);
export type SanadIntelWorkforceGovernorate = typeof sanadIntelWorkforceGovernorate.$inferSelect;

/** Coverage density: center counts by governorate / wilayat / village. */
export const sanadIntelGeographyStats = mysqlTable(
  "sanad_intel_geography_stats",
  {
    id: int("id").autoincrement().primaryKey(),
    importBatchId: int("import_batch_id").references(() => sanadIntelImportBatches.id),
    governorateKey: varchar("governorate_key", { length: 128 }).notNull(),
    governorateLabel: varchar("governorate_label", { length: 255 }).notNull(),
    wilayat: varchar("wilayat", { length: 255 }),
    village: varchar("village", { length: 255 }),
    centerCount: int("center_count").notNull().default(0),
    sourceRef: varchar("source_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_sanad_intel_geo").on(t.governorateKey, t.wilayat, t.village),
    index("idx_sanad_intel_geo_gov").on(t.governorateKey),
  ],
);
export type SanadIntelGeographyStat = typeof sanadIntelGeographyStats.$inferSelect;

/** Service demand rankings from MostUsedServices-style exports. */
export const sanadIntelServiceUsageYear = mysqlTable(
  "sanad_intel_service_usage_year",
  {
    id: int("id").autoincrement().primaryKey(),
    importBatchId: int("import_batch_id").references(() => sanadIntelImportBatches.id),
    year: int("year").notNull(),
    rankOrder: int("rank_order").notNull(),
    serviceNameAr: text("service_name_ar"),
    serviceNameEn: varchar("service_name_en", { length: 512 }),
    authorityNameAr: text("authority_name_ar"),
    authorityNameEn: varchar("authority_name_en", { length: 512 }),
    demandVolume: int("demand_volume").notNull().default(0),
    sourceRef: varchar("source_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_sanad_intel_svc_year_rank").on(t.year, t.rankOrder),
    index("idx_sanad_intel_svc_year").on(t.year),
  ],
);
export type SanadIntelServiceUsageYear = typeof sanadIntelServiceUsageYear.$inferSelect;

/** Partner directory master (SanadCenterDirectory.xlsx + dedup fingerprint). */
export const sanadIntelCenters = mysqlTable(
  "sanad_intel_centers",
  {
    id: int("id").autoincrement().primaryKey(),
    importBatchId: int("import_batch_id").references(() => sanadIntelImportBatches.id),
    sourceFingerprint: varchar("source_fingerprint", { length: 64 }).notNull().unique(),
    centerName: varchar("center_name", { length: 512 }).notNull(),
    responsiblePerson: varchar("responsible_person", { length: 255 }),
    contactNumber: varchar("contact_number", { length: 64 }),
    governorateKey: varchar("governorate_key", { length: 128 }).notNull(),
    governorateLabelRaw: varchar("governorate_label_raw", { length: 255 }).notNull(),
    wilayat: varchar("wilayat", { length: 255 }),
    village: varchar("village", { length: 255 }),
    rawRow: json("raw_row").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sanad_intel_centers_gov").on(t.governorateKey),
    index("idx_sanad_intel_centers_name").on(t.centerName),
  ],
);
export type SanadIntelCenter = typeof sanadIntelCenters.$inferSelect;

/** Operational CRM / partner fields (1:1 with sanad_intel_centers). */
export const sanadIntelCenterOperations = mysqlTable(
  "sanad_intel_center_operations",
  {
    centerId: int("center_id")
      .notNull()
      .primaryKey()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    partnerStatus: mysqlEnum("partner_status", ["unknown", "prospect", "active", "suspended", "churned"])
      .default("unknown")
      .notNull(),
    onboardingStatus: mysqlEnum("onboarding_status", [
      "not_started",
      "intake",
      "documentation",
      "licensing_review",
      "licensed",
      "blocked",
    ])
      .default("not_started")
      .notNull(),
    complianceOverall: mysqlEnum("compliance_overall", ["not_assessed", "partial", "complete", "at_risk"]).default(
      "not_assessed",
    ).notNull(),
    internalTags: json("internal_tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    internalReviewNotes: text("internal_review_notes"),
    assignedManagerUserId: int("assigned_manager_user_id").references(() => users.id),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    coverageRadiusKm: int("coverage_radius_km"),
    targetSlaHours: int("target_sla_hours"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    /** Secure token for public onboarding link (unique when set). */
    inviteToken: varchar("invite_token", { length: 64 }).unique(),
    inviteSentAt: timestamp("invite_sent_at"),
    inviteExpiresAt: timestamp("invite_expires_at"),
    registeredUserId: int("registered_user_id").references(() => users.id),
    linkedSanadOfficeId: int("linked_sanad_office_id").references(() => sanadOffices.id),
    activatedAt: timestamp("activated_at"),
    activationSource: mysqlEnum("activation_source", ["manual", "invite", "admin_created"]),
    lastContactedAt: timestamp("last_contacted_at"),
    contactMethod: varchar("contact_method", { length: 64 }),
    followUpDueAt: timestamp("follow_up_due_at"),
    inviteAcceptName: varchar("invite_accept_name", { length: 255 }),
    inviteAcceptPhone: varchar("invite_accept_phone", { length: 64 }),
    inviteAcceptEmail: varchar("invite_accept_email", { length: 320 }),
    /** WhatsApp/survey outreach: centre replied with this email (dedicated link can be emailed here). */
    surveyOutreachReplyEmail: varchar("survey_outreach_reply_email", { length: 320 }),
    inviteAcceptAt: timestamp("invite_accept_at"),
  },
  (t) => [
    index("idx_sanad_intel_ops_partner").on(t.partnerStatus),
    index("idx_sanad_intel_ops_onb").on(t.onboardingStatus),
    index("idx_sanad_intel_ops_followup").on(t.followUpDueAt),
  ],
);
export type SanadIntelCenterOperations = typeof sanadIntelCenterOperations.$inferSelect;

/**
 * Lead / onboarding funnel for imported directory centres (1:1 with sanad_intel_centers).
 * Complements sanad_intel_center_operations (activation, invites) with CRM-style pipeline fields.
 */
export const sanadCentresPipeline = mysqlTable(
  "sanad_centres_pipeline",
  {
    centerId: int("center_id")
      .notNull()
      .primaryKey()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    pipelineStatus: mysqlEnum("pipeline_status", [
      "imported",
      "contacted",
      "prospect",
      "invited",
      "registered",
      "active",
    ])
      .default("imported")
      .notNull(),
    ownerUserId: int("owner_user_id").references(() => users.id),
    lastContactedAt: timestamp("last_contacted_at"),
    nextAction: text("next_action"),
    nextActionType: varchar("next_action_type", { length: 32 }),
    nextActionDueAt: timestamp("next_action_due_at"),
    assignedAt: timestamp("assigned_at"),
    assignedByUserId: int("assigned_by_user_id").references(() => users.id),
    latestNotePreview: varchar("latest_note_preview", { length: 512 }),
    isArchived: int("is_archived").default(0).notNull(),
    isInvalid: int("is_invalid").default(0).notNull(),
    isDuplicate: int("is_duplicate").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    index("idx_sanad_centres_pipe_status").on(t.pipelineStatus),
    index("idx_sanad_centres_pipe_owner").on(t.ownerUserId),
    index("idx_sanad_centres_pipe_due").on(t.nextActionDueAt),
    index("idx_sanad_centres_pipe_archived").on(t.isArchived),
  ],
);
export type SanadCentresPipeline = typeof sanadCentresPipeline.$inferSelect;

/** Append-only interaction timeline for a directory centre (CRM audit + follow-up history). */
export const sanadCentreActivityLog = mysqlTable(
  "sanad_centre_activity_log",
  {
    id: int("id").autoincrement().primaryKey(),
    centerId: int("center_id")
      .notNull()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    actorUserId: int("actor_user_id").references(() => users.id),
    activityType: varchar("activity_type", { length: 64 }).notNull(),
    note: text("note"),
    metadataJson: json("metadata_json").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sanad_act_center_time").on(t.centerId, t.occurredAt)],
);
export type SanadCentreActivityLog = typeof sanadCentreActivityLog.$inferSelect;

/** Structured notes on a directory centre (timeline + latest preview on pipeline row). */
export const sanadCentreNotes = mysqlTable(
  "sanad_centre_notes",
  {
    id: int("id").autoincrement().primaryKey(),
    centerId: int("center_id")
      .notNull()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    authorUserId: int("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sanad_notes_center").on(t.centerId, t.createdAt)],
);
export type SanadCentreNote = typeof sanadCentreNotes.$inferSelect;

/** Structured licensing checklist (seeded; aligns with SANAD centre licensing reference). */
export const sanadIntelLicenseRequirements = mysqlTable(
  "sanad_intel_license_requirements",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull().unique(),
    category: varchar("category", { length: 64 }).notNull(),
    onboardingStage: mysqlEnum("onboarding_stage", [
      "intake",
      "documentation",
      "premises",
      "staffing",
      "licensing_review",
      "go_live",
    ]).notNull(),
    titleAr: varchar("title_ar", { length: 512 }),
    titleEn: varchar("title_en", { length: 512 }).notNull(),
    description: text("description"),
    sortOrder: int("sort_order").notNull().default(0),
    requiredDocumentCodes: json("required_document_codes").$type<string[]>().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sanad_intel_lic_cat").on(t.category), index("idx_sanad_intel_lic_stage").on(t.onboardingStage)],
);
export type SanadIntelLicenseRequirement = typeof sanadIntelLicenseRequirements.$inferSelect;

/** Per-center compliance line items. */
export const sanadIntelCenterComplianceItems = mysqlTable(
  "sanad_intel_center_compliance_items",
  {
    id: int("id").autoincrement().primaryKey(),
    centerId: int("center_id")
      .notNull()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    requirementId: int("requirement_id")
      .notNull()
      .references(() => sanadIntelLicenseRequirements.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", [
      "pending",
      "submitted",
      "verified",
      "rejected",
      "waived",
      "not_applicable",
    ])
      .default("pending")
      .notNull(),
    evidenceNote: text("evidence_note"),
    reviewedByUserId: int("reviewed_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uq_sanad_intel_cc_center_req").on(t.centerId, t.requirementId),
    index("idx_sanad_intel_cc_center").on(t.centerId),
  ],
);
export type SanadIntelCenterComplianceItem = typeof sanadIntelCenterComplianceItems.$inferSelect;

/** Optional per-center yearly metrics (future enrichment). */
export const sanadIntelCenterMetricsYearly = mysqlTable(
  "sanad_intel_center_metrics_yearly",
  {
    id: int("id").autoincrement().primaryKey(),
    centerId: int("center_id")
      .notNull()
      .references(() => sanadIntelCenters.id, { onDelete: "cascade" }),
    year: int("year").notNull(),
    transactionCount: int("transaction_count"),
    incomeAmount: decimal("income_amount", { precision: 18, scale: 2 }),
    sourceRef: varchar("source_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("uq_sanad_intel_cm_center_year").on(t.centerId, t.year)],
);
export type SanadIntelCenterMetricsYearly = typeof sanadIntelCenterMetricsYearly.$inferSelect;

// ─── Guided Onboarding Checklist ──────────────────────────────────────────────

/** Canonical onboarding step definitions (seeded, not user-editable). */
export const onboardingSteps = mysqlTable(
  "onboarding_steps",
  {
    id: int("id").autoincrement().primaryKey(),
    stepKey: varchar("step_key", { length: 64 }).notNull().unique(),
    category: mysqlEnum("category", [
      "profile",
      "company",
      "team",
      "services",
      "compliance",
      "explore",
    ]).notNull(),
    titleEn: varchar("title_en", { length: 256 }).notNull(),
    titleAr: varchar("title_ar", { length: 256 }),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    actionLabel: varchar("action_label", { length: 128 }),
    actionUrl: varchar("action_url", { length: 256 }),
    iconName: varchar("icon_name", { length: 64 }),
    sortOrder: int("sort_order").notNull().default(0),
    isRequired: boolean("is_required").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_onboarding_steps_category").on(t.category)],
);
export type OnboardingStep = typeof onboardingSteps.$inferSelect;

/** Per-user onboarding progress (one row per user per step). */
export const userOnboardingProgress = mysqlTable(
  "user_onboarding_progress",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: int("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "completed", "skipped"])
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at"),
    skippedAt: timestamp("skipped_at"),
    autoCompleted: boolean("auto_completed").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    unique("uq_user_onboarding_user_company_step").on(t.userId, t.companyId, t.stepKey),
    index("idx_user_onboarding_user_company").on(t.userId, t.companyId),
  ],
);
export type UserOnboardingProgress = typeof userOnboardingProgress.$inferSelect;

// ─── Business Sector Survey ───────────────────────────────────────────────────

export const surveys = mysqlTable(
  "surveys",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleAr: varchar("title_ar", { length: 255 }).notNull(),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    status: mysqlEnum("status", ["draft", "active", "paused", "closed"])
      .default("draft")
      .notNull(),
    welcomeMessageEn: text("welcome_message_en"),
    welcomeMessageAr: text("welcome_message_ar"),
    thankYouMessageEn: text("thank_you_message_en"),
    thankYouMessageAr: text("thank_you_message_ar"),
    allowAnonymous: boolean("allow_anonymous").default(true).notNull(),
    estimatedMinutes: int("estimated_minutes").default(12).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_surveys_status").on(t.status),
  ],
);
export type Survey = typeof surveys.$inferSelect;

export const surveySections = mysqlTable(
  "survey_sections",
  {
    id: int("id").autoincrement().primaryKey(),
    surveyId: int("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 100 }).notNull(),
    titleEn: varchar("title_en", { length: 255 }).notNull(),
    titleAr: varchar("title_ar", { length: 255 }).notNull(),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_survey_sections_survey").on(t.surveyId),
    unique("uq_survey_sections_survey_slug").on(t.surveyId, t.slug),
  ],
);
export type SurveySection = typeof surveySections.$inferSelect;

export const surveyQuestions = mysqlTable(
  "survey_questions",
  {
    id: int("id").autoincrement().primaryKey(),
    sectionId: int("section_id")
      .notNull()
      .references(() => surveySections.id, { onDelete: "cascade" }),
    questionKey: varchar("question_key", { length: 100 }).notNull(),
    type: mysqlEnum("type", [
      "text",
      "textarea",
      "single_choice",
      "multi_choice",
      "rating",
      "number",
      "dropdown",
      "yes_no",
    ]).notNull(),
    labelEn: text("label_en").notNull(),
    labelAr: text("label_ar").notNull(),
    hintEn: text("hint_en"),
    hintAr: text("hint_ar"),
    isRequired: boolean("is_required").default(true).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    settings: json("settings").$type<Record<string, unknown>>(),
    scoringRule: json("scoring_rule").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_survey_questions_section").on(t.sectionId),
  ],
);
export type SurveyQuestion = typeof surveyQuestions.$inferSelect;

export const surveyOptions = mysqlTable(
  "survey_options",
  {
    id: int("id").autoincrement().primaryKey(),
    questionId: int("question_id")
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 100 }).notNull(),
    labelEn: varchar("label_en", { length: 500 }).notNull(),
    labelAr: varchar("label_ar", { length: 500 }).notNull(),
    score: int("score").default(0).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    tags: json("tags").$type<string[]>(),
  },
  (t) => [
    index("idx_survey_options_question").on(t.questionId),
  ],
);
export type SurveyOption = typeof surveyOptions.$inferSelect;

export const surveyTags = mysqlTable(
  "survey_tags",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    labelEn: varchar("label_en", { length: 255 }).notNull(),
    labelAr: varchar("label_ar", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
);
export type SurveyTag = typeof surveyTags.$inferSelect;

export const surveyResponses = mysqlTable(
  "survey_responses",
  {
    id: int("id").autoincrement().primaryKey(),
    surveyId: int("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    /** Set when the respondent starts the survey while logged in (optional FK). */
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    /** When started from a Sanad office context (member must be logged in; same platform user as office roster). */
    sanadOfficeId: int("sanad_office_id").references(() => sanadOffices.id, { onDelete: "set null" }),
    resumeToken: varchar("resume_token", { length: 64 }).notNull().unique(),
    language: mysqlEnum("language", ["en", "ar"]).default("en").notNull(),
    status: mysqlEnum("status", ["in_progress", "completed", "abandoned"])
      .default("in_progress")
      .notNull(),
    currentSectionId: int("current_section_id"),
    respondentName: varchar("respondent_name", { length: 255 }),
    respondentEmail: varchar("respondent_email", { length: 320 }),
    respondentPhone: varchar("respondent_phone", { length: 32 }),
    companyName: varchar("company_name", { length: 255 }),
    companySector: varchar("company_sector", { length: 128 }),
    companySize: varchar("company_size", { length: 64 }),
    companyGovernorate: varchar("company_governorate", { length: 128 }),
    scores: json("scores").$type<Record<string, number>>(),
    completedAt: timestamp("completed_at"),
    /** When the post-completion invite/offer email was sent (at most once). */
    completionInviteEmailSentAt: timestamp("completion_invite_email_sent_at"),
    /** Follow-up nurture emails sent after completion (0 = none yet; first completion email is separate). */
    nurtureFollowupCount: int("nurture_followup_count").default(0).notNull(),
    /** Last time a completion or nurture email was sent (used to schedule next follow-up). */
    nurtureLastSentAt: timestamp("nurture_last_sent_at"),
    /** When nurture was stopped (converted, max emails, or unsubscribe). */
    nurtureStoppedAt: timestamp("nurture_stopped_at"),
    nurtureStoppedReason: varchar("nurture_stopped_reason", { length: 32 }),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (t) => [
    index("idx_survey_responses_survey").on(t.surveyId),
    index("idx_survey_responses_status").on(t.status),
    index("idx_survey_responses_user").on(t.userId),
    index("idx_survey_responses_sanad_office").on(t.sanadOfficeId),
  ],
);
export type SurveyResponse = typeof surveyResponses.$inferSelect;

export const surveyAnswers = mysqlTable(
  "survey_answers",
  {
    id: int("id").autoincrement().primaryKey(),
    responseId: int("response_id")
      .notNull()
      .references(() => surveyResponses.id, { onDelete: "cascade" }),
    questionId: int("question_id")
      .notNull()
      .references(() => surveyQuestions.id, { onDelete: "cascade" }),
    answerValue: text("answer_value"),
    selectedOptions: json("selected_options").$type<number[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (t) => [
    unique("uq_survey_answers_response_question").on(t.responseId, t.questionId),
    index("idx_survey_answers_response").on(t.responseId),
  ],
);
export type SurveyAnswer = typeof surveyAnswers.$inferSelect;

export const surveyResponseTags = mysqlTable(
  "survey_response_tags",
  {
    id: int("id").autoincrement().primaryKey(),
    responseId: int("response_id")
      .notNull()
      .references(() => surveyResponses.id, { onDelete: "cascade" }),
    tagId: int("tag_id")
      .notNull()
      .references(() => surveyTags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("uq_survey_response_tags").on(t.responseId, t.tagId),
    index("idx_survey_response_tags_response").on(t.responseId),
  ],
);
export type SurveyResponseTag = typeof surveyResponseTags.$inferSelect;

/** Audit trail when platform staff email / WhatsApp-api invite Sanad offices to a survey (follow-up visibility). */
export const surveySanadOfficeOutreach = mysqlTable(
  "survey_sanad_office_outreach",
  {
    id: int("id").autoincrement().primaryKey(),
    surveyId: int("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    sanadOfficeId: int("sanad_office_id")
      .notNull()
      .references(() => sanadOffices.id, { onDelete: "cascade" }),
    batchId: varchar("batch_id", { length: 36 }).notNull(),
    channel: mysqlEnum("channel", ["email", "whatsapp_api"]).notNull(),
    outcome: mysqlEnum("outcome", [
      "sent",
      "failed",
      "skipped_no_email",
      "skipped_no_phone",
    ]).notNull(),
    detail: varchar("detail", { length: 500 }),
    actorUserId: int("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_survey_outreach_survey_office").on(t.surveyId, t.sanadOfficeId),
    index("idx_survey_outreach_batch").on(t.batchId),
    index("idx_survey_outreach_created").on(t.createdAt),
  ],
);
export type SurveySanadOfficeOutreach = typeof surveySanadOfficeOutreach.$inferSelect;

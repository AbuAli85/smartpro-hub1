import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const conn = await createConnection(DATABASE_URL);

// Tables to create
const tables = [
  {
    name: "company_members",
    sql: `CREATE TABLE IF NOT EXISTS company_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      userId INT NOT NULL,
      role ENUM('company_admin','company_member','reviewer','client') NOT NULL DEFAULT 'company_member',
      permissions JSON,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      invitedBy INT,
      joinedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "company_subscriptions",
    sql: `CREATE TABLE IF NOT EXISTS company_subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      planId INT NOT NULL,
      status ENUM('active','cancelled','past_due','trialing','expired') NOT NULL DEFAULT 'active',
      billingCycle ENUM('monthly','annual') NOT NULL DEFAULT 'monthly',
      currentPeriodStart TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      currentPeriodEnd TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelAtPeriodEnd BOOLEAN DEFAULT FALSE,
      stripeSubscriptionId VARCHAR(255),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "contract_signatures",
    sql: `CREATE TABLE IF NOT EXISTS contract_signatures (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contractId INT NOT NULL,
      signerName VARCHAR(255) NOT NULL,
      signerEmail VARCHAR(320) NOT NULL,
      signerRole VARCHAR(100),
      status ENUM('pending','signed','declined','expired') DEFAULT 'pending',
      signedAt TIMESTAMP NULL,
      ipAddress VARCHAR(64),
      signatureUrl TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "contract_templates",
    sql: `CREATE TABLE IF NOT EXISTS contract_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      content TEXT,
      variables JSON,
      isGlobal BOOLEAN DEFAULT FALSE,
      isActive BOOLEAN DEFAULT TRUE,
      createdBy INT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "contracts",
    sql: `CREATE TABLE IF NOT EXISTS contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      createdBy INT NOT NULL,
      contractNumber VARCHAR(50) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      titleAr VARCHAR(255),
      type ENUM('employment','service','nda','partnership','vendor','lease','other') NOT NULL,
      status ENUM('draft','pending_review','pending_signature','signed','active','expired','terminated','cancelled') NOT NULL DEFAULT 'draft',
      partyAName VARCHAR(255),
      partyBName VARCHAR(255),
      value DECIMAL(15,2),
      currency VARCHAR(10) DEFAULT 'OMR',
      startDate TIMESTAMP NULL,
      endDate TIMESTAMP NULL,
      signedAt TIMESTAMP NULL,
      content TEXT,
      templateId INT,
      googleDocId VARCHAR(255),
      pdfUrl TEXT,
      version INT DEFAULT 1,
      tags JSON,
      notes TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "crm_communications",
    sql: `CREATE TABLE IF NOT EXISTS crm_communications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      contactId INT,
      dealId INT,
      userId INT NOT NULL,
      type ENUM('email','call','meeting','note','sms','whatsapp') NOT NULL,
      subject VARCHAR(255),
      content TEXT,
      direction ENUM('inbound','outbound') DEFAULT 'outbound',
      duration INT,
      scheduledAt TIMESTAMP NULL,
      completedAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "crm_contacts",
    sql: `CREATE TABLE IF NOT EXISTS crm_contacts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      ownerId INT,
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      email VARCHAR(320),
      phone VARCHAR(32),
      company VARCHAR(255),
      position VARCHAR(100),
      country VARCHAR(10),
      city VARCHAR(100),
      source VARCHAR(100),
      status ENUM('lead','prospect','customer','inactive') NOT NULL DEFAULT 'lead',
      tags JSON,
      notes TEXT,
      avatarUrl TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "crm_deals",
    sql: `CREATE TABLE IF NOT EXISTS crm_deals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      contactId INT,
      ownerId INT,
      title VARCHAR(255) NOT NULL,
      value DECIMAL(15,2),
      currency VARCHAR(10) DEFAULT 'OMR',
      stage ENUM('lead','qualified','proposal','negotiation','closed_won','closed_lost') NOT NULL DEFAULT 'lead',
      probability INT DEFAULT 0,
      expectedCloseDate TIMESTAMP NULL,
      closedAt TIMESTAMP NULL,
      source VARCHAR(100),
      notes TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "employees",
    sql: `CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      userId INT,
      employeeNumber VARCHAR(50),
      firstName VARCHAR(100) NOT NULL,
      lastName VARCHAR(100) NOT NULL,
      firstNameAr VARCHAR(100),
      lastNameAr VARCHAR(100),
      email VARCHAR(320),
      phone VARCHAR(32),
      nationality VARCHAR(100),
      passportNumber VARCHAR(50),
      nationalId VARCHAR(50),
      department VARCHAR(100),
      position VARCHAR(100),
      managerId INT,
      employmentType ENUM('full_time','part_time','contract','intern') DEFAULT 'full_time',
      status ENUM('active','on_leave','terminated','resigned') NOT NULL DEFAULT 'active',
      hireDate TIMESTAMP NULL,
      terminationDate TIMESTAMP NULL,
      salary DECIMAL(12,2),
      currency VARCHAR(10) DEFAULT 'OMR',
      avatarUrl TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "job_applications",
    sql: `CREATE TABLE IF NOT EXISTS job_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jobId INT NOT NULL,
      companyId INT NOT NULL,
      applicantName VARCHAR(255) NOT NULL,
      applicantEmail VARCHAR(320) NOT NULL,
      applicantPhone VARCHAR(32),
      resumeUrl TEXT,
      coverLetter TEXT,
      stage ENUM('applied','screening','interview','assessment','offer','hired','rejected') NOT NULL DEFAULT 'applied',
      notes TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "job_postings",
    sql: `CREATE TABLE IF NOT EXISTS job_postings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      department VARCHAR(100),
      location VARCHAR(255),
      type ENUM('full_time','part_time','contract','intern') DEFAULT 'full_time',
      status ENUM('draft','open','closed','on_hold') NOT NULL DEFAULT 'draft',
      description TEXT,
      requirements TEXT,
      salaryMin DECIMAL(10,2),
      salaryMax DECIMAL(10,2),
      currency VARCHAR(10) DEFAULT 'OMR',
      applicationDeadline TIMESTAMP NULL,
      createdBy INT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "leave_requests",
    sql: `CREATE TABLE IF NOT EXISTS leave_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      employeeId INT NOT NULL,
      approvedBy INT,
      leaveType ENUM('annual','sick','emergency','maternity','paternity','unpaid','other') NOT NULL,
      status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      startDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      endDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      days DECIMAL(4,1),
      reason TEXT,
      notes TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "marketplace_bookings",
    sql: `CREATE TABLE IF NOT EXISTS marketplace_bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      clientId INT NOT NULL,
      providerId INT NOT NULL,
      serviceId INT NOT NULL,
      bookingNumber VARCHAR(50) NOT NULL UNIQUE,
      status ENUM('pending','confirmed','in_progress','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
      scheduledAt TIMESTAMP NULL,
      completedAt TIMESTAMP NULL,
      amount DECIMAL(10,2),
      currency VARCHAR(10) DEFAULT 'OMR',
      notes TEXT,
      rating INT,
      review TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "marketplace_providers",
    sql: `CREATE TABLE IF NOT EXISTS marketplace_providers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      companyId INT,
      businessName VARCHAR(255) NOT NULL,
      businessNameAr VARCHAR(255),
      category VARCHAR(100) NOT NULL,
      description TEXT,
      descriptionAr TEXT,
      logoUrl TEXT,
      coverUrl TEXT,
      phone VARCHAR(32),
      email VARCHAR(320),
      website VARCHAR(255),
      location VARCHAR(255),
      city VARCHAR(100),
      country VARCHAR(10) DEFAULT 'OM',
      rating DECIMAL(3,2) DEFAULT 0.00,
      reviewCount INT DEFAULT 0,
      completedJobs INT DEFAULT 0,
      isVerified BOOLEAN DEFAULT FALSE,
      isFeatured BOOLEAN DEFAULT FALSE,
      status ENUM('active','inactive','pending_review','suspended') NOT NULL DEFAULT 'pending_review',
      tags JSON,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "marketplace_services",
    sql: `CREATE TABLE IF NOT EXISTS marketplace_services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      providerId INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      nameAr VARCHAR(255),
      description TEXT,
      category VARCHAR(100),
      price DECIMAL(10,2),
      priceType ENUM('fixed','hourly','daily','custom') DEFAULT 'fixed',
      currency VARCHAR(10) DEFAULT 'OMR',
      duration INT,
      isActive BOOLEAN DEFAULT TRUE,
      tags JSON,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "notifications",
    sql: `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      companyId INT,
      type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      isRead BOOLEAN NOT NULL DEFAULT FALSE,
      link VARCHAR(500),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "payroll_records",
    sql: `CREATE TABLE IF NOT EXISTS payroll_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      employeeId INT NOT NULL,
      periodMonth INT NOT NULL,
      periodYear INT NOT NULL,
      basicSalary DECIMAL(12,2) NOT NULL,
      allowances DECIMAL(12,2) DEFAULT 0,
      deductions DECIMAL(12,2) DEFAULT 0,
      taxAmount DECIMAL(12,2) DEFAULT 0,
      netSalary DECIMAL(12,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'OMR',
      status ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
      paidAt TIMESTAMP NULL,
      notes TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "performance_reviews",
    sql: `CREATE TABLE IF NOT EXISTS performance_reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      employeeId INT NOT NULL,
      reviewerId INT NOT NULL,
      period VARCHAR(50) NOT NULL,
      overallScore DECIMAL(4,2),
      status ENUM('draft','submitted','acknowledged') NOT NULL DEFAULT 'draft',
      strengths TEXT,
      improvements TEXT,
      goals TEXT,
      comments TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "pro_services",
    sql: `CREATE TABLE IF NOT EXISTS pro_services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      requestedBy INT NOT NULL,
      assignedProId INT,
      serviceNumber VARCHAR(50) NOT NULL UNIQUE,
      serviceType ENUM('visa_processing','work_permit','labor_card','emirates_id','oman_id','residence_renewal','visa_renewal','permit_renewal','document_attestation','company_registration','other') NOT NULL,
      status ENUM('pending','assigned','in_progress','awaiting_documents','submitted_to_authority','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
      priority ENUM('low','normal','high','urgent') DEFAULT 'normal',
      employeeName VARCHAR(255),
      employeeNameAr VARCHAR(255),
      nationality VARCHAR(100),
      passportNumber VARCHAR(50),
      passportExpiry TIMESTAMP NULL,
      visaNumber VARCHAR(50),
      permitNumber VARCHAR(50),
      expiryDate TIMESTAMP NULL,
      renewalAlertDays INT DEFAULT 30,
      notes TEXT,
      fees DECIMAL(10,2),
      documents JSON,
      completedAt TIMESTAMP NULL,
      dueDate TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "sanad_applications",
    sql: `CREATE TABLE IF NOT EXISTS sanad_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      officeId INT,
      applicantId INT NOT NULL,
      assignedToId INT,
      applicationNumber VARCHAR(50) NOT NULL UNIQUE,
      type ENUM('visa','labor_card','commercial_registration','work_permit','residence_permit','business_license','other') NOT NULL,
      status ENUM('draft','submitted','under_review','awaiting_documents','processing','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'draft',
      priority ENUM('low','normal','high','urgent') DEFAULT 'normal',
      applicantName VARCHAR(255),
      applicantNameAr VARCHAR(255),
      nationality VARCHAR(100),
      passportNumber VARCHAR(50),
      notes TEXT,
      rejectionReason TEXT,
      submittedAt TIMESTAMP NULL,
      completedAt TIMESTAMP NULL,
      dueDate TIMESTAMP NULL,
      fees DECIMAL(10,2),
      documents JSON,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "sanad_offices",
    sql: `CREATE TABLE IF NOT EXISTS sanad_offices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      nameAr VARCHAR(255),
      licenseNumber VARCHAR(100),
      location VARCHAR(255),
      city VARCHAR(100),
      governorate VARCHAR(100),
      phone VARCHAR(32),
      email VARCHAR(320),
      managerId INT,
      status ENUM('active','inactive','pending_approval','suspended') NOT NULL DEFAULT 'pending_approval',
      openingHours JSON,
      services JSON,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "subscription_invoices",
    sql: `CREATE TABLE IF NOT EXISTS subscription_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      companyId INT NOT NULL,
      subscriptionId INT NOT NULL,
      invoiceNumber VARCHAR(50) NOT NULL UNIQUE,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'OMR',
      status ENUM('draft','issued','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
      dueDate TIMESTAMP NULL,
      paidAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "subscription_plans",
    sql: `CREATE TABLE IF NOT EXISTS subscription_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      nameAr VARCHAR(100),
      slug VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      priceMonthly DECIMAL(10,2) NOT NULL,
      priceAnnual DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'OMR',
      maxUsers INT DEFAULT 5,
      maxContracts INT DEFAULT 50,
      maxStorage INT DEFAULT 5120,
      features JSON,
      isActive BOOLEAN NOT NULL DEFAULT TRUE,
      sortOrder INT DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

// Alter users table
const alterStatements = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatarUrl TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS platformRole ENUM('super_admin','platform_admin','company_admin','company_member','reviewer','client') NOT NULL DEFAULT 'client'",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS isActive BOOLEAN NOT NULL DEFAULT TRUE",
];

console.log("Applying migrations...");

for (const table of tables) {
  try {
    await conn.execute(table.sql);
    console.log(`✓ Created table: ${table.name}`);
  } catch (e) {
    if (e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log(`- Table exists: ${table.name}`);
    } else {
      console.error(`✗ Error creating ${table.name}:`, e.message);
    }
  }
}

for (const stmt of alterStatements) {
  try {
    await conn.execute(stmt);
    console.log(`✓ Altered: ${stmt.substring(0, 60)}...`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.message.includes("Duplicate column")) {
      console.log(`- Column exists: ${stmt.substring(0, 60)}...`);
    } else {
      console.error(`✗ Error:`, e.message);
    }
  }
}

// Seed subscription plans
const plans = [
  {
    name: "Basic",
    nameAr: "الأساسية",
    slug: "basic",
    description: "Perfect for small businesses getting started",
    priceMonthly: 29.0,
    priceAnnual: 290.0,
    maxUsers: 5,
    maxContracts: 50,
    maxStorage: 5120,
    features: JSON.stringify(["sanad_offices", "pro_services", "contracts_basic", "crm_basic"]),
    sortOrder: 1,
  },
  {
    name: "Professional",
    nameAr: "المهنية",
    slug: "professional",
    description: "For growing businesses with advanced needs",
    priceMonthly: 79.0,
    priceAnnual: 790.0,
    maxUsers: 25,
    maxContracts: 500,
    maxStorage: 51200,
    features: JSON.stringify([
      "sanad_offices",
      "pro_services",
      "contracts_full",
      "crm_full",
      "hr_module",
      "marketplace",
      "analytics",
    ]),
    sortOrder: 2,
  },
  {
    name: "Enterprise",
    nameAr: "المؤسسية",
    slug: "enterprise",
    description: "Full platform access for large organizations",
    priceMonthly: 199.0,
    priceAnnual: 1990.0,
    maxUsers: -1,
    maxContracts: -1,
    maxStorage: -1,
    features: JSON.stringify([
      "sanad_offices",
      "pro_services",
      "contracts_full",
      "crm_full",
      "hr_module",
      "marketplace",
      "analytics",
      "custom_reports",
      "api_access",
      "white_label",
      "priority_support",
    ]),
    sortOrder: 3,
  },
];

for (const plan of plans) {
  try {
    await conn.execute(
      `INSERT IGNORE INTO subscription_plans (name, nameAr, slug, description, priceMonthly, priceAnnual, maxUsers, maxContracts, maxStorage, features, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        plan.name,
        plan.nameAr,
        plan.slug,
        plan.description,
        plan.priceMonthly,
        plan.priceAnnual,
        plan.maxUsers,
        plan.maxContracts,
        plan.maxStorage,
        plan.features,
        plan.sortOrder,
      ]
    );
    console.log(`✓ Seeded plan: ${plan.name}`);
  } catch (e) {
    console.log(`- Plan exists: ${plan.name}`);
  }
}

await conn.end();
console.log("\nMigration complete!");

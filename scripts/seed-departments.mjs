import { createConnection } from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await createConnection(DB_URL);

// Find all companies
const [companies] = await conn.execute("SELECT id, name FROM companies LIMIT 10");
console.log("Companies:", companies.map(c => `${c.id}: ${c.name}`).join(", "));

// Use the first company that looks like Falcon Eye, else first company
const company = companies.find(c => c.name.toLowerCase().includes("falcon")) || companies[0];
if (!company) { console.error("No companies found"); await conn.end(); process.exit(1); }
const companyId = company.id;
console.log(`Seeding into company: ${company.name} (id=${companyId})\n`);

// Check existing departments
const [existing] = await conn.execute("SELECT name FROM departments WHERE company_id = ?", [companyId]);
const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
console.log("Existing departments:", [...existingNames].join(", ") || "(none)");

const DEPARTMENTS = [
  {
    name: "Human Resources",
    nameAr: "الموارد البشرية",
    description: "Manages recruitment, employee relations, payroll, and HR compliance",
    positions: ["HR Manager", "HR Officer", "Recruitment Specialist", "Payroll Officer", "Training Coordinator"]
  },
  {
    name: "Sales",
    nameAr: "المبيعات",
    description: "Drives revenue through client acquisition, relationship management, and sales strategy",
    positions: ["Sales Manager", "Senior Sales Executive", "Sales Executive", "Business Development Officer", "Account Manager"]
  },
  {
    name: "Marketing",
    nameAr: "التسويق",
    description: "Manages brand, digital marketing, campaigns, and market research",
    positions: ["Marketing Manager", "Digital Marketing Specialist", "Content Creator", "Graphic Designer", "SEO Specialist"]
  },
  {
    name: "Operations",
    nameAr: "العمليات",
    description: "Oversees daily business operations, process improvement, and service delivery",
    positions: ["Operations Manager", "Operations Officer", "Process Coordinator", "Quality Assurance Officer", "Logistics Coordinator"]
  },
  {
    name: "Finance & Accounting",
    nameAr: "المالية والمحاسبة",
    description: "Manages financial reporting, budgeting, accounts payable/receivable, and audits",
    positions: ["Finance Manager", "Senior Accountant", "Accountant", "Accounts Payable Officer", "Financial Analyst"]
  },
  {
    name: "Information Technology",
    nameAr: "تقنية المعلومات",
    description: "Manages IT infrastructure, software systems, cybersecurity, and technical support",
    positions: ["IT Manager", "Systems Administrator", "Software Developer", "IT Support Specialist", "Network Engineer"]
  },
  {
    name: "Legal & Compliance",
    nameAr: "الشؤون القانونية والامتثال",
    description: "Handles contracts, regulatory compliance, corporate governance, and legal advisory",
    positions: ["Legal Manager", "Legal Counsel", "Compliance Officer", "Contract Specialist", "Corporate Secretary"]
  },
  {
    name: "Customer Service",
    nameAr: "خدمة العملاء",
    description: "Provides client support, handles inquiries, complaints, and ensures customer satisfaction",
    positions: ["Customer Service Manager", "Senior Customer Service Officer", "Customer Service Representative", "Client Relations Officer"]
  },
  {
    name: "Procurement",
    nameAr: "المشتريات",
    description: "Manages vendor relations, purchasing, supply chain, and procurement compliance",
    positions: ["Procurement Manager", "Procurement Officer", "Vendor Relations Specialist", "Supply Chain Coordinator"]
  },
  {
    name: "Administration",
    nameAr: "الإدارة",
    description: "Handles office management, executive support, document control, and administrative services",
    positions: ["Office Manager", "Executive Assistant", "Administrative Officer", "Document Controller", "Receptionist"]
  },
];

let deptCreated = 0;
let posCreated = 0;

for (const dept of DEPARTMENTS) {
  if (existingNames.has(dept.name.toLowerCase())) {
    console.log(`  SKIP (exists): ${dept.name}`);
    continue;
  }

  const [result] = await conn.execute(
    `INSERT INTO departments (name, name_ar, description, company_id, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
    [dept.name, dept.nameAr, dept.description, companyId]
  );
  const deptId = result.insertId;
  deptCreated++;
  console.log(`  CREATED: ${dept.name} (id=${deptId})`);

  for (const posTitle of dept.positions) {
    await conn.execute(
      `INSERT INTO positions (title, company_id, department_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [posTitle, companyId, deptId]
    );
    posCreated++;
  }
  console.log(`    + ${dept.positions.length} positions`);
}

console.log(`\nDone. Created ${deptCreated} departments and ${posCreated} positions.`);
await conn.end();

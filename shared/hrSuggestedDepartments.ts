/**
 * Default department suggestions for onboarding — English display names with Arabic labels.
 * Seeding skips any row whose English name already exists (case-insensitive) for the company.
 */
export type SuggestedDepartment = {
  name: string;
  nameAr: string;
  description?: string;
};

export const SUGGESTED_DEPARTMENTS: SuggestedDepartment[] = [
  { name: "Human Resources", nameAr: "الموارد البشرية", description: "People, policies, payroll coordination, and employee lifecycle." },
  { name: "Finance & Accounting", nameAr: "المالية والمحاسبة", description: "Financial reporting, accounts payable/receivable, and budgeting." },
  { name: "Operations", nameAr: "العمليات", description: "Day-to-day business operations and process excellence." },
  { name: "Sales", nameAr: "المبيعات", description: "Revenue generation, customer acquisition, and account growth." },
  { name: "Marketing", nameAr: "التسويق", description: "Brand, campaigns, content, and market growth." },
  { name: "Information Technology", nameAr: "تقنية المعلومات", description: "Systems, infrastructure, security, and internal tools." },
  { name: "Legal & Compliance", nameAr: "الشؤون القانونية والامتثال", description: "Contracts, regulatory compliance, and corporate governance." },
  { name: "Customer Service", nameAr: "خدمة العملاء", description: "Client support, satisfaction, and issue resolution." },
];

/**
 * Seed: Oman Business Sector Survey 2026 — MVP (22 questions, 6 sections)
 *
 * Run after survey tables have been migrated:
 *   npx tsx scripts/seed-oman-survey.ts
 *
 * Idempotent for tags (onDuplicateKeyUpdate). For the survey itself,
 * run once per environment. Delete the survey row to re-seed.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import {
  surveys,
  surveySections,
  surveyQuestions,
  surveyOptions,
  surveyTags,
} from "../drizzle/schema";

// ── Helpers ─────────────────────────────────────────────────────────────────

type QType =
  | "text"
  | "textarea"
  | "single_choice"
  | "multi_choice"
  | "rating"
  | "number"
  | "dropdown"
  | "yes_no";

interface OptionDef {
  value: string;
  labelEn: string;
  labelAr: string;
  score: number;
  tags?: string[];
}

interface QuestionDef {
  key: string;
  type: QType;
  labelEn: string;
  labelAr: string;
  hintEn?: string;
  hintAr?: string;
  isRequired: boolean;
  settings?: Record<string, unknown>;
  scoringRule?: {
    category: string;
    weight: number;
    optionScores?: Record<string, number>;
  };
  options?: OptionDef[];
}

interface SectionDef {
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  questions: QuestionDef[];
}

// ── Tag definitions ─────────────────────────────────────────────────────────

const TAG_DEFS = [
  { slug: "needs_hr", labelEn: "Needs HR Support", labelAr: "يحتاج دعم الموارد البشرية", category: "service" },
  { slug: "needs_pro", labelEn: "Needs PRO Services", labelAr: "يحتاج خدمات PRO", category: "service" },
  { slug: "needs_digital", labelEn: "Needs Digital Tools", labelAr: "يحتاج أدوات رقمية", category: "service" },
  { slug: "needs_compliance", labelEn: "Needs Compliance Help", labelAr: "يحتاج مساعدة الامتثال", category: "service" },
  { slug: "needs_payroll", labelEn: "Needs Payroll/WPS", labelAr: "يحتاج كشوف الرواتب/WPS", category: "service" },
  { slug: "high_omanisation_pressure", labelEn: "High Omanisation Pressure", labelAr: "ضغط عالي للتعمين", category: "pain" },
  { slug: "manual_processes", labelEn: "Manual Processes", labelAr: "عمليات يدوية", category: "pain" },
  { slug: "gov_complexity", labelEn: "Government Complexity", labelAr: "تعقيد حكومي", category: "pain" },
  { slug: "recruitment_struggle", labelEn: "Recruitment Struggle", labelAr: "صعوبة التوظيف", category: "pain" },
  { slug: "sme", labelEn: "SME", labelAr: "شركات صغيرة ومتوسطة", category: "segment" },
  { slug: "enterprise", labelEn: "Enterprise", labelAr: "مؤسسات كبيرة", category: "segment" },
  { slug: "muscat_based", labelEn: "Muscat Based", labelAr: "مقرها مسقط", category: "location" },
  { slug: "outside_muscat", labelEn: "Outside Muscat", labelAr: "خارج مسقط", category: "location" },
  { slug: "high_trust", labelEn: "High Trust / Ready to Adopt", labelAr: "ثقة عالية / جاهز للتبني", category: "readiness" },
  { slug: "price_sensitive", labelEn: "Price Sensitive", labelAr: "حساس للسعر", category: "readiness" },
];

// ── Survey Content ──────────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  // ───── Section 1: Company Profile ────────────────────────────────────
  {
    slug: "company-profile",
    titleEn: "Company Profile",
    titleAr: "ملف الشركة",
    descriptionEn: "Basic information about your company.",
    descriptionAr: "معلومات أساسية عن شركتك.",
    questions: [
      {
        key: "cp_sector",
        type: "dropdown",
        labelEn: "What sector does your company operate in?",
        labelAr: "في أي قطاع تعمل شركتك؟",
        isRequired: true,
        scoringRule: { category: "smartpro_fit", weight: 1 },
        options: [
          { value: "construction", labelEn: "Construction & Contracting", labelAr: "البناء والمقاولات", score: 4, tags: ["needs_pro"] },
          { value: "oil_gas", labelEn: "Oil & Gas / Energy", labelAr: "النفط والغاز / الطاقة", score: 4, tags: ["needs_compliance"] },
          { value: "trading", labelEn: "Trading & Retail", labelAr: "التجارة والتجزئة", score: 3 },
          { value: "hospitality", labelEn: "Hospitality & Tourism", labelAr: "الضيافة والسياحة", score: 3, tags: ["needs_hr"] },
          { value: "technology", labelEn: "Technology & IT", labelAr: "التكنولوجيا وتقنية المعلومات", score: 3, tags: ["needs_digital"] },
          { value: "healthcare", labelEn: "Healthcare", labelAr: "الرعاية الصحية", score: 4, tags: ["needs_compliance"] },
          { value: "education", labelEn: "Education & Training", labelAr: "التعليم والتدريب", score: 3 },
          { value: "logistics", labelEn: "Logistics & Transport", labelAr: "الخدمات اللوجستية والنقل", score: 3, tags: ["needs_pro"] },
          { value: "manufacturing", labelEn: "Manufacturing", labelAr: "التصنيع", score: 4, tags: ["needs_compliance"] },
          { value: "other", labelEn: "Other", labelAr: "أخرى", score: 2 },
        ],
      },
      {
        key: "cp_size",
        type: "single_choice",
        labelEn: "How many employees does your company have?",
        labelAr: "كم عدد موظفي شركتك؟",
        isRequired: true,
        scoringRule: { category: "staffing_pressure", weight: 1 },
        options: [
          { value: "1-10", labelEn: "1–10 employees", labelAr: "1–10 موظفين", score: 1, tags: ["sme"] },
          { value: "11-50", labelEn: "11–50 employees", labelAr: "11–50 موظفاً", score: 2, tags: ["sme"] },
          { value: "51-200", labelEn: "51–200 employees", labelAr: "51–200 موظف", score: 3 },
          { value: "201-500", labelEn: "201–500 employees", labelAr: "201–500 موظف", score: 4, tags: ["enterprise"] },
          { value: "500+", labelEn: "500+ employees", labelAr: "أكثر من 500 موظف", score: 5, tags: ["enterprise"] },
        ],
      },
      {
        key: "cp_governorate",
        type: "dropdown",
        labelEn: "In which governorate is your company headquartered?",
        labelAr: "في أي محافظة يقع المقر الرئيسي لشركتك؟",
        isRequired: true,
        options: [
          { value: "muscat", labelEn: "Muscat", labelAr: "مسقط", score: 0, tags: ["muscat_based"] },
          { value: "dhofar", labelEn: "Dhofar", labelAr: "ظفار", score: 0, tags: ["outside_muscat"] },
          { value: "north_batinah", labelEn: "North Al-Batinah", labelAr: "شمال الباطنة", score: 0, tags: ["outside_muscat"] },
          { value: "south_batinah", labelEn: "South Al-Batinah", labelAr: "جنوب الباطنة", score: 0, tags: ["outside_muscat"] },
          { value: "ad_dakhiliyah", labelEn: "Ad Dakhiliyah", labelAr: "الداخلية", score: 0, tags: ["outside_muscat"] },
          { value: "ash_sharqiyah_north", labelEn: "North Ash Sharqiyah", labelAr: "شمال الشرقية", score: 0, tags: ["outside_muscat"] },
          { value: "ash_sharqiyah_south", labelEn: "South Ash Sharqiyah", labelAr: "جنوب الشرقية", score: 0, tags: ["outside_muscat"] },
          { value: "al_buraimi", labelEn: "Al Buraimi", labelAr: "البريمي", score: 0, tags: ["outside_muscat"] },
          { value: "al_dhahirah", labelEn: "Al Dhahirah", labelAr: "الظاهرة", score: 0, tags: ["outside_muscat"] },
          { value: "musandam", labelEn: "Musandam", labelAr: "مسندم", score: 0, tags: ["outside_muscat"] },
          { value: "al_wusta", labelEn: "Al Wusta", labelAr: "الوسطى", score: 0, tags: ["outside_muscat"] },
        ],
      },
      {
        key: "cp_years",
        type: "single_choice",
        labelEn: "How long has your company been operating?",
        labelAr: "منذ متى تعمل شركتك؟",
        isRequired: true,
        options: [
          { value: "less_1", labelEn: "Less than 1 year", labelAr: "أقل من سنة", score: 1 },
          { value: "1_3", labelEn: "1–3 years", labelAr: "1–3 سنوات", score: 2 },
          { value: "4_10", labelEn: "4–10 years", labelAr: "4–10 سنوات", score: 3 },
          { value: "10_plus", labelEn: "More than 10 years", labelAr: "أكثر من 10 سنوات", score: 4 },
        ],
      },
    ],
  },
  // ───── Section 2: Business Activity ──────────────────────────────────
  {
    slug: "business-activity",
    titleEn: "Business Activity",
    titleAr: "النشاط التجاري",
    descriptionEn: "Understanding your operational challenges.",
    descriptionAr: "فهم التحديات التشغيلية الخاصة بك.",
    questions: [
      {
        key: "ba_pain",
        type: "multi_choice",
        labelEn: "What are the biggest operational challenges your company faces?",
        labelAr: "ما أكبر التحديات التشغيلية التي تواجهها شركتك؟",
        hintEn: "Select all that apply",
        hintAr: "اختر كل ما ينطبق",
        isRequired: true,
        scoringRule: { category: "smartpro_fit", weight: 2 },
        options: [
          { value: "hiring", labelEn: "Finding qualified employees", labelAr: "إيجاد موظفين مؤهلين", score: 3, tags: ["recruitment_struggle", "needs_hr"] },
          { value: "retention", labelEn: "Employee retention", labelAr: "الاحتفاظ بالموظفين", score: 3, tags: ["needs_hr"] },
          { value: "compliance", labelEn: "Government compliance & renewals", labelAr: "الامتثال الحكومي والتجديدات", score: 4, tags: ["needs_compliance", "gov_complexity"] },
          { value: "payroll", labelEn: "Payroll & WPS processing", labelAr: "معالجة الرواتب و WPS", score: 3, tags: ["needs_payroll"] },
          { value: "documents", labelEn: "Document management & tracking", labelAr: "إدارة الوثائق والتتبع", score: 2, tags: ["manual_processes"] },
          { value: "growth", labelEn: "Scaling operations", labelAr: "توسيع العمليات", score: 2 },
          { value: "cost", labelEn: "Cost control", labelAr: "ضبط التكاليف", score: 2, tags: ["price_sensitive"] },
        ],
      },
      {
        key: "ba_growth",
        type: "single_choice",
        labelEn: "How would you describe your company's growth trajectory?",
        labelAr: "كيف تصف مسار نمو شركتك؟",
        isRequired: true,
        scoringRule: { category: "smartpro_fit", weight: 1 },
        options: [
          { value: "rapid", labelEn: "Rapidly growing", labelAr: "نمو سريع", score: 5 },
          { value: "steady", labelEn: "Steady growth", labelAr: "نمو ثابت", score: 4 },
          { value: "stable", labelEn: "Stable / maintaining", labelAr: "مستقر / صيانة", score: 2 },
          { value: "declining", labelEn: "Facing challenges / declining", labelAr: "يواجه تحديات / في تراجع", score: 3 },
        ],
      },
      {
        key: "ba_revenue",
        type: "single_choice",
        labelEn: "What is your company's approximate annual revenue?",
        labelAr: "ما هو الإيراد السنوي التقريبي لشركتك؟",
        isRequired: false,
        options: [
          { value: "under_100k", labelEn: "Under OMR 100,000", labelAr: "أقل من 100,000 ر.ع", score: 1, tags: ["sme"] },
          { value: "100k_500k", labelEn: "OMR 100,000–500,000", labelAr: "100,000–500,000 ر.ع", score: 2, tags: ["sme"] },
          { value: "500k_2m", labelEn: "OMR 500,000–2,000,000", labelAr: "500,000–2,000,000 ر.ع", score: 3 },
          { value: "over_2m", labelEn: "Over OMR 2,000,000", labelAr: "أكثر من 2,000,000 ر.ع", score: 4, tags: ["enterprise"] },
          { value: "prefer_not", labelEn: "Prefer not to say", labelAr: "أفضل عدم الإجابة", score: 0 },
        ],
      },
    ],
  },
  // ───── Section 3: Staffing & Recruitment ─────────────────────────────
  {
    slug: "staffing-recruitment",
    titleEn: "Staffing & Recruitment",
    titleAr: "التوظيف والاستقطاب",
    descriptionEn: "Understanding your workforce and Omanisation challenges.",
    descriptionAr: "فهم القوى العاملة وتحديات التعمين.",
    questions: [
      {
        key: "sr_omanisation",
        type: "single_choice",
        labelEn: "How well does your company meet its Omanisation target?",
        labelAr: "ما مدى تحقيق شركتك لهدف التعمين؟",
        isRequired: true,
        scoringRule: { category: "compliance_burden", weight: 2 },
        options: [
          { value: "exceeds", labelEn: "Exceeds target", labelAr: "يتجاوز الهدف", score: 1 },
          { value: "meets", labelEn: "Meets target", labelAr: "يحقق الهدف", score: 2 },
          { value: "slightly_below", labelEn: "Slightly below target", labelAr: "أقل بقليل من الهدف", score: 3, tags: ["high_omanisation_pressure"] },
          { value: "significantly_below", labelEn: "Significantly below target", labelAr: "أقل بكثير من الهدف", score: 5, tags: ["high_omanisation_pressure"] },
          { value: "unsure", labelEn: "Not sure", labelAr: "غير متأكد", score: 3 },
        ],
      },
      {
        key: "sr_hiring_method",
        type: "multi_choice",
        labelEn: "How do you currently recruit employees?",
        labelAr: "كيف تقوم حالياً بتوظيف الموظفين؟",
        isRequired: true,
        scoringRule: { category: "staffing_pressure", weight: 1 },
        options: [
          { value: "word_of_mouth", labelEn: "Word of mouth / referrals", labelAr: "التوصيات / الإحالات", score: 2, tags: ["manual_processes"] },
          { value: "job_boards", labelEn: "Online job boards", labelAr: "مواقع التوظيف الإلكترونية", score: 1 },
          { value: "social_media", labelEn: "Social media", labelAr: "وسائل التواصل الاجتماعي", score: 1 },
          { value: "recruitment_agency", labelEn: "Recruitment agencies", labelAr: "وكالات التوظيف", score: 3 },
          { value: "government_programs", labelEn: "Government programs (NES/Tashgheel)", labelAr: "البرامج الحكومية (NES/تشغيل)", score: 2 },
          { value: "walk_in", labelEn: "Walk-in / direct applications", labelAr: "التقديم المباشر", score: 2, tags: ["manual_processes"] },
        ],
      },
      {
        key: "sr_turnover",
        type: "single_choice",
        labelEn: "What is your approximate annual employee turnover rate?",
        labelAr: "ما هو معدل دوران الموظفين السنوي التقريبي؟",
        isRequired: true,
        scoringRule: { category: "staffing_pressure", weight: 2 },
        options: [
          { value: "low", labelEn: "Under 10%", labelAr: "أقل من 10%", score: 1 },
          { value: "moderate", labelEn: "10–25%", labelAr: "10–25%", score: 2 },
          { value: "high", labelEn: "25–50%", labelAr: "25–50%", score: 4, tags: ["recruitment_struggle"] },
          { value: "very_high", labelEn: "Over 50%", labelAr: "أكثر من 50%", score: 5, tags: ["recruitment_struggle"] },
        ],
      },
      {
        key: "sr_hr_system",
        type: "single_choice",
        labelEn: "Do you use any HR management software?",
        labelAr: "هل تستخدم أي برنامج لإدارة الموارد البشرية؟",
        isRequired: true,
        scoringRule: { category: "digital_maturity", weight: 1 },
        options: [
          { value: "yes_cloud", labelEn: "Yes, cloud-based HR software", labelAr: "نعم، برنامج HR سحابي", score: 4 },
          { value: "yes_basic", labelEn: "Yes, basic / spreadsheets", labelAr: "نعم، أساسي / جداول بيانات", score: 2, tags: ["manual_processes"] },
          { value: "no", labelEn: "No, everything is manual", labelAr: "لا، كل شيء يدوي", score: 1, tags: ["manual_processes", "needs_hr"] },
        ],
      },
    ],
  },
  // ───── Section 4: Government / Compliance Pain ───────────────────────
  {
    slug: "government-compliance",
    titleEn: "Government & Compliance",
    titleAr: "الحكومة والامتثال",
    descriptionEn: "Understanding your relationship with government agencies.",
    descriptionAr: "فهم علاقتك مع الجهات الحكومية.",
    questions: [
      {
        key: "gc_agencies",
        type: "multi_choice",
        labelEn: "Which government agencies do you interact with most?",
        labelAr: "ما الجهات الحكومية التي تتعامل معها أكثر؟",
        hintEn: "Select all that apply",
        hintAr: "اختر كل ما ينطبق",
        isRequired: true,
        scoringRule: { category: "compliance_burden", weight: 1 },
        options: [
          { value: "mol", labelEn: "Ministry of Labour (MoL)", labelAr: "وزارة العمل", score: 3, tags: ["needs_pro"] },
          { value: "rca", labelEn: "Royal Oman Police / RCA", labelAr: "شرطة عُمان السلطانية / RCA", score: 3, tags: ["needs_pro"] },
          { value: "moci", labelEn: "Ministry of Commerce (MoCI)", labelAr: "وزارة التجارة", score: 2, tags: ["needs_compliance"] },
          { value: "pasi", labelEn: "PASI (Social Insurance)", labelAr: "الهيئة العامة للتأمينات الاجتماعية", score: 3, tags: ["needs_payroll"] },
          { value: "tax", labelEn: "Tax Authority", labelAr: "جهاز الضرائب", score: 2, tags: ["needs_compliance"] },
          { value: "municipality", labelEn: "Municipality", labelAr: "البلدية", score: 1 },
        ],
      },
      {
        key: "gc_pain_level",
        type: "single_choice",
        labelEn: "How difficult is government compliance for your business?",
        labelAr: "ما مدى صعوبة الامتثال الحكومي بالنسبة لأعمالك؟",
        isRequired: true,
        scoringRule: { category: "compliance_burden", weight: 2 },
        options: [
          { value: "easy", labelEn: "Easy — we handle it well", labelAr: "سهل — نتعامل معه جيداً", score: 1 },
          { value: "moderate", labelEn: "Moderate — some difficulties", labelAr: "معتدل — بعض الصعوبات", score: 3 },
          { value: "difficult", labelEn: "Difficult — takes significant time", labelAr: "صعب — يستغرق وقتاً كبيراً", score: 4, tags: ["gov_complexity"] },
          { value: "very_difficult", labelEn: "Very difficult — major burden", labelAr: "صعب جداً — عبء كبير", score: 5, tags: ["gov_complexity", "needs_pro"] },
        ],
      },
      {
        key: "gc_pro_usage",
        type: "single_choice",
        labelEn: "Do you use a PRO (Public Relations Officer) or typing office?",
        labelAr: "هل تستخدم مكتب PRO أو مكتب طباعة؟",
        isRequired: true,
        scoringRule: { category: "smartpro_fit", weight: 1 },
        options: [
          { value: "yes_external", labelEn: "Yes, external PRO / typing office", labelAr: "نعم، مكتب PRO خارجي", score: 4, tags: ["needs_pro"] },
          { value: "yes_internal", labelEn: "Yes, in-house PRO staff", labelAr: "نعم، موظف PRO داخلي", score: 3 },
          { value: "no", labelEn: "No, owner handles it", labelAr: "لا، المالك يتولى ذلك", score: 3, tags: ["needs_pro", "manual_processes"] },
        ],
      },
    ],
  },
  // ───── Section 5: Digital Tools & Service Demand ─────────────────────
  {
    slug: "digital-tools",
    titleEn: "Digital Tools & Service Demand",
    titleAr: "الأدوات الرقمية والطلب على الخدمات",
    descriptionEn: "Understanding your technology usage and needs.",
    descriptionAr: "فهم استخدامك للتكنولوجيا واحتياجاتك.",
    questions: [
      {
        key: "dt_current_tools",
        type: "multi_choice",
        labelEn: "What digital tools does your company currently use?",
        labelAr: "ما الأدوات الرقمية التي تستخدمها شركتك حالياً؟",
        hintEn: "Select all that apply",
        hintAr: "اختر كل ما ينطبق",
        isRequired: true,
        scoringRule: { category: "digital_maturity", weight: 2 },
        options: [
          { value: "accounting", labelEn: "Accounting software", labelAr: "برنامج محاسبة", score: 2 },
          { value: "crm", labelEn: "CRM / customer management", labelAr: "إدارة العملاء CRM", score: 3 },
          { value: "hr_software", labelEn: "HR management software", labelAr: "برنامج إدارة الموارد البشرية", score: 3 },
          { value: "erp", labelEn: "ERP system", labelAr: "نظام ERP", score: 4 },
          { value: "spreadsheets", labelEn: "Spreadsheets / manual tracking", labelAr: "جداول بيانات / تتبع يدوي", score: 1, tags: ["manual_processes", "needs_digital"] },
          { value: "none", labelEn: "None", labelAr: "لا شيء", score: 0, tags: ["needs_digital", "manual_processes"] },
        ],
      },
      {
        key: "dt_interest",
        type: "multi_choice",
        labelEn: "Which services would be most valuable for your company?",
        labelAr: "ما الخدمات الأكثر قيمة لشركتك؟",
        hintEn: "Select all that apply",
        hintAr: "اختر كل ما ينطبق",
        isRequired: true,
        scoringRule: { category: "adoption_readiness", weight: 2 },
        options: [
          { value: "hr_platform", labelEn: "HR & workforce management platform", labelAr: "منصة إدارة الموارد البشرية والقوى العاملة", score: 4, tags: ["needs_hr"] },
          { value: "pro_services", labelEn: "Government services / PRO management", labelAr: "الخدمات الحكومية / إدارة PRO", score: 4, tags: ["needs_pro"] },
          { value: "payroll_wps", labelEn: "Payroll & WPS automation", labelAr: "أتمتة الرواتب و WPS", score: 4, tags: ["needs_payroll"] },
          { value: "compliance_tracking", labelEn: "Compliance & document tracking", labelAr: "تتبع الامتثال والوثائق", score: 3, tags: ["needs_compliance"] },
          { value: "analytics", labelEn: "Business analytics & reporting", labelAr: "التحليلات وإعداد التقارير", score: 3, tags: ["needs_digital"] },
          { value: "crm_portal", labelEn: "Client portal & CRM", labelAr: "بوابة العملاء و CRM", score: 3, tags: ["needs_digital"] },
        ],
      },
      {
        key: "dt_budget",
        type: "single_choice",
        labelEn: "What monthly budget would you allocate for a business management platform?",
        labelAr: "ما الميزانية الشهرية التي ستخصصها لمنصة إدارة الأعمال؟",
        isRequired: true,
        scoringRule: { category: "adoption_readiness", weight: 1 },
        options: [
          { value: "under_50", labelEn: "Under OMR 50/month", labelAr: "أقل من 50 ر.ع / شهرياً", score: 1, tags: ["price_sensitive"] },
          { value: "50_150", labelEn: "OMR 50–150/month", labelAr: "50–150 ر.ع / شهرياً", score: 3 },
          { value: "150_500", labelEn: "OMR 150–500/month", labelAr: "150–500 ر.ع / شهرياً", score: 4 },
          { value: "over_500", labelEn: "Over OMR 500/month", labelAr: "أكثر من 500 ر.ع / شهرياً", score: 5 },
          { value: "unsure", labelEn: "Not sure yet", labelAr: "غير متأكد بعد", score: 2, tags: ["price_sensitive"] },
        ],
      },
    ],
  },
  // ───── Section 6: Trust, Interest & Final Comments ───────────────────
  {
    slug: "trust-interest",
    titleEn: "Trust, Interest & Final Comments",
    titleAr: "الثقة والاهتمام والتعليقات النهائية",
    descriptionEn: "Your overall impressions and willingness to adopt new solutions.",
    descriptionAr: "انطباعاتك العامة واستعدادك لتبني حلول جديدة.",
    questions: [
      {
        key: "ti_platform_interest",
        type: "rating",
        labelEn: "How interested are you in an all-in-one Oman business management platform?",
        labelAr: "ما مدى اهتمامك بمنصة إدارة أعمال شاملة لعُمان؟",
        isRequired: true,
        settings: { max: 5 },
        scoringRule: { category: "adoption_readiness", weight: 2, optionScores: { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 } },
      },
      {
        key: "ti_demo",
        type: "yes_no",
        labelEn: "Would you be interested in a free demo of SmartPRO Hub?",
        labelAr: "هل ترغب في عرض تجريبي مجاني لمنصة SmartPRO Hub؟",
        isRequired: false,
        scoringRule: { category: "adoption_readiness", weight: 1, optionScores: { yes: 5, no: 1 } },
      },
      {
        key: "ti_trust",
        type: "single_choice",
        labelEn: "What matters most when choosing a business management platform?",
        labelAr: "ما الأهم عند اختيار منصة إدارة الأعمال؟",
        isRequired: true,
        scoringRule: { category: "adoption_readiness", weight: 1 },
        options: [
          { value: "local_support", labelEn: "Local support in Oman", labelAr: "دعم محلي في عُمان", score: 3, tags: ["high_trust"] },
          { value: "arabic_support", labelEn: "Arabic language support", labelAr: "دعم اللغة العربية", score: 3, tags: ["high_trust"] },
          { value: "price", labelEn: "Affordable pricing", labelAr: "أسعار معقولة", score: 2, tags: ["price_sensitive"] },
          { value: "integration", labelEn: "Integration with government systems", labelAr: "التكامل مع الأنظمة الحكومية", score: 4, tags: ["high_trust"] },
          { value: "ease", labelEn: "Easy to use", labelAr: "سهل الاستخدام", score: 3 },
        ],
      },
      {
        key: "ti_comments",
        type: "textarea",
        labelEn: "Any additional comments or suggestions?",
        labelAr: "أي تعليقات أو اقتراحات إضافية؟",
        hintEn: "Optional — share anything we should know about your business needs.",
        hintAr: "اختياري — شارك أي شيء يجب أن نعرفه عن احتياجات عملك.",
        isRequired: false,
      },
    ],
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const db = drizzle(url);

  console.log("[seed] Seeding survey tags...");
  for (const tag of TAG_DEFS) {
    await db
      .insert(surveyTags)
      .values(tag)
      .onDuplicateKeyUpdate({ set: { labelEn: tag.labelEn, labelAr: tag.labelAr } });
  }

  console.log("[seed] Inserting survey...");
  const [surveyResult] = await db.insert(surveys).values({
    slug: "oman-business-sector-2026",
    titleEn: "Oman Business Sector Intelligence Survey 2026",
    titleAr: "استبيان الذكاء التجاري لقطاع الأعمال في عُمان 2026",
    descriptionEn:
      "Help us understand the challenges, digital readiness, and service needs of Oman's private sector. Your responses will directly shape the solutions we build.",
    descriptionAr:
      "ساعدنا في فهم التحديات والاستعداد الرقمي واحتياجات الخدمات للقطاع الخاص في عُمان. ستساهم إجاباتك مباشرة في تشكيل الحلول التي نبنيها.",
    status: "active",
    welcomeMessageEn:
      "Welcome! This survey takes approximately 10–12 minutes. Your responses are confidential and will help us build better solutions for Oman businesses.",
    welcomeMessageAr:
      "مرحباً! يستغرق هذا الاستبيان حوالي 10-12 دقيقة. إجاباتك سرية وستساعدنا في بناء حلول أفضل للأعمال في عُمان.",
    thankYouMessageEn:
      "Thank you for completing the survey! Your insights are invaluable. We will use this data to shape solutions that serve Oman's business community.",
    thankYouMessageAr:
      "شكراً لإكمال الاستبيان! أفكارك لا تقدر بثمن. سنستخدم هذه البيانات لتشكيل الحلول التي تخدم مجتمع الأعمال في عُمان.",
    allowAnonymous: true,
    estimatedMinutes: 12,
  });
  const surveyId = Number((surveyResult as any).insertId);
  console.log(`[seed] Survey ID: ${surveyId}`);

  for (let si = 0; si < SECTIONS.length; si++) {
    const section = SECTIONS[si];
    console.log(`[seed]   Section ${si + 1}: ${section.titleEn}`);
    const [sectionResult] = await db.insert(surveySections).values({
      surveyId,
      slug: section.slug,
      titleEn: section.titleEn,
      titleAr: section.titleAr,
      descriptionEn: section.descriptionEn,
      descriptionAr: section.descriptionAr,
      sortOrder: si,
    });
    const sectionId = Number((sectionResult as any).insertId);

    for (let qi = 0; qi < section.questions.length; qi++) {
      const q = section.questions[qi];
      const [qResult] = await db.insert(surveyQuestions).values({
        sectionId,
        questionKey: q.key,
        type: q.type,
        labelEn: q.labelEn,
        labelAr: q.labelAr,
        hintEn: q.hintEn ?? null,
        hintAr: q.hintAr ?? null,
        isRequired: q.isRequired,
        sortOrder: qi,
        settings: q.settings ?? null,
        scoringRule: q.scoringRule ?? null,
      });
      const questionId = Number((qResult as any).insertId);

      if (q.options?.length) {
        for (let oi = 0; oi < q.options.length; oi++) {
          const opt = q.options[oi];
          await db.insert(surveyOptions).values({
            questionId,
            value: opt.value,
            labelEn: opt.labelEn,
            labelAr: opt.labelAr,
            score: opt.score,
            sortOrder: oi,
            tags: opt.tags ?? null,
          });
        }
      }
    }
  }

  const totalQuestions = SECTIONS.reduce((sum, s) => sum + s.questions.length, 0);
  console.log(`[seed] Done! ${SECTIONS.length} sections, ${totalQuestions} questions seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});

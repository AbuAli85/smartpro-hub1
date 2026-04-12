/**
 * Shared dropdown options for survey question `cp_sector` (Oman Business Sector Survey).
 * Used by seed-oman-survey.ts and sync-oman-survey-sector-options.ts.
 *
 * Aligned with client CreateCompanyPage INDUSTRIES.
 */

export interface SectorOptionDef {
  value: string;
  labelEn: string;
  labelAr: string;
  score: number;
  tags?: string[];
}

/** Order: finance → built env → energy → tech → trade → services → hospitality → health/edu → logistics → manufacturing → agri → professional → public → other */
export const CP_SECTOR_OPTIONS: SectorOptionDef[] = [
  { value: "investment_asset_mgmt", labelEn: "Investment & Asset Management", labelAr: "الاستثمار وإدارة الأصول", score: 3 },
  { value: "banking_financial", labelEn: "Banking & Financial Services", labelAr: "الخدمات المصرفية والمالية", score: 3, tags: ["needs_compliance"] },
  { value: "insurance", labelEn: "Insurance", labelAr: "التأمين", score: 3, tags: ["needs_compliance"] },
  { value: "accounting_auditing", labelEn: "Accounting & Auditing", labelAr: "المحاسبة والتدقيق", score: 3, tags: ["needs_compliance"] },
  { value: "financial_consulting", labelEn: "Financial Consulting", labelAr: "الاستشارات المالية", score: 3 },
  { value: "real_estate", labelEn: "Real Estate", labelAr: "العقارات", score: 3 },
  { value: "construction", labelEn: "Construction & Contracting", labelAr: "البناء والمقاولات", score: 4, tags: ["needs_pro"] },
  { value: "architecture_engineering", labelEn: "Architecture & Engineering", labelAr: "الهندسة والعمارة", score: 3 },
  { value: "interior_design_fitout", labelEn: "Interior Design & Fit-Out", labelAr: "التصميم الداخلي والتشطيبات", score: 3 },
  { value: "facilities_management", labelEn: "Facilities Management", labelAr: "إدارة المرافق", score: 3 },
  { value: "oil_gas", labelEn: "Oil & Gas", labelAr: "النفط والغاز", score: 4, tags: ["needs_compliance"] },
  { value: "energy_utilities", labelEn: "Energy & Utilities", labelAr: "الطاقة والمرافق", score: 4, tags: ["needs_compliance"] },
  { value: "renewable_energy", labelEn: "Renewable Energy", labelAr: "الطاقة المتجددة", score: 3 },
  { value: "mining_quarrying", labelEn: "Mining & Quarrying", labelAr: "التعدين والمقالع", score: 4, tags: ["needs_compliance"] },
  { value: "technology", labelEn: "Information Technology (IT)", labelAr: "تقنية المعلومات", score: 3, tags: ["needs_digital"] },
  { value: "telecommunications", labelEn: "Telecommunications", labelAr: "الاتصالات", score: 3, tags: ["needs_digital"] },
  { value: "software_development", labelEn: "Software Development", labelAr: "تطوير البرمجيات", score: 3, tags: ["needs_digital"] },
  { value: "cybersecurity", labelEn: "Cybersecurity", labelAr: "الأمن السيبراني", score: 3, tags: ["needs_digital"] },
  { value: "digital_media_marketing", labelEn: "Digital Media & Marketing", labelAr: "الإعلام الرقمي والتسويق", score: 3 },
  { value: "retail_ecommerce", labelEn: "Retail & E-Commerce", labelAr: "التجزئة والتجارة الإلكترونية", score: 3 },
  { value: "import_export", labelEn: "Import & Export", labelAr: "الاستيراد والتصدير", score: 3, tags: ["needs_pro"] },
  { value: "trading", labelEn: "Trading & Distribution", labelAr: "التجارة والتوزيع", score: 3 },
  { value: "wholesale", labelEn: "Wholesale", labelAr: "الجملة", score: 3 },
  { value: "automotive", labelEn: "Automotive & Vehicles", labelAr: "السيارات والمركبات", score: 3 },
  { value: "cleaning_facility", labelEn: "Cleaning & Facility Services", labelAr: "التنظيف وخدمات المرافق", score: 2 },
  { value: "security_services", labelEn: "Security Services", labelAr: "الخدمات الأمنية", score: 3 },
  { value: "maintenance_repair", labelEn: "Maintenance & Repair", labelAr: "الصيانة والإصلاح", score: 2 },
  { value: "catering_food", labelEn: "Catering & Food Services", labelAr: "التموين والخدمات الغذائية", score: 3 },
  { value: "laundry_dry", labelEn: "Laundry & Dry Cleaning", labelAr: "المغاسل والتنظيف الجاف", score: 2 },
  { value: "printing_packaging", labelEn: "Printing & Packaging", labelAr: "الطباعة والتغليف", score: 2 },
  { value: "hospitality", labelEn: "Hospitality & Hotels", labelAr: "الضيافة والفنادق", score: 3, tags: ["needs_hr"] },
  { value: "tourism_travel", labelEn: "Tourism & Travel", labelAr: "السياحة والسفر", score: 3, tags: ["needs_hr"] },
  { value: "restaurants_cafes", labelEn: "Restaurants & Cafes", labelAr: "المطاعم والمقاهي", score: 3 },
  { value: "events_entertainment", labelEn: "Events & Entertainment", labelAr: "الفعاليات والترفيه", score: 3 },
  { value: "healthcare", labelEn: "Healthcare & Medical", labelAr: "الرعاية الصحية", score: 4, tags: ["needs_compliance"] },
  { value: "pharmaceuticals", labelEn: "Pharmaceuticals", labelAr: "الأدوية والصيدلة", score: 4, tags: ["needs_compliance"] },
  { value: "education", labelEn: "Education & Training", labelAr: "التعليم والتدريب", score: 3 },
  { value: "childcare_nurseries", labelEn: "Childcare & Nurseries", labelAr: "رعاية الأطفال والحضانات", score: 3 },
  { value: "logistics", labelEn: "Transport & Logistics", labelAr: "النقل والخدمات اللوجستية", score: 3, tags: ["needs_pro"] },
  { value: "shipping_freight", labelEn: "Shipping & Freight", labelAr: "الشحن والنقل البحري", score: 3, tags: ["needs_pro"] },
  { value: "aviation", labelEn: "Aviation", labelAr: "الطيران", score: 3, tags: ["needs_compliance"] },
  { value: "maritime", labelEn: "Maritime", labelAr: "الملاحة البحرية", score: 3, tags: ["needs_pro"] },
  { value: "manufacturing", labelEn: "Manufacturing", labelAr: "التصنيع", score: 4, tags: ["needs_compliance"] },
  { value: "food_beverage_production", labelEn: "Food & Beverage Production", labelAr: "إنتاج الأغذية والمشروبات", score: 4, tags: ["needs_compliance"] },
  { value: "textile_garments", labelEn: "Textile & Garments", labelAr: "المنسوجات والملابس", score: 3 },
  { value: "furniture_woodwork", labelEn: "Furniture & Woodwork", labelAr: "الأثاث والنجارة", score: 3 },
  { value: "jewelry_accessories", labelEn: "Jewelry & Accessories", labelAr: "المجوهرات والإكسسوارات", score: 3 },
  { value: "cosmetics_perfume", labelEn: "Cosmetics & Perfume", labelAr: "مستحضرات التجميل والعطور", score: 3 },
  { value: "agriculture", labelEn: "Agriculture & Farming", labelAr: "الزراعة والمزارع", score: 3 },
  { value: "fishing_aquaculture", labelEn: "Fishing & Aquaculture", labelAr: "صيد الأسماك والاستزراع المائي", score: 3 },
  { value: "environmental_services", labelEn: "Environmental Services", labelAr: "الخدمات البيئية", score: 3 },
  { value: "waste_management", labelEn: "Waste Management", labelAr: "إدارة النفايات", score: 3, tags: ["needs_compliance"] },
  { value: "legal_services", labelEn: "Legal Services", labelAr: "الخدمات القانونية", score: 3, tags: ["needs_compliance"] },
  { value: "management_consulting", labelEn: "Management Consulting", labelAr: "الاستشارات الإدارية", score: 3 },
  { value: "hr_recruitment", labelEn: "HR & Recruitment", labelAr: "الموارد البشرية والتوظيف", score: 3, tags: ["needs_hr"] },
  { value: "public_relations", labelEn: "Public Relations", labelAr: "العلاقات العامة", score: 2 },
  { value: "research_development", labelEn: "Research & Development", labelAr: "البحث والتطوير", score: 3 },
  { value: "government_public", labelEn: "Government & Public Sector", labelAr: "الحكومة والقطاع العام", score: 4, tags: ["needs_compliance", "gov_complexity"] },
  { value: "nonprofit_ngo", labelEn: "Non-Profit & NGO", labelAr: "غير الربحية والمنظمات غير الحكومية", score: 2 },
  { value: "social_services", labelEn: "Social Services", labelAr: "الخدمات الاجتماعية", score: 2 },
  { value: "other", labelEn: "Other", labelAr: "أخرى", score: 2 },
];

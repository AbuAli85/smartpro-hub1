import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// en-OM resources
import enCommon from "../locales/en-OM/common.json";
import enNav from "../locales/en-OM/nav.json";
import enGovernment from "../locales/en-OM/government.json";
import enHr from "../locales/en-OM/hr.json";
import enBilling from "../locales/en-OM/billing.json";
import enContracts from "../locales/en-OM/contracts.json";
import enDashboard from "../locales/en-OM/dashboard.json";
import enOperations from "../locales/en-OM/operations.json";
import enCompliance from "../locales/en-OM/compliance.json";
import enClientPortal from "../locales/en-OM/clientPortal.json";
import enExecutive from "../locales/en-OM/executive.json";
import enRenewalWorkflows from "../locales/en-OM/renewalWorkflows.json";
import enSurvey from "../locales/en-OM/survey.json";
import enAlerts from "../locales/en-OM/alerts.json";
import enEngagements from "../locales/en-OM/engagements.json";
import enSanadIntel from "../locales/en-OM/sanadIntel.json";

// ar-OM resources
import arCommon from "../locales/ar-OM/common.json";
import arNav from "../locales/ar-OM/nav.json";
import arGovernment from "../locales/ar-OM/government.json";
import arHr from "../locales/ar-OM/hr.json";
import arBilling from "../locales/ar-OM/billing.json";
import arContracts from "../locales/ar-OM/contracts.json";
import arDashboard from "../locales/ar-OM/dashboard.json";
import arOperations from "../locales/ar-OM/operations.json";
import arCompliance from "../locales/ar-OM/compliance.json";
import arClientPortal from "../locales/ar-OM/clientPortal.json";
import arExecutive from "../locales/ar-OM/executive.json";
import arRenewalWorkflows from "../locales/ar-OM/renewalWorkflows.json";
import arSurvey from "../locales/ar-OM/survey.json";
import arAlerts from "../locales/ar-OM/alerts.json";
import arEngagements from "../locales/ar-OM/engagements.json";
import arSanadIntel from "../locales/ar-OM/sanadIntel.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en-OM", label: "English", nativeLabel: "English", dir: "ltr" as const },
  { code: "ar-OM", label: "Arabic", nativeLabel: "العربية", dir: "rtl" as const },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en-OM";

export const NAMESPACES = [
  "common",
  "nav",
  "government",
  "hr",
  "billing",
  "contracts",
  "dashboard",
  "operations",
  "compliance",
  "clientPortal",
  "executive",
  "renewalWorkflows",
  "survey",
  "alerts",
  "engagements",
  "sanadIntel",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

const resources = {
  "en-OM": {
    common: enCommon,
    nav: enNav,
    government: enGovernment,
    hr: enHr,
    billing: enBilling,
    contracts: enContracts,
    dashboard: enDashboard,
    operations: enOperations,
    compliance: enCompliance,
    clientPortal: enClientPortal,
    executive: enExecutive,
    renewalWorkflows: enRenewalWorkflows,
    survey: enSurvey,
    alerts: enAlerts,
    engagements: enEngagements,
    sanadIntel: enSanadIntel,
  },
  "ar-OM": {
    common: arCommon,
    nav: arNav,
    government: arGovernment,
    hr: arHr,
    billing: arBilling,
    contracts: arContracts,
    dashboard: arDashboard,
    operations: arOperations,
    compliance: arCompliance,
    clientPortal: arClientPortal,
    executive: arExecutive,
    renewalWorkflows: arRenewalWorkflows,
    survey: arSurvey,
    alerts: arAlerts,
    engagements: arEngagements,
    sanadIntel: arSanadIntel,
  },
};

/** Apply dir and lang attributes to the <html> element */
export function applyLanguageToDocument(lang: SupportedLanguage) {
  const langConfig = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
  if (!langConfig) return;
  document.documentElement.lang = lang;
  document.documentElement.dir = langConfig.dir;
  // Store preference
  localStorage.setItem("smartpro-language", lang);
}

/** Get the stored language preference, falling back to default */
export function getStoredLanguage(): SupportedLanguage {
  const stored = localStorage.getItem("smartpro-language");
  if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
    return stored as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

/** Returns true if the current language is RTL */
export function isRTL(lang?: string): boolean {
  const target = lang ?? i18n.language;
  return SUPPORTED_LANGUAGES.find((l) => l.code === target)?.dir === "rtl";
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: getStoredLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "common",
    ns: NAMESPACES,
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Don't auto-detect from browser — we manage language explicitly
      order: [],
    },
    ...(import.meta.env.DEV && {
      // In development, surface missing keys as visible warnings so they can
      // be caught during review rather than silently falling back to English
      // in an Arabic context.
      missingKeyHandler: (lngs: readonly string[], ns: string, key: string, fallbackValue: string) => {
        console.warn(
          `[i18n] Missing translation key — lng: ${lngs.join(", ")} | ns: ${ns} | key: ${key} | fallback: "${fallbackValue}"`,
        );
      },
      saveMissing: true,
    }),
  });

// Apply language to document on init
applyLanguageToDocument(i18n.language as SupportedLanguage);

// Apply on language change
i18n.on("languageChanged", (lang) => {
  applyLanguageToDocument(lang as SupportedLanguage);
});

export default i18n;

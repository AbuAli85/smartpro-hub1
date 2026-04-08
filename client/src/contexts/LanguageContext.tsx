import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  isRTL,
  type SupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "@/lib/i18n";

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  isRtl: boolean;
  dir: "ltr" | "rtl";
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  isRtl: false,
  dir: "ltr",
  supportedLanguages: SUPPORTED_LANGUAGES,
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(
    (i18n.language as SupportedLanguage) ?? DEFAULT_LANGUAGE
  );

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
      setLanguageState(lang);
    },
    [i18n]
  );

  const toggleLanguage = useCallback(() => {
    const next = language === "en-OM" ? "ar-OM" : "en-OM";
    setLanguage(next as SupportedLanguage);
  }, [language, setLanguage]);

  // Keep state in sync if i18n changes externally
  useEffect(() => {
    const handler = (lang: string) => setLanguageState(lang as SupportedLanguage);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const rtl = isRTL(language);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        isRtl: rtl,
        dir: rtl ? "rtl" : "ltr",
        supportedLanguages: SUPPORTED_LANGUAGES,
        toggleLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

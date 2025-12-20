/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import i18n, { STORAGE_LANG, SUPPORTED_LANGUAGES, type SupportedLanguage } from "./i18n";

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (lng: SupportedLanguage) => void;
  supportedLanguages: readonly SupportedLanguage[];
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function normalizeLanguage(raw: string | undefined | null): SupportedLanguage {
  if (!raw) return "en";
  const base = raw.toLowerCase().split("-")[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base) ? (base as SupportedLanguage) : "en";
}

function getInitialLanguage(): SupportedLanguage {
  const saved = localStorage.getItem(STORAGE_LANG);
  const savedNorm = normalizeLanguage(saved);
  if (saved && savedNorm !== "en") return savedNorm;
  if (saved === "en") return "en";

  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => getInitialLanguage());

  // Do not auto-write defaults into localStorage.
  // We only persist when the user explicitly changes language.
  const shouldPersistRef = useRef(localStorage.getItem(STORAGE_LANG) !== null);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    // Keep i18next in sync with our state.
    void i18n.changeLanguage(language);
  }, [language]);

  useEffect(() => {
    // Keep our state in sync if i18next changes elsewhere.
    const onChanged = (lng: string) => {
      const next = normalizeLanguage(lng);
      setLanguageState((prev) => (prev === next ? prev : next));
    };
    i18n.on("languageChanged", onChanged);
    return () => {
      i18n.off("languageChanged", onChanged);
    };
  }, []);

  useEffect(() => {
    if (!shouldPersistRef.current) return;
    localStorage.setItem(STORAGE_LANG, language);
  }, [language]);

  const setLanguage = useCallback((lng: SupportedLanguage) => {
    shouldPersistRef.current = true;
    setLanguageState(lng);
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, supportedLanguages: SUPPORTED_LANGUAGES }),
    [language, setLanguage]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}



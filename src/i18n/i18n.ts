import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";

export const STORAGE_LANG = "duckwebmail:lang";
export const SUPPORTED_LANGUAGES = ["en", "es", "uk", "ru"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es },
        uk: { translation: uk },
        ru: { translation: ru }
      },
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      load: "languageOnly",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: STORAGE_LANG,
        // IMPORTANT: don't auto-persist defaults; we only persist on explicit user choice.
        caches: []
      },
      react: {
        useSuspense: false
      }
    });
}

export default i18n;



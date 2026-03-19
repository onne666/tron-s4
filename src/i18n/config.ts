import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import { resources, type SupportedLanguageCode } from "./resources";

const supportedLanguages: SupportedLanguageCode[] = ["zh-CN", "zh-TW", "en", "hi", "ja", "ko", "th", "id"];

export const normalizeLanguage = (language?: string): SupportedLanguageCode => {
  if (!language) return "en";

  const normalized = language.toLowerCase();

  if (normalized.startsWith("zh-cn") || normalized === "zh") return "zh-CN";
  if (normalized.startsWith("zh-tw") || normalized.startsWith("zh-hk")) return "zh-TW";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("th")) return "th";
  if (normalized.startsWith("id")) return "id";

  return "en";
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: supportedLanguages,
    load: "currentOnly",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
      lookupLocalStorage: "tron-secure-language",
      convertDetectedLanguage: (lng: string) => normalizeLanguage(lng),
    },
  });

const applyDocumentLanguage = (language?: string) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = normalizeLanguage(language);
};

applyDocumentLanguage(i18n.resolvedLanguage);
i18n.on("languageChanged", applyDocumentLanguage);

export default i18n;

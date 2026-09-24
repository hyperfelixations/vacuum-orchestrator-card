import { DEFAULT_LANGUAGE } from "./locales.js";
import { TRANSLATIONS } from "./registry.js";

export function isSupportedLanguage(code) {
  return Object.hasOwn(TRANSLATIONS, code);
}

export function resolveLanguage(configLanguage, haContext) {
  if (configLanguage && configLanguage !== "auto" && isSupportedLanguage(configLanguage)) return configLanguage;
  const raw = haContext?.locale?.language || haContext?.language || DEFAULT_LANGUAGE;
  const base = String(raw).toLowerCase().split("-")[0];
  return isSupportedLanguage(base) ? base : DEFAULT_LANGUAGE;
}

export function resolveMessageLanguage(configLanguage, documentLanguage) {
  const explicit = typeof configLanguage === "string" ? configLanguage.trim().toLowerCase() : "";
  if (explicit !== "auto" && isSupportedLanguage(explicit)) return explicit;
  const page = typeof documentLanguage === "string" ? documentLanguage.toLowerCase().split("-")[0] : "";
  return isSupportedLanguage(page) ? page : DEFAULT_LANGUAGE;
}

export function translate(language, key, vars = {}) {
  const entry = TRANSLATIONS[language]?.[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE]?.[key] ?? key;
  return typeof entry === "function" ? entry(vars) : entry;
}

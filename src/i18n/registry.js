import { DEFAULT_LANGUAGE } from "./locales.js";
import { verifyTranslationKeyParity } from "./integrity.js";
import { en } from "./languages/en.js";
import { de } from "./languages/de.js";

export const TRANSLATIONS = Object.freeze({ en, de });
verifyTranslationKeyParity(TRANSLATIONS, DEFAULT_LANGUAGE);

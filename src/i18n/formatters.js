// Locale-aware formatting plus the plural helper the language files use. One Intl instance is
// cached per locale and option set: a queue render formats dozens of values.

import { durationParts, relativeParts } from "../core/time.js";
import { NUMBER_LOCALE_BY_LANGUAGE } from "./locales.js";

const NUMBER_FORMATTERS = new Map();
const DATE_FORMATTERS = new Map();
const RELATIVE_FORMATTERS = new Map();
const PLURAL_RULES = new Map();

function localeFor(language) {
  return NUMBER_LOCALE_BY_LANGUAGE[language] || NUMBER_LOCALE_BY_LANGUAGE.en;
}

export function getPluralCategory(language, count) {
  const locale = localeFor(language);
  let rules = PLURAL_RULES.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    PLURAL_RULES.set(locale, rules);
  }
  return rules.select(Number(count));
}

export function selectPlural(language, count, forms) {
  return forms[getPluralCategory(language, count)] ?? forms.other ?? forms.one;
}

export function formatNumber(language, value, digits = 0, options = {}) {
  const config = typeof digits === "object" ? { ...digits } : { ...options, minimumFractionDigits: digits, maximumFractionDigits: digits };
  const locale = localeFor(language);
  const key = JSON.stringify([locale, config]);
  let formatter = NUMBER_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, config);
    NUMBER_FORMATTERS.set(key, formatter);
  }
  return formatter.format(Number(value));
}

export function formatDateTime(language, value, options = {}) {
  const date = value instanceof Date ? value : new Date(typeof value === "number" ? value : Date.parse(value));
  if (Number.isNaN(date.getTime())) return "";
  const locale = localeFor(language);
  const config = { dateStyle: "medium", timeStyle: "short", ...options };
  const key = JSON.stringify([locale, config]);
  let formatter = DATE_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, config);
    DATE_FORMATTERS.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatRelative(language, nowMs, thenMs) {
  const parts = relativeParts(nowMs, thenMs);
  const locale = localeFor(language);
  let formatter = RELATIVE_FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    RELATIVE_FORMATTERS.set(locale, formatter);
  }
  return formatter.format(parts.value, parts.unit);
}

// The wording lives in the language files, so the translator is passed in: importing the
// registry here would close the cycle languages -> formatters -> registry -> languages.
export function formatDuration(language, durationMs, t) {
  const parts = durationParts(durationMs);
  if (!parts) return "";
  const hours = formatNumber(language, parts.hours, 0);
  const minutes = formatNumber(language, parts.minutes, 0);
  if (parts.hours && parts.minutes) return t("time.durationHoursMinutes", { hours, minutes });
  if (parts.hours) return t("time.durationHours", { hours });
  return t("time.durationMinutes", { minutes });
}

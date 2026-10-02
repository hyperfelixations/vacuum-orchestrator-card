// The text port presentation reads: translation and the Intl formatters, bound to one language.

import { formatDateTime, formatDuration, formatNumber, formatRelative } from "./formatters.js";
import { translate } from "./translate.js";

export function textService(language) {
  const t = (key, vars) => translate(language, key, vars);
  return Object.freeze({
    language,
    t,
    formatNumber: (value, digits = 0, options) => formatNumber(language, value, digits, options),
    formatDateTime: (value, options) => formatDateTime(language, value, options),
    formatRelative: (nowMs, thenMs) => formatRelative(language, nowMs, thenMs),
    formatDuration: (value) => formatDuration(language, value, t),
  });
}

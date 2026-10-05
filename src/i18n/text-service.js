// The text port presentation reads: translation and the Intl formatters, bound to one language,
// plus the integration's own texts for its error codes in that language (`backend`, by code).

import { formatDateTime, formatDuration, formatNumber, formatRelative } from "./formatters.js";
import { translate } from "./translate.js";

const PLACEHOLDER = /\{([a-z_]+)\}/g;

// Home Assistant's translation placeholders: `{name}`; an absent value is left empty.
function interpolate(text, vars = {}) {
  return text.replace(PLACEHOLDER, (_match, name) => (vars[name] === null || vars[name] === undefined ? "" : String(vars[name])));
}

export function textService(language, { backend = null } = {}) {
  const t = (key, vars) => translate(language, key, vars);
  return Object.freeze({
    language,
    t,
    backend: (code, vars) => (backend && typeof backend[code] === "string" ? interpolate(backend[code], vars) : null),
    formatNumber: (value, digits = 0, options) => formatNumber(language, value, digits, options),
    formatDateTime: (value, options) => formatDateTime(language, value, options),
    formatRelative: (nowMs, thenMs) => formatRelative(language, nowMs, thenMs),
    formatDuration: (value) => formatDuration(language, value, t),
  });
}

export const SEVERITY = Object.freeze({ WARNING: "warning", HINT: "hint" });

export const DIAGNOSTIC_SEVERITY = Object.freeze({
  "value.invalid": SEVERITY.WARNING,
  "config.foreign_key": SEVERITY.WARNING,
  "backend.query_failed": SEVERITY.WARNING,
  "hint.reconnecting": SEVERITY.HINT,
  "hint.offline": SEVERITY.HINT,
  "hint.partial_jobs": SEVERITY.HINT,
});

export const FALLBACK = Object.freeze({
  AUTOMATIC: Object.freeze({ phrase: "automatic" }),
  DEFAULTS: Object.freeze({ phrase: "defaults" }),
  IGNORED: Object.freeze({ phrase: "ignored" }),
  FIRST_VIEW: Object.freeze({ phrase: "firstView" }),
});

export function fallbackValue(value) {
  return Object.freeze({ value });
}

export function fallbackOption(key, value) {
  return Object.freeze({ key, value });
}

export function createDiagnostic(code, { path = null, entity = null, value, fallback = null, params = null } = {}) {
  const severity = DIAGNOSTIC_SEVERITY[code];
  if (!severity) throw new Error(`diagnostics: unknown code "${code}"`);
  return Object.freeze({
    code,
    severity,
    path,
    entity,
    value,
    fallback,
    params: params ? Object.freeze({ ...params }) : null,
  });
}

export function diagnosticKey(diagnostic) {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.path,
    diagnostic.entity,
    formatConfigValue(diagnostic.value),
    diagnostic.fallback,
    diagnostic.params,
  ]);
}

export function formatConfigValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.replace(/\s+/g, " ").trim();
    if (!text) return null;
    const characters = Array.from(text);
    return `"${characters.length > 32 ? `${characters.slice(0, 31).join("")}…` : text}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? "[…]" : "[]";
  if (typeof value === "object") return Object.keys(value).length ? "{…}" : "{}";
  return String(value);
}

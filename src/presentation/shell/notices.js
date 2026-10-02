// The only place a diagnostic becomes text (RCC diagnostics contract): one warning as a
// sentence in the warning block, several as a count; one hint appended to the subtitle,
// several as a count. Messages are language-neutral `{ key, vars }` until rendered.

import { SEVERITY, formatConfigValue } from "../../core/diagnostics.js";

const message = (key, vars = null) => (vars ? { key, vars } : { key });

function written(value) {
  const shown = formatConfigValue(value);
  return shown === null ? message("value.empty") : shown;
}

function fallbackMessage(fallback) {
  if (!fallback) return message("fallback.defaults");
  if (Object.hasOwn(fallback, "value")) return message("fallback.value", { value: String(fallback.value) });
  if (Object.hasOwn(fallback, "key")) return message("fallback.option", { key: fallback.key, value: String(fallback.value) });
  return message(`fallback.${fallback.phrase}`);
}

const DIAGNOSTIC_MESSAGES = Object.freeze({
  "value.invalid": (entry) => message("warning.invalidValue", { value: written(entry.value), key: entry.path, instead: fallbackMessage(entry.fallback) }),
  "config.foreign_key": (entry) => message("warning.foreignKey", { key: entry.path }),
  "backend.query_failed": (entry) => message("warning.queryFailed", { scope: message(`scope.${entry.params?.scope || "unknown"}`), code: entry.params?.code || "unknown" }),
  "hint.reconnecting": () => message("hint.reconnecting"),
  "hint.offline": () => message("hint.offline"),
  "hint.partial_jobs": () => message("hint.partialJobs"),
});

export const DIAGNOSTIC_CODES_WITH_MESSAGES = Object.freeze(Object.keys(DIAGNOSTIC_MESSAGES));

export function messageForDiagnostic(entry) {
  const builder = DIAGNOSTIC_MESSAGES[entry.code];
  if (!builder) throw new Error(`notices: no message for "${entry.code}"`);
  return builder(entry);
}

export function messageForConfigError(error) {
  if (error.code === "config.not_object") return message("error.notObject");
  if (error.code === "config.unknown_key") {
    const { key, suggestion } = error.params || {};
    return suggestion ? message("error.unknownKeySuggestion", { key, suggestion }) : message("error.unknownKey", { key });
  }
  throw new Error(`notices: no message for "${error.code}"`);
}

export function renderMessage(entry, translate) {
  if (typeof entry === "string") return entry;
  if (!entry?.vars) return translate(entry?.key || "");
  const vars = Object.fromEntries(Object.entries(entry.vars).map(([key, value]) => [key, value && typeof value === "object" && value.key ? renderMessage(value, translate) : value]));
  return translate(entry.key, vars);
}

// Configuration diagnostics first, then the backend's, each in their own order.
export function buildNotices({ configDiagnostics = [], diagnostics = [] } = {}) {
  const all = [...configDiagnostics, ...diagnostics];
  const worded = (severity) => all.filter((entry) => entry.severity === severity).map(messageForDiagnostic);
  return { warnings: worded(SEVERITY.WARNING), hints: worded(SEVERITY.HINT) };
}

export function warningText(warnings, texts) {
  if (!warnings?.length) return null;
  return warnings.length === 1 ? renderMessage(warnings[0], texts.t) : texts.t("warning.several", { count: warnings.length });
}

export function hintText(hints, texts) {
  if (!hints?.length) return null;
  return hints.length === 1 ? renderMessage(hints[0], texts.t) : texts.t("hint.several", { count: hints.length });
}

export function buildWarningBlock({ config = {}, notices = {}, texts } = {}) {
  const text = warningText(notices.warnings || [], texts);
  return { visible: Boolean(text) && config.show?.warnings !== false, text: text || "", label: texts.t("warning.label") };
}

function appendHint(line, hint) {
  if (/[.!?…]$/.test(line)) return `${line} ${hint}`;
  if (/[。！？]$/.test(line)) return `${line}${hint}`;
  return `${line} · ${hint}`;
}

// A hint joins the line the card shows anyway and makes it wrap while it lasts; a hidden or
// empty subtitle stays hidden.
export function withHint(header, hint) {
  if (!hint || !header.hasSubtitle) return header;
  return { ...header, subtitle: appendHint(header.subtitle, hint), subtitleOverflow: "wrap" };
}

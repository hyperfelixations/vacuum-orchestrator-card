import { SEVERITY, formatConfigValue } from "../../core/diagnostics.js";

const message = (key, vars = null) => vars ? { key, vars } : { key };

function written(value, texts) {
  const shown = formatConfigValue(value);
  return shown === null ? texts.t("value.empty") : shown;
}

const DIAGNOSTIC_MESSAGES = {
  "value.invalid": (entry, texts) => message("warning.invalidValue", { value: written(entry.value, texts), key: entry.path, instead: fallbackText(entry.fallback, texts) }),
  "config.foreign_key": (entry) => message("warning.foreignKey", { key: entry.path }),
  "config.deprecated": (entry) => message("warning.deprecated", entry.params),
  "backend.missing": () => message("warning.backendMissing"),
  "backend.not_loaded": () => message("unavailable.backendNotLoaded"),
  "backend.api_incompatible": () => message("unavailable.apiIncompatible"),
  "backend.query_failed": (entry) => message("warning.commandFailed", { code: entry.params?.code || "query_failed" }),
  "backend.capability_missing": (entry) => message("unavailable.capabilityMissing", { capability: entry.params?.capability || entry.path || "backend capability" }),
  "backend.unauthorized": () => message("unavailable.readOnly"),
  "command.failed": (entry) => message("warning.commandFailed", { code: entry.params?.code || "unknown" }),
  "hint.reconnecting": () => message("hint.reconnecting"),
  "hint.stale_snapshot": () => message("hint.staleSnapshot"),
  "hint.command_pending": () => message("hint.commandPending"),
  "hint.partial_page": () => message("hint.partialPage"),
};

function fallbackText(fallback, texts) {
  if (!fallback) return texts.t("fallback.defaults");
  if (Object.hasOwn(fallback, "value")) return texts.t("fallback.value", { value: String(fallback.value) });
  if (Object.hasOwn(fallback, "key")) return texts.t("fallback.option", { key: fallback.key, value: String(fallback.value) });
  return texts.t(`fallback.${fallback.phrase}`);
}

export function messageForDiagnostic(entry, texts = { t: (key) => key }) {
  const builder = DIAGNOSTIC_MESSAGES[entry.code];
  if (!builder) throw new Error(`notices: no message for "${entry.code}"`);
  return builder(entry, texts);
}

export function messageForConfigError(error) {
  const map = {
    "config.not_object": () => message("error.notObject"),
    "config.unknown_key": ({ key, suggestion }) => suggestion ? message("error.unknownKeySuggestion", { key, suggestion }) : message("error.unknownKey", { key }),
    "config.must_be_list": ({ key }) => message("error.mustBeList", { key }),
    "config.must_be_object": ({ key }) => message("error.mustBeObject", { key }),
    "config.duplicate_section": ({ key }) => message("error.duplicateSection", { key }),
  };
  const builder = map[error.code];
  if (!builder) throw new Error(`notices: no message for "${error.code}"`);
  return builder(error.params || {});
}

export function renderMessage(entry, t) {
  if (!entry?.vars) return t(entry?.key || "");
  const vars = Object.fromEntries(Object.entries(entry.vars).map(([key, value]) => [key, value && typeof value === "object" && value.key ? renderMessage(value, t) : value]));
  return t(entry.key, vars);
}

export function buildNotices({ configDiagnostics = [], diagnostics = [], texts = { t: (key) => key } } = {}) {
  const all = [...configDiagnostics, ...diagnostics];
  const worded = (severity) => all.filter((entry) => entry.severity === severity).map((entry) => messageForDiagnostic(entry, texts));
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

export function buildWarningBlock({ config = {}, notices = {}, texts = { t: (key) => key } } = {}) {
  const text = warningText(notices.warnings || [], texts);
  return { visible: Boolean(text) && config.show?.warnings !== false, text: text || "", label: texts.t("warning.label") };
}

function appendHint(line, hint) {
  if (/[.!?]$/.test(line)) return `${line} ${hint}`;
  if (/[。！？]$/.test(line)) return `${line}${hint}`;
  return `${line} · ${hint}`;
}

export function composeSubtitle({ config = {}, automatic = "", hint = null } = {}) {
  const own = config.subtitle?.text;
  const line = own === null || own === undefined ? automatic : own;
  const hasSubtitle = line !== "" && config.show?.subtitle !== false;
  if (!hasSubtitle || !hint) return { subtitle: line, hasSubtitle, subtitleOverflow: config.subtitle?.overflow || "clip" };
  return { subtitle: appendHint(line, hint), hasSubtitle: true, subtitleOverflow: "wrap" };
}

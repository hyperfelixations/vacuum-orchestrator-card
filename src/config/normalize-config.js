// Deterministic configuration normalization. Writes nothing and changes no input; a refusal
// throws a ConfigError, every other invalid value becomes a warning with its fallback.
// See internal dev doc §4 "Konfigurationsvertrag".

import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { DEFAULT_CONFIG, PAGE_SIZE_RANGE } from "./defaults.js";
import { ConfigError } from "./errors.js";
import { normalizeShowConfig, resolveShowConfig } from "./show.js";
import { checkTopLevelKeys } from "./top-level-keys.js";
import { normalizeStartView, normalizeViewsConfig } from "./views.js";
import { assertKnownKeys, isPlainObject, isUnwritten, readBoolean, readEnum, readLabel, readNumber, readText } from "./primitives.js";

const ACCENT_LINES = ["top", "bottom"];
const TIME_FORMATS = ["auto", "relative", "absolute"];
const HEADER_OVERFLOWS = ["clip", "wrap"];

export function normalizeLanguage(value, isSupportedLanguage, diagnostics) {
  if (isUnwritten(value)) return DEFAULT_CONFIG.language;
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (code === "auto" || isSupportedLanguage(code)) return code;
  diagnostics.push(createDiagnostic("value.invalid", { path: "language", value, fallback: fallbackValue("auto") }));
  return "auto";
}

// A header line is a scalar or a block. Exactly `clip`/`wrap` as a scalar is the overflow mode,
// any other string the text; `""` is "no line", null is "the card writes it".
export function normalizeHeaderLine(value, defaultOverflow, path, diagnostics) {
  if (isUnwritten(value)) return { text: null, overflow: defaultOverflow };
  if (typeof value === "string") {
    const word = value.trim().toLowerCase();
    if (HEADER_OVERFLOWS.includes(word)) return { text: null, overflow: word };
    return { text: readLabel(value, path, diagnostics), overflow: defaultOverflow };
  }
  if (!isPlainObject(value)) {
    diagnostics.push(createDiagnostic("value.invalid", { path, value, fallback: FALLBACK.AUTOMATIC }));
    return { text: null, overflow: defaultOverflow };
  }
  assertKnownKeys(value, ["text", "overflow"], path);
  const text = readLabel(value.text, `${path}.text`, diagnostics);
  if (isUnwritten(value.overflow)) return { text, overflow: defaultOverflow };
  const overflow = typeof value.overflow === "string" ? value.overflow.trim().toLowerCase() : null;
  if (HEADER_OVERFLOWS.includes(overflow)) return { text, overflow };
  diagnostics.push(createDiagnostic("value.invalid", { path: `${path}.overflow`, value: value.overflow, fallback: fallbackValue(defaultOverflow) }));
  return { text, overflow: defaultOverflow };
}

// Diagnostics in the order their top-level keys are written.
function inWrittenOrder(diagnostics, config) {
  const positions = new Map(Object.keys(config).map((key, index) => [key, index]));
  const rank = (entry) => positions.get(String(entry.path || "").match(/^[^.[]+/)?.[0]) ?? positions.size;
  return [...diagnostics].sort((one, other) => rank(one) - rank(other));
}

// `collaborators`: { isSupportedLanguage, viewTypes, optionSchemaForView } — injected because
// the i18n registry and the view registry live on other layers.
export function normalizeConfig(config, collaborators = {}) {
  const userConfig = config ?? {};
  if (!isPlainObject(userConfig)) throw new ConfigError("config.not_object");
  const diagnostics = [];
  checkTopLevelKeys(userConfig, diagnostics);
  const isSupportedLanguage = collaborators.isSupportedLanguage || ((code) => code === "en" || code === "de");
  const viewTypes = collaborators.viewTypes || [];
  const optionSchemaForView = collaborators.optionSchemaForView || (() => ({}));

  const normalized = {
    views: normalizeViewsConfig(userConfig.views, { viewTypes, optionSchemaForView }, diagnostics),
    start_view: normalizeStartView(userConfig.start_view, viewTypes, diagnostics),
    show: resolveShowConfig(normalizeShowConfig(userConfig.show, diagnostics)),
    title: normalizeHeaderLine(userConfig.title, DEFAULT_CONFIG.title.overflow, "title", diagnostics),
    subtitle: normalizeHeaderLine(userConfig.subtitle, DEFAULT_CONFIG.subtitle.overflow, "subtitle", diagnostics),
    icon: readText(userConfig.icon, "icon", diagnostics),
    accent_line: readEnum(userConfig.accent_line, "accent_line", diagnostics, ACCENT_LINES, DEFAULT_CONFIG.accent_line),
    language: normalizeLanguage(userConfig.language, isSupportedLanguage, diagnostics),
    page_size: readNumber(userConfig.page_size, "page_size", diagnostics, { ...PAGE_SIZE_RANGE, integer: true, fallback: DEFAULT_CONFIG.page_size }),
    time_format: readEnum(userConfig.time_format, "time_format", diagnostics, TIME_FORMATS, DEFAULT_CONFIG.time_format),
    confirm_destructive: readBoolean(userConfig.confirm_destructive, "confirm_destructive", diagnostics, DEFAULT_CONFIG.confirm_destructive),
  };
  return { ...normalized, _configDiagnostics: inWrittenOrder(diagnostics, userConfig) };
}

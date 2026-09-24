import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { normalizeAction } from "./actions.js";
import { ConfigError } from "./errors.js";
import { normalizeSectionsConfig, normalizeStartSection } from "./sections.js";
import { normalizeShowConfig, resolveShowConfig } from "./show.js";
import { checkTopLevelKeys } from "./top-level-keys.js";
import { assertKnownKeys, isPlainObject, isUnwritten, readBoolean, readEnum, readLabel, readNumber, readText } from "./primitives.js";

const ACCENT_LINES = ["top", "bottom"];
const TIME_FORMATS = ["auto", "relative", "absolute"];
const DENSITIES = ["auto", "comfortable", "compact"];
const HEADER_OVERFLOWS = ["clip", "wrap"];

export function normalizeLanguage(value, isSupportedLanguage, diagnostics) {
  if (isUnwritten(value)) return DEFAULT_CONFIG.language;
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (code === "auto" || isSupportedLanguage(code)) return code;
  diagnostics.push(createDiagnostic("value.invalid", { path: "language", value, fallback: fallbackValue("auto") }));
  return "auto";
}

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
  const overflow = isUnwritten(value.overflow) ? defaultOverflow : typeof value.overflow === "string" ? value.overflow.trim().toLowerCase() : null;
  if (HEADER_OVERFLOWS.includes(overflow)) return { text, overflow };
  if (!isUnwritten(value.overflow)) diagnostics.push(createDiagnostic("value.invalid", { path: `${path}.overflow`, value: value.overflow, fallback: fallbackValue(defaultOverflow) }));
  return { text, overflow: defaultOverflow };
}

function inWrittenOrder(diagnostics, config) {
  const positions = new Map(Object.keys(config).map((key, index) => [key, index]));
  const rank = (entry) => positions.get(String(entry.path || "").match(/^[^.[]+/)?.[0]) ?? positions.size;
  return [...diagnostics].sort((one, two) => rank(one) - rank(two));
}

export function normalizeConfig(config, collaborators = {}) {
  const userConfig = config ?? {};
  if (!isPlainObject(userConfig)) throw new ConfigError("config.not_object");
  const diagnostics = [];
  checkTopLevelKeys(userConfig, diagnostics);

  const isSupportedLanguage = collaborators.isSupportedLanguage || ((code) => code === "en" || code === "de");
  const sectionTypes = collaborators.sectionTypes || [];
  const optionSchemaForSection = collaborators.optionSchemaForSection || (() => ({}));

  const normalized = {
    title: normalizeHeaderLine(userConfig.title, DEFAULT_CONFIG.title.overflow, "title", diagnostics),
    subtitle: normalizeHeaderLine(userConfig.subtitle, DEFAULT_CONFIG.subtitle.overflow, "subtitle", diagnostics),
    icon: readText(userConfig.icon, "icon", diagnostics),
    accent_line: readEnum(userConfig.accent_line, "accent_line", diagnostics, ACCENT_LINES, DEFAULT_CONFIG.accent_line),
    language: normalizeLanguage(userConfig.language, isSupportedLanguage, diagnostics),
    show: resolveShowConfig(normalizeShowConfig(userConfig.show, diagnostics)),
    sections: normalizeSectionsConfig(userConfig.sections, { sectionTypes, optionSchemaForSection }, diagnostics),
    start_section: normalizeStartSection(userConfig.start_section, sectionTypes, diagnostics),
    page_size: readNumber(userConfig.page_size, "page_size", diagnostics, { min: 5, max: 100, integer: true, fallback: DEFAULT_CONFIG.page_size }),
    time_format: readEnum(userConfig.time_format, "time_format", diagnostics, TIME_FORMATS, DEFAULT_CONFIG.time_format),
    density: readEnum(userConfig.density, "density", diagnostics, DENSITIES, DEFAULT_CONFIG.density),
    confirm_destructive: readBoolean(userConfig.confirm_destructive, "confirm_destructive", diagnostics, DEFAULT_CONFIG.confirm_destructive),
    tap_action: normalizeAction(userConfig.tap_action, "tap_action", diagnostics, DEFAULT_CONFIG.tap_action),
    hold_action: normalizeAction(userConfig.hold_action, "hold_action", diagnostics, DEFAULT_CONFIG.hold_action),
  };

  return { ...normalized, _configDiagnostics: inWrittenOrder(diagnostics, userConfig) };
}

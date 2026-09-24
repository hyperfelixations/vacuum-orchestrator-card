import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { assertKnownKeys, isPlainObject, isUnwritten, readBoolean } from "./primitives.js";

export const SHOW_SWITCHES = Object.freeze({
  accent_line: true,
  icon: true,
  title: true,
  subtitle: true,
  pill: true,
  warnings: true,
  stats: true,
  tabs: "auto",
  queue_controls: true,
  unavailable_sections: true,
});

export const SHOW_KEYS = Object.freeze(Object.keys(SHOW_SWITCHES));

export function resolveShowConfig(requested = {}) {
  return { ...SHOW_SWITCHES, ...requested };
}

function readTabs(value, path, diagnostics) {
  if (isUnwritten(value)) return SHOW_SWITCHES.tabs;
  if (value === true || value === false || value === "auto") return value;
  diagnostics.push(createDiagnostic("value.invalid", { path, value, fallback: fallbackValue("auto") }));
  return "auto";
}

export function normalizeShowConfig(value, diagnostics) {
  if (isUnwritten(value)) return {};
  if (!isPlainObject(value)) {
    diagnostics.push(createDiagnostic("value.invalid", { path: "show", value, fallback: FALLBACK.DEFAULTS }));
    return {};
  }
  assertKnownKeys(value, SHOW_KEYS, "show");
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isUnwritten(raw)) continue;
    result[key] = key === "tabs" ? readTabs(raw, "show.tabs", diagnostics) : readBoolean(raw, `show.${key}`, diagnostics, SHOW_SWITCHES[key]);
  }
  return result;
}

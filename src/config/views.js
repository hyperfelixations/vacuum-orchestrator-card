// Normalizing the `views:` list and `start_view` (RCC views contract). A key an entry or its
// options do not have refuses the configuration; any other malformed entry degrades to
// "ignored" or "auto" with a diagnostic. View types and option schemas are injected, because
// the registry that owns them also owns renderers and config/ may not import it.

import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { assertKnownKeys, isPlainObject, isUnwritten } from "./primitives.js";

export const VIEW_ENTRY_KEYS = Object.freeze(["type", "enabled", "options"]);

function invalid(diagnostics, path, value, fallback) {
  diagnostics.push(createDiagnostic("value.invalid", { path, value, fallback }));
}

// Not written → null, the "one auto entry per registered view" sentinel. A written list is
// authoritative: its order is the tab order and a repeated type is reported and dropped.
export function normalizeViewsConfig(value, { viewTypes = [], optionSchemaForView = () => ({}) } = {}, diagnostics) {
  if (isUnwritten(value)) return null;
  if (!Array.isArray(value)) {
    invalid(diagnostics, "views", value, FALLBACK.AUTOMATIC);
    return null;
  }
  const views = [];
  const seen = new Set();
  value.forEach((entry, index) => {
    const path = `views[${index}]`;
    const named = readViewType(entry, path, viewTypes, diagnostics);
    if (!named) return;
    if (seen.has(named.type)) {
      invalid(diagnostics, named.path, named.type, FALLBACK.IGNORED);
      return;
    }
    seen.add(named.type);
    views.push(normalizeViewRequest(entry, named.type, path, optionSchemaForView(named.type) || {}, diagnostics));
  });
  return views;
}

function readViewType(entry, path, viewTypes, diagnostics) {
  if (typeof entry === "string") {
    const type = entry.trim();
    if (viewTypes.includes(type)) return { type, path };
    invalid(diagnostics, path, entry, FALLBACK.IGNORED);
    return null;
  }
  if (!isPlainObject(entry)) {
    invalid(diagnostics, path, entry, FALLBACK.IGNORED);
    return null;
  }
  assertKnownKeys(entry, VIEW_ENTRY_KEYS, path);
  const type = typeof entry.type === "string" ? entry.type.trim() : "";
  if (viewTypes.includes(type)) return { type, path: `${path}.type` };
  invalid(diagnostics, `${path}.type`, entry.type, FALLBACK.IGNORED);
  return null;
}

function normalizeViewRequest(entry, type, path, schema, diagnostics) {
  if (typeof entry === "string") return { type, enabled: true, options: {} };
  let enabled = true;
  if (entry.enabled === true || entry.enabled === false || entry.enabled === "auto") enabled = entry.enabled;
  else if (!isUnwritten(entry.enabled)) {
    enabled = "auto";
    invalid(diagnostics, `${path}.enabled`, entry.enabled, fallbackValue("auto"));
  }
  return { type, enabled, options: normalizeViewOptions(entry.options, `${path}.options`, schema, diagnostics) };
}

function normalizeViewOptions(raw, path, schema, diagnostics) {
  if (isUnwritten(raw)) return {};
  if (!isPlainObject(raw)) {
    invalid(diagnostics, path, raw, FALLBACK.DEFAULTS);
    return {};
  }
  assertKnownKeys(raw, Object.keys(schema), path);
  const options = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isUnwritten(value)) continue;
    const { validate, default: defaultValue } = schema[key];
    if (typeof validate === "function" && !validate(value)) {
      invalid(diagnostics, `${path}.${key}`, value, fallbackValue(defaultValue));
      continue;
    }
    options[key] = value;
  }
  return options;
}

// A wish, not an availability override: the active view falls back to the first available one.
export function normalizeStartView(value, viewTypes = [], diagnostics) {
  if (isUnwritten(value)) return null;
  const type = typeof value === "string" ? value.trim() : "";
  if (viewTypes.includes(type)) return type;
  diagnostics.push(createDiagnostic("value.invalid", { path: "start_view", value, fallback: FALLBACK.FIRST_VIEW }));
  return null;
}

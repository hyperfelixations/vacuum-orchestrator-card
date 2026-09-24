import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { assertKnownKeys, isPlainObject, isUnwritten } from "./primitives.js";
import { rejectConfiguration } from "./errors.js";

export const SECTION_ENTRY_KEYS = Object.freeze(["type", "enabled", "options"]);

function invalid(diagnostics, path, value, fallback = FALLBACK.IGNORED) {
  diagnostics.push(createDiagnostic("value.invalid", { path, value, fallback }));
}

function readSectionType(entry, path, sectionTypes, diagnostics) {
  const type = typeof entry === "string" ? entry.trim() : isPlainObject(entry) && typeof entry.type === "string" ? entry.type.trim() : "";
  if (sectionTypes.includes(type)) return type;
  invalid(diagnostics, typeof entry === "string" ? path : `${path}.type`, isPlainObject(entry) ? entry.type : entry);
  return null;
}

function normalizeOptions(raw, path, schema, diagnostics) {
  if (isUnwritten(raw)) return {};
  if (!isPlainObject(raw)) {
    invalid(diagnostics, path, raw, FALLBACK.DEFAULTS);
    return {};
  }
  assertKnownKeys(raw, Object.keys(schema), path);
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isUnwritten(value)) continue;
    const descriptor = schema[key];
    if (descriptor?.validate && !descriptor.validate(value)) {
      invalid(diagnostics, `${path}.${key}`, value, fallbackValue(descriptor.default));
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function normalizeSectionsConfig(value, { sectionTypes = [], optionSchemaForSection = () => ({}) } = {}, diagnostics) {
  if (isUnwritten(value)) return null;
  if (!Array.isArray(value)) {
    invalid(diagnostics, "sections", value, FALLBACK.AUTOMATIC);
    return null;
  }
  const result = [];
  const seen = new Set();
  for (const [index, entry] of value.entries()) {
    const path = `sections[${index}]`;
    const type = readSectionType(entry, path, sectionTypes, diagnostics);
    if (!type) continue;
    if (seen.has(type)) rejectConfiguration("config.duplicate_section", { key: path });
    seen.add(type);
    if (typeof entry === "string") {
      result.push({ type, enabled: true, options: {} });
      continue;
    }
    assertKnownKeys(entry, SECTION_ENTRY_KEYS, path);
    let enabled = true;
    if (entry.enabled === true || entry.enabled === false || entry.enabled === "auto") enabled = entry.enabled;
    else if (!isUnwritten(entry.enabled)) {
      invalid(diagnostics, `${path}.enabled`, entry.enabled, fallbackValue("auto"));
      enabled = "auto";
    }
    result.push({ type, enabled, options: normalizeOptions(entry.options, `${path}.options`, optionSchemaForSection(type) || {}, diagnostics) });
  }
  return result;
}

export function normalizeStartSection(value, sectionTypes = [], diagnostics) {
  if (isUnwritten(value)) return null;
  if (typeof value === "string" && sectionTypes.includes(value.trim())) return value.trim();
  diagnostics.push(createDiagnostic("value.invalid", { path: "start_section", value, fallback: FALLBACK.FIRST_SECTION }));
  return null;
}

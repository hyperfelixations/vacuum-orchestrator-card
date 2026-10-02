import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { parseConfigNumber } from "../core/numbers.js";
import { rejectConfiguration } from "./errors.js";
import { nearestKey } from "./suggest.js";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isUnwritten(value) {
  return value === undefined || value === null;
}

export function assertKnownKeys(object, allowed, path) {
  const known = allowed instanceof Set ? allowed : new Set(allowed);
  for (const key of Object.keys(object)) {
    if (known.has(key)) continue;
    const suggestion = nearestKey(key, known);
    rejectConfiguration("config.unknown_key", {
      key: `${path}.${key}`,
      suggestion: suggestion ? `${path}.${suggestion}` : null,
    });
  }
}

function invalid(diagnostics, path, value, fallback) {
  diagnostics.push(createDiagnostic("value.invalid", { path, value, fallback }));
}

export function readBoolean(value, path, diagnostics, fallback) {
  if (isUnwritten(value)) return fallback;
  if (value === true || value === false) return value;
  invalid(diagnostics, path, value, fallbackValue(fallback));
  return fallback;
}

export function readEnum(value, path, diagnostics, allowed, fallback) {
  if (isUnwritten(value)) return fallback;
  if (allowed.includes(value)) return value;
  invalid(diagnostics, path, value, fallbackValue(fallback));
  return fallback;
}

export function readNumber(value, path, diagnostics, { min, max, integer = false, fallback, instead = fallbackValue(fallback) }) {
  if (isUnwritten(value)) return fallback;
  const number = parseConfigNumber(value);
  if (number !== null && number >= min && number <= max && (!integer || Number.isInteger(number))) return number;
  invalid(diagnostics, path, value, instead);
  return fallback;
}

export function readText(value, path, diagnostics) {
  if (isUnwritten(value)) return null;
  if (typeof value === "string" && value.trim()) return value.trim();
  invalid(diagnostics, path, value, FALLBACK.AUTOMATIC);
  return null;
}

export function readLabel(value, path, diagnostics) {
  if (isUnwritten(value)) return null;
  if (typeof value === "string") return value.trim();
  invalid(diagnostics, path, value, FALLBACK.AUTOMATIC);
  return null;
}

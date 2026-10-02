// Tolerant readers for single wire values. A value of the wrong type reads as absent; a reader
// never throws and never invents a value. Shared by every normalizer in this layer.

import { parseInstant } from "../core/time.js";

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Trimmed non-empty text, else null.
export function text(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function integer(value) {
  return Number.isInteger(value) ? value : null;
}

export function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function bool(value) {
  return value === true || value === false ? value : null;
}

export function instant(value) {
  return parseInstant(value);
}

// Ordered, trimmed, de-duplicated string list; anything else in the list is skipped.
export function strings(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const result = [];
  const seen = new Set();
  for (const item of value) {
    const entry = text(item);
    if (entry === null || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return Object.freeze(result);
}

export function enumerated(value, isMember) {
  return isMember(value) ? value : null;
}

// Keys of a wire record the normalizer does not read; kept for diagnostics, never rendered.
export function unknownFields(wire, known) {
  return Object.freeze(Object.keys(wire).filter((key) => !known.has(key)));
}

export function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

// A string-to-string map with non-empty keys and values, as robot option maps use them.
export function stringMap(value) {
  if (!isRecord(value)) return Object.freeze({});
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const name = text(key);
    if (name === null || typeof item !== "string" || item === "") continue;
    result[name] = item;
  }
  return Object.freeze(result);
}

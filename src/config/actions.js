import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { isPlainObject, isUnwritten } from "./primitives.js";

export const ACTION_ALLOWLIST = new Set(["more-info", "toggle", "perform-action", "navigate", "url", "assist", "none"]);

export function normalizeAction(value, path, diagnostics, fallback) {
  const answer = fallback ? { ...fallback } : null;
  if (isUnwritten(value)) return answer;
  if (isPlainObject(value) && typeof value.action === "string" && ACTION_ALLOWLIST.has(value.action)) return { ...value };
  const written = isPlainObject(value) ? value.action : value;
  diagnostics.push(createDiagnostic("value.invalid", {
    path: isPlainObject(value) ? `${path}.action` : path,
    value: written,
    fallback: fallback ? fallbackValue(fallback.action) : FALLBACK.CARD_ACTION,
  }));
  return answer;
}

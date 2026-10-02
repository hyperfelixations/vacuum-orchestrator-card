// Normalizing the `show:` block: which parts of the card are drawn. A part belongs here when
// leaving it out changes the card's layout; what a view draws inside itself is that view's own
// option (RCC show contract). Returns only the written keys; normalize-config.js layers the
// defaults underneath.

import { createDiagnostic, fallbackValue, FALLBACK } from "../core/diagnostics.js";
import { assertKnownKeys, isPlainObject, isUnwritten, readBoolean } from "./primitives.js";

// Every default is `true` — the card without a `show:` block shows every part.
export const SHOW_SWITCHES = Object.freeze({
  accent_line: true,
  icon: true,
  title: true,
  subtitle: true,
  pill: true,
  warnings: true,
  panel: true,
  queue_controls: true,
  unavailable_views: true,
});

// The tab strip defaults to "show when there is a choice", which a boolean cannot express.
export const SHOW_TABS_DEFAULT = "auto";

export const SHOW_KEYS = Object.freeze([...Object.keys(SHOW_SWITCHES), "tabs"]);

export function resolveShowConfig(requested = {}) {
  return { ...SHOW_SWITCHES, tabs: SHOW_TABS_DEFAULT, ...requested };
}

function readTabs(value, diagnostics) {
  const word = value === true || value === false ? String(value) : typeof value === "string" ? value.trim().toLowerCase() : null;
  if (word === "true") return true;
  if (word === "false") return false;
  if (word === "auto") return "auto";
  diagnostics.push(createDiagnostic("value.invalid", { path: "show.tabs", value, fallback: fallbackValue(SHOW_TABS_DEFAULT) }));
  return SHOW_TABS_DEFAULT;
}

export function normalizeShowConfig(value, diagnostics) {
  if (isUnwritten(value)) return {};
  if (!isPlainObject(value)) {
    diagnostics.push(createDiagnostic("value.invalid", { path: "show", value, fallback: FALLBACK.DEFAULTS }));
    return {};
  }
  assertKnownKeys(value, SHOW_KEYS, "show");
  const show = {};
  for (const [key, raw] of Object.entries(value)) {
    if (isUnwritten(raw)) continue;
    show[key] = key === "tabs" ? readTabs(raw, diagnostics) : readBoolean(raw, `show.${key}`, diagnostics, SHOW_SWITCHES[key]);
  }
  return show;
}

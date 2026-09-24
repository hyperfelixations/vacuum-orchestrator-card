import { createDiagnostic } from "../core/diagnostics.js";
import { rejectConfiguration } from "./errors.js";
import { nearestKey } from "./suggest.js";

export const TOP_LEVEL_KEYS = Object.freeze(new Set([
  "title",
  "subtitle",
  "icon",
  "accent_line",
  "language",
  "show",
  "sections",
  "start_section",
  "page_size",
  "time_format",
  "density",
  "confirm_destructive",
  "tap_action",
  "hold_action",
]));

export const FRAMEWORK_KEYS = Object.freeze(new Set([
  "type",
  "index",
  "view_index",
  "view_layout",
  "layout_options",
  "grid_options",
  "visibility",
  "disabled",
  "card_mod",
]));

export function checkTopLevelKeys(config, diagnostics) {
  const known = new Set([...TOP_LEVEL_KEYS, ...FRAMEWORK_KEYS]);
  for (const key of Object.keys(config)) {
    if (known.has(key)) continue;
    const suggestion = nearestKey(key, known);
    if (suggestion && TOP_LEVEL_KEYS.has(suggestion)) {
      rejectConfiguration("config.unknown_key", { key, suggestion });
    }
    diagnostics.push(createDiagnostic("config.foreign_key", { path: key, value: config[key] }));
  }
}

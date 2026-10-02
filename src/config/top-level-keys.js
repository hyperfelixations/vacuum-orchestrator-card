// The keys a card configuration may carry at its top level, and what an unknown one means (RCC
// key contract). A key within two edits of one of the card's options is a typo and refuses the
// configuration with that option named; any other unknown key is foreign, warned about and
// ignored, so a key Home Assistant or a frontend module adds later never breaks the card.

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
  "views",
  "start_view",
  "page_size",
  "time_format",
  "confirm_destructive",
]));

// Written by Home Assistant (`LovelaceCardConfig`) and by card-mod; read by them, ignored here.
export const FRAMEWORK_KEYS = Object.freeze(new Set(["type", "index", "view_index", "view_layout", "layout_options", "grid_options", "visibility", "disabled", "card_mod"]));

const KNOWN_KEYS = Object.freeze(new Set([...TOP_LEVEL_KEYS, ...FRAMEWORK_KEYS]));

export function checkTopLevelKeys(config, diagnostics) {
  for (const key of Object.keys(config)) {
    if (KNOWN_KEYS.has(key)) continue;
    const suggestion = nearestKey(key, KNOWN_KEYS);
    if (suggestion && TOP_LEVEL_KEYS.has(suggestion)) rejectConfiguration("config.unknown_key", { key, suggestion });
    diagnostics.push(createDiagnostic("config.foreign_key", { path: key, value: config[key] }));
  }
}

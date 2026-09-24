// The section registry is the only composition point for section definitions and renderers.

import { diagnosticsSection } from "./diagnostics.js";
import { historySection } from "./history.js";
import { queueSection } from "./queue.js";
import { robotsSection } from "./robots.js";
import { roomsSection } from "./rooms.js";
import { boolOption } from "../config/option-schemas.js";

export const SECTION_DEFINITIONS = Object.freeze([
  {
    key: "queue",
    requires: ["queueRead"],
    defaultEnabled: () => true,
    optionsSchema: {},
  },
  {
    key: "rooms",
    requires: ["areasRead"],
    defaultEnabled: () => true,
    optionsSchema: {},
  },
  {
    key: "robots",
    requires: ["robotsRead"],
    defaultEnabled: () => true,
    optionsSchema: { show_map: boolOption(true) },
  },
  {
    key: "history",
    requires: ["jobsHistory"],
    defaultEnabled: () => false,
    optionsSchema: {},
  },
  {
    key: "diagnostics",
    requires: [],
    // Shows itself exactly when something is wrong with the connection.
    defaultEnabled: (model) => (model?.connection?.state || "connecting") !== "connected",
    optionsSchema: {},
  },
]);

const IMPLEMENTATIONS = [queueSection, roomsSection, robotsSection, historySection, diagnosticsSection];

function composeRegistry() {
  const definitionKeys = SECTION_DEFINITIONS.map((definition) => definition.key);
  const duplicateDefinitions = definitionKeys.filter((key, index) => definitionKeys.indexOf(key) !== index);
  if (duplicateDefinitions.length) throw new Error(`section registry: duplicate key(s): ${duplicateDefinitions.join(", ")}`);

  const byKey = new Map();
  for (const implementation of IMPLEMENTATIONS) {
    if (byKey.has(implementation.key)) throw new Error(`section registry: duplicate implementation for ${implementation.key}`);
    if (typeof implementation.build !== "function" || typeof implementation.render !== "function" || typeof implementation.patch !== "function") {
      throw new Error(`section registry: ${implementation.key} must export build, render and patch`);
    }
    byKey.set(implementation.key, implementation);
  }
  const orphaned = [...byKey.keys()].filter((key) => !definitionKeys.includes(key));
  if (orphaned.length) throw new Error(`section registry: orphaned implementation(s): ${orphaned.join(", ")}`);
  return definitionKeys.map((key) => {
    const renderer = byKey.get(key);
    if (!renderer) throw new Error(`section registry: missing implementation for ${key}`);
    return renderer;
  });
}

export const SECTION_RENDERERS = Object.freeze(composeRegistry());

export function rendererForSection(key) {
  return SECTION_RENDERERS.find((renderer) => renderer.key === key) || null;
}

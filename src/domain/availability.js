// The integration's verdict per action of an object (`actions`): offered now, or why not. A
// reason is one of the integration's error codes, worded by its own translations; the card
// adds only its client-local reasons on top. See internal dev doc §7 "Affordances".

import { isRecord, strings, text } from "./wire-values.js";

// Null without a verdict list: the card then offers nothing for that object.
export function normalizeActions(wire) {
  if (!isRecord(wire)) return null;
  const result = {};
  for (const [name, item] of Object.entries(wire)) {
    if (!text(name) || !isRecord(item) || typeof item.available !== "boolean") continue;
    // An offered action may ask a person to confirm first, about the robots it names (JOB-27).
    result[name] = Object.freeze({ available: item.available, reason: item.available ? null : text(item.reason), detail: item.available ? null : text(item.detail), warning: item.available ? text(item.warning) : null, robotIds: item.available ? strings(item.robot_ids) : Object.freeze([]) });
  }
  return Object.freeze(result);
}

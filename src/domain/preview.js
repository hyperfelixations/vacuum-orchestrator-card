// The integration's read-only preview of a job draft (`preview_job`): per setting the requested
// rung, the rungs some suitable robot offers and whether every one of them does; per robot
// whether it could start now and what it would apply; the chosen rooms no robot reaches. Nothing
// is created and no wish is rewritten. See internal dev doc §7 "Vorschau".

import { SETTING_FIELDS, SETTING_WIRE_NAMES, canonicalizeMode, isOperation, isSettingValue } from "./job-schema.js";
import { normalizeResolvedSettings } from "./settings.js";
import { enumerated, isRecord, records, strings, text } from "./wire-values.js";

function choice(field, wire) {
  if (!isRecord(wire)) return null;
  const options = records(wire.options)
    .filter((option) => isSettingValue(field, option.value))
    .map((option) => Object.freeze({ value: option.value, supportedByAll: option.supported_by_all === true }));
  return Object.freeze({ requested: isSettingValue(field, wire.requested) ? wire.requested : null, options: Object.freeze(options) });
}

function robot(wire) {
  const robotId = text(wire.robot_id);
  if (!robotId) return null;
  return Object.freeze({
    robotId,
    operation: enumerated(wire.operation, isOperation),
    startableNow: wire.startable_now === true,
    reason: text(wire.reason),
    settings: normalizeResolvedSettings(wire.settings),
  });
}

export function normalizePreview(wire) {
  if (!isRecord(wire)) return null;
  const settings = {};
  const wireSettings = isRecord(wire.settings) ? wire.settings : {};
  for (const field of SETTING_FIELDS) {
    const entry = choice(field, wireSettings[SETTING_WIRE_NAMES[field]]);
    if (entry) settings[field] = entry;
  }
  return Object.freeze({
    mode: canonicalizeMode(wire.mode),
    settings: Object.freeze(settings),
    robots: Object.freeze(records(wire.robots).map(robot).filter(Boolean)),
    unreachableRoomIds: strings(wire.unreachable_room_ids),
    startableNow: wire.startable_now === true,
    reason: text(wire.reason),
    // A start a person may still confirm: below the battery minimum (JOB-27).
    startWarning: text(wire.start_warning),
  });
}

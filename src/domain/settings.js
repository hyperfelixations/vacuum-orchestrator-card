// Robot settings as the integration resolves them, and the defaults it copies into new jobs.
// Values are rungs of the setting ladders; the card never resolves a rung itself.
// See internal dev doc §7 "Einstellungen".

import { PASS_MAX, PASS_MIN, SETTING_FIELDS, SETTING_WIRE_NAMES, canonicalizeMode, isSettingValue, isSettingsPolicy } from "./job-schema.js";
import { integer, isRecord, records } from "./wire-values.js";

const FIELD_BY_WIRE_NAME = Object.freeze(Object.fromEntries(Object.entries(SETTING_WIRE_NAMES).map(([field, wire]) => [wire, field])));

// The draft field of a wire setting name, or null for a name the card does not know.
export function settingField(wireName) {
  return Object.hasOwn(FIELD_BY_WIRE_NAME, wireName) ? FIELD_BY_WIRE_NAME[wireName] : null;
}

// One robot's settings for a phase: the requested rung and the one it applies; `applied` null
// means the robot has no such setting.
export function normalizeResolvedSettings(value) {
  const result = [];
  for (const item of records(value)) {
    const field = settingField(item.name);
    if (!field) continue;
    result.push(Object.freeze({ field, requested: isSettingValue(field, item.requested) ? item.requested : null, applied: isSettingValue(field, item.applied) ? item.applied : null }));
  }
  return Object.freeze(result);
}

// The integration's job defaults (`get_queue.job_defaults`); null without a complete record.
export function normalizeJobDefaults(wire) {
  if (!isRecord(wire)) return null;
  const mode = canonicalizeMode(wire.mode);
  const values = {};
  for (const field of SETTING_FIELDS) {
    const value = wire[SETTING_WIRE_NAMES[field]];
    if (!isSettingValue(field, value)) return null;
    values[field] = value;
  }
  if (!mode) return null;
  const passes = integer(wire.passes);
  return Object.freeze({
    mode,
    ...values,
    passes: passes !== null && passes >= PASS_MIN && passes <= PASS_MAX ? passes : PASS_MIN,
    settingsPolicy: isSettingsPolicy(wire.settings_policy) ? wire.settings_policy : "best_effort",
    configured: wire.configured === true,
  });
}

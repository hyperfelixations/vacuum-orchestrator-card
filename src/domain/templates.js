// Stored job templates. A template's intent uses the same field set as a job intent; manual
// instantiation creates an independent job. See internal dev doc §7 "Vorlagen".

import { PASS_MAX, PASS_MIN, canonicalizeMode, isMopRoute, isSettingsPolicy, isVacuumLevel, isWaterLevel } from "./job-schema.js";
import { enumerated, instant, integer, isRecord, strings, text } from "./wire-values.js";

// The integration's token for "every room a robot can clean when the job is created".
const ALL_ROOMS = "all";

export function normalizeIntent(wire) {
  if (!isRecord(wire)) return null;
  const mode = canonicalizeMode(wire.mode);
  const allRooms = wire.areas === ALL_ROOMS || (Array.isArray(wire.areas) && wire.areas.length === 1 && wire.areas[0] === ALL_ROOMS);
  const areas = allRooms ? Object.freeze([]) : strings(wire.areas);
  if (!mode || (!allRooms && areas.length === 0)) return null;
  const passes = integer(wire.passes);
  return Object.freeze({
    areas,
    allRooms,
    mode,
    name: text(wire.name),
    vacuumPower: enumerated(wire.vacuum_power, isVacuumLevel),
    mopIntensity: enumerated(wire.mop_intensity, isWaterLevel),
    mopRoute: enumerated(wire.mop_route, isMopRoute),
    passes: passes !== null && passes >= PASS_MIN && passes <= PASS_MAX ? passes : PASS_MIN,
    reason: text(wire.reason),
    note: text(wire.note),
    dedupeKey: text(wire.dedupe_key),
    requiredOn: strings(wire.required_on),
    requiredOff: strings(wire.required_off),
    settingsPolicy: enumerated(wire.settings_policy, isSettingsPolicy) ?? "best_effort",
  });
}

export function normalizeTemplate(wire) {
  if (!isRecord(wire)) return null;
  const templateId = text(wire.template_id);
  const intent = normalizeIntent(wire.intent);
  if (!templateId || !intent) return null;
  return Object.freeze({
    templateId,
    name: text(wire.name) ?? templateId,
    intent,
    enabled: wire.enabled !== false,
    automatic: wire.automatic === true,
    updatedAt: instant(wire.updated_at),
    suppressedRoomIds: strings(wire.suppressed_room_ids),
  });
}

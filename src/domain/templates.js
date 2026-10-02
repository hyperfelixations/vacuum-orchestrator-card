// Stored job templates. A template's intent uses the same field set as a job intent; manual
// instantiation creates an independent job. See internal dev doc §7 "Vorlagen".

import { PASS_MAX, PASS_MIN, canonicalizeMode, isMopRoute, isSemanticLevel, isSettingsPolicy } from "./job-schema.js";
import { enumerated, instant, integer, isRecord, strings, text } from "./wire-values.js";

export function normalizeIntent(wire) {
  if (!isRecord(wire)) return null;
  const mode = canonicalizeMode(wire.mode);
  const areas = strings(wire.areas);
  if (!mode || areas.length === 0) return null;
  const passes = integer(wire.passes);
  return Object.freeze({
    areas,
    mode,
    name: text(wire.name),
    vacuumPower: enumerated(wire.vacuum_power, isSemanticLevel),
    mopIntensity: enumerated(wire.mop_intensity, isSemanticLevel),
    mopRoute: enumerated(wire.mop_route, isMopRoute),
    passes: passes !== null && passes >= PASS_MIN && passes <= PASS_MAX ? passes : PASS_MIN,
    source: text(wire.source),
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

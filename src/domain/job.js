// Wire job records in, one frozen camelCase job out. Field set: the integration's
// `present_job`. See internal dev doc §7 "Job-Lesemodell".

import { PASS_MAX, PASS_MIN, canonicalizeMode, isAfterCancel, isJobState, isMopRoute, isProvenanceKind, isSettingsPolicy, isVacuumLevel, isWaterLevel } from "./job-schema.js";
import { normalizeReadiness } from "./readiness.js";
import { enumerated, instant, integer, isRecord, strings, text, unknownFields } from "./wire-values.js";

const JOB_FIELDS = new Set([
  "api_version",
  "job_id",
  "revision",
  "state",
  "name",
  "areas",
  "room_ids",
  "mode",
  "vacuum_power",
  "mop_intensity",
  "mop_route",
  "passes",
  "all_rooms",
  "reason",
  "note",
  "dedupe_key",
  "required_on",
  "required_off",
  "settings_policy",
  "created_at",
  "updated_at",
  "active_attempt_id",
  "origin",
  "retries_job_id",
  "failure_code",
  "after_cancel",
  "readiness",
]);

// How the job came into the queue; a template origin names its template.
function origin(wire) {
  if (!isRecord(wire) || !isProvenanceKind(wire.kind)) return null;
  return Object.freeze({ kind: wire.kind, templateId: text(wire.template_id) });
}

// Null for a record without identity, mode, targets or timestamps; any other unreadable field
// degrades to null. A state the card does not know is kept as `unknown` so the job stays
// visible while every control for it stays hidden.
export function normalizeJob(wire) {
  if (!isRecord(wire)) return null;
  const jobId = text(wire.job_id);
  const revision = integer(wire.revision);
  const areas = strings(wire.areas);
  const mode = canonicalizeMode(wire.mode);
  const passes = integer(wire.passes);
  const createdAt = instant(wire.created_at);
  const updatedAt = instant(wire.updated_at);
  if (!jobId || revision === null || areas.length === 0 || !mode || createdAt === null || updatedAt === null) return null;
  // Without `room_ids` the aliases are the only identities known.
  const roomIds = strings(wire.room_ids);
  return Object.freeze({
    jobId,
    revision,
    state: isJobState(wire.state) ? wire.state : "unknown",
    wireState: typeof wire.state === "string" ? wire.state : null,
    name: text(wire.name),
    areas,
    roomIds: roomIds.length ? roomIds : areas,
    mode,
    vacuumPower: enumerated(wire.vacuum_power, isVacuumLevel),
    mopIntensity: enumerated(wire.mop_intensity, isWaterLevel),
    mopRoute: enumerated(wire.mop_route, isMopRoute),
    passes: passes !== null && passes >= PASS_MIN && passes <= PASS_MAX ? passes : null,
    allRooms: wire.all_rooms === true,
    reason: text(wire.reason),
    note: text(wire.note),
    dedupeKey: text(wire.dedupe_key),
    requiredOn: strings(wire.required_on),
    requiredOff: strings(wire.required_off),
    settingsPolicy: enumerated(wire.settings_policy, isSettingsPolicy),
    createdAt,
    updatedAt,
    activeAttemptId: text(wire.active_attempt_id),
    origin: origin(wire.origin),
    retriesJobId: text(wire.retries_job_id),
    failureCode: text(wire.failure_code),
    // While canceling: whether the robot stays where it stopped or returns to its dock.
    afterCancel: enumerated(wire.after_cancel, isAfterCancel),
    readiness: normalizeReadiness(wire.readiness),
    unknownFields: unknownFields(wire, JOB_FIELDS),
  });
}

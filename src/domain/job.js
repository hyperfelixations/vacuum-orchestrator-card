// Wire job records in, one frozen camelCase job out. Field set: the integration's
// `present_job`. See internal dev doc §7 "Job-Lesemodell".

import { normalizeActions } from "./availability.js";
import { PASS_MAX, PASS_MIN, canonicalizeMode, isAfterCancel, isCompletionQuality, isHoldPurpose, isJobState, isMopRoute, isOperation, isProvenanceKind, isRobotsState, isSettingsPolicy, isVacuumLevel, isWaterLevel } from "./job-schema.js";
import { normalizeReadiness } from "./readiness.js";
import { enumerated, finite, instant, integer, isRecord, records, strings, text, unknownFields } from "./wire-values.js";

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
  "start_after",
  "hold",
  "waiting",
  "progress",
  "completion",
  "actions",
  "active_attempt_id",
  "origin",
  "retries_job_id",
  "failure_code",
  "corrected_at",
  "after_cancel",
  "readiness",
]);

// How the job came into the queue; a template origin names its template.
function origin(wire) {
  if (!isRecord(wire) || !isProvenanceKind(wire.kind)) return null;
  return Object.freeze({ kind: wire.kind, templateId: text(wire.template_id) });
}

// An edit or a delete confirmation holds the job until `expiresAt` unless renewed.
function hold(wire) {
  if (!isRecord(wire) || !isHoldPurpose(wire.purpose)) return null;
  return Object.freeze({ purpose: wire.purpose, expiresAt: instant(wire.expires_at) });
}

// One reason a job waits, with the rooms, entities and robots it is about.
export function normalizeBlocker(wire) {
  if (!isRecord(wire)) return null;
  const code = text(wire.code);
  if (!code) return null;
  return Object.freeze({
    code,
    until: instant(wire.until),
    roomIds: strings(wire.room_ids),
    entityIds: strings(wire.entity_ids),
    robotIds: strings(wire.robot_ids),
    detail: text(wire.detail),
  });
}

const blockers = (value) => Object.freeze(records(value).map(normalizeBlocker).filter(Boolean));

function axis(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({ ready: wire.ready === true, blockers: blockers(wire.blockers) });
}

function robotsAxis(wire) {
  if (!isRecord(wire)) return null;
  const robot = (key) => (item) => {
    const robotId = text(item.robot_id);
    return robotId ? Object.freeze({ robotId, blockers: blockers(item[key]) }) : null;
  };
  return Object.freeze({
    state: enumerated(wire.state, isRobotsState) ?? "unknown",
    candidates: Object.freeze(records(wire.candidates).map(robot("blockers")).filter(Boolean)),
    unsuitable: Object.freeze(records(wire.unsuitable).map(robot("reasons")).filter(Boolean)),
  });
}

// Why a waiting job does not start: the main reason and the job, robot and queue axes.
function waiting(wire) {
  const primary = normalizeBlocker(wire);
  if (!primary) return null;
  return Object.freeze({ ...primary, job: axis(wire.job), robots: robotsAxis(wire.robots), queue: axis(wire.queue) });
}

function fault(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({ codes: strings(wire.codes), since: instant(wire.since), failsAt: instant(wire.fails_at) });
}

// The started attempt: its operation and phase, and percentages where the robot reports them.
function progress(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({
    operation: enumerated(wire.operation, isOperation),
    phase: integer(wire.phase),
    phases: integer(wire.phases),
    startedAt: instant(wire.started_at),
    robotId: text(wire.robot_id),
    phasePercent: finite(wire.phase_percent),
    percent: finite(wire.percent),
    fault: fault(wire.fault),
  });
}

// How a finished job's success was established, and what deviated or was not observed.
function completion(wire) {
  if (!isRecord(wire)) return null;
  return Object.freeze({ quality: enumerated(wire.quality, isCompletionQuality), notes: strings(wire.notes) });
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
    // The start delay: the queue starts the job no earlier than this.
    startAfter: instant(wire.start_after),
    hold: hold(wire.hold),
    waiting: waiting(wire.waiting),
    progress: progress(wire.progress),
    completion: completion(wire.completion),
    actions: normalizeActions(wire.actions),
    activeAttemptId: text(wire.active_attempt_id),
    origin: origin(wire.origin),
    retriesJobId: text(wire.retries_job_id),
    failureCode: text(wire.failure_code),
    correctedAt: instant(wire.corrected_at),
    // While canceling: whether the robot stays where it stopped or returns to its dock.
    afterCancel: enumerated(wire.after_cancel, isAfterCancel),
    readiness: normalizeReadiness(wire.readiness),
    unknownFields: unknownFields(wire, JOB_FIELDS),
  });
}

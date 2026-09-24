// Wire job records in, one frozen camelCase job out. The wire vocabulary is snake_case and
// belongs to the backend; nothing above this module sees it. See internal dev doc §7.

import {
  PASS_MAX,
  PASS_MIN,
  canonicalizeMode,
  isActiveState,
  isJobState,
  isMopRoute,
  isSemanticLevel,
  isSettingsPolicy,
  isTerminalState,
} from "./job-schema.js";
import { normalizeReadiness } from "./readiness.js";
import { parseInstant } from "../core/time.js";

const WIRE_FIELDS = new Set([
  "api_version",
  "job_id",
  "revision",
  "state",
  "name",
  "areas",
  "mode",
  "vacuum_power",
  "mop_intensity",
  "mop_route",
  "passes",
  "source",
  "reason",
  "note",
  "dedupe_key",
  "required_on",
  "required_off",
  "settings_policy",
  "created_at",
  "updated_at",
  "active_attempt_id",
  "retries_job_id",
  "failure_code",
  "readiness",
  "assigned_robot_id",
  "started_at",
  "finished_at",
  "blocked_reason",
  "active_work_unit_id",
  "work_units",
]);

// Every reason a row control can be unavailable. The vocabulary is closed: the presentation
// layer maps each value to exactly one `action.disabled.*` key.
export const ACTION_REASONS = Object.freeze([
  "not_queued",
  "at_boundary",
  "capability_missing",
  "command_pending",
  "read_only",
]);

export const ACTION_KEYS = Object.freeze([
  "moveUp",
  "moveDown",
  "moveTop",
  "moveBottom",
  "edit",
  "delete",
  "start",
  "cancel",
  "retry",
]);

function optionalText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function areaList(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function entityList(value) {
  return Object.freeze(areaList(value) || []);
}

function integer(value) {
  return Number.isInteger(value) ? value : null;
}

function enumerated(value, isValid) {
  if (value === null || value === undefined) return null;
  return isValid(value) ? value : null;
}

function workUnit(value) {
  if (!value || typeof value !== "object") return null;
  const workUnitId = optionalText(value.work_unit_id);
  const operation = optionalText(value.operation);
  const state = optionalText(value.state);
  if (!workUnitId || !operation || !state) return null;
  return Object.freeze({
    workUnitId,
    operation,
    state,
    areaIds: Object.freeze(areaList(value.area_ids) || []),
  });
}

// Null for a record that misses identity, state, targets, mode or timestamps. Everything else
// degrades to null rather than discarding the job.
export function normalizeJob(wire) {
  if (!wire || typeof wire !== "object" || Array.isArray(wire)) return null;
  const jobId = optionalText(wire.job_id);
  const revision = integer(wire.revision);
  const state = isJobState(wire.state) ? wire.state : null;
  const areas = areaList(wire.areas);
  const mode = canonicalizeMode(wire.mode);
  const passes = integer(wire.passes);
  const settingsPolicy = isSettingsPolicy(wire.settings_policy) ? wire.settings_policy : null;
  const createdAt = parseInstant(wire.created_at);
  const updatedAt = parseInstant(wire.updated_at);
  if (
    !jobId ||
    revision === null ||
    !state ||
    !areas ||
    areas.length === 0 ||
    !mode ||
    passes === null ||
    passes < PASS_MIN ||
    passes > PASS_MAX ||
    !settingsPolicy ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }
  const workUnits = Array.isArray(wire.work_units) ? wire.work_units.map(workUnit).filter(Boolean) : [];
  return Object.freeze({
    jobId,
    revision,
    state,
    name: optionalText(wire.name),
    areas: Object.freeze(areas),
    mode,
    vacuumPower: enumerated(wire.vacuum_power, isSemanticLevel),
    mopIntensity: enumerated(wire.mop_intensity, isSemanticLevel),
    mopRoute: enumerated(wire.mop_route, isMopRoute),
    passes,
    source: optionalText(wire.source),
    reason: optionalText(wire.reason),
    note: optionalText(wire.note),
    dedupeKey: optionalText(wire.dedupe_key),
    requiredOn: entityList(wire.required_on),
    requiredOff: entityList(wire.required_off),
    settingsPolicy,
    createdAt,
    updatedAt,
    activeAttemptId: optionalText(wire.active_attempt_id),
    retriesJobId: optionalText(wire.retries_job_id),
    failureCode: optionalText(wire.failure_code),
    readiness: normalizeReadiness(wire.readiness),
    assignedRobotId: optionalText(wire.assigned_robot_id),
    startedAt: parseInstant(wire.started_at),
    finishedAt: parseInstant(wire.finished_at),
    blockedReason: optionalText(wire.blocked_reason),
    activeWorkUnitId: optionalText(wire.active_work_unit_id),
    workUnits: Object.freeze(workUnits),
    unknownFields: Object.freeze(Object.keys(wire).filter((key) => !WIRE_FIELDS.has(key))),
  });
}

function decision(status, reason = null) {
  return Object.freeze({ state: status, reason });
}

const HIDDEN = decision("hidden", "not_queued");

function resolve({ visible, allowed, boundary, capability, pendingTarget, options }) {
  if (!visible) return HIDDEN;
  if (!options.canCommand) return decision("disabled", "read_only");
  if (!options.capabilities[capability]) return decision("disabled", "capability_missing");
  if (options.pending.has(pendingTarget)) return decision("disabled", "command_pending");
  if (!allowed) return decision("disabled", boundary ? "at_boundary" : "not_queued");
  return decision("enabled");
}

// The single policy for whether a job control is shown, disabled or usable. Views render this
// decision; they never re-derive it. See internal dev doc §7 "Aktionsfreigabe".
export function jobActions(job, { index = 0, total = 0, capabilities = {}, canCommand = true, pending = new Set() } = {}) {
  if (!job || typeof job !== "object") {
    return Object.freeze(Object.fromEntries(ACTION_KEYS.map((key) => [key, HIDDEN])));
  }
  const options = {
    capabilities: capabilities && typeof capabilities === "object" ? capabilities : {},
    canCommand: canCommand !== false,
    pending: pending instanceof Set ? pending : new Set(pending || []),
  };
  const pendingTarget = `job:${job.jobId}`;
  const queued = job.state === "queued";
  const active = isActiveState(job.state);
  const terminal = isTerminalState(job.state);
  const atTop = index <= 0;
  const atBottom = total <= 0 || index >= total - 1;
  // A single start is independent of the queue mode; the backend decides dispatchability.
  const move = (blocked) =>
    resolve({ visible: queued, allowed: !blocked, boundary: blocked, capability: "jobMove", pendingTarget, options });
  return Object.freeze({
    moveUp: move(atTop),
    moveDown: move(atBottom),
    moveTop: move(atTop),
    moveBottom: move(atBottom),
    edit: resolve({ visible: queued, allowed: queued, capability: "jobUpdate", pendingTarget, options }),
    delete: resolve({ visible: queued || terminal, allowed: queued || terminal, capability: "jobDelete", pendingTarget, options }),
    start: resolve({ visible: queued, allowed: queued, capability: "jobStart", pendingTarget, options }),
    cancel: resolve({ visible: active, allowed: active, capability: "jobCancel", pendingTarget, options }),
    retry: resolve({ visible: terminal, allowed: terminal, capability: "jobRetry", pendingTarget, options }),
  });
}

// The queue-wide controls follow the same policy as a row control, so shell and section can
// never disagree about what is offered. The queue mode decides which command the one control
// carries. See internal dev doc §7 "Aktionsfreigabe".
const QUEUE_COMMAND_BY_MODE = Object.freeze({
  running: { command: "pause_queue", action: "pause-queue", capability: "queuePause" },
  paused: { command: "resume_queue", action: "resume-queue", capability: "queueResume" },
  idle: { command: "run_queue", action: "run-queue", capability: "queueRun" },
});

export function queueActions({ mode = "idle", capabilities = {}, canCommand = true, pending = new Set() } = {}) {
  const options = {
    capabilities: capabilities && typeof capabilities === "object" ? capabilities : {},
    canCommand: canCommand !== false,
    pending: pending instanceof Set ? pending : new Set(pending || []),
  };
  const spec = QUEUE_COMMAND_BY_MODE[mode] || QUEUE_COMMAND_BY_MODE.idle;
  return Object.freeze({
    queue: Object.freeze({
      command: spec.command,
      action: spec.action,
      mode: spec.command === "run_queue" ? "idle" : mode,
      decision: resolve({ visible: true, allowed: true, capability: spec.capability, pendingTarget: "queue", options }),
    }),
    create: Object.freeze({
      command: "create_job",
      action: "create-job",
      decision: resolve({ visible: true, allowed: true, capability: "jobCreate", pendingTarget: "create", options }),
    }),
  });
}

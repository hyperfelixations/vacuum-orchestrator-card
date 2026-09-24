// Pure row projection shared by the queue and history sections. Action permissions come from
// the domain policy; this module only words and formats them.

import { ACTION_KEYS, jobActions } from "../../domain/job.js";
import { BACKEND_ERROR_MESSAGE_KEYS } from "../../domain/backend-errors.js";
import { MODE_OPERATIONS } from "../../domain/job-schema.js";
import {
  active,
  areaLabel,
  areaMap,
  commandPending,
  displayTime,
  duration,
  entityLabel,
  entityMap,
  jobLabel,
  listOf,
  modeLabel,
  modeShortLabel,
  number,
  pendingTargets,
  readinessLabel,
  stateLabel,
  terminal,
  text,
} from "./helpers.js";

function settingValue(texts, key, value) {
  if (value === null || value === undefined) return null;
  if (key === "passes") return `${number(texts, value)}×`;
  if (key === "vacuumPower" || key === "mopIntensity") return text(texts, `level.${value}`, undefined, value);
  if (key === "mopRoute") return text(texts, `route.${value}`, undefined, value);
  if (key === "settingsPolicy") return text(texts, `policy.${value === "best_effort" ? "bestEffort" : value}`, undefined, value);
  return String(value);
}

// Only the preferences the chosen mode can actually use are shown.
function buildSettings(job, texts) {
  const operations = new Set(listOf(MODE_OPERATIONS[job.mode]));
  const usesVacuum = operations.has("vacuum") || operations.has("vacuum_and_mop");
  const usesMop = operations.has("mop") || operations.has("vacuum_and_mop");
  const entries = [["passes", job.passes]];
  if (usesVacuum) entries.push(["vacuumPower", job.vacuumPower]);
  if (usesMop) entries.push(["mopIntensity", job.mopIntensity], ["mopRoute", job.mopRoute]);
  entries.push(["settingsPolicy", job.settingsPolicy]);
  return entries
    .map(([key, value]) => ({ key, value: settingValue(texts, key, value) }))
    .filter((entry) => entry.value !== null);
}

function readinessFor(job, texts, entitiesById) {
  if (!job.readiness) {
    return { state: "notApplicable", label: readinessLabel(texts, "notApplicable"), entities: [] };
  }
  const entities = [
    ...job.readiness.failedOn.map((id) => ({ id, label: entityLabel(id, entitiesById), kind: "requiredOn" })),
    ...job.readiness.failedOff.map((id) => ({ id, label: entityLabel(id, entitiesById), kind: "requiredOff" })),
    ...job.readiness.unknown.map((id) => ({ id, label: entityLabel(id, entitiesById), kind: "unknown" })),
  ];
  return { state: job.readiness.state, label: readinessLabel(texts, job.readiness.state), entities };
}

function resultFor(job, texts) {
  if (!job.failureCode) return stateLabel(texts, job.state);
  const key = BACKEND_ERROR_MESSAGE_KEYS[job.failureCode] || "error.backend.unknown";
  return text(texts, key, { code: job.failureCode }, job.failureCode);
}

export function buildJobRowViewModel({ job, index = 0, total = 0, model = {}, texts, timeFormat = "auto", nowMs = null, history = false }) {
  const areasById = areaMap(model);
  const entitiesById = entityMap(model);
  const areas = job.areas.map((areaId) => areaLabel(areaId, areasById));
  const actions = jobActions(job, {
    index,
    total,
    capabilities: model.capabilities || {},
    canCommand: model.permissions?.canCommand !== false,
    pending: pendingTargets(model),
  });
  const durationMs =
    job.startedAt !== null && job.finishedAt !== null ? Math.max(0, job.finishedAt - job.startedAt) : null;
  // Only the pending queue has positions, and the queue model is the one place that assigns
  // them. An active or historic job shows no number rather than a misleading one.
  const position = Number.isInteger(job.position) ? job.position : null;

  return {
    key: job.jobId,
    jobId: job.jobId,
    revision: job.revision,
    position,
    positionText: position === null ? "" : String(position).padStart(2, "0"),
    state: job.state,
    stateLabel: stateLabel(texts, job.state),
    stateTone: active(job) ? "running" : job.state === "failed" || job.state === "needs_attention" ? "attention" : terminal(job) ? "idle" : "ready",
    readiness: readinessFor(job, texts, entitiesById),
    name: jobLabel(job, areasById),
    areas,
    areasText: areas.join(", "),
    mode: job.mode,
    modeLabel: modeLabel(texts, job.mode),
    modeShortLabel: modeShortLabel(texts, job.mode),
    settings: buildSettings(job, texts),
    source: job.source || null,
    timeLabel: displayTime(texts, job.updatedAt, timeFormat, nowMs),
    durationMs,
    durationLabel: durationMs === null ? "—" : duration(texts, durationMs),
    resultLabel: history ? resultFor(job, texts) : null,
    failureCode: job.failureCode,
    blockedReason: job.blockedReason,
    assignedRobotId: job.assignedRobotId,
    active: active(job),
    terminal: terminal(job),
    pending: commandPending(model, `job:${job.jobId}`),
    history,
    actions,
  };
}

export { ACTION_KEYS };

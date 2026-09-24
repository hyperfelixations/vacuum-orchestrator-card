// The full record of one job. Every field comes from the backend; phase progress is shown
// only where the backend actually reports work units.

import { buildJobRowViewModel } from "./job-row-vm.js";
import { areaLabel, areaMap, dateTime, entityLabel, entityMap, listOf, modeLabel, readinessLabel, stateLabel, text } from "./helpers.js";

const DONE_STATES = new Set(["completed", "succeeded"]);

function progressFor(job) {
  if (!job.workUnits.length) return null;
  const done = job.workUnits.filter((unit) => DONE_STATES.has(unit.state)).length;
  return {
    value: job.workUnits.length ? done / job.workUnits.length : null,
    completed: done,
    total: job.workUnits.length,
    activeWorkUnitId: job.activeWorkUnitId,
    units: job.workUnits.map((unit) => ({
      id: unit.workUnitId,
      operation: unit.operation,
      state: unit.state,
      active: unit.workUnitId === job.activeWorkUnitId,
      areaIds: unit.areaIds,
    })),
  };
}

function readinessFor(job, texts, entitiesById) {
  if (!job.readiness) return null;
  const list = (ids) => ids.map((id) => ({ id, label: entityLabel(id, entitiesById) }));
  return {
    state: job.readiness.state,
    label: readinessLabel(texts, job.readiness.state),
    failedOn: list(job.readiness.failedOn),
    failedOff: list(job.readiness.failedOff),
    unknown: list(job.readiness.unknown),
  };
}

function robotNameFor(model, robotId) {
  if (!robotId) return null;
  return listOf(model.robots?.items).find((robot) => robot.robotId === robotId)?.name || robotId;
}

export function buildJobDetailViewModel({ model = {}, texts, job = null, options = {}, nowMs = null, ui } = {}) {
  if (!job) {
    return { key: "detail", available: false, jobId: options.jobId || null, title: text(texts, "unavailable.noSection"), ui };
  }
  const areasById = areaMap(model);
  const entitiesById = entityMap(model);
  const index = listOf(model.queue?.pending).findIndex((entry) => entry.jobId === job.jobId);
  const row = buildJobRowViewModel({
    job,
    index: index < 0 ? 0 : index,
    offset: model.queue?.offset ?? 0,
    total: model.queue?.total ?? 0,
    model,
    texts,
    timeFormat: options.timeFormat,
    nowMs,
  });

  return {
    key: "detail",
    available: true,
    jobId: job.jobId,
    title: row.name,
    state: job.state,
    stateLabel: stateLabel(texts, job.state),
    mode: job.mode,
    modeLabel: modeLabel(texts, job.mode),
    areas: job.areas.map((areaId) => ({ id: areaId, label: areaLabel(areaId, areasById) })),
    row,
    readiness: readinessFor(job, texts, entitiesById),
    progress: progressFor(job),
    source: job.source || "—",
    reason: job.reason || "—",
    note: job.note || "—",
    dedupeKey: job.dedupeKey,
    createdLabel: dateTime(texts, job.createdAt),
    updatedLabel: dateTime(texts, job.updatedAt),
    assignedRobotId: job.assignedRobotId,
    assignedRobotName: robotNameFor(model, job.assignedRobotId),
    retriesJobId: job.retriesJobId,
    failureCode: job.failureCode,
    blockedReason: job.blockedReason,
    activeWorkUnitId: job.activeWorkUnitId,
    requiredOn: job.requiredOn.map((id) => ({ id, label: entityLabel(id, entitiesById) })),
    requiredOff: job.requiredOff.map((id) => ({ id, label: entityLabel(id, entitiesById) })),
    actions: row.actions,
    ui,
  };
}

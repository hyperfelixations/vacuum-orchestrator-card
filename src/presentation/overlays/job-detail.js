// One job in full: what it asks for, why it waits (readiness), which robot could take each
// phase (execution explanation), what was tried (attempts) and its trace. Everything is the
// integration's own statement; see internal dev doc §8 "Auftragsdetail".

import { decide, jobAffordances, jobTarget, roomTarget } from "../../domain/affordances.js";
import { explanationsByOperation } from "../../domain/execution.js";
import { findJob, list, robotName, roomIndex, roomName, slotData } from "../common/lookups.js";
import { attemptStateLabel, jobStateLabel, modeLabel, moment, operationLabel, outcomeText, qualityLabel, reasonText, settingLabel, settingName, t } from "../common/texts.js";
import { traceRows } from "../common/trace.js";
import { readinessReasons, settingChips, stateTone } from "../views/job-row.js";

export const TRACE_LIMIT = 12;

// Only what differs from the request is worth a word: a nearer rung, or no such setting.
export function settingsNote(texts, settings) {
  const notes = list(settings)
    .filter((item) => item.requested && item.applied !== item.requested)
    .map((item) => {
      const setting = settingName(texts, item.field);
      return item.applied
        ? t(texts, "detail.settingFallback", { setting, applied: settingLabel(texts, item.field, item.applied), requested: settingLabel(texts, item.field, item.requested) })
        : t(texts, "detail.settingMissing", { setting });
    });
  return notes.length ? notes.join(", ") : null;
}

// Why the job exists: how it came into the queue, with its template while that still exists,
// and its own occasion.
export function occasionText(texts, job, model) {
  const template = job.origin?.templateId ? list(slotData(model, "templates")?.items).find((item) => item.templateId === job.origin.templateId) : null;
  const origin = job.origin ? (template ? t(texts, "origin.withTemplate", { origin: t(texts, `origin.${job.origin.kind}`), template: template.name }) : t(texts, `origin.${job.origin.kind}`)) : null;
  return [origin, job.reason].filter(Boolean).join(" · ") || null;
}

export function buildJobDetail({ model, texts, context, overlay, config }) {
  const job = findJob(model, overlay.jobId);
  const status = model.slots?.job?.status;
  if (!job) {
    return { key: "job-detail", missing: status !== "loading" && status !== "idle", loading: status === "loading" || status === "idle", title: t(texts, "detail.title") };
  }
  const index = roomIndex(model);
  const queue = slotData(model, "queue");
  const position = list(queue?.jobs).find((entry) => entry.jobId === job.jobId)?.position ?? null;
  const actions = jobAffordances(job, context, { position, total: queue?.total ?? 0 });
  const execution = slotData(model, "execution");
  // The integration explains a start only where one is due (queued, or between phases).
  const releaseable = job.readiness?.blockedRoomIds?.length
    ? job.readiness.blockedRoomIds.map((roomId) => ({ roomId, name: roomName(roomId, index, model), decision: decide(context, { operation: "release_room", target: roomTarget(roomId) }) }))
    : [];
  const trace = traceRows(slotData(model, "trace")?.records, { model, texts, limit: TRACE_LIMIT });

  return {
    key: "job-detail",
    jobId: job.jobId,
    title: job.name || list(job.roomIds).map((roomId) => roomName(roomId, index, model)).join(", "),
    state: job.state,
    stateLabel: jobStateLabel(texts, job.state),
    stateTone: stateTone(job.state),
    rooms: list(job.roomIds).map((roomId) => roomName(roomId, index, model)),
    mode: modeLabel(texts, job.mode),
    settings: settingChips(job, texts),
    position,
    outcome: outcomeText(texts, job.failureCode),
    afterCancel: job.state === "canceling" && job.afterCancel ? t(texts, `detail.afterCancel.${job.afterCancel}`) : null,
    readiness: job.readiness
      ? { state: job.readiness.state, reasons: readinessReasons(job.readiness, { index, model, texts }) }
      : null,
    releaseable,
    execution: execution
      ? explanationsByOperation(execution).map((group) => ({
          key: group.operation,
          title: operationLabel(texts, group.operation === "unknown" ? null : group.operation),
          eligible: group.eligible,
          robots: group.robots.map((item) => ({
            key: `${group.operation}:${item.robotId}`,
            name: robotName(item.robotId, model),
            eligible: item.eligible,
            reason: item.eligible ? t(texts, "detail.eligible") : reasonText(texts, item.eligibilityReason) || readinessReasons(item.readiness, { index, model, texts })[0] || t(texts, "readiness.blocked"),
            settings: settingsNote(texts, item.settings),
          })),
        }))
      : null,
    executionLoading: !execution && model.slots?.execution?.status === "loading",
    attempts: list(execution?.attempts).map((attempt) => ({
      key: attempt.attemptId,
      robot: robotName(attempt.robotId, model),
      state: attemptStateLabel(texts, attempt.state),
      quality: attempt.quality ? qualityLabel(texts, attempt.quality) : null,
      outcome: outcomeText(texts, attempt.failureCode),
      settings: settingsNote(texts, attempt.settings),
    })),
    trace,
    traceOpen: overlay.traceOpen === true,
    facts: [
      { label: t(texts, "detail.created"), value: moment(texts, job.createdAt, config?.time_format, model.nowMs) },
      { label: t(texts, "detail.updated"), value: moment(texts, job.updatedAt, config?.time_format, model.nowMs) },
      { label: t(texts, "detail.occasion"), value: occasionText(texts, job, model) },
      { label: t(texts, "field.note"), value: job.note },
      { label: t(texts, "detail.retryOf"), value: job.retriesJobId },
      { label: t(texts, "detail.jobId"), value: job.jobId },
    ],
    actions,
    saveAsTemplate: decide(context, { operation: "save_job_as_template", target: jobTarget(job.jobId) }),
  };
}

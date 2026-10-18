// One job in full: what it asks for, why it waits (the three axes of its waiting reason), what it
// is doing (progress), which robot could take each phase (execution explanation), what was tried
// (attempts) and its trace. Everything is the integration's own statement; see internal dev doc §8
// "Auftragsdetail".

import { decide, jobAffordances, jobTarget, roomAffordances } from "../../domain/affordances.js";
import { explanationsByOperation } from "../../domain/execution.js";
import { isTerminalState } from "../../domain/job-schema.js";
import { findJob, list, robotName, roomIndex, roomName, slotData } from "../common/lookups.js";
import { attemptStateLabel, jobStateLabel, modeLabel, moment, operationLabel, outcomeText, qualityLabel, reasonText, settingLabel, settingName, t } from "../common/texts.js";
import { traceRows } from "../common/trace.js";
import { MODE_ICONS, progressOf, readinessReasons, settingChips, stateTone } from "../views/job-row.js";
import { waitingAxes } from "../views/waiting.js";

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

// How the job came into the queue, with its template while that still exists. Its occasion is
// the person's own word and stands apart.
export function originText(texts, job, model) {
  if (!job.origin) return null;
  const template = job.origin.templateId ? list(slotData(model, "templates")?.items).find((item) => item.templateId === job.origin.templateId) : null;
  return template ? t(texts, "origin.withTemplate", { origin: t(texts, `origin.${job.origin.kind}`), template: template.name }) : t(texts, `origin.${job.origin.kind}`);
}

// The execution explanation belongs before a start, and says more than the waiting reason's robot
// axis only for a job with several phases or with a setting a robot would apply differently. What a
// started attempt applies stands with the attempts.
function explains(execution, job, texts) {
  if (!job.waiting) return false;
  const groups = explanationsByOperation(execution);
  return groups.length > 1 || groups.some((group) => group.robots.some((item) => settingsNote(texts, item.settings)));
}

// How a finished job ended, in words (JOB-25, EXE-14, EXE-15): the outcome with how sure the
// integration is of a completion, the notes it keeps with it, when a person corrected it, and the
// correction itself. A failed or cancelled job names its failure.
function resultOf(job, { texts, config, model, actions }) {
  if (!isTerminalState(job.state)) return null;
  const quality = job.completion?.quality;
  const ended = job.state === "completed"
    ? { key: "outcome", icon: "mdi:check-circle-outline", tone: "success", text: t(texts, quality ? `result.completed.${quality}` : "result.completed") }
    : { key: "outcome", icon: job.state === "failed" ? "mdi:alert-circle-outline" : "mdi:stop-circle-outline", tone: "attention", text: outcomeText(texts, job.failureCode) || t(texts, `result.${job.state}`) };
  const notes = list(job.completion?.notes).map((code) => ({ key: `note:${code}`, icon: "mdi:information-outline", text: t(texts, `completion.note.${code}`) }));
  return {
    lines: [ended, ...notes],
    corrected: job.correctedAt ? moment(texts, job.correctedAt, config?.time_format, model.nowMs) : null,
    correct: actions.correct,
  };
}

// `pane`: shown beside a wide queue's list, where the trace opens as a block of the card rather
// than of a page (LAY-03). `menu`: the key of the card's open menu, if any.
export function buildJobDetail({ model, texts, context, overlay, config, pane = false, menu = null }) {
  const job = findJob(model, overlay.jobId);
  const status = model.slots?.job?.status;
  if (!job) {
    return { key: "job-detail", missing: status !== "loading" && status !== "idle", loading: status === "loading" || status === "idle", title: t(texts, "detail.title") };
  }
  const index = roomIndex(model);
  const position = list(slotData(model, "queue")?.jobs).find((entry) => entry.jobId === job.jobId)?.position ?? null;
  const actions = jobAffordances(job, context);
  const execution = slotData(model, "execution");
  const title = job.name || list(job.roomIds).map((roomId) => roomName(roomId, index, model)).join(", ");
  // The integration explains a start only where one is due (queued, or between phases).
  const unreleased = list(job.waiting?.job?.blockers).filter((blocker) => blocker.code === "room_not_released").flatMap((blocker) => blocker.roomIds);
  const releaseable = [...new Set(unreleased)].filter((roomId) => index.byId.has(roomId)).map((roomId) => ({ roomId, name: roomName(roomId, index, model), decision: roomAffordances(index.byId.get(roomId), context).release }));
  const trace = traceRows(slotData(model, "trace")?.records, { model, texts, limit: TRACE_LIMIT });

  // A change shown as the moment of creation is no change to the reader.
  const created = moment(texts, job.createdAt, config?.time_format, model.nowMs);
  const updated = job.updatedAt ? moment(texts, job.updatedAt, config?.time_format, model.nowMs) : null;
  return {
    key: "job-detail",
    jobId: job.jobId,
    title,
    state: job.state,
    stateLabel: jobStateLabel(texts, job.state),
    stateTone: stateTone(job.state),
    rooms: list(job.roomIds).map((roomId) => roomName(roomId, index, model)),
    mode: modeLabel(texts, job.mode),
    modeIcon: MODE_ICONS[job.mode] || "mdi:robot-vacuum",
    settings: settingChips(job, texts),
    position,
    outcome: isTerminalState(job.state) ? null : outcomeText(texts, job.failureCode),
    result: resultOf(job, { texts, config, model, actions }),
    afterCancel: job.state === "canceling" && job.afterCancel ? t(texts, `detail.afterCancel.${job.afterCancel}`) : null,
    waiting: waitingAxes(job, { job, model, texts, index, title }),
    progress: progressOf(job, { model, texts, timeFormat: "absolute" }),
    releaseable,
    execution: execution && explains(execution, job, texts)
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
    menuOpen: menu === `detail:${job.jobId}`,
    saveTrace: slotData(model, "trace")?.answer ? { action: "save-trace", args: { jobId: job.jobId } } : null,
    traceToggle: pane ? { action: "toggle", args: { key: `trace:${job.jobId}` } } : { action: "set-overlay", args: { traceOpen: overlay.traceOpen !== true } },
    facts: [
      { label: t(texts, "detail.created"), value: created },
      { label: t(texts, "detail.updated"), value: updated === created ? null : updated },
      { label: t(texts, "detail.origin"), value: originText(texts, job, model) },
      { label: t(texts, "detail.occasion"), value: job.reason },
      { label: t(texts, "field.note"), value: job.note },
      { label: t(texts, "detail.retryOf"), value: job.retriesJobId },
      { label: t(texts, "detail.jobId"), value: job.jobId },
    ],
    actions,
    saveAsTemplate: decide(context, { operation: "save_job_as_template", target: jobTarget(job.jobId) }),
  };
}

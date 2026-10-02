// The history view: every job the integration keeps, newest first, and the physical cleaning
// runs it recorded, including runs started outside it. A run's quality and failure are the
// integration's; an empty run is no proof of a completed job. See internal dev doc §8 "Verlauf".

import { list, roomIndex, roomName, slotData } from "../common/lookups.js";
import { duration, moment, operationLabel, outcomeText, pagination, t } from "../common/texts.js";
import { buildJobRow } from "./job-row.js";

export const HISTORY_SEGMENTS = Object.freeze(["jobs", "runs"]);

const RUN_ICONS = Object.freeze({ vacuum: "mdi:robot-vacuum", mop: "mdi:water-outline" });

export function historySegments(source) {
  return source === "jobs" || source === "runs" ? [source] : HISTORY_SEGMENTS;
}

export function activeSegment(source, ui) {
  const segments = historySegments(source);
  const chosen = ui?.choices?.["history:segment"];
  return segments.includes(chosen) ? chosen : segments[0];
}

function slotState(model, slot) {
  const data = slotData(model, slot);
  const status = model.slots?.[slot]?.status;
  return { data, loading: !data && (status === "loading" || status === "idle"), error: !data ? model.slots?.[slot]?.error ?? null : null };
}

function runRow(run, { model, texts, index, timeFormat }) {
  const start = run.observedStart;
  const end = run.observedEnd;
  const span = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
  return {
    key: run.runId,
    icon: run.source === "external" ? "mdi:hand-back-right-outline" : RUN_ICONS[run.operation] || "mdi:robot-vacuum",
    title: run.roomIds.length ? run.roomIds.map((roomId) => roomName(roomId, index, model)).join(", ") : t(texts, "run.unknownRooms"),
    operation: run.operation ? operationLabel(texts, run.operation) : t(texts, "run.unknownOperation"),
    source: t(texts, run.source === "external" ? "run.source.external" : "run.source.voi"),
    when: [start ?? end ? moment(texts, start ?? end, timeFormat, model.nowMs) : null, span !== null ? duration(texts, span) : end === null ? t(texts, "run.open") : null].filter(Boolean).join(" · "),
    quality: run.quality ? t(texts, `quality.${run.quality}`) : null,
    failure: run.failureCode ? outcomeText(texts, run.failureCode) : null,
    tone: run.failureCode ? "attention" : run.source === "external" ? "muted" : "neutral",
  };
}

export function buildHistoryView({ model, texts, context, options = {}, ui = {}, timeFormat = "auto" }) {
  const segments = historySegments(options.source);
  const segment = activeSegment(options.source, ui);
  const index = roomIndex(model);
  const shared = { model, texts, index, context, timeFormat };
  const view = { key: "history", segment, segments: segments.length > 1 ? segments.map((key) => ({ key, label: t(texts, `history.segment.${key}`), selected: key === segment })) : [] };
  if (segment === "jobs") {
    const { data, loading, error } = slotState(model, "jobLog");
    return { ...view, loading, error, jobs: list(data?.jobs).map((job) => buildJobRow(job, shared)), runs: [], pagination: pagination(data, texts), scope: "jobLog" };
  }
  const { data, loading, error } = slotState(model, "runs");
  return { ...view, loading, error, jobs: [], runs: list(data?.runs).map((run) => runRow(run, shared)), pagination: pagination(data, texts), scope: "runs" };
}

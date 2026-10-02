// One job as a row, shared by the queue, the attention list and the job log. Controls come
// from the affordance table; the readiness explanation is the integration's, ordered.

import { jobAffordances, jobTarget } from "../../domain/affordances.js";
import { isActiveState, isTerminalState } from "../../domain/job-schema.js";
import { readinessProblems } from "../../domain/readiness.js";
import { entityName, jobTitle, list, roomName } from "../common/lookups.js";
import { jobStateLabel, levelLabel, modeLabel, modeShortLabel, moment, number, outcomeText, readinessLabel, readinessReasonText, routeLabel, t } from "../common/texts.js";

export const MODE_ICONS = Object.freeze({ vacuum: "mdi:robot-vacuum", mop: "mdi:water-outline", vacuum_and_mop: "mdi:robot-vacuum-variant", vacuum_then_mop: "mdi:transfer-right" });

export function stateTone(state) {
  if (state === "needs_attention" || state === "failed") return "attention";
  if (isActiveState(state)) return "running";
  if (state === "completed") return "ready";
  if (isTerminalState(state)) return "muted";
  return "neutral";
}

const REQUIREMENT_STATE_KEY = Object.freeze({ blocked: "readiness.requirement.blocked", stale: "readiness.requirement.stale", unknown: "readiness.requirement.unknown" });

// The integration's explanation as sentences: unreleased rooms first, then each failing
// condition, then the job's own required-on/off entities.
export function readinessReasons(readiness, { index, model, texts }) {
  if (!readiness || readiness.state === "ready") return [];
  const reasons = [];
  if (readiness.blockedRoomIds.length) {
    reasons.push(t(texts, "readiness.notReleased", { rooms: readiness.blockedRoomIds.map((roomId) => roomName(roomId, index, model)).join(", ") }));
  }
  for (const item of readinessProblems(readiness)) {
    reasons.push(t(texts, REQUIREMENT_STATE_KEY[item.state] || REQUIREMENT_STATE_KEY.unknown, { entity: entityName(item.entityId, model) }));
  }
  for (const entityId of readiness.failedOn) reasons.push(t(texts, "readiness.requiredOn", { entity: entityName(entityId, model) }));
  for (const entityId of readiness.failedOff) reasons.push(t(texts, "readiness.requiredOff", { entity: entityName(entityId, model) }));
  for (const entityId of readiness.unknown) {
    if (!readiness.requirements.some((item) => item.entityId === entityId)) reasons.push(t(texts, "readiness.requirement.unknown", { entity: entityName(entityId, model) }));
  }
  if (!reasons.length) for (const code of readiness.reasonCodes) reasons.push(readinessReasonText(texts, code));
  return [...new Set(reasons)];
}

export function settingChips(job, texts) {
  const chips = [];
  if (Number.isInteger(job.passes) && job.passes > 1) chips.push({ key: "passes", text: t(texts, "job.passes", { count: number(texts, job.passes) }) });
  if (job.vacuumPower) chips.push({ key: "vacuumPower", icon: "mdi:fan", text: levelLabel(texts, job.vacuumPower) });
  if (job.mopIntensity) chips.push({ key: "mopIntensity", icon: "mdi:water", text: levelLabel(texts, job.mopIntensity) });
  if (job.mopRoute) chips.push({ key: "mopRoute", icon: "mdi:map-marker-path", text: routeLabel(texts, job.mopRoute) });
  if (job.settingsPolicy === "strict") chips.push({ key: "settingsPolicy", icon: "mdi:lock-outline", text: t(texts, "policy.strict") });
  return chips;
}

export function buildJobRow(job, { model, texts, index, context, total = 0, timeFormat = "auto" }) {
  const readiness = job.readiness;
  const reasons = readinessReasons(readiness, { index, model, texts });
  return {
    key: job.jobId,
    jobId: job.jobId,
    position: Number.isInteger(job.position) ? String(job.position) : "",
    title: jobTitle(job, index, model),
    rooms: list(job.roomIds).map((roomId) => roomName(roomId, index, model)).join(", "),
    showRooms: Boolean(job.name),
    mode: job.mode,
    modeIcon: MODE_ICONS[job.mode] || "mdi:robot-vacuum",
    modeLabel: modeLabel(texts, job.mode),
    modeShort: modeShortLabel(texts, job.mode),
    state: job.state,
    stateLabel: jobStateLabel(texts, job.state === "unknown" ? "unknown" : job.state),
    stateTone: stateTone(job.state),
    readiness: readiness ? { state: readiness.state, label: readinessLabel(texts, readiness.state), reasons, summary: reasons[0] || null, more: Math.max(0, reasons.length - 1) } : null,
    settings: settingChips(job, texts),
    source: job.source,
    time: moment(texts, job.updatedAt, timeFormat, model.nowMs),
    outcome: outcomeText(texts, job.failureCode),
    pending: list(model.pending).includes(jobTarget(job.jobId)),
    actions: jobAffordances(job, context, { position: Number.isInteger(job.position) ? job.position : null, total }),
  };
}

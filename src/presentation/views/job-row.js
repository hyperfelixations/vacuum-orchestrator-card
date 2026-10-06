// One job as a row, shared by the queue, the attention list and the job log. Controls come
// from the affordance table; the readiness explanation is the integration's, ordered.

import { jobAffordances, jobTarget } from "../../domain/affordances.js";
import { SETTING_FIELDS, isActiveState, isTerminalState } from "../../domain/job-schema.js";
import { readinessProblems } from "../../domain/readiness.js";
import { entityName, jobTitle, list, roomName, slotData } from "../common/lookups.js";
import { jobStateLabel, modeLabel, modeShortLabel, moment, number, outcomeText, readinessLabel, readinessReasonText, settingLabel, settingName, t } from "../common/texts.js";

export const SETTING_ICONS = Object.freeze({ vacuumPower: "mdi:fan", mopIntensity: "mdi:water", mopRoute: "mdi:map-marker-path" });
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

// Every job carries each setting its mode uses. A row names only those that differ from the
// integration's defaults (`defaults`); the detail page names all of them.
export function settingChips(job, texts, { defaults = null } = {}) {
  const chips = [];
  if (Number.isInteger(job.passes) && job.passes > 1) chips.push({ key: "passes", label: t(texts, "field.passes"), text: t(texts, "job.passes", { count: number(texts, job.passes) }) });
  for (const field of SETTING_FIELDS) {
    if (job[field] && job[field] !== defaults?.[field]) chips.push({ key: field, icon: SETTING_ICONS[field], label: settingName(texts, field), text: settingLabel(texts, field, job[field]) });
  }
  if (job.settingsPolicy === "strict") chips.push({ key: "settingsPolicy", icon: "mdi:lock-outline", text: t(texts, "policy.strict") });
  return chips;
}

// A name that already names every room says where the job cleans; any other name is followed
// by the rooms.
function nameNamesRooms(name, rooms, language) {
  const lower = name.toLocaleLowerCase(language);
  return rooms.every((room) => lower.includes(room.toLocaleLowerCase(language)));
}

export function buildJobRow(job, { model, texts, index, context, total = 0, timeFormat = "auto" }) {
  const readiness = job.readiness;
  const reasons = readinessReasons(readiness, { index, model, texts });
  const rooms = list(job.roomIds).map((roomId) => roomName(roomId, index, model));
  return {
    key: job.jobId,
    jobId: job.jobId,
    position: Number.isInteger(job.position) ? String(job.position) : "",
    title: jobTitle(job, index, model),
    rooms: rooms.join(", "),
    showRooms: Boolean(job.name) && !nameNamesRooms(job.name, rooms, texts?.language),
    mode: job.mode,
    modeIcon: MODE_ICONS[job.mode] || "mdi:robot-vacuum",
    modeLabel: modeLabel(texts, job.mode),
    modeShort: modeShortLabel(texts, job.mode),
    state: job.state,
    stateLabel: jobStateLabel(texts, job.state === "unknown" ? "unknown" : job.state),
    stateTone: stateTone(job.state),
    readiness: readiness ? { state: readiness.state, label: readinessLabel(texts, readiness.state), reasons, summary: reasons[0] || null, more: Math.max(0, reasons.length - 1) } : null,
    settings: settingChips(job, texts, { defaults: slotData(model, "queue")?.jobDefaults }),
    time: moment(texts, job.updatedAt, timeFormat, model.nowMs),
    outcome: outcomeText(texts, job.failureCode),
    pending: list(model.pending).includes(jobTarget(job.jobId)),
    actions: jobAffordances(job, context, { position: Number.isInteger(job.position) ? job.position : null, total }),
  };
}

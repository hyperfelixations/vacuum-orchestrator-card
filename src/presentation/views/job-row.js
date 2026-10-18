// One job as a row, shared by the queue, the attention list and the job log. Controls come
// from the affordance table; why a job waits is the integration's main reason, worded
// (`waiting.js`), and a started job shows its progress. See internal dev doc §8 "Queue".

import { jobAffordances, jobTarget, roomAffordances } from "../../domain/affordances.js";
import { SETTING_FIELDS, isActiveState, isTerminalState } from "../../domain/job-schema.js";
import { readinessProblems } from "../../domain/readiness.js";
import { entityName, jobTitle, list, robotName, roomName, slotData } from "../common/lookups.js";
import { clockTime, dateTime, jobStateLabel, modeLabel, modeShortLabel, moment, number, operationLabel, outcomeText, readinessReasonText, relative, settingLabel, settingName, t } from "../common/texts.js";
import { waitingStatus } from "./waiting.js";

export const SETTING_ICONS = Object.freeze({ vacuumPower: "mdi:fan", mopIntensity: "mdi:water-percent", mopRoute: "mdi:map-marker-path" });
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

function startedText(value, { model, texts, timeFormat }) {
  if (timeFormat === "time") return t(texts, "progress.startedAt", { when: clockTime(texts, value) });
  if (timeFormat === "absolute") return t(texts, "progress.startedOn", { when: dateTime(texts, value) });
  return t(texts, "progress.started", { when: relative(texts, value, model.nowMs) });
}

// What a started job is doing: operation, phase, robot and start, the robot's progress where it
// reports one (JOB-09), and the fault window while the job waits for a fix.
// `timeFormat`: how the start reads: a row says it relative or, with absolute times, as the time
// of day; the detail page absolute (UI-26). The
// operation is named only where the job has several phases; with one, its mode says it.
export function progressOf(job, { model, texts, timeFormat = "auto" }) {
  const progress = job.progress;
  if (!progress) return null;
  const phased = Number.isInteger(progress.phases) && progress.phases > 1;
  const phase = phased ? `${t(texts, "progress.phase", { phase: number(texts, progress.phase), phases: number(texts, progress.phases) })} · ${operationLabel(texts, progress.operation)}` : null;
  const line = [phase, progress.robotId ? robotName(progress.robotId, model) : null, progress.startedAt !== null ? startedText(progress.startedAt, { model, texts, timeFormat }) : t(texts, "progress.notStarted")].filter(Boolean).join(" · ");
  // With one phase the phase is the job: one bar. With several, each bar names what it measures.
  const bar = (key, value, labelKey) => (Number.isFinite(value) ? { key, label: t(texts, labelKey), value: Math.max(0, Math.min(100, value)), text: t(texts, "progress.percent", { value: number(texts, value) }) } : null);
  const bars = (phased ? [bar("phase", progress.phasePercent, "progress.phasePercent"), bar("total", progress.percent, "progress.totalPercent")] : [bar("total", progress.percent, "progress.totalPercent")]).filter(Boolean);
  const fault = progress.fault ? { text: t(texts, "progress.fault", { time: clockTime(texts, progress.fault.failsAt) }) } : null;
  return { line, bars, labelled: bars.length > 1, fault };
}

// The one action a row offers by its state (UI-06, QUE-08, JOB-08): release the rooms a waiting
// job waits for, delete it during its start delay, start it while it only waits for the queue;
// cancel a started job; create a finished one again.
function mainAction(job, actions, { context, index }) {
  const code = job.waiting?.code;
  if (job.state === "queued") {
    if (code === "start_delayed") return { key: "delete", decision: actions.delete };
    if (code === "room_not_released") {
      // One dialog releases every room the job waits for (REL-07); it is offered as far as each is.
      const roomIds = list(job.waiting.roomIds);
      const rooms = roomIds.map((roomId) => index.byId.get(roomId)).filter(Boolean);
      if (!rooms.length || rooms.length !== roomIds.length) return null;
      const decisions = rooms.map((room) => roomAffordances(room, context).release);
      return { key: "release", roomIds, decision: decisions.find((decision) => decision.state !== "enabled") ?? decisions[0] };
    }
    if (code === "queue_idle" || code === "queue_paused") return { key: "start", decision: actions.start };
    return null;
  }
  if (job.state === "dispatching" || job.state === "running") return { key: "cancel", decision: actions.cancel };
  if (isTerminalState(job.state)) return { key: "retry", decision: actions.retry };
  return null;
}

// `menu`: the key of the card's open menu, if any.
export function buildJobRow(job, { model, texts, index, context, timeFormat = "auto", menu = null }) {
  const rooms = list(job.roomIds).map((roomId) => roomName(roomId, index, model));
  const title = jobTitle(job, index, model);
  const actions = jobAffordances(job, context);
  const main = mainAction(job, actions, { context, index });
  const status = job.state === "queued" || (job.state === "dispatching" && !job.progress) ? waitingStatus(job, { job, model, texts, index, title, connected: context?.connected }) ?? { code: "starting", icon: "mdi:play-circle-outline", tone: "delay", text: t(texts, "waiting.startsNow") } : null;
  return {
    key: job.jobId,
    jobId: job.jobId,
    position: Number.isInteger(job.position) ? String(job.position) : "",
    title,
    rooms: rooms.join(", "),
    showRooms: Boolean(job.name) && !nameNamesRooms(job.name, rooms, texts?.language),
    mode: job.mode,
    modeIcon: MODE_ICONS[job.mode] || "mdi:robot-vacuum",
    modeLabel: modeLabel(texts, job.mode),
    modeShort: modeShortLabel(texts, job.mode),
    state: job.state,
    // A start the integration has not observed yet is still starting, whatever the job's state.
    stateLabel: jobStateLabel(texts, job.state === "running" && job.progress && job.progress.startedAt === null ? "dispatching" : job.state),
    stateTone: stateTone(job.state),
    // In the queue a waiting job and one cleaning as observed are named by their group; any
    // other state is named on the row.
    showState: job.state !== "queued" && !(job.state === "running" && job.progress?.startedAt !== null),
    status,
    progress: isActiveState(job.state) ? progressOf(job, { model, texts, timeFormat: timeFormat === "absolute" ? "time" : "relative" }) : null,
    settings: settingChips(job, texts, { defaults: slotData(model, "queue")?.jobDefaults }),
    time: moment(texts, job.updatedAt, timeFormat, model.nowMs),
    outcome: outcomeText(texts, job.failureCode),
    pending: list(model.pending).includes(jobTarget(job.jobId)),
    actions,
    main,
    menuOpen: menu === `job:${job.jobId}`,
  };
}

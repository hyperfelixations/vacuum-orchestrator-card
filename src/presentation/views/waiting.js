// Why a job waits, in words: the integration's main reason as a job's status and every reason of
// its three axes for the detail page (JOB-06, UI-06, UI-25). Which reasons apply, and in which
// order, is the integration's; the card words each code and names the rooms, robots and entities
// it is about. See internal dev doc §8 "Wartegrund".

import { entityName, list, robotName, roomName, robotsOf, roomsOf } from "../common/lookups.js";
import { reasonText, relative, t } from "../common/texts.js";

const JOB_CODES = new Set(["being_edited", "pending_confirmation", "room_disabled", "room_area_missing", "room_not_released", "requirement_not_satisfied", "requirement_unknown", "requirement_stale", "rooms_in_use"]);
const QUEUE_CODES = new Set(["queue_idle", "queue_paused", "queue_ending", "start_delayed"]);
const ENTITY_CODES = new Set(["requirement_not_satisfied", "requirement_unknown", "requirement_stale"]);

const ICONS = Object.freeze({
  being_edited: "mdi:pencil-lock-outline",
  pending_confirmation: "mdi:delete-clock-outline",
  room_disabled: "mdi:eye-off-outline",
  room_area_missing: "mdi:map-marker-question-outline",
  room_not_released: "mdi:lock-outline",
  requirement_not_satisfied: "mdi:door-closed-lock",
  requirement_unknown: "mdi:help-circle-outline",
  requirement_stale: "mdi:clock-alert-outline",
  rooms_in_use: "mdi:robot-vacuum",
  queue_idle: "mdi:check-circle-outline",
  queue_paused: "mdi:pause-circle-outline",
  queue_ending: "mdi:flag-checkered",
  start_delayed: "mdi:timer-sand",
});

// Robot reasons that need someone at the robot, not just time.
const ROBOT_ALERTS = new Set(["robot_fault", "robot_unavailable", "battery_low", "robot_needs_attention", "robot_state_unknown"]);

// The tone of a status line: `ready` the job starts once the queue runs, `delay` it starts by
// itself shortly, `edit` someone holds it, `blocked` the job itself cannot start, `waiting` it
// waits for a robot, `muted` it does not start in this run.
const TONES = Object.freeze({
  being_edited: "edit",
  pending_confirmation: "edit",
  queue_idle: "ready",
  queue_paused: "ready",
  queue_ending: "muted",
  start_delayed: "delay",
});

// The verb of an operation, for "Rocky cannot mop right now".
const OPERATION_OF_MODE = Object.freeze({ vacuum: "vacuum", mop: "mop", vacuum_and_mop: "vacuum_and_mop" });

const camel = (value) => String(value).replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

// A name that already names every room says where the job cleans; a reason about those rooms
// then leaves them out.
function namesRooms(title, rooms, language) {
  const lower = String(title || "").toLocaleLowerCase(language);
  return rooms.length > 0 && rooms.every((room) => lower.includes(room.toLocaleLowerCase(language)));
}

// The states an entity has to be in for this reason: the job's own on/off conditions, else the
// condition of the room, else the robot's.
function acceptedStates(entityId, { job, roomIds, robotId, model }) {
  if (list(job?.requiredOn).includes(entityId)) return ["on"];
  if (list(job?.requiredOff).includes(entityId)) return ["off"];
  const rooms = roomsOf(model).filter((room) => roomIds.includes(room.roomId));
  for (const room of rooms) {
    const requirement = room.requirements.find((item) => item.entityId === entityId);
    if (requirement) return requirement.acceptedStates;
  }
  const robot = robotsOf(model).find((item) => item.robotId === robotId);
  return robot?.configuration.requirements.find((item) => item.entityId === entityId)?.acceptedStates ?? [];
}

// A state as Home Assistant words it for this entity, else as reported.
function stateWord(reading, value) {
  return reading?.values?.[value] || value;
}

function entityPhrase(code, entityId, context) {
  const { model, texts } = context;
  const entity = entityName(entityId, model);
  if (code !== "requirement_not_satisfied") return t(texts, `waiting.${code}`, { entity });
  const reading = model.entityReadings?.[entityId] ?? null;
  const state = reading?.available ? reading.display || reading.state : null;
  const allowed = acceptedStates(entityId, context).map((value) => stateWord(reading, value)).join(", ");
  return t(texts, "waiting.requirement_not_satisfied", { entity, state, allowed });
}

// One reason in one sentence. `context`: { job, model, texts, index, title, robotId } — `robotId`
// for a reason one robot gives about itself.
export function blockerText(blocker, context) {
  const { job, model, texts, index } = context;
  const code = blocker.code;
  const roomIds = list(blocker.roomIds);
  const rooms = roomIds.map((roomId) => roomName(roomId, index, model));
  const robotIds = context.robotId ? [context.robotId] : list(blocker.robotIds);
  const robot = robotIds.length === 1 ? robotName(robotIds[0], model) : null;
  const scope = { ...context, roomIds, robotId: robotIds[0] ?? null };
  if (ENTITY_CODES.has(code)) {
    const phrases = list(blocker.entityIds).map((entityId) => entityPhrase(code, entityId, scope));
    if (phrases.length) return phrases.join(" · ");
  }
  const vars = {
    rooms: namesRooms(context.title, rooms, texts?.language) ? "" : rooms.join(", "),
    robot,
    count: robotIds.length,
    // The operation a robot lacks, else the job's.
    operation: t(texts, `operation.verb.${camel(code === "operation_unsupported" && blocker.detail ? blocker.detail : OPERATION_OF_MODE[job?.mode] ?? "clean")}`),
    when: blocker.until !== null && blocker.until !== undefined ? relative(texts, blocker.until, model.nowMs) : "",
  };
  const key = `waiting.${code}`;
  const text = t(texts, key, vars);
  // A code this card does not word yet reads in the integration's words.
  return text === key ? reasonText(texts, code) : text;
}

// The job's status line from the integration's main reason, or null when nothing holds it back.
// Robot reasons stand after "Job ready" while the job itself could start: the job and the robots
// are separate questions (UI-06). Without a connection no countdown runs.
export function waitingStatus(job, context) {
  const waiting = job?.waiting;
  if (!waiting) return null;
  const code = waiting.code;
  if (code === "start_delayed" && context.connected === false) {
    return { code, icon: "mdi:lan-disconnect", tone: "muted", text: t(context.texts, "waiting.disconnected"), until: null };
  }
  const text = blockerText(waiting, context);
  if (JOB_CODES.has(code)) return { code, icon: ICONS[code] ?? "mdi:lock-outline", tone: TONES[code] ?? "blocked", text, until: waiting.until };
  if (QUEUE_CODES.has(code)) return { code, icon: ICONS[code], tone: TONES[code], text, until: waiting.until };
  return { code, icon: ROBOT_ALERTS.has(code) ? "mdi:robot-vacuum-alert" : "mdi:robot-vacuum", tone: "waiting", text: t(context.texts, "waiting.jobReady", { reason: text }), until: waiting.until };
}

// Every reason of the three axes, for the detail page: the job's own, each robot's (capable robots
// with what holds them now, the others with why they never can) and the queue's.
export function waitingAxes(job, context) {
  const waiting = job?.waiting;
  if (!waiting) return null;
  const { model, texts } = context;
  const sentences = (blockers, extra = {}) => list(blockers).map((blocker, position) => ({ key: `${blocker.code}:${position}`, text: blockerText(blocker, { ...context, ...extra }) }));
  // On its axis the queue says what it does; the status line's "ready · …" would read as a promise.
  const queueSentences = (blockers) => list(blockers).map((blocker, position) => ({ key: `${blocker.code}:${position}`, text: t(texts, `waiting.queueAxis.${blocker.code}`, { when: blocker.until !== null ? relative(texts, blocker.until, model.nowMs) : "" }) }));
  const robots = waiting.robots;
  const robotItems = [];
  if (robots?.state === "no_robot_configured") robotItems.push({ key: "none", text: t(texts, "waiting.no_robot_configured") });
  for (const entry of list(robots?.candidates)) {
    const name = robotName(entry.robotId, model);
    const reasons = sentences(entry.blockers, { robotId: entry.robotId });
    robotItems.push({ key: `candidate:${entry.robotId}`, ready: reasons.length === 0, text: reasons.length ? reasons.map((item) => item.text).join(" · ") : t(texts, "waiting.robotReady", { robot: name }) });
  }
  for (const entry of list(robots?.unsuitable)) {
    robotItems.push({ key: `unsuitable:${entry.robotId}`, ready: false, never: true, text: sentences(entry.blockers, { robotId: entry.robotId }).map((item) => item.text).join(" · ") });
  }
  return {
    job: { ready: waiting.job?.ready === true, items: sentences(waiting.job?.blockers) },
    robots: { ready: robots?.state === "ready", items: robotItems },
    queue: waiting.queue ? { ready: waiting.queue.ready === true, items: queueSentences(waiting.queue.blockers) } : null,
  };
}

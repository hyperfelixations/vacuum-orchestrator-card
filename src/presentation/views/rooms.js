// The rooms view: per room the integration's due verdicts for vacuuming and mopping, its release,
// which robots reach it and its conditions. The bar position is the reported elapsed share of the
// reported interval; the card computes no due date. See internal dev doc §8 "Räume".

import { roomAffordances } from "../../domain/affordances.js";
import { DUE_OPERATIONS } from "../../domain/rooms.js";
import { entityName, jobTitle, list, robotName, robotsOf, roomIndex, roomsOf, slotData } from "../common/lookups.js";
import { dueReasonText, duration, moment, qualityLabel, remainingText, t } from "../common/texts.js";

const DUE_ICONS = Object.freeze({ vacuum: "mdi:robot-vacuum", mop: "mdi:water-outline" });

function dueLine(room, operation, { texts, model, timeFormat }) {
  const report = room.due[operation];
  const stamp = room.lastCleaning[operation];
  const known = report.elapsedSeconds !== null && report.remainingSeconds !== null && report.elapsedSeconds + report.remainingSeconds > 0;
  const share = report.state === "due" ? 1 : known ? report.elapsedSeconds / (report.elapsedSeconds + report.remainingSeconds) : null;
  let status;
  if (report.state === "disabled") status = t(texts, "rooms.due.disabled");
  else if (report.state === "due") status = report.reason === "never_cleaned" ? t(texts, "rooms.due.never") : report.dueAt !== null ? t(texts, "rooms.due.since", { when: moment(texts, report.dueAt, "relative", model.nowMs) }) : t(texts, "rooms.due.now");
  else if (report.state === "fresh") status = report.dueAt !== null ? t(texts, "rooms.due.at", { when: moment(texts, report.dueAt, "relative", model.nowMs) }) : report.remainingSeconds !== null ? t(texts, "rooms.due.inOccupied", { time: duration(texts, report.remainingSeconds * 1000) }) : t(texts, "rooms.due.fresh");
  else status = t(texts, "rooms.due.unknown");
  return {
    key: operation,
    icon: DUE_ICONS[operation],
    label: t(texts, `rooms.operation.${operation}`),
    state: report.state,
    status,
    reason: report.state === "unknown" ? dueReasonText(texts, report.reason) : null,
    share: share === null ? null : Math.max(0, Math.min(1, share)),
    // Only a recorded cleaning has a line; "never cleaned" is the status's to say.
    last: stamp ? t(texts, "rooms.last", { when: moment(texts, stamp.completedAt, timeFormat, model.nowMs) }) : null,
    quality: stamp?.quality ? qualityLabel(texts, stamp.quality) : null,
    qualityKey: stamp?.quality ?? null,
  };
}

const STARTED = new Set(["dispatching", "running"]);
// Reasons Home Assistant's assignment of map segments to areas can resolve.
const ASSIGNABLE = new Set(["area_not_mapped", "not_on_current_map"]);

// ROOM-09: why no robot reaches a room, per robot as the integration reports it, and the robot
// whose assignment in Home Assistant would resolve it.
function reachOf(room, robots, texts) {
  const verdicts = robots.map((robot) => ({ robot, item: list(robot.reach).find((entry) => entry.roomId === room.roomId) })).filter(({ item }) => item && item.status !== "reachable");
  const assignable = verdicts.find(({ robot, item }) => ASSIGNABLE.has(item.status) && robot.configuration?.entityId);
  return {
    reasons: verdicts.map(({ robot, item }) => t(texts, `reach.${item.status}`, { robot: robot.name })),
    assign: assignable ? { entityId: assignable.robot.configuration.entityId } : null,
  };
}

// What is happening to a room now (UI-07): a started job cleaning it, with its robot, and the
// queued jobs that wait for it.
function workOf(room, { texts, model }) {
  const started = list(slotData(model, "openJobs")?.jobs).filter((job) => STARTED.has(job.state) && list(job.roomIds).includes(room.roomId));
  const waiting = list(slotData(model, "queue")?.jobs).filter((job) => job.state === "queued" && list(job.roomIds).includes(room.roomId));
  return [
    ...started.map((job) => ({ key: "cleaning", tone: "running", text: job.progress?.robotId ? t(texts, "rooms.cleaning", { robot: robotName(job.progress.robotId, model) }) : t(texts, "rooms.cleaningNow") })),
    ...(waiting.length ? [{ key: "waiting", tone: "neutral", text: t(texts, "rooms.waiting", { count: waiting.length }) }] : []),
  ];
}

function releaseState(room, texts, model) {
  const release = room.release;
  if (!room.enabled) return { tone: "muted", icon: "mdi:eye-off-outline", label: t(texts, "rooms.excluded") };
  if (room.areaMissing) return { tone: "attention", icon: "mdi:map-marker-alert-outline", label: t(texts, "rooms.areaMissing") };
  // A release says what is left of it (UI-07); when it ends is the integration's to decide.
  if (room.released) return { tone: "ready", icon: "mdi:lock-open-variant-outline", label: releasedLabel(release, texts, model) };
  if (release?.reservedJobId && !release.consumed) {
    const job = list(slotData(model, "queue")?.jobs).find((entry) => entry.jobId === release.reservedJobId);
    return { tone: "running", icon: "mdi:lock-clock", label: job ? t(texts, "rooms.reservedFor", { job: jobTitle(job, roomIndex(model), model) }) : t(texts, "rooms.reserved") };
  }
  if (release?.consumed) return { tone: "neutral", icon: "mdi:lock-outline", label: t(texts, "rooms.consumed") };
  return { tone: "neutral", icon: "mdi:lock-outline", label: t(texts, "rooms.locked") };
}

function releasedLabel(release, texts, model) {
  if (release?.kind === "timed" && release.expiresAt !== null) return t(texts, "rooms.releasedLeft", { time: remainingText(texts, (release.expiresAt - model.nowMs) / 1000) });
  if (release?.kind === "once") return t(texts, "rooms.releasedOnce");
  if (release?.kind === "queue_run") return t(texts, "rooms.releasedRun");
  return t(texts, "rooms.released");
}

// The current state beside the accepted ones; whether the condition holds (including its maximum
// age) is the integration's verdict, reported per job as readiness.
function condition(requirement, model, texts) {
  const reading = model.entityReadings?.[requirement.entityId] ?? null;
  const name = entityName(requirement.entityId, model);
  const state = reading?.available ? reading.state : t(texts, "value.unknown");
  const allowed = requirement.acceptedStates.join(", ");
  return { key: requirement.entityId, name, state, allowed, text: t(texts, "rooms.condition", { entity: name, state, allowed }) };
}

const SORTERS = Object.freeze({
  configured: () => 0,
  name: (one, other) => one.name.localeCompare(other.name),
  due: (one, other) => dueRank(other) - dueRank(one) || one.name.localeCompare(other.name),
});

function dueRank(room) {
  return DUE_OPERATIONS.reduce((rank, operation) => rank + (room.due[operation].state === "due" ? 2 : room.due[operation].state === "unknown" ? 1 : 0), 0);
}

export function buildRoomsView({ model, texts, context, options = {}, ui = {}, timeFormat = "auto" }) {
  const rooms = roomsOf(model);
  const status = model.slots?.rooms?.status;
  const robots = robotsOf(model);
  const showExcluded = options.show_disabled === true || list(ui.expanded).includes("rooms:excluded");
  const visible = rooms.filter((room) => room.enabled || showExcluded).slice().sort(SORTERS[options.sort] || SORTERS.configured);
  return {
    key: "rooms",
    loading: !model.slots?.rooms?.data && (status === "loading" || status === "idle"),
    error: !model.slots?.rooms?.data ? model.slots?.rooms?.error ?? null : null,
    excludedCount: rooms.filter((room) => !room.enabled).length,
    showExcluded,
    rooms: visible.map((room) => {
      const reaching = robots.filter((robot) => Object.hasOwn(robot.capabilities?.targets || {}, room.roomId));
      return {
        key: room.roomId,
        roomId: room.roomId,
        name: room.name,
        icon: list(model.areas).find((area) => area.areaId === room.areaId)?.icon || "mdi:floor-plan",
        enabled: room.enabled,
        release: releaseState(room, texts, model),
        due: DUE_OPERATIONS.map((operation) => dueLine(room, operation, { texts, model, timeFormat })),
        // With one robot, naming it says nothing (UI-08).
        robots: robots.length > 1 ? reaching.map((robot) => robot.name) : [],
        unreachable: room.enabled && reaching.length === 0,
        reach: room.enabled && reaching.length === 0 ? reachOf(room, robots, texts) : null,
        conditions: room.requirements.map((requirement) => condition(requirement, model, texts)),
        work: workOf(room, { texts, model }),
        actions: roomAffordances(room, context),
      };
    }),
  };
}

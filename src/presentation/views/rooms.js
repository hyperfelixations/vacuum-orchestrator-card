// The rooms view: per room the integration's due verdicts for vacuuming and mopping, its release,
// which robots reach it and its conditions. The bar position is the reported elapsed share of the
// reported interval; the card computes no due date. See internal dev doc §8 "Räume".

import { decide, roomAffordances } from "../../domain/affordances.js";
import { DUE_OPERATIONS } from "../../domain/rooms.js";
import { entityName, jobTitle, list, robotName, robotsOf, roomIndex, roomsOf, slotData } from "../common/lookups.js";
import { moment, remainingText, spanText, t } from "../common/texts.js";

const DUE_ICONS = Object.freeze({ vacuum: "mdi:robot-vacuum", mop: "mdi:water-outline" });
// What a room's intervals count, named by an icon beside the time (DUE-01).
const BASIS = Object.freeze({ calendar: { icon: "mdi:calendar-clock", labelKey: "rooms.basis.calendar" }, occupied: { icon: "mdi:account-clock", labelKey: "rooms.basis.occupied" } });

// The integration's verdict in words (DUE-03, DUE-04): due in a time, due, overdue for a time, or
// never cleaned. A calendar due date counts down with the clock; occupied time with the reports.
function dueStatus(report, calendar, { texts, model }) {
  if (report.state === "disabled") return t(texts, "rooms.due.disabled");
  if (report.state === "unknown") return t(texts, "rooms.due.unknown");
  if (report.state === "due") {
    if (report.reason === "never_cleaned") return t(texts, "rooms.due.never");
    return report.overdue && report.overdueSeconds !== null ? t(texts, "rooms.due.overdue", { time: spanText(texts, report.overdueSeconds * 1000, { days: calendar }) }) : t(texts, "rooms.due.now");
  }
  const remaining = report.dueAt !== null ? Math.max(0, report.dueAt - model.nowMs) : report.remainingSeconds !== null ? report.remainingSeconds * 1000 : null;
  return remaining === null ? t(texts, "rooms.due.fresh") : t(texts, "rooms.due.in", { time: spanText(texts, remaining, { days: calendar }) });
}

function dueLine(room, operation, { texts, model, timeFormat }) {
  const report = room.due[operation];
  const stamp = room.lastCleaning[operation];
  const basis = BASIS[room.duePolicy.basis] ?? BASIS.calendar;
  const timed = report.state === "due" || report.state === "fresh";
  return {
    key: operation,
    icon: DUE_ICONS[operation],
    label: t(texts, `rooms.operation.${operation}`),
    state: report.state,
    overdue: report.overdue,
    status: dueStatus(report, room.duePolicy.basis !== "occupied", { texts, model }),
    basis: timed && report.reason !== "never_cleaned" ? { icon: basis.icon, label: t(texts, basis.labelKey) } : null,
    // Counted from what was surely observed: the time carries a mark that explains itself.
    partial: report.partial ? t(texts, "rooms.due.partial") : null,
    share: report.urgency === null ? (report.state === "due" ? 1 : null) : Math.max(0, Math.min(1, report.urgency)),
    // Only a recorded cleaning has a line; "never cleaned" is the status's to say.
    last: stamp ? t(texts, "rooms.last", { when: moment(texts, stamp.completedAt, timeFormat, model.nowMs) }) : null,
  };
}

// UI-08: a room without any due rule or recorded cleaning says so once, not per operation.
function dueLines(room, context) {
  const lines = DUE_OPERATIONS.map((operation) => dueLine(room, operation, context));
  if (!lines.every((line) => line.state === "disabled" && !line.last)) return lines;
  return [{ key: "none", icon: "mdi:calendar-blank-outline", state: "disabled", status: t(context.texts, "rooms.due.none"), last: null, none: true }];
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

// What is happening to a room now (UI-07): a started job cleaning it, with its robot; the robot
// that reports being in it; the jobs that wait for it, as the integration counts them.
function workOf(room, { texts, model }) {
  const started = list(slotData(model, "openJobs")?.jobs).filter((job) => STARTED.has(job.state) && list(job.roomIds).includes(room.roomId));
  const here = robotsOf(model).filter((robot) => robot.currentRoomId === room.roomId || started.some((job) => job.progress?.roomId === room.roomId && job.progress?.robotId === robot.robotId));
  const waiting = list(room.waitingJobIds).length;
  return [
    ...started.map((job) => ({ key: `cleaning:${job.jobId}`, kind: "cleaning", tone: "running", text: job.progress?.robotId ? t(texts, "rooms.cleaning", { robot: robotName(job.progress.robotId, model) }) : t(texts, "rooms.cleaningNow") })),
    ...here.map((robot) => ({ key: `here:${robot.robotId}`, kind: "here", tone: "running", text: t(texts, "rooms.robotHere", { robot: robot.name }) })),
    ...(waiting ? [{ key: "waiting", kind: "waiting", tone: "neutral", text: t(texts, "rooms.waiting", { count: waiting }) }] : []),
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
function condition(room, requirement, model, texts) {
  const reading = model.entityReadings?.[requirement.entityId] ?? null;
  const name = entityName(requirement.entityId, model);
  // In Home Assistant's own words where it words them (UI-04), else as reported.
  const state = reading?.available ? reading.display || reading.state : t(texts, "value.unknown");
  const allowed = requirement.acceptedStates.map((value) => reading?.values?.[value] || value).join(", ");
  const met = room.requirementStates?.[requirement.entityId] === "ready";
  return { key: requirement.entityId, met, text: met ? t(texts, "rooms.conditionMet", { entity: name, state }) : t(texts, "rooms.condition", { entity: name, state, allowed }) };
}

// A condition that holds asks nothing of a person: those that hold read as one line that names
// them when tapped; each one that fails stands on its own.
function conditionsOf(room, model, texts) {
  const items = room.requirements.map((requirement) => condition(room, requirement, model, texts));
  const met = items.filter((item) => item.met);
  return [
    ...items.filter((item) => !item.met),
    ...(met.length ? [{ key: "met", met: true, text: t(texts, "rooms.conditionsMet", { count: met.length }), explain: met.map((item) => item.text).join(" · ") }] : []),
  ];
}

// UI-32: the room's further actions in its menu.
function menuOf(room, actions) {
  const args = { roomId: room.roomId };
  return [
    { key: "createJob", action: "create-job", args: { roomIds: [room.roomId] }, iconName: "mdi:plus", labelKey: "action.createJob", decision: actions.createJob },
    { key: "edit", action: "edit-room", args, iconName: "mdi:pencil-outline", labelKey: "action.edit", decision: actions.edit },
    // UI-20: excluding is undone by including again; it is no destructive action.
    { key: "disable", action: "disable-room", args, iconName: "mdi:eye-off-outline", labelKey: "action.exclude", decision: actions.disable },
  ];
}

export function buildRoomsView({ model, texts, context, options = {}, ui = {}, timeFormat = "auto" }) {
  const rooms = roomsOf(model);
  const status = model.slots?.rooms?.status;
  const robots = robotsOf(model);
  const showExcluded = options.show_disabled === true || list(ui.expanded).includes("rooms:excluded");
  // In the integration's order (ROOM-13).
  const visible = rooms.filter((room) => room.enabled || showExcluded);
  // REL-04: two or more released rooms are locked in one step.
  const releasable = visible.filter((room) => room.enabled && room.released && roomAffordances(room, context).revoke.state === "enabled");
  return {
    key: "rooms",
    lockAll: releasable.length > 1 ? { roomIds: releasable.map((room) => room.roomId), text: t(texts, "rooms.releasedCount", { count: releasable.length }), decision: decide(context, { operation: "revoke_rooms", target: "revoke_rooms" }) } : null,
    loading: !model.slots?.rooms?.data && (status === "loading" || status === "idle"),
    error: !model.slots?.rooms?.data ? model.slots?.rooms?.error ?? null : null,
    excludedCount: rooms.filter((room) => !room.enabled).length,
    showExcluded,
    rooms: visible.map((room) => {
      const reaching = robots.filter((robot) => Object.hasOwn(robot.capabilities?.targets || {}, room.roomId));
      const actions = roomAffordances(room, context);
      return {
        key: room.roomId,
        roomId: room.roomId,
        name: room.name,
        icon: list(model.areas).find((area) => area.areaId === room.areaId)?.icon || "mdi:floor-plan",
        enabled: room.enabled,
        release: releaseState(room, texts, model),
        due: dueLines(room, { texts, model, timeFormat }),
        // With one robot, naming it says nothing (UI-08).
        robots: robots.length > 1 ? reaching.map((robot) => robot.name) : [],
        unreachable: room.enabled && reaching.length === 0,
        reach: room.enabled && reaching.length === 0 ? reachOf(room, robots, texts) : null,
        conditions: conditionsOf(room, model, texts),
        work: workOf(room, { texts, model }),
        actions,
        menu: menuOf(room, actions),
        menuOpen: ui.menu === `room:${room.roomId}`,
      };
    }),
  };
}

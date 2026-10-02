// The rooms view: per room the integration's due verdicts for vacuuming and mopping, its release,
// which robots reach it and its conditions. The bar position is the reported elapsed share of the
// reported interval; the card computes no due date. See internal dev doc §8 "Räume".

import { roomAffordances } from "../../domain/affordances.js";
import { DUE_OPERATIONS } from "../../domain/rooms.js";
import { entityName, list, robotsOf, roomsOf } from "../common/lookups.js";
import { dueReasonText, duration, moment, qualityLabel, releaseKindLabel, t } from "../common/texts.js";

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
    last: stamp ? t(texts, "rooms.last", { when: moment(texts, stamp.completedAt, timeFormat, model.nowMs) }) : t(texts, "rooms.lastNever"),
    quality: stamp?.quality ? qualityLabel(texts, stamp.quality) : null,
    qualityKey: stamp?.quality ?? null,
  };
}

function releaseState(room, texts, model) {
  const release = room.release;
  if (!room.enabled) return { tone: "muted", icon: "mdi:eye-off-outline", label: t(texts, "rooms.excluded") };
  if (room.areaMissing) return { tone: "attention", icon: "mdi:map-marker-alert-outline", label: t(texts, "rooms.areaMissing") };
  if (room.released) {
    const until = release?.kind === "timed" && release.expiresAt !== null ? t(texts, "rooms.releasedUntil", { when: moment(texts, release.expiresAt, "relative", model.nowMs) }) : release ? releaseKindLabel(texts, release.kind) : null;
    return { tone: "ready", icon: "mdi:lock-open-variant-outline", label: until ? t(texts, "rooms.releasedKind", { kind: until }) : t(texts, "rooms.released") };
  }
  if (release?.reservedJobId && !release.consumed) return { tone: "running", icon: "mdi:lock-clock", label: t(texts, "rooms.reserved") };
  if (release?.consumed) return { tone: "neutral", icon: "mdi:lock-outline", label: t(texts, "rooms.consumed") };
  return { tone: "neutral", icon: "mdi:lock-outline", label: t(texts, "rooms.locked") };
}

// The current state beside the accepted ones; whether the condition holds (including its maximum
// age) is the integration's verdict, reported per job as readiness.
function condition(requirement, model, texts) {
  const reading = model.entityReadings?.[requirement.entityId] ?? null;
  return {
    key: requirement.entityId,
    name: entityName(requirement.entityId, model),
    state: reading?.available ? reading.state : t(texts, "value.unknown"),
    allowed: requirement.acceptedStates.join(", "),
  };
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
        robots: reaching.map((robot) => robot.name),
        unreachable: room.enabled && reaching.length === 0,
        conditions: room.requirements.map((requirement) => condition(requirement, model, texts)),
        actions: roomAffordances(room, context),
      };
    }),
  };
}

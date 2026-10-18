// Room dialogs: releasing a room, its settings, and adding a room. Field rules follow the
// integration's room schema; the integration answers every save. See internal dev doc §8 "Räume".

import { CREATE_TARGET, decide, roomAffordances, roomTarget } from "../../domain/affordances.js";
import { RELEASE_KINDS } from "../../domain/job-schema.js";
import { entityName, findJob, list, robotsOf, roomIndex, roomsOf } from "../common/lookups.js";
import { releaseKindLabel, t } from "../common/texts.js";
import { entityField, field, pageErrors } from "./editor-fields.js";
import { intervalParts, splitList } from "../../domain/room-draft.js";
import { readinessBeyondRooms } from "../../domain/readiness.js";
import { readinessReasons } from "../views/job-row.js";

const KIND_ICONS = Object.freeze({ permanent: "mdi:lock-open-variant-outline", once: "mdi:numeric-1-circle-outline", timed: "mdi:timer-outline", queue_run: "mdi:playlist-play" });
const camel = (value) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

// A due interval as days and hours beside each other; the integration's error stands below both.
function intervalField(texts, draft, key, labelKey, error, hintKey = null) {
  const value = intervalParts(draft[key]);
  return {
    ...field(texts, { key, labelKey, control: "duration", value: draft[key], error: error(key), hintKey, optional: true }),
    parts: [
      { key: `${key}:days`, label: t(texts, "room.days"), value: value.days },
      { key: `${key}:hours`, label: t(texts, "room.hours"), value: value.hours, max: 23 },
    ],
  };
}

function roomOf(model, roomId) {
  return roomsOf(model).find((room) => room.roomId === roomId) || null;
}

// Quick choices for a timed release, in minutes (REL-06).
export const RELEASE_QUICK_MINUTES = Object.freeze([30, 60, 120, 240]);

function quickLabel(texts, minutes) {
  return minutes < 60 ? t(texts, "release.quickMinutes", { value: minutes }) : t(texts, "release.quickHours", { value: minutes / 60 });
}

function releaseRow(texts, model, row, index, { error, removable }) {
  const room = roomOf(model, row.roomId);
  const kind = row.kind || "queue_run";
  const key = (name) => `release:${index}:${name}`;
  const hours = Number(row.hours ?? 2);
  const minutes = Number(row.minutes ?? 0);
  const total = hours * 60 + minutes;
  return {
    index,
    roomId: row.roomId,
    name: room?.name || t(texts, "release.missingRoom"),
    missing: !room,
    removable,
    current: room?.release ? releaseKindLabel(texts, room.release.kind) : null,
    error: error(key("room")),
    // Among several rooms the row's heading names the room; its kind is named "Release <room>".
    kind: field(texts, { key: key("kind"), labelKey: removable ? "release.title" : "release.kind", labelVars: removable ? { room: room?.name || row.roomId } : undefined, control: "segmented", value: kind, options: RELEASE_KINDS.map((value) => ({ value, label: releaseKindLabel(texts, value), icon: KIND_ICONS[value] })), hint: t(texts, `release.explain.${camel(kind)}`), error: error(key("kind")) }),
    duration:
      kind === "timed"
        ? {
            quick: field(texts, { key: key("quick"), labelKey: "release.quick", control: "segmented", value: RELEASE_QUICK_MINUTES.includes(total) ? total : null, options: RELEASE_QUICK_MINUTES.map((value) => ({ value, label: quickLabel(texts, value), icon: "mdi:timer-outline" })) }),
            hours: field(texts, { key: key("hours"), labelKey: "release.hours", control: "text", inputType: "number", min: 0, step: 1, value: hours }),
            minutes: field(texts, { key: key("minutes"), labelKey: "release.minutes", control: "text", inputType: "number", min: 0, max: 59, step: 5, value: minutes, error: error(key("duration")) }),
          }
        : null,
  };
}

// REL-04, REL-08: one row per room with its own kind; rooms join or leave before the one command.
export function buildRelease({ model, texts, context, overlay }) {
  const { error, invalid } = pageErrors(texts, overlay);
  const listed = list(overlay.rooms);
  const rows = listed.map((row, index) => releaseRow(texts, model, row, index, { error, removable: listed.length > 1 }));
  const single = rows.length === 1 ? roomOf(model, rows[0].roomId) : null;
  const taken = new Set(rows.map((row) => row.roomId));
  const addable = roomsOf(model)
    .filter((room) => !taken.has(room.roomId) && roomAffordances(room, context).release.state === "enabled")
    .map((room) => ({ roomId: room.roomId, name: room.name }));
  // Opened from a job: what it still waits for once these rooms are released (plan V5).
  const job = overlay.jobId ? findJob(model, overlay.jobId) : null;
  const afterwards = job ? readinessReasons(readinessBeyondRooms(job.readiness, [...taken]), { index: roomIndex(model), model, texts }) : [];
  return {
    key: "release",
    afterwards,
    title: rows.length === 1 ? t(texts, "release.title", { room: rows[0].name }) : t(texts, "release.titleMany"),
    missing: rows.length === 0 || rows.every((row) => row.missing),
    rows,
    addable,
    invalid,
    submit: single ? roomAffordances(single, context).release : decide(context, { operation: "release_rooms" }),
    revoke: single ? roomAffordances(single, context).revoke : null,
  };
}

function requirementRows(texts, model, draft, error) {
  return draft.requirements.map((item, index) => ({
    key: `${index}:${item.entityId}`,
    index,
    name: entityName(item.entityId, model),
    entityId: item.entityId,
    accepted: field(texts, { key: `requirements.${index}.acceptedStates`, labelKey: "room.acceptedStates", control: "text", value: item.acceptedStates, hintKey: "room.acceptedStatesHint" }),
    maxAge: field(texts, { key: `requirements.${index}.maxAgeMinutes`, labelKey: "room.maxAge", control: "text", inputType: "number", min: 0, step: 1, value: item.maxAgeMinutes ?? "", optional: true }),
    current: model.entityReadings?.[item.entityId]?.state ?? null,
    error: error(`requirements.${index}`),
  }));
}

// ROOM-08: an own binding picks the robot's map and its segments by name, as the integration
// reports them; a robot without a reported map keeps the ids as text.
function bindingRows(texts, model, draft, error) {
  const robots = robotsOf(model);
  return draft.bindings.map((item, index) => {
    const maps = list(robots.find((robot) => robot.robotId === item.robotId)?.maps).filter((map) => map.segments.length);
    const chosen = maps.find((map) => map.mapId === item.mapId) ?? maps.find((map) => map.current) ?? null;
    const mapKey = `bindings.${index}.mapId`;
    const targetsKey = `bindings.${index}.targetIds`;
    return {
      key: `${index}:${item.robotId}`,
      index,
      robot: field(texts, { key: `bindings.${index}.robotId`, labelKey: "room.bindingRobot", control: "segmented", value: item.robotId, options: robots.map((robot) => ({ value: robot.robotId, label: robot.name })) }),
      mapId: maps.length
        ? field(texts, { key: mapKey, labelKey: "room.bindingMap", control: "segmented", value: item.mapId ?? "", options: [{ value: "", label: t(texts, "room.bindingCurrentMap") }, ...maps.map((map) => ({ value: map.mapId, label: map.name || map.mapId }))] })
        : field(texts, { key: mapKey, labelKey: "room.bindingMapId", control: "text", value: item.mapId, optional: true }),
      targets: chosen
        ? field(texts, { key: targetsKey, labelKey: "room.bindingSegments", control: "chips", value: splitList(item.targetIds), options: chosen.segments.map((segment) => ({ value: segment.id, label: segment.name || segment.id })) })
        : field(texts, { key: targetsKey, labelKey: "room.bindingTargets", control: "text", value: item.targetIds, hintKey: "room.bindingTargetsHint" }),
      error: error(`bindings.${index}`),
    };
  });
}

export function buildRoomEditor({ model, texts, context, overlay }) {
  const draft = overlay.draft;
  const room = roomOf(model, draft.meta.roomId);
  const { error, invalid } = pageErrors(texts, overlay);
  const occupied = draft.basis === "occupied";
  const queries = overlay.queries || {};
  const actions = room ? roomAffordances(room, context) : null;
  const detected = robotsOf(model)
    .filter((robot) => robot.capabilities?.targets?.[draft.meta.roomId])
    .map((robot) => ({ key: robot.robotId, text: t(texts, "room.detectedTarget", { robot: robot.name, targets: robot.capabilities.targets[draft.meta.roomId].join(", ") }) }));
  return {
    key: "room-editor",
    roomId: draft.meta.roomId,
    title: t(texts, "room.title", { room: room?.name || draft.name }),
    groups: [
      {
        key: "room",
        title: t(texts, "room.group.room"),
        fields: [
          field(texts, { key: "name", labelKey: "room.name", control: "text", value: draft.name, error: error("name") }),
          ...(room?.areaId ? [field(texts, { key: "followAreaName", labelKey: "room.followAreaName", control: "switch", value: draft.followAreaName, switchLabel: t(texts, "room.followAreaNameSwitch"), error: error("followAreaName") })] : []),
          field(texts, { key: "enabled", labelKey: "room.enabled", control: "switch", value: draft.enabled, switchLabel: t(texts, "room.enabledSwitch"), hintKey: "room.enabledHint", error: error("enabled") }),
        ],
      },
      {
        key: "due",
        title: t(texts, "room.group.due"),
        fields: [
          field(texts, { key: "basis", labelKey: "room.basis", control: "segmented", value: draft.basis, options: ["calendar", "occupied"].map((value) => ({ value, label: t(texts, `room.basis.${value}`) })), hintKey: `room.basisHint.${draft.basis}`, error: error("basis") }),
          intervalField(texts, draft, "vacuumHours", "room.vacuumEvery", error, "room.intervalHint"),
          intervalField(texts, draft, "mopHours", "room.mopEvery", error),
          ...(occupied
            ? [
                entityField(texts, model, { key: "occupancyEntityId", labelKey: "room.occupancyEntity", value: draft.occupancyEntityId ? [draft.occupancyEntityId] : [], query: queries.occupancyEntityId, domains: ["binary_sensor", "input_boolean", "sensor", "switch"], error: error("occupancyEntityId"), optional: false }),
                field(texts, { key: "occupiedState", labelKey: "room.occupiedState", control: "text", value: draft.occupiedState, error: error("occupiedState") }),
                field(texts, { key: "unoccupiedState", labelKey: "room.unoccupiedState", control: "text", value: draft.unoccupiedState, error: error("unoccupiedState") }),
              ]
            : []),
        ],
      },
    ],
    requirements: requirementRows(texts, model, draft, error),
    requirementSearch: entityField(texts, model, { key: "requirementsAdd", labelKey: "room.addCondition", value: [], query: queries.requirementsAdd, hintKey: "room.conditionsHint" }),
    bindings: bindingRows(texts, model, draft, error),
    bindingsOpen: overlay.bindingsOpen === true || draft.bindings.length > 0,
    robots: robotsOf(model).map((robot) => ({ robotId: robot.robotId, name: robot.name })),
    detected,
    invalid,
    save: decide(context, { operation: "update_room", target: roomTarget(draft.meta.roomId) }),
    disable: actions?.disable ?? null,
  };
}

export function buildRoomCreate({ model, texts, context, overlay }) {
  const linked = new Set(roomsOf(model).map((room) => room.areaId).filter(Boolean));
  const areas = list(model.areas).filter((area) => !linked.has(area.areaId));
  const { error, invalid } = pageErrors(texts, overlay);
  return {
    key: "room-create",
    title: t(texts, "room.createTitle"),
    fields: [
      field(texts, { key: "overlay:name", labelKey: "room.name", control: "text", value: overlay.name ?? "", error: error("overlay:name") }),
      field(texts, { key: "overlay:areaId", labelKey: "room.area", control: "segmented", value: overlay.areaId ?? null, options: [{ value: null, label: t(texts, "room.noArea") }, ...areas.map((area) => ({ value: area.areaId, label: area.name }))], hintKey: "room.areaHint", error: error("overlay:areaId") }),
    ],
    invalid,
    save: decide(context, { operation: "create_room", target: CREATE_TARGET }),
  };
}

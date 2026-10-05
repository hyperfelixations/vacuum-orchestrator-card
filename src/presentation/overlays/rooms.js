// Room dialogs: releasing a room, its settings, and adding a room. Field rules follow the
// integration's room schema; the integration answers every save. See internal dev doc §8 "Räume".

import { CREATE_TARGET, decide, roomAffordances, roomTarget } from "../../domain/affordances.js";
import { RELEASE_KINDS } from "../../domain/job-schema.js";
import { validateRoomDraft } from "../../domain/room-draft.js";
import { entityName, list, robotsOf, roomsOf } from "../common/lookups.js";
import { releaseKindLabel, t } from "../common/texts.js";
import { entityField, errorText, field } from "./editor-fields.js";

const KIND_ICONS = Object.freeze({ permanent: "mdi:lock-open-variant-outline", once: "mdi:numeric-1-circle-outline", timed: "mdi:timer-outline", queue_run: "mdi:playlist-play" });
const camel = (value) => value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());

function roomOf(model, roomId) {
  return roomsOf(model).find((room) => room.roomId === roomId) || null;
}

export function buildRelease({ model, texts, context, overlay }) {
  const room = roomOf(model, overlay.roomId);
  const kind = overlay.releaseKind || "queue_run";
  const hours = Number(overlay.hours ?? 2);
  const minutes = Number(overlay.minutes ?? 0);
  const durationValid = Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && minutes >= 0 && hours * 60 + minutes > 0;
  const actions = room ? roomAffordances(room, context) : null;
  return {
    key: "release",
    roomId: overlay.roomId,
    title: t(texts, "release.title", { room: room?.name || overlay.roomId }),
    missing: !room,
    fields: [
      field(texts, { key: "overlay:releaseKind", labelKey: "release.kind", control: "segmented", value: kind, options: RELEASE_KINDS.map((value) => ({ value, label: releaseKindLabel(texts, value), icon: KIND_ICONS[value] })), hint: t(texts, `release.explain.${camel(kind)}`) }),
      ...(kind === "timed"
        ? [
            field(texts, { key: "overlay:hours", labelKey: "release.hours", control: "text", inputType: "number", min: 0, step: 1, value: overlay.hours ?? 2 }),
            field(texts, { key: "overlay:minutes", labelKey: "release.minutes", control: "text", inputType: "number", min: 0, max: 59, step: 5, value: overlay.minutes ?? 0, error: durationValid || !overlay.submitted ? null : t(texts, "validation.release_duration_mismatch") }),
          ]
        : []),
    ],
    current: room?.release ? releaseKindLabel(texts, room.release.kind) : null,
    durationValid: kind !== "timed" || durationValid,
    submit: actions?.release ?? decide(context, { operation: "release_room" }),
    revoke: actions?.revoke ?? null,
  };
}

function requirementRows(texts, model, draft, errors) {
  return draft.requirements.map((item, index) => ({
    key: `${index}:${item.entityId}`,
    index,
    name: entityName(item.entityId, model),
    entityId: item.entityId,
    accepted: field(texts, { key: `requirements.${index}.acceptedStates`, labelKey: "room.acceptedStates", control: "text", value: item.acceptedStates, hintKey: "room.acceptedStatesHint" }),
    maxAge: field(texts, { key: `requirements.${index}.maxAgeMinutes`, labelKey: "room.maxAge", control: "text", inputType: "number", min: 0, step: 1, value: item.maxAgeMinutes ?? "", optional: true }),
    current: model.entityReadings?.[item.entityId]?.state ?? null,
    error: errorText(texts, errors[`requirements.${index}`]),
  }));
}

function bindingRows(texts, model, draft, errors) {
  const robots = robotsOf(model);
  return draft.bindings.map((item, index) => ({
    key: `${index}:${item.robotId}`,
    index,
    robot: field(texts, { key: `bindings.${index}.robotId`, labelKey: "room.bindingRobot", control: "segmented", value: item.robotId, options: robots.map((robot) => ({ value: robot.robotId, label: robot.name })) }),
    mapId: field(texts, { key: `bindings.${index}.mapId`, labelKey: "room.bindingMap", control: "text", value: item.mapId, optional: true }),
    targets: field(texts, { key: `bindings.${index}.targetIds`, labelKey: "room.bindingTargets", control: "text", value: item.targetIds, hintKey: "room.bindingTargetsHint" }),
    error: errorText(texts, errors[`bindings.${index}`]),
  }));
}

export function buildRoomEditor({ model, texts, context, overlay }) {
  const draft = overlay.draft;
  const room = roomOf(model, draft.meta.roomId);
  const validation = validateRoomDraft(draft);
  const errors = overlay.submitted ? validation.errors : {};
  const error = (key) => errorText(texts, errors[key]);
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
          ...(room?.areaId ? [field(texts, { key: "followAreaName", labelKey: "room.followAreaName", control: "switch", value: draft.followAreaName, switchLabel: t(texts, "room.followAreaNameSwitch") })] : []),
          field(texts, { key: "enabled", labelKey: "room.enabled", control: "switch", value: draft.enabled, switchLabel: t(texts, "room.enabledSwitch"), hintKey: "room.enabledHint" }),
        ],
      },
      {
        key: "due",
        title: t(texts, "room.group.due"),
        fields: [
          field(texts, { key: "basis", labelKey: "room.basis", control: "segmented", value: draft.basis, options: ["calendar", "occupied"].map((value) => ({ value, label: t(texts, `room.basis.${value}`) })), hintKey: `room.basisHint.${draft.basis}` }),
          field(texts, { key: "vacuumHours", labelKey: "room.vacuumHours", control: "text", inputType: "number", min: 0, step: 1, value: draft.vacuumHours ?? "", error: error("vacuumHours"), hintKey: "room.intervalHint", optional: true }),
          field(texts, { key: "mopHours", labelKey: "room.mopHours", control: "text", inputType: "number", min: 0, step: 1, value: draft.mopHours ?? "", error: error("mopHours"), optional: true }),
          ...(occupied
            ? [
                entityField(texts, model, { key: "occupancyEntityId", labelKey: "room.occupancyEntity", value: draft.occupancyEntityId ? [draft.occupancyEntityId] : [], query: queries.occupancyEntityId, domains: ["binary_sensor", "input_boolean", "sensor", "switch"], error: error("occupancyEntityId"), optional: false }),
                field(texts, { key: "occupiedState", labelKey: "room.occupiedState", control: "text", value: draft.occupiedState, error: error("occupancyStates") }),
                field(texts, { key: "unoccupiedState", labelKey: "room.unoccupiedState", control: "text", value: draft.unoccupiedState }),
              ]
            : []),
        ],
      },
    ],
    requirements: requirementRows(texts, model, draft, errors),
    requirementSearch: entityField(texts, model, { key: "requirementsAdd", labelKey: "room.addCondition", value: [], query: queries.requirementsAdd, hintKey: "room.conditionsHint" }),
    bindings: bindingRows(texts, model, draft, errors),
    bindingsOpen: overlay.bindingsOpen === true || draft.bindings.length > 0,
    robots: robotsOf(model).map((robot) => ({ robotId: robot.robotId, name: robot.name })),
    detected,
    dirty: validation.dirty,
    invalid: Boolean(overlay.submitted) && !validation.valid,
    save: decide(context, { operation: "update_room", target: roomTarget(draft.meta.roomId) }),
    disable: actions?.disable ?? null,
  };
}

export function buildRoomCreate({ model, texts, context, overlay }) {
  const linked = new Set(roomsOf(model).map((room) => room.areaId).filter(Boolean));
  const areas = list(model.areas).filter((area) => !linked.has(area.areaId));
  const name = String(overlay.name ?? "").trim();
  return {
    key: "room-create",
    title: t(texts, "room.createTitle"),
    fields: [
      field(texts, { key: "overlay:name", labelKey: "room.name", control: "text", value: overlay.name ?? "", error: overlay.submitted && !name ? t(texts, "validation.room_name_required") : null }),
      field(texts, { key: "overlay:areaId", labelKey: "room.area", control: "segmented", value: overlay.areaId ?? null, options: [{ value: null, label: t(texts, "room.noArea") }, ...areas.map((area) => ({ value: area.areaId, label: area.name }))], hintKey: "room.areaHint" }),
    ],
    save: decide(context, { operation: "create_room", target: CREATE_TARGET }),
  };
}

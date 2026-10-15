// Robot profiles and discovery candidates as the integration reports them. `active` is a lease,
// not reachability; capabilities, room reach, maps, activity and faults are the integration's.
// The card never infers executability from an entity. See internal dev doc §7 "Robotermodell".

import { normalizeActions } from "./availability.js";
import { ROBOT_OPTION_MAPS, ROBOT_TIMEOUT_FIELDS, SETTING_FIELDS, SETTING_WIRE_NAMES, isFaultSource, isNameSource, isOperation, isReachStatus, isRobotPhase, isRobotRole, isSettingValue } from "./job-schema.js";
import { normalizeRequirement } from "./rooms.js";
import { settingField } from "./settings.js";
import { bool, enumerated, finite, integer, isRecord, records, stringMap, strings, text, unknownFields } from "./wire-values.js";

const ROBOT_FIELDS = new Set([
  "robot_id",
  "name",
  "name_source",
  "ha_name",
  "configuration",
  "reach",
  "map_image_entity_id",
  "maps",
  "maps_unavailable_reason",
  "active",
  "activity",
  "faults",
  "actions",
  "blocked_reason",
  "capabilities",
]);

// `roles.<role>: null` is an explicit opt-out and stays distinguishable from an absent role.
function roles(wire) {
  if (!isRecord(wire)) return Object.freeze({});
  const result = {};
  for (const [role, reference] of Object.entries(wire)) {
    if (!isRobotRole(role)) continue;
    if (reference === null) result[role] = null;
    else if (text(reference)) result[role] = text(reference);
  }
  return Object.freeze(result);
}

// Per setting the rungs the robot offers, lowest first, as the integration orders them.
function settings(wire) {
  const value = isRecord(wire) ? wire : {};
  return Object.freeze(Object.fromEntries(SETTING_FIELDS.map((field) => [field, Object.freeze(strings(value[SETTING_WIRE_NAMES[field]]).filter((rung) => isSettingValue(field, rung)))])));
}

function capabilities(wire) {
  if (!isRecord(wire)) return null;
  const supports = isRecord(wire.supports) ? wire.supports : {};
  const targets = {};
  if (isRecord(wire.targets)) {
    for (const [roomId, ids] of Object.entries(wire.targets)) {
      const list = strings(ids);
      if (text(roomId) && list.length) targets[roomId] = list;
    }
  }
  return Object.freeze({
    revision: text(wire.revision),
    operations: Object.freeze(strings(wire.operations).filter(isOperation)),
    targets: Object.freeze(targets),
    mapContext: text(wire.map_context),
    maximumPasses: integer(wire.maximum_passes),
    settings: settings(wire.settings),
    unavailableSettings: Object.freeze(strings(wire.unavailable_settings).map(settingField).filter(Boolean)),
    supports: Object.freeze({
      stop: supports.stop === true,
      returnToDock: supports.return_to_dock === true,
      pause: supports.pause === true,
    }),
  });
}

// The stored profile in camelCase for display, plus the untouched wire object: a
// reconfiguration starts from exactly what the integration returned (`configure_robot`).
function configuration(wire) {
  const value = isRecord(wire) ? wire : {};
  const timeouts = {};
  for (const field of Object.keys(ROBOT_TIMEOUT_FIELDS)) timeouts[field] = finite(value[field]);
  const optionMaps = {};
  for (const field of Object.keys(ROBOT_OPTION_MAPS)) optionMaps[field] = stringMap(value[field]);
  return Object.freeze({
    // The name set in the integration; null follows Home Assistant's name.
    name: text(value.name),
    entityId: text(value.robot_entity_id),
    registryId: text(value.robot_registry_id),
    adapter: text(value.adapter),
    sourceRobotId: text(value.source_robot_id),
    physicalRobotId: text(value.physical_robot_id),
    roles: roles(value.roles),
    requirements: Object.freeze(records(value.requirements).map(normalizeRequirement).filter(Boolean)),
    targetAreas: strings(value.target_areas),
    allowedOperations: Object.freeze(strings(value.allowed_operations).filter(isOperation)),
    enabled: value.enabled !== false,
    protocol: text(value.protocol),
    fixedMode: isOperation(value.fixed_mode) ? value.fixed_mode : null,
    preference: integer(value.preference),
    minimumBattery: integer(value.minimum_battery),
    optionMaps: Object.freeze(optionMaps),
    timeouts: Object.freeze(timeouts),
    wire: Object.freeze(plainCopy(value)),
  });
}

function plainCopy(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

// Whether the robot reaches a room, and if not why (`status`); `targets` are its map segments.
function reach(wire) {
  const roomId = text(wire.room_id);
  if (!roomId || !isReachStatus(wire.status)) return null;
  return Object.freeze({ roomId, status: wire.status, targets: strings(wire.targets), ignored: strings(wire.ignored) });
}

function map(wire) {
  const mapId = text(wire.map_id);
  if (!mapId) return null;
  const segments = records(wire.segments)
    .map((segment) => (text(segment.id) ? Object.freeze({ id: text(segment.id), name: text(segment.name) }) : null))
    .filter(Boolean);
  return Object.freeze({ mapId, name: text(wire.name), current: wire.current === true, imageEntityId: text(wire.image_entity_id), segments: Object.freeze(segments) });
}

function fault(wire) {
  const code = text(wire.code);
  if (!code) return null;
  return Object.freeze({
    code,
    source: enumerated(wire.source, isFaultSource),
    operations: Object.freeze(strings(wire.operations).filter(isOperation)),
    entityId: text(wire.entity_id),
    // False for a state the user chose, such as a detached mop: it only blocks.
    needsAction: wire.needs_action !== false,
  });
}

function activity(wire) {
  const value = isRecord(wire) ? wire : {};
  return Object.freeze({ phase: enumerated(value.phase, isRobotPhase) ?? "unknown", external: value.external === true });
}

export function normalizeRobot(wire) {
  if (!isRecord(wire)) return null;
  const robotId = text(wire.robot_id);
  if (!robotId) return null;
  return Object.freeze({
    robotId,
    name: text(wire.name) ?? robotId,
    nameSource: enumerated(wire.name_source, isNameSource),
    haName: text(wire.ha_name),
    configuration: configuration(wire.configuration),
    reach: Object.freeze(records(wire.reach).map(reach).filter(Boolean)),
    mapImageEntityId: text(wire.map_image_entity_id),
    maps: Object.freeze(records(wire.maps).map(map).filter(Boolean)),
    mapsUnavailableReason: text(wire.maps_unavailable_reason),
    active: bool(wire.active) === true,
    activity: activity(wire.activity),
    faults: Object.freeze(records(wire.faults).map(fault).filter(Boolean)),
    actions: normalizeActions(wire.actions),
    blockedReason: text(wire.blocked_reason),
    capabilities: capabilities(wire.capabilities),
    unknownFields: unknownFields(wire, ROBOT_FIELDS),
  });
}

export function normalizeCandidate(wire) {
  if (!isRecord(wire)) return null;
  const registryId = text(wire.registry_id);
  const entityId = text(wire.entity_id);
  if (!registryId || !entityId) return null;
  const ambiguous = Array.isArray(wire.ambiguous_roles) ? strings(wire.ambiguous_roles) : strings(Object.keys(isRecord(wire.ambiguous_roles) ? wire.ambiguous_roles : {}));
  return Object.freeze({
    registryId,
    entityId,
    name: text(wire.name) ?? entityId,
    adapter: text(wire.adapter),
    roles: roles(wire.roles),
    ambiguousRoles: Object.freeze(ambiguous.filter(isRobotRole)),
    protocol: text(wire.protocol),
  });
}

// The rooms a profile reaches, as the integration reports its reach.
export function reachableRoomIds(robot) {
  return Object.freeze((robot?.reach || []).filter((item) => item.status === "reachable").map((item) => item.roomId));
}

// The rooms some profile reaches.
export function coveredRoomIds(robots) {
  return new Set((robots || []).flatMap(reachableRoomIds));
}

// Whether a candidate is already a configured profile, by stable registry identity.
export function isConfiguredCandidate(candidate, robots) {
  return (robots || []).some((robot) => robot.configuration.registryId === candidate.registryId);
}

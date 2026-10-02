// Robot profiles and discovery candidates as the integration reports them. `active` is a lease,
// not reachability; capabilities are the integration's resolved profile. The card never infers
// executability from an entity. See internal dev doc §7 "Robotermodell".

import { ROBOT_OPTION_MAPS, ROBOT_TIMEOUT_FIELDS, isMopRoute, isOperation, isRobotRole, isSemanticLevel } from "./job-schema.js";
import { normalizeRequirement } from "./rooms.js";
import { bool, finite, integer, isRecord, records, stringMap, strings, text, unknownFields } from "./wire-values.js";

const ROBOT_FIELDS = new Set(["robot_id", "name", "configuration", "active", "blocked_reason", "capabilities"]);

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

function capabilities(wire) {
  if (!isRecord(wire)) return null;
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
    vacuumLevels: Object.freeze(strings(wire.vacuum_levels).filter(isSemanticLevel)),
    waterLevels: Object.freeze(strings(wire.water_levels).filter(isSemanticLevel)),
    mopRoutes: Object.freeze(strings(wire.mop_routes).filter(isMopRoute)),
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

export function normalizeRobot(wire) {
  if (!isRecord(wire)) return null;
  const robotId = text(wire.robot_id);
  if (!robotId) return null;
  return Object.freeze({
    robotId,
    name: text(wire.name) ?? robotId,
    configuration: configuration(wire.configuration),
    active: bool(wire.active) === true,
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

// The rooms a profile reaches: keys of its capability target map.
export function reachableRoomIds(robot) {
  return Object.freeze(Object.keys(robot?.capabilities?.targets || {}));
}

// Whether a candidate is already a configured profile, by stable registry identity.
export function isConfiguredCandidate(candidate, robots) {
  return (robots || []).some((robot) => robot.configuration.registryId === candidate.registryId);
}

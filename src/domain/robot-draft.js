// The robot profile draft. `configure_robot` takes a complete, validated definition: the draft
// starts from the stored configuration exactly as `get_robots` returned it and changes only the
// fields the user edits. The integration checks every input (`validate`); `robotFieldOf` places
// its errors. See internal dev doc §7 "Roboterentwurf".

import { OPERATIONS, ROBOT_OPTION_MAPS, ROBOT_ROLES, ROBOT_TIMEOUT_FIELDS, isOperation } from "./job-schema.js";
import { splitList } from "./room-draft.js";

const UNSAFE = new Set(["__proto__", "constructor", "prototype", "meta"]);

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

// Role modes: "auto" (absent: discovery decides), "off" (explicit null), "entity" (a reference).
// `roleEntities` names the entity id behind a stored registry reference.
function roleDraft(roles, role, roleEntities) {
  if (!Object.hasOwn(roles, role)) return { mode: "auto", entity: null };
  return roles[role] === null ? { mode: "off", entity: null } : { mode: "entity", entity: roleEntities[role] || roles[role] };
}

export function createRobotDraft(robot, { roleEntities = {} } = {}) {
  const wire = robot.configuration.wire;
  const roles = wire.roles && typeof wire.roles === "object" ? wire.roles : {};
  const values = {
    enabled: wire.enabled !== false,
    allowedOperations: Array.isArray(wire.allowed_operations) ? wire.allowed_operations.filter(isOperation) : [...OPERATIONS],
    fixedMode: isOperation(wire.fixed_mode) ? wire.fixed_mode : null,
    preference: Number.isInteger(wire.preference) ? wire.preference : 0,
    minimumBattery: Number.isInteger(wire.minimum_battery) ? wire.minimum_battery : null,
    // UI-18: following Home Assistant's area assignments or only some areas, chosen explicitly.
    areaScope: Array.isArray(wire.target_areas) && wire.target_areas.length ? "only" : "follow",
    targetAreas: Array.isArray(wire.target_areas) ? [...wire.target_areas] : [],
    protocol: wire.protocol ?? null,
    physicalRobotId: wire.physical_robot_id ?? null,
    roles: Object.fromEntries(ROBOT_ROLES.map((role) => [role, roleDraft(roles, role, roleEntities)])),
    // A limit the integration does not report stays empty: its check names what is missing.
    timeouts: Object.fromEntries(ROBOT_TIMEOUT_FIELDS.map((field) => [field, Number.isFinite(wire[field]) ? wire[field] : ""])),
    optionMaps: Object.fromEntries(Object.keys(ROBOT_OPTION_MAPS).map((field) => [field, { ...(wire[field] && typeof wire[field] === "object" ? wire[field] : {}) }])),
    requirements: (Array.isArray(wire.requirements) ? wire.requirements : []).map((item) => ({
      entityId: item.entity_id,
      acceptedStates: (item.accepted_states || ["on"]).join(", "),
      maxAgeMinutes: Number.isFinite(item.max_age_seconds) ? item.max_age_seconds / 60 : null,
      operation: item.operation ?? null,
      entityRegistryId: item.entity_registry_id ?? null,
    })),
  };
  return freeze({ ...copy(values), meta: { robotId: robot.robotId, adapter: robot.configuration.adapter, wire: copy(wire), baseline: copy(values) } });
}

// `path`: a field or a nested path such as `roles.battery.mode` or `optionMaps.mode_options.vacuum`.
export function updateRobotDraft(draft, path, value) {
  const parts = String(path).split(".");
  if (parts.some((part) => UNSAFE.has(part)) || !(parts[0] in draft)) return draft;
  const { meta, ...values } = draft;
  const next = copy(values);
  let cursor = next;
  for (const part of parts.slice(0, -1)) {
    if (cursor[part] === undefined || cursor[part] === null || typeof cursor[part] !== "object") return draft;
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = copy(value);
  return freeze({ ...next, meta: copy(meta) });
}

export function isRobotDirty(draft) {
  const { meta, ...values } = draft;
  return JSON.stringify(values) !== JSON.stringify(meta.baseline);
}

// The draft field each part of the `configure_robot` configuration fills.
const ROBOT_FIELDS = Object.freeze({
  enabled: "enabled",
  allowed_operations: "allowedOperations",
  fixed_mode: "fixedMode",
  preference: "preference",
  minimum_battery: "minimumBattery",
  target_areas: "targetAreas",
  protocol: "protocol",
  physical_robot_id: "physicalRobotId",
});

// The editor field an error of `configure_robot` names (`configuration.preference`,
// `configuration.roles.battery`, `configuration.requirements.0.entity_id`); null for the input or
// a list as a whole and for a part the editor does not show.
export function robotFieldOf(path) {
  const [root, part, child] = String(path).split(".");
  if (root !== "configuration") return null;
  if (ROBOT_TIMEOUT_FIELDS.includes(part)) return `timeouts.${part}`;
  if (Object.hasOwn(ROBOT_OPTION_MAPS, part)) return `optionMaps.${part}`;
  if (part === "roles") return ROBOT_ROLES.includes(child) ? `roles.${child}` : null;
  if (part === "requirements") return /^\d+$/.test(child ?? "") ? `requirements.${child}` : null;
  return ROBOT_FIELDS[part] ?? null;
}

// The complete definition `configure_robot` expects: the stored configuration with the edited
// fields replaced. The role map is replaced as a whole; an automatic role is left out of it.
export function robotDraftToConfiguration(draft) {
  const configuration = copy(draft.meta.wire);
  configuration.enabled = draft.enabled;
  configuration.allowed_operations = [...draft.allowedOperations];
  configuration.fixed_mode = draft.fixedMode;
  configuration.preference = Number(draft.preference);
  configuration.minimum_battery = draft.minimumBattery === null || draft.minimumBattery === "" ? null : Number(draft.minimumBattery);
  // Following Home Assistant, or no area chosen, is no restriction: the integration stores null.
  configuration.target_areas = draft.areaScope === "only" && draft.targetAreas.length ? [...draft.targetAreas] : null;
  configuration.protocol = draft.protocol;
  if (draft.physicalRobotId) configuration.physical_robot_id = String(draft.physicalRobotId).trim();
  else delete configuration.physical_robot_id;
  const roles = {};
  for (const [role, entry] of Object.entries(draft.roles)) {
    if (entry.mode === "off") roles[role] = null;
    else if (entry.mode === "entity" && entry.entity) roles[role] = entry.entity;
  }
  configuration.roles = roles;
  for (const [field, value] of Object.entries(draft.timeouts)) configuration[field] = Number(value);
  for (const [field, entries] of Object.entries(draft.optionMaps)) {
    configuration[field] = Object.fromEntries(Object.entries(entries).map(([key, value]) => [String(key).trim(), String(value ?? "").trim()]).filter(([key, value]) => key && value));
  }
  configuration.requirements = draft.requirements.map((item) => {
    const wire = { entity_id: item.entityId, accepted_states: splitList(item.acceptedStates) };
    if (item.maxAgeMinutes !== null && item.maxAgeMinutes !== "" && item.maxAgeMinutes !== undefined) wire.max_age_seconds = Number(item.maxAgeMinutes) * 60;
    if (item.operation) wire.operation = item.operation;
    if (item.entityRegistryId) wire.entity_registry_id = item.entityRegistryId;
    return wire;
  });
  return Object.freeze(configuration);
}

// The robot profile draft. `configure_robot` takes a complete, validated definition: the draft
// starts from the stored configuration exactly as `get_robots` returned it and changes only the
// fields the user edits. Validation mirrors `configuration.py`. See internal dev doc §7
// "Roboterentwurf".

import { OPERATIONS, ROBOT_OPTION_MAPS, ROBOT_PREFERENCE_RANGE, ROBOT_ROLES, ROBOT_TIMEOUT_FIELDS, isOperation } from "./job-schema.js";
import { splitList } from "./room-draft.js";

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const TIMEOUT_MAX = 86400;
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
    targetAreas: Array.isArray(wire.target_areas) ? [...wire.target_areas] : [],
    protocol: wire.protocol ?? null,
    physicalRobotId: wire.physical_robot_id ?? null,
    roles: Object.fromEntries(ROBOT_ROLES.map((role) => [role, roleDraft(roles, role, roleEntities)])),
    timeouts: Object.fromEntries(Object.entries(ROBOT_TIMEOUT_FIELDS).map(([field, fallback]) => [field, Number.isFinite(wire[field]) ? wire[field] : fallback])),
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

export function validateRobotDraft(draft) {
  const errors = {};
  const fail = (field, code) => {
    if (!(field in errors)) errors[field] = code;
  };
  if (!draft.allowedOperations.length) fail("allowedOperations", "empty_allowed_operations");
  if (draft.fixedMode !== null && !isOperation(draft.fixedMode)) fail("fixedMode", "invalid_operation");
  const preference = Number(draft.preference);
  if (!Number.isInteger(preference) || preference < ROBOT_PREFERENCE_RANGE.min || preference > ROBOT_PREFERENCE_RANGE.max) fail("preference", "invalid_robot_preference");
  if (draft.minimumBattery !== null && draft.minimumBattery !== "") {
    const minimum = Number(draft.minimumBattery);
    if (!Number.isInteger(minimum) || minimum < 0 || minimum > 100) fail("minimumBattery", "invalid_minimum_battery");
  }
  for (const [field, value] of Object.entries(draft.timeouts)) {
    const number = Number(value);
    if (!(number > 0)) fail(`timeouts.${field}`, "invalid_duration");
    else if (number > TIMEOUT_MAX) fail(`timeouts.${field}`, "timeout_out_of_range");
  }
  for (const [role, entry] of Object.entries(draft.roles)) {
    if (entry.mode === "entity" && !entry.entity) fail(`roles.${role}`, "invalid_role_entity");
  }
  // An empty value means "not mapped" and is left out when saving.
  for (const [field, entries] of Object.entries(draft.optionMaps)) {
    const mapped = Object.entries(entries).filter(([, value]) => String(value ?? "").trim());
    const allowed = ROBOT_OPTION_MAPS[field];
    if (mapped.some(([key]) => !String(key).trim() || (allowed && !allowed.includes(key)))) fail(`optionMaps.${field}`, "invalid_option_mapping");
    if (field === "mode_options") {
      const values = mapped.map(([, value]) => String(value).trim());
      if (new Set(values).size !== values.length) fail(`optionMaps.${field}`, "ambiguous_mode_mapping");
    }
  }
  draft.requirements.forEach((item, index) => {
    const states = splitList(item.acceptedStates);
    if (!ENTITY_ID.test(item.entityId || "")) fail(`requirements.${index}`, "invalid_entity_id");
    else if (states.length < 1 || states.length > 20) fail(`requirements.${index}`, "accepted_states_count");
  });
  const { meta, ...values } = draft;
  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors), dirty: JSON.stringify(values) !== JSON.stringify(meta.baseline) });
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
  configuration.target_areas = [...draft.targetAreas];
  configuration.protocol = draft.protocol;
  configuration.physical_robot_id = draft.physicalRobotId ? String(draft.physicalRobotId).trim() : null;
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

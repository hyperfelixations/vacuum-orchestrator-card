// The room settings draft and the `update_room` patch it produces. Validation mirrors the
// integration's room schema (`room_configuration.py`, `domain/due.py`): positive intervals, an
// occupancy sensor for occupied time, distinct occupied and free states, at most 100 conditions
// and bindings, 1–20 accepted states, 1–100 targets. See internal dev doc §7 "Raumentwurf".

import { ACCEPTED_STATES_MAX, LIST_LIMIT, isDueBasis, isOperation } from "./job-schema.js";

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const TARGETS_MAX = 100;

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

export function splitList(text) {
  return String(text ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function requirementDraft(requirement) {
  return {
    entityId: requirement.entityId,
    acceptedStates: requirement.acceptedStates.join(", "),
    maxAgeMinutes: requirement.maxAgeSeconds === null ? null : requirement.maxAgeSeconds / 60,
    robotId: requirement.robotId,
    operation: requirement.operation,
    entityRegistryId: requirement.entityRegistryId,
  };
}

function bindingDraft(binding) {
  return { robotId: binding.robotId, mapId: binding.mapId ?? "", targetIds: binding.targetIds.join(", ") };
}

// Interval values are edited in hours; null switches the due calculation off.
export function createRoomDraft(room) {
  const policy = room.duePolicy;
  const values = {
    name: room.name,
    followAreaName: room.followAreaName,
    enabled: room.enabled,
    basis: policy.basis,
    vacuumHours: policy.vacuumSeconds === null ? null : policy.vacuumSeconds / 3600,
    mopHours: policy.mopSeconds === null ? null : policy.mopSeconds / 3600,
    occupancyEntityId: policy.occupancyEntityId,
    occupiedState: policy.occupiedState ?? "on",
    unoccupiedState: policy.unoccupiedState ?? "off",
    requirements: room.requirements.map(requirementDraft),
    bindings: room.bindings.map(bindingDraft),
  };
  return freeze({ ...copy(values), meta: { roomId: room.roomId, baseline: copy(values) } });
}

const UNSAFE = new Set(["__proto__", "constructor", "prototype", "meta"]);

// `path` is a field name or a list entry path such as `requirements.0.acceptedStates`.
export function updateRoomDraft(draft, path, value) {
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
  // Renaming stops following the area name, as the integration does for a new name.
  if (path === "name" && next.name !== meta.baseline.name) next.followAreaName = false;
  return freeze({ ...next, meta: copy(meta) });
}

function same(one, other) {
  return JSON.stringify(one) === JSON.stringify(other);
}

function requirementWire(item) {
  const wire = { entity_id: item.entityId, accepted_states: splitList(item.acceptedStates) };
  if (item.maxAgeMinutes !== null && item.maxAgeMinutes !== undefined && item.maxAgeMinutes !== "") wire.max_age_seconds = Number(item.maxAgeMinutes) * 60;
  if (item.robotId) wire.robot_id = item.robotId;
  if (item.operation) wire.operation = item.operation;
  // The stored registry binding of an existing condition travels back unchanged.
  if (item.entityRegistryId) wire.entity_registry_id = item.entityRegistryId;
  return wire;
}

function bindingWire(item) {
  const wire = { robot_id: item.robotId, target_ids: splitList(item.targetIds) };
  if (String(item.mapId ?? "").trim()) wire.map_id = String(item.mapId).trim();
  return wire;
}

export function validateRoomDraft(draft) {
  const errors = {};
  const fail = (field, code) => {
    if (!(field in errors)) errors[field] = code;
  };
  if (!String(draft.name ?? "").trim()) fail("name", "room_name_required");
  if (!isDueBasis(draft.basis)) fail("basis", "invalid_room_configuration");
  for (const field of ["vacuumHours", "mopHours"]) {
    const value = draft[field];
    if (value !== null && value !== undefined && value !== "" && !(Number(value) > 0)) fail(field, "interval_positive");
  }
  if (draft.basis === "occupied" && !draft.occupancyEntityId) fail("occupancyEntityId", "occupancy_source_required");
  if (draft.occupancyEntityId && !ENTITY_ID.test(draft.occupancyEntityId)) fail("occupancyEntityId", "invalid_entity_id");
  const occupied = String(draft.occupiedState ?? "").trim();
  const free = String(draft.unoccupiedState ?? "").trim();
  if (!occupied || !free || occupied === free || [occupied, free].some((state) => state === "unknown" || state === "unavailable")) fail("occupancyStates", "invalid_occupancy_states");
  if (draft.requirements.length > LIST_LIMIT) fail("requirements", "invalid_requirements");
  draft.requirements.forEach((item, index) => {
    const states = splitList(item.acceptedStates);
    if (!ENTITY_ID.test(item.entityId || "")) fail(`requirements.${index}`, "invalid_entity_id");
    else if (states.length < 1 || states.length > ACCEPTED_STATES_MAX) fail(`requirements.${index}`, "accepted_states_count");
    else if (item.maxAgeMinutes !== null && item.maxAgeMinutes !== undefined && item.maxAgeMinutes !== "" && !(Number(item.maxAgeMinutes) > 0)) fail(`requirements.${index}`, "interval_positive");
    else if (item.operation && !isOperation(item.operation)) fail(`requirements.${index}`, "invalid_operation");
  });
  if (draft.bindings.length > LIST_LIMIT) fail("bindings", "invalid_room_targets");
  const keys = new Set();
  draft.bindings.forEach((item, index) => {
    const targets = splitList(item.targetIds);
    const key = `${item.robotId}|${String(item.mapId ?? "").trim()}`;
    if (!item.robotId) fail(`bindings.${index}`, "unknown_robot");
    else if (targets.length < 1 || targets.length > TARGETS_MAX || new Set(targets).size !== targets.length) fail(`bindings.${index}`, "invalid_room_targets");
    else if (keys.has(key)) fail(`bindings.${index}`, "duplicate_room_binding");
    keys.add(key);
  });
  const { meta, ...values } = draft;
  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors), dirty: !same(values, meta.baseline) });
}

const hoursToSeconds = (value) => (value === null || value === undefined || value === "" ? null : Number(value) * 3600);

// Only changed parts travel; `bindings` and `requirements` replace their whole list and
// `due_policy` merges field by field on the integration's side.
export function roomDraftToPatch(draft) {
  const base = draft.meta.baseline;
  const patch = {};
  const name = String(draft.name ?? "").trim();
  if (name !== base.name) patch.name = name;
  // A new name without an explicit choice stops following the area name (integration default).
  if (draft.followAreaName !== base.followAreaName) patch.follow_area_name = draft.followAreaName;
  if (draft.enabled !== base.enabled) patch.enabled = draft.enabled;
  const due = {};
  if (draft.basis !== base.basis) due.basis = draft.basis;
  if (hoursToSeconds(draft.vacuumHours) !== hoursToSeconds(base.vacuumHours)) due.vacuum_seconds = hoursToSeconds(draft.vacuumHours);
  if (hoursToSeconds(draft.mopHours) !== hoursToSeconds(base.mopHours)) due.mop_seconds = hoursToSeconds(draft.mopHours);
  if ((draft.occupancyEntityId || null) !== (base.occupancyEntityId || null)) due.occupancy_entity_id = draft.occupancyEntityId || null;
  if (String(draft.occupiedState).trim() !== base.occupiedState) due.occupied_state = String(draft.occupiedState).trim();
  if (String(draft.unoccupiedState).trim() !== base.unoccupiedState) due.unoccupied_state = String(draft.unoccupiedState).trim();
  if (Object.keys(due).length) patch.due_policy = due;
  if (!same(draft.requirements, base.requirements)) patch.requirements = draft.requirements.map(requirementWire);
  if (!same(draft.bindings, base.bindings)) patch.bindings = draft.bindings.map(bindingWire);
  return Object.freeze(patch);
}

export function newRequirement(entityId) {
  return { entityId, acceptedStates: "on", maxAgeMinutes: null, robotId: null, operation: null, entityRegistryId: null };
}

export function newBinding(robotId) {
  return { robotId, mapId: "", targetIds: "" };
}

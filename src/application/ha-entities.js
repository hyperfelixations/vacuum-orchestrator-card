// Read-only views of Home Assistant entities the integration names: its own summary sensors,
// and the vacuum and role entities of each robot profile. Values are displayed as Home
// Assistant reports them; nothing here decides what a robot can do.
// See internal dev doc §7 "Home-Assistant-Entitäten".

import { ROBOT_ROLES } from "../domain/job-schema.js";

const PLATFORM = "vacuum_orchestrator";
const SUMMARY_KEYS = Object.freeze({ queue_mode: "queueMode", queue_length: "queueLength", active_jobs: "activeJobs", attention_jobs: "attentionJobs", needs_attention: "needsAttention" });
const UNUSABLE = new Set(["unknown", "unavailable"]);

export function indexRegistry(entries) {
  const byId = new Map();
  const byEntityId = new Map();
  for (const entry of entries || []) {
    byId.set(entry.id, entry);
    byEntityId.set(entry.entityId, entry);
  }
  return Object.freeze({ byId, byEntityId, entries: entries || [] });
}

function usableState(states, entityId) {
  const state = entityId ? states?.[entityId] : null;
  if (!state || typeof state.state !== "string" || UNUSABLE.has(state.state)) return null;
  return state;
}

// The integration's summary sensors, identified by unique id, never by entity id.
export function summaryFrom(registry, states) {
  const result = { available: false, queueMode: null, queueLength: null, activeJobs: null, attentionJobs: null, needsAttention: null };
  for (const entry of registry?.entries || []) {
    if (entry.platform !== PLATFORM || entry.disabled || !entry.uniqueId) continue;
    const key = SUMMARY_KEYS[entry.uniqueId.replace(/^vacuum_orchestrator_/, "")];
    const state = key ? usableState(states, entry.entityId) : null;
    if (!state) continue;
    result.available = true;
    if (key === "queueMode") result.queueMode = state.state;
    else if (key === "needsAttention") result.needsAttention = state.state === "on";
    else {
      const value = Number(state.state);
      result[key] = Number.isInteger(value) ? value : null;
    }
  }
  return Object.freeze(result);
}

// A role reference is a registry id; an entity id is accepted as well.
export function resolveEntityId(reference, registry) {
  if (!reference) return null;
  const entry = registry?.byId?.get(reference);
  if (entry) return entry.disabled ? null : entry.entityId;
  return registry?.byEntityId?.has(reference) || /^[a-z0-9_]+\.[a-z0-9_]+$/.test(reference) ? reference : null;
}

// Home Assistant's own rendering of a state (translated, with unit) when the frontend offers it.
function displayed(format, state) {
  if (typeof format !== "function") return null;
  try {
    const text = format(state);
    return typeof text === "string" && text ? text : null;
  } catch {
    return null;
  }
}

function reading(states, entityId, format) {
  if (!entityId) return null;
  const state = states?.[entityId];
  if (!state) return Object.freeze({ entityId, state: null, display: null, available: false, unit: null, friendlyName: null, picture: null });
  // Copies of single values only: Home Assistant's state objects are never retained or frozen.
  return Object.freeze({
    entityId,
    state: typeof state.state === "string" ? state.state : null,
    display: displayed(format, state),
    available: !UNUSABLE.has(state.state),
    unit: typeof state.attributes?.unit_of_measurement === "string" ? state.attributes.unit_of_measurement : null,
    friendlyName: typeof state.attributes?.friendly_name === "string" ? state.attributes.friendly_name : null,
    picture: typeof state.attributes?.entity_picture === "string" ? state.attributes.entity_picture : null,
  });
}

// The entity the integration uses for a role: the profile's own reference, else the one its
// discovery found for the vacuum; an explicit null switches the role off.
export function roleReference(robot, candidate, role) {
  const configured = robot?.configuration?.roles || {};
  if (Object.hasOwn(configured, role)) return configured[role];
  return candidate?.roles?.[role] ?? null;
}

// What Home Assistant reports for one profile: its vacuum entity and each role in use, plus
// what discovery found per role. Image entities on the vacuum's device are offered as map pictures.
export function robotLive(robot, registry, states, candidate = null, format = null) {
  const entityId = robot?.configuration?.entityId || resolveEntityId(robot?.configuration?.registryId, registry);
  const roles = {};
  const discovered = {};
  for (const role of ROBOT_ROLES) {
    const reference = roleReference(robot, candidate, role);
    if (reference) roles[role] = reading(states, resolveEntityId(reference, registry), format);
    const found = resolveEntityId(candidate?.roles?.[role], registry);
    if (found) discovered[role] = found;
  }
  const deviceId = entityId ? registry?.byEntityId?.get(entityId)?.deviceId ?? null : null;
  const maps = deviceId
    ? registry.entries.filter((entry) => entry.deviceId === deviceId && !entry.disabled && entry.entityId.startsWith("image.")).map((entry) => entry.entityId).sort()
    : [];
  return Object.freeze({
    vacuum: reading(states, entityId, format),
    roles: Object.freeze(roles),
    discovered: Object.freeze(discovered),
    ambiguousRoles: Object.freeze([...(candidate?.ambiguousRoles || [])]),
    maps: Object.freeze(maps.map((mapId) => reading(states, mapId, format))),
  });
}

// A numeric role value such as the battery level, or null.
export function numericReading(entry) {
  if (!entry?.available) return null;
  const value = Number(entry.state);
  return Number.isFinite(value) ? value : null;
}

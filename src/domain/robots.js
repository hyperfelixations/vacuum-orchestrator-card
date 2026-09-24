// Robot records as the backend reports them. Capabilities are backend facts; the card never
// infers what a robot can do from an entity state.

const AVAILABILITIES = new Set(["available", "busy", "unavailable", "unknown"]);
const WIRE_FIELDS = new Set([
  "robot_id",
  "name",
  "adapter",
  "vacuum_entity_id",
  "availability",
  "battery_percentage",
  "active_job_id",
  "active_area_id",
  "blocked_reason",
  "allowed_area_ids",
  "map_image_entity_id",
  "capabilities",
]);

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return Object.freeze(result);
}

function percentage(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function capabilityRecord(wire) {
  const value = wire && typeof wire === "object" ? wire : {};
  return Object.freeze({
    operations: strings(value.operations),
    maxPasses: Number.isInteger(value.max_passes) ? value.max_passes : null,
    passScope: text(value.pass_scope),
    vacuumLevels: strings(value.vacuum_levels),
    waterLevels: strings(value.water_levels),
    mopRoutes: strings(value.mop_routes),
    cancel: value.cancel === true,
  });
}

export function normalizeRobot(wire) {
  if (!wire || typeof wire !== "object") return null;
  const robotId = text(wire.robot_id);
  if (!robotId) return null;
  return Object.freeze({
    robotId,
    name: text(wire.name) || robotId,
    adapter: text(wire.adapter),
    vacuumEntityId: text(wire.vacuum_entity_id),
    availability: AVAILABILITIES.has(wire.availability) ? wire.availability : "unknown",
    batteryPercentage: percentage(wire.battery_percentage),
    activeJobId: text(wire.active_job_id),
    activeAreaId: text(wire.active_area_id),
    blockedReason: text(wire.blocked_reason),
    allowedAreaIds: strings(wire.allowed_area_ids),
    mapImageEntityId: text(wire.map_image_entity_id),
    capabilities: capabilityRecord(wire.capabilities),
    unknownFields: Object.freeze(Object.keys(wire).filter((key) => !WIRE_FIELDS.has(key))),
  });
}

export function normalizeRobotsResponse(wire) {
  if (!wire || typeof wire !== "object" || !Array.isArray(wire.robots)) return null;
  return Object.freeze({
    apiVersion: Number.isInteger(wire.api_version) ? wire.api_version : null,
    robots: Object.freeze(wire.robots.map(normalizeRobot).filter(Boolean)),
  });
}

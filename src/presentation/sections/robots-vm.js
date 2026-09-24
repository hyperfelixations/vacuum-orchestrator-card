// Robot status and capabilities, exactly as the backend reports them. The card never reads a
// vacuum entity to fill a gap the integration has not closed yet.

import { areaLabel, areaMap, findJob, hasCapability, jobLabel, listOf, modeLabel, number, text } from "./helpers.js";

const AVAILABILITY_TONE = Object.freeze({ available: "ready", busy: "running", unavailable: "attention", unknown: "idle" });

function buildRobot(robot, { areasById, model, texts, showMap }) {
  const capabilities = robot.capabilities;
  return {
    key: robot.robotId,
    robotId: robot.robotId,
    name: robot.name,
    adapter: robot.adapter || "",
    vacuumEntityId: robot.vacuumEntityId,
    availability: robot.availability,
    availabilityLabel: text(texts, `robot.availability.${robot.availability}`, undefined, robot.availability),
    availabilityTone: AVAILABILITY_TONE[robot.availability] || "idle",
    battery: robot.batteryPercentage,
    batteryLabel: robot.batteryPercentage === null ? "—" : `${number(texts, robot.batteryPercentage)}%`,
    activeJobId: robot.activeJobId,
    activeJobLabel: jobLabel(findJob(model, robot.activeJobId), areasById) || null,
    activeAreaLabel: robot.activeAreaId ? areaLabel(robot.activeAreaId, areasById) : null,
    blockedReason: robot.blockedReason,
    operations: capabilities.operations.map((operation) => ({ key: operation, label: modeLabel(texts, operation) })),
    maxPasses: capabilities.maxPasses,
    passScope: capabilities.passScope,
    vacuumLevels: capabilities.vacuumLevels.map((level) => text(texts, `level.${level}`, undefined, level)),
    waterLevels: capabilities.waterLevels.map((level) => text(texts, `level.${level}`, undefined, level)),
    mopRoutes: capabilities.mopRoutes.map((route) => text(texts, `route.${route}`, undefined, route)),
    cancel: capabilities.cancel,
    allowedAreas: robot.allowedAreaIds.map((areaId) => ({ id: areaId, name: areaLabel(areaId, areasById) })),
    // The map is an entity the backend names; the element resolves it to a URL.
    mapImageEntityId: showMap ? robot.mapImageEntityId : null,
    mapAlt: `${robot.name} — ${text(texts, "section.robots", undefined, "Robots")}`,
  };
}

export function buildRobotsViewModel({ model = {}, texts, options = {}, ui } = {}) {
  if (!hasCapability(model, "robotsRead")) {
    return { key: "robots", available: false, unavailable: { capability: "robotsRead" }, rows: [], empty: false, ui };
  }
  const shared = { areasById: areaMap(model), model, texts, showMap: options.show_map === true };
  const rows = listOf(model.robots?.items).map((robot) => buildRobot(robot, shared));
  return { key: "robots", available: true, unavailable: null, rows, empty: rows.length === 0, ui };
}

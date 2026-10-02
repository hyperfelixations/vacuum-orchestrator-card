// The robots view: per profile what Home Assistant reports (vacuum state, battery, room, error,
// map) and what the integration reports (lease, block, recovery, resolved capabilities, reached
// rooms). See internal dev doc §8 "Roboter".

import { candidateAffordance, recoveryAffordance, robotAffordances } from "../../domain/affordances.js";
import { isConfiguredCandidate } from "../../domain/robots.js";
import { OPERATIONS } from "../../domain/job-schema.js";
import { list, robotsOf, roomIndex, roomName, slotData } from "../common/lookups.js";
import { levelLabel, number, operationLabel, reasonText, routeLabel, t } from "../common/texts.js";
import { robotStatus } from "../common/robot-status.js";

const QUIET_ERRORS = new Set(["none", "ok", "no_error", "0"]);

function readingText(reading) {
  if (!reading?.available) return null;
  return reading.display || `${reading.state}${reading.unit ? ` ${reading.unit}` : ""}`;
}

export function buildRobotsView({ model, texts, context, options = {}, ui = {} }) {
  const robots = robotsOf(model);
  const status = model.slots?.robots?.status;
  const index = roomIndex(model);
  const recovery = new Map(list(slotData(model, "queue")?.recoveryTargets).map((target) => [target.robotId, target]));
  const candidates = list(slotData(model, "candidates")?.items).filter((candidate) => !isConfiguredCandidate(candidate, robots));
  return {
    key: "robots",
    loading: !model.slots?.robots?.data && (status === "loading" || status === "idle"),
    error: !model.slots?.robots?.data ? model.slots?.robots?.error ?? null : null,
    newCandidates: candidates.length,
    add: candidateAffordance(context),
    robots: robots.map((robot) => {
      const live = model.robotsLive?.[robot.robotId] ?? null;
      const summary = robotStatus(robot, model, texts);
      const errorReading = live?.roles?.error;
      const error = errorReading?.available && !QUIET_ERRORS.has(String(errorReading.state).toLowerCase()) ? errorReading.display || errorReading.state : null;
      const capabilities = robot.capabilities;
      const maps = list(live?.maps).filter((map) => map.picture);
      const chosen = ui.choices?.[`map:${robot.robotId}`];
      const map = options.show_map === false ? null : maps.find((entry) => entry.entityId === chosen) || maps[0] || null;
      const target = recovery.get(robot.robotId);
      return {
        key: robot.robotId,
        robotId: robot.robotId,
        name: robot.name,
        state: summary.state,
        tone: summary.tone,
        battery: summary.battery,
        batteryText: summary.battery === null ? null : t(texts, "robot.battery", { value: number(texts, summary.battery) }),
        facts: [
          { key: "room", icon: "mdi:map-marker-outline", label: t(texts, "robot.currentRoom"), value: readingText(live?.roles?.current_room) },
          { key: "status", icon: "mdi:information-outline", label: t(texts, "robot.status"), value: readingText(live?.roles?.status) },
          { key: "map", icon: "mdi:map-outline", label: t(texts, "robot.selectedMap"), value: readingText(live?.roles?.selected_map) },
          { key: "minimum", icon: "mdi:battery-low", label: t(texts, "robot.minimumBattery"), value: robot.configuration.minimumBattery === null ? null : t(texts, "robot.minimumBatteryValue", { value: number(texts, robot.configuration.minimumBattery) }) },
        ].filter((fact) => fact.value !== null),
        error,
        active: robot.active,
        disabled: !robot.configuration.enabled,
        blocked: robot.blockedReason ? reasonText(texts, robot.blockedReason) : null,
        recovery: target ? { reason: reasonText(texts, target.reason) || t(texts, "recovery.reasonUnknown"), decision: recoveryAffordance(robot.robotId, context) } : null,
        operations: capabilities ? OPERATIONS.filter((operation) => capabilities.operations.includes(operation)).map((operation) => operationLabel(texts, operation)) : [],
        rooms: capabilities ? Object.keys(capabilities.targets).map((roomId) => roomName(roomId, index, model)) : [],
        levels: capabilities && options.show_capabilities !== false
          ? [
              capabilities.maximumPasses ? t(texts, "robot.maxPasses", { count: capabilities.maximumPasses }) : null,
              capabilities.vacuumLevels.length ? t(texts, "robot.vacuumLevels", { levels: capabilities.vacuumLevels.map((level) => levelLabel(texts, level)).join(", ") }) : null,
              capabilities.waterLevels.length ? t(texts, "robot.waterLevels", { levels: capabilities.waterLevels.map((level) => levelLabel(texts, level)).join(", ") }) : null,
              capabilities.mopRoutes.length ? t(texts, "robot.mopRoutes", { routes: capabilities.mopRoutes.map((route) => routeLabel(texts, route)).join(", ") }) : null,
            ].filter(Boolean)
          : [],
        unresolved: !capabilities,
        map: map ? { entityId: map.entityId, picture: map.picture, label: map.friendlyName || map.entityId } : null,
        mapChoices: maps.length > 1 ? maps.map((entry) => ({ entityId: entry.entityId, label: entry.friendlyName || entry.entityId, selected: entry.entityId === map?.entityId })) : [],
        actions: robotAffordances(robot, context),
      };
    }),
  };
}

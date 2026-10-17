// A device fault in words (ROB-13): the sensor faults the integration classifies itself are worded
// by the card; a fault the robot or its station reports through an error entity reads as Home
// Assistant words that entity's state, else by who reports it — never as a raw code (UI-04). See
// internal dev doc §8 "Status und Ton".

import { list, robotsOf } from "./lookups.js";
import { t } from "./texts.js";

// Codes the integration derives from a robot's or station's binary sensors.
export const SENSOR_FAULTS = Object.freeze(["mop_detached", "water_box_detached", "water_shortage", "clean_water_empty", "dirty_water_full", "cleaning_fluid_empty"]);
const SENSOR = new Set(SENSOR_FAULTS);

export function faultText(code, robotId, { model, texts }) {
  if (SENSOR.has(code)) return t(texts, `fault.${code}`);
  const robot = robotsOf(model).find((item) => item.robotId === robotId);
  const fault = list(robot?.faults).find((item) => item.code === code);
  const live = model.robotsLive?.[robotId];
  const reading = fault?.entityId ? Object.values(live?.roles || {}).find((item) => item?.entityId === fault.entityId) : null;
  if (reading?.available && reading.display) return reading.display;
  return t(texts, fault?.source === "dock" ? "fault.reportedByDock" : "fault.reportedByRobot");
}

// Several codes in words, each wording once.
export function faultsText(codes, robotId, context) {
  return [...new Set(codes.map((code) => faultText(code, robotId, context)))].join(" · ");
}

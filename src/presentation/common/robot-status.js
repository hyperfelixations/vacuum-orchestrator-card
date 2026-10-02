// One robot as a short status: Home Assistant's vacuum state and battery reading, the
// integration's lease and block. Values are displayed as reported; nothing is inferred from them.

import { numericReading } from "../../application/ha-entities.js";
import { number, t } from "./texts.js";

const VACUUM_STATES = new Set(["cleaning", "docked", "returning", "idle", "paused", "error"]);

export function vacuumStateLabel(texts, reading) {
  if (!reading || !reading.available) return t(texts, "vacuum.state.unavailable");
  return VACUUM_STATES.has(reading.state) ? t(texts, `vacuum.state.${reading.state}`) : reading.display || reading.state;
}

export function robotStatus(robot, model, texts) {
  const live = model.robotsLive?.[robot.robotId] ?? null;
  const battery = numericReading(live?.roles?.battery);
  const state = vacuumStateLabel(texts, live?.vacuum);
  const tone = robot.blockedReason ? "attention" : robot.active ? "running" : live?.vacuum?.state === "error" ? "attention" : live?.vacuum?.available ? "ready" : "muted";
  const parts = [robot.name, state, battery === null ? null : t(texts, "robot.battery", { value: number(texts, battery) })].filter(Boolean);
  return { robotId: robot.robotId, name: robot.name, state, battery, tone, summary: parts.join(" · ") };
}

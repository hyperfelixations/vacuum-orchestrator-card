// One robot as a short status: the integration's vendor-neutral activity (Home Assistant's vacuum
// state only where the integration has none), the battery reading, the lease and block. Values are
// displayed as reported; nothing is inferred from them. A robot that cannot be reached shows no
// battery level, since the reading is only the last one it sent.

import { numericReading } from "../../application/ha-entities.js";
import { number, t } from "./texts.js";

const VACUUM_STATES = new Set(["cleaning", "docked", "returning", "idle", "paused", "error"]);
const PHASES = new Set(["cleaning", "returning", "station", "docked", "idle", "paused", "error", "offline", "other"]);

export function vacuumStateLabel(texts, reading) {
  if (!reading || !reading.available) return t(texts, "vacuum.state.unavailable");
  return VACUUM_STATES.has(reading.state) ? t(texts, `vacuum.state.${reading.state}`) : reading.display || reading.state;
}

// UI-09, EXE-11: a run outside the integration says so.
export function activityLabel(texts, activity) {
  if (!PHASES.has(activity?.phase)) return null;
  return t(texts, activity.phase === "cleaning" && activity.external ? "robot.phase.cleaningExternal" : `robot.phase.${activity.phase}`);
}

export function robotStatus(robot, model, texts) {
  const live = model.robotsLive?.[robot.robotId] ?? null;
  const reachable = robot.activity?.phase !== "offline" && live?.vacuum?.available !== false;
  const battery = reachable ? numericReading(live?.roles?.battery) : null;
  const state = activityLabel(texts, robot.activity) ?? vacuumStateLabel(texts, live?.vacuum);
  const failed = robot.activity?.phase === "error" || live?.vacuum?.state === "error";
  const tone = robot.blockedReason || failed ? "attention" : robot.active ? "running" : robot.activity?.phase === "offline" ? "muted" : live?.vacuum?.available ? "ready" : "muted";
  const parts = [robot.name, state, battery === null ? null : t(texts, "robot.batteryLevel", { value: number(texts, battery) })].filter(Boolean);
  return { robotId: robot.robotId, name: robot.name, state, battery, tone, summary: parts.join(" · ") };
}

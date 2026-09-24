// Canonical values shared by the wire normalizer, draft reducer and action policy.

const freezeList = (values) => Object.freeze([...values]);
const freezeMap = (value) => {
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = Array.isArray(item) ? freezeList(item) : item;
  }
  return Object.freeze(copy);
};

export const CLEANING_MODES = freezeList([
  "vacuum",
  "mop",
  "vacuum_and_mop",
  "vacuum_then_mop",
]);

export const MODE_ALIASES = Object.freeze({
  vacuum: "vacuum",
  vac: "vacuum",
  mop: "mop",
  vacuum_and_mop: "vacuum_and_mop",
  vac_and_mop: "vacuum_and_mop",
  vacuum_then_mop: "vacuum_then_mop",
  vac_then_mop: "vacuum_then_mop",
});

export const OPERATIONS = freezeList(["vacuum", "mop", "vacuum_and_mop"]);
export const SEMANTIC_LEVELS = freezeList([
  "off",
  "low",
  "standard",
  "medium",
  "high",
  "maximum",
  "auto",
]);
export const MOP_ROUTES = freezeList(["standard", "deep", "fast", "auto"]);
export const SETTINGS_POLICIES = freezeList(["best_effort", "strict"]);
export const JOB_STATES = freezeList([
  "queued",
  "dispatching",
  "running",
  "canceling",
  "completed",
  "failed",
  "cancelled",
  "needs_attention",
]);
export const TERMINAL_STATES = freezeList(["completed", "failed", "cancelled"]);
export const ACTIVE_STATES = freezeList([
  "dispatching",
  "running",
  "canceling",
]);
export const QUEUE_MODES = freezeList(["idle", "running", "paused"]);
export const MOVE_DIRECTIONS = freezeList(["up", "down", "top", "bottom"]);
export const READINESS_STATES = freezeList(["ready", "blocked", "unknown"]);
export const PASS_MIN = 1;
export const PASS_MAX = 10;

export const MODE_OPERATIONS = freezeMap({
  vacuum: ["vacuum"],
  mop: ["mop"],
  vacuum_and_mop: ["vacuum_and_mop"],
  vacuum_then_mop: ["vacuum", "mop"],
});

export const MODE_SHORT_KEYS = Object.freeze({
  vacuum: "job.mode.short.vacuum",
  mop: "job.mode.short.mop",
  vacuum_and_mop: "job.mode.short.vacuumAndMop",
  vacuum_then_mop: "job.mode.short.vacuumThenMop",
});

const CLEANING_MODE_SET = new Set(CLEANING_MODES);
const OPERATION_SET = new Set(OPERATIONS);
const LEVEL_SET = new Set(SEMANTIC_LEVELS);
const ROUTE_SET = new Set(MOP_ROUTES);
const POLICY_SET = new Set(SETTINGS_POLICIES);
const JOB_STATE_SET = new Set(JOB_STATES);
const TERMINAL_STATE_SET = new Set(TERMINAL_STATES);
const ACTIVE_STATE_SET = new Set(ACTIVE_STATES);
const QUEUE_MODE_SET = new Set(QUEUE_MODES);
const MOVE_DIRECTION_SET = new Set(MOVE_DIRECTIONS);
const READINESS_STATE_SET = new Set(READINESS_STATES);

export function canonicalizeMode(value) {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  const canonical = MODE_ALIASES[key];
  return canonical && CLEANING_MODE_SET.has(canonical) ? canonical : null;
}

export function isOperation(value) {
  return typeof value === "string" && OPERATION_SET.has(value);
}

export function isSemanticLevel(value) {
  return typeof value === "string" && LEVEL_SET.has(value);
}

export function isMopRoute(value) {
  return typeof value === "string" && ROUTE_SET.has(value);
}

export function isSettingsPolicy(value) {
  return typeof value === "string" && POLICY_SET.has(value);
}

export function isJobState(value) {
  return typeof value === "string" && JOB_STATE_SET.has(value);
}

export function isTerminalState(value) {
  return typeof value === "string" && TERMINAL_STATE_SET.has(value);
}

export function isActiveState(value) {
  return typeof value === "string" && ACTIVE_STATE_SET.has(value);
}

export function isQueueMode(value) {
  return typeof value === "string" && QUEUE_MODE_SET.has(value);
}

export function isMoveDirection(value) {
  return typeof value === "string" && MOVE_DIRECTION_SET.has(value);
}

export function isReadinessState(value) {
  return typeof value === "string" && READINESS_STATE_SET.has(value);
}

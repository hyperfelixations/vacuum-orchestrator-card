// Closed vocabularies of the Vacuum Orchestrator API V3. Values are protocol identifiers;
// wording belongs to i18n. See internal dev doc §7 "Vokabular".

const list = (values) => Object.freeze([...values]);

export const CLEANING_MODES = list(["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"]);

// Input aliases the integration accepts; its output is always canonical.
export const MODE_ALIASES = Object.freeze({
  vacuum: "vacuum",
  vac: "vacuum",
  mop: "mop",
  vacuum_and_mop: "vacuum_and_mop",
  vac_and_mop: "vacuum_and_mop",
  vacuum_then_mop: "vacuum_then_mop",
  vac_then_mop: "vacuum_then_mop",
});

export const OPERATIONS = list(["vacuum", "mop", "vacuum_and_mop"]);
// Each setting is an ordered ladder, lowest rung first; the integration resolves a rung a robot
// lacks to its nearest one.
export const VACUUM_LEVELS = list(["low", "standard", "high", "maximum", "maximum_plus"]);
export const WATER_LEVELS = list(["low", "medium", "high"]);
export const MOP_ROUTES = list(["fast", "standard", "deep", "deep_plus"]);
export const SETTING_FIELDS = list(["vacuumPower", "mopIntensity", "mopRoute"]);
export const SETTING_LADDERS = Object.freeze({ vacuumPower: VACUUM_LEVELS, mopIntensity: WATER_LEVELS, mopRoute: MOP_ROUTES });
export const SETTING_WIRE_NAMES = Object.freeze({ vacuumPower: "vacuum_power", mopIntensity: "mop_intensity", mopRoute: "mop_route" });
// The settings each mode uses (`settings_for_mode`); a job carries exactly these.
export const MODE_SETTINGS = Object.freeze({
  vacuum: list(["vacuumPower"]),
  mop: list(["mopIntensity", "mopRoute"]),
  vacuum_and_mop: SETTING_FIELDS,
  vacuum_then_mop: SETTING_FIELDS,
});
// How a job came into the queue; set by the integration.
export const PROVENANCE_KINDS = list(["manual", "automation", "template", "automatic", "retry"]);
export const AFTER_CANCEL = list(["stay", "return_to_dock"]);
export const SETTINGS_POLICIES = list(["best_effort", "strict"]);
export const JOB_STATES = list(["queued", "dispatching", "running", "canceling", "completed", "failed", "cancelled", "needs_attention"]);
export const TERMINAL_STATES = list(["completed", "failed", "cancelled"]);
export const ACTIVE_STATES = list(["dispatching", "running", "canceling"]);
export const QUEUE_MODES = list(["idle", "running", "paused"]);
export const MOVE_DIRECTIONS = list(["up", "down", "top", "bottom"]);
export const READINESS_STATES = list(["ready", "blocked", "unknown"]);
export const REQUIREMENT_STATES = list(["ready", "blocked", "unknown", "stale"]);
export const RELEASE_KINDS = list(["permanent", "once", "timed", "queue_run"]);
export const DUE_STATES = list(["disabled", "fresh", "due", "unknown"]);
export const DUE_BASES = list(["calendar", "occupied"]);
export const COMPLETION_QUALITIES = list(["confirmed", "derived"]);
export const RUN_SOURCES = list(["voi", "external"]);
export const ATTEMPT_STATES = list([
  "prepared",
  "command_sent",
  "start_confirmed",
  "completion_pending",
  "succeeded",
  "failed",
  "cancel_pending",
  "cancelled",
  "recovery_required",
]);
export const ROBOT_ROLES = list([
  "battery",
  "status",
  "error",
  "dock_error",
  "last_clean_start",
  "last_clean_end",
  "current_room",
  "clean_percent",
  "cleaning_mode",
  "mop_intensity",
  "mop_route",
  "selected_map",
  "in_cleaning",
  "water_shortage",
  "mop_attached",
  "water_box_attached",
  "dirty_box_full",
  "clean_box_empty",
  "clean_fluid_empty",
]);
// The entity domain the integration accepts for each role (`configuration.py`).
export const ROBOT_ROLE_DOMAINS = Object.freeze({
  battery: "sensor",
  status: "sensor",
  error: "sensor",
  dock_error: "sensor",
  last_clean_start: "sensor",
  last_clean_end: "sensor",
  current_room: "sensor",
  clean_percent: "sensor",
  cleaning_mode: "select",
  mop_intensity: "select",
  mop_route: "select",
  selected_map: "select",
  in_cleaning: "binary_sensor",
  water_shortage: "binary_sensor",
  mop_attached: "binary_sensor",
  water_box_attached: "binary_sensor",
  dirty_box_full: "binary_sensor",
  clean_box_empty: "binary_sensor",
  clean_fluid_empty: "binary_sensor",
});
export const ROBOT_PROTOCOLS = list(["roborock_v1"]);
export const ROBOT_TIMEOUT_FIELDS = Object.freeze({
  start_timeout_seconds: 180,
  run_timeout_seconds: 14400,
  cancel_timeout_seconds: 120,
  settle_seconds: 30,
  settings_timeout_seconds: 45,
  return_timeout_seconds: 900,
});
// Option maps: which semantic keys each map may carry; `map_options` keys are free. `off`
// names the robot option that switches suction or water off for a single-operation phase.
export const ROBOT_OPTION_MAPS = Object.freeze({
  mode_options: OPERATIONS,
  vacuum_levels: list(["off", ...VACUUM_LEVELS]),
  water_levels: list(["off", ...WATER_LEVELS]),
  mop_routes: MOP_ROUTES,
  map_options: null,
});

export const PASS_MIN = 1;
export const PASS_MAX = 10;
export const PAGE_LIMIT_MAX = 100;
export const QUEUE_GRACE_MAX_SECONDS = 86400;
export const ROBOT_PREFERENCE_RANGE = Object.freeze({ min: -100, max: 100 });
export const LIST_LIMIT = 100;
export const ACCEPTED_STATES_MAX = 20;

// The operations each mode is planned into, in order (`vacuum_then_mop` has two phases).
export const MODE_OPERATIONS = Object.freeze({
  vacuum: list(["vacuum"]),
  mop: list(["mop"]),
  vacuum_and_mop: list(["vacuum_and_mop"]),
  vacuum_then_mop: list(["vacuum", "mop"]),
});

const sets = new Map();
function member(values, value) {
  if (!sets.has(values)) sets.set(values, new Set(values));
  return typeof value === "string" && sets.get(values).has(value);
}

export function canonicalizeMode(value) {
  if (typeof value !== "string") return null;
  return MODE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export const isOperation = (value) => member(OPERATIONS, value);
export const isVacuumLevel = (value) => member(VACUUM_LEVELS, value);
export const isWaterLevel = (value) => member(WATER_LEVELS, value);
export const isMopRoute = (value) => member(MOP_ROUTES, value);
export const isProvenanceKind = (value) => member(PROVENANCE_KINDS, value);
export const isAfterCancel = (value) => member(AFTER_CANCEL, value);
// Whether a value is a rung of the given setting's ladder.
export const isSettingValue = (field, value) => Boolean(SETTING_LADDERS[field]) && member(SETTING_LADDERS[field], value);
export const isSettingsPolicy = (value) => member(SETTINGS_POLICIES, value);
export const isJobState = (value) => member(JOB_STATES, value);
export const isTerminalState = (value) => member(TERMINAL_STATES, value);
export const isActiveState = (value) => member(ACTIVE_STATES, value);
export const isQueueMode = (value) => member(QUEUE_MODES, value);
export const isMoveDirection = (value) => member(MOVE_DIRECTIONS, value);
export const isReadinessState = (value) => member(READINESS_STATES, value);
export const isRequirementState = (value) => member(REQUIREMENT_STATES, value);
export const isReleaseKind = (value) => member(RELEASE_KINDS, value);
export const isDueState = (value) => member(DUE_STATES, value);
export const isDueBasis = (value) => member(DUE_BASES, value);
export const isCompletionQuality = (value) => member(COMPLETION_QUALITIES, value);
export const isRunSource = (value) => member(RUN_SOURCES, value);
export const isAttemptState = (value) => member(ATTEMPT_STATES, value);
export const isRobotRole = (value) => member(ROBOT_ROLES, value);

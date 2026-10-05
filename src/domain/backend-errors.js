// Failure records, and the codes the card words itself. Integration codes are open: the
// integration translates them (`exceptions` in its translations), and the card shows that text.
// See internal dev doc §6 "Fehlervertrag".

// Raised by the card or received from Home Assistant's transport, never by the integration.
export const CLIENT_CODES = Object.freeze([
  "invalid_request",
  "invalid_response",
  "timeout",
  "connection_lost",
  "command_pending",
  "read_only",
  "operation_missing",
  "unauthorized",
  "service_not_found",
  "unknown_command",
  "not_found",
  "api_incompatible",
  "unknown",
]);

const CLIENT = new Set(CLIENT_CODES);

export function isClientCode(code) {
  return CLIENT.has(code);
}

// A failed request as every layer above the transport sees it.
export function backendFailure(code, { detail = null, channel = null } = {}) {
  const normalized = typeof code === "string" && code.trim() ? code.trim() : "unknown";
  return Object.freeze({ ok: false, code: normalized, detail: detail === null || detail === undefined ? null : String(detail), channel });
}

export function isBackendFailure(value) {
  return Boolean(value) && typeof value === "object" && value.ok === false && typeof value.code === "string";
}

// Execution outcomes a job or attempt can end with (`failure_code`) that the integration does
// not translate; the card words them individually.
export const FAILURE_CODES = Object.freeze([
  "start_timeout",
  "run_timeout",
  "cancel_timeout",
  "observation_timeout",
  "robot_reported_error",
  "robot_connection_lost",
  "observed_mode_mismatch",
  "completion_scope_mismatch",
  "external_run_interrupted",
  "physical_run_ownership_uncertain",
  "operator_assumed_stopped",
  "dispatch_failed",
]);

export const READINESS_REASONS = Object.freeze(["room_not_released", "requirement_not_satisfied", "requirement_unknown", "requirement_stale"]);
export const DUE_REASONS = Object.freeze(["interval_disabled", "never_cleaned", "clock_before_completion", "calendar_interval", "occupancy_baseline_unknown", "occupancy_gap", "occupied_interval"]);

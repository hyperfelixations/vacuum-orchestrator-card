// Stable error codes the card words individually, grouped by what the user can do about them.
// Codes come from the integration's domain errors and from Home Assistant's transport; any
// other code is tolerated and worded through its group. See internal dev doc §6 "Fehlervertrag".

const GROUPS = Object.freeze({
  job: [
    "unknown_job",
    "job_not_editable",
    "job_not_deletable",
    "job_not_movable",
    "job_not_cancellable",
    "job_not_retryable",
    "job_not_startable",
    "job_not_dispatchable",
    "dedupe_key_already_queued",
    "duplicate_queue_job",
    "empty_job_update",
    "job_requires_area",
    "duplicate_area",
    "invalid_cleaning_mode",
    "invalid_pass_count",
    "contradictory_state_requirement",
    "preference_conflicts_with_cleaning_mode",
    "job_conditions_not_satisfied",
    "readiness_changed_before_start",
  ],
  room: [
    "unknown_room",
    "unknown_area",
    "room_unavailable",
    "room_not_released",
    "room_has_active_job",
    "room_already_exists",
    "invalid_room_configuration",
    "room_configuration_changes_runtime_state",
    "duplicate_room_binding",
    "invalid_room_targets",
    "overlapping_room_mapping",
    "requirement_binding_missing",
    "invalid_requirements",
    "occupancy_source_required",
    "invalid_occupancy_states",
    "release_duration_mismatch",
  ],
  robot: [
    "no_robot_configured",
    "unknown_robot",
    "robot_busy",
    "robot_needs_attention",
    "robot_already_executing",
    "robot_availability_unknown",
    "robot_not_available",
    "battery_below_minimum",
    "unmapped_target",
    "unsupported_operation",
    "unsupported_map_context",
    "unsupported_pass_count",
    "unsupported_cleaning_preference",
    "target_overlap_active",
    "source_robot_already_leased",
    "capabilities_changed_before_dispatch",
    "robot_stopped_confirmation_required",
    "robot_not_needing_recovery",
  ],
  robotConfiguration: [
    "already_configured",
    "robot_limit_reached",
    "robot_identity_change",
    "entity_not_registered",
    "vacuum_unavailable",
    "invalid_role_entity",
    "unknown_entity_role",
    "invalid_role_mapping",
    "empty_allowed_operations",
    "invalid_operation",
    "unsupported_robot_protocol",
    "invalid_robot_preference",
    "invalid_minimum_battery",
    "invalid_option_mapping",
    "ambiguous_mode_mapping",
    "invalid_duration",
    "timeout_out_of_range",
    "invalid_target_areas",
    "unknown_robot_configuration_field",
    "invalid_robot_enabled",
  ],
  template: ["unknown_template", "template_disabled", "template_unknown_room"],
  queue: ["queue_grace_out_of_range"],
  storage: ["critical_storage_state_uncertain", "critical_storage_unreadable", "snapshot_digest_mismatch", "critical_commit_readback_mismatch"],
  availability: ["orchestrator_not_loaded", "orchestrator_not_initialized", "orchestrator_shutting_down", "multiple_orchestrator_entries_loaded", "unknown_command", "service_not_found"],
  permission: ["unauthorized"],
  // Decided before or around a request leaving the browser.
  client: ["invalid_parameters", "invalid_request", "invalid_response", "timeout", "connection_lost", "command_pending", "read_only", "operation_missing"],
});

export const ERROR_GROUPS = Object.freeze(Object.fromEntries(Object.entries(GROUPS).map(([group, codes]) => [group, Object.freeze([...codes])])));
export const ERROR_GROUP_NAMES = Object.freeze([...Object.keys(GROUPS), "unknown"]);
export const KNOWN_ERROR_CODES = Object.freeze(Object.values(GROUPS).flat());

const GROUP_BY_CODE = new Map(Object.entries(GROUPS).flatMap(([group, codes]) => codes.map((code) => [code, group])));

export function errorGroup(code) {
  return GROUP_BY_CODE.get(code) || "unknown";
}

export function isKnownErrorCode(code) {
  return GROUP_BY_CODE.has(code);
}

// A failed request as every layer above the transport sees it.
export function backendFailure(code, { detail = null, channel = null } = {}) {
  const normalized = typeof code === "string" && code.trim() ? code.trim() : "unknown";
  return Object.freeze({ ok: false, code: normalized, group: errorGroup(normalized), detail: detail === null || detail === undefined ? null : String(detail), channel });
}

export function isBackendFailure(value) {
  return Boolean(value) && typeof value === "object" && value.ok === false && typeof value.code === "string";
}

// Execution outcomes a job or attempt can end with (`failure_code`), worded individually.
export const FAILURE_CODES = Object.freeze([
  "start_timeout",
  "run_timeout",
  "cancel_timeout",
  "observation_timeout",
  "robot_reported_error",
  "robot_connection_lost",
  "observed_mode_mismatch",
  "completion_scope_mismatch",
  "insufficient_start_evidence",
  "insufficient_completion_evidence",
  "external_run_interrupted",
  "physical_run_ownership_uncertain",
  "operator_assumed_stopped",
  "dispatch_failed",
  "setting_confirmation_timeout",
  "setting_entity_unavailable",
  "setting_option_unavailable",
  "cleaning_mode_not_confirmed",
]);

export const READINESS_REASONS = Object.freeze(["room_not_released", "requirement_not_satisfied", "requirement_unknown", "requirement_stale"]);
export const DUE_REASONS = Object.freeze(["interval_disabled", "never_cleaned", "clock_before_completion", "calendar_interval", "occupancy_baseline_unknown", "occupancy_gap", "occupied_interval"]);

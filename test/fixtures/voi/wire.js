// Vacuum Orchestrator API V2 records in the exact shapes the integration serializes them.
// Provenance and field sources: test/fixtures/voi/README.md. Every layer below the backend
// port is fed from here, so a contract change shows up in one place. Loads in Node through
// `require` and in the browser harness as a plain script (`globalThis.VocWire`).
(function (root) {
"use strict";

const VOI_API_VERSION = 2;
const DOMAIN = "vacuum_orchestrator";
const { EXCEPTIONS } = typeof module !== "undefined" && module.exports ? require("./exceptions.js") : root.VocExceptions;

function wireReadiness(overrides = {}) {
  return {
    state: "ready",
    failed_on: [],
    failed_off: [],
    unknown: [],
    reason_codes: [],
    blocked_room_ids: [],
    requirements: [],
    ...overrides,
  };
}

function wireRequirementResult(overrides = {}) {
  return {
    entity_id: "binary_sensor.hall_door",
    state: "ready",
    reason: "requirement_satisfied",
    room_id: "room-hall",
    robot_id: null,
    operation: null,
    ...overrides,
  };
}

function wireJob(overrides = {}) {
  return {
    api_version: VOI_API_VERSION,
    job_id: "job-1",
    revision: 1,
    state: "queued",
    name: null,
    areas: ["kitchen"],
    room_ids: ["room-kitchen"],
    mode: "vacuum",
    vacuum_power: null,
    mop_intensity: null,
    mop_route: null,
    passes: 1,
    source: null,
    reason: null,
    note: null,
    dedupe_key: null,
    required_on: [],
    required_off: [],
    settings_policy: "best_effort",
    created_at: "2026-09-17T00:00:00+00:00",
    updated_at: "2026-09-17T00:00:01+00:00",
    active_attempt_id: null,
    retries_job_id: null,
    failure_code: null,
    ...overrides,
  };
}

function wireQueueRun(overrides = {}) {
  return {
    run_id: "run-1",
    started_at: "2026-09-17T00:00:00+00:00",
    active: true,
    idle_since: null,
    deadline: null,
    completed_at: null,
    ...overrides,
  };
}

function wireQueuePage(jobs = [], overrides = {}) {
  return {
    api_version: VOI_API_VERSION,
    integration_version: "0.1.0",
    commit_id: 1,
    queue_revision: 1,
    mode: "idle",
    needs_attention: false,
    active_count: 0,
    attention_count: 0,
    recovery_targets: [],
    queue_grace_seconds: 900,
    queue_run: null,
    total: jobs.length,
    offset: 0,
    limit: 50,
    jobs,
    ...overrides,
  };
}

function wireJobListPage(jobs = [], overrides = {}) {
  return { api_version: VOI_API_VERSION, total: jobs.length, offset: 0, limit: 50, jobs, ...overrides };
}

function wirePage(key, items = [], overrides = {}) {
  return { api_version: VOI_API_VERSION, total: items.length, offset: 0, limit: 50, [key]: items, ...overrides };
}

function wireStamp(overrides = {}) {
  return {
    receipt_id: "receipt-1",
    completed_at: "2026-09-16T10:00:00+00:00",
    quality: "derived",
    occupancy_epoch: 0,
    occupied_seconds: 0,
    unknown_seconds: 0,
    occupancy_baseline_known: true,
    ...overrides,
  };
}

function wireDue(overrides = {}) {
  return {
    state: "disabled",
    reason: "interval_disabled",
    elapsed_seconds: null,
    remaining_seconds: null,
    due_at: null,
    quality: null,
    ...overrides,
  };
}

function wireRelease(overrides = {}) {
  return {
    grant_id: "grant-1",
    kind: "permanent",
    granted_at: "2026-09-16T08:00:00+00:00",
    expires_at: null,
    reserved_job_id: null,
    consumed: false,
    queue_run_id: null,
    ...overrides,
  };
}

function wireRoom(overrides = {}) {
  const { due_policy: duePolicy, occupancy, due, ...rest } = overrides;
  return {
    room_id: "room-kitchen",
    name: "Kitchen",
    area_id: "kitchen",
    floor_id: null,
    enabled: true,
    area_missing: false,
    follow_area_name: true,
    bindings: [],
    requirements: [],
    release: null,
    due_policy: {
      basis: "calendar",
      vacuum_seconds: null,
      mop_seconds: null,
      occupancy_entity_id: null,
      occupied_state: "on",
      unoccupied_state: "off",
      occupancy_entity_registry_id: null,
      ...(duePolicy || {}),
    },
    occupancy: {
      epoch: 0,
      occupied_seconds: 0,
      unknown_seconds: 0,
      observed_at: null,
      occupied: null,
      ...(occupancy || {}),
    },
    last_cleaning: {},
    last_confirmed: {},
    released: false,
    due: { vacuum: wireDue(), mop: wireDue(), ...(due || {}) },
    ...rest,
  };
}

function wireRoomRequirement(overrides = {}) {
  return {
    entity_id: "binary_sensor.hall_door",
    accepted_states: ["on"],
    max_age_seconds: null,
    robot_id: null,
    operation: null,
    entity_registry_id: "reg-hall-door",
    ...overrides,
  };
}

function wireRobotConfiguration(overrides = {}) {
  return {
    robot_registry_id: "reg-vacuum-rocky",
    robot_entity_id: "vacuum.rocky",
    adapter: "roborock",
    source_robot_id: "roborock:duid-1",
    roles: { battery: "reg-rocky-battery", status: "reg-rocky-status", current_room: "reg-rocky-room" },
    requirements: [],
    target_areas: ["kitchen", "hall"],
    allowed_operations: ["vacuum", "mop", "vacuum_and_mop"],
    enabled: true,
    protocol: "roborock_v1",
    fixed_mode: null,
    preference: 0,
    minimum_battery: null,
    mode_options: {},
    vacuum_levels: {},
    water_levels: {},
    mop_routes: {},
    map_options: {},
    start_timeout_seconds: 180,
    run_timeout_seconds: 14400,
    cancel_timeout_seconds: 120,
    settle_seconds: 30,
    settings_timeout_seconds: 45,
    ...overrides,
  };
}

function wireRobotCapabilities(overrides = {}) {
  return {
    revision: "cap-1",
    operations: ["mop", "vacuum", "vacuum_and_mop"],
    targets: { "room-kitchen": ["16"], "room-hall": ["17"] },
    map_context: "map-0",
    maximum_passes: 3,
    vacuum_levels: ["high", "low", "maximum", "standard"],
    water_levels: ["high", "low", "medium"],
    mop_routes: ["deep", "standard"],
    ...overrides,
  };
}

function wireRobot(overrides = {}) {
  const { configuration, capabilities, ...rest } = overrides;
  return {
    robot_id: "robot-rocky",
    name: "Rocky",
    configuration: wireRobotConfiguration(configuration || {}),
    active: false,
    blocked_reason: null,
    capabilities: capabilities === null ? null : wireRobotCapabilities(capabilities || {}),
    ...rest,
  };
}

function wireCandidate(overrides = {}) {
  return {
    registry_id: "reg-vacuum-rocky",
    entity_id: "vacuum.rocky",
    name: "Rocky",
    adapter: "roborock",
    roles: { battery: "reg-rocky-battery", status: "reg-rocky-status" },
    ambiguous_roles: [],
    protocol: "roborock_v1",
    ...overrides,
  };
}

function wireTemplate(overrides = {}) {
  return {
    template_id: "template-1",
    name: "Daily vacuum",
    intent: { areas: ["room-kitchen"], mode: "vacuum", passes: 1, settings_policy: "best_effort", required_on: [], required_off: [] },
    enabled: true,
    automatic: false,
    updated_at: "2026-09-16T08:00:00+00:00",
    suppressed_room_ids: [],
    ...overrides,
  };
}

function wireRun(overrides = {}) {
  return {
    run_id: "robot-run-1",
    source: "voi",
    operation: "vacuum",
    room_ids: ["room-kitchen"],
    observed_start: "2026-09-16T09:00:00+00:00",
    observed_end: "2026-09-16T09:40:00+00:00",
    quality: "derived",
    failure_code: null,
    ...overrides,
  };
}

function wireExecutionRobot(overrides = {}) {
  return {
    robot_id: "robot-rocky",
    operation: "vacuum",
    readiness: wireReadiness(),
    eligible: true,
    eligibility_reason: null,
    applied_preferences: [],
    omitted_preferences: [],
    ...overrides,
  };
}

function wireAttempt(overrides = {}) {
  return {
    attempt_id: "attempt-1",
    work_unit_id: "unit-1",
    robot_id: "robot-rocky",
    state: "start_confirmed",
    quality: null,
    failure_code: null,
    applied_preferences: [],
    omitted_preferences: [],
    ...overrides,
  };
}

function wireExecution(overrides = {}) {
  return { api_version: VOI_API_VERSION, job_id: "job-1", robots: [wireExecutionRobot()], attempts: [], ...overrides };
}

function wireTraceRecord(overrides = {}) {
  return {
    sequence: 1,
    timestamp: "2026-09-17T00:00:00+00:00",
    event: "job_transition",
    job_id: "job-1",
    attempt_id: null,
    robot_id: null,
    state: "queued",
    reason: null,
    quality: null,
    runtime_id: "runtime-1",
    commit_id: 1,
    runtime_sequence: 1,
    run_id: null,
    request_id: null,
    room_id: null,
    work_unit_id: null,
    command: null,
    stage: null,
    operation: null,
    exception_type: null,
    frames: null,
    ...overrides,
  };
}

function wireTracePage(records = [], overrides = {}) {
  return { ...wirePage("records", records), runtime_id: "runtime-1", trace_sequence: records.length, ...overrides };
}

function wireDiagnostics(overrides = {}) {
  return {
    version: "0.1.0",
    api_version: VOI_API_VERSION,
    store_version: 3,
    commit_id: 1,
    runtime_sequence: 1,
    runtime_id: "runtime-1",
    sink_failures: 0,
    trace_window: { recorded: 1, retained: 1, dropped: 0 },
    mode: "idle",
    needs_attention: false,
    totals: { jobs: 0, rooms: 0 },
    export_limit: 500,
    jobs: [],
    robots: [],
    ...overrides,
  };
}

function wireSubscriptionEvent(overrides = {}) {
  return {
    api_version: VOI_API_VERSION,
    loaded: true,
    commit_id: 1,
    runtime_id: "runtime-1",
    runtime_sequence: 1,
    queue_revision: 1,
    mode: "idle",
    pending_jobs: 0,
    needs_attention: false,
    ...overrides,
  };
}

// What a subscriber hears while no runtime is loaded.
function wireUnloadedEvent() {
  return { api_version: VOI_API_VERSION, loaded: false };
}

function wireManifest(overrides = {}) {
  return {
    domain: "vacuum_orchestrator",
    name: "Vacuum Orchestrator",
    version: "0.1.0",
    config_flow: true,
    integration_type: "service",
    single_config_entry: true,
    documentation: "https://github.com/hyperfelixations/vacuum-orchestrator",
    is_built_in: false,
    ...overrides,
  };
}

function wireRegistryEntry(entityId, id, overrides = {}) {
  return { entity_id: entityId, id, platform: entityId.split(".")[0], device_id: null, disabled_by: null, hidden_by: null, ...overrides };
}

// An integration error as `api/errors.py` raises it: Home Assistant words it in English from the
// translations and carries code and detail in the translation fields.
function translated(code, detail) {
  return { translation_key: code, translation_domain: DOMAIN, translation_placeholders: { code, detail: detail ?? "" } };
}
const englishText = (code) => EXCEPTIONS.en[code] ?? code;

// Home Assistant error frames as `home-assistant-js-websocket` rejects them.
const haError = Object.freeze({
  serviceValidation: (code, detail = null) => ({ code: "service_validation_error", message: `Validation error: ${englishText(code)}`, ...translated(code, detail) }),
  homeAssistant: (message) => ({ code: "home_assistant_error", message }),
  unauthorized: () => ({ code: "unauthorized", message: "Unauthorized" }),
  unknownCommand: () => ({ code: "unknown_command", message: "Unknown command." }),
  notFound: (message = "Integration not found") => ({ code: "not_found", message }),
  invalidFormat: (message = "extra keys not allowed") => ({ code: "invalid_format", message }),
  voi: (code, detail = null) => ({ code, message: englishText(code), ...translated(code, detail) }),
  connectionLost: () => ({ type: "result", success: false, error: { code: 3, message: "Connection lost" } }),
});

const api = {
  VOI_API_VERSION,
  wireReadiness,
  wireRequirementResult,
  wireJob,
  wireQueueRun,
  wireQueuePage,
  wireJobListPage,
  wirePage,
  wireStamp,
  wireDue,
  wireRelease,
  wireRoom,
  wireRoomRequirement,
  wireRobotConfiguration,
  wireRobotCapabilities,
  wireRobot,
  wireCandidate,
  wireTemplate,
  wireRun,
  wireExecutionRobot,
  wireAttempt,
  wireExecution,
  wireTraceRecord,
  wireTracePage,
  wireDiagnostics,
  wireSubscriptionEvent,
  wireUnloadedEvent,
  wireManifest,
  wireRegistryEntry,
  haError,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.VocWire = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

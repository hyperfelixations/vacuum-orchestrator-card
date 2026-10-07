// Named households for component and browser tests: Home Assistant areas, entity states and
// registry entries plus the integration's seed. All timestamps are relative to FIXED_NOW, the
// instant the browser harness pins. Loads in Node and in the harness (`globalThis.VocScenarios`).
(function (root) {
  "use strict";

  const FIXED_NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
  // As VOI writes them: `isoformat()` of a UTC instant with microseconds.
  const at = (minutes) => `${new Date(FIXED_NOW + minutes * 60000).toISOString().slice(0, 23)}417+00:00`;
  const HOUR = 60;
  const DAY = 24 * HOUR;

  const AREAS = {
    kitchen: { area_id: "kitchen", name: "Kitchen", icon: "mdi:silverware-fork-knife" },
    hall: { area_id: "hall", name: "Hall", icon: "mdi:door" },
    bathroom: { area_id: "bathroom", name: "Bathroom", icon: "mdi:shower" },
    living_room: { area_id: "living_room", name: "Living room", icon: "mdi:sofa" },
    bedroom: { area_id: "bedroom", name: "Bedroom", icon: "mdi:bed" },
  };

  const due = (state, extra = {}) => ({ state, reason: state === "disabled" ? "interval_disabled" : "calendar_interval", elapsed_seconds: null, remaining_seconds: null, due_at: null, quality: null, ...extra });
  const stamp = (minutesAgo, quality = "derived") => ({ receipt_id: `receipt-${minutesAgo}`, completed_at: at(-minutesAgo), quality, occupancy_epoch: 0, occupied_seconds: 0, unknown_seconds: 0, occupancy_baseline_known: true });

  function rooms() {
    return [
      {
        room_id: "room-kitchen", name: "Kitchen", area_id: "kitchen",
        release: { grant_id: "grant-k", kind: "permanent", granted_at: at(-3 * DAY) }, released: true,
        due_policy: { basis: "calendar", vacuum_seconds: 2 * DAY * 60, mop_seconds: 7 * DAY * 60 },
        last_cleaning: { vacuum: stamp(2 * DAY + 3 * HOUR), mop: stamp(4 * DAY, "confirmed") },
        last_confirmed: { mop: stamp(4 * DAY, "confirmed") },
        due: { vacuum: due("due", { elapsed_seconds: (2 * DAY + 3 * HOUR) * 60, remaining_seconds: 0, due_at: at(-3 * HOUR), quality: "derived" }), mop: due("fresh", { elapsed_seconds: 4 * DAY * 60, remaining_seconds: 3 * DAY * 60, due_at: at(3 * DAY), quality: "confirmed" }) },
      },
      {
        room_id: "room-hall", name: "Hall", area_id: "hall",
        release: { grant_id: "grant-h", kind: "queue_run", granted_at: at(-HOUR), queue_run_id: "run-1" }, released: true,
        due_policy: { basis: "calendar", vacuum_seconds: DAY * 60, mop_seconds: null },
        last_cleaning: { vacuum: stamp(5 * HOUR) },
        due: { vacuum: due("fresh", { elapsed_seconds: 5 * HOUR * 60, remaining_seconds: 19 * HOUR * 60, due_at: at(19 * HOUR), quality: "derived" }), mop: due("disabled") },
      },
      {
        room_id: "room-bathroom", name: "Bathroom", area_id: "bathroom",
        requirements: [{ entity_id: "binary_sensor.bathroom_door", accepted_states: ["on"], entity_registry_id: "reg-bathroom-door" }],
        due_policy: { basis: "occupied", vacuum_seconds: 6 * HOUR * 60, mop_seconds: 12 * HOUR * 60, occupancy_entity_id: "binary_sensor.bathroom_occupancy" },
        last_cleaning: { vacuum: stamp(DAY), mop: stamp(3 * DAY) },
        due: { vacuum: due("fresh", { reason: "occupied_interval", elapsed_seconds: 2 * HOUR * 60, remaining_seconds: 4 * HOUR * 60, quality: "derived" }), mop: due("due", { reason: "occupied_interval", elapsed_seconds: 13 * HOUR * 60, remaining_seconds: 0, quality: "derived" }) },
      },
      {
        room_id: "room-living", name: "Living room", area_id: "living_room",
        release: { grant_id: "grant-l", kind: "once", granted_at: at(-2 * HOUR), reserved_job_id: "job-running" },
        due_policy: { basis: "calendar", vacuum_seconds: DAY * 60, mop_seconds: 3 * DAY * 60 },
        last_cleaning: { vacuum: stamp(DAY + 2 * HOUR), mop: stamp(2 * DAY) },
        due: { vacuum: due("due", { elapsed_seconds: (DAY + 2 * HOUR) * 60, remaining_seconds: 0, due_at: at(-2 * HOUR), quality: "derived" }), mop: due("fresh", { elapsed_seconds: 2 * DAY * 60, remaining_seconds: DAY * 60, due_at: at(DAY), quality: "derived" }) },
      },
      {
        room_id: "room-bedroom", name: "Bedroom", area_id: "bedroom",
        due: { vacuum: due("due", { reason: "never_cleaned" }), mop: due("disabled") },
      },
    ];
  }

  const ROCKY_ROLES = { battery: "reg-rocky-battery", status: "reg-rocky-status", current_room: "reg-rocky-room", error: "reg-rocky-error", selected_map: "reg-rocky-map" };

  function robots({ rockyActive = true } = {}) {
    return [
      {
        robot_id: "robot-rocky", name: "Rocky", active: rockyActive,
        configuration: { robot_registry_id: "reg-vacuum-rocky", robot_entity_id: "vacuum.rocky", adapter: "roborock", roles: ROCKY_ROLES, target_areas: ["kitchen", "hall", "living_room"], minimum_battery: 20, preference: 10 },
        capabilities: { operations: ["mop", "vacuum", "vacuum_and_mop"], targets: { "room-kitchen": ["16"], "room-hall": ["17"], "room-living": ["18"], "room-bathroom": ["19"] }, map_context: "map-ground", maximum_passes: 3 },
      },
      {
        robot_id: "robot-dusty", name: "Dusty",
        configuration: { robot_registry_id: "reg-vacuum-dusty", robot_entity_id: "vacuum.dusty", adapter: "home_assistant", source_robot_id: "device_registry:dusty", roles: { battery: "reg-dusty-battery" }, protocol: null, target_areas: ["kitchen", "hall"], allowed_operations: ["vacuum"], fixed_mode: "vacuum" },
        capabilities: { operations: ["vacuum"], targets: { "room-kitchen": ["kitchen"], "room-hall": ["hall"] }, map_context: null, maximum_passes: 1, settings: { vacuum_power: [], mop_intensity: [], mop_route: [] }, unavailable_settings: ["vacuum_power"], supports: { stop: true, return_to_dock: true, pause: false } },
      },
    ];
  }

  function jobs() {
    return [
      { job_id: "job-running", state: "running", name: null, areas: ["living_room"], room_ids: ["room-living"], mode: "vacuum", vacuum_power: "high", created_at: at(-40), updated_at: at(-12), active_attempt_id: "attempt-7", origin: { kind: "manual", template_id: null } },
      { job_id: "job-kitchen", state: "queued", name: "Kitchen and hall", areas: ["kitchen", "hall"], room_ids: ["room-kitchen", "room-hall"], mode: "vacuum_then_mop", vacuum_power: "standard", mop_intensity: "medium", passes: 2, created_at: at(-30), updated_at: at(-30), origin: { kind: "manual", template_id: null }, readiness: { state: "ready" } },
      {
        job_id: "job-bathroom", state: "queued", name: "Bathroom", areas: ["bathroom"], room_ids: ["room-bathroom"], mode: "mop", mop_intensity: "high", mop_route: "deep", settings_policy: "strict", created_at: at(-25), updated_at: at(-25), origin: { kind: "template", template_id: "template-weekly" },
        readiness: { state: "blocked", reason_codes: ["room_not_released", "requirement_not_satisfied"], blocked_room_ids: ["room-bathroom"], requirements: [{ entity_id: "binary_sensor.bathroom_door", state: "blocked", reason: "requirement_not_satisfied", room_id: "room-bathroom", robot_id: null, operation: null }] },
      },
      { job_id: "job-bedroom", state: "queued", name: null, areas: ["bedroom"], room_ids: ["room-bedroom"], mode: "vacuum", created_at: at(-20), updated_at: at(-20), readiness: { state: "unknown", unknown: ["binary_sensor.bedroom_window"], reason_codes: ["requirement_unknown"], requirements: [{ entity_id: "binary_sensor.bedroom_window", state: "unknown", reason: "requirement_unknown", room_id: "room-bedroom", robot_id: null, operation: null }] } },
      { job_id: "job-done", state: "completed", name: "Hall", areas: ["hall"], room_ids: ["room-hall"], mode: "vacuum", created_at: at(-6 * HOUR), updated_at: at(-5 * HOUR), origin: { kind: "template", template_id: "template-daily" } },
      { job_id: "job-failed", state: "failed", name: "Kitchen", areas: ["kitchen"], room_ids: ["room-kitchen"], mode: "mop", created_at: at(-DAY), updated_at: at(-DAY + 20), failure_code: "start_timeout" },
      { job_id: "job-cancelled", state: "cancelled", name: null, areas: ["bedroom"], room_ids: ["room-bedroom"], mode: "vacuum", created_at: at(-2 * DAY), updated_at: at(-2 * DAY + 5) },
    ];
  }

  // Everyday use for the README picture: every room released and reached, one job cleaning and
  // the next ones ready, with no special case.
  function showcase() {
    const released = (room) => (room.released ? room : { ...room, release: { grant_id: `grant-${room.area_id}`, kind: "permanent", granted_at: at(-3 * DAY) }, released: true });
    const reached = (robot) => (robot.robot_id === "robot-rocky" ? { ...robot, capabilities: { ...robot.capabilities, targets: { ...robot.capabilities.targets, "room-bedroom": ["20"] } } } : robot);
    const ready = { state: "ready" };
    const waiting = [
      { job_id: "job-kitchen", state: "queued", name: "Kitchen and hall", areas: ["kitchen", "hall"], room_ids: ["room-kitchen", "room-hall"], mode: "vacuum_then_mop", vacuum_power: "standard", mop_intensity: "medium", created_at: at(-30), updated_at: at(-30), origin: { kind: "manual", template_id: null }, readiness: ready },
      { job_id: "job-bathroom", state: "queued", name: "Bathroom", areas: ["bathroom"], room_ids: ["room-bathroom"], mode: "mop", mop_intensity: "high", created_at: at(-25), updated_at: at(-25), origin: { kind: "template", template_id: "template-weekly" }, readiness: ready },
      { job_id: "job-bedroom", state: "queued", name: "Bedroom", areas: ["bedroom"], room_ids: ["room-bedroom"], mode: "vacuum", vacuum_power: "standard", created_at: at(-20), updated_at: at(-20), origin: { kind: "manual", template_id: null }, readiness: ready },
    ];
    const rest = jobs().filter((job) => job.state !== "queued");
    return household({ mode: "running", run: { run_id: "run-1", started_at: at(-HOUR) }, rooms: rooms().map(released), robots: robots().map(reached), candidates: candidates(), jobs: [rest[0], ...waiting, ...rest.slice(1)], templates: templates().filter((template) => template.enabled !== false), runs: runs() });
  }

  function templates() {
    return [
      { template_id: "template-daily", name: "Daily vacuum", intent: { areas: ["room-kitchen", "room-hall", "room-living"], mode: "vacuum", passes: 1, settings_policy: "best_effort", required_on: [], required_off: [] } },
      { template_id: "template-weekly", name: "Weekly mop", automatic: true, intent: { areas: ["room-kitchen", "room-bathroom"], mode: "vacuum_then_mop", passes: 1, settings_policy: "best_effort", required_on: [], required_off: [], mop_intensity: "high" }, suppressed_room_ids: ["room-bathroom"] },
      { template_id: "template-guests", name: "Before guests", enabled: false, intent: { areas: ["room-living", "room-bedroom"], mode: "vacuum_and_mop", passes: 2, settings_policy: "strict", required_on: [], required_off: [], vacuum_power: "maximum", mop_route: "deep" } },
    ];
  }

  function runs() {
    return [
      { run_id: "robot-run-3", source: "voi", operation: "vacuum", room_ids: ["room-hall"], observed_start: at(-5 * HOUR - 26), observed_end: at(-5 * HOUR), quality: "derived" },
      { run_id: "robot-run-2", source: "external", operation: null, room_ids: [], observed_start: at(-9 * HOUR), observed_end: at(-8 * HOUR - 20), quality: null },
      { run_id: "robot-run-1", source: "voi", operation: "mop", room_ids: ["room-kitchen"], observed_start: at(-DAY), observed_end: at(-DAY + 3), quality: null, failure_code: "start_timeout" },
    ];
  }

  function candidates() {
    return [
      { registry_id: "reg-vacuum-rocky", entity_id: "vacuum.rocky", name: "Rocky", adapter: "roborock", roles: ROCKY_ROLES, ambiguous_roles: [], protocol: "roborock_v1" },
      { registry_id: "reg-vacuum-dusty", entity_id: "vacuum.dusty", name: "Dusty", adapter: "home_assistant", roles: { battery: "reg-dusty-battery" }, ambiguous_roles: ["status"], protocol: null },
    ];
  }

  function trace() {
    return [
      { sequence: 42, timestamp: at(-12), event: "attempt_transition", job_id: "job-running", attempt_id: "attempt-7", robot_id: "robot-rocky", state: "start_confirmed" },
      { sequence: 41, timestamp: at(-13), event: "physical_command", job_id: "job-running", robot_id: "robot-rocky", stage: "requested", command: "start_job" },
      { sequence: 40, timestamp: at(-14), event: "job_transition", job_id: "job-running", state: "dispatching" },
      { sequence: 39, timestamp: at(-25), event: "dispatch_blocked", job_id: "job-bathroom", reason: "room_not_released" },
    ];
  }

  function execution() {
    return {
      "job-bathroom": {
        robots: [
          { robot_id: "robot-rocky", operation: "mop", eligible: false, eligibility_reason: "robot_busy", readiness: { state: "blocked", blocked_room_ids: ["room-bathroom"], reason_codes: ["room_not_released"] }, settings: [{ name: "mop_intensity", requested: "high", applied: "high" }, { name: "mop_route", requested: "deep", applied: "standard" }] },
          { robot_id: "robot-dusty", operation: "mop", eligible: false, eligibility_reason: "unsupported_operation", readiness: { state: "blocked", blocked_room_ids: ["room-bathroom"], reason_codes: ["room_not_released"] } },
        ],
        attempts: [],
      },
      "job-running": {
        robots: [{ robot_id: "robot-rocky", operation: "vacuum", eligible: false, eligibility_reason: "robot_busy", settings: [{ name: "vacuum_power", requested: "high", applied: "high" }] }],
        attempts: [{ attempt_id: "attempt-7", work_unit_id: "unit-7", robot_id: "robot-rocky", state: "start_confirmed", settings: [{ name: "vacuum_power", requested: "high", applied: "high" }] }],
      },
    };
  }

  function haState(entityId, value, attributes = {}) {
    return { entity_id: entityId, state: String(value), attributes, last_changed: at(-30), last_updated: at(-30) };
  }

  function states() {
    return {
      "vacuum.rocky": haState("vacuum.rocky", "cleaning", { friendly_name: "Rocky" }),
      "sensor.rocky_battery": haState("sensor.rocky_battery", 76, { friendly_name: "Rocky Battery", unit_of_measurement: "%" }),
      "sensor.rocky_status": haState("sensor.rocky_status", "segment_cleaning", { friendly_name: "Rocky Status" }),
      "sensor.rocky_current_room": haState("sensor.rocky_current_room", "Living room", { friendly_name: "Rocky Current room" }),
      "sensor.rocky_error": haState("sensor.rocky_error", "none", { friendly_name: "Rocky Error" }),
      "select.rocky_selected_map": haState("select.rocky_selected_map", "Ground floor", { friendly_name: "Rocky Selected map" }),
      "image.rocky_ground_floor": haState("image.rocky_ground_floor", "2026-09-17T11:58:00+00:00", { friendly_name: "Rocky Ground floor", entity_picture: "/test/fixtures/map.svg" }),
      "vacuum.dusty": haState("vacuum.dusty", "docked", { friendly_name: "Dusty" }),
      "sensor.dusty_battery": haState("sensor.dusty_battery", 100, { friendly_name: "Dusty Battery", unit_of_measurement: "%" }),
      "binary_sensor.bathroom_door": haState("binary_sensor.bathroom_door", "off", { friendly_name: "Bathroom door", device_class: "door" }),
      "binary_sensor.bathroom_occupancy": haState("binary_sensor.bathroom_occupancy", "off", { friendly_name: "Bathroom occupancy" }),
      "binary_sensor.bedroom_window": haState("binary_sensor.bedroom_window", "unavailable", { friendly_name: "Bedroom window" }),
      "sensor.queue_mode": haState("sensor.queue_mode", "running", { friendly_name: "Queue mode" }),
      "sensor.queue_length": haState("sensor.queue_length", 3, { friendly_name: "Queue length" }),
      "sensor.active_jobs": haState("sensor.active_jobs", 1, { friendly_name: "Active jobs" }),
      "sensor.jobs_needing_attention": haState("sensor.jobs_needing_attention", 0, { friendly_name: "Jobs needing attention" }),
      "binary_sensor.needs_attention": haState("binary_sensor.needs_attention", "off", { friendly_name: "Needs attention" }),
    };
  }

  const entry = (entityId, id, extra = {}) => ({ entity_id: entityId, id, platform: entityId.split(".")[0], unique_id: `${id}-unique`, device_id: null, disabled_by: null, hidden_by: null, ...extra });

  function registry() {
    return [
      entry("vacuum.rocky", "reg-vacuum-rocky", { platform: "roborock", device_id: "device-rocky" }),
      entry("sensor.rocky_battery", "reg-rocky-battery", { platform: "roborock", device_id: "device-rocky" }),
      entry("sensor.rocky_status", "reg-rocky-status", { platform: "roborock", device_id: "device-rocky" }),
      entry("sensor.rocky_current_room", "reg-rocky-room", { platform: "roborock", device_id: "device-rocky" }),
      entry("sensor.rocky_error", "reg-rocky-error", { platform: "roborock", device_id: "device-rocky" }),
      entry("select.rocky_selected_map", "reg-rocky-map", { platform: "roborock", device_id: "device-rocky" }),
      entry("image.rocky_ground_floor", "reg-rocky-image", { platform: "roborock", device_id: "device-rocky" }),
      entry("vacuum.dusty", "reg-vacuum-dusty", { platform: "matter", device_id: "device-dusty" }),
      entry("sensor.dusty_battery", "reg-dusty-battery", { platform: "matter", device_id: "device-dusty" }),
      entry("binary_sensor.bathroom_door", "reg-bathroom-door", { platform: "zha" }),
      entry("sensor.queue_mode", "reg-voi-mode", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_queue_mode" }),
      entry("sensor.queue_length", "reg-voi-length", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_queue_length" }),
      entry("sensor.active_jobs", "reg-voi-active", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_active_jobs" }),
      entry("sensor.jobs_needing_attention", "reg-voi-attention", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_attention_jobs" }),
      entry("binary_sensor.needs_attention", "reg-voi-needs", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_needs_attention" }),
    ];
  }

  // `live`: Home Assistant states that differ from the reference household.
  function household(seed, live = {}) {
    return { areas: AREAS, states: { ...states(), ...live }, registry: registry(), seed: { registry: registry(), ...seed } };
  }

  const SCENARIOS = {
    typical: () => household({ mode: "running", run: { run_id: "run-1", started_at: at(-HOUR) }, rooms: rooms(), robots: robots(), candidates: candidates(), jobs: jobs(), templates: templates(), runs: runs(), trace: trace(), execution: execution() }),
    windingDown: () => household({ mode: "running", run: { run_id: "run-1", started_at: at(-2 * HOUR), idle_since: at(-3), deadline: at(12) }, rooms: rooms(), robots: robots({ rockyActive: false }), candidates: candidates(), jobs: jobs().filter((job) => job.state !== "running"), templates: templates(), runs: runs() }),
    attention: () => household({
      mode: "paused",
      recoveryTargets: [{ robot_id: "robot-rocky", reason: "physical_run_ownership_uncertain" }],
      rooms: rooms(),
      robots: robots(),
      candidates: candidates(),
      jobs: [...jobs().filter((job) => job.state !== "running"), { job_id: "job-stuck", state: "needs_attention", name: "Living room", areas: ["living_room"], room_ids: ["room-living"], mode: "vacuum", created_at: at(-50), updated_at: at(-10), failure_code: "physical_run_ownership_uncertain" }],
      templates: templates(),
      runs: runs(),
    }),
    empty: () => household({ rooms: rooms(), robots: robots({ rockyActive: false }), candidates: candidates(), jobs: [], templates: templates(), runs: [] }),
    // The run ends once Rocky's job is done; Dusty stopped away from its dock after a cancel.
    ending: () => household(
      { mode: "paused", run: { run_id: "run-1", started_at: at(-HOUR), ending: true }, rooms: rooms(), robots: robots(), candidates: candidates(), jobs: jobs(), templates: templates(), runs: runs(), trace: trace(), execution: execution() },
      { "vacuum.dusty": haState("vacuum.dusty", "idle", { friendly_name: "Dusty" }) }
    ),
    showcase,
    fresh: () => household({ rooms: Object.values(AREAS).map((area) => ({ room_id: `room-${area.area_id}`, name: area.name, area_id: area.area_id })), robots: [], candidates: candidates(), jobs: [], templates: [], runs: [] }),
  };

  // Home Assistant's frontend object for a household, before the fake integration is attached:
  // `entities` is the display registry, `config.components` the loaded integrations.
  function hassFor(household, { language = "en", admin = true } = {}) {
    return {
      states: household.states,
      areas: household.areas,
      entities: Object.fromEntries(household.registry.map((item) => [item.entity_id, { entity_id: item.entity_id, platform: item.platform, device_id: item.device_id }])),
      config: { components: [], time_zone: "UTC" },
      user: { is_admin: admin },
      locale: { language },
      language,
      hassUrl: (path) => path,
    };
  }

  const api = { FIXED_NOW, AREAS, SCENARIOS, at, hassFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VocScenarios = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

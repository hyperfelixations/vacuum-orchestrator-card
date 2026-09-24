"use strict";
// Wire records exactly as Vacuum Orchestrator serializes them. Every layer below the backend
// port is fed from here, so a change to the integration's contract shows up in one place.

function wireJob(overrides = {}) {
  return {
    api_version: 2,
    job_id: "job-1",
    revision: 1,
    state: "queued",
    name: null,
    areas: ["kitchen"],
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
    created_at: "2026-09-17T00:00:00Z",
    updated_at: "2026-09-17T00:00:01Z",
    active_attempt_id: null,
    retries_job_id: null,
    failure_code: null,
    ...overrides,
  };
}

function wireQueuePage(jobs, overrides = {}) {
  return {
    api_version: 2,
    commit_id: 1,
    queue_revision: 1,
    mode: "idle",
    needs_attention: false,
    total: jobs.length,
    offset: 0,
    limit: 50,
    jobs,
    ...overrides,
  };
}

function wireJobListPage(jobs, overrides = {}) {
  return { api_version: 2, total: jobs.length, offset: 0, limit: 50, jobs, ...overrides };
}

function wireRobot(overrides = {}) {
  return {
    robot_id: "robot-1",
    name: "Robot 1",
    adapter: "roborock",
    vacuum_entity_id: "vacuum.robot",
    availability: "available",
    battery_percentage: 87,
    active_job_id: null,
    active_area_id: null,
    blocked_reason: null,
    allowed_area_ids: ["kitchen", "hall"],
    map_image_entity_id: null,
    capabilities: {
      operations: ["vacuum", "mop"],
      max_passes: 3,
      pass_scope: "target_set",
      vacuum_levels: ["low", "high"],
      water_levels: ["medium"],
      mop_routes: ["standard"],
      cancel: true,
    },
    ...overrides,
  };
}

function wireArea(overrides = {}) {
  return {
    area_id: "kitchen",
    last_vacuumed_at: "2026-09-16T10:00:00Z",
    last_mopped_at: "2026-09-15T10:00:00Z",
    vacuum_due_at: "2026-09-18T10:00:00Z",
    mop_due_at: "2026-09-19T10:00:00Z",
    due_state: "clean",
    release_entity_id: null,
    blocking_entity_ids: [],
    open_job_ids: [],
    ...overrides,
  };
}

module.exports = { wireJob, wireQueuePage, wireJobListPage, wireRobot, wireArea };

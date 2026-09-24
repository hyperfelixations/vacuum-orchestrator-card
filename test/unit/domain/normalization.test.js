"use strict";
// How much backend drift the card survives: what it normalizes, what it drops, and what it
// refuses outright. Boundary: one wire record in, one frozen model out; the guards that decide
// whether a record reaches this layer at all are the protocol's own test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob, wireRobot, wireArea } = require("../../fixtures/wire.js");

// A record missing any of these cannot be shown at all, so it is dropped rather than guessed.
test("a job without one of its required facts is refused", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const required = {
    "job id": { job_id: "" },
    revision: { revision: "four" },
    state: { state: "sleeping" },
    areas: { areas: [] },
    "areas of the wrong type": { areas: "kitchen" },
    mode: { mode: "polish" },
    passes: { passes: 0 },
    "passes above the maximum": { passes: 11 },
    "settings policy": { settings_policy: "whatever" },
    "creation time": { created_at: "yesterday" },
    "update time": { updated_at: null },
  };
  for (const [what, override] of Object.entries(required)) {
    assert.equal(normalizeJob(wireJob(override)), null, `a job without a usable ${what}`);
  }
  assert.equal(normalizeJob(null), null);
  assert.equal(normalizeJob([]), null);
  assert.equal(normalizeJob("job-1"), null);
});

test("optional fields keep their value, drop what is unusable, and never reach the model as wire spellings", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const job = normalizeJob(
    wireJob({
      name: "  Kitchen  ",
      vacuum_power: "high",
      mop_intensity: "loud",
      mop_route: "deep",
      source: 5,
      required_on: ["binary_sensor.door", "binary_sensor.door", 7, "  "],
      areas: ["kitchen", "kitchen", "hall"],
      assigned_robot_id: "robot-1",
      started_at: "2026-09-17T00:00:00Z",
      finished_at: 1_758_067_200_000,
      work_units: [{ work_unit_id: "w1", operation: "vacuum", state: "done", area_ids: ["kitchen"] }, { operation: "mop" }],
      unknown_field: true,
    })
  );
  assert.equal(job.name, "Kitchen", "text is trimmed");
  assert.equal(job.vacuumPower, "high");
  assert.equal(job.mopIntensity, null, "an unknown level is dropped, not passed on");
  assert.equal(job.mopRoute, "deep");
  assert.equal(job.source, null, "a non-text value is no text");
  assert.deepEqual([...job.requiredOn], ["binary_sensor.door"], "duplicates and non-entities go");
  assert.deepEqual([...job.areas], ["kitchen", "hall"], "the order survives, the duplicate does not");
  assert.equal(job.assignedRobotId, "robot-1");
  assert.equal(job.startedAt, Date.parse("2026-09-17T00:00:00Z"));
  assert.equal(job.finishedAt, 1_758_067_200_000, "epoch milliseconds are accepted as they are");
  assert.equal(job.workUnits.length, 1, "an unusable work unit is dropped");
  assert.deepEqual([...job.unknownFields], ["unknown_field"]);
  assert.equal("job_id" in job, false, "nothing above this layer sees the wire vocabulary");
  assert.equal(Object.isFrozen(job), true);
});

test("the four cleaning modes accept their wire aliases and nothing else", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const modeOf = (mode) => normalizeJob(wireJob({ mode }))?.mode ?? null;
  assert.equal(modeOf("vac"), "vacuum");
  assert.equal(modeOf("vac_and_mop"), "vacuum_and_mop");
  assert.equal(modeOf("vac_then_mop"), "vacuum_then_mop");
  assert.equal(modeOf("mop"), "mop");
  assert.equal(modeOf("VACUUM"), "vacuum", "case is tolerated on the way in");
  assert.equal(modeOf("scrub"), null, "an unknown word is not a mode");
});

test("every backend error code has exactly one group, and an unknown code stays readable", async () => {
  const { classifyBackendError, ERROR_GROUPS, BACKEND_ERROR_MESSAGE_KEYS } = await import("../../../src/domain/backend-errors.js");
  const groups = new Set(Object.keys(ERROR_GROUPS));
  const seen = new Map();
  for (const code of Object.keys(BACKEND_ERROR_MESSAGE_KEYS)) {
    const classified = classifyBackendError(code);
    assert.ok(groups.has(classified.group), `${code} belongs to a known group`);
    assert.equal(classified.messageKey, BACKEND_ERROR_MESSAGE_KEYS[code]);
    assert.equal(seen.has(code), false, `${code} is classified once`);
    seen.set(code, classified.group);
  }
  for (const sample of ["job_requires_area", "unknown_job", "unsupported_operation", "no_robot_configured", "critical_storage_unreadable", "orchestrator_not_loaded", "unauthorized"]) {
    assert.ok(seen.has(sample), `${sample} is part of the catalogue`);
  }
  for (const unknown of ["something_new", "", null, undefined, 7]) {
    assert.deepEqual(classifyBackendError(unknown), { group: "unknown", messageKey: "error.backend.unknown" });
  }
});

test("an area status keeps the backend's verdict and derives one only where it is absent", async () => {
  const { normalizeAreaStatus, dueState } = await import("../../../src/domain/areas.js");
  const now = Date.parse("2026-09-17T12:00:00Z");
  const past = "2026-09-16T12:00:00Z";
  const future = "2026-09-18T12:00:00Z";

  assert.equal(normalizeAreaStatus(null), null);
  assert.equal(normalizeAreaStatus({ area_id: "  " }), null);

  const status = normalizeAreaStatus(wireArea({ blocking_entity_ids: ["a", "a", 7, " "], open_job_ids: ["job-1"], unknown: 1 }));
  assert.deepEqual([...status.blockingEntityIds], ["a"]);
  assert.deepEqual([...status.openJobIds], ["job-1"]);
  assert.deepEqual([...status.unknownFields], ["unknown"]);

  // The backend's own verdict always wins.
  assert.equal(dueState(normalizeAreaStatus(wireArea({ due_state: "clean", vacuum_due_at: past })), now), "clean");

  const derived = (overrides) => dueState(normalizeAreaStatus(wireArea({ due_state: "nonsense", ...overrides })), now);
  assert.equal(derived({ vacuum_due_at: past, mop_due_at: past }), "both_due");
  assert.equal(derived({ vacuum_due_at: past, mop_due_at: future }), "vacuum_due");
  assert.equal(derived({ vacuum_due_at: future, mop_due_at: past }), "mop_due");
  assert.equal(derived({ vacuum_due_at: future, mop_due_at: future }), "clean");
  assert.equal(derived({ vacuum_due_at: null, mop_due_at: null }), "unknown");
  assert.equal(dueState(normalizeAreaStatus(wireArea({ due_state: "nonsense" })), null), "unknown", "without a clock nothing is derived");
  assert.equal(dueState(null, now), "unknown");
});

test("a robot record is normalized into the card's vocabulary or refused", async () => {
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  assert.equal(normalizeRobot(null), null);
  assert.equal(normalizeRobot({ name: "Robot" }), null, "a robot without an id cannot be addressed");

  const robot = normalizeRobot(wireRobot({ availability: "unheard-of", battery_percentage: "full", allowed_area_ids: ["kitchen", "kitchen"] }));
  assert.equal(robot.availability, "unknown", "an unknown availability is exactly that");
  assert.equal(robot.batteryPercentage, null);
  assert.deepEqual([...robot.allowedAreaIds], ["kitchen"]);
  assert.equal(Object.isFrozen(robot), true);

  const full = normalizeRobot(wireRobot());
  assert.equal(full.availability, "available");
  assert.equal(full.batteryPercentage, 87);
  assert.deepEqual([...full.capabilities.operations], ["vacuum", "mop"]);
  assert.equal(full.capabilities.cancel, true);
});

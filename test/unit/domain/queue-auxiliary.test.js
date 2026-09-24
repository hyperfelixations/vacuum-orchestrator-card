"use strict";
// The queue model and the three smaller normalizers around it: readiness, robots and areas.
// Boundary to job.test.js: that file owns one job, this one owns a page of them.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireArea, wireJob, wireJobListPage, wireQueuePage, wireRobot } = require("../../fixtures/wire.js");

test("queue model computes positions from the page offset and separates registry states", async () => {
  const { buildQueueModel } = await import("../../../src/domain/queue.js");
  const model = buildQueueModel({
    queuePage: wireQueuePage([wireJob({ job_id: "q3" }), wireJob({ job_id: "q4" })], {
      commit_id: 9,
      queue_revision: 3,
      mode: "paused",
      needs_attention: true,
      total: 4,
      offset: 2,
      limit: 2,
    }),
    registryPage: wireJobListPage([
      wireJob({ job_id: "run", state: "running" }),
      wireJob({ job_id: "done", state: "completed" }),
      wireJob({ job_id: "attention", state: "needs_attention" }),
    ]),
  });
  assert.deepEqual(model.pending.map((job) => job.position), [3, 4]);
  assert.deepEqual(model.active.map((job) => job.jobId), ["run"]);
  assert.deepEqual(model.history.map((job) => job.jobId), ["done"]);
  assert.deepEqual(model.attention.map((job) => job.jobId), ["attention"]);
  assert.equal(model.mode, "paused");
  assert.equal(model.commitId, 9);
  assert.equal(model.available, true);
  assert.equal(model.registry.available, true);
});

// Hidden, non-enumerable model fields would silently disappear from any snapshot or clone.
test("the queue model carries its page facts as ordinary fields", async () => {
  const { buildQueueModel } = await import("../../../src/domain/queue.js");
  const model = buildQueueModel({ queuePage: wireQueuePage([]) });
  const keys = Object.keys(model);
  for (const key of ["available", "commitId", "registry", "needsAttention"]) assert.ok(keys.includes(key), key);
  assert.equal(buildQueueModel({}).available, false);
});

test("readiness normalizes to camelCase and summarizes its blocking entities", async () => {
  const { normalizeReadiness, readinessSummary } = await import("../../../src/domain/readiness.js");
  const readiness = normalizeReadiness({ state: "blocked", failed_on: ["a", "a"], failed_off: [], unknown: ["b"] });
  assert.deepEqual(readiness.failedOn, ["a"]);
  assert.equal(readiness.failed_on, undefined);
  assert.deepEqual(readinessSummary(readiness), { state: "blocked", reasonKeys: ["blockedBy", "unknownEntities"], entities: ["a", "b"] });
  assert.equal(normalizeReadiness(null), null);
});

test("readiness drops malformed lists and summarizes absent or overlapping facts", async () => {
  const { normalizeReadiness, readinessSummary } = await import("../../../src/domain/readiness.js");
  const readiness = normalizeReadiness({
    state: "not_ready",
    failed_on: [7, "", " binary_sensor.door ", "binary_sensor.door"],
    failed_off: "binary_sensor.window",
    unknown: ["sensor.floor"],
    source: "backend",
  });
  assert.deepEqual(readiness, {
    state: "unknown",
    failedOn: ["binary_sensor.door"],
    failedOff: [],
    unknown: ["sensor.floor"],
    unknownFields: ["source"],
  });
  assert.deepEqual(readinessSummary(null), { state: "unknown", reasonKeys: [], entities: [] });
  assert.deepEqual(readinessSummary({}), { state: "unknown", reasonKeys: [], entities: [] });
  assert.deepEqual(readinessSummary({ failedOn: ["binary_sensor.door"], failedOff: ["binary_sensor.door"], unknown: ["sensor.floor"] }), {
    state: "unknown",
    reasonKeys: ["blockedBy", "unknownEntities"],
    entities: ["binary_sensor.door", "sensor.floor"],
  });
});

test("robot records clamp the battery and keep their capability snapshot", async () => {
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  const robot = normalizeRobot(wireRobot({ battery_percentage: 120 }));
  assert.equal(robot.batteryPercentage, 100);
  assert.equal(robot.capabilities.maxPasses, 3);
  assert.deepEqual(robot.allowedAreaIds, ["kitchen", "hall"]);
  assert.equal(robot.robot_id, undefined);
  assert.equal(normalizeRobot({ name: "no id" }), null);
});

// The backend's own verdict wins; the derived one needs the caller's clock and must not
// silently answer "clean" when it has no time to compare against.
test("area status keeps the reported due state and derives one only with a clock", async () => {
  const { normalizeAreaStatus, dueState } = await import("../../../src/domain/areas.js");
  const reported = normalizeAreaStatus(wireArea({ due_state: "mop_due" }));
  assert.equal(reported.dueState, "mop_due");
  assert.equal(dueState(reported, Date.parse("2026-09-17T00:00:00Z")), "mop_due");

  const derived = normalizeAreaStatus(wireArea({ due_state: undefined }));
  assert.equal(derived.dueState, null);
  assert.equal(dueState(derived, Date.parse("2026-09-20T00:00:00Z")), "both_due");
  assert.equal(dueState(derived, Date.parse("2026-09-17T00:00:00Z")), "clean");
  assert.equal(dueState(derived, null), "unknown");
});

// A wire job becomes one frozen read model with the integration's readiness explanation. Records
// without identity are dropped; unreadable optional fields degrade to null; unknown states and
// additional fields keep the job visible.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

const load = async () => ({ ...(await import("../../../src/domain/job.js")), ...(await import("../../../src/domain/readiness.js")) });

test("a complete record keeps every field in camelCase with instants as epoch milliseconds", async () => {
  const { normalizeJob } = await load();
  const job = normalizeJob(W.wireJob({ name: " Kitchen ", mode: "vac_then_mop", mop_intensity: "medium", passes: 2, required_on: ["binary_sensor.a", "binary_sensor.a"], readiness: W.wireReadiness() }));
  assert.equal(job.jobId, "job-1");
  assert.equal(job.name, "Kitchen");
  assert.equal(job.mode, "vacuum_then_mop");
  assert.equal(job.mopIntensity, "medium");
  assert.equal(job.passes, 2);
  assert.deepEqual(job.requiredOn, ["binary_sensor.a"]);
  assert.equal(job.createdAt, Date.parse("2026-09-17T00:00:00Z"));
  assert.equal(job.readiness.state, "ready");
  assert.ok(Object.isFrozen(job) && Object.isFrozen(job.readiness));
});

test("room ids are canonical; without them the area aliases stand in", async () => {
  const { normalizeJob } = await load();
  assert.deepEqual(normalizeJob(W.wireJob({ areas: ["kitchen"], room_ids: ["room-kitchen"] })).roomIds, ["room-kitchen"]);
  const legacy = W.wireJob({ areas: ["kitchen", "hall"] });
  delete legacy.room_ids;
  assert.deepEqual(normalizeJob(legacy).roomIds, ["kitchen", "hall"]);
});

test("a record without identity, targets, mode or timestamps is dropped", async () => {
  const { normalizeJob } = await load();
  for (const broken of [{ job_id: "" }, { revision: "1" }, { areas: [] }, { mode: "polish" }, { created_at: "yesterday" }, { updated_at: null }]) {
    assert.equal(normalizeJob(W.wireJob(broken)), null, JSON.stringify(broken));
  }
  assert.equal(normalizeJob(null), null);
  assert.equal(normalizeJob([]), null);
});

test("unreadable optional fields degrade to null instead of a guess", async () => {
  const { normalizeJob } = await load();
  const job = normalizeJob(W.wireJob({ vacuum_power: "turbo", mop_route: 3, passes: 11, settings_policy: "lenient", readiness: "ready" }));
  assert.deepEqual([job.vacuumPower, job.mopRoute, job.passes, job.settingsPolicy, job.readiness], [null, null, null, null, null]);
});

test("an unknown state stays visible as unknown and keeps its wire value", async () => {
  const { normalizeJob } = await load();
  const job = normalizeJob(W.wireJob({ state: "hibernating" }));
  assert.equal(job.state, "unknown");
  assert.equal(job.wireState, "hibernating");
});

test("additional fields are kept as names only", async () => {
  const { normalizeJob } = await load();
  assert.deepEqual(normalizeJob(W.wireJob({ eta_seconds: 30 })).unknownFields, ["eta_seconds"]);
});

test("readiness keeps reason codes, unreleased rooms and requirement results", async () => {
  const { normalizeReadiness } = await load();
  const readiness = normalizeReadiness(W.wireReadiness({
    state: "blocked",
    reason_codes: ["room_not_released", "requirement_not_satisfied"],
    blocked_room_ids: ["room-bathroom"],
    requirements: [W.wireRequirementResult({ state: "blocked", operation: "mop" }), W.wireRequirementResult({ entity_id: "" }), W.wireRequirementResult({ entity_id: "sensor.x", state: "sideways" })],
  }));
  assert.equal(readiness.state, "blocked");
  assert.deepEqual(readiness.blockedRoomIds, ["room-bathroom"]);
  assert.deepEqual(readiness.requirements.map((item) => [item.entityId, item.state, item.operation]), [["binary_sensor.hall_door", "blocked", "mop"], ["sensor.x", "unknown", null]]);
  assert.equal(normalizeReadiness(W.wireReadiness({ state: "maybe" })).state, "unknown");
});

test("problems are ordered blocked, stale, unknown and keep the integration's order within", async () => {
  const { normalizeReadiness, readinessProblems } = await load();
  const readiness = normalizeReadiness(W.wireReadiness({
    state: "blocked",
    requirements: [
      W.wireRequirementResult({ entity_id: "a", state: "unknown" }),
      W.wireRequirementResult({ entity_id: "b", state: "ready" }),
      W.wireRequirementResult({ entity_id: "c", state: "stale" }),
      W.wireRequirementResult({ entity_id: "d", state: "blocked" }),
      W.wireRequirementResult({ entity_id: "e", state: "blocked" }),
    ],
  }));
  assert.deepEqual(readinessProblems(readiness).map((item) => item.entityId), ["d", "e", "c", "a"]);
  assert.deepEqual(readinessProblems(null), []);
});

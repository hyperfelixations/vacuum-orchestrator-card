// The canonical vocabularies and the wire-to-camelCase normalization of a job.
// Boundary: the job record; which actions it permits is decided in job.js.

const test = require("node:test");
const assert = require("node:assert/strict");

test("job schema exposes frozen canonical vocabularies and normalizes wire jobs", async () => {
  const schema = await import("../../../src/domain/job-schema.js");
  const jobModule = await import("../../../src/domain/job.js");

  assert.equal(Object.isFrozen(schema.CLEANING_MODES), true);
  assert.deepEqual(schema.CLEANING_MODES, [
    "vacuum",
    "mop",
    "vacuum_and_mop",
    "vacuum_then_mop",
  ]);
  const job = jobModule.normalizeJob({
    api_version: 2,
    job_id: "job-1",
    revision: 3,
    state: "queued",
    name: "Kitchen",
    areas: ["kitchen", "kitchen", "hall"],
    mode: "vac_then_mop",
    vacuum_power: null,
    mop_intensity: "medium",
    mop_route: "standard",
    passes: 2,
    source: null,
    reason: null,
    note: null,
    dedupe_key: null,
    required_on: [],
    required_off: [],
    settings_policy: "best_effort",
    created_at: "2026-09-17T10:00:00Z",
    updated_at: "2026-09-17T10:01:00Z",
    active_attempt_id: null,
    retries_job_id: null,
    failure_code: null,
    unexpected: "ignored",
  });

  assert.equal(job.jobId, "job-1");
  assert.deepEqual(job.areas, ["kitchen", "hall"]);
  assert.equal(job.mode, "vacuum_then_mop");
  assert.equal(job.createdAt, Date.parse("2026-09-17T10:00:00Z"));
  assert.deepEqual(job.unknownFields, ["unexpected"]);
  assert.equal("unexpected" in job, false);
});

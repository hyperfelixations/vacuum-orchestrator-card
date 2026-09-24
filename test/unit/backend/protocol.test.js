// Every message the card sends and every answer it accepts, checked against the schema.
// Boundary: shapes on the wire; transport and retries belong to the client and store.

const test = require("node:test");
const assert = require("node:assert/strict");

function job() {
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
    updated_at: "2026-09-17T00:00:00Z",
    active_attempt_id: null,
    retries_job_id: null,
    failure_code: null,
  };
}

test("protocol builders emit only contract fields and guards reject schema drift", async () => {
  const protocol = await import("../../../src/backend/protocol.js");
  assert.deepEqual(protocol.queueGetMessage({ offset: 2, limit: 10 }), { type: protocol.WS.QUEUE_GET, offset: 2, limit: 10 });
  assert.deepEqual(protocol.jobsListMessage({ states: ["running"], order: "created_asc" }), { type: protocol.WS.JOBS_LIST, offset: 0, limit: 50, states: ["running"], order: "created_asc" });
  assert.equal(protocol.isJobRecord(job()), true);
  assert.equal(protocol.isQueuePage({ api_version: 2, commit_id: 1, queue_revision: 1, mode: "idle", needs_attention: false, total: 1, offset: 0, limit: 50, jobs: [job()] }), true);
  assert.equal(protocol.isQueuePage({ api_version: 2, commit_id: 1, queue_revision: 1, mode: "idle", needs_attention: false, total: 1, offset: 0, limit: 50, jobs: [{ ...job(), job_id: undefined }] }), false);
  assert.throws(() => protocol.assertResponse({ nope: true }, protocol.isQueuePage), (error) => error.code === "invalid_response" && error.name === "BackendError");
});

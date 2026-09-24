"use strict";
// The job normalizer and the single action policy. Covers the wire-to-domain contract
// (camelCase only, no snake_case aliases) and every reason a control can be unavailable.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob } = require("../../fixtures/wire.js");

const CAPABILITIES = {
  jobMove: true,
  jobUpdate: true,
  jobDelete: true,
  jobStart: true,
  jobCancel: true,
  jobRetry: true,
};

test("normalizeJob canonicalizes the wire record and rejects incomplete ones", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const wire = wireJob({ areas: ["kitchen", "kitchen", "hall"], mode: "vac_then_mop", extra: true });
  const job = normalizeJob(wire);
  assert.deepEqual(job.areas, ["kitchen", "hall"]);
  assert.equal(job.mode, "vacuum_then_mop");
  assert.deepEqual(job.unknownFields, ["extra"]);
  assert.equal(job.createdAt, Date.parse("2026-09-17T00:00:00Z"));
  assert.equal(normalizeJob(wireJob({ updated_at: undefined })), null);
  assert.equal(normalizeJob(wireJob({ areas: [] })), null);
  assert.equal(normalizeJob(wireJob({ passes: 11 })), null);
});

test("normalizing the same wire record twice gives the same frozen job", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const wire = wireJob();
  assert.deepEqual(normalizeJob(wire), normalizeJob(wire));
  assert.equal(Object.isFrozen(normalizeJob(wire)), true);
});

// The domain speaks camelCase only. A snake_case alias would let a consumer bind to the wire
// vocabulary without any test noticing.
test("a normalized job exposes no wire spellings", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const job = normalizeJob(wireJob());
  for (const key of ["job_id", "created_at", "settings_policy", "required_on", "work_units", "api_version"]) {
    assert.equal(job[key], undefined, key);
  }
});

test("jobActions reports boundaries, capabilities, pending targets and read-only users", async () => {
  const { normalizeJob, jobActions } = await import("../../../src/domain/job.js");
  const job = normalizeJob(wireJob());

  const first = jobActions(job, { index: 0, total: 2, capabilities: CAPABILITIES });
  assert.equal(first.moveUp.state, "disabled");
  assert.equal(first.moveUp.reason, "at_boundary");
  assert.equal(first.moveDown.state, "enabled");
  assert.equal(first.start.state, "enabled");
  assert.equal(first.edit.state, "enabled");
  assert.equal(first.cancel.state, "hidden");
  assert.equal(first.retry.state, "hidden");

  const pending = jobActions(job, { index: 1, total: 2, capabilities: CAPABILITIES, pending: new Set([`job:${job.jobId}`]) });
  assert.equal(pending.moveUp.reason, "command_pending");
  assert.equal(pending.edit.reason, "command_pending");

  assert.equal(jobActions(job, { capabilities: CAPABILITIES, canCommand: false }).start.reason, "read_only");
  assert.equal(jobActions(job, { capabilities: {} }).start.reason, "capability_missing");
});

test("jobActions follows the job state for cancel, retry and delete", async () => {
  const { normalizeJob, jobActions } = await import("../../../src/domain/job.js");
  const running = jobActions(normalizeJob(wireJob({ state: "running" })), { capabilities: CAPABILITIES });
  assert.equal(running.cancel.state, "enabled");
  assert.equal(running.delete.state, "hidden");
  assert.equal(running.start.state, "hidden");

  const failed = jobActions(normalizeJob(wireJob({ state: "failed" })), { capabilities: CAPABILITIES });
  assert.equal(failed.retry.state, "enabled");
  assert.equal(failed.delete.state, "enabled");
  assert.equal(failed.edit.state, "hidden");
});

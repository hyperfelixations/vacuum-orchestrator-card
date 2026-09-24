"use strict";
// Invariants over generated wire populations: normalization is stable, update patches carry
// only changed fields, and positions are contiguous from the page offset.

const test = require("node:test");
const assert = require("node:assert/strict");

function wireJob(index, state = "queued") {
  const time = `2026-09-17T00:00:${String(index % 60).padStart(2, "0")}Z`;
  return {
    api_version: 2,
    job_id: `job-${index}`,
    revision: index + 1,
    state,
    name: null,
    areas: [`area-${index}`, `area-${index}`],
    mode: index % 2 ? "vac_then_mop" : "vacuum",
    vacuum_power: null,
    mop_intensity: null,
    mop_route: null,
    passes: (index % 10) + 1,
    source: null,
    reason: null,
    note: null,
    dedupe_key: null,
    required_on: [],
    required_off: [],
    settings_policy: "best_effort",
    created_at: time,
    updated_at: time,
    active_attempt_id: null,
    retries_job_id: null,
    failure_code: null,
  };
}

test("normalization is stable and total over generated valid wire records", async () => {
  const { normalizeJob } = await import("../../src/domain/job.js");
  for (let index = 0; index < 100; index += 1) {
    const wire = wireJob(index);
    const normalized = normalizeJob(wire);
    assert.notEqual(normalized, null, `job-${index}`);
    assert.deepEqual(normalizeJob(wire), normalized);
    assert.equal(new Set(normalized.areas).size, normalized.areas.length);
    assert.equal(Object.keys(normalized).some((key) => key.includes("_")), false, "no wire spelling survives");
  }
});

test("update patches contain no unchanged fields and positions are contiguous", async () => {
  const { createDraft, applyDraftChange, draftToUpdatePatch } = await import("../../src/domain/job-draft.js");
  const { buildQueueModel } = await import("../../src/domain/queue.js");
  const { normalizeJob } = await import("../../src/domain/job.js");
  for (let index = 0; index < 50; index += 1) {
    const job = normalizeJob(wireJob(index));
    const unchanged = draftToUpdatePatch(createDraft(job), job);
    assert.deepEqual(unchanged, {});
    const changed = applyDraftChange(createDraft(job), "passes", ((index + 1) % 10) + 1);
    const patch = draftToUpdatePatch(changed, job);
    assert.equal(Object.keys(patch).includes("areas"), false);
    assert.equal(Object.keys(patch).includes("mode"), false);
    const model = buildQueueModel({ queuePage: { api_version: 2, commit_id: 1, queue_revision: 1, mode: "idle", needs_attention: false, total: 4, offset: index % 3, limit: 2, jobs: [wireJob(index), wireJob(index + 1)] } });
    assert.deepEqual(model.pending.map((item) => item.position), [model.offset + 1, model.offset + 2]);
  }
});

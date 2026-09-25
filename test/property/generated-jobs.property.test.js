"use strict";
// Generated VOI-shaped jobs exercise every public state and cleaning mode.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob } = require("../fixtures/wire.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

test("normalization stays total, immutable and canonical across job populations", async () => {
  const { JOB_STATES, CLEANING_MODES } = await import("../../src/domain/job-schema.js");
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { cases, seed } = propertyRun("FUZZ", 400, "voc-jobs-v1");
  const census = checkGenerated({
    name: "job normalization",
    cases,
    seed,
    generate(random, index) {
      const state = JOB_STATES[index % JOB_STATES.length];
      const mode = CLEANING_MODES[Math.floor(index / JOB_STATES.length) % CLEANING_MODES.length];
      const areas = Array.from({ length: 1 + random.integer(6) }, (_, n) => `area-${n % (1 + random.integer(3))}`);
      return wireJob({ job_id: `job-${index}`, state, mode, areas, passes: 1 + random.integer(10), future_extension: index });
    },
    classify: ({ state, mode }) => `${state}/${mode}`,
    shrink: (wire) => wire.areas.length > 1 ? [{ ...wire, areas: [wire.areas[0]] }] : [],
    verify(wire) {
      const job = normalizeJob(wire);
      assert.ok(job, wire.job_id);
      assert.equal(job.state, wire.state);
      assert.equal(job.mode, wire.mode);
      assert.equal(job.jobId, wire.job_id);
      assert.equal(new Set(job.areas).size, job.areas.length);
      assert.equal(Object.isFrozen(job), true);
      assert.equal(Object.isFrozen(job.areas), true);
      assert.ok(job.unknownFields.includes("future_extension"));
      assert.deepEqual(normalizeJob(wire), job);
      assert.equal(Object.keys(job).some((key) => key.includes("_")), false);
    },
  });
  if (cases >= JOB_STATES.length * CLEANING_MODES.length) {
    assert.equal(Object.keys(census).length, JOB_STATES.length * CLEANING_MODES.length);
  }
});

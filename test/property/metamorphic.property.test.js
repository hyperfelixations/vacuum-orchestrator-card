"use strict";
// Backend order and unknown extensions cannot change the card's established job facts.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob, wireQueuePage, wireJobListPage } = require("../fixtures/wire.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

test("unknown wire extensions change only the extension inventory", async () => {
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { cases, seed } = propertyRun("METAMORPHIC", 240, "voc-metamorphic-v1");
  checkGenerated({
    name: "unknown job extensions",
    cases,
    seed,
    generate: (random, index) => wireJob({ job_id: `job-${index}`, areas: [`area-${random.integer(10)}`], passes: 1 + random.integer(10) }),
    shrink: (wire) => wire.passes > 1 ? [{ ...wire, passes: 1 }] : [],
    verify(wire) {
      const baseline = normalizeJob(wire);
      const extended = normalizeJob({ ...wire, future_backend_field: { value: "opaque" } });
      const { unknownFields: baselineUnknown, ...known } = baseline;
      const { unknownFields: extendedUnknown, ...extendedKnown } = extended;
      assert.deepEqual(extendedKnown, known);
      assert.deepEqual(extendedUnknown, [...baselineUnknown, "future_backend_field"]);
    },
  });
});

test("registry order cannot change pending queue positions or membership", async () => {
  const { buildQueueModel } = await import("../../src/domain/queue.js");
  const { cases, seed } = propertyRun("METAMORPHIC", 240, "voc-metamorphic-v1");
  checkGenerated({
    name: "queue and registry independence",
    cases,
    seed: seed ^ 0x7f4a7c15,
    generate(random, index) {
      const jobs = Array.from({ length: 1 + random.integer(12) }, (_, n) => wireJob({ job_id: `job-${index}-${n}` }));
      const history = Array.from({ length: random.integer(8) }, (_, n) => wireJob({ job_id: `past-${index}-${n}`, state: "completed" }));
      return { jobs, history, offset: random.integer(40) };
    },
    classify: ({ jobs }) => jobs.length <= 4 ? "small" : "large",
    shrink: ({ jobs, history, offset }) => jobs.length > 1 ? [{ jobs: jobs.slice(0, -1), history, offset }] : [],
    verify({ jobs, history, offset }) {
      const queuePage = wireQueuePage(jobs, { offset });
      const first = buildQueueModel({ queuePage, registryPage: wireJobListPage(history) });
      const reversed = buildQueueModel({ queuePage, registryPage: wireJobListPage([...history].reverse()) });
      const projection = (model) => model.pending.map((job) => [job.jobId, job.position]);
      assert.deepEqual(projection(first), projection(reversed));
      assert.deepEqual(first.pending.map((job) => job.position), jobs.map((_, n) => offset + n + 1));
    },
  });
});

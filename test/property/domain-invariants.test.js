// Invariants over generated wire populations: normalization is total, stable and frozen; queue
// positions are contiguous from the page offset; an update patch carries exactly the changed
// fields; a template round-trips through its draft.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../fixtures/voi/wire.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

const MODES = ["vacuum", "vac", "mop", "vacuum_and_mop", "vac_and_mop", "vacuum_then_mop", "vac_then_mop"];
const STATES = ["queued", "dispatching", "running", "canceling", "completed", "failed", "cancelled", "needs_attention", "hibernating"];
const LEVELS = [null, "off", "low", "standard", "medium", "high", "maximum", "auto"];

function generateJob(random, index) {
  const rooms = Array.from({ length: 1 + random.integer(4) }, () => `room-${random.integer(6)}`);
  return W.wireJob({
    job_id: `job-${index}`,
    revision: 1 + random.integer(50),
    state: random.pick(STATES),
    name: random.boolean() ? null : `Job ${index}`,
    areas: rooms.map((room) => room.replace("room-", "area_")),
    room_ids: rooms,
    mode: random.pick(MODES),
    vacuum_power: random.pick(LEVELS),
    mop_intensity: random.pick(LEVELS),
    passes: 1 + random.integer(10),
    required_on: random.boolean() ? ["binary_sensor.door"] : [],
  });
}

test("normalization is total, stable and frozen over generated jobs", async () => {
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { cases, seed } = propertyRun("INVARIANTS", 300, "voc-invariants-v2");
  checkGenerated({
    name: "job normalization",
    cases,
    seed,
    generate: generateJob,
    classify: (wire) => wire.state,
    verify(wire) {
      const job = normalizeJob(wire);
      assert.notEqual(job, null);
      assert.deepEqual(normalizeJob(wire), job);
      assert.ok(Object.isFrozen(job) && Object.isFrozen(job.roomIds));
      assert.equal(new Set(job.roomIds).size, job.roomIds.length);
      assert.equal(Object.keys(job).some((key) => key.includes("_")), false, "no wire spelling survives");
      assert.ok(["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"].includes(job.mode));
    },
  });
});

test("queue positions continue from any page offset without gaps", async () => {
  const { normalizeQueuePage } = await import("../../src/domain/queue.js");
  const { cases, seed } = propertyRun("INVARIANTS", 300, "voc-invariants-v2");
  checkGenerated({
    name: "queue positions",
    cases,
    seed: seed ^ 0x51ed27,
    generate: (random, index) => ({ offset: random.integer(200), jobs: Array.from({ length: random.integer(30) }, (_, n) => generateJob(random, index * 100 + n)) }),
    shrink: ({ offset, jobs }) => (jobs.length ? [{ offset, jobs: jobs.slice(1) }] : []),
    verify({ offset, jobs }) {
      const page = normalizeQueuePage(W.wireQueuePage(jobs, { offset, total: offset + jobs.length }));
      assert.deepEqual(page.jobs.map((job) => job.position), jobs.map((_, n) => offset + n + 1));
    },
  });
});

test("an update patch carries exactly the fields that changed", async () => {
  const { normalizeJob } = await import("../../src/domain/job.js");
  const { createDraft, applyDraftChange, draftToUpdatePatch } = await import("../../src/domain/job-draft.js");
  const { cases, seed } = propertyRun("INVARIANTS", 300, "voc-invariants-v2");
  const CHANGES = {
    passes: (random) => 1 + random.integer(10),
    name: (random) => (random.boolean() ? "" : `Name ${random.integer(9)}`),
    mopRoute: (random) => random.pick([null, "standard", "deep", "fast", "auto"]),
    settingsPolicy: (random) => random.pick(["best_effort", "strict"]),
  };
  const WIRE = { passes: "passes", name: "name", mopRoute: "mop_route", settingsPolicy: "settings_policy" };
  checkGenerated({
    name: "update patches",
    cases,
    seed: seed ^ 0x2545f491,
    generate(random, index) {
      const wire = W.wireJob({ job_id: `job-${index}`, passes: 1 + random.integer(10), mop_route: random.pick([null, "deep"]) });
      const fields = Object.keys(CHANGES).filter(() => random.boolean());
      return { wire, changes: Object.fromEntries(fields.map((field) => [field, CHANGES[field](random)])) };
    },
    verify({ wire, changes }) {
      const job = normalizeJob(wire);
      let draft = createDraft({ target: job });
      for (const [field, value] of Object.entries(changes)) draft = applyDraftChange(draft, field, value);
      const patch = draftToUpdatePatch(draft);
      const changed = Object.entries(changes).filter(([field, value]) => {
        const before = job[field] ?? null;
        const after = field === "name" ? (String(value ?? "").trim() || null) : value;
        return before !== after;
      }).map(([field]) => WIRE[field]).sort();
      assert.deepEqual(Object.keys(patch).sort(), changed);
    },
  });
});

test("a template survives its draft unchanged", async () => {
  const { normalizeTemplate } = await import("../../src/domain/templates.js");
  const { createDraft, draftToTemplate } = await import("../../src/domain/job-draft.js");
  const { cases, seed } = propertyRun("INVARIANTS", 200, "voc-invariants-v2");
  checkGenerated({
    name: "template round trip",
    cases,
    seed: seed ^ 0x1234567,
    generate: (random, index) => W.wireTemplate({
      template_id: `t-${index}`,
      enabled: random.boolean(),
      automatic: random.boolean(),
      intent: { areas: [`room-${random.integer(5)}`], mode: random.pick(["vacuum", "mop", "vacuum_then_mop"]), passes: 1 + random.integer(10), settings_policy: random.pick(["best_effort", "strict"]), required_on: [], required_off: [] },
    }),
    verify(wire) {
      const template = normalizeTemplate(wire);
      const saved = JSON.parse(JSON.stringify(draftToTemplate(createDraft({ kind: "template", target: template }))));
      assert.deepEqual(saved, { name: wire.name, intent: wire.intent, enabled: wire.enabled, automatic: wire.automatic, template_id: wire.template_id });
    },
  });
});

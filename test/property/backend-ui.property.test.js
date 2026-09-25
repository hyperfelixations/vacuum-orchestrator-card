"use strict";
// A state/capability/permission matrix keeps backend transitions authoritative in the UI.

const test = require("node:test");
const assert = require("node:assert/strict");
const { wireJob } = require("../fixtures/wire.js");
const { checkGenerated } = require("./check.js");
const { propertyRun } = require("./run-config.js");

test("all job states stay bounded by permission, capability and in-flight command", async () => {
  const { normalizeJob, jobActions, ACTION_KEYS } = await import("../../src/domain/job.js");
  const { JOB_STATES } = await import("../../src/domain/job-schema.js");
  const full = Object.fromEntries(["jobMove", "jobUpdate", "jobDelete", "jobStart", "jobCancel", "jobRetry"].map((key) => [key, true]));
  let cases = 0;
  for (const state of JOB_STATES) for (const admin of [false, true]) for (const capability of [false, true]) for (const inFlight of [false, true]) {
    const job = normalizeJob(wireJob({ state }));
    const actions = jobActions(job, { index: 1, total: 3, canCommand: admin, capabilities: capability ? full : {}, pending: inFlight ? new Set([`job:${job.jobId}`]) : new Set() });
    assert.deepEqual(Object.keys(actions), [...ACTION_KEYS]);
    for (const [key, decision] of Object.entries(actions)) {
      assert.ok(["enabled", "disabled", "hidden"].includes(decision.state), `${state}/${key}`);
      if (!admin || !capability || inFlight) assert.notEqual(decision.state, "enabled", `${state}/${key}`);
    }
    if (state === "needs_attention") assert.ok(Object.values(actions).every((decision) => decision.state === "hidden"));
    cases += 1;
  }
  assert.equal(cases, JOB_STATES.length * 8);
});

test("queue controls follow backend mode and never bypass the current gate", async () => {
  const { queueActions } = await import("../../src/domain/job.js");
  const expected = { idle: "run_queue", running: "pause_queue", paused: "resume_queue" };
  for (const [mode, command] of Object.entries(expected)) for (const admin of [false, true]) for (const capability of [false, true]) for (const inFlight of [false, true]) {
    const capabilities = Object.fromEntries(["queueRun", "queuePause", "queueResume", "jobCreate"].map((key) => [key, capability]));
    const actions = queueActions({ mode, capabilities, canCommand: admin, pending: inFlight ? new Set(["queue", "create"]) : new Set() });
    assert.equal(actions.queue.command, command);
    if (!admin || !capability || inFlight) assert.notEqual(actions.queue.decision.state, "enabled");
  }
});

test("generated backend UI snapshots preserve permissions and staleness", async () => {
  const { buildCardDomainModel, STALE_AFTER_MS } = await import("../../src/application/card-domain-model.js");
  const { cases, seed } = propertyRun("DISCOVERY", 400, "voc-ui-v1");
  const census = checkGenerated({
    name: "backend UI snapshot",
    cases,
    seed,
    generate(random, index) {
      const state = ["connected", "disconnected", "backend_missing", "incompatible"][index % 4];
      const admin = random.boolean();
      const age = random.integer(STALE_AFTER_MS * 3);
      return { state, admin, age, mode: random.pick(["idle", "running", "paused"]) };
    },
    classify: ({ state }) => state,
    shrink: ({ state, admin, age, mode }) => age > 0 ? [{ state, admin, age: 0, mode }] : [],
    verify({ state, admin, age, mode }) {
      const backendState = { connection: { state, lastUpdatedAt: 1_000_000 - age }, queue: { mode } };
      const original = JSON.stringify(backendState);
      const model = buildCardDomainModel({ backendState, user: { is_admin: admin }, nowMs: 1_000_000 });
      assert.equal(model.permissions.canCommand, admin);
      assert.equal(model.queue.mode, mode);
      assert.equal(model.connection.stale, state === "connected" && age > STALE_AFTER_MS);
      assert.equal(JSON.stringify(backendState), original);
      assert.equal(Object.isFrozen(model), true);
    },
  });
  if (cases >= 4) assert.deepEqual(Object.keys(census).sort(), ["backend_missing", "connected", "disconnected", "incompatible"]);
});

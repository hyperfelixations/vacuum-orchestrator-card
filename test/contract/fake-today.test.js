"use strict";
// The current-backend fake preserves the VOI start and cancellation state transitions.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeOrchestrator } = require("../helpers/fake-orchestrator.js");
const { wireRobot } = require("../fixtures/wire.js");

const JOB = { job_id: "job-1", areas: ["kitchen"], mode: "vacuum" };

test("a direct start with no configured robot refuses the job", async () => {
  const fake = createFakeOrchestrator({ profile: "today", seed: { jobs: [JOB] } });
  assert.deepEqual((({ ok, code }) => ({ ok, code }))(await fake.startJob("job-1")), { ok: false, code: "no_robot_configured" });
  assert.equal(fake.getState().jobs[0].state, "queued");
});

test("a running cancellation waits for observed physical completion", async () => {
  const fake = createFakeOrchestrator({ profile: "today", seed: { jobs: [JOB], robots: [wireRobot()] } });
  await fake.startJob("job-1");
  assert.equal(fake.getState().jobs[0].state, "dispatching");
  await fake.cancelJob("job-1");
  const snapshot = fake.getState();
  assert.equal(snapshot.jobs[0].state, "canceling");
  assert.equal(snapshot.jobs[0].finished_at, null);
  assert.equal(snapshot.robots[0].availability, "busy");
});

test("a queued cancellation is terminal immediately", async () => {
  const fake = createFakeOrchestrator({ profile: "today", seed: { jobs: [JOB] } });
  await fake.cancelJob("job-1");
  assert.equal(fake.getState().jobs[0].state, "cancelled");
  assert.deepEqual(fake.getState().queue, []);
});

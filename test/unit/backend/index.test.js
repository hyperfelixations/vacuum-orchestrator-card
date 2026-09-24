"use strict";
// The backend port end to end against the fake integration.
// Boundary: the port's own promises; the card's use of them is a component test.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeOrchestrator, VirtualClock } = require("../../helpers/fake-orchestrator.js");

async function settle() {
  for (let index = 0; index < 40; index += 1) await Promise.resolve();
}

async function connect(profile, hassOverrides = {}) {
  const { createOrchestratorBackend } = await import("../../../src/backend/index.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile, clock });
  const hass = fake.attachTo(hassOverrides);
  const changes = [];
  const backend = createOrchestratorBackend({ getHass: () => hass, platform: clock, clock, onChange: (state) => changes.push(state) });
  await backend.connect();
  await settle();
  return { backend, fake, hass, changes };
}

test("the port negotiates the target profile and confirms its mutations", async () => {
  const { backend, changes } = await connect("target");
  const before = backend.getState();
  assert.equal(before.connection.state, "connected");
  assert.equal(before.capabilities.values.robotsRead, true);
  assert.equal(before.robots.available, true);
  const created = await backend.createJob({ areas: ["kitchen"], mode: "vacuum" });
  assert.equal(created.ok, true);
  const after = backend.getState();
  assert.equal(after.queue.total, 1);
  assert.equal(after.queue.pending[0].jobId, created.data.job_id);
  assert.ok(changes.length > 0);
  backend.dispose();
});

test("today's backend degrades robot and area reads without inventing data", async () => {
  const { backend } = await connect("today");
  const state = backend.getState();
  assert.equal(state.connection.state, "connected");
  assert.equal(state.capabilities.values.robotsRead, false);
  assert.equal(state.robots.available, false);
  assert.equal(state.areas.available, false);
  assert.equal(state.queue.available, true);
  backend.dispose();
});

// A refusal the card decides itself must not look like a backend failure, and must not reach
// the backend at all.
test("a missing capability refuses the command locally", async () => {
  const { createOrchestratorBackend } = await import("../../../src/backend/index.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "today", clock });
  const hass = fake.attachTo({});
  delete hass.services.vacuum_orchestrator.pause_queue;
  const backend = createOrchestratorBackend({ getHass: () => hass, platform: clock, clock });
  await backend.connect();
  await settle();
  const sent = fake.calls.services.length;
  const result = await backend.pauseQueue();
  assert.equal(result.ok, false);
  assert.equal(result.code, "capability_missing");
  assert.equal(result.group, "client");
  assert.equal(fake.calls.services.length, sent);
  backend.dispose();
});

test("a read-only user cannot command, and the refusal says why", async () => {
  const { backend } = await connect("target", { user: { is_admin: false } });
  const result = await backend.pauseQueue();
  assert.equal(result.ok, false);
  assert.equal(result.code, "unauthorized");
  assert.equal(result.group, "auth");
  backend.dispose();
});

// Home Assistant replaces the hass object on every state change; a captured one goes stale.
test("the port reads hass lazily", async () => {
  const { createOrchestratorBackend } = await import("../../../src/backend/index.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "today", clock });
  let hass = null;
  const backend = createOrchestratorBackend({ getHass: () => hass, platform: clock, clock });
  await backend.connect();
  assert.equal(backend.getState().connection.state, "backend_missing");
  hass = fake.attachTo({});
  backend.syncHass();
  await settle();
  assert.equal(backend.getState().connection.state, "connected");
  backend.dispose();
});

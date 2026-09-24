"use strict";
// The volatile snapshot: page loading, refresh coalescing and one command per target.
// Boundary: state kept between answers; the answers themselves come from the protocol.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeOrchestrator, VirtualClock } = require("../../helpers/fake-orchestrator.js");

async function storeWith({ profile = "target", pageSize } = {}) {
  const { createStore } = await import("../../../src/backend/store.js");
  const { createClient } = await import("../../../src/backend/client.js");
  const { capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile, clock });
  const hass = fake.attachTo({});
  const client = createClient({ getHass: () => hass, platform: clock });
  const snapshots = [];
  const store = createStore({ client, clock, pageSize, onChange: (state) => snapshots.push(state) });
  store.setCapabilities(capabilitiesFrom({ apiVersion: 2, describe: { api_version: 2, integration_version: "t", capabilities: [...fake.getState().capabilities], limits: { max_page_size: 100, max_areas_per_job: 8, max_passes: 10 } } }));
  return { store, fake, snapshots, clock };
}

test("store coalesces refreshes and loads every scope it is allowed to", async () => {
  const { store, snapshots } = await storeWith({});
  const first = store.refresh("all");
  assert.equal(store.refresh("queue"), first, "a second request joins the running one");
  await first;
  const state = store.getState();
  assert.equal(state.queue.available, true);
  assert.equal(state.robots.available, true);
  assert.equal(state.areas.available, true);
  assert.equal(state.connection.state, "connected");
  assert.ok(snapshots.length > 0);
});

// The configured page size is what the user asked for; ignoring it made the option dead.
test("the configured page size reaches the query", async () => {
  const { store, fake } = await storeWith({ pageSize: 7 });
  await store.refresh("queue");
  const queueCalls = fake.calls.ws.filter((message) => message.type === "vacuum_orchestrator/queue/get");
  assert.equal(queueCalls.at(-1).limit, 7);
});

test("only one command per target is in flight, and the refusal is a client code", async () => {
  const { store } = await storeWith({});
  const running = store.executeCommand({ target: "job:1", action: "pause_queue", refreshScopes: "queue" });
  const duplicate = await store.executeCommand({ target: "job:1", action: "pause_queue", refreshScopes: "queue" });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, "command_pending");
  assert.equal(duplicate.group, "client");
  await running;
  assert.equal(store.getState().commands.pending["job:1"], undefined);
});

// An optional query the backend does not know is a capability fact, not an error banner.
test("unknown_command on an optional query clears its capability instead of reporting a failure", async () => {
  const { store } = await storeWith({ profile: "today" });
  const { capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  store.setCapabilities(capabilitiesFrom({ apiVersion: 2, probes: { robotsRead: true } }));
  await store.refresh("robots");
  const state = store.getState();
  assert.equal(state.capabilities.values.robotsRead, false);
  assert.equal(state.diagnostics.some((entry) => entry.code === "backend.query_failed"), false);
});

test("every diagnostic the store records comes from the frozen catalog", async () => {
  const { store } = await storeWith({});
  const { DIAGNOSTIC_SEVERITY } = await import("../../../src/core/diagnostics.js");
  store.setConnection({ state: "reconnecting" });
  for (const entry of store.getState().diagnostics) {
    assert.equal(DIAGNOSTIC_SEVERITY[entry.code], entry.severity, entry.code);
  }
});

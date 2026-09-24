"use strict";
// The live subscription: commit notifications, gap detection, and reconnect with bounded
// backoff. It reads hass lazily, like every other backend module.

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeOrchestrator, VirtualClock } = require("../../helpers/fake-orchestrator.js");

test("subscription reconnects with bounded backoff and requests snapshots for commit gaps", async () => {
  const { createSubscription } = await import("../../../src/backend/subscription.js");
  const clock = new VirtualClock();
  const fake = createFakeOrchestrator({ profile: "target", clock });
  const hass = fake.attachTo({});
  const changes = [];
  const events = [];
  const subscription = createSubscription({ getHass: () => hass, platform: clock, onEvent: (event) => events.push(event), onStateChange: (change) => changes.push(change) });
  await Promise.resolve();
  await fake.createJob({ areas: ["kitchen"], mode: "vacuum" });
  assert.equal(events.length, 1);
  fake.failNext("commit_gap");
  await fake.createJob({ areas: ["hall"], mode: "vacuum" });
  assert.equal(changes.some((item) => item.reason === "commit_gap"), true);
  fake.disconnect();
  assert.equal(changes.some((item) => item.state === "reconnecting"), true);
  clock.advance(1000);
  fake.reconnect();
  await Promise.resolve();
  assert.equal(changes.some((item) => item.reason === "reconnect"), true);
  subscription.dispose();
});


// A subscription that cannot be established, and an event that cannot be believed: both have
// to end in a named state rather than a broken loop.
test("a missing connection and a malformed event both ask for a fresh snapshot", async () => {
  const { createSubscription } = await import("../../../src/backend/subscription.js");
  const { VirtualClock } = require("../../helpers/fake-orchestrator.js");
  const clock = new VirtualClock();

  const withoutConnection = [];
  // A subscription starts itself; without a connection it says so instead of waiting.
  const none = createSubscription({ getHass: () => ({}), platform: clock, onEvent: () => {}, onStateChange: (change) => withoutConnection.push(change) });
  await Promise.resolve();
  assert.equal(none.getState(), "disconnected");
  assert.equal(withoutConnection.at(-1).state, "disconnected");
  assert.equal(withoutConnection.at(-1).reason, "unavailable");
  none.dispose();

  let deliver = null;
  const changes = [];
  const hass = {
    connection: {
      subscribeMessage: (callback) => {
        deliver = callback;
        return () => {};
      },
    },
  };
  const live = createSubscription({ getHass: () => hass, platform: clock, onEvent: () => {}, onStateChange: (change) => changes.push(change) });
  await Promise.resolve();
  assert.equal(live.getState(), "connected");

  deliver({ api_version: 2, mode: "not a mode" });
  assert.equal(changes.at(-1).state, "snapshot_required");
  assert.equal(changes.at(-1).reason, "invalid_event");
  live.dispose();
});

// A consumer that throws is the consumer's problem; the subscription keeps running.
test("a listener that throws does not tear down the subscription", async () => {
  const { createSubscription } = await import("../../../src/backend/subscription.js");
  const { VirtualClock } = require("../../helpers/fake-orchestrator.js");
  const clock = new VirtualClock();
  let deliver = null;
  const hass = { connection: { subscribeMessage: (callback) => { deliver = callback; return () => { throw new Error("stale handle"); }; } } };
  const seen = [];
  const subscription = createSubscription({
    getHass: () => hass,
    platform: clock,
    onEvent: (event) => {
      seen.push(event.commit_id);
      throw new Error("consumer failed");
    },
    onStateChange: () => {},
  });
  await Promise.resolve();
  const event = { api_version: 2, commit_id: 1, queue_revision: 1, mode: "idle", pending_jobs: 0, needs_attention: false };
  deliver(event);
  deliver({ ...event, commit_id: 2 });
  assert.deepEqual(seen, [1, 2], "the second event still arrives");
  // Disposing over a handle that throws is survivable too.
  subscription.dispose();
});

// The fake connection treats a message as home-assistant-js-websocket does: it writes the
// command id into the message object, so a message Home Assistant may not change never arrives.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeOrchestrator, VirtualClock } = require("../helpers/fake-orchestrator.js");
const { SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

function connected() {
  const household = SCENARIOS.typical();
  const fake = createFakeOrchestrator({ seed: household.seed, clock: new VirtualClock() });
  return { fake, hass: fake.attachTo(hassFor(household)) };
}

const QUEUE = { type: "vacuum_orchestrator/queue/get", offset: 0, limit: 1 };
const SUBSCRIBE = { type: "vacuum_orchestrator/subscribe" };

test("a command carries the connection's id; the integration sees the message without it", async () => {
  const { fake, hass } = connected();
  const message = { ...QUEUE };
  await hass.callWS(message);
  const other = { ...QUEUE };
  await hass.connection.sendMessagePromise(other);
  assert.ok(Number.isInteger(message.id) && other.id === message.id + 1);
  assert.deepEqual(fake.calls.ws, [QUEUE, QUEUE]);
});

test("a frozen command is rejected with the error of the id assignment and never arrives", async () => {
  const { fake, hass } = connected();
  await assert.rejects(hass.callWS(Object.freeze({ ...QUEUE })), TypeError);
  await assert.rejects(hass.connection.sendMessagePromise(Object.freeze({ ...QUEUE })), TypeError);
  assert.deepEqual(fake.calls.ws, []);
});

test("a frozen subscription never answers and never subscribes", async () => {
  const { fake, hass } = connected();
  const pending = hass.connection.subscribeMessage(() => {}, Object.freeze({ ...SUBSCRIBE }));
  const outcome = await Promise.race([pending.then(() => "settled", () => "settled"), new Promise((resolve) => setImmediate(() => resolve("pending")))]);
  assert.equal(outcome, "pending");
  assert.equal(fake.subscriberCount(), 0);
  assert.deepEqual(fake.calls.ws, []);
});

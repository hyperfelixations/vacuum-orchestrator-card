// The recording player's connection treats a message as home-assistant-js-websocket does: it
// writes the command id into the message object, so a message Home Assistant may not change never
// arrives. The card must hand over messages it does not freeze.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecordedBackend } = require("../helpers/recorded-backend.js");
const { loadRecording } = require("../helpers/recordings.js");

const connected = () => createRecordedBackend(loadRecording("showcase"), { from: "A busy afternoon" });
const QUEUE = { type: "vacuum_orchestrator/queue/get", offset: 0, limit: 1 };
const SUBSCRIBE = { type: "vacuum_orchestrator/subscribe" };

test("a command carries the connection's id; the integration sees the message without it", async () => {
  const backend = connected();
  const message = { ...QUEUE };
  await backend.hass.callWS(message);
  const other = { ...QUEUE };
  await backend.hass.connection.sendMessagePromise(other);
  assert.ok(Number.isInteger(message.id) && other.id === message.id + 1);
  assert.deepEqual(backend.calls, [QUEUE, QUEUE]);
});

test("a frozen command is rejected with the error of the id assignment and never arrives", async () => {
  const backend = connected();
  await assert.rejects(backend.hass.callWS(Object.freeze({ ...QUEUE })), TypeError);
  await assert.rejects(backend.hass.connection.sendMessagePromise(Object.freeze({ ...QUEUE })), TypeError);
  assert.deepEqual(backend.calls, []);
});

test("a frozen subscription never answers and never subscribes", async () => {
  const backend = connected();
  const pending = backend.hass.connection.subscribeMessage(() => {}, Object.freeze({ ...SUBSCRIBE }));
  const outcome = await Promise.race([pending.then(() => "settled", () => "settled"), new Promise((resolve) => setImmediate(() => resolve("pending")))]);
  assert.equal(outcome, "pending");
  assert.deepEqual(backend.calls, []);
});

// The transport is the only path to Home Assistant: it reads the newest hass object per call,
// never rejects, times requests out and returns action responses only when asked for one.

const test = require("node:test");
const assert = require("node:assert/strict");
const { VirtualClock } = require("../../helpers/fake-orchestrator.js");
const { haError } = require("../../fixtures/voi/wire.js");

const load = () => import("../../../src/backend/transport.js");

function platformOf(clock) {
  return { setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle) };
}

test("a WebSocket message goes through the hass object current at call time", async () => {
  const { createTransport } = await load();
  let hass = { callWS: async () => "first" };
  const transport = createTransport({ getHass: () => hass, platform: platformOf(new VirtualClock()) });
  assert.deepEqual({ ...(await transport.ws({ type: "x" })) }, { ok: true, data: "first" });
  hass = { connection: { sendMessagePromise: async (message) => `second:${message.type}` } };
  assert.equal((await transport.ws({ type: "y" })).data, "second:y");
});

test("a rejection becomes a failure record instead of a thrown error", async () => {
  const { createTransport } = await load();
  const transport = createTransport({ getHass: () => ({ callWS: async () => Promise.reject(haError.voi("unknown_job")) }) });
  const result = await transport.ws({ type: "x" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unknown_job");
  assert.equal(result.channel, "ws");
});

test("without a connection every call fails as connection_lost", async () => {
  const { createTransport } = await load();
  const transport = createTransport({ getHass: () => null });
  assert.equal((await transport.ws({ type: "x" })).code, "connection_lost");
  assert.equal((await transport.service("run_queue")).code, "connection_lost");
  assert.equal((await transport.subscribe({ type: "x" }, () => {})).code, "connection_lost");
});

test("an action returns its response only when one was requested", async () => {
  const { createTransport, DOMAIN } = await load();
  const calls = [];
  const hass = { callService: async (...args) => { calls.push(args); return { context: {}, response: { job_id: "job-1" } }; } };
  const transport = createTransport({ getHass: () => hass });
  assert.deepEqual({ ...(await transport.service("create_job", { areas: ["kitchen"] }, { returnResponse: true })) }, { ok: true, data: { job_id: "job-1" } });
  assert.equal((await transport.service("pause_queue")).data, null);
  assert.deepEqual(calls[0], [DOMAIN, "create_job", { areas: ["kitchen"] }, undefined, false, true]);
  assert.equal(calls[1][5], false);
});

test("without callService an action travels as a call_service message", async () => {
  const { createTransport } = await load();
  const sent = [];
  const hass = { connection: { sendMessagePromise: async (message) => { sent.push(message); return { response: { ok: 1 } }; } } };
  const result = await createTransport({ getHass: () => hass }).service("retry_job", { job_id: "j" }, { returnResponse: true });
  assert.deepEqual(sent, [{ type: "call_service", domain: "vacuum_orchestrator", service: "retry_job", service_data: { job_id: "j" }, return_response: true }]);
  assert.deepEqual(result.data, { ok: 1 });
});

test("a request without an answer times out on the platform clock", async () => {
  const { createTransport } = await load();
  const clock = new VirtualClock();
  const transport = createTransport({ getHass: () => ({ callWS: () => new Promise(() => {}) }), platform: platformOf(clock), timeoutMs: 1000 });
  const pending = transport.ws({ type: "x" });
  clock.advance(999);
  let settled = false;
  pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  clock.advance(1);
  const result = await pending;
  assert.equal(result.code, "timeout");
  assert.equal(clock.timers.size, 0);
});

test("an answer in time clears its timer", async () => {
  const { createTransport } = await load();
  const clock = new VirtualClock();
  const transport = createTransport({ getHass: () => ({ callWS: async () => 1 }), platform: platformOf(clock), timeoutMs: 1000 });
  await transport.ws({ type: "x" });
  assert.equal(clock.timers.size, 0);
});

test("subscribing hands back the unsubscribe function and connection events reach listeners", async () => {
  const { createTransport } = await load();
  const listeners = {};
  const connection = {
    subscribeMessage: async (callback, message) => { connection.last = { callback, message }; return () => "unsubscribed"; },
    addEventListener: (name, listener) => { listeners[name] = listener; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const transport = createTransport({ getHass: () => ({ connection }) });
  const events = [];
  const result = await transport.subscribe({ type: "vacuum_orchestrator/subscribe" }, (event) => events.push(event));
  assert.equal(result.data(), "unsubscribed");
  connection.last.callback({ commit_id: 1 });
  assert.deepEqual(events, [{ commit_id: 1 }]);
  const stop = transport.onConnection("ready", () => {});
  assert.equal(typeof listeners.ready, "function");
  stop();
  assert.equal(listeners.ready, undefined);
});

test("a disposed transport sends nothing", async () => {
  const { createTransport } = await load();
  let calls = 0;
  const transport = createTransport({ getHass: () => ({ callWS: async () => { calls += 1; } }) });
  transport.dispose();
  assert.equal((await transport.ws({ type: "x" })).code, "connection_lost");
  assert.equal(calls, 0);
  assert.equal(transport.connection(), null);
});

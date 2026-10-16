// The shared session against the integration's recordings on a virtual clock: connection phases,
// demand-driven loading, coalesced invalidation, runtime changes and reloads followed through the
// subscription, the retry outside ready, reconnects, the command contract and the integration's
// clock. Events and failures the recordings do not contain are laid over them at the transport.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecordedBackend } = require("../../helpers/recorded-backend.js");
const { loadRecording } = require("../../helpers/recordings.js");
const { VirtualClock } = require("../../helpers/virtual-clock.js");
const { haError } = require("../../helpers/voi-records.js");

const DOMAIN = "vacuum_orchestrator";
const MUTATIONS = new Set(["call_service", `${DOMAIN}/configuration/command`]);

// Promise chains, and the replayer's frames that arrive in a later task.
const tick = async (rounds = 12) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

const matches = (message, match) => Object.entries(match).every(([key, value]) => JSON.stringify(message[key]) === JSON.stringify(value));

// The commands a recording continues with after a mark, as the card sends them through the session.
function recordedCommands(name, from) {
  const steps = loadRecording(name).steps;
  const start = steps.findIndex((step) => step.mark === from);
  return steps.slice(start).filter((step) => step.send && MUTATIONS.has(step.send.type)).map(({ send }) => (send.type === "call_service" ? { operation: send.service, parameters: send.service_data } : { operation: send.command, parameters: send.parameters }));
}

// The integration's last event before a mark: the shape and runtime later events share.
function lastEventBefore(name, from) {
  const steps = loadRecording(name).steps;
  const end = steps.findIndex((step) => step.mark === from);
  return steps.slice(0, end).filter((step) => step.receive?.type === "event" && step.receive.event.loaded).map((step) => step.receive.event).at(-1);
}

async function setup({ recording = "showcase", from = "A quiet afternoon", hidden = () => false } = {}) {
  const { createTransport } = await import("../../../src/backend/transport.js");
  const { createSession, RETRY_MS, UNLOADED_GRACE_MS } = await import("../../../src/backend/session.js");
  const { QUIET_MS } = await import("../../../src/backend/subscription.js");
  const clock = new VirtualClock(0);
  const backend = createRecordedBackend(loadRecording(recording), { from, clock });
  clock.time = backend.nowMs;
  const sent = [];
  const failures = [];
  const rewrites = [];
  const commands = recordedCommands(recording, from);
  const recordedEvent = lastEventBefore(recording, from);
  let listener = null;
  let unsubscribed = 0;
  let patch = null;
  const connection = {
    sendMessagePromise(message) {
      sent.push(message);
      const failure = failures.findIndex((entry) => matches(message, entry.match));
      if (failure !== -1) return Promise.reject(failures.splice(failure, 1)[0].error);
      const answer = backend.hass.connection.sendMessagePromise(message);
      const rewrite = rewrites.find((entry) => matches(message, entry.match));
      return rewrite ? answer.then((value) => ({ ...value, ...rewrite.fields })) : answer;
    },
    async subscribeMessage(callback, message) {
      sent.push(message);
      const failure = failures.findIndex((entry) => matches(message, entry.match));
      if (failure !== -1) throw failures.splice(failure, 1)[0].error;
      listener = callback;
      const release = await backend.hass.connection.subscribeMessage(callback, message);
      return () => {
        unsubscribed += 1;
        listener = null;
        release();
      };
    },
    addEventListener: (name, handler) => backend.hass.connection.addEventListener(name, handler),
    removeEventListener: (name, handler) => backend.hass.connection.removeEventListener(name, handler),
  };
  // Home Assistant's `callService`, through the same connection.
  function callService(domain, service, serviceData, target, _notify, returnResponse) {
    const message = { type: "call_service", domain, service, service_data: serviceData ?? {} };
    if (target !== undefined) message.target = target;
    if (returnResponse) message.return_response = true;
    return connection.sendMessagePromise(message);
  }
  // One hass object per state of the recording, as the frontend hands them out.
  let base = null;
  let hass = null;
  const getHass = () => {
    if (backend.hass !== base || hass === null) {
      base = backend.hass;
      hass = { ...base, connection, callWS: (message) => connection.sendMessagePromise(message), callService, ...(patch?.(base) ?? {}) };
    }
    return hass;
  };
  const platform = { now: () => clock.now(), monotonicNow: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle), isDocumentHidden: hidden };
  const session = createSession({ transport: createTransport({ getHass, platform }), platform, getHass });
  const count = (match) => sent.filter((message) => matches(message, match)).length;
  const env = {
    clock,
    backend,
    session,
    sent,
    RETRY_MS,
    UNLOADED_GRACE_MS,
    QUIET_MS,
    queries: (name) => count({ type: `${DOMAIN}/configuration/get`, query: name }),
    count,
    get unsubscribed() {
      return unsubscribed;
    },
    // The next request like `match` fails with `error`, as Home Assistant rejects it.
    failNext: (match, error) => failures.push({ match, error }),
    // Every answer to a request like `match` carries `fields` instead of the recorded ones.
    rewrite: (match, fields) => rewrites.push({ match, fields }),
    // Home Assistant's frontend object changes beyond the recording.
    patchHass(next) {
      patch = next;
      hass = null;
    },
    get hass() {
      return getHass();
    },
    // An event of the subscription; by default the next sequence of the integration's runtime.
    emit(fields = {}) {
      const runtime = session.getSnapshot().runtime;
      const sequence = Math.max(runtime.sequence ?? 0, recordedEvent.runtime_sequence) + 1;
      listener?.({ ...recordedEvent, runtime_id: runtime.id ?? recordedEvent.runtime_id, runtime_sequence: sequence, server_time: new Date(clock.now()).toISOString(), changed: ["queue"], ...fields });
    },
    async advance(ms) {
      clock.advance(ms);
      await tick();
    },
    async start() {
      session.syncHass();
      await tick();
    },
    // The recording's next command, sent through the session.
    send(options = {}) {
      const { operation, parameters } = commands.shift();
      return session.command(operation, parameters, options);
    },
    next: () => commands[0],
    snapshot: () => session.getSnapshot(),
  };
  return env;
}

const scope = (snapshot, key) => snapshot.scopes[key];
const QUEUE_GET = { type: `${DOMAIN}/queue/get` };
const NOT_LOADED = () => haError.voi("orchestrator_not_loaded");

test("a working integration reaches ready with a live subscription and its version", async () => {
  const env = await setup();
  assert.equal(env.snapshot().phase, "probing");
  await env.start();
  const snapshot = env.snapshot();
  assert.equal(snapshot.phase, "ready");
  assert.equal(snapshot.apiVersion, 4);
  assert.equal(snapshot.subscription, "live");
  assert.equal(env.count({ type: `${DOMAIN}/subscribe` }), 1);
  assert.equal(env.count({ type: "manifest/get" }), 0, "the queue names the version");
  env.session.dispose();
});

test("the live values follow the integration's events, counts included", async () => {
  const env = await setup();
  await env.start();
  env.emit({ active_count: 1, attention_count: 1, pending_jobs: 2, needs_attention: true });
  await env.advance(env.QUIET_MS);
  const live = env.snapshot().live;
  assert.deepEqual([live.activeCount, live.attentionCount, live.pendingJobs, live.needsAttention], [1, 1, 2, true]);
  env.session.dispose();
});

test("each way the integration can be unusable is its own phase", async () => {
  const notInstalled = await setup({ recording: "not_installed", from: "Vacuum Orchestrator is not installed" });
  await notInstalled.start();
  assert.equal(notInstalled.snapshot().phase, "not_installed");
  notInstalled.session.dispose();
  const notSetUp = await setup({ recording: "setup", from: "Vacuum Orchestrator is installed but not set up" });
  await notSetUp.start();
  assert.equal(notSetUp.snapshot().phase, "not_set_up");
  notSetUp.session.dispose();
  const unloaded = await setup();
  unloaded.failNext(QUEUE_GET, NOT_LOADED());
  await unloaded.start();
  assert.equal(unloaded.snapshot().phase, "load_failed");
  unloaded.session.dispose();
  const older = await setup();
  older.rewrite(QUEUE_GET, { api_version: 3 });
  await older.start();
  assert.deepEqual([older.snapshot().phase, older.snapshot().phaseFailure.detail], ["api_incompatible", "3"]);
  older.session.dispose();
});

test("only a lost connection is offline; any other failed check is check_failed with its failure", async () => {
  const notInstalled = { recording: "not_installed", from: "Vacuum Orchestrator is not installed" };
  const cases = [
    [notInstalled, { type: "manifest/get" }, haError.connectionLost(), "offline", "connection_lost"],
    [notInstalled, { type: "manifest/get" }, haError.homeAssistant("Boom"), "check_failed", "unknown"],
    [{}, { type: `${DOMAIN}/subscribe` }, haError.connectionLost(), "offline", "connection_lost"],
    [{}, { type: `${DOMAIN}/subscribe` }, haError.unauthorized(), "check_failed", "unauthorized"],
    [{}, QUEUE_GET, haError.connectionLost(), "offline", "connection_lost"],
    [{}, QUEUE_GET, haError.homeAssistant("Boom"), "check_failed", "unknown"],
  ];
  for (const [options, match, error, phase, code] of cases) {
    const env = await setup(options);
    env.failNext(match, error);
    await env.start();
    assert.deepEqual([env.snapshot().phase, env.snapshot().phaseFailure?.code], [phase, code], `${match.type} ${code}`);
    env.session.dispose();
  }
});

test("a failed check is retried and reaches the phase the integration is in", async () => {
  const env = await setup();
  env.failNext(QUEUE_GET, haError.homeAssistant("Boom"));
  await env.start();
  assert.equal(env.snapshot().phase, "check_failed");
  await env.advance(env.RETRY_MS);
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("a scope loads once while any owner demands it and is not loaded before", async () => {
  const env = await setup();
  await env.start();
  assert.equal(env.queries("get_rooms"), 0);
  env.session.setDemand("card-a", [{ name: "rooms" }]);
  env.session.setDemand("card-b", [{ name: "rooms" }, { name: "unknown-scope" }]);
  await tick();
  assert.equal(env.queries("get_rooms"), 1);
  assert.equal(scope(env.snapshot(), "rooms|{}").status, "ready");
  env.session.setDemand("card-a", [{ name: "rooms" }]);
  await tick();
  assert.equal(env.queries("get_rooms"), 1, "an unchanged demand loads nothing");
  env.session.dispose();
});

test("a burst of commits reloads demanded scopes once after a quiet gap", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  for (let index = 0; index < 3; index += 1) env.emit({ changed: ["rooms"] });
  await tick();
  assert.equal(env.queries("get_rooms"), 1, "nothing reloads before the quiet gap");
  const sequence = env.snapshot().runtime.sequence;
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 2);
  assert.equal(env.snapshot().runtime.sequence, sequence, "the newest event names the runtime's sequence");
  env.session.dispose();
});

test("an event reloads only the scopes reading the views it names, and the volatile ones", async () => {
  const env = await setup({ from: "A busy afternoon" });
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }, { name: "templates" }, { name: "diagnostics" }, { name: "setup" }]);
  await tick();
  env.emit({ changed: ["rooms"] });
  await env.advance(env.QUIET_MS);
  assert.deepEqual([env.queries("get_rooms"), env.queries("get_templates"), env.queries("get_diagnostics"), env.queries("get_setup")], [2, 1, 2, 1]);
  env.emit({ changed: ["queue"] });
  env.emit({ changed: ["templates"] });
  env.emit({ changed: ["setup"] });
  await env.advance(env.QUIET_MS);
  assert.deepEqual([env.queries("get_rooms"), env.queries("get_templates"), env.queries("get_setup")], [2, 2, 2], "a burst reloads the union of its views");
  env.session.dispose();
});

test("an event naming an unknown view, or none, reloads everything", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }, { name: "templates" }]);
  await tick();
  env.emit({ changed: ["future_view"] });
  await env.advance(env.QUIET_MS);
  assert.deepEqual([env.queries("get_rooms"), env.queries("get_templates")], [2, 2]);
  env.emit({ changed: null });
  await env.advance(env.QUIET_MS);
  assert.deepEqual([env.queries("get_rooms"), env.queries("get_templates")], [3, 3]);
  env.session.dispose();
});

test("a scope already read at the event's sequence is not read again", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  const { id, sequence } = env.snapshot().runtime;
  env.rewrite({ type: `${DOMAIN}/configuration/get`, query: "get_rooms" }, { runtime_id: id, runtime_sequence: sequence + 1 });
  env.session.reload("rooms");
  await tick();
  assert.equal(env.queries("get_rooms"), 2);
  env.emit({ changed: ["rooms"], runtime_sequence: sequence + 1 });
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 2);
  env.session.dispose();
});

test("a confirmed command and the event of its commit read the queue once", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "queue", params: { offset: 0, limit: 25 } }]);
  await tick();
  const before = env.count(QUEUE_GET);
  const released = await env.send({ target: "room:a", invalidates: ["queue"] });
  assert.equal(typeof released.data.commit_id, "number");
  await env.advance(env.QUIET_MS);
  assert.equal(env.count(QUEUE_GET), before + 1);
  env.session.dispose();
});

test("a command does not reload a scope that already shows its commit", async () => {
  const env = await setup();
  await env.start();
  const { id } = env.snapshot().runtime;
  env.rewrite({ type: `${DOMAIN}/configuration/get`, query: "get_rooms" }, { runtime_id: id, runtime_sequence: 10_000, commit_id: 10_000 });
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  await env.send({ target: "room:a", invalidates: ["rooms"] });
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 1, "rooms were read after the commit");
  env.session.dispose();
});

test("a readiness change without a commit reloads as well; a repeated sequence does not", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "queue", params: { offset: 0, limit: 25 } }]);
  await tick();
  const before = env.count(QUEUE_GET);
  env.emit({ changed: ["queue"] });
  await env.advance(env.QUIET_MS);
  const after = env.count(QUEUE_GET);
  assert.equal(after, before + 1);
  env.emit({ runtime_sequence: 1 });
  await env.advance(env.QUIET_MS);
  assert.equal(env.count(QUEUE_GET), after);
  env.session.dispose();
});

test("an event from a new runtime reloads everything at once", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  env.emit({ changed: ["rooms"] });
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 2);
  env.emit({ runtime_id: "runtime-9", runtime_sequence: 1 });
  await tick();
  assert.equal(env.queries("get_rooms"), 3, "no quiet gap for a new runtime");
  assert.equal(env.snapshot().runtime.id, "runtime-9");
  env.session.dispose();
});

test("the probe takes the runtime identity from the queue it reads", async () => {
  const env = await setup();
  await env.start();
  const probe = await env.backend.hass.connection.sendMessagePromise({ type: `${DOMAIN}/queue/get`, offset: 0, limit: 1 });
  assert.deepEqual({ ...env.snapshot().runtime }, { id: probe.runtime_id, sequence: probe.runtime_sequence, commitId: probe.commit_id });
  env.session.dispose();
});

test("an unloaded runtime sends the session back to probing", async () => {
  const env = await setup();
  await env.start();
  env.emit({ loaded: false });
  await tick();
  assert.equal(env.snapshot().phase, "probing");
  assert.equal(env.snapshot().live, null);
  env.session.dispose();
});

test("a reloaded integration is followed through the subscription to its new runtime", async () => {
  const env = await setup({ recording: "reload", from: "The card opens" });
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  const before = env.snapshot().runtime.id;
  await env.send({ target: "create" });
  env.backend.until("Home Assistant reloads the integration");
  env.session.syncHass();
  await tick();
  assert.equal(env.snapshot().phase, "ready");
  assert.notEqual(env.snapshot().runtime.id, before);
  assert.equal(env.count({ type: `${DOMAIN}/subscribe` }), 1, "the subscription outlives the runtime");
  assert.ok(env.queries("get_rooms") >= 2, "the new runtime is read again");
  env.session.dispose();
});

test("an integration that stays unloaded is a load failure after a grace period, and its return is followed", async () => {
  const env = await setup();
  await env.start();
  env.emit({ loaded: false });
  env.failNext(QUEUE_GET, NOT_LOADED());
  await env.advance(env.UNLOADED_GRACE_MS - 1);
  assert.equal(env.snapshot().phase, "probing");
  await env.advance(1);
  assert.equal(env.snapshot().phase, "load_failed");
  env.emit();
  await tick();
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("an integration that loads after the card is followed without a retry", async () => {
  const env = await setup();
  env.failNext(QUEUE_GET, NOT_LOADED());
  await env.start();
  assert.equal(env.snapshot().phase, "load_failed");
  assert.equal(env.snapshot().subscription, "live");
  env.emit();
  await tick();
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("an incompatible integration is not probed again on each of its events", async () => {
  const env = await setup();
  env.rewrite(QUEUE_GET, { api_version: 3 });
  await env.start();
  assert.equal(env.snapshot().phase, "api_incompatible");
  const before = env.count(QUEUE_GET);
  env.emit();
  await tick();
  assert.equal(env.count(QUEUE_GET), before);
  env.session.dispose();
});

test("ready sends no periodic reads", async () => {
  const env = await setup();
  await env.start();
  const sent = env.sent.length;
  await env.advance(env.RETRY_MS * 3);
  assert.equal(env.sent.length, sent);
  env.session.dispose();
});

test("outside ready the retry probes again on a visible dashboard", async () => {
  let hidden = true;
  const env = await setup({ hidden: () => hidden });
  env.failNext(QUEUE_GET, NOT_LOADED());
  await env.start();
  await env.advance(env.RETRY_MS * 2);
  assert.equal(env.snapshot().phase, "load_failed", "a hidden dashboard does not retry");
  hidden = false;
  await env.advance(env.RETRY_MS);
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("a lost connection marks the subscription and a reconnect reloads demanded scopes", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  env.backend.disconnect();
  assert.equal(env.snapshot().subscription, "reconnecting");
  env.backend.reconnect();
  await tick();
  assert.equal(env.snapshot().subscription, "live");
  assert.equal(env.queries("get_rooms"), 2);
  env.session.dispose();
});

test("a new entity registry reloads the registry and the discovery derived from it", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "registry" }, { name: "candidates" }]);
  await tick();
  env.patchHass((base) => ({ entities: { ...base.entities } }));
  env.session.syncHass();
  await tick();
  assert.equal(env.count({ type: "config/entity_registry/list" }), 2);
  assert.equal(env.queries("get_robot_candidates"), 2);
  env.emit({ changed: null });
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_robot_candidates"), 2, "integration events leave Home Assistant data alone");
  env.session.dispose();
});

test("card commands travel over the integration's WebSocket; actions ask for the response with the confirmed commit", async () => {
  const env = await setup();
  await env.start();
  assert.equal(env.next().operation, "release_rooms");
  const released = await env.send({ target: "room:a" });
  assert.deepEqual(Object.keys(released.data).sort(), ["api_version", "commit_id", "grant_ids", "room_ids"]);
  assert.equal(env.count({ type: `${DOMAIN}/configuration/command`, command: "release_rooms" }), 1);
  assert.equal(env.next().operation, "run_queue");
  const run = await env.send({ target: "queue" });
  assert.equal(typeof run.data.commit_id, "number");
  assert.deepEqual(env.sent.filter((message) => message.type === "call_service").map((message) => [message.service, message.return_response]), [["run_queue", true]]);
  env.session.dispose();
});

test("a refused command keeps the integration's error code", async () => {
  const env = await setup({ recording: "job_hold", from: "The card opens" });
  await env.start();
  const results = [];
  while (env.next() && results.length < 5) results.push(await env.send({ target: `step:${results.length}` }));
  assert.deepEqual(results.map((result) => (result.ok ? "ok" : result.code)), ["ok", "ok", "ok", "ok", "job_held"], "a second card's hold is refused");
  env.session.dispose();
});

test("a form's input is checked by the integration, which changes nothing", async () => {
  const env = await setup({ recording: "room_controls", from: "The dining room is due every 36 hours" });
  const early = await env.session.validate("create_room", { name: "" });
  assert.deepEqual([early.ok, early.code], [false, "orchestrator_not_loaded"], "nothing is checked before the session is ready");
  await env.start();
  const unnamed = await env.session.validate("create_room", { name: "" });
  assert.deepEqual(JSON.parse(JSON.stringify(unnamed)), { ok: true, data: { valid: false, errors: [{ path: "name", code: "invalid_room_name" }] } });
  assert.deepEqual((await env.session.validate("create_room", { name: "Office" })).data, { valid: true, errors: [] });
  assert.equal(env.count({ type: `${DOMAIN}/configuration/command` }), 0);
  env.rewrite({ type: `${DOMAIN}/configuration/get`, query: "validate" }, { valid: "yes" });
  const garbled = await env.session.validate("create_room", { name: "Office" });
  assert.deepEqual([garbled.ok, garbled.code], [false, "invalid_response"]);
  env.session.dispose();
  assert.equal((await env.session.validate("create_room", { name: "Office" })).code, "connection_lost");
});

test("one command per target at a time, and only offered operations are sent", async () => {
  const env = await setup();
  await env.start();
  const release = env.backend.hold();
  const first = env.send({ target: "room:a" });
  await tick();
  assert.deepEqual({ ...env.snapshot().pending }, { "room:a": "release_rooms" });
  const second = await env.session.command("revoke_rooms", { rooms: ["a"] }, { target: "room:a" });
  assert.equal(second.code, "command_pending");
  release();
  assert.equal((await first).ok, true);
  assert.deepEqual({ ...env.snapshot().pending }, {});
  env.patchHass((base) => ({ services: { [DOMAIN]: Object.fromEntries(Object.entries(base.services[DOMAIN]).filter(([name]) => name !== "run_queue")) } }));
  assert.equal((await env.session.command("run_queue", {}, { target: "queue" })).code, "operation_missing");
  env.session.dispose();
});

test("a confirmed command reloads the scopes it names", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }, { name: "templates" }]);
  await tick();
  await env.send({ target: "room:a", invalidates: ["rooms"] });
  await tick();
  assert.equal(env.queries("get_rooms"), 2);
  assert.equal(env.queries("get_templates"), 1);
  env.session.dispose();
});

// UI-17: without an answer the command may have taken effect, so what it changes is read again.
test("a command without an answer reloads the scopes it names as well", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }, { name: "templates" }]);
  await tick();
  const release = env.backend.hold();
  const sending = env.send({ target: "room:a", invalidates: ["rooms"] });
  await env.advance(15_000);
  const result = await sending;
  assert.equal(result.code, "timeout");
  await tick();
  assert.equal(env.queries("get_rooms"), 2);
  assert.equal(env.queries("get_templates"), 1);
  release();
  env.session.dispose();
});

test("the integration's error texts load in any phase and ignore integration events", async () => {
  const env = await setup();
  env.failNext(QUEUE_GET, NOT_LOADED());
  await env.start();
  assert.equal(env.snapshot().phase, "load_failed");
  env.session.setDemand("card", [{ name: "errorTexts", params: { language: "de" } }]);
  await tick();
  const texts = scope(env.snapshot(), 'errorTexts|{"language":"de"}');
  assert.equal(texts.status, "ready");
  assert.equal(typeof texts.data.orchestrator_not_loaded, "string");
  await env.session.probe();
  env.emit({ changed: null });
  await env.advance(env.QUIET_MS);
  assert.equal(env.count({ type: "frontend/get_translations", language: "de" }), 1);
  env.session.dispose();
});

test("a scope failure that means the integration unloaded changes the phase", async () => {
  const env = await setup();
  await env.start();
  env.failNext({ type: `${DOMAIN}/configuration/get`, query: "get_rooms" }, NOT_LOADED());
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  assert.equal(env.snapshot().phase, "load_failed");
  assert.equal(scope(env.snapshot(), "rooms|{}").error.code, "orchestrator_not_loaded");
  env.session.dispose();
});

test("the session carries the integration's clock forward between its answers", async () => {
  const env = await setup();
  assert.equal(env.session.now(), env.clock.now(), "before any answer the platform's clock");
  await env.start();
  const probe = await env.backend.hass.connection.sendMessagePromise({ type: `${DOMAIN}/queue/get`, offset: 0, limit: 1 });
  const serverMs = Date.parse(probe.server_time.replace(/(\.\d{3})\d+/, "$1"));
  assert.equal(env.session.now(), serverMs);
  env.clock.time += 1500;
  assert.equal(env.session.now(), serverMs + 1500);
  env.emit({ server_time: "2026-03-14T12:00:00.250000+00:00" });
  assert.equal(env.session.now(), Date.UTC(2026, 2, 14, 12, 0, 0, 250), "every event re-anchors it");
  env.session.dispose();
});

test("listeners hear every change, and disposal ends the subscription and the timers", async () => {
  const env = await setup();
  let heard = 0;
  const stop = env.session.subscribe(() => {
    heard += 1;
  });
  await env.start();
  assert.ok(heard > 0);
  stop();
  const count = heard;
  env.emit();
  await tick();
  assert.equal(heard, count);
  env.session.dispose();
  assert.equal(env.unsubscribed, 1);
  assert.equal((await env.session.command("run_queue")).code, "connection_lost");
  assert.equal(env.clock.timers.size, 0);
});

test("snapshots are frozen and reused until something changes", async () => {
  const env = await setup();
  await env.start();
  const first = env.snapshot();
  assert.equal(env.snapshot(), first);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.scopes));
  env.emit();
  await tick();
  assert.notEqual(env.snapshot(), first);
  assert.ok(env.snapshot().version > first.version);
  env.session.dispose();
});

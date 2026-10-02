// The shared session against the fake integration on a virtual clock: connection phases, demand-
// driven loading, coalesced invalidation, runtime changes, the heartbeat that notices a silently
// ended subscription, reconnects and the command contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeOrchestrator, VirtualClock } = require("../../helpers/fake-orchestrator.js");
const { FIXED_NOW, SCENARIOS, hassFor } = require("../../fixtures/scenarios.js");
const { haError } = require("../../fixtures/voi/wire.js");

const tick = async (rounds = 12) => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

async function setup({ scenario = "typical", fake: fakeOptions = {}, hidden = () => false } = {}) {
  const { createTransport } = await import("../../../src/backend/transport.js");
  const { createSession, HEARTBEAT_MS } = await import("../../../src/backend/session.js");
  const { QUIET_MS } = await import("../../../src/backend/subscription.js");
  const clock = new VirtualClock(FIXED_NOW);
  const household = SCENARIOS[scenario]();
  const fake = createFakeOrchestrator({ seed: household.seed, clock, ...fakeOptions });
  let hass = fake.attachTo(hassFor(household));
  const platform = { now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle), isDocumentHidden: hidden };
  const session = createSession({ transport: createTransport({ getHass: () => hass, platform }), platform, getHass: () => hass });
  const queries = (name) => fake.calls.ws.filter((message) => message.query === name).length;
  const advance = async (ms) => {
    clock.advance(ms);
    await tick();
  };
  return {
    clock,
    fake,
    session,
    queries,
    advance,
    HEARTBEAT_MS,
    QUIET_MS,
    setHass(next) {
      hass = next;
    },
    get hass() {
      return hass;
    },
    async start() {
      session.syncHass();
      await tick();
    },
    snapshot: () => session.getSnapshot(),
  };
}

const scope = (snapshot, key) => snapshot.scopes[key];

test("a working integration reaches ready with a live subscription and its version", async () => {
  const env = await setup();
  assert.equal(env.snapshot().phase, "probing");
  await env.start();
  const snapshot = env.snapshot();
  assert.equal(snapshot.phase, "ready");
  assert.equal(snapshot.apiVersion, 2);
  assert.equal(snapshot.subscription, "live");
  assert.equal(env.fake.subscriberCount(), 1);
  assert.equal(scope(snapshot, "manifest|{}").data.version, "0.1.0");
  env.session.dispose();
});

test("each way the integration can be unusable is its own phase", async () => {
  const cases = [
    [{ installed: false, setUp: false }, "not_installed"],
    [{ setUp: false }, "not_set_up"],
    [{ runtimeLoaded: false }, "load_failed"],
    [{ apiVersion: 3 }, "api_incompatible"],
  ];
  for (const [fake, phase] of cases) {
    const env = await setup({ fake });
    await env.start();
    assert.equal(env.snapshot().phase, phase, JSON.stringify(fake));
    env.session.dispose();
  }
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
  env.fake.commit();
  env.fake.commit();
  env.fake.commit();
  await tick();
  assert.equal(env.queries("get_rooms"), 1, "nothing reloads before the quiet gap");
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 2);
  assert.equal(env.snapshot().runtime.commitId, env.fake.state.commitId);
  env.session.dispose();
});

test("a readiness change without a commit reloads as well; a repeated sequence does not", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "queue", params: { offset: 0, limit: 25 } }]);
  await tick();
  const before = env.fake.calls.ws.filter((message) => message.type.endsWith("/queue/get")).length;
  env.fake.setReadiness("job-kitchen", { state: "blocked", reason_codes: ["room_not_released"] });
  await env.advance(env.QUIET_MS);
  const after = env.fake.calls.ws.filter((message) => message.type.endsWith("/queue/get")).length;
  assert.equal(after, before + 1);
  env.fake.emitEvent({ runtime_sequence: 1 });
  await env.advance(env.QUIET_MS);
  assert.equal(env.fake.calls.ws.filter((message) => message.type.endsWith("/queue/get")).length, after);
  env.session.dispose();
});

test("an event from a new runtime reloads everything at once", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  env.fake.notify();
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_rooms"), 2);
  env.fake.emitEvent({ runtime_id: "runtime-9", runtime_sequence: 1 });
  await tick();
  assert.equal(env.queries("get_rooms"), 3, "no quiet gap for a new runtime");
  assert.equal(env.snapshot().runtime.id, "runtime-9");
  env.session.dispose();
});

test("a reloaded entry that silently ends the subscription is noticed on the second heartbeat", async () => {
  const env = await setup();
  await env.start();
  env.fake.reloadRuntime();
  env.fake.commit();
  assert.equal(env.fake.subscriberCount(), 0);
  await env.advance(env.HEARTBEAT_MS);
  assert.equal(env.fake.subscriberCount(), 0, "one unexplained commit is only a suspicion");
  await env.advance(env.HEARTBEAT_MS);
  assert.equal(env.fake.subscriberCount(), 1);
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("a hidden dashboard sends no heartbeat", async () => {
  let hidden = false;
  const env = await setup({ hidden: () => hidden });
  await env.start();
  hidden = true;
  const sent = env.fake.calls.ws.length;
  await env.advance(env.HEARTBEAT_MS * 3);
  assert.equal(env.fake.calls.ws.length, sent);
  env.session.dispose();
});

test("outside ready the heartbeat probes again, so a late setup is picked up", async () => {
  const env = await setup({ fake: { runtimeLoaded: false } });
  await env.start();
  assert.equal(env.snapshot().phase, "load_failed");
  env.fake.state.runtimeLoaded = true;
  await env.advance(env.HEARTBEAT_MS);
  assert.equal(env.snapshot().phase, "ready");
  env.session.dispose();
});

test("a lost connection marks the subscription and a reconnect reloads demanded scopes", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  env.fake.disconnect();
  assert.equal(env.snapshot().subscription, "reconnecting");
  env.fake.reconnect();
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
  env.setHass({ ...env.hass, entities: { ...env.hass.entities } });
  env.session.syncHass();
  await tick();
  assert.equal(env.fake.calls.ws.filter((message) => message.type === "config/entity_registry/list").length, 2);
  assert.equal(env.queries("get_robot_candidates"), 2);
  env.fake.commit();
  await env.advance(env.QUIET_MS);
  assert.equal(env.queries("get_robot_candidates"), 2, "integration events leave Home Assistant data alone");
  env.session.dispose();
});

test("an action asks for a response only where the integration offers one", async () => {
  const env = await setup();
  await env.start();
  const created = await env.session.command("create_job", { areas: ["kitchen"], mode: "vacuum" }, { target: "create" });
  assert.equal(created.ok, true);
  assert.equal(typeof created.data.job_id, "string");
  const paused = await env.session.command("pause_queue", {}, { target: "queue" });
  assert.equal(paused.ok, true);
  assert.equal(paused.data, null);
  const calls = env.fake.calls.services.map((call) => [call.service, call.returnResponse]);
  assert.deepEqual(calls, [["create_job", true], ["pause_queue", false]]);
  env.session.dispose();
});

test("configuration commands travel over the integration's WebSocket and keep its error codes", async () => {
  const env = await setup();
  await env.start();
  const result = await env.session.command("revoke_room", { room_id: "room-unknown" }, { target: "room:room-unknown" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unknown_room");
  assert.ok(env.fake.calls.ws.some((message) => message.command === "revoke_room"));
  env.session.dispose();
});

test("one command per target at a time, and only registered operations are sent", async () => {
  const env = await setup({ fake: { latencyMs: 100 } });
  env.session.syncHass();
  for (let step = 0; step < 10; step += 1) await env.advance(100);
  assert.equal(env.snapshot().phase, "ready");
  const first = env.session.command("move_job", { job_id: "job-bathroom", direction: "up" }, { target: "job:job-bathroom" });
  await tick();
  assert.deepEqual({ ...env.snapshot().pending }, { "job:job-bathroom": "move_job" });
  const second = await env.session.command("delete_job", { job_id: "job-bathroom" }, { target: "job:job-bathroom" });
  assert.equal(second.code, "command_pending");
  for (let step = 0; step < 3; step += 1) await env.advance(100);
  assert.equal((await first).ok, true);
  assert.deepEqual({ ...env.snapshot().pending }, {});
  delete env.hass.services.vacuum_orchestrator.run_queue;
  assert.equal((await env.session.command("run_queue", {}, { target: "queue" })).code, "operation_missing");
  env.session.dispose();
});

test("a confirmed command reloads the scopes it names", async () => {
  const env = await setup();
  await env.start();
  env.session.setDemand("card", [{ name: "rooms" }, { name: "templates" }]);
  await tick();
  await env.session.command("release_room", { room_id: "room-bedroom", kind: "permanent" }, { target: "room:room-bedroom", invalidates: ["rooms"] });
  await tick();
  assert.equal(env.queries("get_rooms"), 2);
  assert.equal(env.queries("get_templates"), 1);
  env.session.dispose();
});

test("a scope failure that means the integration unloaded changes the phase", async () => {
  const env = await setup();
  await env.start();
  env.fake.failNext("get_rooms", haError.voi("orchestrator_not_loaded"));
  env.session.setDemand("card", [{ name: "rooms" }]);
  await tick();
  assert.equal(env.snapshot().phase, "load_failed");
  assert.equal(scope(env.snapshot(), "rooms|{}").error.code, "orchestrator_not_loaded");
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
  env.fake.commit();
  await tick();
  assert.equal(heard, count);
  env.session.dispose();
  assert.equal(env.fake.subscriberCount(), 0);
  assert.equal((await env.session.command("run_queue")).code, "connection_lost");
  assert.equal(env.clock.timers.size, 0);
});

test("snapshots are frozen and reused until something changes", async () => {
  const env = await setup();
  await env.start();
  const first = env.snapshot();
  assert.equal(env.snapshot(), first);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.scopes));
  env.fake.commit();
  await tick();
  assert.notEqual(env.snapshot(), first);
  assert.ok(env.snapshot().version > first.version);
  env.session.dispose();
});

// Generated event sequences against the session: commits, readiness changes, repeated and
// out-of-order sequences, runtime changes and reloads announced by an unload. The session ends
// ready on the newest accepted event of the current runtime and reloads demanded scopes at least
// once after any accepted event.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../fixtures/voi/wire.js");
const { VirtualClock } = require("../helpers/fake-orchestrator.js");
const { seededRandom } = require("./seeded-random.js");
const { propertyRun } = require("./run-config.js");

const tick = async () => {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setImmediate(resolve));
};

// The session is asynchronous, so this property runs its own seeded loop.
test("the session follows the newest event of the current runtime", async () => {
  const { createSession, UNLOADED_GRACE_MS } = await import("../../src/backend/session.js");
  const { QUIET_MS, MAX_WAIT_MS } = await import("../../src/backend/subscription.js");
  const { cases, seed } = propertyRun("EVENTS", 60, "voc-events-v1");
  const random = seededRandom(seed);
  for (let index = 0; index < cases; index += 1) {
    const clock = new VirtualClock(0);
    let deliver = null;
    let loads = 0;
    let runtime = "runtime-1";
    let sequence = 0;
    let commit = 1;
    const transport = {
      ws: async (message) => {
        if (message.type.endsWith("/queue/get")) return { ok: true, data: W.wireQueuePage([], { commit_id: commit, runtime_id: runtime, runtime_sequence: sequence }) };
        if (message.type === "manifest/get") return { ok: true, data: W.wireManifest() };
        loads += 1;
        return { ok: true, data: W.wirePage("rooms", []) };
      },
      subscribe: async (_message, onEvent) => {
        deliver = onEvent;
        return { ok: true, data: () => {} };
      },
      onConnection: () => () => {},
    };
    const hass = { config: { components: ["vacuum_orchestrator"] }, services: { vacuum_orchestrator: {} } };
    const platform = { now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle), isDocumentHidden: () => true };
    const session = createSession({ transport, platform, getHass: () => hass });
    session.syncHass();
    await tick();
    session.setDemand("p", [{ name: "rooms" }]);
    await tick();
    const loadsBefore = loads;
    let expected = null;
    for (let step = 0; step < 1 + random.integer(20); step += 1) {
      const kind = random.integer(10);
      if (kind === 0) {
        if (random.boolean()) {
          deliver(W.wireUnloadedEvent());
          clock.advance(random.integer(UNLOADED_GRACE_MS * 2));
          await tick();
        }
        runtime = `runtime-${step + 2}`;
        sequence = 1;
      } else if (kind <= 2 && sequence > 0) {
        deliver(W.wireSubscriptionEvent({ runtime_id: runtime, runtime_sequence: Math.max(0, sequence - random.integer(3)), commit_id: commit }));
        continue;
      } else {
        sequence += 1;
        if (random.boolean()) commit += 1;
      }
      deliver(W.wireSubscriptionEvent({ runtime_id: runtime, runtime_sequence: sequence, commit_id: commit }));
      expected = { id: runtime, sequence, commitId: commit };
      clock.advance(random.integer(QUIET_MS * 2));
      await tick();
    }
    clock.advance(MAX_WAIT_MS);
    await tick();
    const snapshot = session.getSnapshot();
    assert.equal(snapshot.phase, "ready", `seed=${seed} case=${index}`);
    if (expected) {
      assert.deepEqual({ ...snapshot.runtime }, expected, `seed=${seed} case=${index}`);
      assert.ok(loads > loadsBefore, `seed=${seed} case=${index}: an accepted event reloads`);
    } else {
      assert.equal(loads, loadsBefore);
    }
    session.dispose();
  }
});

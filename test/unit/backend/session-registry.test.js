// Cards on one Home Assistant connection share one session; the session outlives its last card
// by a grace period so a dashboard re-mount does not reconnect. Cards without a connection get
// their own session.

const test = require("node:test");
const assert = require("node:assert/strict");
const { VirtualClock } = require("../../helpers/fake-orchestrator.js");

async function registry() {
  const module = await import("../../../src/backend/session-registry.js");
  const clock = new VirtualClock(0);
  const platform = { now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle) };
  const created = [];
  const createSessionFor = ({ getHass }) => {
    const session = { getHass, disposed: false, released: [], syncs: 0, syncHass() { this.syncs += 1; }, releaseDemand(owner) { this.released.push(owner); }, dispose() { this.disposed = true; } };
    created.push(session);
    return session;
  };
  const acquire = (hass) => module.acquireSession({ hass, platform, createSessionFor, createTransportFor: () => ({}) });
  return { acquire, created, clock, RELEASE_GRACE_MS: module.RELEASE_GRACE_MS };
}

test("two cards on one connection share a session, and the newest hass object is its view", async () => {
  const { acquire, created } = await registry();
  const connection = {};
  const first = acquire({ connection, id: 1 });
  const second = acquire({ connection, id: 2 });
  assert.equal(first.session, second.session);
  assert.equal(created.length, 1);
  assert.equal(created[0].getHass().id, 2);
  first.updateHass({ connection, id: 3 });
  assert.equal(created[0].getHass().id, 3);
  assert.equal(created[0].syncs, 1);
});

test("the session survives its last card for the grace period and is reused within it", async () => {
  const { acquire, created, clock, RELEASE_GRACE_MS } = await registry();
  const connection = {};
  const hold = acquire({ connection });
  hold.release("card-1");
  assert.deepEqual(created[0].released, ["card-1"]);
  clock.advance(RELEASE_GRACE_MS - 1);
  assert.equal(created[0].disposed, false);
  const again = acquire({ connection });
  assert.equal(again.session, created[0]);
  clock.advance(RELEASE_GRACE_MS * 2);
  assert.equal(created[0].disposed, false, "a renewed hold cancels the pending disposal");
  again.release("card-2");
  clock.advance(RELEASE_GRACE_MS);
  assert.equal(created[0].disposed, true);
  acquire({ connection });
  assert.equal(created.length, 2, "after disposal a new session starts");
});

test("releasing twice counts once", async () => {
  const { acquire, created, clock, RELEASE_GRACE_MS } = await registry();
  const connection = {};
  const one = acquire({ connection });
  acquire({ connection });
  one.release("a");
  one.release("a");
  clock.advance(RELEASE_GRACE_MS);
  assert.equal(created[0].disposed, false);
});

test("cards without a connection get separate sessions that end with them", async () => {
  const { acquire, created } = await registry();
  const one = acquire({});
  const two = acquire(null);
  assert.notEqual(one.session, two.session);
  one.release("a");
  assert.equal(created[0].disposed, true);
});

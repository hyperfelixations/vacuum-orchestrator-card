// Coalescing of invalidation events: a reload waits for a quiet gap, never longer than the
// maximum delay after the first event, and can be cancelled.

const test = require("node:test");
const assert = require("node:assert/strict");
const { VirtualClock } = require("../../helpers/fake-orchestrator.js");

async function timer(options = {}) {
  const { createInvalidationTimer, QUIET_MS, MAX_WAIT_MS } = await import("../../../src/backend/subscription.js");
  const clock = new VirtualClock(0);
  let fired = 0;
  const platform = { now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms), clearTimeout: (handle) => clock.clearTimeout(handle) };
  const coalescer = createInvalidationTimer({ platform, onFire: () => { fired += 1; }, ...options });
  return { clock, coalescer, fired: () => fired, QUIET_MS, MAX_WAIT_MS };
}

test("a single event fires after the quiet gap", async () => {
  const { clock, coalescer, fired, QUIET_MS } = await timer();
  coalescer.schedule();
  assert.equal(coalescer.pending, true);
  clock.advance(QUIET_MS - 1);
  assert.equal(fired(), 0);
  clock.advance(1);
  assert.equal(fired(), 1);
  assert.equal(coalescer.pending, false);
});

test("events inside the gap extend it, but never past the maximum delay", async () => {
  const { clock, coalescer, fired, QUIET_MS, MAX_WAIT_MS } = await timer();
  for (let elapsed = 0; elapsed < MAX_WAIT_MS + QUIET_MS; elapsed += QUIET_MS - 50) {
    coalescer.schedule();
    clock.advance(QUIET_MS - 50);
  }
  assert.equal(fired(), 1);
  assert.ok(clock.now() >= MAX_WAIT_MS);
});

test("after firing, the next burst starts a new window", async () => {
  const { clock, coalescer, fired, QUIET_MS } = await timer();
  coalescer.schedule();
  clock.advance(QUIET_MS);
  coalescer.schedule();
  clock.advance(QUIET_MS);
  assert.equal(fired(), 2);
});

test("cancel drops a pending reload", async () => {
  const { clock, coalescer, fired, QUIET_MS } = await timer();
  coalescer.schedule();
  coalescer.cancel();
  clock.advance(QUIET_MS * 10);
  assert.equal(fired(), 0);
  assert.equal(clock.timers.size, 0);
});

test("without timers every event fires at once", async () => {
  const { createInvalidationTimer } = await import("../../../src/backend/subscription.js");
  let fired = 0;
  const coalescer = createInvalidationTimer({ platform: null, onFire: () => { fired += 1; } });
  coalescer.schedule();
  coalescer.schedule();
  assert.equal(fired, 2);
});

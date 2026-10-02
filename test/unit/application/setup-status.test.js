// The setup checklist read from the integration's facts. Undecided while facts are missing;
// complete with a robot that reaches a usable room; the next step is the first one not done.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/application/setup-status.js");

const robot = (targets) => ({ robotId: "r", capabilities: targets === null ? null : { targets } });
const room = (roomId, extra = {}) => ({ roomId, enabled: true, areaMissing: false, released: false, release: null, ...extra });

test("without robots or rooms loaded the checklist stays undecided", async () => {
  const { setupStatus } = await load();
  const status = setupStatus({ robots: null, rooms: [room("a")] });
  assert.equal(status.known, false);
  assert.equal(status.complete, false);
  assert.equal(status.next, null);
});

test("a fresh installation starts at the robots", async () => {
  const { setupStatus, SETUP_STEPS } = await load();
  const status = setupStatus({ robots: [], rooms: [room("a")], queueTotal: 0, openJobs: [] });
  assert.deepEqual(SETUP_STEPS, ["robots", "rooms", "release", "firstJob"]);
  assert.equal(status.known, true);
  assert.equal(status.complete, false);
  assert.equal(status.next, "robots");
});

test("a robot without reached rooms leaves the room step open and names the uncovered rooms", async () => {
  const { setupStatus } = await load();
  const status = setupStatus({ robots: [robot(null)], rooms: [room("a"), room("b", { enabled: false }), room("c", { areaMissing: true })] });
  assert.equal(status.next, "rooms");
  assert.deepEqual(status.steps.rooms.uncovered, ["a"]);
  assert.equal(status.complete, false);
});

test("a robot reaching a usable room completes the required steps", async () => {
  const { setupStatus, REQUIRED_STEPS } = await load();
  const status = setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a"), room("b")], queueTotal: 0, openJobs: [] });
  assert.deepEqual(REQUIRED_STEPS, ["robots", "rooms"]);
  assert.equal(status.complete, true);
  assert.equal(status.steps.rooms.count, 1);
  assert.equal(status.next, "release");
});

test("a grant or a released room counts for the release step; any job for the last", async () => {
  const { setupStatus } = await load();
  const status = setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a", { released: true, release: { kind: "permanent" } })], queueTotal: 0, openJobs: [{ jobId: "j" }] });
  assert.equal(status.steps.release.done, true);
  assert.equal(status.steps.release.count, 1);
  assert.equal(status.steps.firstJob.done, true);
  assert.equal(status.next, null);
  assert.ok(Object.isFrozen(status.steps.rooms));
});

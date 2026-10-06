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
  assert.deepEqual(SETUP_STEPS, ["robots", "rooms", "defaults", "conditions", "release", "due", "templates", "queue", "firstJob"]);
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
  const status = setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a"), room("b")], queueTotal: 0, openJobs: [], jobDefaults: { configured: false } });
  assert.deepEqual(REQUIRED_STEPS, ["robots", "rooms"]);
  assert.equal(status.complete, true);
  assert.equal(status.steps.rooms.count, 1);
  assert.equal(status.next, "defaults", "the optional steps follow in order");
  assert.equal(status.steps.defaults.builtIn, true);
  assert.equal(setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a")] }).next, "conditions", "a step whose facts are not read is not offered next");
});

test("a grant or a released room counts for the release step; any job for the last", async () => {
  const { setupStatus } = await load();
  const status = setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a", { released: true, release: { kind: "permanent" } })], queueTotal: 0, openJobs: [{ jobId: "j" }] });
  assert.equal(status.steps.release.done, true);
  assert.equal(status.steps.release.count, 1);
  assert.equal(status.steps.firstJob.done, true);
  assert.ok(Object.isFrozen(status.steps.rooms));
});

test("the optional steps read saved defaults, conditions, due rules, templates and the wait time", async () => {
  const { setupStatus } = await load();
  const configured = { ...robot({ a: ["1"] }), configuration: { requirements: [{ entityId: "binary_sensor.dock" }] } };
  const rooms = [room("a", { released: true, requirements: [{ entityId: "binary_sensor.door" }], duePolicy: { vacuumSeconds: 86400, mopSeconds: null, occupancyEntityId: null } }), room("b", { duePolicy: { vacuumSeconds: null, mopSeconds: null, occupancyEntityId: "binary_sensor.b" } })];
  const status = setupStatus({ robots: [configured], rooms, queueTotal: 1, openJobs: [], jobDefaults: { configured: true }, templates: [{ templateId: "t" }], graceSeconds: 0 });
  assert.deepEqual(["defaults", "conditions", "due", "templates", "queue"].map((step) => [status.steps[step].done, status.steps[step].count ?? null]), [[true, null], [true, 2], [true, 2], [true, 1], [true, null]]);
  assert.deepEqual([status.steps.defaults.builtIn, status.steps.queue.graceSeconds, status.next], [false, 0, null]);
  const bare = setupStatus({ robots: [robot({ a: ["1"] })], rooms: [room("a")], templates: [], graceSeconds: 900 });
  assert.deepEqual(["defaults", "conditions", "due", "templates", "queue"].map((step) => [bare.steps[step].known, bare.steps[step].done]), [[false, false], [true, false], [true, false], [true, false], [true, true]]);
});

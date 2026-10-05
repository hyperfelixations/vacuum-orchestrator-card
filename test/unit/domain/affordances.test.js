// Which controls are offered, mirrored from the integration's command preconditions. A control
// is hidden where the integration would refuse it for the object's state, disabled for the
// user's rights, a missing action or a command in flight.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/affordances.js");
const ALL = ["move_job", "update_job", "start_job", "cancel_job", "delete_job", "retry_job", "run_queue", "pause_queue", "resume_queue", "create_job", "configure_queue", "release_room", "revoke_room", "update_room", "disable_room", "enable_room", "configure_robot", "remove_robot", "resolve_recovery", "add_robot", "create_job_from_template", "save_template", "remove_template", "reset_template_demand"];

async function context(overrides = {}) {
  const { affordanceContext } = await load();
  return affordanceContext({ operations: ALL, ...overrides });
}

const states = (decisions) => Object.fromEntries(Object.entries(decisions).map(([key, value]) => [key, value.state]));

test("a queued job can be moved, edited, started, cancelled and deleted, not retried", async () => {
  const { jobAffordances } = await load();
  const decisions = jobAffordances({ jobId: "j", state: "queued" }, await context(), { position: 2, total: 3 });
  assert.deepEqual(states(decisions), { moveUp: "enabled", moveDown: "enabled", moveTop: "enabled", moveBottom: "enabled", edit: "enabled", start: "enabled", cancel: "enabled", delete: "enabled", retry: "hidden" });
});

test("moving past either end is disabled with its reason", async () => {
  const { jobAffordances } = await load();
  const top = jobAffordances({ jobId: "j", state: "queued" }, await context(), { position: 1, total: 1 });
  assert.deepEqual([top.moveUp.state, top.moveUp.reason, top.moveDown.reason], ["disabled", "at_boundary", "at_boundary"]);
});

test("each job state offers exactly what the integration accepts for it", async () => {
  const { jobAffordances } = await load();
  const ctx = await context();
  const visible = (state) => Object.entries(jobAffordances({ jobId: "j", state }, ctx)).filter(([, decision]) => decision.state !== "hidden").map(([key]) => key).sort();
  assert.deepEqual(visible("dispatching"), ["cancel"]);
  assert.deepEqual(visible("running"), ["cancel"]);
  assert.deepEqual(visible("canceling"), []);
  assert.deepEqual(visible("needs_attention"), []);
  for (const state of ["completed", "failed", "cancelled"]) assert.deepEqual(visible(state), ["delete", "retry"]);
  assert.deepEqual(visible("unknown"), []);
});

test("rights, missing actions and commands in flight disable in that order", async () => {
  const { decide } = await load();
  const spec = { operation: "run_queue", target: "queue" };
  assert.deepEqual({ ...decide(await context({ canCommand: false, pending: ["queue"] }), spec) }, { state: "disabled", reason: "read_only" });
  assert.equal(decide(await context({ operations: [] }), spec).reason, "operation_missing");
  assert.equal(decide(await context({ pending: ["queue"] }), spec).reason, "command_pending");
  assert.equal(decide(await context(), { ...spec, blockedBy: "robot_busy" }).reason, "robot_busy");
  assert.equal(decide(await context({ canCommand: false }), { ...spec, visible: false }).state, "hidden");
});

test("the queue control follows the queue mode", async () => {
  const { queueAffordances } = await load();
  const ctx = await context();
  assert.equal(queueAffordances("idle", ctx).command, "run_queue");
  assert.equal(queueAffordances("running", ctx).command, "pause_queue");
  assert.equal(queueAffordances("paused", ctx).command, "resume_queue");
  assert.equal(queueAffordances("strange", ctx).command, "run_queue");
});

test("a room can be released while usable and revoked while it holds a grant", async () => {
  const { roomAffordances } = await load();
  const ctx = await context();
  assert.deepEqual(states(roomAffordances({ roomId: "r", enabled: true, areaMissing: false, release: null }, ctx)), { release: "enabled", revoke: "hidden", edit: "enabled", disable: "enabled", enable: "hidden", createJob: "enabled" });
  assert.deepEqual(states(roomAffordances({ roomId: "r", enabled: true, areaMissing: true, release: { kind: "once" } }, ctx)), { release: "hidden", revoke: "enabled", edit: "enabled", disable: "enabled", enable: "hidden", createJob: "hidden" });
  assert.deepEqual(states(roomAffordances({ roomId: "r", enabled: false, release: null }, ctx)), { release: "hidden", revoke: "hidden", edit: "enabled", disable: "hidden", enable: "enabled", createJob: "hidden" });
  const without = (name) => context({ operations: ALL.filter((operation) => operation !== name) });
  assert.equal(roomAffordances({ roomId: "r", enabled: true }, await without("disable_room")).disable.state, "disabled");
  assert.equal(roomAffordances({ roomId: "r", enabled: false }, await without("enable_room")).enable.state, "disabled");
});

test("a robot under a lease cannot be reconfigured or removed", async () => {
  const { robotAffordances } = await load();
  const ctx = await context();
  assert.deepEqual(states(robotAffordances({ robotId: "r", active: false }, ctx)), { configure: "enabled", remove: "enabled" });
  const busy = robotAffordances({ robotId: "r", active: true }, ctx);
  assert.deepEqual([busy.configure.reason, busy.remove.reason], ["robot_busy", "robot_busy"]);
});

test("a disabled template creates no job and a reset is offered only when rooms are suppressed", async () => {
  const { templateAffordances } = await load();
  const ctx = await context();
  const off = templateAffordances({ templateId: "t", enabled: false, suppressedRoomIds: [] }, ctx);
  assert.equal(off.instantiate.reason, "template_disabled");
  assert.equal(off.resetDemand.state, "hidden");
  assert.equal(templateAffordances({ templateId: "t", enabled: true, suppressedRoomIds: ["r"] }, ctx).resetDemand.state, "enabled");
});

test("targets name the object a command is pending for", async () => {
  const affordances = await load();
  assert.deepEqual([affordances.jobTarget("a"), affordances.roomTarget("b"), affordances.robotTarget("c"), affordances.templateTarget("d"), affordances.QUEUE_TARGET, affordances.CREATE_TARGET], ["job:a", "room:b", "robot:c", "template:d", "queue", "create"]);
  assert.equal(affordances.recoveryAffordance("c", await context({ pending: ["robot:c"] })).reason, "command_pending");
  assert.equal(affordances.candidateAffordance(await context()).state, "enabled");
});

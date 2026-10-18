// Which controls are offered: the integration's verdict per action (`actions`) decides; a control
// is hidden where the action does not apply to the object, disabled with the integration's reason
// otherwise, and disabled for the card's own reasons (rights, a missing action, a lost connection,
// a command in flight) first.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/affordances.js");
const ALL = ["move_job", "update_job", "start_job", "cancel_job", "delete_job", "retry_job", "correct_job", "run_queue", "pause_queue", "resume_queue", "create_job", "configure_queue", "release_rooms", "revoke_rooms", "update_room", "disable_room", "enable_room", "configure_robot", "rename_robot", "remove_robot", "resolve_recovery", "add_robot", "create_job_from_template", "save_template", "remove_template", "reset_template_demand", "end_queue", "return_robot", "complete_setup"];

async function context(overrides = {}) {
  const { affordanceContext } = await load();
  return affordanceContext({ operations: ALL, ...overrides });
}

const states = (decisions) => Object.fromEntries(Object.entries(decisions).map(([key, value]) => [key, value.state]));
const yes = { available: true, reason: null, detail: null };
const no = (reason, detail = null) => ({ available: false, reason, detail });

test("an action the integration offers is enabled, one it does not apply is hidden", async () => {
  const { jobAffordances } = await load();
  const actions = { edit: yes, delete: yes, cancel: no("job_not_started"), start: no("job_not_startable"), retry: no("job_not_retryable"), correct: no("job_not_correctable"), move_up: yes, move_down: yes };
  assert.deepEqual(states(jobAffordances({ jobId: "j", actions }, await context())), { moveUp: "enabled", moveDown: "enabled", moveTop: "enabled", moveBottom: "enabled", edit: "enabled", start: "hidden", cancel: "hidden", delete: "enabled", retry: "hidden", correct: "hidden" });
});

test("any other refusal keeps the control and carries the integration's reason", async () => {
  const { jobAffordances } = await load();
  const held = jobAffordances({ jobId: "j", actions: { edit: no("job_held", "edit"), move_up: no("job_at_top"), move_down: yes } }, await context());
  assert.deepEqual({ ...held.edit }, { state: "disabled", reason: "job_held", source: "integration", detail: "edit" });
  assert.deepEqual([held.moveUp.reason, held.moveTop.reason, held.moveDown.state], ["job_at_top", "job_at_top", "enabled"]);
});

test("without a verdict nothing is offered", async () => {
  const { jobAffordances, roomAffordances, robotAffordances, templateAffordances, queueAffordances } = await load();
  const ctx = await context();
  for (const decisions of [jobAffordances({ jobId: "j" }, ctx), roomAffordances({ roomId: "r" }, ctx), robotAffordances({ robotId: "r" }, ctx), templateAffordances({ templateId: "t" }, ctx)]) {
    assert.ok(Object.values(decisions).every((decision) => decision.state === "hidden"));
  }
  const queue = queueAffordances(null, ctx);
  assert.deepEqual([queue.command, queue.control.state, queue.end.state], [null, "hidden", "hidden"]);
});

test("rights, missing actions, the connection and commands in flight disable in that order", async () => {
  const { decide, offer } = await load();
  const spec = { operation: "run_queue", target: "queue" };
  assert.deepEqual({ ...decide(await context({ canCommand: false, connected: false, pending: ["queue"] }), spec) }, { state: "hidden", reason: "read_only" }, "read only hides what would change something (UI-22)");
  assert.equal(decide(await context({ operations: [], connected: false }), spec).reason, "operation_missing");
  assert.equal(decide(await context({ connected: false, pending: ["queue"] }), spec).reason, "connection_lost");
  assert.equal(decide(await context({ pending: ["queue"] }), spec).reason, "command_pending");
  assert.deepEqual({ ...decide(await context(), spec) }, { state: "enabled", reason: null });
  assert.equal(decide(await context({ canCommand: false }), { ...spec, visible: false }).state, "hidden");
  assert.equal(offer(await context({ pending: ["queue"] }), no("robot_busy"), spec).reason, "command_pending", "the card's own reason comes first");
  assert.equal(offer(await context({ canCommand: false }), no("queue_running"), spec).state, "hidden", "an action that does not apply stays hidden for everyone");
});

test("the queue control is the one of run, pause and resume the integration offers", async () => {
  const { queueAffordances, queueControl } = await load();
  const ctx = await context();
  const phase = {
    off: { run: yes, pause: no("queue_not_running"), resume: no("queue_not_running"), end: no("queue_not_running") },
    active: { run: no("queue_running"), pause: yes, resume: no("queue_running"), end: yes },
    paused: { run: no("queue_running"), pause: no("queue_paused"), resume: yes, end: yes },
    ending: { run: no("queue_running"), pause: no("queue_ending"), resume: yes, end: no("queue_ending") },
  };
  const commands = Object.fromEntries(Object.entries(phase).map(([name, actions]) => [name, queueAffordances({ actions }, ctx).command]));
  assert.deepEqual(commands, { off: "run_queue", active: "pause_queue", paused: "resume_queue", ending: "resume_queue" });
  assert.deepEqual(Object.values(phase).map((actions) => queueAffordances({ actions }, ctx).end.state), ["hidden", "enabled", "enabled", "hidden"]);
  assert.equal(queueControl({ run: no("queue_running") }), null);
});

test("room actions follow the room's verdicts", async () => {
  const { roomAffordances } = await load();
  const actions = { release: yes, revoke: no("room_not_released"), edit: no("room_has_active_job"), disable: no("room_has_active_job"), enable: no("room_enabled"), create_job: yes };
  const decisions = roomAffordances({ roomId: "r", actions }, await context());
  assert.deepEqual(states(decisions), { release: "enabled", revoke: "hidden", edit: "disabled", disable: "disabled", enable: "hidden", createJob: "enabled" });
  assert.equal(decisions.edit.reason, "room_has_active_job");
});

test("robot actions follow the robot's verdicts; a docked robot is not sent home", async () => {
  const { robotAffordances } = await load();
  const ctx = await context();
  const busy = robotAffordances({ robotId: "r", actions: { configure: no("robot_busy"), rename: yes, remove: no("robot_busy"), return_to_dock: no("robot_already_executing") } }, ctx);
  assert.deepEqual(states(busy), { configure: "disabled", rename: "enabled", remove: "disabled", returnToDock: "hidden" });
  assert.equal(robotAffordances({ robotId: "r", actions: { return_to_dock: no("robot_at_dock") } }, ctx).returnToDock.state, "hidden");
  assert.equal(robotAffordances({ robotId: "r", actions: { return_to_dock: no("robot_needs_attention") } }, ctx).returnToDock.reason, "robot_needs_attention");
  assert.equal(robotAffordances({ robotId: "r", actions: { return_to_dock: yes } }, await context({ operations: ALL.filter((name) => name !== "return_robot") })).returnToDock.reason, "operation_missing");
});

test("a disabled template creates no job and a reset is offered only when demand is suppressed", async () => {
  const { templateAffordances } = await load();
  const off = templateAffordances({ templateId: "t", actions: { create_job: no("template_disabled"), edit: yes, remove: yes, reset_demand: no("no_suppressed_demand") } }, await context());
  assert.deepEqual([off.instantiate.reason, off.resetDemand.state, off.edit.state], ["template_disabled", "hidden", "enabled"]);
});

test("targets name the object a command is pending for", async () => {
  const affordances = await load();
  assert.deepEqual([affordances.jobTarget("a"), affordances.roomTarget("b"), affordances.robotTarget("c"), affordances.templateTarget("d"), affordances.QUEUE_TARGET, affordances.CREATE_TARGET, affordances.SETUP_TARGET], ["job:a", "room:b", "robot:c", "template:d", "queue", "create", "setup"]);
  assert.equal(affordances.recoveryAffordance("c", await context({ pending: ["robot:c"] })).reason, "command_pending");
  assert.equal(affordances.candidateAffordance(await context()).state, "enabled");
});

test("against a recording, every object carries the integration's verdicts", async () => {
  const { modelFor } = require("../../helpers/model.js");
  const { jobAffordances, queueAffordances, roomAffordances, robotAffordances } = await load();
  const { model, context: ctx } = await modelFor("showcase", { from: "A busy afternoon" });
  const queue = model.slots.queue.data;
  assert.equal(queueAffordances(queue, ctx).command, "pause_queue");
  const [first, , last] = queue.jobs.map((job) => jobAffordances(job, ctx));
  assert.deepEqual([first.moveUp.reason, first.edit.state, last.moveDown.reason], ["job_at_top", "enabled", "job_at_bottom"]);
  const running = model.slots.openJobs.data.jobs[0];
  assert.deepEqual([jobAffordances(running, ctx).cancel.state, jobAffordances(running, ctx).delete.state], ["enabled", "hidden"]);
  const robot = robotAffordances(model.slots.robots.data.items[0], ctx);
  assert.deepEqual([robot.configure.state, robot.remove.reason, robot.rename.state], ["enabled", "robot_busy", "enabled"], "a working robot is configured for its next job, not removed");
  assert.ok(model.slots.rooms.data.items.every((room) => roomAffordances(room, ctx).release.state !== "hidden"));
});

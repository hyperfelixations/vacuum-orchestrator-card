// The fake integration keeps the integration's command preconditions, rights and subscription
// behaviour, so every test above it exercises the card against the real contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeOrchestrator, VirtualClock } = require("../helpers/fake-orchestrator.js");
const { SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

function fakeFor(scenario = "typical", options = {}) {
  const household = SCENARIOS[scenario]();
  const fake = createFakeOrchestrator({ seed: household.seed, clock: new VirtualClock(), ...options });
  const hass = fake.attachTo(hassFor(household, { admin: options.admin !== false }));
  const call = (service, data, returnResponse = false) => hass.callService("vacuum_orchestrator", service, data, undefined, false, returnResponse);
  const command = (name, parameters) => hass.connection.sendMessagePromise({ type: "vacuum_orchestrator/configuration/command", command: name, parameters });
  const job = (jobId) => hass.connection.sendMessagePromise({ type: "vacuum_orchestrator/job/get", job_id: jobId });
  return { fake, hass, call, command, job };
}

const code = async (promise) => {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error.translation_key ?? error.code;
  }
};

test("a queued job is cancelled at once; a running job first becomes canceling", async () => {
  const { call, job } = fakeFor();
  await call("cancel_job", { job_id: "job-kitchen" });
  assert.equal((await job("job-kitchen")).state, "cancelled");
  await call("cancel_job", { job_id: "job-running" });
  assert.equal((await job("job-running")).state, "canceling");
});

test("edit, move and start need a queued job; delete a queued or finished one", async () => {
  const { call } = fakeFor();
  assert.equal(await code(call("update_job", { job_id: "job-running", passes: 2 }, true)), "job_not_editable");
  assert.equal(await code(call("delete_job", { job_id: "job-running" })), "job_not_deletable");
  assert.equal(await code(call("delete_job", { job_id: "job-done" })), "ok");
  assert.equal(await code(call("retry_job", { job_id: "job-failed" }, true)), "ok");
});

test("a direct start needs a robot profile and a free robot", async () => {
  const fresh = fakeFor("fresh");
  await fresh.call("create_job", { areas: ["room-kitchen"], mode: "vacuum" }, true);
  const [jobId] = fresh.fake.state.queue;
  assert.equal(await code(fresh.call("start_job", { job_id: jobId }, true)), "no_robot_configured");
  const typical = fakeFor();
  assert.equal(await code(typical.call("start_job", { job_id: "job-kitchen", robot_id: "robot-rocky" }, true)), "robot_busy");
});

test("a rung outside its ladder is refused in any mode; a setting the mode does not use is dropped", async () => {
  const { call, fake } = fakeFor();
  assert.equal(await code(call("create_job", { areas: ["room-kitchen"], mode: "vacuum", vacuum_power: "off" }, true)), "unsupported_cleaning_preference");
  assert.equal(await code(call("create_job", { areas: ["room-kitchen"], mode: "mop", vacuum_power: "off" }, true)), "unsupported_cleaning_preference");
  const created = await call("create_job", { areas: ["room-kitchen"], mode: "mop", vacuum_power: "maximum" }, true);
  const job = fake.state.jobs.get(created.response.job_id);
  assert.deepEqual([job.vacuum_power, job.mop_intensity, job.mop_route], [null, "medium", "standard"], "the mode's settings come from the defaults");
});

test("non-admins are refused in Home Assistant's frames: actions and WebSocket commands", async () => {
  const { call, command } = fakeFor("typical", { admin: false });
  await assert.rejects(call("pause_queue", {}), { code: "home_assistant_error", message: "Unauthorized" });
  await assert.rejects(command("revoke_room", { room_id: "room-kitchen" }), { code: "unauthorized" });
});

test("every action can answer with the confirmed commit, and every read names its view", async () => {
  const { fake, call, job, command } = fakeFor();
  const paused = await call("pause_queue", {}, true);
  assert.deepEqual(paused.response, { api_version: 3, commit_id: fake.state.commitId, mode: "paused" });
  assert.equal((await call("move_job", { job_id: "job-bathroom", direction: "up" }, true)).response.job_id, "job-bathroom");
  assert.equal((await command("revoke_room", { room_id: "room-kitchen" })).commit_id, fake.state.commitId);
  const view = (read) => [read.commit_id, read.runtime_id, read.runtime_sequence];
  const current = [fake.state.commitId, fake.state.runtimeId, fake.state.runtimeSequence];
  assert.deepEqual(view(await job("job-kitchen")), current);
  assert.deepEqual(view(await fake.attachTo({}).connection.sendMessagePromise({ type: "vacuum_orchestrator/jobs/list", offset: 0, limit: 5 })), current);
  assert.deepEqual(view(await fake.attachTo({}).connection.sendMessagePromise({ type: "vacuum_orchestrator/configuration/get", query: "get_rooms", parameters: { offset: 0, limit: 5 } })), current);
});

test("the queue names the version and counts; jobs filter by state, newest first", async () => {
  const { fake, hass } = fakeFor();
  const ws = (message) => hass.connection.sendMessagePromise(message);
  const queue = await ws({ type: "vacuum_orchestrator/queue/get", offset: 0, limit: 1 });
  assert.deepEqual([queue.integration_version, queue.active_count, queue.attention_count], ["0.1.0", 1, 0]);
  const open = await ws({ type: "vacuum_orchestrator/jobs/list", offset: 0, limit: 50, states: ["running", "needs_attention"] });
  assert.deepEqual(open.jobs.map((job) => job.state), ["running"]);
  assert.equal(open.total, 1);
  fake.setJob("job-kitchen", { state: "needs_attention" });
  const events = [];
  await hass.connection.subscribeMessage((event) => events.push(event), { type: "vacuum_orchestrator/subscribe" });
  fake.commit();
  assert.deepEqual([events[0].active_count, events[0].attention_count], [1, 1]);
});

test("a job explains its next start while queued or between phases, never while running", async () => {
  const { fake, job } = fakeFor();
  assert.equal(typeof (await job("job-kitchen")).readiness, "object");
  assert.equal((await job("job-running")).readiness, undefined);
  fake.setJob("job-kitchen", { state: "dispatching", active_attempt_id: null });
  assert.equal(typeof (await job("job-kitchen")).readiness, "object");
  fake.setJob("job-kitchen", { active_attempt_id: "attempt-1" });
  assert.equal((await job("job-kitchen")).readiness, undefined);
});

test("rooms are excluded and included with their history and release kept", async () => {
  const { fake, command } = fakeFor();
  const before = fake.state.rooms.find((item) => item.room_id === "room-kitchen");
  const release = before.release;
  await command("disable_room", { room_id: "room-kitchen" });
  assert.deepEqual([before.enabled, before.released, before.release], [false, false, release]);
  await command("enable_room", { room_id: "room-kitchen" });
  assert.deepEqual([before.enabled, before.released], [true, Boolean(release)]);
  assert.equal(await code(command("disable_room", { room_id: "room-unknown" })), "unknown_room");
  assert.equal(await code(command("remove_room", { room_id: "room-kitchen" })), "invalid_format");
});

test("all rooms resolves to the enabled rooms with an area that a robot reaches, in room order", async () => {
  const { fake, call, command, job } = fakeFor();
  const created = await call("create_job", { areas: "all", mode: "vacuum" }, true);
  const eligible = fake.state.rooms.filter((room) => room.enabled && !room.area_missing && fake.state.robots.some((robot) => Object.hasOwn(robot.capabilities?.targets || {}, room.room_id))).map((room) => room.room_id);
  assert.ok(eligible.length > 0);
  assert.deepEqual((await job(created.response.job_id)).room_ids, eligible);
  await command("save_template", { name: "Everywhere", intent: { areas: ["all"], mode: "vacuum" } });
  assert.equal(fake.state.templates.at(-1).intent.areas, "all", "a template keeps the choice, not the rooms");
  for (const room of fake.state.rooms) room.enabled = false;
  assert.equal(await code(call("create_job", { areas: "all", mode: "vacuum" })), "no_eligible_rooms");
});

test("an unchanged queue mode commits nothing, as in the integration", async () => {
  const { fake, call } = fakeFor();
  await call("pause_queue", {});
  const commit = fake.state.commitId;
  assert.equal((await call("pause_queue", {}, true)).response.commit_id, commit);
});

test("each event names the views whose state changed", async () => {
  const { fake, hass, call } = fakeFor();
  const events = [];
  await hass.connection.subscribeMessage((event) => events.push(event), { type: "vacuum_orchestrator/subscribe" });
  await call("pause_queue", {});
  fake.setReadiness("job-kitchen", { state: "blocked" });
  await call("move_job", { job_id: "job-bathroom", direction: "up" });
  fake.commit();
  assert.deepEqual(events.map((event) => event.changed), [["queue"], ["jobs", "queue"], ["queue"], []]);
});

test("every commit and readiness change notifies subscribers; a reload announces the unload and the new runtime", async () => {
  const { fake, hass } = fakeFor();
  const events = [];
  await hass.connection.subscribeMessage((event) => events.push(event), { type: "vacuum_orchestrator/subscribe" });
  fake.commit();
  fake.setReadiness("job-kitchen", { state: "blocked" });
  assert.deepEqual(events.map((event) => event.runtime_sequence), [2, 3]);
  assert.equal(events[1].commit_id, events[0].commit_id, "readiness changes without a commit");
  assert.ok(events.every((event) => event.loaded === true));
  fake.reloadRuntime();
  assert.deepEqual(events.slice(2).map((event) => [event.loaded, event.runtime_id ?? null]), [[false, null], [true, "runtime-2"]]);
  assert.deepEqual(Object.keys(events[2]).sort(), ["api_version", "loaded"]);
  assert.equal(fake.subscriberCount(), 1);
});

test("a subscription to an unloaded integration is accepted and hears that it is unloaded", async () => {
  const { hass } = fakeFor("typical", { runtimeLoaded: false });
  const events = [];
  await hass.connection.subscribeMessage((event) => events.push(event), { type: "vacuum_orchestrator/subscribe" });
  assert.deepEqual(events, [{ api_version: 3, loaded: false }]);
});

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

test("suction off is refused outside mopping, as the integration's intent does", async () => {
  const { call } = fakeFor();
  assert.equal(await code(call("create_job", { areas: ["room-kitchen"], mode: "vacuum", vacuum_power: "off" }, true)), "preference_conflicts_with_cleaning_mode");
  assert.equal(await code(call("create_job", { areas: ["room-kitchen"], mode: "mop", vacuum_power: "off" }, true)), "ok");
});

test("non-admins are refused in Home Assistant's frames: actions and WebSocket commands", async () => {
  const { call, command } = fakeFor("typical", { admin: false });
  await assert.rejects(call("pause_queue", {}), { code: "home_assistant_error", message: "Unauthorized" });
  await assert.rejects(command("revoke_room", { room_id: "room-kitchen" }), { code: "unauthorized" });
});

test("an action asked for a response it does not give is refused", async () => {
  const { call } = fakeFor();
  assert.equal(await code(call("pause_queue", {}, true)), "service_does_not_support_response");
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
  assert.deepEqual(events, [{ api_version: 2, loaded: false }]);
});

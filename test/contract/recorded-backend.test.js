// The recording player: `hass` as Home Assistant's frontend builds it, reads answered as the
// integration answered them, commands only in the recorded order, and events, time and home
// changes as recorded.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRecordedBackend } = require("../helpers/recorded-backend.js");

const recording = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "voi", "recordings", `${name}.json`), "utf8"));
const QUEUE = Object.freeze({ type: "vacuum_orchestrator/queue/get", offset: 0, limit: 25 });
const ROOMS = Object.freeze({ type: "vacuum_orchestrator/configuration/get", query: "get_rooms", parameters: { offset: 0, limit: 100 } });

// The card's first command in `device_fault`: the kitchen released as the release dialog does.
async function releaseKitchen(backend) {
  const rooms = (await backend.hass.callWS(ROOMS)).rooms;
  return backend.hass.callWS({
    type: "vacuum_orchestrator/configuration/command",
    command: "release_rooms",
    parameters: { grants: [{ room: rooms.find((room) => room.name === "Küche").room_id, kind: "permanent" }] },
  });
}

test("hass holds states, entities, areas, actions and user as the frontend builds them", () => {
  const formatted = [];
  const backend = createRecordedBackend(recording("device_fault"), { from: "The card opens", language: "de", formatEntityState: (state, language) => (formatted.push(language), `${state.state}!`) });
  const { hass } = backend;
  const saugi = hass.states["vacuum.saugi"];
  assert.equal(saugi.state, "docked");
  assert.equal(saugi.attributes.fan_speed, "balanced");
  assert.equal(saugi.last_changed, "2026-03-14T09:26:53.589Z");
  assert.equal(saugi.last_updated, saugi.last_changed);
  assert.equal(hass.entities["vacuum.saugi"].platform, "roborock");
  assert.equal(hass.entities["vacuum.saugi"].has_entity_name, true);
  assert.equal(hass.entities["sensor.saugi_vacuum_error"].entity_category, "diagnostic");
  assert.equal(hass.areas.kuche.name, "Küche");
  assert.ok("create_job" in hass.services.vacuum_orchestrator);
  assert.ok(hass.config.components.includes("vacuum_orchestrator"));
  assert.equal(hass.user.is_admin, true);
  assert.equal(hass.language, "de");
  assert.equal(hass.formatEntityState(saugi), "docked!");
  assert.deepEqual(formatted, ["de"]);
  assert.equal(createRecordedBackend(recording("device_fault"), { from: "The card opens", admin: false }).hass.user.is_admin, false);
});

test("a read gets the integration's answer of its stretch of the recording", async () => {
  const backend = createRecordedBackend(recording("device_fault"));
  const before = (await backend.hass.callWS(ROOMS)).rooms;
  assert.ok(before.every((room) => room.released === false));
  await releaseKitchen(backend);
  const after = (await backend.hass.callWS(ROOMS)).rooms;
  assert.deepEqual(after.filter((room) => room.released).map((room) => room.name), ["Küche"]);
  // The transport id never matters, the parameters do.
  assert.deepEqual((await backend.hass.connection.sendMessagePromise({ ...QUEUE, id: 77 })).mode, "idle");
  assert.deepEqual(backend.calls.at(-1), { ...QUEUE });
});

test("a request missing from the recording fails with the scenario to record it in", () => {
  const backend = createRecordedBackend(recording("start_delay"));
  assert.throws(() => backend.hass.callWS({ ...QUEUE, limit: 10 }), /start_delay: the recording has no .*"limit":10/);
});

test("commands follow the recorded order", async () => {
  const backend = createRecordedBackend(recording("device_fault"));
  assert.throws(() => backend.hass.callService("vacuum_orchestrator", "run_queue", {}, undefined, false, true), /the card sent .*run_queue.* but the recording continues with .*release_rooms/);
  await releaseKitchen(backend);
  assert.equal(backend.finished, false);
  const areas = [backend.hass.areas.kuche.area_id];
  const response = await backend.hass.callService("vacuum_orchestrator", "create_job", { areas, mode: "mop", start: true }, undefined, false, true);
  assert.equal(response.response.api_version, 4);
  assert.equal(backend.finished, true);
});

test("events before a command's result reach the card first, later ones after it", async () => {
  const backend = createRecordedBackend(recording("device_fault"));
  const seen = [];
  await backend.hass.connection.subscribeMessage(() => seen.push("event"), { type: "vacuum_orchestrator/subscribe" });
  await releaseKitchen(backend);
  seen.push("result");
  await new Promise((resolve) => setTimeout(resolve, 0));
  // As recorded: one event before the release's result, one after it.
  assert.deepEqual(seen, ["event", "result", "event"]);
});

test("an answer recorded after a home change arrives only once the home change is played", async () => {
  const backend = createRecordedBackend(recording("delayed_answer"));
  const seen = [];
  await backend.hass.connection.subscribeMessage(() => seen.push("event"), { type: "vacuum_orchestrator/subscribe" });
  const start = await sendRecordedCommands(backend, "delayed_answer", (step) => step.send?.service === "create_job");
  const { id: _id, ...message } = start.send;
  let answered = null;
  const pending = backend.hass.callService(message.domain, message.service, message.service_data, undefined, false, true).then((response) => {
    answered = response;
    seen.push("result");
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(answered, null);
  // Reads while the answer is outstanding get what the integration answered meanwhile.
  assert.equal((await backend.hass.callWS(QUEUE)).commit_id, 4);
  backend.until("Saugi's cloud confirms the command");
  await pending;
  assert.equal(answered.response.api_version, 4);
  assert.equal((await backend.hass.callWS(QUEUE)).commit_id, 5);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // As recorded after the confirmation: one event before the answer, one after it.
  assert.deepEqual(seen.slice(seen.indexOf("result") - 1), ["event", "result", "event"]);
});

test("a lost connection rejects an answer the recording has not reached", async () => {
  const backend = createRecordedBackend(recording("delayed_answer"));
  const start = await sendRecordedCommands(backend, "delayed_answer", (step) => step.send?.service === "create_job");
  const { id: _id, ...message } = start.send;
  const pending = backend.hass.callService(message.domain, message.service, message.service_data, undefined, false, true);
  backend.disconnect();
  await assert.rejects(pending, (error) => error === 3);
});

test("a card opened at a mark sees the home, the time and the answers of that point", async () => {
  const advanced = [];
  const backend = createRecordedBackend(recording("queue_end"), { from: "The queue ends after the started job", clock: { advance: (ms) => advanced.push(ms) } });
  assert.equal(backend.hass.states["vacuum.saugi"].state, "cleaning");
  assert.ok(backend.hass.config.components.includes("vacuum_orchestrator"));
  // 60 s of waiting and 5 s of start delay passed before the mark.
  assert.equal(backend.nowMs, Date.parse("2026-03-14T09:26:53.589Z") + 65_000);
  assert.equal((await backend.hass.callWS(QUEUE)).queue_run.phase, "ending");
  assert.equal(backend.finished, true);
  // Up to the next cause: the dock, then the minute after it.
  backend.until("Saugi charges at its dock");
  assert.equal(backend.hass.states["vacuum.saugi"].state, "docked");
  assert.equal(backend.nowMs, Date.parse("2026-03-14T09:26:53.589Z") + 485_000);
  assert.deepEqual(advanced, [300_000, 60_000, 60_000]);
  assert.equal((await backend.hass.callWS(QUEUE)).queue_run.phase, "off");
  assert.throws(() => createRecordedBackend(recording("queue_end"), { from: "Nowhere" }), /queue_end: no mark "Nowhere"/);
});

test("a card opened at a mark sends the commands recorded after it", async () => {
  const backend = createRecordedBackend(recording("queue_end"), { from: "The queue waits for work" });
  const rooms = (await backend.hass.callWS(ROOMS)).rooms;
  const kitchen = rooms.find((room) => room.name === "Küche");
  const response = await backend.hass.callService("vacuum_orchestrator", "create_job", { areas: [kitchen.area_id] }, undefined, false, true);
  assert.equal(response.response.api_version, 4);
});

// Sends the recorded commands in order, as the card would, until `stop` names a step.
async function sendRecordedCommands(backend, name, stop) {
  for (const step of recording(name).steps) {
    if (stop(step)) return step;
    const { id: _id, ...message } = step.send || {};
    if (message.type === "call_service") await backend.hass.callService(message.domain, message.service, message.service_data, undefined, false, true);
    else if (message.type === "vacuum_orchestrator/configuration/command") await backend.hass.callWS(message);
  }
  return null;
}

test("recorded errors arrive as Home Assistant rejects them", async () => {
  const backend = createRecordedBackend(recording("job_hold"));
  let holds = 0;
  const conflict = await sendRecordedCommands(backend, "job_hold", (step) => step.send?.command === "hold_job" && ++holds === 2);
  const { id: _id, ...second } = conflict.send;
  await assert.rejects(backend.hass.callWS(second), (error) => error.code === "job_held" && error.translation_key === "job_held");
});

test("home changes, time and hass follow the recording", async () => {
  const advanced = [];
  const backend = createRecordedBackend(recording("device_fault"), { clock: { advance: (ms) => advanced.push(ms) } });
  const changes = [];
  backend.onChange((hass) => changes.push(hass.states["vacuum.saugi"].state));
  const first = backend.hass;
  assert.throws(() => backend.until("Saugi mops the kitchen"), /the card has not sent .*release_rooms/);
  await sendRecordedCommands(backend, "device_fault", (step) => step.home === "Saugi mops the kitchen");
  backend.until("Saugi mops the kitchen");
  assert.equal(backend.hass.states["vacuum.saugi"].state, "cleaning");
  assert.notEqual(backend.hass, first);
  backend.until("The mop carriage drops off; Saugi stops");
  assert.equal(backend.hass.states["vacuum.saugi"].state, "error");
  assert.deepEqual(advanced, [60_000, 300_000]);
  assert.ok(changes.includes("cleaning") && changes.includes("error"));
  assert.throws(() => backend.until("Saugi mops the kitchen"), /no home change "Saugi mops the kitchen" ahead/);
});

test("answers can be held back and a lost connection rejects them", async () => {
  const backend = createRecordedBackend(recording("start_delay"));
  const lost = [];
  backend.hass.connection.addEventListener("disconnected", () => lost.push("disconnected"));
  const release = backend.hold();
  let answered = false;
  const pending = backend.hass.callWS(QUEUE).then(() => (answered = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(answered, false);
  release();
  await pending;
  assert.equal(answered, true);
  backend.hold();
  const dropped = backend.hass.callWS(QUEUE);
  backend.disconnect();
  await assert.rejects(dropped, (error) => error === 3);
  await assert.rejects(backend.hass.callWS(QUEUE), (error) => error === 3);
  assert.deepEqual(lost, ["disconnected"]);
  backend.reconnect();
});

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
// Where each lived-in home is handed to the card: set up, before the first change.
const OPENED = Object.freeze({ from: "The card opens" });

// The card's first command in `device_fault`: the dining room released as the release dialog does.
async function releaseDiningRoom(backend) {
  const rooms = (await backend.hass.callWS({ ...ROOMS })).rooms;
  return backend.hass.callWS({
    type: "vacuum_orchestrator/configuration/command",
    command: "release_rooms",
    parameters: { grants: [{ room: rooms.find((room) => room.name === "Dining Room").room_id, kind: "permanent" }] },
  });
}

// The harness words states as Home Assistant does, so goldens show no raw keys.
test("the harness words entity states as Home Assistant does", () => {
  const { formatLikeHomeAssistant: words } = require("../helpers/recorded-backend.js");
  const door = { entity_id: "binary_sensor.door", state: "off", attributes: { device_class: "door" } };
  assert.deepEqual([words(door, "en"), words(door, "de"), words(door, "en", "on")], ["Closed", "Geschlossen", "Open"]);
  assert.deepEqual([words({ entity_id: "sensor.rocky_status", state: "segment_cleaning", attributes: {} }, "en"), words({ entity_id: "sensor.rocky_battery", state: "100", attributes: { unit_of_measurement: "%" } }, "en"), words({ entity_id: "vacuum.rocky", state: "docked", attributes: {} }, "de")], ["Segment cleaning", "100 %", "Angedockt"]);
});

test("hass holds states, entities, areas, actions and user as the frontend builds them", () => {
  const formatted = [];
  const backend = createRecordedBackend(recording("device_fault"), { from: "The card opens", language: "de", formatEntityState: (state, language) => (formatted.push(language), `${state.state}!`) });
  const { hass } = backend;
  const rocky = hass.states["vacuum.rocky"];
  assert.equal(rocky.state, "docked");
  assert.equal(rocky.attributes.fan_speed, "balanced");
  assert.equal(rocky.last_changed, "2026-03-14T09:26:53.589Z");
  assert.equal(rocky.last_updated, rocky.last_changed);
  assert.equal(hass.entities["vacuum.rocky"].platform, "roborock");
  assert.equal(hass.entities["vacuum.rocky"].has_entity_name, true);
  assert.equal(hass.entities["sensor.rocky_vacuum_error"].entity_category, "diagnostic");
  assert.equal(hass.areas.dining_room.name, "Dining Room");
  assert.ok("create_job" in hass.services.vacuum_orchestrator);
  assert.ok(hass.config.components.includes("vacuum_orchestrator"));
  assert.equal(hass.user.is_admin, true);
  assert.equal(hass.language, "de");
  assert.equal(hass.formatEntityState(rocky), "docked!");
  assert.deepEqual(formatted, ["de"]);
  assert.equal(createRecordedBackend(recording("device_fault"), { from: "The card opens", admin: false }).hass.user.is_admin, false);
});

test("a read gets the integration's answer of its stretch of the recording", async () => {
  const backend = createRecordedBackend(recording("device_fault"), OPENED);
  const before = (await backend.hass.callWS({ ...ROOMS })).rooms;
  assert.ok(before.every((room) => room.released === false));
  await releaseDiningRoom(backend);
  const after = (await backend.hass.callWS({ ...ROOMS })).rooms;
  assert.deepEqual(after.filter((room) => room.released).map((room) => room.name), ["Dining Room"]);
  // The transport id never matters, the parameters do.
  assert.deepEqual((await backend.hass.connection.sendMessagePromise({ ...QUEUE, id: 77 })).mode, "idle");
  assert.deepEqual(backend.calls.at(-1), { ...QUEUE });
});

test("a request missing from the recording fails with the scenario to record it in", () => {
  const backend = createRecordedBackend(recording("start_delay"), OPENED);
  assert.throws(() => backend.hass.callWS({ ...QUEUE, limit: 10 }), /start_delay: the recording has no .*"limit":10/);
});

test("commands follow the recorded order", async () => {
  const backend = createRecordedBackend(recording("device_fault"), OPENED);
  assert.throws(() => backend.hass.callService("vacuum_orchestrator", "run_queue", {}, undefined, false, true), /the card sent .*run_queue.* but the recording continues with .*release_rooms/);
  await releaseDiningRoom(backend);
  assert.equal(backend.finished, false);
  const areas = [backend.hass.areas.dining_room.area_id];
  const response = await backend.hass.callService("vacuum_orchestrator", "create_job", { areas, mode: "mop", start: true }, undefined, false, true);
  assert.equal(response.response.api_version, 4);
  assert.equal(backend.finished, true);
});

test("events before a command's result reach the card first, later ones after it", async () => {
  const backend = createRecordedBackend(recording("device_fault"), OPENED);
  const seen = [];
  await backend.hass.connection.subscribeMessage(() => seen.push("event"), { type: "vacuum_orchestrator/subscribe" });
  await releaseDiningRoom(backend);
  seen.push("result");
  await new Promise((resolve) => setTimeout(resolve, 0));
  // As recorded: one event before the release's result, one after it.
  assert.deepEqual(seen, ["event", "result", "event"]);
});

test("an answer recorded after a home change arrives only once the home change is played", async () => {
  const backend = createRecordedBackend(recording("delayed_answer"), OPENED);
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
  const meanwhile = (await backend.hass.callWS({ ...QUEUE })).commit_id;
  backend.until("Rocky's cloud confirms the command");
  await pending;
  assert.equal(answered.response.api_version, 4);
  assert.equal((await backend.hass.callWS({ ...QUEUE })).commit_id, meanwhile + 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // As recorded after the confirmation: one event before the answer, one after it.
  assert.deepEqual(seen.slice(seen.indexOf("result") - 1), ["event", "result", "event"]);
});

test("a lost connection rejects an answer the recording has not reached", async () => {
  const backend = createRecordedBackend(recording("delayed_answer"), OPENED);
  const start = await sendRecordedCommands(backend, "delayed_answer", (step) => step.send?.service === "create_job");
  const { id: _id, ...message } = start.send;
  const pending = backend.hass.callService(message.domain, message.service, message.service_data, undefined, false, true);
  backend.disconnect();
  await assert.rejects(pending, (error) => error === 3);
});

test("a card opened at a mark sees the home, the time and the answers of that point", async () => {
  const backend = createRecordedBackend(recording("recovery"), { from: "The job needs clarification" });
  assert.equal(backend.hass.states["vacuum.rocky"].state, "unavailable");
  assert.ok(backend.hass.config.components.includes("vacuum_orchestrator"));
  // A minute of cleaning and ten minutes offline passed before the mark.
  assert.equal(backend.nowMs, Date.parse("2026-03-14T09:26:53.589Z") + 660_000);
  assert.equal((await backend.hass.callWS({ ...QUEUE })).recovery_targets.length, 1);
  assert.equal(backend.finished, false);
  // Up to the next cause: the card's recovery command.
  backend.until("Rocky is back at its dock");
  assert.equal(backend.hass.states["vacuum.rocky"].state, "docked");
  assert.equal((await backend.hass.callWS({ ...QUEUE })).recovery_targets.length, 1, "the integration still waits for the user");
  assert.throws(() => createRecordedBackend(recording("recovery"), { from: "Nowhere" }), /recovery: no mark "Nowhere"/);
});

test("a card opened at a mark sends the commands recorded after it", async () => {
  const backend = createRecordedBackend(recording("queue_end"), { from: "The queue waits for work" });
  const response = await backend.hass.callService("vacuum_orchestrator", "end_queue", {}, undefined, false, true);
  assert.equal(response.response.api_version, 4);
  assert.equal(backend.finished, true);
});

// Sends the commands recorded after the card opens in order, as the card would, until `stop`
// names a step.
async function sendRecordedCommands(backend, name, stop) {
  const { steps } = recording(name);
  for (const step of steps.slice(steps.findIndex((item) => item.mark === OPENED.from) + 1)) {
    if (stop(step)) return step;
    const { id: _id, ...message } = step.send || {};
    if (message.type === "call_service") await backend.hass.callService(message.domain, message.service, message.service_data, undefined, false, true);
    else if (message.type === "vacuum_orchestrator/configuration/command") await backend.hass.callWS(message);
  }
  return null;
}

test("recorded errors arrive as Home Assistant rejects them", async () => {
  const backend = createRecordedBackend(recording("job_hold"), OPENED);
  let holds = 0;
  const conflict = await sendRecordedCommands(backend, "job_hold", (step) => step.send?.command === "hold_job" && ++holds === 2);
  const { id: _id, ...second } = conflict.send;
  await assert.rejects(backend.hass.callWS(second), (error) => error.code === "job_held" && error.translation_key === "job_held");
});

test("a refused message never reaches the integration, so the recording waits for it", async () => {
  const backend = createRecordedBackend(recording("device_fault"), OPENED);
  const release = { type: "vacuum_orchestrator/configuration/command", command: "release_rooms" };
  backend.failNext(release, { code: "home_assistant_error", message: "Unauthorized" });
  await assert.rejects(releaseDiningRoom(backend), (error) => error.code === "home_assistant_error");
  const released = await releaseDiningRoom(backend);
  assert.equal(released.room_ids.length, 1);
  assert.throws(() => backend.hass.callWS({ type: "manifest/get", integration: "vacuum_orchestrator" }), /the recording has no .*manifest\/get/);
  backend.failNext({ type: "manifest/get" }, { code: "home_assistant_error", message: "boom" });
  await assert.rejects(backend.hass.callWS({ type: "manifest/get", integration: "vacuum_orchestrator" }), (error) => error.message === "boom");
});

test("home changes, time and hass follow the recording", async () => {
  const advanced = [];
  const backend = createRecordedBackend(recording("device_fault"), { ...OPENED, clock: { advance: (ms) => advanced.push(ms) } });
  const changes = [];
  backend.onChange((hass) => changes.push(hass.states["vacuum.rocky"].state));
  const first = backend.hass;
  assert.throws(() => backend.until("Rocky mops the dining room"), /the card has not sent .*release_rooms/);
  await sendRecordedCommands(backend, "device_fault", (step) => step.home === "Rocky mops the dining room");
  backend.until("Rocky mops the dining room");
  assert.equal(backend.hass.states["vacuum.rocky"].state, "cleaning");
  assert.notEqual(backend.hass, first);
  backend.until("The mop carriage drops off; Rocky stops");
  assert.equal(backend.hass.states["vacuum.rocky"].state, "error");
  assert.deepEqual(advanced, [60_000, 300_000]);
  assert.ok(changes.includes("cleaning") && changes.includes("error"));
  assert.throws(() => backend.until("Rocky mops the dining room"), /no home change "Rocky mops the dining room" ahead/);
});

test("answers can be held back and a lost connection rejects them", async () => {
  const backend = createRecordedBackend(recording("start_delay"), OPENED);
  const lost = [];
  backend.hass.connection.addEventListener("disconnected", () => lost.push("disconnected"));
  const release = backend.hold();
  let answered = false;
  const pending = backend.hass.callWS({ ...QUEUE }).then(() => (answered = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(answered, false);
  release();
  await pending;
  assert.equal(answered, true);
  backend.hold();
  const dropped = backend.hass.callWS({ ...QUEUE });
  backend.disconnect();
  await assert.rejects(dropped, (error) => error === 3);
  await assert.rejects(backend.hass.callWS({ ...QUEUE }), (error) => error === 3);
  assert.deepEqual(lost, ["disconnected"]);
  backend.reconnect();
});

// Rooms and robots driven through the built card: releasing and locking rooms, room settings,
// a new room, a job for a room; adding a discovered robot, editing a profile and the lease that
// blocks reconfiguration.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

const room = (roomId) => `[data-key="room:${roomId}"]`;

async function rooms(options = {}) {
  const card = await mountCard({ env, ...options });
  await card.click('[role="tab"][data-view="rooms"]');
  await card.settle(24);
  return card;
}

test("a robot stopped away from its dock is sent home from its card", async () => {
  const card = await mountCard({ env, scenario: "ending" });
  await card.click('[role=tab][data-view="robots"]');
  assert.equal(card.root.querySelector('[data-key="robot:robot-rocky"] [data-action="return-robot"]'), null, "a robot at work is not sent home");
  await card.click('[data-key="robot:robot-dusty"] [data-action="return-robot"]');
  await card.settle(32);
  assert.deepEqual(card.services("return_robot").map((call) => call.data), [{ robot_id: "robot-dusty" }]);
  assert.match(card.text(".voc-notice"), /Return to dock requested/);
  card.unmount();
});

test("rooms show the integration's due verdicts and release state", async () => {
  const card = await rooms();
  assert.equal(card.all(".voc-room").length, 5);
  assert.match(card.text(`${room("room-kitchen")} [data-key="due:vacuum"]`), /Due/);
  assert.match(card.text(room("room-bedroom")), /No robot reaches this room/);
  assert.match(card.text(room("room-bathroom")), /Bathroom door/);
  card.unmount();
});

test("a timed release sends its duration; locking sends a revoke", async () => {
  const card = await rooms();
  await card.click(`${room("room-bathroom")} [data-action="open-release"]`);
  assert.equal(card.root.querySelector(".voc-overlay").getAttribute("role"), "dialog");
  await card.click('[data-key="field:overlay:releaseKind"] [data-value="timed"]');
  await card.type('[data-field="overlay:hours"]', "1");
  await card.type('[data-field="overlay:minutes"]', "15");
  await card.click('[data-action="release-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("release_room").map((message) => message.parameters), [{ room_id: "room-bathroom", kind: "timed", duration_seconds: 4500 }]);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  await card.click(`${room("room-kitchen")} [data-action="revoke-room"]`);
  await card.settle(32);
  assert.deepEqual(card.commands("revoke_room").map((message) => message.parameters), [{ room_id: "room-kitchen" }]);
  card.unmount();
});

test("a room is excluded after a confirmation and included again from the room list", async () => {
  const card = await rooms();
  await card.click(`${room("room-hall")} [data-action="edit-room"]`);
  await card.click('[data-action="disable-room"]');
  assert.equal(card.text("#voc-overlay-title"), "Exclude room?");
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.deepEqual(card.commands("disable_room").map((message) => message.parameters), [{ room_id: "room-hall" }]);
  assert.equal(card.text(".voc-notice-text"), "Room excluded.");
  await card.click('[data-key="excluded"] [data-action="toggle"]');
  await card.click(`${room("room-hall")} [data-action="enable-room"]`);
  await card.settle(32);
  assert.deepEqual(card.commands("enable_room").map((message) => message.parameters), [{ room_id: "room-hall" }]);
  assert.equal(card.text(".voc-notice-text"), "Room included.");
  assert.deepEqual(card.commands("update_room"), [], "including a room is its own command");
  card.unmount();
});

test("room settings save only what changed", async () => {
  const card = await rooms();
  await card.click(`${room("room-hall")} [data-action="edit-room"]`);
  assert.equal(card.root.querySelector('[data-field="vacuumHours"]').value, "24");
  await card.type('[data-field="vacuumHours"]', "36");
  await card.click('[data-action="save-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("update_room").map((message) => message.parameters), [{ room_id: "room-hall", configuration: { due_policy: { vacuum_seconds: 129600 } } }]);
  card.unmount();
});

test("a job for one room opens the editor with that room chosen", async () => {
  const card = await rooms();
  await card.click(`${room("room-kitchen")} [data-action="create-job"]`);
  assert.equal(card.root.querySelector('[data-value="room-kitchen"]').getAttribute("aria-selected"), "true");
  card.unmount();
});

test("a new room needs a name and is created without an area", async () => {
  const card = await rooms();
  await card.click('[data-action="create-room"]');
  await card.click('[data-action="save-new-room"]');
  assert.ok(card.root.querySelector(".voc-field-error"));
  await card.type('[data-field="overlay:name"]', "Office");
  await card.click('[data-action="save-new-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("create_room").map((message) => message.parameters), [{ name: "Office" }]);
  card.unmount();
});

async function robots(options = {}) {
  const card = await mountCard({ env, ...options });
  await card.click('[role="tab"][data-view="robots"]');
  await card.settle(24);
  return card;
}

test("robots show live state, and a profile under a lease cannot be reconfigured", async () => {
  const card = await robots();
  assert.match(card.text('[data-key="robot:robot-rocky"]'), /76 %/);
  const rockySettings = card.root.querySelector('[data-key="robot:robot-rocky"] [data-action="edit-robot"]');
  assert.equal(rockySettings.disabled, true);
  assert.ok(rockySettings.getAttribute("title"));
  card.unmount();
});

test("a profile change sends the complete definition with the new role entity", async () => {
  const card = await robots();
  await card.click('[data-key="robot:robot-dusty"] [data-action="edit-robot"]');
  await card.click('[data-action="toggle-section"][data-args*="roles"]');
  await card.click('[data-key="role:error"] [data-value="entity"]');
  await card.type('[data-field="query:roles.error.entity"]', "dusty");
  await card.click('[data-key="role:error"] .voc-entity-match');
  await card.click('[data-action="save-robot"]');
  await card.settle(32);
  const [message] = card.commands("configure_robot");
  assert.equal(message.parameters.robot_id, "robot-dusty");
  assert.equal(message.parameters.configuration.roles.error, "sensor.dusty_battery");
  assert.equal(message.parameters.configuration.robot_entity_id, "vacuum.dusty");
  card.unmount();
});

test("a discovered vacuum is added from the setup assistant", async () => {
  const card = await mountCard({ env, scenario: "fresh" });
  assert.equal(card.root.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "setup");
  await card.click('[data-action="add-candidate"][data-args*="vacuum.rocky"]');
  await card.settle(32);
  assert.deepEqual(card.commands("add_robot").map((message) => message.parameters), [{ configuration: { robot_entity_id: "vacuum.rocky" } }]);
  assert.equal(card.root.querySelector('[data-key="step:robots"]').dataset.done, "true");
  assert.equal(card.root.querySelector('[data-key="step:rooms"]').dataset.current, "true");
  card.unmount();
});

// Rooms and robots driven through the built card: releasing and locking rooms, room settings,
// a new room, a job for a room; sending a robot home, adding a discovered robot, editing a
// profile and the lease that blocks reconfiguration. Each command is the integration's next
// recorded one.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../../helpers/mount-card.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };

async function open(view, place) {
  const card = await mountCard(place);
  await card.click(`[role="tab"][data-view="${view}"]`);
  await card.settle(24);
  return card;
}
const rooms = (from) => open("rooms", from ? { recording: "room_controls", from } : BUSY);
const room = (card, name) => card.named(".voc-room", name);
const roomId = (card, name) => room(card, name).dataset.key.replace(/^room:/, "");
const robot = (card, name) => card.named(".voc-robot", name);

test("rooms show the integration's due verdicts, release state and conditions", async () => {
  const card = await rooms();
  assert.deepEqual(card.all(".voc-room-name").map((node) => node.textContent.trim()), ["Dining Room", "Studio", "Library", "Conservatory"]);
  assert.match(room(card, "Dining Room").querySelector('[data-key="due:vacuum"]').textContent, /Due in 2 days/);
  assert.match(room(card, "Studio").querySelector('[data-key="due:vacuum"]').textContent, /Never cleaned/);
  assert.match(room(card, "Library").textContent, /Released · one job/);
  assert.match(room(card, "Studio").textContent, /Released · \d+ h( \d+ min)? left/);
  assert.match(room(card, "Conservatory").textContent, /No robot reaches this room/);
  assert.match(room(card, "Conservatory").textContent, /Conservatory Door/);
  card.unmount();
});

// REL-04: two released rooms are locked with one command, in the order the view lists them.
test("released rooms are locked together", async () => {
  const card = await rooms("The studio and the library are released");
  assert.match(card.text('[data-key="lock-all"]'), /2 rooms released/);
  await card.click('[data-key="lock-all"] [data-action="lock-rooms"]');
  await card.settle(32);
  assert.deepEqual(card.commands("revoke_rooms").map((message) => message.parameters), [{ rooms: [roomId(card, "Studio"), roomId(card, "Library")] }]);
  assert.equal(card.root.querySelector('[data-key="lock-all"]'), null, "nothing left to lock");
  card.unmount();
});

test("a timed release sends its duration; locking sends a revoke", async () => {
  const card = await rooms("The dining room is released");
  const [library, dining] = [roomId(card, "Library"), roomId(card, "Dining Room")];
  await card.click(room(card, "Library").querySelector('[data-action="open-release"]'));
  assert.equal(card.root.querySelector(".voc-dialog").getAttribute("role"), "dialog");
  await card.click('[data-key="field:release:0:kind"] [data-value="timed"]');
  await card.type('[data-field="release:0:hours"]', "1");
  await card.type('[data-field="release:0:minutes"]', "15");
  await card.click('[data-action="release-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("release_rooms").map((message) => message.parameters), [{ grants: [{ room: library, kind: "timed", duration_seconds: 4500 }] }]);
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  await card.click(room(card, "Dining Room").querySelector('[data-action="revoke-room"]'));
  await card.settle(32);
  assert.deepEqual(card.commands("revoke_rooms").map((message) => message.parameters), [{ rooms: [dining] }]);
  assert.match(room(card, "Library").textContent, /Released/);
  card.unmount();
});

test("a room is excluded after a confirmation and included again from the room list", async () => {
  const card = await rooms("The library is released for 75 minutes");
  const studio = roomId(card, "Studio");
  await card.click(room(card, "Studio").querySelector('[data-action="edit-room"]'));
  // UI-20: excluding is undone by including again, so it is no destructive action and not red.
  assert.ok(!card.root.querySelector('[data-action="disable-room"]').classList.contains("voc-button--danger"));
  await card.click('[data-action="disable-room"]');
  assert.equal(card.text("#voc-dialog-title"), "Exclude room?");
  assert.ok(card.root.querySelector('[data-action="confirm-command"]').classList.contains("voc-button--primary"));
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.deepEqual(card.commands("disable_room").map((message) => message.parameters), [{ room_id: studio }]);
  assert.equal(card.text(".voc-notice-text"), "Room excluded.");
  await card.click('[data-key="excluded"] [data-action="toggle"]');
  await card.click(room(card, "Studio").querySelector('[data-action="enable-room"]'));
  await card.settle(32);
  assert.deepEqual(card.commands("enable_room").map((message) => message.parameters), [{ room_id: studio }]);
  assert.equal(card.text(".voc-notice-text"), "Room included.");
  assert.deepEqual(card.commands("update_room"), [], "including a room is its own command");
  card.unmount();
});

test("room settings save only what changed", async () => {
  const card = await rooms("The studio is included again");
  const dining = roomId(card, "Dining Room");
  await card.click(room(card, "Dining Room").querySelector('[data-action="edit-room"]'));
  // An interval that is off is empty; one day and twelve hours travel as 36 hours.
  const parts = (interval) => [card.root.querySelector(`[data-field="${interval}:days"]`).value, card.root.querySelector(`[data-field="${interval}:hours"]`).value];
  assert.deepEqual(parts("vacuumHours"), ["", ""]);
  await card.type('[data-field="vacuumHours:days"]', "1");
  assert.deepEqual(parts("vacuumHours"), ["1", "0"]);
  await card.type('[data-field="vacuumHours:hours"]', "12");
  assert.deepEqual(parts("vacuumHours"), ["1", "12"]);
  await card.click('[data-action="save-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("update_room").map((message) => message.parameters), [{ room_id: dining, configuration: { due_policy: { vacuum_seconds: 129600 } } }]);
  card.unmount();
});

test("a job for one room opens the editor with that room chosen", async () => {
  const card = await rooms();
  const dining = roomId(card, "Dining Room");
  await card.click(room(card, "Dining Room").querySelector('[data-action="create-job"]'));
  await card.settle(32);
  assert.equal(card.root.querySelector(`[data-field-control="chips"] [data-value="${dining}"]`).getAttribute("aria-selected"), "true");
  card.unmount();
});

test("a new room needs a name and is created without an area", async () => {
  const card = await rooms("The dining room is due every 36 hours");
  await card.click('[data-action="create-room"]');
  await card.click('[data-action="save-new-room"]');
  assert.ok(card.root.querySelector(".voc-field-error"));
  await card.type('[data-field="overlay:name"]', "Office");
  await card.click('[data-action="save-new-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("create_room").map((message) => message.parameters), [{ name: "Office" }]);
  assert.ok(room(card, "Office"));
  card.unmount();
});

test("robots show live state, and a profile under a lease cannot be reconfigured", async () => {
  const card = await open("robots", BUSY);
  assert.match(robot(card, "Rocky").textContent, /100 %/);
  const settings = robot(card, "Rocky").querySelector('[data-action="edit-robot"]');
  assert.equal(settings.disabled, true);
  assert.ok(settings.getAttribute("title"));
  card.unmount();
});

test("a robot stopped away from its dock is sent home from its card", async () => {
  const card = await open("robots", { recording: "queue_controls", from: "Rocky stopped in the studio" });
  const rocky = robot(card, "Rocky").dataset.key.replace(/^robot:/, "");
  await card.click(robot(card, "Rocky").querySelector('[data-action="return-robot"]'));
  await card.settle(32);
  assert.deepEqual(card.services("return_robot").map((call) => call.data), [{ robot_id: rocky }]);
  assert.match(card.text(".voc-notice"), /Return to dock requested/);
  card.unmount();
});

test("a profile change sends the complete definition read from the integration", async () => {
  const card = await open("robots", { recording: "robot_choice", from: "The card opens" });
  await card.click(robot(card, "Dusty").querySelector('[data-action="edit-robot"]'));
  await card.click('[data-key="field:fixedMode"] [data-value="vacuum"]');
  await card.click('[data-action="save-robot"]');
  await card.settle(32);
  const [message] = card.commands("configure_robot");
  assert.equal(message.parameters.configuration.fixed_mode, "vacuum");
  assert.equal(message.parameters.configuration.robot_entity_id, "vacuum.dusty");
  card.unmount();
});

test("a discovered vacuum is added from the robots view", async () => {
  const card = await open("robots", { recording: "robot_removed", from: "Rocky is not configured" });
  await card.click('[data-key="candidates"] [data-action="add-robot"]');
  await card.click('[data-action="add-candidate"][data-args*="vacuum.rocky"]');
  await card.settle(32);
  assert.deepEqual(card.commands("add_robot").map((message) => message.parameters), [{ entity_id: "vacuum.rocky" }]);
  assert.ok(robot(card, "Rocky"));
  card.unmount();
});

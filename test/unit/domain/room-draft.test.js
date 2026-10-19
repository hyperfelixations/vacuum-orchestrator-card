// The room settings draft: hour-based intervals, path updates, the field an error of the
// integration names, and a patch that carries only what changed.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");

async function load() {
  const draftModule = await import("../../../src/domain/room-draft.js");
  const { normalizeRoom } = await import("../../../src/domain/rooms.js");
  const room = normalizeRoom(W.wireRoom({
    due_policy: { vacuum_seconds: 172800, mop_seconds: null },
    requirements: [W.wireRoomRequirement()],
    bindings: [{ robot_id: "robot-rocky", target_ids: ["16", "17"], map_id: "map-0" }],
  }));
  return { ...draftModule, room };
}

test("intervals are edited in hours, lists as comma-separated text", async () => {
  const { createRoomDraft, room } = await load();
  const draft = createRoomDraft(room);
  assert.equal(draft.vacuumHours, 48);
  assert.equal(draft.mopHours, null);
  assert.equal(draft.requirements[0].acceptedStates, "on");
  assert.equal(draft.bindings[0].targetIds, "16, 17");
  assert.equal(draft.meta.roomId, room.roomId);
});

// An interval reads in days and hours; both empty or zero switch it off.
test("an interval is edited as days and hours and kept in hours", async () => {
  const { createRoomDraft, updateRoomDraft, intervalParts, intervalOf, room } = await load();
  const draft = createRoomDraft(room);
  assert.deepEqual([intervalParts(48), intervalParts(36), intervalParts(null), intervalParts(0)], [{ days: 2, hours: 0 }, { days: 1, hours: 12 }, { days: null, hours: null }, { days: null, hours: null }]);
  assert.equal(updateRoomDraft(draft, "vacuumHours:days", 7).vacuumHours, 168);
  assert.equal(updateRoomDraft(draft, "vacuumHours:hours", 6).vacuumHours, 54);
  assert.equal(updateRoomDraft(draft, "mopHours:hours", 5).mopHours, 5, "an interval that was off starts from nothing");
  assert.equal(updateRoomDraft(updateRoomDraft(draft, "vacuumHours:days", null), "vacuumHours:hours", null).vacuumHours, null);
  assert.equal(updateRoomDraft(draft, "vacuumHours:days", 0).vacuumHours, null, "zero days and hours is off");
  assert.equal(updateRoomDraft(draft, "nameHours:days", 1), draft, "only an interval has parts");
  assert.deepEqual([intervalOf("vacuumHours:days"), intervalOf("mopHours:hours"), intervalOf("vacuumHours"), intervalOf("overlay:minutes")], ["vacuumHours", "mopHours", null, null]);
});

test("an unchanged draft makes an empty patch", async () => {
  const { createRoomDraft, roomDraftToPatch, isRoomDirty, updateRoomDraft, room } = await load();
  const draft = createRoomDraft(room);
  assert.deepEqual({ ...roomDraftToPatch(draft) }, {});
  assert.equal(isRoomDirty(draft), false);
  assert.equal(isRoomDirty(updateRoomDraft(draft, "mopHours", 24)), true);
});

test("renaming stops following the area name, and the patch says so", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, room } = await load();
  const draft = updateRoomDraft(createRoomDraft(room), "name", "  Dining nook ");
  assert.equal(draft.followAreaName, false);
  assert.deepEqual({ ...roomDraftToPatch(draft) }, { name: "Dining nook", follow_area_name: false });
});

test("due policy changes merge field by field, in seconds", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, room } = await load();
  let draft = createRoomDraft(room);
  draft = updateRoomDraft(draft, "vacuumHours", null);
  draft = updateRoomDraft(draft, "mopHours", 168);
  draft = updateRoomDraft(draft, "basis", "occupied");
  draft = updateRoomDraft(draft, "occupancyEntityId", "binary_sensor.dining_room_occupancy");
  assert.deepEqual(JSON.parse(JSON.stringify(roomDraftToPatch(draft))), { due_policy: { basis: "occupied", vacuum_seconds: null, mop_seconds: 604800, occupancy_entity_id: "binary_sensor.dining_room_occupancy" } });
});

test("conditions and bindings replace their whole list on the wire", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, newRequirement, newBinding, room } = await load();
  let draft = createRoomDraft(room);
  draft = updateRoomDraft(draft, "requirements", [...draft.requirements, newRequirement("binary_sensor.window")]);
  draft = updateRoomDraft(draft, "requirements.1.maxAgeMinutes", 10);
  draft = updateRoomDraft(draft, "bindings", [...draft.bindings, { ...newBinding("robot-dusty"), targetIds: "dining_room" }]);
  const patch = JSON.parse(JSON.stringify(roomDraftToPatch(draft)));
  assert.deepEqual(patch.requirements, [
    { entity_id: "binary_sensor.conservatory_door", accepted_states: ["on"] },
    { entity_id: "binary_sensor.window", accepted_states: ["on"], max_age_seconds: 600 },
  ]);
  assert.deepEqual(patch.bindings, [{ robot_id: "robot-rocky", target_ids: ["16", "17"], map_id: "map-0" }, { robot_id: "robot-dusty", target_ids: ["dining_room"] }]);
});

test("paths that do not exist or reach into meta change nothing", async () => {
  const { createRoomDraft, updateRoomDraft, room } = await load();
  const draft = createRoomDraft(room);
  assert.equal(updateRoomDraft(draft, "meta.roomId", "x"), draft);
  assert.equal(updateRoomDraft(draft, "requirements.7.acceptedStates", "on"), draft);
  assert.equal(updateRoomDraft(draft, "__proto__.x", 1), draft);
  assert.equal(updateRoomDraft(draft, "nothing", 1), draft);
});

test("an error of update_room lands on the editor field its path names", async () => {
  const { roomFieldOf } = await load();
  const fields = {
    "configuration.name": "name",
    "configuration.follow_area_name": "followAreaName",
    "configuration.due_policy.vacuum_seconds": "vacuumHours",
    "configuration.due_policy.occupancy_entity_id": "occupancyEntityId",
    "configuration.due_policy.unoccupied_state": "unoccupiedState",
    "configuration.requirements.0.accepted_states": "requirements.0",
    "configuration.bindings.2": "bindings.2",
    "configuration.bindings": null,
    "configuration.due_policy": null,
    "configuration.area_id": null,
    room_id: null,
    "": null,
  };
  assert.deepEqual(Object.fromEntries(Object.keys(fields).map((path) => [path, roomFieldOf(path)])), fields);
});

test("comma and line separated lists ignore empty entries", async () => {
  const { splitList } = await load();
  assert.deepEqual(splitList(" on, open\n,  , home "), ["on", "open", "home"]);
  assert.deepEqual(splitList(null), []);
});

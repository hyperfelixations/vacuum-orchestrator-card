// The room settings draft: hour-based intervals, path updates, validation mirroring the room
// schema, and a patch that carries only what changed.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

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
  assert.equal(draft.meta.roomId, "room-kitchen");
});

test("an unchanged draft makes an empty patch", async () => {
  const { createRoomDraft, roomDraftToPatch, validateRoomDraft, room } = await load();
  const draft = createRoomDraft(room);
  assert.deepEqual({ ...roomDraftToPatch(draft) }, {});
  assert.equal(validateRoomDraft(draft).dirty, false);
});

test("renaming stops following the area name, and the patch says so", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, room } = await load();
  const draft = updateRoomDraft(createRoomDraft(room), "name", "  Kitchen corner ");
  assert.equal(draft.followAreaName, false);
  assert.deepEqual({ ...roomDraftToPatch(draft) }, { name: "Kitchen corner", follow_area_name: false });
});

test("due policy changes merge field by field, in seconds", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, room } = await load();
  let draft = createRoomDraft(room);
  draft = updateRoomDraft(draft, "vacuumHours", null);
  draft = updateRoomDraft(draft, "mopHours", 168);
  draft = updateRoomDraft(draft, "basis", "occupied");
  draft = updateRoomDraft(draft, "occupancyEntityId", "binary_sensor.kitchen_occupancy");
  assert.deepEqual(JSON.parse(JSON.stringify(roomDraftToPatch(draft))), { due_policy: { basis: "occupied", vacuum_seconds: null, mop_seconds: 604800, occupancy_entity_id: "binary_sensor.kitchen_occupancy" } });
});

test("conditions and bindings replace their whole list on the wire", async () => {
  const { createRoomDraft, updateRoomDraft, roomDraftToPatch, newRequirement, newBinding, room } = await load();
  let draft = createRoomDraft(room);
  draft = updateRoomDraft(draft, "requirements", [...draft.requirements, newRequirement("binary_sensor.window")]);
  draft = updateRoomDraft(draft, "requirements.1.maxAgeMinutes", 10);
  draft = updateRoomDraft(draft, "bindings", [...draft.bindings, { ...newBinding("robot-dusty"), targetIds: "kitchen" }]);
  const patch = JSON.parse(JSON.stringify(roomDraftToPatch(draft)));
  assert.deepEqual(patch.requirements, [
    { entity_id: "binary_sensor.hall_door", accepted_states: ["on"], entity_registry_id: "reg-hall-door" },
    { entity_id: "binary_sensor.window", accepted_states: ["on"], max_age_seconds: 600 },
  ]);
  assert.deepEqual(patch.bindings, [{ robot_id: "robot-rocky", target_ids: ["16", "17"], map_id: "map-0" }, { robot_id: "robot-dusty", target_ids: ["kitchen"] }]);
});

test("paths that do not exist or reach into meta change nothing", async () => {
  const { createRoomDraft, updateRoomDraft, room } = await load();
  const draft = createRoomDraft(room);
  assert.equal(updateRoomDraft(draft, "meta.roomId", "x"), draft);
  assert.equal(updateRoomDraft(draft, "requirements.7.acceptedStates", "on"), draft);
  assert.equal(updateRoomDraft(draft, "__proto__.x", 1), draft);
  assert.equal(updateRoomDraft(draft, "nothing", 1), draft);
});

test("validation mirrors the room schema", async () => {
  const { createRoomDraft, updateRoomDraft, validateRoomDraft, newBinding, room } = await load();
  let draft = createRoomDraft(room);
  draft = updateRoomDraft(draft, "name", " ");
  draft = updateRoomDraft(draft, "vacuumHours", 0);
  draft = updateRoomDraft(draft, "basis", "occupied");
  draft = updateRoomDraft(draft, "unoccupiedState", "on");
  draft = updateRoomDraft(draft, "requirements.0.acceptedStates", "");
  draft = updateRoomDraft(draft, "bindings", [...draft.bindings, newBinding("robot-rocky"), { ...newBinding("robot-rocky"), mapId: "map-0", targetIds: "1" }]);
  assert.deepEqual({ ...validateRoomDraft(draft).errors }, {
    name: "room_name_required",
    vacuumHours: "interval_positive",
    occupancyEntityId: "occupancy_source_required",
    occupancyStates: "invalid_occupancy_states",
    "requirements.0": "accepted_states_count",
    "bindings.1": "invalid_room_targets",
    "bindings.2": "duplicate_room_binding",
  });
});

test("comma and line separated lists ignore empty entries", async () => {
  const { splitList } = await load();
  assert.deepEqual(splitList(" on, open\n,  , home "), ["on", "open", "home"]);
  assert.deepEqual(splitList(null), []);
});

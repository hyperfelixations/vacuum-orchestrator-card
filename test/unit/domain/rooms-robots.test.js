// Rooms and robot profiles as the integration reports them: release grants, due verdicts and
// stamps for rooms; stored configuration, lease, block and resolved capabilities for robots;
// discovery candidates. Nothing here computes a verdict.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

const rooms = () => import("../../../src/domain/rooms.js");
const robots = () => import("../../../src/domain/robots.js");

test("a room keeps identity, grant, policy, stamps and the due verdict per operation", async () => {
  const { normalizeRoom } = await rooms();
  const room = normalizeRoom(W.wireRoom({
    room_id: "room-kitchen",
    name: "Kitchen",
    area_id: "kitchen",
    release: W.wireRelease({ kind: "timed", expires_at: "2026-09-17T14:00:00+00:00" }),
    released: true,
    due: { vacuum: W.wireDue({ state: "due", reason: "calendar_interval", elapsed_seconds: 200000 }), mop: W.wireDue({ state: "fresh", remaining_seconds: 3600 }) },
    last_cleaning: { vacuum: W.wireStamp(), mop: null },
    bindings: [{ robot_id: "robot-rocky", target_ids: ["16"], map_id: "map-0" }, { robot_id: "robot-dusty", target_ids: [] }],
    requirements: [W.wireRoomRequirement(), { accepted_states: ["on"] }],
  }));
  assert.equal(room.release.kind, "timed");
  assert.equal(room.release.expiresAt, Date.parse("2026-09-17T14:00:00Z"));
  assert.equal(room.released, true);
  assert.equal(room.due.vacuum.state, "due");
  assert.equal(room.due.mop.remainingSeconds, 3600);
  assert.equal(room.lastCleaning.vacuum.quality, "derived");
  assert.equal(room.lastCleaning.mop, null);
  assert.deepEqual(room.bindings.map((binding) => [binding.robotId, binding.mapId]), [["robot-rocky", "map-0"]]);
  assert.equal(room.requirements.length, 1);
  assert.ok(Object.isFrozen(room.due.vacuum));
});

test("missing room parts read as unknown or default, never as a verdict", async () => {
  const { normalizeRoom } = await rooms();
  const room = normalizeRoom({ room_id: "room-x" });
  assert.equal(room.name, "room-x");
  assert.equal(room.enabled, true);
  assert.equal(room.release, null);
  assert.equal(room.released, false);
  assert.equal(room.due.vacuum.state, "unknown");
  assert.equal(room.duePolicy.basis, "calendar");
  assert.equal(normalizeRoom({ name: "No id" }), null);
  assert.equal(normalizeRoom(W.wireRoom({ release: { kind: "forever", grant_id: "g" } })).release, null);
});

test("an area that disappeared and an excluded room are flagged as reported", async () => {
  const { normalizeRoom } = await rooms();
  const room = normalizeRoom(W.wireRoom({ area_missing: true, enabled: false, follow_area_name: false }));
  assert.deepEqual([room.areaMissing, room.enabled, room.followAreaName], [true, false, false]);
});

test("a robot keeps its stored configuration, an untouched wire copy and its capabilities", async () => {
  const { normalizeRobot, reachableRoomIds } = await robots();
  const robot = normalizeRobot(W.wireRobot({ active: true, blocked_reason: "robot_unavailable", configuration: { roles: { battery: "reg-b", status: null, nonsense: "x" }, mode_options: { vacuum: "Vac", mop: "" } } }));
  assert.equal(robot.active, true);
  assert.equal(robot.blockedReason, "robot_unavailable");
  assert.deepEqual({ ...robot.configuration.roles }, { battery: "reg-b", status: null });
  assert.deepEqual({ ...robot.configuration.optionMaps.mode_options }, { vacuum: "Vac" });
  assert.equal(robot.configuration.wire.roles.nonsense, "x", "the wire copy is untouched");
  assert.deepEqual(reachableRoomIds(robot), ["room-kitchen", "room-hall"]);
  assert.equal(robot.capabilities.maximumPasses, 3);
  assert.deepEqual(robot.capabilities.operations, ["mop", "vacuum", "vacuum_and_mop"]);
});

test("a robot without resolved capabilities reaches no room", async () => {
  const { normalizeRobot, reachableRoomIds } = await robots();
  const robot = normalizeRobot(W.wireRobot({ capabilities: null }));
  assert.equal(robot.capabilities, null);
  assert.deepEqual(reachableRoomIds(robot), []);
  assert.equal(normalizeRobot({ name: "no id" }), null);
});

test("capability lists keep only known values", async () => {
  const { normalizeRobot } = await robots();
  const robot = normalizeRobot(W.wireRobot({ capabilities: { operations: ["vacuum", "polish"], settings: { vacuum_power: ["turbo", "high", "maximum_plus"], mop_route: "deep" }, unavailable_settings: ["mop_intensity", "suction"], supports: { return_to_dock: true }, targets: { "room-a": [], "room-b": ["1"] } } }));
  assert.deepEqual(robot.capabilities.operations, ["vacuum"]);
  assert.deepEqual({ ...robot.capabilities.settings }, { vacuumPower: ["high", "maximum_plus"], mopIntensity: [], mopRoute: [] });
  assert.deepEqual(robot.capabilities.unavailableSettings, ["mopIntensity"]);
  assert.deepEqual({ ...robot.capabilities.supports }, { stop: false, returnToDock: true, pause: false });
  assert.deepEqual(Object.keys(robot.capabilities.targets), ["room-b"]);
});

test("a candidate keeps discovered and ambiguous roles; configured is decided by registry id", async () => {
  const { normalizeCandidate, normalizeRobot, isConfiguredCandidate } = await robots();
  const candidate = normalizeCandidate(W.wireCandidate({ ambiguous_roles: ["selected_map", "unknown_role"] }));
  assert.deepEqual({ ...candidate.roles }, { battery: "reg-rocky-battery", status: "reg-rocky-status" });
  assert.deepEqual(candidate.ambiguousRoles, ["selected_map"]);
  const mapped = normalizeCandidate(W.wireCandidate({ ambiguous_roles: { selected_map: ["a", "b"] } }));
  assert.deepEqual(mapped.ambiguousRoles, ["selected_map"]);
  assert.equal(isConfiguredCandidate(candidate, [normalizeRobot(W.wireRobot())]), true);
  assert.equal(isConfiguredCandidate(candidate, [normalizeRobot(W.wireRobot({ configuration: { robot_registry_id: "other" } }))]), false);
  assert.equal(normalizeCandidate({ entity_id: "vacuum.x" }), null);
});

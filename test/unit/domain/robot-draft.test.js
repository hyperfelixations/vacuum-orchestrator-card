// The robot profile draft: starts from the stored wire configuration, edits nested fields, names
// the field an error of the integration concerns, and hands `configure_robot` the complete
// definition with only the edited fields replaced.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");

async function load(configuration = {}) {
  const draftModule = await import("../../../src/domain/robot-draft.js");
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  const robot = normalizeRobot(W.wireRobot({ configuration: { roles: { battery: "reg-rocky-battery", status: null }, mode_options: { vacuum: "Vacuum" }, ...configuration } }));
  return { ...draftModule, robot };
}

test("roles read as automatic, off or a chosen entity, resolved to its entity id when known", async () => {
  const { createRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot, { roleEntities: { battery: "sensor.rocky_battery" } });
  assert.deepEqual({ ...draft.roles.battery }, { mode: "entity", entity: "sensor.rocky_battery" });
  assert.deepEqual({ ...draft.roles.status }, { mode: "off", entity: null });
  assert.deepEqual({ ...draft.roles.error }, { mode: "auto", entity: null });
  assert.equal(createRobotDraft(robot).roles.battery.entity, "reg-rocky-battery", "without a resolution the stored reference stays");
});

test("an unchanged draft gives back the stored definition", async () => {
  const { createRobotDraft, robotDraftToConfiguration, isRobotDirty, updateRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot);
  assert.equal(isRobotDirty(draft), false);
  assert.equal(isRobotDirty(updateRobotDraft(draft, "preference", 7)), true);
  const configuration = JSON.parse(JSON.stringify(robotDraftToConfiguration(draft)));
  assert.deepEqual(configuration, JSON.parse(JSON.stringify(robot.configuration.wire)));
});

// ROB-02, UI-32: the profile names the robot; empty clears a stored name, so Home Assistant's applies.
test("the robot's own name travels with its profile; empty returns to Home Assistant's", async () => {
  const { createRobotDraft, robotDraftToConfiguration, isRobotDirty, updateRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot);
  assert.equal(draft.name, "", "a robot named as in Home Assistant has no name of its own");
  const named = updateRobotDraft(draft, "name", " Rocky downstairs ");
  assert.equal(isRobotDirty(named), true);
  assert.equal(robotDraftToConfiguration(named).name, "Rocky downstairs");
  assert.equal(Object.hasOwn(robotDraftToConfiguration(draft), "name"), false, "nothing to clear, nothing sent");
  const custom = { ...robot, name: "Rocky downstairs", nameSource: "custom", configuration: { ...robot.configuration, wire: { ...robot.configuration.wire, name: "Rocky downstairs" } } };
  const kept = createRobotDraft(custom);
  assert.equal(kept.name, "Rocky downstairs");
  assert.equal(robotDraftToConfiguration(updateRobotDraft(kept, "name", "  ")).name, null, "an emptied name is cleared");
});

test("a time limit the integration does not report stays empty rather than a card value", async () => {
  const { createRobotDraft, robot } = await load();
  const { start_timeout_seconds: _gone, ...wire } = robot.configuration.wire;
  const draft = createRobotDraft({ ...robot, configuration: { ...robot.configuration, wire } });
  assert.equal(draft.timeouts.start_timeout_seconds, "");
  assert.equal(draft.timeouts.fault_timeout_seconds, robot.configuration.wire.fault_timeout_seconds);
});

test("edited fields replace their stored values; automatic roles leave the role map", async () => {
  const { createRobotDraft, updateRobotDraft, robotDraftToConfiguration, robot } = await load();
  let draft = createRobotDraft(robot);
  draft = updateRobotDraft(draft, "roles.status.mode", "auto");
  draft = updateRobotDraft(draft, "roles.error.mode", "entity");
  draft = updateRobotDraft(draft, "roles.error.entity", "sensor.rocky_error");
  draft = updateRobotDraft(draft, "preference", "20");
  draft = updateRobotDraft(draft, "minimumBattery", "");
  draft = updateRobotDraft(draft, "optionMaps.mode_options.mop", " Mop ");
  draft = updateRobotDraft(draft, "optionMaps.mode_options.vacuum", "");
  draft = updateRobotDraft(draft, "timeouts.start_timeout_seconds", "300");
  const configuration = robotDraftToConfiguration(draft);
  assert.deepEqual({ ...configuration.roles }, { battery: "reg-rocky-battery", error: "sensor.rocky_error" });
  assert.equal(configuration.preference, 20);
  assert.equal(configuration.minimum_battery, null);
  assert.deepEqual(configuration.mode_options, { mop: "Mop" });
  assert.equal(configuration.start_timeout_seconds, 300);
  assert.equal(configuration.robot_registry_id, robot.configuration.wire.robot_registry_id, "identity fields travel unchanged");
  assert.equal(configuration.target_areas, null, "no area restriction stays none");
  // UI-18: following Home Assistant's assignments or only some areas is an explicit choice.
  assert.equal(draft.areaScope, "follow");
  const only = updateRobotDraft(updateRobotDraft(draft, "areaScope", "only"), "targetAreas", ["dining_room"]);
  assert.deepEqual(robotDraftToConfiguration(only).target_areas, ["dining_room"]);
  assert.equal(robotDraftToConfiguration(updateRobotDraft(only, "areaScope", "follow")).target_areas, null, "following keeps no restriction, whatever was picked");
  assert.equal(robotDraftToConfiguration(updateRobotDraft(only, "targetAreas", [])).target_areas, null, "no area chosen is no restriction, as the integration stores it");
  assert.equal(createRobotDraft({ ...robot, configuration: { ...robot.configuration, wire: { ...robot.configuration.wire, target_areas: ["studio"] } } }).areaScope, "only");
});

test("an error of configure_robot lands on the editor field its path names", async () => {
  const { robotFieldOf } = await load();
  const fields = {
    "configuration.allowed_operations": "allowedOperations",
    "configuration.preference": "preference",
    "configuration.minimum_battery": "minimumBattery",
    "configuration.physical_robot_id": "physicalRobotId",
    "configuration.settle_seconds": "timeouts.settle_seconds",
    "configuration.vacuum_levels.turbo": "optionMaps.vacuum_levels",
    "configuration.roles.dock_error": "roles.dock_error",
    "configuration.requirements.0.entity_id": "requirements.0",
    "configuration.roles": null,
    "configuration.roles.unknown": null,
    "configuration.requirements": null,
    "configuration.unknown": null,
    configuration: null,
    robot_id: null,
    "": null,
  };
  assert.deepEqual(Object.fromEntries(Object.keys(fields).map((path) => [path, robotFieldOf(path)])), fields);
});

test("map options take free keys", async () => {
  const { createRobotDraft, updateRobotDraft, robotDraftToConfiguration, robot } = await load();
  const draft = updateRobotDraft(createRobotDraft(robot), "optionMaps.map_options", { "Main Floor": "map_0" });
  assert.deepEqual(robotDraftToConfiguration(draft).map_options, { "Main Floor": "map_0" });
});

test("unsafe or missing paths change nothing", async () => {
  const { createRobotDraft, updateRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot);
  assert.equal(updateRobotDraft(draft, "meta.wire", {}), draft);
  assert.equal(updateRobotDraft(draft, "roles.__proto__.mode", "x"), draft);
  assert.equal(updateRobotDraft(draft, "unknown", 1), draft);
});

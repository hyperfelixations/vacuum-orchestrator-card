// The robot profile draft: starts from the stored wire configuration, edits nested fields, mirrors
// the profile schema, and hands `configure_robot` the complete definition with only the edited
// fields replaced.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

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
  const { createRobotDraft, robotDraftToConfiguration, validateRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot);
  assert.equal(validateRobotDraft(draft).valid, true);
  assert.equal(validateRobotDraft(draft).dirty, false);
  const configuration = JSON.parse(JSON.stringify(robotDraftToConfiguration(draft)));
  assert.deepEqual(configuration, { ...JSON.parse(JSON.stringify(robot.configuration.wire)), physical_robot_id: null });
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
  assert.equal(configuration.robot_registry_id, "reg-vacuum-rocky", "identity fields travel unchanged");
});

test("validation mirrors the profile schema", async () => {
  const { createRobotDraft, updateRobotDraft, validateRobotDraft, robot } = await load();
  let draft = createRobotDraft(robot);
  draft = updateRobotDraft(draft, "allowedOperations", []);
  draft = updateRobotDraft(draft, "preference", 101);
  draft = updateRobotDraft(draft, "minimumBattery", 120);
  draft = updateRobotDraft(draft, "timeouts.settle_seconds", 0);
  draft = updateRobotDraft(draft, "timeouts.run_timeout_seconds", 90000);
  draft = updateRobotDraft(draft, "roles.dock_error.mode", "entity");
  draft = updateRobotDraft(draft, "optionMaps.mode_options.mop", "Vacuum");
  draft = updateRobotDraft(draft, "optionMaps.vacuum_levels.turbo", "Turbo");
  draft = updateRobotDraft(draft, "requirements", [{ entityId: "not an entity", acceptedStates: "on" }]);
  assert.deepEqual({ ...validateRobotDraft(draft).errors }, {
    allowedOperations: "empty_allowed_operations",
    preference: "invalid_robot_preference",
    minimumBattery: "invalid_minimum_battery",
    "timeouts.settle_seconds": "invalid_duration",
    "timeouts.run_timeout_seconds": "timeout_out_of_range",
    "roles.dock_error": "invalid_role_entity",
    "optionMaps.vacuum_levels": "invalid_option_mapping",
    "optionMaps.mode_options": "ambiguous_mode_mapping",
    "requirements.0": "invalid_entity_id",
  });
});

test("map options take free keys; an empty key is refused", async () => {
  const { createRobotDraft, updateRobotDraft, validateRobotDraft, robotDraftToConfiguration, robot } = await load();
  let draft = updateRobotDraft(createRobotDraft(robot), "optionMaps.map_options", { "Ground floor": "map_0" });
  assert.equal(validateRobotDraft(draft).valid, true);
  assert.deepEqual(robotDraftToConfiguration(draft).map_options, { "Ground floor": "map_0" });
  draft = updateRobotDraft(draft, "optionMaps.map_options", { " ": "map_1" });
  assert.equal(validateRobotDraft(draft).errors["optionMaps.map_options"], "invalid_option_mapping");
});

test("unsafe or missing paths change nothing", async () => {
  const { createRobotDraft, updateRobotDraft, robot } = await load();
  const draft = createRobotDraft(robot);
  assert.equal(updateRobotDraft(draft, "meta.wire", {}), draft);
  assert.equal(updateRobotDraft(draft, "roles.__proto__.mode", "x"), draft);
  assert.equal(updateRobotDraft(draft, "unknown", 1), draft);
});

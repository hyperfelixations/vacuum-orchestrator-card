// The closed vocabularies of API V3 and their membership checks. Values are protocol
// identifiers; every list is frozen and every check refuses non-strings.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/job-schema.js");

test("the vocabularies are the integration's, frozen", async () => {
  const schema = await load();
  assert.deepEqual(schema.CLEANING_MODES, ["vacuum", "mop", "vacuum_and_mop", "vacuum_then_mop"]);
  assert.deepEqual(schema.OPERATIONS, ["vacuum", "mop", "vacuum_and_mop"]);
  assert.deepEqual(schema.JOB_STATES, ["queued", "dispatching", "running", "canceling", "completed", "failed", "cancelled", "needs_attention"]);
  assert.deepEqual(schema.RELEASE_KINDS, ["permanent", "once", "timed", "queue_run"]);
  assert.deepEqual(schema.REQUIREMENT_STATES, ["ready", "blocked", "unknown", "stale"]);
  assert.equal(schema.ROBOT_ROLES.length, 19);
  assert.deepEqual(Object.keys(schema.ROBOT_ROLE_DOMAINS), [...schema.ROBOT_ROLES]);
  for (const key of ["CLEANING_MODES", "OPERATIONS", "VACUUM_LEVELS", "WATER_LEVELS", "MOP_ROUTES", "SETTING_LADDERS", "MODE_SETTINGS", "PROVENANCE_KINDS", "JOB_STATES", "ATTEMPT_STATES", "ROBOT_ROLES", "MODE_OPERATIONS", "ROBOT_OPTION_MAPS", "ROBOT_TIMEOUT_FIELDS"]) {
    assert.ok(Object.isFrozen(schema[key]), key);
  }
});

test("each setting is an ordered ladder without aliases; robot mappings may also name off", async () => {
  const schema = await load();
  assert.deepEqual(schema.VACUUM_LEVELS, ["low", "standard", "high", "maximum", "maximum_plus"]);
  assert.deepEqual(schema.WATER_LEVELS, ["low", "medium", "high"]);
  assert.deepEqual(schema.MOP_ROUTES, ["fast", "standard", "deep", "deep_plus"]);
  assert.deepEqual(schema.MODE_SETTINGS.vacuum, ["vacuumPower"]);
  assert.deepEqual(schema.MODE_SETTINGS.mop, ["mopIntensity", "mopRoute"]);
  assert.deepEqual(schema.ROBOT_OPTION_MAPS.vacuum_levels[0], "off");
  assert.equal(schema.ROBOT_TIMEOUT_FIELDS.return_timeout_seconds, 900);
});

test("terminal and active states partition the non-queued states except attention", async () => {
  const { JOB_STATES, TERMINAL_STATES, ACTIVE_STATES } = await load();
  const rest = JOB_STATES.filter((state) => !TERMINAL_STATES.includes(state) && !ACTIVE_STATES.includes(state));
  assert.deepEqual(rest, ["queued", "needs_attention"]);
});

test("mode aliases canonicalize the way the integration accepts them", async () => {
  const { canonicalizeMode } = await load();
  assert.equal(canonicalizeMode("vac_then_mop"), "vacuum_then_mop");
  assert.equal(canonicalizeMode(" VAC "), "vacuum");
  assert.equal(canonicalizeMode("polish"), null);
  assert.equal(canonicalizeMode(3), null);
});

test("a two-phase mode plans vacuum before mop; the others plan one phase", async () => {
  const { MODE_OPERATIONS } = await load();
  assert.deepEqual(MODE_OPERATIONS.vacuum_then_mop, ["vacuum", "mop"]);
  assert.deepEqual(MODE_OPERATIONS.vacuum_and_mop, ["vacuum_and_mop"]);
});

test("membership checks accept only listed strings", async () => {
  const schema = await load();
  assert.equal(schema.isJobState("running"), true);
  assert.equal(schema.isJobState("sleeping"), false);
  assert.equal(schema.isVacuumLevel("maximum_plus"), true);
  assert.equal(schema.isVacuumLevel("medium"), false);
  assert.equal(schema.isWaterLevel("medium"), true);
  assert.equal(schema.isWaterLevel("standard"), false);
  assert.equal(schema.isMopRoute("deep_plus"), true);
  assert.equal(schema.isMopRoute(null), false);
  assert.equal(schema.isSettingValue("mopRoute", "deep"), true);
  assert.equal(schema.isSettingValue("passes", 1), false);
  assert.equal(schema.isProvenanceKind("automatic"), true);
  assert.equal(schema.isAfterCancel("return_to_dock"), true);
  assert.equal(schema.isRobotRole("battery"), true);
  assert.equal(schema.isRobotRole({ toString: () => "battery" }), false);
});

test("bounds match the integration's schemas", async () => {
  const schema = await load();
  assert.deepEqual([schema.PASS_MIN, schema.PASS_MAX], [1, 10]);
  assert.equal(schema.QUEUE_GRACE_MAX_SECONDS, 86400);
  assert.deepEqual({ ...schema.ROBOT_PREFERENCE_RANGE }, { min: -100, max: 100 });
  assert.equal(schema.ROBOT_OPTION_MAPS.map_options, null);
});

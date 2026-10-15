// Robot settings as the integration resolves them, its job defaults and its read-only preview of
// a draft: each normalizer keeps known rungs only and never resolves a rung itself.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");

const settings = () => import("../../../src/domain/settings.js");
const preview = () => import("../../../src/domain/preview.js");

test("a wire setting name maps to its draft field; unknown and inherited names do not", async () => {
  const { settingField } = await settings();
  assert.deepEqual(["vacuum_power", "mop_intensity", "mop_route"].map(settingField), ["vacuumPower", "mopIntensity", "mopRoute"]);
  assert.equal(settingField("suction"), null);
  assert.equal(settingField("toString"), null);
});

test("resolved settings keep known rungs; a missing setting applies null", async () => {
  const { normalizeResolvedSettings } = await settings();
  const resolved = normalizeResolvedSettings([W.wireResolvedSetting({ name: "mop_route", requested: "deep_plus", applied: "deep" }), { name: "mop_intensity", requested: "high", applied: null }, { name: "vacuum_power", requested: "turbo", applied: "high" }, { name: "suction" }, null]);
  assert.deepEqual(resolved.map((item) => ({ ...item })), [
    { field: "mopRoute", requested: "deep_plus", applied: "deep" },
    { field: "mopIntensity", requested: "high", applied: null },
    { field: "vacuumPower", requested: null, applied: "high" },
  ]);
  assert.ok(Object.isFrozen(resolved) && Object.isFrozen(resolved[0]));
  assert.deepEqual(normalizeResolvedSettings(undefined), []);
});

test("the job defaults need every setting; passes and policy fall back to the integration's", async () => {
  const { normalizeJobDefaults } = await settings();
  const defaults = normalizeJobDefaults(W.wireJobDefaults({ mode: "vac_then_mop", vacuum_power: "maximum_plus", configured: true }));
  assert.deepEqual({ ...defaults }, { mode: "vacuum_then_mop", vacuumPower: "maximum_plus", mopIntensity: "medium", mopRoute: "standard", passes: 1, settingsPolicy: "best_effort", configured: true });
  assert.equal(normalizeJobDefaults(W.wireJobDefaults()).configured, false);
  assert.deepEqual([normalizeJobDefaults(W.wireJobDefaults({ passes: 11, settings_policy: "odd" }))].map((item) => [item.passes, item.settingsPolicy]), [[1, "best_effort"]]);
  assert.equal(normalizeJobDefaults(W.wireJobDefaults({ mop_route: "medium" })), null);
  assert.equal(normalizeJobDefaults(W.wireJobDefaults({ mode: "polish" })), null);
  assert.equal(normalizeJobDefaults(null), null);
});

test("the preview offers known rungs per setting, the requested one, each robot's start and unreachable rooms", async () => {
  const { normalizePreview } = await preview();
  const result = normalizePreview(W.wirePreview({
    mode: "vac",
    settings: { vacuum_power: { requested: "turbo", options: [{ value: "high", supported_by_all: true }, { value: "turbo" }, { value: "maximum" }] }, mop_route: "deep", suction: { requested: "low", options: [] } },
    robots: [{ robot_id: "robot-rocky", operation: "vacuum", startable_now: true, settings: [{ name: "vacuum_power", requested: "high", applied: "high" }] }, { robot_id: "" }],
    unreachable_room_ids: ["room-conservatory", 7],
    startable_now: true,
    reason: null,
  }));
  assert.equal(result.mode, "vacuum");
  assert.deepEqual(Object.keys(result.settings), ["vacuumPower"]);
  assert.deepEqual([result.settings.vacuumPower.requested, result.settings.vacuumPower.options.map((option) => ({ ...option }))], [null, [{ value: "high", supportedByAll: true }, { value: "maximum", supportedByAll: false }]]);
  assert.deepEqual(result.robots.map((robot) => [robot.robotId, robot.operation, robot.startableNow, robot.reason, robot.settings.length]), [["robot-rocky", "vacuum", true, null, 1]]);
  assert.deepEqual([result.startableNow, result.reason, result.unreachableRoomIds], [true, null, ["room-conservatory"]]);
  const recorded = normalizePreview(W.wirePreview());
  assert.deepEqual([recorded.settings.vacuumPower.requested, recorded.robots[0].reason, recorded.startableNow], ["standard", "robot_busy", false], "as the integration answered while Rocky cleans");
  const blocked = normalizePreview(W.wirePreview({ startable_now: "yes", reason: "job_blocked" }));
  assert.deepEqual([blocked.startableNow, blocked.reason], [false, "job_blocked"]);
  assert.equal(normalizePreview([]), null);
});

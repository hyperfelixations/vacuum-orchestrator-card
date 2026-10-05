// Home Assistant entities the integration names: role references resolved through the
// registry, and readings copied value by value.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/application/ha-entities.js");

const entry = (id, entityId, extra = {}) => ({ id, entityId, platform: "roborock", uniqueId: `${id}-u`, deviceId: null, disabled: false, ...extra });

test("the integration's own sensors are not read: its counts come from its API", async () => {
  const module = await load();
  assert.equal("summaryFrom" in module, false);
});

test("a role reference resolves through the registry and fails closed when disabled", async () => {
  const { indexRegistry, resolveEntityId } = await load();
  const registry = indexRegistry([entry("reg-1", "sensor.battery"), entry("reg-2", "sensor.off", { disabled: true })]);
  assert.equal(resolveEntityId("reg-1", registry), "sensor.battery");
  assert.equal(resolveEntityId("reg-2", registry), null);
  assert.equal(resolveEntityId("sensor.not_registered", registry), "sensor.not_registered");
  assert.equal(resolveEntityId("8d3f0c", registry), null);
  assert.equal(resolveEntityId(null, registry), null);
});

test("the profile's own role wins over discovery; null opts a role out", async () => {
  const { roleReference } = await load();
  const robot = { configuration: { roles: { battery: "reg-own", status: null } } };
  const candidate = { roles: { battery: "reg-found", status: "reg-status", error: "reg-error" } };
  assert.equal(roleReference(robot, candidate, "battery"), "reg-own");
  assert.equal(roleReference(robot, candidate, "status"), null);
  assert.equal(roleReference(robot, candidate, "error"), "reg-error");
  assert.equal(roleReference(robot, null, "error"), null);
});

test("readings copy single values, use Home Assistant's formatter and report unusable states", async () => {
  const { indexRegistry, robotLive } = await load();
  const registry = indexRegistry([entry("reg-v", "vacuum.rocky", { deviceId: "dev" }), entry("reg-b", "sensor.battery"), entry("reg-img", "image.map", { deviceId: "dev" }), entry("reg-old", "image.old", { deviceId: "dev", disabled: true })]);
  const states = {
    "vacuum.rocky": { state: "unavailable", attributes: {} },
    "sensor.battery": { state: "55", attributes: { unit_of_measurement: "%" } },
    "image.map": { state: "t", attributes: { entity_picture: "/m.png" } },
  };
  const robot = { configuration: { registryId: "reg-v", roles: { battery: "reg-b" } } };
  const live = robotLive(robot, registry, states, { roles: {}, ambiguousRoles: ["selected_map"] }, (state) => `fmt:${state.state}`);
  assert.equal(live.vacuum.entityId, "vacuum.rocky");
  assert.equal(live.vacuum.available, false);
  assert.deepEqual([live.roles.battery.state, live.roles.battery.display, live.roles.battery.unit], ["55", "fmt:55", "%"]);
  assert.deepEqual(live.maps.map((map) => map.entityId), ["image.map"]);
  assert.deepEqual(live.ambiguousRoles, ["selected_map"]);
  assert.notEqual(live.roles.battery, states["sensor.battery"]);
  const throwing = robotLive(robot, registry, states, null, () => {
    throw new Error("no translations yet");
  });
  assert.equal(throwing.roles.battery.display, null);
});

test("a role whose entity has no state yet reads as unavailable", async () => {
  const { indexRegistry, robotLive } = await load();
  const live = robotLive({ configuration: { entityId: "vacuum.x", roles: { battery: "sensor.missing" } } }, indexRegistry([]), {});
  assert.deepEqual({ ...live.roles.battery }, { entityId: "sensor.missing", state: null, display: null, available: false, unit: null, friendlyName: null, picture: null });
});

test("numeric readings accept only available finite values", async () => {
  const { numericReading } = await load();
  assert.equal(numericReading({ available: true, state: "76.5" }), 76.5);
  assert.equal(numericReading({ available: true, state: "low" }), null);
  assert.equal(numericReading({ available: false, state: "10" }), null);
  assert.equal(numericReading(null), null);
});

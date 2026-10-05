// The one model every view reads: session snapshot, the card's scope requests and Home
// Assistant's facts joined into frozen plain data. Home Assistant's own objects stay untouched.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

async function modules() {
  const { buildCardDomainModel } = await import("../../../src/application/card-domain-model.js");
  const { scopeKey } = await import("../../../src/backend/session.js");
  const { normalizeQueuePage } = await import("../../../src/domain/queue.js");
  const { normalizeRobot, normalizeCandidate } = await import("../../../src/domain/robots.js");
  const { normalizeRoom } = await import("../../../src/domain/rooms.js");
  return { buildCardDomainModel, scopeKey, normalizeQueuePage, normalizeRobot, normalizeCandidate, normalizeRoom };
}

const ready = (data) => ({ status: "ready", stale: false, data, error: null, loadedAt: 1 });

async function fixture({ admin = true } = {}) {
  const m = await modules();
  const requests = { queue: { name: "queue", params: { offset: 0, limit: 25 } }, robots: { name: "robots", params: {} }, candidates: { name: "candidates", params: {} }, rooms: { name: "rooms", params: {} }, registry: { name: "registry", params: {} }, missing: { name: "templates", params: {} } };
  const registry = [
    { id: "reg-rocky-battery", entityId: "sensor.rocky_battery", platform: "roborock", uniqueId: "b", deviceId: "dev", disabled: false },
    { id: "reg-rocky-status", entityId: "sensor.rocky_status", platform: "roborock", uniqueId: "s", deviceId: "dev", disabled: false },
    { id: "reg-vacuum-rocky", entityId: "vacuum.rocky", platform: "roborock", uniqueId: "v", deviceId: "dev", disabled: false },
    { id: "reg-map", entityId: "image.rocky_map", platform: "roborock", uniqueId: "m", deviceId: "dev", disabled: false },
    { id: "reg-mode", entityId: "sensor.voi_mode", platform: "vacuum_orchestrator", uniqueId: "vacuum_orchestrator_queue_mode", deviceId: null, disabled: false },
  ];
  const scopes = {
    [m.scopeKey("queue", { offset: 0, limit: 25 })]: ready({ apiVersion: 2, ...m.normalizeQueuePage(W.wireQueuePage([W.wireJob({ required_on: ["binary_sensor.door"] })], { mode: "running", integration_version: "0.1.0" })) }),
    [m.scopeKey("robots", {})]: ready({ items: [m.normalizeRobot(W.wireRobot({ configuration: { roles: { status: null } } }))], total: 1, complete: true }),
    [m.scopeKey("candidates", {})]: ready({ items: [m.normalizeCandidate(W.wireCandidate({ roles: { battery: "reg-rocky-battery", status: "reg-rocky-status" } }))], total: 1, complete: true }),
    [m.scopeKey("rooms", {})]: ready({ items: [m.normalizeRoom(W.wireRoom())], total: 1, complete: true }),
    [m.scopeKey("registry", {})]: ready(registry),
  };
  const states = {
    "sensor.rocky_battery": { state: "76", attributes: { unit_of_measurement: "%", friendly_name: "Rocky battery" } },
    "sensor.rocky_status": { state: "segment_cleaning", attributes: {} },
    "vacuum.rocky": { state: "cleaning", attributes: { friendly_name: "Rocky" } },
    "image.rocky_map": { state: "x", attributes: { entity_picture: "/map.png", friendly_name: "Map" } },
    "binary_sensor.door": { state: "on", attributes: { friendly_name: "Door" } },
    "sensor.voi_mode": { state: "running", attributes: {} },
  };
  const home = { states, areas: { kitchen: { name: " Kitchen ", floor_id: "ground" }, "": { name: "x" } }, admin, operations: ["create_job", "run_queue"], formatState: (state) => `«${state.state}»` };
  const snapshot = { version: 3, phase: "ready", phaseFailure: null, apiVersion: 2, runtime: { id: "runtime-1", sequence: 4, commitId: 9 }, live: null, subscription: "live", scopes, pending: { "job:job-1": "move_job" } };
  return { ...m, requests, snapshot, home, states };
}

test("slots follow the card's requests; an unloaded scope is an idle slot", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture();
  const model = buildCardDomainModel({ snapshot, requests, home, nowMs: 5 });
  assert.equal(model.slots.queue.status, "ready");
  assert.equal(model.slots.queue.data.mode, "running");
  assert.deepEqual({ ...model.slots.missing }, { status: "idle", stale: false, data: null, error: null, loadedAt: null });
  assert.equal(model.phase, "ready");
  assert.deepEqual(model.pending, ["job:job-1"]);
  assert.equal(model.nowMs, 5);
});

test("rights and offered operations come from Home Assistant", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture({ admin: false });
  const model = buildCardDomainModel({ snapshot, requests, home });
  assert.deepEqual({ ...model.permissions }, { canCommand: false, isAdmin: false });
  assert.deepEqual(model.operations, ["create_job", "run_queue"]);
  const unknownUser = buildCardDomainModel({ snapshot, requests, home: { ...home, admin: null } });
  assert.deepEqual({ ...unknownUser.permissions }, { canCommand: true, isAdmin: false });
});

test("robot live state uses the configured roles, else discovery, and never an opted-out role", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture();
  const live = buildCardDomainModel({ snapshot, requests, home }).robotsLive["robot-rocky"];
  assert.equal(live.vacuum.state, "cleaning");
  assert.equal(live.vacuum.display, "«cleaning»");
  assert.equal(live.roles.battery.state, "76");
  assert.equal(live.roles.battery.unit, "%");
  assert.equal(live.roles.status, undefined, "status is switched off in the profile");
  assert.equal(live.discovered.status, "sensor.rocky_status");
  assert.deepEqual(live.maps.map((map) => map.picture), ["/map.png"]);
});

test("entities the views name get a reading; areas become a catalog", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture();
  const model = buildCardDomainModel({ snapshot, requests, home });
  assert.deepEqual({ ...model.entityReadings["binary_sensor.door"] }, { state: "on", name: "Door", available: true });
  assert.deepEqual(model.areas.map((area) => ({ ...area })), [{ areaId: "kitchen", name: "Kitchen", icon: null, floorId: "ground" }]);
  assert.equal("summary" in model, false, "counts come from the queue, not from sensors");
});

test("the integration version comes from the queue, the manifest only before the queue is read", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture();
  assert.equal(buildCardDomainModel({ snapshot, requests, home }).integrationVersion, "0.1.0");
  const { scopeKey } = await modules();
  const withoutQueue = { ...snapshot, scopes: { [scopeKey("manifest", {})]: ready({ version: "0.0.9", documentation: null }) } };
  assert.equal(buildCardDomainModel({ snapshot: withoutQueue, requests: { manifest: { name: "manifest", params: {} } }, home }).integrationVersion, "0.0.9");
});

test("the entity catalog is built only for an editor", async () => {
  const { buildCardDomainModel, requests, snapshot, home } = await fixture();
  assert.deepEqual(buildCardDomainModel({ snapshot, requests, home }).entityCatalog, []);
  const catalog = buildCardDomainModel({ snapshot, requests, home, needsEntityCatalog: true }).entityCatalog;
  assert.deepEqual(catalog.map((entry) => entry.entityId), Object.keys(home.states).sort());
  assert.equal(catalog.find((entry) => entry.entityId === "binary_sensor.door").domain, "binary_sensor");
});

test("the model is frozen, deterministic, and leaves Home Assistant's objects alone", async () => {
  const { buildCardDomainModel, requests, snapshot, home, states } = await fixture();
  const first = buildCardDomainModel({ snapshot, requests, home, nowMs: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(buildCardDomainModel({ snapshot, requests, home, nowMs: 1 }))));
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.robotsLive) && Object.isFrozen(first.setup));
  assert.equal(Object.isFrozen(states), false);
  assert.equal(Object.isFrozen(states["vacuum.rocky"]), false);
});

test("without a snapshot the model is still total", async () => {
  const { buildCardDomainModel } = await fixture();
  const model = buildCardDomainModel();
  assert.equal(model.phase, "probing");
  assert.equal(model.subscription, "idle");
  assert.deepEqual({ ...model.slots }, {});
  assert.equal(model.setup.known, false);
  assert.deepEqual(model.diagnostics.warnings, []);
});

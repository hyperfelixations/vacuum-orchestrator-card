"use strict";
// The CardDomainModel: one frozen, total model per render, joining the backend snapshot with
// the presentation context Home Assistant supplies.

const test = require("node:test");
const assert = require("node:assert/strict");

async function snapshot(overrides = {}) {
  const { initialState } = await import("../../../src/backend/store.js");
  const { capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const state = initialState();
  state.connection = { ...state.connection, state: "connected", apiVersion: 2, lastUpdatedAt: 1000, subscription: "connected" };
  state.capabilities = capabilitiesFrom({ apiVersion: 2, services: { create_job: {} } });
  state.queue = { ...state.queue, available: true, mode: "paused", total: 2, pending: [] };
  return { ...state, ...overrides };
}

test("the model is total, frozen and deterministic for identical inputs", async () => {
  const { buildCardDomainModel } = await import("../../../src/application/card-domain-model.js");
  const input = {
    backendState: await snapshot(),
    areaRegistry: { kitchen: { name: "Kitchen", icon: "mdi:chef-hat" } },
    states: { "binary_sensor.door": { state: "on", attributes: { friendly_name: "Door" } } },
    user: { is_admin: true },
    nowMs: 2000,
  };
  const first = buildCardDomainModel(input);
  assert.deepEqual(first, buildCardDomainModel(input));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(first.areas.catalog[0].name, "Kitchen");
  assert.equal(first.entities[0].name, "Door");
  assert.equal(first.capabilities.queueRead, true);
  assert.equal(first.capabilities.robotsRead, false);
  assert.equal(JSON.stringify(first).includes("undefined"), false);
});

test("an empty backend snapshot still gives every branch", async () => {
  const { buildCardDomainModel } = await import("../../../src/application/card-domain-model.js");
  const model = buildCardDomainModel({});
  for (const key of ["connection", "permissions", "capabilities", "queue", "active", "history", "attention", "robots", "areas", "entities", "commands", "diagnostics"]) {
    assert.notEqual(model[key], undefined, key);
  }
  assert.equal(model.connection.state, "connecting");
});

test("a non-admin user gets a read-only model, not a warning", async () => {
  const { buildCardDomainModel } = await import("../../../src/application/card-domain-model.js");
  const model = buildCardDomainModel({ backendState: await snapshot(), user: { is_admin: false }, nowMs: 2000 });
  assert.equal(model.permissions.canCommand, false);
  assert.equal(model.permissions.reason, "admin_required");
  assert.equal(model.diagnostics.warnings.length, 0);
});

// Only the caller knows the time, so staleness is decided here and nowhere else.
test("a connected snapshot older than the threshold is stale", async () => {
  const { buildCardDomainModel, STALE_AFTER_MS } = await import("../../../src/application/card-domain-model.js");
  const backendState = await snapshot();
  assert.equal(buildCardDomainModel({ backendState, nowMs: 1000 + STALE_AFTER_MS }).connection.stale, false);
  const stale = buildCardDomainModel({ backendState, nowMs: 1001 + STALE_AFTER_MS });
  assert.equal(stale.connection.stale, true);
  assert.deepEqual(stale.diagnostics.hints.map((item) => item.code), ["hint.stale_snapshot", "hint.partial_page"]);
});

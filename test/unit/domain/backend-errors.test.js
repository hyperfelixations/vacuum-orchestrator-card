// Failure records and the vocabularies the card words itself: the codes it raises or receives
// from Home Assistant, execution outcomes, readiness and due reasons. Integration codes are the
// integration's and stay open.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/backend-errors.js");

test("a failure record keeps any code, with its detail as text, frozen", async () => {
  const { backendFailure } = await load();
  const failure = backendFailure(" quantum_flux ", { detail: 42, channel: "ws" });
  assert.deepEqual({ ...failure }, { ok: false, code: "quantum_flux", detail: "42", channel: "ws" });
  assert.ok(Object.isFrozen(failure));
});

test("an empty code becomes unknown and a missing detail stays null", async () => {
  const { backendFailure } = await load();
  assert.equal(backendFailure("").code, "unknown");
  assert.equal(backendFailure(null).detail, null);
});

test("failure records are recognized by shape", async () => {
  const { backendFailure, isBackendFailure } = await load();
  assert.equal(isBackendFailure(backendFailure("timeout")), true);
  assert.equal(isBackendFailure({ ok: true, code: "x" }), false);
  assert.equal(isBackendFailure({ ok: false }), false);
  assert.equal(isBackendFailure(null), false);
});

test("client codes are the card's and Home Assistant's own, never an integration code", async () => {
  const { CLIENT_CODES, isClientCode } = await load();
  const { EXCEPTIONS } = require("../../fixtures/voi/exceptions.js");
  assert.ok(Object.isFrozen(CLIENT_CODES));
  assert.equal(new Set(CLIENT_CODES).size, CLIENT_CODES.length);
  assert.deepEqual(CLIENT_CODES.filter((code) => code in EXCEPTIONS.en), []);
  assert.equal(isClientCode("connection_lost"), true);
  assert.equal(isClientCode("robot_busy"), false);
});

test("outcome, readiness and due vocabularies are closed lists without duplicates", async () => {
  const { FAILURE_CODES, READINESS_REASONS, DUE_REASONS } = await load();
  for (const list of [FAILURE_CODES, READINESS_REASONS, DUE_REASONS]) {
    assert.ok(Object.isFrozen(list));
    assert.equal(new Set(list).size, list.length);
  }
  assert.ok(FAILURE_CODES.includes("physical_run_ownership_uncertain"));
  assert.deepEqual([...READINESS_REASONS], ["room_not_released", "requirement_not_satisfied", "requirement_unknown", "requirement_stale"]);
});

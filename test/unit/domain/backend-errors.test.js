// The error catalog: every known code belongs to exactly one group, a code the card does not
// know stays readable in the unknown group, and failure records are frozen and recognizable.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/domain/backend-errors.js");

test("each known code has exactly one group", async () => {
  const { ERROR_GROUPS, KNOWN_ERROR_CODES, errorGroup } = await load();
  const seen = new Map();
  for (const [group, codes] of Object.entries(ERROR_GROUPS)) for (const code of codes) seen.set(code, [...(seen.get(code) || []), group]);
  assert.deepEqual([...seen].filter(([, groups]) => groups.length > 1), []);
  assert.equal(seen.size, KNOWN_ERROR_CODES.length);
  for (const [code, [group]] of seen) assert.equal(errorGroup(code), group);
});

test("an unknown code is kept with the unknown group", async () => {
  const { backendFailure, errorGroup, isKnownErrorCode, ERROR_GROUP_NAMES } = await load();
  assert.equal(errorGroup("quantum_flux"), "unknown");
  assert.equal(isKnownErrorCode("quantum_flux"), false);
  assert.ok(ERROR_GROUP_NAMES.includes("unknown"));
  const failure = backendFailure(" quantum_flux ", { detail: 42, channel: "ws" });
  assert.deepEqual({ ...failure }, { ok: false, code: "quantum_flux", group: "unknown", detail: "42", channel: "ws" });
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

test("permission, availability and client codes sit in their own groups", async () => {
  const { errorGroup } = await load();
  assert.equal(errorGroup("unauthorized"), "permission");
  assert.equal(errorGroup("orchestrator_not_loaded"), "availability");
  assert.equal(errorGroup("connection_lost"), "client");
  assert.equal(errorGroup("preference_conflicts_with_cleaning_mode"), "job");
  assert.equal(errorGroup("release_duration_mismatch"), "room");
  assert.equal(errorGroup("robot_busy"), "robot");
  assert.equal(errorGroup("invalid_role_entity"), "robotConfiguration");
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

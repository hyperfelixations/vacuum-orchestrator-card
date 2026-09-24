"use strict";
// The development build is a separate identity that exports exactly the same surface.
// Boundary: identity and export parity, not behaviour, which the component tests cover.

const test = require("node:test");
const assert = require("node:assert/strict");

test("development identity is separate and deterministic", async () => {
  const script = await import("../../scripts/build-dev.mjs");
  const identity = script.deriveDevIdentity({ CARD_TYPE: "vacuum-orchestrator-card", CARD_NAME: "Vacuum Orchestrator Card", CARD_VERSION: "0.0.1", CARD_VERSION_GLOBAL: "vacuumOrchestratorCardVersion" }, { builtAt: new Date("2026-09-17T12:00:00Z"), commit: "abc1234", dirty: true });
  assert.equal(identity.CARD_TYPE, "vacuum-orchestrator-card-dev");
  assert.equal(identity.CARD_VERSION, "0.0.1-dev+20260917T120000Z.abc1234.dirty");
  assert.equal(identity.CARD_VERSION_GLOBAL, "vacuumOrchestratorCardDevVersion");
  assert.throws(() => script.assertSameExports(["CARD_TYPE", "CARD_NAME"], identity), /exports/);
});

"use strict";
// Which backend facts become a warning, which a hint, and which deliberately neither.
// Boundary: the diagnostic decision; its wording belongs to the i18n registry.

const test = require("node:test");
const assert = require("node:assert/strict");

test("store diagnostics are split by severity and model facts add hints", async () => {
  const { collectBackendDiagnostics } = await import("../../../src/application/source-diagnostics.js");
  const { createDiagnostic } = await import("../../../src/core/diagnostics.js");
  const diagnostics = collectBackendDiagnostics({
    model: {
      connection: { stale: false },
      queue: { available: true, total: 3, pending: [{ jobId: "job-1" }] },
      commands: { pending: ["job:job-1"] },
    },
    backendDiagnostics: [createDiagnostic("hint.reconnecting"), createDiagnostic("command.failed", { params: { code: "unknown_job" } })],
  });
  assert.deepEqual(diagnostics.warnings.map((item) => item.code), ["command.failed"]);
  assert.deepEqual(diagnostics.hints.map((item) => item.code), ["hint.reconnecting", "hint.command_pending", "hint.partial_page"]);
  assert.equal(Object.isFrozen(diagnostics.warnings), true);
});

// A warning block that is on in normal operation stops being read. Missing optional
// capabilities and read-only users are explained where they matter instead.
test("a working card with today's backend produces no warning", async () => {
  const { buildCardDomainModel } = await import("../../../src/application/card-domain-model.js");
  const { initialState } = await import("../../../src/backend/store.js");
  const { capabilitiesFrom } = await import("../../../src/backend/capabilities.js");
  const backendState = initialState();
  backendState.connection.state = "connected";
  backendState.capabilities = capabilitiesFrom({ apiVersion: 2, services: {} });
  const model = buildCardDomainModel({ backendState, user: { is_admin: false }, nowMs: 0 });
  assert.equal(model.capabilities.robotsRead, false);
  assert.deepEqual(model.diagnostics.warnings, []);
});

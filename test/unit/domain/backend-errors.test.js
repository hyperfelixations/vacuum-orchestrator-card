// Every backend code has exactly one group, and an unknown code stays readable.
// Boundary: classification; the message text comes from the i18n registry.

const test = require("node:test");
const assert = require("node:assert/strict");

test("backend error catalog assigns each known code once and normalizes unknown failures", async () => {
  const errors = await import("../../../src/domain/backend-errors.js");
  const memberships = new Map();
  for (const [group, codes] of Object.entries(errors.ERROR_GROUPS)) {
    for (const code of codes) {
      memberships.set(code, (memberships.get(code) || 0) + 1);
      assert.equal(errors.classifyBackendError(code).group, group);
    }
  }
  assert.equal([...memberships.values()].every((count) => count === 1), true);
  assert.deepEqual(errors.classifyBackendError("future_code"), { group: "unknown", messageKey: "error.backend.unknown" });

  const normalized = errors.toBackendError({ code: "unknown_job", detail: "job-1" });
  assert.equal(normalized instanceof errors.BackendError, true);
  assert.equal(normalized.group, "conflict");
  assert.equal(normalized.detail, "job-1");
});

test("backend errors preserve identity, legacy shapes, causes, and empty fallbacks", async () => {
  const { BackendError, isBackendError, toBackendError } = await import("../../../src/domain/backend-errors.js");
  const cause = new Error("socket closed");
  const existing = new BackendError("timeout", "late", { cause, rawCode: "client_timeout" });
  assert.equal(isBackendError(existing), true);
  assert.equal(isBackendError({ name: "BackendError" }), true);
  assert.equal(toBackendError(existing), existing);
  assert.equal(existing.cause, cause);
  assert.equal(existing.rawCode, "client_timeout");

  const legacyErrors = [
    ["error_code", { error_code: "unauthorized", detail: "denied" }, "denied"],
    ["errorCode", { errorCode: "unknown_job", message: "missing" }, "missing"],
    ["type", { type: "job_not_startable", error: "running" }, "running"],
  ];
  for (const [field, wire, detail] of legacyErrors) {
    const normalized = toBackendError(wire);
    assert.equal(normalized.code, wire[field]);
    assert.equal(normalized.detail, detail);
    assert.equal(normalized.cause, wire);
    assert.equal(normalized.rawCode, wire[field]);
  }

  const fromError = toBackendError(new Error("connection refused"), "orchestrator_not_loaded");
  assert.equal(fromError.code, "orchestrator_not_loaded");
  assert.equal(fromError.detail, "connection refused");
  assert.equal(fromError.cause.message, "connection refused");

  const fromText = toBackendError("offline", "timeout");
  assert.equal(fromText.code, "timeout");
  assert.equal(fromText.detail, "offline");
  assert.equal(toBackendError("", "timeout").detail, null);
  assert.equal(toBackendError({}, "unknown_command").code, "unknown_command");
  assert.equal(new BackendError("  ").message, "unknown");
});

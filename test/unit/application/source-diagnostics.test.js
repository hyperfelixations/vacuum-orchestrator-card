// Which backend facts become the card's warning and which a hint (RCC diagnostics contract).
// Phase problems are the onboarding's, recovery and attention are view content: neither is a
// notice.

const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../../src/application/source-diagnostics.js");
const failed = (code) => ({ status: "error", error: { ok: false, code } });

test("a failed query is a warning naming the scope and code", async () => {
  const { collectSourceDiagnostics } = await load();
  const result = collectSourceDiagnostics({ phase: "ready", subscription: "live", slots: { rooms: failed("invalid_response") } });
  assert.deepEqual(result.warnings.map((item) => [item.code, { ...item.params }]), [["backend.query_failed", { scope: "rooms", code: "invalid_response" }]]);
  assert.deepEqual(result.hints, []);
});

test("a timeout or lost connection is an offline hint, not a warning", async () => {
  const { collectSourceDiagnostics } = await load();
  const result = collectSourceDiagnostics({ phase: "ready", subscription: "live", slots: { queue: failed("timeout"), rooms: failed("connection_lost") } });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.hints.map((item) => item.code), ["hint.offline"]);
});

test("reconnecting live updates and an incomplete job scan are hints", async () => {
  const { collectSourceDiagnostics } = await load();
  const result = collectSourceDiagnostics({ phase: "ready", subscription: "reconnecting", slots: { queue: failed("timeout"), openJobs: { status: "ready", data: { jobs: [], complete: false } } } });
  assert.deepEqual(result.hints.map((item) => item.code), ["hint.reconnecting", "hint.partial_jobs"]);
});

test("codes that change the phase are left to onboarding, and outside ready nothing is reported", async () => {
  const { collectSourceDiagnostics } = await load();
  const phaseCodes = { a: failed("orchestrator_not_loaded"), b: failed("api_incompatible"), c: failed("unknown_command") };
  assert.deepEqual(collectSourceDiagnostics({ phase: "ready", slots: phaseCodes }).warnings, []);
  assert.deepEqual(collectSourceDiagnostics({ phase: "load_failed", slots: { rooms: failed("invalid_response") } }).warnings, []);
});

test("the same failure in two slots is reported once, and the lists are frozen", async () => {
  const { collectSourceDiagnostics } = await load();
  const result = collectSourceDiagnostics({ phase: "ready", slots: { rooms: failed("x"), roomsAgain: { status: "error", error: { code: "x" } } } });
  assert.equal(result.warnings.length, 2, "different scopes are different warnings");
  const once = collectSourceDiagnostics({ phase: "ready", slots: { a: failed("timeout"), b: failed("timeout") } });
  assert.equal(once.hints.length, 1);
  assert.ok(Object.isFrozen(result.warnings) && Object.isFrozen(result.hints));
});

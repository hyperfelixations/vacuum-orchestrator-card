// Templates, cleaning runs, execution explanations, trace records and the diagnostics summary:
// each normalizer keeps the integration's facts and drops records without identity.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

test("a template keeps its intent, switches and the rooms its current due period used", async () => {
  const { normalizeTemplate } = await import("../../../src/domain/templates.js");
  const template = normalizeTemplate(W.wireTemplate({ automatic: true, suppressed_room_ids: ["room-kitchen"], intent: { areas: ["room-kitchen"], mode: "vac_and_mop", passes: 12, settings_policy: "odd", mop_route: "deep" } }));
  assert.equal(template.automatic, true);
  assert.deepEqual(template.suppressedRoomIds, ["room-kitchen"]);
  assert.equal(template.intent.mode, "vacuum_and_mop");
  assert.equal(template.intent.passes, 1, "an out-of-range pass count reads as one pass");
  assert.equal(template.intent.settingsPolicy, "best_effort");
  assert.equal(template.intent.mopRoute, "deep");
  assert.equal(normalizeTemplate(W.wireTemplate({ intent: { areas: [], mode: "vacuum" } })), null);
  for (const areas of ["all", ["all"]]) {
    const all = normalizeTemplate(W.wireTemplate({ intent: { areas, mode: "vacuum" } })).intent;
    assert.deepEqual([all.allRooms, [...all.areas]], [true, []], JSON.stringify(areas));
  }
  assert.equal(template.intent.allRooms, false);
  assert.equal(normalizeTemplate(W.wireTemplate({ template_id: "" })), null);
  assert.equal(normalizeTemplate(W.wireTemplate({ enabled: undefined })).enabled, true);
});

test("a run keeps its source, rooms, quality and failure; unknown values read null", async () => {
  const { normalizeRun } = await import("../../../src/domain/runs.js");
  const run = normalizeRun(W.wireRun({ source: "external", operation: null, room_ids: [], quality: null, failure_code: "run_timeout" }));
  assert.deepEqual([run.source, run.operation, run.roomIds.length, run.quality, run.failureCode], ["external", null, 0, null, "run_timeout"]);
  assert.equal(normalizeRun(W.wireRun({ source: "robot" })).source, null);
  assert.equal(normalizeRun(W.wireRun({ observed_end: null })).observedEnd, null);
  assert.equal(normalizeRun({}), null);
});

test("the execution explanation groups robots by planned operation in plan order", async () => {
  const { normalizeExecution, explanationsByOperation } = await import("../../../src/domain/execution.js");
  const execution = normalizeExecution(W.wireExecution({
    robots: [
      W.wireExecutionRobot({ robot_id: "rocky", operation: "vacuum", eligible: false, eligibility_reason: "robot_busy" }),
      W.wireExecutionRobot({ robot_id: "rocky", operation: "mop", eligible: true, settings: [{ name: "mop_route", requested: "deep_plus", applied: "deep" }, { name: "mop_intensity", requested: "high", applied: null }, { name: "suction", requested: "x", applied: "y" }] }),
      W.wireExecutionRobot({ robot_id: "dusty", operation: "vacuum", eligible: true }),
      { operation: "vacuum" },
    ],
    attempts: [W.wireAttempt({ state: "teleporting", failure_code: "start_timeout" }), {}],
  }));
  const groups = explanationsByOperation(execution);
  assert.deepEqual(groups.map((group) => [group.operation, group.robots.map((robot) => robot.robotId), group.eligible]), [["vacuum", ["rocky", "dusty"], true], ["mop", ["rocky"], true]]);
  assert.equal(groups[0].robots[0].eligibilityReason, "robot_busy");
  assert.deepEqual(groups[1].robots[0].settings.map((item) => ({ ...item })), [{ field: "mopRoute", requested: "deep_plus", applied: "deep" }, { field: "mopIntensity", requested: "high", applied: null }]);
  assert.equal(execution.attempts.length, 1);
  assert.equal(execution.attempts[0].state, "unknown");
  assert.deepEqual(explanationsByOperation(null), []);
});

test("trace records keep their event and known details; unknown events stay", async () => {
  const { normalizeTracePage } = await import("../../../src/domain/trace.js");
  const page = normalizeTracePage(W.wireTracePage([W.wireTraceRecord({ event: "teleport", robot_id: "rocky", custom: 1 }), { event: "x" }], { trace_sequence: 9 }));
  assert.equal(page.records.length, 1);
  assert.equal(page.records[0].event, "teleport");
  assert.deepEqual({ ...page.records[0].details }, { job_id: "job-1", robot_id: "rocky", state: "queued" });
  assert.equal(page.traceSequence, 9);
});

test("the diagnostics summary reads versions, runtime and the trace window", async () => {
  const { normalizeDiagnosticsSummary } = await import("../../../src/domain/trace.js");
  const summary = normalizeDiagnosticsSummary(W.wireDiagnostics());
  assert.equal(summary.apiVersion, 3);
  assert.equal(typeof summary.runtimeId, "string");
  assert.ok(Number.isFinite(summary.traceWindow.retained));
  const empty = normalizeDiagnosticsSummary({});
  assert.deepEqual({ ...empty.traceWindow }, { recorded: null, retained: null, dropped: null });
  assert.equal(normalizeDiagnosticsSummary(null), null);
});

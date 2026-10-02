// The wire contract with Vacuum Orchestrator API V2: the integration's own consumer fixture and
// every builder derived from its serializers pass the card's guards and normalizers, and the
// fake answers every message the card can build. See test/fixtures/voi/README.md.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const W = require("../fixtures/voi/wire.js");
const { createFakeOrchestrator, VirtualClock } = require("../helpers/fake-orchestrator.js");
const { SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

const consumerFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "voi", "api_v2_job.json"), "utf8"));

test("the integration's consumer fixture is a job the card reads completely", async () => {
  const { guards } = await import("../../src/backend/protocol.js");
  const { normalizeJob } = await import("../../src/domain/job.js");
  assert.equal(guards.job(consumerFixture), true);
  const job = normalizeJob(consumerFixture);
  assert.equal(job.jobId, "job");
  assert.deepEqual(job.roomIds, ["kitchen"], "without room_ids the aliases stand in");
  assert.deepEqual(job.unknownFields, []);
});

test("the job builder is the consumer fixture plus additive fields", async () => {
  const built = W.wireJob();
  const missing = Object.keys(consumerFixture).filter((key) => !(key in built));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(built).filter((key) => !(key in consumerFixture)), ["room_ids"]);
  assert.equal(built.api_version, W.VOI_API_VERSION);
});

test("every builder passes its guard and its normalizer", async () => {
  const { guards } = await import("../../src/backend/protocol.js");
  const { normalizeQueuePage } = await import("../../src/domain/queue.js");
  const { normalizeRoom } = await import("../../src/domain/rooms.js");
  const { normalizeRobot, normalizeCandidate } = await import("../../src/domain/robots.js");
  const { normalizeTemplate } = await import("../../src/domain/templates.js");
  const { normalizeRun } = await import("../../src/domain/runs.js");
  const { normalizeExecution } = await import("../../src/domain/execution.js");
  const { normalizeTracePage, normalizeDiagnosticsSummary } = await import("../../src/domain/trace.js");
  const cases = [
    [guards.queuePage, normalizeQueuePage, W.wireQueuePage([W.wireJob({ readiness: W.wireReadiness({ requirements: [W.wireRequirementResult()] }) })], { queue_run: W.wireQueueRun() })],
    [guards.room, normalizeRoom, W.wireRoom({ release: W.wireRelease(), requirements: [W.wireRoomRequirement()], last_cleaning: { vacuum: W.wireStamp() } })],
    [guards.robotsPage, (page) => normalizeRobot(page.robots[0]), W.wirePage("robots", [W.wireRobot()])],
    [guards.candidatesPage, (page) => normalizeCandidate(page.candidates[0]), W.wirePage("candidates", [W.wireCandidate()])],
    [guards.templatesPage, (page) => normalizeTemplate(page.templates[0]), W.wirePage("templates", [W.wireTemplate()])],
    [guards.runsPage, (page) => normalizeRun(page.runs[0]), W.wirePage("runs", [W.wireRun()])],
    [guards.execution, normalizeExecution, W.wireExecution({ attempts: [W.wireAttempt()] })],
    [guards.tracePage, normalizeTracePage, W.wireTracePage([W.wireTraceRecord()])],
    [guards.diagnostics, normalizeDiagnosticsSummary, W.wireDiagnostics()],
  ];
  for (const [guard, normalize, wire] of cases) {
    assert.equal(guard(wire), true);
    assert.notEqual(normalize(wire), null);
  }
  assert.equal(guards.event(W.wireSubscriptionEvent()), true);
  assert.equal(guards.manifest(W.wireManifest()), true);
});

test("the fake offers exactly the card's operation catalog as registered actions", async () => {
  const { OPERATIONS } = await import("../../src/backend/protocol.js");
  const fake = createFakeOrchestrator({ seed: SCENARIOS.typical().seed });
  const hass = fake.attachTo(hassFor(SCENARIOS.typical()));
  assert.deepEqual(Object.keys(hass.services.vacuum_orchestrator).sort(), [...OPERATIONS].sort());
});

test("the fake answers every query the card can build in a shape the guards accept", async () => {
  const { messages, guards, QUERY_COLLECTIONS } = await import("../../src/backend/protocol.js");
  const household = SCENARIOS.typical();
  const fake = createFakeOrchestrator({ seed: household.seed, clock: new VirtualClock() });
  const hass = fake.attachTo(hassFor(household));
  const ws = (message) => hass.connection.sendMessagePromise(message);
  assert.equal(guards.queuePage(await ws(messages.queueGet({ offset: 0, limit: 10 }))), true);
  assert.equal(guards.jobsPage(await ws(messages.jobsList({ offset: 0, limit: 10 }))), true);
  assert.equal(guards.job(await ws(messages.jobGet("job-kitchen"))), true);
  for (const [query, { guard }] of Object.entries(QUERY_COLLECTIONS)) assert.equal(guard(await ws(messages.query(query, { offset: 0, limit: 10 }))), true, query);
  assert.equal(guards.room(await ws(messages.query("get_room", { room_id: "room-kitchen" }))), true);
  assert.equal(guards.execution(await ws(messages.query("get_job_execution", { job_id: "job-bathroom" }))), true);
  assert.equal(guards.diagnostics(await ws(messages.query("get_diagnostics"))), true);
  assert.equal(guards.manifest(await ws(messages.manifest())), true);
  assert.equal(guards.entityRegistry(await ws(messages.entityRegistry())), true);
});

test("errors the fake raises decode to the integration's codes on both channels", async () => {
  const { createTransport } = await import("../../src/backend/transport.js");
  const { messages } = await import("../../src/backend/protocol.js");
  const { isKnownErrorCode } = await import("../../src/domain/backend-errors.js");
  const household = SCENARIOS.typical();
  const fake = createFakeOrchestrator({ seed: household.seed });
  const hass = fake.attachTo(hassFor(household));
  const transport = createTransport({ getHass: () => hass });
  const results = [
    await transport.service("update_job", { job_id: "job-running", passes: 2 }, { returnResponse: true }),
    await transport.service("move_job", { job_id: "job-unknown", direction: "up" }),
    await transport.ws(messages.query("get_room", { room_id: "room-unknown" })),
    await transport.ws(messages.command("resolve_recovery", { robot_id: "robot-rocky", confirm_stopped: false })),
    await transport.ws({ type: "vacuum_orchestrator/unknown" }),
  ];
  assert.deepEqual(results.map((result) => result.code), ["job_not_editable", "unknown_job", "unknown_room", "robot_not_needing_recovery", "unknown_command"]);
  assert.ok(results.every((result) => isKnownErrorCode(result.code)));
});

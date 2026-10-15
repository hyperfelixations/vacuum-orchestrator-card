// The API 4 surface the card uses: message builders, the operation catalog and the structural
// guards. Guards accept the integration's recorded records and additional fields; they refuse
// exactly the envelope breaks a normalizer could not survive.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");
const { recordedAnswer } = require("../../helpers/recordings.js");

const load = () => import("../../../src/backend/protocol.js");

// The integration's registered actions, as a recording's frontend saw them once it was loaded.
function recordedAnswerServices() {
  const { loadRecording } = require("../../helpers/recordings.js");
  const step = loadRecording("showcase").steps.find((entry) => entry.hass?.services?.vacuum_orchestrator?.length);
  return step.hass.services.vacuum_orchestrator;
}

test("the catalog names the 13 actions, 16 commands, 6 card commands, 12 queries and both read actions", async () => {
  const { ACTIONS, CARD_COMMANDS, CONFIGURATION_COMMANDS, CONFIGURATION_QUERIES, OPERATIONS } = await load();
  assert.equal(ACTIONS.length, 13);
  assert.ok(Object.isFrozen(ACTIONS));
  assert.ok(ACTIONS.includes("end_queue") && ACTIONS.includes("return_robot") && ACTIONS.includes("correct_job"));
  assert.equal(CONFIGURATION_COMMANDS.length, 16);
  assert.ok(CONFIGURATION_COMMANDS.includes("rename_robot") && !CONFIGURATION_COMMANDS.includes("release_room"));
  assert.deepEqual([...CARD_COMMANDS], ["complete_setup", "hold_job", "renew_job_hold", "release_job_hold", "release_rooms", "revoke_rooms"]);
  assert.equal(CONFIGURATION_QUERIES.length, 12);
  assert.ok(CONFIGURATION_QUERIES.includes("preview_job") && CONFIGURATION_QUERIES.includes("validate") && CONFIGURATION_QUERIES.includes("get_setup"));
  assert.equal(new Set(OPERATIONS).size, OPERATIONS.length);
  assert.ok(OPERATIONS.includes("get_queue") && OPERATIONS.includes("get_job"));
});

test("every operation the card uses is one the integration registers, or a card command", async () => {
  const { CARD_COMMANDS, OPERATIONS } = await load();
  const registered = new Set(recordedAnswerServices());
  assert.deepEqual(OPERATIONS.filter((name) => !registered.has(name) && !CARD_COMMANDS.includes(name)), []);
  assert.deepEqual(CARD_COMMANDS.filter((name) => registered.has(name)), [], "card commands are no actions");
});

test("message builders produce the integration's message types", async () => {
  const { messages } = await load();
  assert.deepEqual({ ...messages.queueGet({ offset: 25, limit: 25 }) }, { type: "vacuum_orchestrator/queue/get", offset: 25, limit: 25 });
  assert.deepEqual({ ...messages.jobGet("job-1") }, { type: "vacuum_orchestrator/job/get", job_id: "job-1" });
  assert.deepEqual({ ...messages.jobsList() }, { type: "vacuum_orchestrator/jobs/list", offset: 0, limit: 50 });
  assert.deepEqual({ ...messages.jobsList({ offset: 0, limit: 100, states: ["running"] }) }, { type: "vacuum_orchestrator/jobs/list", offset: 0, limit: 100, states: ["running"] });
  assert.deepEqual({ ...messages.subscribe() }, { type: "vacuum_orchestrator/subscribe" });
  assert.deepEqual({ ...messages.query("get_trace", { job_id: "j" }) }, { type: "vacuum_orchestrator/configuration/get", query: "get_trace", parameters: { job_id: "j" } });
  assert.deepEqual({ ...messages.command("revoke_rooms", { rooms: ["r"] }) }, { type: "vacuum_orchestrator/configuration/command", command: "revoke_rooms", parameters: { rooms: ["r"] } });
  assert.deepEqual({ ...messages.manifest() }, { type: "manifest/get", integration: "vacuum_orchestrator" });
  assert.deepEqual({ ...messages.entityRegistry() }, { type: "config/entity_registry/list" });
});

test("builders refuse what the integration's schema refuses", async () => {
  const { messages } = await load();
  assert.throws(() => messages.queueGet({ offset: -1, limit: 10 }), TypeError);
  assert.throws(() => messages.queueGet({ offset: 0, limit: 101 }), TypeError);
  assert.throws(() => messages.jobsList({ offset: 0, limit: 0 }), TypeError);
  assert.throws(() => messages.jobsList({ offset: 0, limit: 10, states: [] }), TypeError);
  assert.throws(() => messages.jobGet(""), TypeError);
  assert.throws(() => messages.query("get_everything"), TypeError);
  assert.throws(() => messages.command("delete_job"), TypeError);
});

test("the supported API version is 4 and is read from any envelope", async () => {
  const { apiVersionOf, isSupportedApiVersion } = await load();
  assert.equal(apiVersionOf(W.wireQueuePage()), 4);
  assert.equal(apiVersionOf({}), null);
  assert.equal(apiVersionOf(null), null);
  assert.equal(isSupportedApiVersion(4), true);
  assert.equal(isSupportedApiVersion(3), false);
});

test("every guard accepts its fixture record, with or without additional fields", async () => {
  const { guards } = await load();
  const cases = {
    queuePage: W.wireQueuePage([W.wireJob()]),
    jobsPage: W.wireJobListPage([W.wireJob()]),
    job: W.wireJob(),
    roomsPage: W.wirePage("rooms", [W.wireRoom()]),
    room: W.wireRoom(),
    robotsPage: W.wirePage("robots", [W.wireRobot()]),
    candidatesPage: W.wirePage("candidates", [W.wireCandidate()]),
    templatesPage: W.wirePage("templates", [W.wireTemplate()]),
    runsPage: W.wirePage("runs", [W.wireRun()]),
    tracePage: W.wireTracePage([W.wireTraceRecord()]),
    execution: W.wireExecution(),
    diagnostics: W.wireDiagnostics(),
    event: W.wireSubscriptionEvent(),
    manifest: W.wireManifest(),
    setup: recordedAnswer("setup", { type: "vacuum_orchestrator/configuration/get", query: "get_setup" }),
    entityRegistry: [W.wireRegistryEntry("sensor.a", "id-a")],
    commandResult: recordedAnswer("job_hold", { type: "vacuum_orchestrator/configuration/command", command: "hold_job" }),
  };
  for (const [name, value] of Object.entries(cases)) {
    assert.equal(guards[name](value), true, name);
    if (!Array.isArray(value)) assert.equal(guards[name]({ ...value, future_field: { nested: true } }), true, `${name} with an additional field`);
  }
  assert.equal(guards.commandResult(null), true);
});

test("guards refuse a broken envelope", async () => {
  const { guards } = await load();
  const broken = {
    "queue without commit id": guards.queuePage({ ...W.wireQueuePage(), commit_id: undefined }),
    "queue with a negative revision": guards.queuePage({ ...W.wireQueuePage(), queue_revision: -1 }),
    "queue without mode": guards.queuePage({ ...W.wireQueuePage(), mode: 1 }),
    "page without its collection": guards.roomsPage({ ...W.wirePage("rooms"), rooms: undefined }),
    "page with a zero limit": guards.jobsPage({ ...W.wireJobListPage(), limit: 0 }),
    "page with a fractional total": guards.robotsPage({ ...W.wirePage("robots"), total: 1.5 }),
    "job without id": guards.job({ ...W.wireJob(), job_id: 7 }),
    "execution without attempts": guards.execution({ ...W.wireExecution(), attempts: null }),
    "diagnostics without trace window": guards.diagnostics({ ...W.wireDiagnostics(), trace_window: null }),
    "event without runtime id": guards.event({ ...W.wireSubscriptionEvent(), runtime_id: null }),
    "event with a negative sequence": guards.event({ ...W.wireSubscriptionEvent(), runtime_sequence: -1 }),
    "manifest of another integration": guards.manifest({ ...W.wireManifest(), domain: "roborock" }),
    "registry that is no list": guards.entityRegistry({}),
    "setup without steps": guards.setup({ assistant_pending: true }),
    "command result that is a list": guards.commandResult([]),
  };
  for (const [reason, accepted] of Object.entries(broken)) assert.equal(accepted, false, reason);
});

test("collection queries name the page key and guard of their answer", async () => {
  const { QUERY_COLLECTIONS, guards } = await load();
  assert.deepEqual(Object.fromEntries(Object.entries(QUERY_COLLECTIONS).map(([query, spec]) => [query, spec.key])), {
    get_rooms: "rooms",
    get_robots: "robots",
    get_robot_candidates: "candidates",
    get_templates: "templates",
    get_history: "runs",
    get_trace: "records",
  });
  assert.equal(QUERY_COLLECTIONS.get_rooms.guard, guards.roomsPage);
});

// Scope loaders read bounded pages, check each envelope, normalize and de-duplicate by stable id.
// Boundary: one loader against a scripted transport; caching and demand belong to the session.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

const load = () => import("../../../src/backend/scopes.js");

// Answers each message through `answer(message)`; records what was sent.
function scripted(answer) {
  const sent = [];
  return {
    sent,
    ws: async (message) => {
      sent.push(message);
      const value = answer(message);
      return value && value.ok === false ? value : { ok: true, data: value };
    },
  };
}

const rooms = (count) => Array.from({ length: count }, (_, index) => W.wireRoom({ room_id: `room-${index}`, name: `Room ${index}`, area_id: `area_${index}` }));

test("the queue loader normalizes the page and records the API version", async () => {
  const { loadQueue } = await load();
  const transport = scripted(() => W.wireQueuePage([W.wireJob({ position: 1 })], { mode: "running", total: 1, integration_version: "0.1.0", active_count: 2, attention_count: 1 }));
  const result = await loadQueue(transport, { offset: 0, limit: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.data.apiVersion, 3);
  assert.equal(result.data.mode, "running");
  assert.deepEqual([result.data.integrationVersion, result.data.activeCount, result.data.attentionCount], ["0.1.0", 2, 1]);
  assert.equal(result.data.jobs[0].jobId, "job-1");
  assert.deepEqual(transport.sent, [{ type: "vacuum_orchestrator/queue/get", offset: 0, limit: 25 }]);
  assert.ok(Object.isFrozen(result.data));
});

test("a queue in another API version or with a broken envelope is refused", async () => {
  const { loadQueue } = await load();
  const newer = await loadQueue(scripted(() => W.wireQueuePage([], { api_version: 4 })));
  assert.equal(newer.code, "api_incompatible");
  assert.equal(newer.detail, "4");
  const broken = await loadQueue(scripted(() => ({ jobs: [] })));
  assert.equal(broken.code, "invalid_response");
  assert.equal(broken.detail, "queue/get");
});

test("a transport failure passes through untouched", async () => {
  const { loadRooms } = await load();
  const failure = { ok: false, code: "orchestrator_not_loaded", group: "availability", detail: null, channel: "ws" };
  assert.equal(await loadRooms(scripted(() => failure)), failure);
});

test("a collection is read page by page until its total is reached", async () => {
  const { loadRooms } = await load();
  const all = rooms(150);
  const transport = scripted((message) => {
    const { offset, limit } = message.parameters;
    return W.wirePage("rooms", all.slice(offset, offset + limit), { total: all.length, offset, limit });
  });
  const result = await loadRooms(transport);
  assert.equal(result.data.items.length, 150);
  assert.equal(result.data.complete, true);
  assert.deepEqual(transport.sent.map((message) => message.parameters), [{ offset: 0, limit: 100 }, { offset: 100, limit: 100 }]);
});

test("a record shifted onto the next page is kept once, in first-seen order", async () => {
  const { loadRobots } = await load();
  const robots = [W.wireRobot({ robot_id: "a" }), W.wireRobot({ robot_id: "b" }), W.wireRobot({ robot_id: "c" })];
  const pages = [
    W.wirePage("robots", robots.slice(0, 2), { total: 3, limit: 100 }),
    W.wirePage("robots", robots.slice(1, 3), { total: 3, offset: 2, limit: 100 }),
  ];
  let call = 0;
  const transport = scripted(() => pages[Math.min(call++, 1)]);
  const original = transport.ws;
  transport.ws = (message) => original({ ...message, parameters: { ...message.parameters, limit: 2 } });
  const result = await loadRobots(transport);
  assert.deepEqual(result.data.items.map((robot) => robot.robotId), ["a", "b", "c"]);
});

test("an empty page ends a collection, and the page bound marks it incomplete", async () => {
  const { loadTemplates, loadCandidates, MAX_COLLECTION_PAGES } = await load();
  const shrinking = await loadTemplates(scripted(() => W.wirePage("templates", [], { total: 5 })));
  assert.equal(shrinking.data.complete, true);
  assert.equal(shrinking.data.items.length, 0);
  let index = 0;
  const endless = scripted(() => W.wirePage("candidates", [W.wireCandidate({ registry_id: `reg-${index}`, entity_id: `vacuum.robot_${index++}` })], { total: 1000 }));
  const bounded = await loadCandidates(endless);
  assert.equal(bounded.data.complete, false);
  assert.equal(endless.sent.length, MAX_COLLECTION_PAGES);
});

test("records a normalizer cannot use are dropped, the rest kept", async () => {
  const { loadRooms } = await load();
  const result = await loadRooms(scripted(() => W.wirePage("rooms", [W.wireRoom(), { room_id: 7 }, null], { total: 3 })));
  assert.equal(result.data.items.length, 1);
});

test("open jobs are read through the integration's state filter, every page, each job once", async () => {
  const { loadOpenJobs, OPEN_JOB_STATES } = await load();
  assert.deepEqual([...OPEN_JOB_STATES], ["dispatching", "running", "canceling", "needs_attention"]);
  const jobs = Array.from({ length: 150 }, (_, index) => W.wireJob({ job_id: `job-${index}`, state: index % 2 ? "running" : "needs_attention" }));
  const transport = scripted((message) => ({ ...W.wireJobListPage(jobs.slice(message.offset, message.offset + message.limit), { total: jobs.length, offset: message.offset, limit: message.limit }), commit_id: 3, runtime_id: "runtime-1", runtime_sequence: 9 }));
  const result = await loadOpenJobs(transport);
  assert.deepEqual(transport.sent.map((message) => [message.offset, message.limit, message.states]), [[0, 100, [...OPEN_JOB_STATES]], [100, 100, [...OPEN_JOB_STATES]]]);
  assert.equal(result.data.jobs.length, 150);
  assert.equal(result.data.complete, true);
  assert.equal(result.view.sequence, 9);
});

test("open jobs beyond the page bound are marked incomplete", async () => {
  const { loadOpenJobs, MAX_COLLECTION_PAGES } = await load();
  const transport = scripted((message) => W.wireJobListPage([W.wireJob({ job_id: `job-${message.offset}`, state: "running" })], { total: 5000, offset: message.offset, limit: message.limit }));
  const result = await loadOpenJobs(transport);
  assert.equal(transport.sent.length, MAX_COLLECTION_PAGES);
  assert.equal(result.data.complete, false);
});

test("the job log keeps the page position; single records load by id", async () => {
  const { loadJobLog, loadJob } = await load();
  const log = await loadJobLog(scripted(() => W.wireJobListPage([W.wireJob()], { total: 40, offset: 25, limit: 25 })), { offset: 25, limit: 25 });
  assert.deepEqual([log.data.total, log.data.offset, log.data.limit, log.data.jobs.length], [40, 25, 25, 1]);
  const transport = scripted(() => W.wireJob({ job_id: "job-9" }));
  const job = await loadJob(transport, { jobId: "job-9" });
  assert.equal(job.data.jobId, "job-9");
  assert.deepEqual(transport.sent, [{ type: "vacuum_orchestrator/job/get", job_id: "job-9" }]);
  assert.equal((await loadJob(scripted(() => ({ job_id: "x", state: 1 })), { jobId: "x" })).code, "invalid_response");
});

test("history, trace, execution and diagnostics use their configuration queries", async () => {
  const { loadRuns, loadTrace, loadExecution, loadDiagnostics } = await load();
  const transport = scripted((message) => {
    if (message.query === "get_history") return W.wirePage("runs", [W.wireRun()], { total: 1 });
    if (message.query === "get_trace") return W.wireTracePage([W.wireTraceRecord()]);
    if (message.query === "get_job_execution") return W.wireExecution();
    return W.wireDiagnostics();
  });
  assert.equal((await loadRuns(transport, { offset: 0, limit: 10 })).data.runs.length, 1);
  assert.equal((await loadTrace(transport, { jobId: "job-1" })).data.records.length, 1);
  assert.equal((await loadExecution(transport, { jobId: "job-1" })).ok, true);
  assert.equal((await loadDiagnostics(transport)).data.apiVersion, 3);
  assert.deepEqual(transport.sent.map((message) => [message.query, message.parameters]), [
    ["get_history", { offset: 0, limit: 10 }],
    ["get_trace", { offset: 0, limit: 100, job_id: "job-1" }],
    ["get_job_execution", { job_id: "job-1" }],
    ["get_diagnostics", {}],
  ]);
});

test("the manifest gives the installed version; the registry keeps identity fields only", async () => {
  const { loadManifest, loadEntityRegistry } = await load();
  assert.equal((await loadManifest(scripted(() => W.wireManifest({ version: "0.1.0" })))).data.version, "0.1.0");
  const registry = await loadEntityRegistry(scripted(() => [
    W.wireRegistryEntry("sensor.a", "id-a", { platform: "vacuum_orchestrator", unique_id: "vacuum_orchestrator_queue_mode", disabled_by: "user" }),
    { entity_id: "sensor.b" },
  ]));
  assert.deepEqual({ ...registry.data[0] }, { id: "id-a", entityId: "sensor.a", platform: "vacuum_orchestrator", uniqueId: "vacuum_orchestrator_queue_mode", deviceId: null, disabled: true });
  assert.equal(registry.data.length, 1);
});

test("the integration's error texts load in one language and are keyed by code", async () => {
  const { loadErrorTexts } = await load();
  const transport = scripted(() => ({
    resources: {
      "component.vacuum_orchestrator.exceptions.robot_busy.message": "Der Roboter ist beschäftigt",
      "component.vacuum_orchestrator.exceptions.unknown_job.message": "Der Job existiert nicht",
      "component.vacuum_orchestrator.issues.voc_card_missing.title": "not an exception",
      "component.other.exceptions.robot_busy.message": "another domain",
      "component.vacuum_orchestrator.exceptions.empty.message": "",
    },
  }));
  const result = await loadErrorTexts(transport, { language: "de" });
  assert.deepEqual({ ...result.data }, { robot_busy: "Der Roboter ist beschäftigt", unknown_job: "Der Job existiert nicht" });
  assert.ok(Object.isFrozen(result.data));
  assert.deepEqual(transport.sent, [{ type: "frontend/get_translations", language: "de", category: "exceptions", integration: ["vacuum_orchestrator"] }]);
  assert.equal((await loadErrorTexts(scripted(() => ({ resources: null })), { language: "en" })).code, "invalid_response");
});

test("every read carries the view it was read at; a collection the oldest of its pages", async () => {
  const { loadQueue, loadRooms } = await load();
  const meta = (sequence, commit, runtime = "runtime-1") => ({ commit_id: commit, runtime_id: runtime, runtime_sequence: sequence });
  const queue = await loadQueue(scripted(() => ({ ...W.wireQueuePage([]), ...meta(4, 7) })));
  assert.deepEqual({ ...queue.view }, { runtimeId: "runtime-1", sequence: 4, commitId: 7 });
  assert.ok(Object.isFrozen(queue.view));
  const all = rooms(150);
  const paged = (metaFor) => scripted((message) => {
    const { offset, limit } = message.parameters;
    return { ...W.wirePage("rooms", all.slice(offset, offset + limit), { total: all.length, offset, limit }), ...metaFor(offset) };
  });
  assert.deepEqual({ ...(await loadRooms(paged((offset) => (offset ? meta(6, 9) : meta(5, 8))))).view }, { runtimeId: "runtime-1", sequence: 5, commitId: 8 });
  assert.equal((await loadRooms(paged((offset) => meta(5, 8, offset ? "runtime-2" : "runtime-1")))).view, null, "pages of two runtimes are no view");
  assert.equal((await loadQueue(scripted(() => W.wireQueuePage([])))).view, null, "a read without metadata has no view");
});

test("each integration view names the scopes that read it; volatile scopes follow every event", async () => {
  const { SCOPES, VIEW_SCOPES, VOLATILE_SCOPES, scopesForChanges } = await load();
  assert.deepEqual(Object.keys(VIEW_SCOPES).sort(), ["jobs", "queue", "robots", "rooms", "templates"]);
  for (const names of [...Object.values(VIEW_SCOPES), VOLATILE_SCOPES]) for (const name of names) assert.ok(SCOPES.includes(name), name);
  assert.deepEqual([...scopesForChanges(["rooms"])].sort(), ["diagnostics", "execution", "preview", "rooms", "trace"]);
  assert.deepEqual([...scopesForChanges(["queue"])].sort(), ["diagnostics", "execution", "job", "preview", "queue", "trace"]);
  assert.equal(scopesForChanges(["rooms", "future_view"]), "all");
  assert.equal(scopesForChanges(undefined), "all");
  assert.equal(scopesForChanges("rooms"), "all");
});

test("every scope the session can demand has a loader", async () => {
  const { SCOPES } = await load();
  assert.deepEqual([...SCOPES].sort(), ["candidates", "diagnostics", "errorTexts", "execution", "job", "jobLog", "manifest", "openJobs", "preview", "queue", "registry", "robots", "rooms", "runs", "templates", "trace"]);
});

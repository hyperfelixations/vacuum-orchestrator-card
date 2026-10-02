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
  const transport = scripted(() => W.wireQueuePage([W.wireJob({ position: 1 })], { mode: "running", total: 1 }));
  const result = await loadQueue(transport, { offset: 0, limit: 25 });
  assert.equal(result.ok, true);
  assert.equal(result.data.apiVersion, 2);
  assert.equal(result.data.mode, "running");
  assert.equal(result.data.jobs[0].jobId, "job-1");
  assert.deepEqual(transport.sent, [{ type: "vacuum_orchestrator/queue/get", offset: 0, limit: 25 }]);
  assert.ok(Object.isFrozen(result.data));
});

test("a queue in another API version or with a broken envelope is refused", async () => {
  const { loadQueue } = await load();
  const newer = await loadQueue(scripted(() => W.wireQueuePage([], { api_version: 3 })));
  assert.equal(newer.code, "api_incompatible");
  assert.equal(newer.detail, "3");
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

test("open jobs skip queued and finished jobs and stop once the expected count is found", async () => {
  const { loadOpenJobs } = await load();
  const jobs = [
    W.wireJob({ job_id: "q", state: "queued" }),
    W.wireJob({ job_id: "run", state: "running" }),
    W.wireJob({ job_id: "done", state: "completed" }),
    W.wireJob({ job_id: "help", state: "needs_attention" }),
    W.wireJob({ job_id: "old", state: "dispatching" }),
  ];
  const transport = scripted((message) => W.wireJobListPage(jobs.slice(message.offset, message.offset + 2), { total: jobs.length, offset: message.offset, limit: 2 }));
  const original = transport.ws;
  transport.ws = (message) => original({ ...message, limit: 2 });
  const result = await loadOpenJobs(transport, { expected: 2 });
  assert.deepEqual(result.data.jobs.map((job) => job.jobId), ["run", "help"]);
  assert.equal(result.data.complete, true);
  assert.equal(transport.sent.length, 2);
});

test("without expected counts the open-job scan reads two pages and says when it stopped early", async () => {
  const { loadOpenJobs, BLIND_JOB_SCAN_PAGES } = await load();
  const transport = scripted((message) => W.wireJobListPage([W.wireJob({ job_id: `job-${message.offset}`, state: "running" })], { total: 50, offset: message.offset, limit: 1 }));
  const result = await loadOpenJobs(transport, {});
  assert.equal(transport.sent.length, BLIND_JOB_SCAN_PAGES);
  assert.equal(result.data.complete, false);
  const short = await loadOpenJobs(scripted(() => W.wireJobListPage([W.wireJob({ state: "running" })], { total: 1 })), {});
  assert.equal(short.data.complete, true);
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
  assert.equal((await loadDiagnostics(transport)).data.apiVersion, 2);
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

test("every scope the session can demand has a loader", async () => {
  const { SCOPES } = await load();
  assert.deepEqual([...SCOPES].sort(), ["candidates", "diagnostics", "execution", "job", "jobLog", "manifest", "openJobs", "queue", "registry", "robots", "rooms", "runs", "templates", "trace"]);
});

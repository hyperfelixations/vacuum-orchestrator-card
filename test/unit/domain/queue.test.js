// The pending-queue page: positions from the page offset, the queue run, recovery targets and
// the quiet period, all as reported. The run phase is read from the integration's fields.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

const load = () => import("../../../src/domain/queue.js");

test("positions continue from the page offset", async () => {
  const { normalizeQueuePage } = await load();
  const page = normalizeQueuePage(W.wireQueuePage([W.wireJob({ job_id: "a" }), W.wireJob({ job_id: "b" })], { offset: 25, total: 27, limit: 25 }));
  assert.deepEqual(page.jobs.map((job) => [job.jobId, job.position]), [["a", 26], ["b", 27]]);
  assert.deepEqual([page.total, page.offset, page.limit], [27, 25, 25]);
});

test("a dropped record does not leave a gap in the positions", async () => {
  const { normalizeQueuePage } = await load();
  const page = normalizeQueuePage(W.wireQueuePage([W.wireJob({ job_id: "a" }), { job_id: 5 }, W.wireJob({ job_id: "c" })]));
  assert.deepEqual(page.jobs.map((job) => job.position), [1, 2]);
});

test("queue facts are kept as reported", async () => {
  const { normalizeQueuePage } = await load();
  const page = normalizeQueuePage(W.wireQueuePage([], {
    mode: "paused",
    commit_id: 7,
    queue_revision: 3,
    needs_attention: true,
    recovery_targets: [{ robot_id: "legacy:unscoped", reason: "physical_run_ownership_uncertain" }, { reason: "no robot" }],
    queue_grace_seconds: 0,
    queue_run: W.wireQueueRun({ idle_since: "2026-09-17T00:10:00+00:00", deadline: "2026-09-17T00:25:00+00:00" }),
  }));
  assert.equal(page.mode, "paused");
  assert.deepEqual([page.commitId, page.queueRevision, page.needsAttention, page.graceSeconds], [7, 3, true, 0]);
  assert.deepEqual(page.recoveryTargets.map((target) => ({ ...target })), [{ robotId: "legacy:unscoped", reason: "physical_run_ownership_uncertain" }]);
  assert.equal(page.run.deadline, Date.parse("2026-09-17T00:25:00Z"));
});

test("an unknown mode reads idle and missing paging falls back to the page's own content", async () => {
  const { normalizeQueuePage } = await load();
  const page = normalizeQueuePage({ jobs: [W.wireJob()], mode: "busy" });
  assert.equal(page.mode, "idle");
  assert.deepEqual([page.total, page.offset, page.limit], [1, 0, 50]);
  assert.equal(page.graceSeconds, null);
  assert.equal(normalizeQueuePage(null), null);
});

test("the run phase is read from active and deadline", async () => {
  const { normalizeQueuePage, queueRunPhase } = await load();
  const phaseOf = (run) => queueRunPhase(normalizeQueuePage(W.wireQueuePage([], { queue_run: run })).run);
  assert.equal(phaseOf(null), "none");
  assert.equal(phaseOf(W.wireQueueRun()), "active");
  assert.equal(phaseOf(W.wireQueueRun({ deadline: "2026-09-17T00:25:00+00:00" })), "winding_down");
  assert.equal(phaseOf(W.wireQueueRun({ active: false, completed_at: "2026-09-17T00:30:00+00:00" })), "finished");
  assert.equal(phaseOf({ started_at: "2026-09-17T00:00:00+00:00" }), "none");
});

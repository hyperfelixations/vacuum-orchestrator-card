// The pending-queue page: positions from the page offset, the queue run, recovery targets and
// the quiet period, all as reported. The run phase is the integration's.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");
const { loadRecording } = require("../../helpers/recordings.js");

// One queue run per phase the recordings reach: waiting for work, cleaning, paused, ending, ended.
function recordedRuns() {
  const runs = ["queue_end", "queue_controls"].flatMap((name) => loadRecording(name).steps.map((step) => step.receive?.result?.queue_run).filter(Boolean));
  return [...new Map(runs.map((run) => [run.phase, run])).values()];
}

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
    queue_run: W.wireQueueRun({ phase: "standby", ends_at: "2026-03-14T11:25:00+00:00" }),
  }));
  assert.equal(page.mode, "paused");
  assert.deepEqual([page.commitId, page.queueRevision, page.needsAttention, page.graceSeconds], [7, 3, true, 0]);
  assert.deepEqual(page.recoveryTargets.map((target) => ({ ...target })), [{ robotId: "legacy:unscoped", reason: "physical_run_ownership_uncertain" }]);
  assert.deepEqual([page.run.phase, page.run.endsAt], ["standby", Date.parse("2026-03-14T11:25:00Z")]);
});

test("an unknown mode reads idle and missing paging falls back to the page's own content", async () => {
  const { normalizeQueuePage } = await load();
  const page = normalizeQueuePage({ jobs: [W.wireJob()], mode: "busy" });
  assert.equal(page.mode, "idle");
  assert.deepEqual([page.total, page.offset, page.limit], [1, 0, 50]);
  assert.equal(page.graceSeconds, null);
  assert.equal(normalizeQueuePage(null), null);
});

test("the run phase is the integration's, off without a run", async () => {
  const { normalizeQueuePage, queueRunPhase } = await load();
  const phaseOf = (run) => queueRunPhase(normalizeQueuePage(W.wireQueuePage([], { queue_run: run })).run);
  assert.deepEqual(recordedRuns().map(phaseOf).sort(), ["active", "ending", "off", "paused", "standby"]);
  assert.equal(phaseOf(null), "off");
  assert.equal(phaseOf(W.wireQueueRun({ phase: "sprinting" })), "off", "an unknown phase reads as no run");
  assert.equal(phaseOf({ started_at: "2026-03-14T11:00:00+00:00" }), "off", "a run without identity is none");
});

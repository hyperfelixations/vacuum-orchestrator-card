"use strict";
// Sections and overlays driven through the real card: every control has to reach the backend
// as exactly one command, and every overlay has to open and close.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

test("the queue section renders one keyed row per pending job and the active jobs above", async () => {
  const mounted = await mountCard({ env, seed: { jobs: [...JOBS, { job_id: "job-run", areas: ["bathroom"], mode: "vacuum", state: "running" }] } });
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  assert.equal(mounted.root.querySelectorAll(".voc-active-jobs .voc-job-row").length, 1);
  const first = mounted.root.querySelector(".voc-pending-queue .voc-job-row");
  assert.equal(first.querySelector(".voc-job-name").textContent, "Kitchen after dinner");
  assert.equal(first.querySelector("[data-row-position]").textContent, "01");
  assert.equal(first.querySelector("[data-row-mode]").textContent, "V→M");
  mounted.unmount();
});

// Only two actions used to be wired; every other button reached no command at all.
test("each row control sends exactly one backend command", async () => {
  const mounted = await mountCard({ env, config: { confirm_destructive: false }, seed: { jobs: JOBS } });
  await mounted.click(".voc-pending-queue .voc-job-action-moveDown");
  assert.equal(mounted.serviceCalls("move_job").length, 1);
  assert.deepEqual(mounted.serviceCalls("move_job")[0].data, { job_id: "job-a", direction: "down" });
  assert.deepEqual(mounted.rows(), ["job-b", "job-a"]);

  await mounted.click(".voc-pending-queue .voc-job-action-start");
  assert.deepEqual(mounted.serviceCalls("start_job")[0].data, { job_id: "job-b" });

  await mounted.click(".voc-pending-queue .voc-job-action-delete");
  assert.deepEqual(mounted.serviceCalls("delete_job")[0].data, { job_id: "job-a" });
  assert.deepEqual(mounted.rows(), []);
  mounted.unmount();
});

test("a keyed row is patched, not replaced, when only its values change", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  const before = mounted.root.querySelector('.voc-job-row[data-job-id="job-b"]');
  await mounted.fake.updateJob("job-b", { name: "Hall again" });
  await mounted.settle();
  const after = mounted.root.querySelector('.voc-job-row[data-job-id="job-b"]');
  assert.equal(after, before);
  assert.equal(after.querySelector(".voc-job-name").textContent, "Hall again");
  mounted.unmount();
});

test("delete asks for confirmation, and cancelling the confirmation sends nothing", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click(".voc-pending-queue .voc-job-action-delete");
  assert.ok(mounted.root.querySelector(".voc-confirm-overlay[role=alertdialog]"));
  assert.equal(mounted.text("#voc-confirm-text"), "Delete “Kitchen after dinner”?");
  await mounted.click('.voc-confirm-actions [data-action="dismiss"]');
  assert.equal(mounted.serviceCalls("delete_job").length, 0);
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);

  await mounted.click(".voc-pending-queue .voc-job-action-delete");
  await mounted.click('.voc-confirm-actions [data-action="delete-job"]');
  assert.equal(mounted.serviceCalls("delete_job").length, 1);
  assert.deepEqual(mounted.rows(), ["job-b"]);
  mounted.unmount();
});

test("the queue control follows the queue mode", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click(".voc-queue-command");
  assert.equal(mounted.serviceCalls("run_queue").length, 1);
  assert.equal(mounted.root.querySelector(".voc-queue-command").dataset.action, "pause-queue");
  await mounted.click(".voc-queue-command");
  assert.equal(mounted.serviceCalls("pause_queue").length, 1);
  mounted.unmount();
});

test("the editor creates a job from the chosen fields and returns to the queue", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click(".voc-primary-action");
  const editor = mounted.root.querySelector(".voc-job-editor");
  assert.ok(editor);
  assert.equal(mounted.root.querySelector("[role=tablist]"), null, "the editor replaces the tab strip");
  assert.equal(editor.querySelector('[data-action="save-job"]').disabled, true, "nothing to save yet");

  await mounted.click('.voc-job-editor [data-control][data-field-path="areas"] [data-voc-value="bathroom"]');
  await mounted.click('.voc-job-editor [data-control][data-field-path="mode"] [data-voc-value="vacuum_and_mop"]');
  await mounted.click('.voc-job-editor [data-action="save-job"]');

  const created = mounted.serviceCalls("create_job");
  assert.equal(created.length, 1);
  // The payload comes from the card's realm; copy it before comparing structurally.
  assert.deepEqual([...created[0].data.areas], ["bathroom"]);
  assert.equal(created[0].data.mode, "vacuum_and_mop");
  assert.ok(mounted.root.querySelector(".voc-queue-section"));
  assert.equal(mounted.rows().length, 3);
  mounted.unmount();
});

test("editing a job sends only the changed field", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click('.voc-job-row[data-job-id="job-b"] .voc-job-name');
  await mounted.click('.voc-job-detail .voc-detail-action-edit');
  await mounted.click('.voc-job-editor [data-control][data-field-path="mode"] [data-voc-value="vacuum"]');
  await mounted.click('.voc-job-editor [data-action="save-job"]');
  const updated = mounted.serviceCalls("update_job");
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].data, { job_id: "job-b", mode: "vacuum" });
  mounted.unmount();
});

test("the detail overlay opens from a row and closes with Back", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click('.voc-pending-queue .voc-job-row[data-job-id="job-a"] .voc-job-name');
  assert.equal(mounted.text("#voc-detail-title"), "Kitchen after dinner");
  await mounted.click(".voc-job-detail .voc-back-button");
  assert.ok(mounted.root.querySelector(".voc-queue-section"));
  mounted.unmount();
});

// Switching sections must rebuild the body even when both sections render the same
// degraded structure.
test("switching tabs changes the body and keeps focus on the chosen tab", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  for (const key of ["rooms", "robots", "queue"]) {
    await mounted.click(`[role=tab][data-section="${key}"]`);
    assert.equal(mounted.root.querySelector(".voc-body .voc-section").dataset.section, key);
    assert.equal(mounted.root.activeElement?.dataset.section, key);
  }
  mounted.unmount();
});

test("rooms and robots name the missing backend function today and render data on the target backend", async () => {
  const today = await mountCard({ env });
  await today.click('[role=tab][data-section="rooms"]');
  assert.equal(today.text(".voc-unavailable"), "Room data is not provided by the backend.");
  today.unmount();

  const target = await mountCard({ env, profile: "target" });
  await target.click('[role=tab][data-section="rooms"]');
  assert.equal(target.root.querySelector(".voc-unavailable"), null);
  assert.equal(target.root.querySelectorAll(".voc-room-row").length, 3);
  await target.click('[role=tab][data-section="robots"]');
  assert.equal(target.root.querySelectorAll(".voc-robot-card").length, 1);
  target.unmount();
});

test("a backend refusal is shown in the section and keeps the rows", async () => {
  const mounted = await mountCard({ env, config: { confirm_destructive: false }, seed: { jobs: JOBS } });
  mounted.fake.failNext("job_not_startable");
  await mounted.click(".voc-pending-queue .voc-job-action-start");
  assert.equal(mounted.text(".voc-error-message"), "This job cannot be started.");
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

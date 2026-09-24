"use strict";
// The job detail page through the real card: what it shows about a job, and the actions that
// only it offers. Boundary: behaviour of the composed card; the projection itself is a unit
// test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

async function openDetail(jobId, options = {}) {
  const mounted = await mountCard({ env, seed: { jobs: JOBS }, ...options });
  await mounted.click(`.voc-job-row[data-job-id="${jobId}"] .voc-job-name`);
  return mounted;
}

test("the detail page names the job and repeats every field of its record", async () => {
  const mounted = await openDetail("job-a");
  assert.equal(mounted.text("#voc-detail-title"), "Kitchen after dinner");
  const fields = [...mounted.root.querySelectorAll(".voc-detail-fields dt")].map((node) => node.textContent);
  for (const label of ["Source", "Created", "Updated"]) assert.ok(fields.includes(label), `${label} is missing`);
  assert.match(mounted.root.querySelector(".voc-detail-summary").textContent, /Vacuum, then mop/);
  mounted.unmount();
});

// Moving to an end is the detail page's own offer; the row has no room for it.
test("the detail page moves a job to either end of the queue", async () => {
  const mounted = await openDetail("job-b");
  await mounted.click(".voc-job-detail .voc-detail-action-moveTop");
  assert.deepEqual(mounted.serviceCalls("move_job")[0].data, { job_id: "job-b", direction: "top" });
  assert.deepEqual(mounted.rows(), ["job-b", "job-a"]);

  await mounted.click('.voc-job-row[data-job-id="job-b"] .voc-job-name');
  await mounted.click(".voc-job-detail .voc-detail-action-moveBottom");
  assert.deepEqual(mounted.serviceCalls("move_job")[1].data, { job_id: "job-b", direction: "bottom" });
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

// A finished job lives in the history, which is the only place it can be opened from.
test("a terminal job offers only what a finished job allows", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS }, config: { sections: ["queue", "history"] } });
  await mounted.click('[role=tab][data-section="history"]');
  await mounted.click('.voc-history-section .voc-job-row[data-job-id="job-c"] .voc-job-name');
  const visible = [...mounted.root.querySelectorAll(".voc-detail-actions button")].map((button) => button.dataset.action);
  assert.ok(visible.includes("retry-job"), "a finished job can be created again");
  assert.ok(!visible.includes("start-job"), "a finished job cannot be started");
  assert.ok(!visible.includes("move-top"), "a finished job is not in the queue");
  await mounted.click(".voc-job-detail .voc-detail-action-retry");
  assert.deepEqual(mounted.serviceCalls("retry_job")[0].data, { job_id: "job-c" });
  mounted.unmount();
});

test("editing from the detail page opens the editor on that job", async () => {
  const mounted = await openDetail("job-a");
  await mounted.click(".voc-job-detail .voc-detail-action-edit");
  const editor = mounted.root.querySelector(".voc-job-editor");
  assert.equal(editor.dataset.editorMode, "edit");
  assert.equal(mounted.text("#voc-editor-title"), "Edit");
  mounted.unmount();
});

test("a blocked job explains itself with the entities that block it", async () => {
  const mounted = await mountCard({
    env,
    seed: {
      jobs: [
        {
          job_id: "job-blocked",
          areas: ["kitchen"],
          mode: "vacuum",
          required_on: ["binary_sensor.door"],
          // Readiness is the backend's verdict, never the card's: the fake states it here.
          readiness: { state: "blocked", failed_on: ["binary_sensor.door"], failed_off: [], unknown: [] },
        },
      ],
    },
    hass: { states: { "binary_sensor.door": { entity_id: "binary_sensor.door", state: "off", attributes: { friendly_name: "Hall door" } } } },
  });
  await mounted.click('.voc-job-row[data-job-id="job-blocked"] .voc-job-name');
  const readiness = [...mounted.root.querySelectorAll(".voc-detail-block")].find((block) => block.textContent.includes("Readiness"));
  assert.ok(readiness, "the readiness block is present");
  assert.match(readiness.textContent, /Hall door/);
  mounted.unmount();
});

test("a read-only user reaches the detail page and finds its actions locked", async () => {
  const mounted = await openDetail("job-a", { hass: { isAdmin: false } });
  const start = mounted.root.querySelector(".voc-job-detail .voc-detail-action-start");
  assert.equal(start.getAttribute("aria-disabled"), "true");
  assert.equal(start.getAttribute("title"), "This user cannot change jobs");
  await mounted.click(start);
  assert.equal(mounted.serviceCalls("start_job").length, 0);
  mounted.unmount();
});

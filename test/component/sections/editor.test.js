"use strict";
// The job editor through the real card: every control kind turns an interaction into the next
// draft, and the draft is what reaches the backend. Boundary: the composed editor; the
// validation rules themselves are a domain test.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

async function openEditor(options = {}) {
  const mounted = await mountCard({ env, seed: { jobs: JOBS }, ...options });
  await mounted.click(".voc-primary-action");
  return mounted;
}

const draftOf = (mounted) => mounted.card._ui.draft;

test("the stepper counts within its bounds and a typed number is taken as it is", async () => {
  const mounted = await openEditor();
  const stepper = '[data-field-path="passes"]';
  assert.equal(draftOf(mounted).passes, 1);

  await mounted.click(`${stepper} [data-stepper-action="increment"]`);
  assert.equal(draftOf(mounted).passes, 2);
  await mounted.click(`${stepper} [data-stepper-action="decrement"]`);
  assert.equal(draftOf(mounted).passes, 1);
  // One is the floor; the control cannot walk below it.
  await mounted.click(`${stepper} [data-stepper-action="decrement"]`);
  assert.equal(draftOf(mounted).passes, 1);

  await mounted.type(`${stepper} input`, "7");
  assert.equal(draftOf(mounted).passes, 7);
  await mounted.type(`${stepper} input`, "not a number");
  assert.equal(draftOf(mounted).passes, 7, "an unreadable entry leaves the draft alone");
  mounted.unmount();
});

test("a room chip adds and removes its room, and a single choice can be cleared", async () => {
  const mounted = await openEditor();
  const chip = (value) => `[data-control][data-field-path="areas"] [data-voc-value="${value}"]`;

  await mounted.click(chip("kitchen"));
  await mounted.click(chip("hall"));
  assert.deepEqual([...draftOf(mounted).areas], ["kitchen", "hall"]);
  await mounted.click(chip("kitchen"));
  assert.deepEqual([...draftOf(mounted).areas], ["hall"], "a second press takes the room back out");

  await mounted.click('[data-control][data-field-path="mopRoute"] [data-voc-value="deep"]');
  assert.equal(draftOf(mounted).mopRoute, "deep");
  // The "not set" option carries an empty value and means exactly that.
  await mounted.click('[data-control][data-field-path="mopRoute"] [data-voc-value=""]');
  assert.equal(draftOf(mounted).mopRoute, null);
  mounted.unmount();
});

test("a text field that is emptied becomes unset rather than an empty string", async () => {
  const mounted = await openEditor();
  await mounted.type('[data-field-path="source"] input', "Dashboard");
  assert.equal(draftOf(mounted).source, "Dashboard");
  await mounted.type('[data-field-path="source"] input', "   ");
  assert.equal(draftOf(mounted).source, null);
  mounted.unmount();
});

test("an entity is picked from the list and taken back off with its chip", async () => {
  const mounted = await openEditor({
    hass: { states: { "binary_sensor.door": { entity_id: "binary_sensor.door", state: "off", attributes: { friendly_name: "Hall door" } } } },
  });
  const field = '[data-control][data-field-path="requiredOn"]';
  await mounted.click(`${field} [role="option"][data-voc-value="binary_sensor.door"]`);
  assert.deepEqual([...draftOf(mounted).requiredOn], ["binary_sensor.door"]);

  await mounted.click(`${field} [data-combobox-remove="binary_sensor.door"]`);
  assert.deepEqual([...draftOf(mounted).requiredOn], []);
  mounted.unmount();
});

// The editor refuses to send what the backend would reject anyway, and says where.
test("saving stays blocked while a field is invalid and the field says why", async () => {
  const mounted = await openEditor();
  const save = () => mounted.root.querySelector('.voc-job-editor [data-action="save-job"]');
  assert.equal(save().disabled, true);
  assert.equal(mounted.text('[data-field-path="areas"] .voc-field-error'), "Select at least one room.");

  await mounted.click('[data-control][data-field-path="areas"] [data-voc-value="kitchen"]');
  assert.equal(save().disabled, false);
  assert.equal(mounted.root.querySelector('[data-field-path="areas"] .voc-field-error'), null);

  await mounted.click(save());
  const created = mounted.serviceCalls("create_job");
  assert.equal(created.length, 1);
  assert.deepEqual([...created[0].data.areas], ["kitchen"]);
  assert.ok(mounted.root.querySelector(".voc-queue-section"), "the card returns to the queue");
  mounted.unmount();
});

test("a backend refusal keeps the editor open and shows the reason", async () => {
  const mounted = await openEditor();
  await mounted.click('[data-control][data-field-path="areas"] [data-voc-value="kitchen"]');
  mounted.fake.failNext("dedupe_key_already_queued");
  await mounted.click('.voc-job-editor [data-action="save-job"]');
  assert.ok(mounted.root.querySelector(".voc-job-editor"), "the draft is not lost");
  assert.equal(mounted.text(".voc-editor-error .voc-error-message"), "A job with this deduplication key is queued.");
  mounted.unmount();
});

// Cancelling a running job is destructive in its own way, so it has its own words.
test("cancelling a running job asks with the cancel wording", async () => {
  const mounted = await mountCard({
    env,
    seed: { jobs: [{ job_id: "job-run", name: "Living room", areas: ["kitchen"], mode: "vacuum", state: "running" }] },
  });
  await mounted.click(".voc-active-jobs .voc-job-action-cancel");
  assert.equal(mounted.text("#voc-confirm-title"), "Cancel job?");
  assert.match(mounted.text("#voc-confirm-text"), /Living room/);
  await mounted.click('.voc-confirm-actions [data-action="cancel-job"]');
  assert.deepEqual(mounted.serviceCalls("cancel_job")[0].data, { job_id: "job-run" });
  mounted.unmount();
});

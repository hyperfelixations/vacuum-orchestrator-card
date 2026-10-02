// Templates, history and diagnostics driven through the built card: creating and using templates,
// allowing a suppressed due period again, switching history sources with paging, and the
// diagnostics view with versions and the trace.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

async function open(view, options = {}) {
  const card = await mountCard({ env, ...options });
  await card.click(`[role="tab"][data-view="${view}"]`);
  await card.settle(24);
  return card;
}

test("templates create a job, allow a used due period again and are edited in the job editor", async () => {
  const card = await open("templates");
  assert.equal(card.all(".voc-template").length, 3);
  await card.click('[data-key="template:template-weekly"] [data-action="reset-template-demand"]');
  await card.click('[data-key="template:template-daily"] [data-action="create-from-template"]');
  await card.settle(32);
  assert.deepEqual(card.commands("reset_template_demand").map((message) => message.parameters), [{ template_id: "template-weekly" }]);
  assert.deepEqual(card.commands("create_job_from_template").map((message) => message.parameters), [{ template_id: "template-daily" }]);
  assert.equal(card.root.querySelector('[data-key="template:template-weekly"] [data-action="reset-template-demand"]'), null, "nothing suppressed any more");
  assert.equal(card.root.querySelector('[data-key="template:template-guests"] [data-action="create-from-template"]').disabled, true);
  await card.click('[data-key="template:template-daily"] [data-action="edit-template"]');
  await card.click('[data-key="field:automatic"] input');
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [saved] = card.commands("save_template");
  assert.equal(saved.parameters.template_id, "template-daily");
  assert.equal(saved.parameters.automatic, true);
  card.unmount();
});

test("a new template needs a name and is saved whole", async () => {
  const card = await open("templates");
  await card.click(".voc-primary-action");
  assert.equal(card.text("#voc-overlay-title"), "New template");
  await card.click('[data-field-control="chips"] [data-value="room-kitchen"]');
  await card.click('[data-action="save-draft"]');
  assert.ok(card.root.querySelector('[data-key="field:templateName"] .voc-field-error'));
  await card.type('[data-field="templateName"]', "Kitchen only");
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [saved] = card.commands("save_template");
  assert.deepEqual([saved.parameters.name, saved.parameters.intent.areas, "template_id" in saved.parameters], ["Kitchen only", ["room-kitchen"], false]);
  card.unmount();
});

test("history lists every job newest first and switches to cleaning runs", async () => {
  const card = await open("history");
  const keys = card.all('[data-key="jobs"] .voc-job').map((row) => row.dataset.key);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], "job:job-bedroom");
  assert.ok(card.root.querySelector('[data-key="job:job-failed"] [data-action="retry-job"]'));
  await card.click('[data-key="segment:runs"]');
  await card.settle(24);
  assert.equal(card.queries("get_history").length, 1);
  assert.equal(card.all(".voc-run").length, 3);
  assert.match(card.text('[data-key="run:robot-run-2"]'), /outside/i);
  card.unmount();
});

test("history pages ask the integration for the next page", async () => {
  const card = await open("history", { config: { page_size: 5 } });
  assert.equal(card.all('[data-key="jobs"] .voc-job').length, 5);
  await card.click('.voc-pagination [data-action="page"][data-args*="next"]');
  await card.settle(24);
  assert.equal(card.all('[data-key="jobs"] .voc-job').length, 2);
  assert.ok(card.fake.calls.ws.some((message) => message.type.endsWith("/jobs/list") && message.offset === 5 && message.limit === 5));
  card.unmount();
});

test("diagnostics show versions, runtime and the trace when switched on", async () => {
  const card = await mountCard({ env, config: { views: ["queue", "diagnostics"] } });
  await card.click('[role="tab"][data-view="diagnostics"]');
  await card.settle(24);
  assert.match(card.text('[data-key="versions"]'), /0\.1\.0/);
  assert.match(card.text('[data-key="versions"]'), /Live updates active/);
  assert.ok(card.all(".voc-trace li").length > 0);
  card.unmount();
});

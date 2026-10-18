// Templates, history and diagnostics driven through the built card: using, editing, creating and
// removing templates, allowing a used due period again, switching history sources with paging,
// and the diagnostics view with versions and the trace.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../../helpers/mount-card.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };

async function open(view, place, options = {}) {
  const card = await mountCard({ ...place, ...options });
  await card.click(`[role="tab"][data-view="${view}"]`);
  await card.settle(24);
  return card;
}
const templates = (from) => open("templates", { recording: "template_controls", from });
const template = (card, name) => card.named(".voc-template", name);
const templateId = (card, name) => template(card, name).dataset.key.replace(/^template:/, "");

test("a template creates a job, allows a used due period again and is edited in the job editor", async () => {
  const card = await templates("The daily template made a job");
  const daily = templateId(card, "Dining room daily");
  await card.click(template(card, "Dining room daily").querySelector('[data-action="reset-template-demand"]'));
  await card.settle(32);
  assert.deepEqual(card.commands("reset_template_demand").map((message) => message.parameters), [{ template_id: daily }]);
  assert.equal(template(card, "Dining room daily").querySelector('[data-action="reset-template-demand"]'), null, "nothing suppressed any more");
  await card.click(template(card, "Dining room daily").querySelector('[data-action="create-from-template"]'));
  await card.settle(32);
  assert.deepEqual(card.commands("create_job_from_template").map((message) => message.parameters), [{ template_id: daily }]);
  await card.click(template(card, "Dining room daily").querySelector('[data-action="edit-template"]'));
  await card.settle(32);
  await card.click('[data-key="field:automatic"] input');
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [saved] = card.commands("save_template");
  assert.deepEqual([saved.parameters.template_id, saved.parameters.automatic], [daily, false]);
  card.unmount();
});

test("a new template needs a name and is saved whole", async () => {
  const card = await templates("The daily template is manual");
  await card.click(".voc-primary-action");
  assert.equal(card.text("#voc-overlay-title"), "New template");
  const studio = card.all('[data-field-control="chips"] [data-value]').find((node) => node.textContent.trim() === "Studio");
  await card.click(studio);
  await card.settle(32);
  await card.click('[data-action="save-draft"]');
  assert.ok(card.root.querySelector('[data-key="field:templateName"] .voc-field-error'));
  await card.type('[data-field="templateName"]', "Studio weekly");
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [saved] = card.commands("save_template");
  assert.deepEqual([saved.parameters.name, saved.parameters.intent.areas, "template_id" in saved.parameters], ["Studio weekly", [studio.dataset.value], false]);
  assert.ok(template(card, "Studio weekly"));
  card.unmount();
});

// JOB-24: what the editor shows becomes a template; the editor stays with its draft.
test("a new job's draft is saved as a template from its editor", async () => {
  const card = await mountCard({ recording: "template_controls", from: "The studio template is gone" });
  await card.click(".voc-primary-action");
  const dining = card.all('[data-field-control="chips"] [data-value]').find((node) => node.textContent.trim() === "Dining Room");
  await card.click(dining);
  await card.settle(32);
  await card.click('[data-action="open-save-draft-template"]');
  assert.equal(card.root.querySelector('[data-field="overlay:name"]').value, "Dining Room");
  await card.click('[data-action="save-job-template"]');
  await card.settle(32);
  const [saved] = card.commands("save_template");
  assert.deepEqual([saved.parameters.name, saved.parameters.intent.areas, saved.parameters.automatic], ["Dining Room", [dining.dataset.value], false]);
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor", "back in the editor");
  assert.equal(card.services("create_job").length, 0, "nothing joined the queue");
  card.unmount();
});

test("a template is removed from its editor after a confirmation", async () => {
  const card = await templates("The studio has a template");
  const weekly = templateId(card, "Studio weekly");
  await card.click(template(card, "Studio weekly").querySelector('[data-action="edit-template"]'));
  await card.settle(32);
  await card.click('[data-action="remove-template"]');
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.deepEqual(card.commands("remove_template").map((message) => message.parameters), [{ template_id: weekly }]);
  assert.equal(card.all(".voc-template-name").some((node) => node.textContent.trim() === "Studio weekly"), false);
  card.unmount();
});

// Open jobs stand in the queue; the history keeps what has ended.
test("history lists finished jobs newest first and switches to cleaning runs", async () => {
  const card = await open("history", BUSY);
  const rows = card.all('[data-key="jobs"] .voc-job');
  assert.deepEqual(rows.map((row) => row.querySelector(".voc-job-title").textContent.trim()), ["Library", "Studio", "Dining Room"]);
  assert.ok(card.named('[data-key="jobs"] .voc-job', "Library").querySelector('[data-action="retry-job"]'), "a failed job can be retried");
  await card.click('[data-key="segment:runs"]');
  await card.settle(24);
  assert.equal(card.queries("get_history").length, 1);
  assert.equal(card.all(".voc-run").length, 1);
  card.unmount();
});

// JOB-25, DIA-06: a finished job says how it ended; its result is corrected from its detail page,
// and its log can be saved.
test("a finished job's result is corrected from its detail page", async () => {
  const card = await open("history", { recording: "recovery", from: "Rocky is free again" });
  const library = card.named('[data-key="jobs"] .voc-job', "Library");
  const jobId = library.dataset.key.replace(/^job:/, "");
  await card.click(library.querySelector(".voc-job-main"));
  await card.settle(32);
  assert.ok(card.root.querySelector('[data-key="result"] [data-key="outcome"]'));
  assert.equal(card.root.querySelector('[data-action="save-trace"]'), null, "a closed log keeps to one line");
  await card.click('[data-key="trace"] .voc-disclosure');
  assert.ok(card.root.querySelector('[data-key="trace"] [data-action="save-trace"]'));
  await card.click('[data-key="result"] [data-action="correct-job"]');
  assert.equal(card.root.querySelector('.voc-radio[data-value="completed"]').getAttribute("aria-checked"), "true", "the other outcome comes first");
  await card.click('[data-action="confirm-correct"]');
  await card.settle(32);
  assert.deepEqual(card.services("correct_job").map((call) => call.data), [{ job_id: jobId, outcome: "completed" }]);
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  assert.match(card.text('[data-key="result"]'), /A person reported it as cleaned\./);
  card.unmount();
});

test("history pages ask the integration for the next page", async () => {
  const card = await open("history", { recording: "long_history", from: "Rocky has cleaned six times" }, { config: { page_size: 5 } });
  assert.equal(card.all('[data-key="jobs"] .voc-job').length, 5);
  await card.click('.voc-pagination [data-action="page"][data-args*="next"]');
  await card.settle(24);
  assert.equal(card.all('[data-key="jobs"] .voc-job').length, 1);
  assert.ok(card.backend.calls.some((message) => message.type.endsWith("/jobs/list") && message.offset === 5 && message.limit === 5 && message.states?.includes("completed")));
  // LAY-16: deleting the only job of the second page leads back to the first.
  await card.click('[data-key="jobs"] .voc-job .voc-job-main');
  await card.settle(24);
  await card.click('[data-action="delete-job"]');
  await card.click('[data-action="confirm-command"]');
  await card.settle(48);
  assert.equal(card.services("delete_job").length, 1);
  assert.equal(card.all('[data-key="jobs"] .voc-job').length, 5, "the first page again");
  assert.equal(card.root.querySelector(".voc-pagination"), null, "five jobs fit one page");
  card.unmount();
});

test("diagnostics show versions, runtime and the trace when switched on", async () => {
  const card = await open("diagnostics", BUSY, { config: { views: ["queue", "diagnostics"] } });
  assert.match(card.text('[data-key="versions"]'), /Integration\s*\d+\.\d+\.\d+/);
  assert.match(card.text('[data-key="versions"]'), /API version\s*4/);
  assert.match(card.text('[data-key="versions"]'), /Live updates active/);
  assert.ok(card.all(".voc-trace li").length > 0);
  card.unmount();
});

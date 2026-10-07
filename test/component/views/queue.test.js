// The queue view driven through the built card: row commands, the queue control, the detail page,
// the editor, confirmations, the robot choice for a direct start and quick starts. Every command
// is checked at the fake integration.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");
const { SCENARIOS } = require("../../fixtures/scenarios.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

const row = (jobId) => `[data-key="job:${jobId}"]`;

test("moving a job sends one move and the queue shows the integration's new order", async () => {
  const card = await mountCard({ env });
  const node = card.root.querySelector(row("job-bathroom"));
  await card.click(`${row("job-bathroom")} [data-action="move-job"][data-args*='"up"']`);
  await card.settle(32);
  assert.deepEqual(card.services("move_job").map((call) => call.data), [{ job_id: "job-bathroom", direction: "up" }]);
  const waiting = card.all('[data-key="waiting"] .voc-job').map((element) => element.dataset.key);
  assert.deepEqual(waiting, ["job:job-bathroom", "job:job-kitchen", "job:job-bedroom"]);
  assert.equal(card.root.querySelector(row("job-bathroom")), node, "the moved row is the same node");
  card.unmount();
});

// VOI stamps jobs with microseconds; a job the card cannot read would vanish from the list while
// the panel still counts it.
test("jobs stamped with microseconds appear in the queue as the panel counts them", async () => {
  const queued = SCENARIOS.typical().seed.jobs.filter((job) => job.state === "queued");
  assert.ok(queued.every((job) => /\.\d{6}\+00:00$/.test(job.created_at)), "the household is stamped as VOI stamps it");
  const card = await mountCard({ env });
  const waiting = card.all('[data-key="waiting"] .voc-job').map((element) => element.dataset.key).sort();
  assert.deepEqual(waiting, queued.map((job) => `job:${job.job_id}`).sort());
  card.unmount();
});

test("the first row cannot move up and says why", async () => {
  const card = await mountCard({ env });
  const up = card.root.querySelector(`${row("job-kitchen")} [data-action="move-job"][data-args*='"up"']`);
  assert.equal(up.disabled, true);
  assert.ok(up.getAttribute("title"));
  card.unmount();
});

test("the queue control follows the queue mode", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.services("pause_queue").length, 1);
  assert.equal(card.text(".voc-queue-control"), "Resume queue");
  await card.click(".voc-queue-control");
  assert.equal(card.services("resume_queue").length, 1);
  card.unmount();
});

test("a row opens its detail page with the execution explanation, and Back returns", async () => {
  const card = await mountCard({ env });
  await card.click(`${row("job-bathroom")} .voc-job-main`);
  await card.settle(32);
  assert.equal(card.text("#voc-overlay-title"), "Bathroom");
  assert.ok(card.queries("get_job_execution").length >= 1);
  assert.match(card.text('[data-key="execution"]'), /Rocky/);
  assert.equal(card.root.querySelector(".voc-tabs"), null, "a page replaces the tabs");
  await card.click('[data-action="back"]');
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("a job between phases shows why it waits, and its room can be released from there", async () => {
  const card = await mountCard({ env });
  card.fake.setJob("job-kitchen", { state: "dispatching", active_attempt_id: null });
  card.fake.setReadiness("job-kitchen", { state: "blocked", reason_codes: ["room_not_released"], blocked_room_ids: ["room-kitchen"] });
  await card.settle(48);
  await card.click(`${row("job-kitchen")} .voc-job-main`);
  await card.settle(32);
  assert.match(card.text('[data-key="readiness"]'), /Kitchen/);
  assert.ok(card.root.querySelector('[data-key="readiness"] [data-action="open-release"][data-args*="room-kitchen"]'));
  card.unmount();
});

test("a new job is built in the editor and added with the chosen rooms", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-primary-action");
  assert.equal(card.text("#voc-overlay-title"), "New job");
  await card.click('[data-field-control="chips"] [data-value="room-hall"]');
  await card.click('[data-key="field:mode"] [data-value="mop"]');
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [call] = card.services("create_job");
  assert.deepEqual(call.data.areas, ["room-hall"]);
  assert.equal(call.data.mode, "mop");
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.match(card.text(".voc-notice"), /added/i);
  card.unmount();
});

test("a job for all rooms leaves the choice of rooms to the integration", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-primary-action");
  await card.click('[data-field-control="chips"] [data-value="all"]');
  assert.equal(card.root.querySelector('[data-field-control="chips"] [data-value="all"]').getAttribute("aria-selected"), "true");
  assert.ok(card.root.querySelector('[data-field-control="chips"] [data-value="room-hall"]').classList.contains("is-muted"));
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.equal(card.services("create_job")[0].data.areas, "all");
  card.unmount();
});

test("saving an empty draft stays in the editor and names what is missing", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-primary-action");
  await card.click('[data-action="save-draft"]');
  assert.ok(card.root.querySelector('[data-key="field:roomIds"] .voc-field-error'));
  assert.equal(card.services("create_job").length, 0);
  card.unmount();
});

test("leaving a changed editor asks; Escape asks the same", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-primary-action");
  await card.click('[data-field-control="chips"] [data-value="room-hall"]');
  await card.press("#voc-overlay-title", "Escape");
  assert.equal(card.text("#voc-overlay-title"), "Discard changes?");
  await card.click('[data-action="confirm-command"]');
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("editing sends only the changed field; a refusal keeps the editor open with the reason", async () => {
  const card = await mountCard({ env });
  await card.click(`${row("job-kitchen")} [data-action="edit-job"]`);
  await card.click('[data-key="field:passes"] [data-action="step-field"][data-args*=\'"step":1\']');
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.deepEqual(card.services("update_job").at(-1).data, { job_id: "job-kitchen", passes: 3 });
  await card.click(`${row("job-kitchen")} [data-action="edit-job"]`);
  await card.click('[data-key="field:passes"] [data-action="step-field"][data-args*=\'"step":-1\']');
  card.fake.failNext("update_job", { code: "service_validation_error", message: "Validation error: job_not_editable" });
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor");
  assert.match(card.text(".voc-notice--error"), /./);
  card.unmount();
});

test("cancelling the running job asks where the robot goes and sends only after confirming", async () => {
  const card = await mountCard({ env });
  await card.click(`${row("job-running")} [data-action="cancel-job"]`);
  assert.equal(card.services("cancel_job").length, 0);
  assert.equal(card.root.querySelector(".voc-overlay").getAttribute("role"), "dialog");
  const checked = () => card.root.querySelector('.voc-radios [aria-checked="true"]').dataset.value;
  assert.equal(checked(), "return_to_dock");
  await card.press('.voc-radios [aria-checked="true"]', "ArrowDown");
  assert.equal(checked(), "stay", "arrow keys move the choice");
  const actions = card.all(".voc-overlay-actions > button").map((node) => node.dataset.action);
  assert.deepEqual(actions, ["back", "confirm-cancel"], "going back on the left, the cancel on the right");
  await card.click('[data-action="confirm-cancel"]');
  await card.settle(32);
  assert.deepEqual(card.services("cancel_job").map((call) => call.data), [{ job_id: "job-running", after_cancel: "stay" }]);
  card.unmount();
});

test("ending the queue lets the running job finish by default and then shows the end", async () => {
  const card = await mountCard({ env });
  assert.equal(card.text(".voc-queue-end"), "End queue");
  await card.click(".voc-queue-end");
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:queue-end");
  assert.deepEqual(card.all(".voc-radios [role=radio]").map((node) => [node.dataset.value, node.getAttribute("aria-checked")]), [["finish", "true"], ["cancel_return", "false"], ["cancel_stay", "false"]]);
  await card.click('[data-action="confirm-end-queue"]');
  await card.settle(32);
  assert.deepEqual(card.services("end_queue").map((call) => call.data), [{}]);
  assert.equal(card.text(".voc-panel-mode"), "Queue ending · started jobs finish");
  assert.equal(card.root.querySelector(".voc-queue-end"), null);
  assert.equal(card.text(".voc-queue-control"), "Resume queue");
  card.unmount();
});

test("ending a queue without started jobs only confirms", async () => {
  const card = await mountCard({ env, scenario: "windingDown" });
  await card.click(".voc-queue-end");
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:confirm");
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.deepEqual(card.services("end_queue").map((call) => call.data), [{}]);
  assert.equal(card.text(".voc-queue-control"), "Start queue");
  card.unmount();
});

test("a new job the integration can start now is started from the editor in one step", async () => {
  const card = await mountCard({ env, scenario: "ending" });
  await card.click(".voc-primary-action");
  assert.equal(card.root.querySelector('[data-action="start-draft"]'), null, "without rooms nothing can start");
  await card.click('[data-field-control="chips"] [data-value="room-hall"]');
  await card.settle(32);
  await card.click('[data-action="start-draft"]');
  await card.settle(32);
  const [call] = card.services("create_job");
  assert.deepEqual([call.data.areas, call.data.start], [["room-hall"], true]);
  assert.match(card.text(".voc-notice"), /Start requested/);
  card.unmount();
});

test("the editor shows the settings the mode uses and offers what the robots can do", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-primary-action");
  const settings = () => card.all('[data-key="group:settings"] .voc-field').map((node) => node.dataset.key);
  assert.deepEqual(settings(), ["field:vacuumPower", "field:passes"]);
  await card.click('[data-key="field:mode"] [data-value="mop"]');
  assert.deepEqual(settings(), ["field:mopIntensity", "field:mopRoute", "field:passes"]);
  await card.click('[data-field-control="chips"] [data-value="room-kitchen"]');
  await card.settle(32);
  assert.ok(card.queries("preview_job").length > 0, "the integration is asked what it offers");
  assert.equal(card.text('[data-key="field:mopIntensity"] [aria-checked="true"]'), "Medium");
  card.unmount();
});

test("a job is saved as a template from its detail page under the name it shows", async () => {
  const card = await mountCard({ env });
  await card.click(`${row("job-bathroom")} .voc-job-main`);
  await card.click('[data-action="open-save-template"]');
  assert.equal(card.root.querySelector('[data-field="overlay:name"]').value, "Bathroom");
  await card.type('[data-field="overlay:name"]', "Bathroom weekly");
  await card.click('[data-action="save-job-template"]');
  await card.settle(32);
  assert.deepEqual(card.commands("save_job_as_template").map((message) => message.parameters), [{ job_id: "job-bathroom", name: "Bathroom weekly", automatic: false }]);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-detail", "back on the detail page");
  card.unmount();
});

test("deleting happens on the detail page, after a confirmation, and leaves the page", async () => {
  const card = await mountCard({ env });
  assert.equal(card.root.querySelector(`${row("job-kitchen")} [data-action="delete-job"]`), null, "rows keep delete one step away");
  await card.click(`${row("job-kitchen")} .voc-job-main`);
  await card.click('[data-action="delete-job"]');
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.equal(card.services("delete_job").length, 1);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.equal(card.root.querySelector(row("job-kitchen")), null);
  card.unmount();
});

test("starting directly asks which robot, or lets the integration choose", async () => {
  const card = await mountCard({ env });
  await card.click(`${row("job-kitchen")} [data-action="start-job"]`);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:start-job");
  await card.click('[data-action="start-job"][data-args*="robot-dusty"]');
  await card.settle(32);
  assert.deepEqual(card.services("start_job").map((call) => call.data), [{ job_id: "job-kitchen", robot_id: "robot-dusty" }]);
  card.unmount();
});

test("a quick start creates a job from its template", async () => {
  const card = await mountCard({ env });
  await card.click('[data-key="quick"] [data-action="create-from-template"][data-args*="template-daily"]');
  await card.settle(32);
  assert.deepEqual(card.commands("create_job_from_template").map((message) => message.parameters), [{ template_id: "template-daily" }]);
  card.unmount();
});

test("a read-only user sees the queue with every command locked and explained", async () => {
  const card = await mountCard({ env, admin: false });
  const edit = card.root.querySelector(`${row("job-kitchen")} [data-action="edit-job"]`);
  assert.equal(edit.getAttribute("aria-disabled"), "true");
  assert.ok(edit.getAttribute("title"));
  await card.click(edit);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("the showcase household is everyday use: one job cleaning and every waiting job ready", async () => {
  const card = await mountCard({ env, scenario: "showcase" });
  assert.equal(card.all('[data-key="active"] .voc-job').length, 1);
  const waiting = card.all('[data-key="waiting"] .voc-job');
  assert.equal(waiting.length, 3);
  for (const job of waiting) assert.match(job.textContent, /Ready/);
  assert.equal(card.root.querySelector('[data-key^="recovery"], [data-key="grace"], .voc-warning'), null);
  card.unmount();
});

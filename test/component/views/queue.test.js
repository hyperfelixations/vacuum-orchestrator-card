// The queue view driven through the built card: row commands, the queue control, the detail page,
// the editor, confirmations, the robot choice for a direct start and quick starts. Each command
// is the integration's next recorded one; the card then shows what the integration answered.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../../helpers/mount-card.js");
const { haError } = require("../../helpers/voi-records.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };
const at = (from, options = {}) => mountCard({ recording: "queue_controls", from, ...options });

const title = (node) => node.querySelector(".voc-job-title")?.textContent.trim();
const titles = (card, group) => card.all(`[data-key="${group}"] .voc-job`).map(title);
const rowOf = (card, name) => card.named(".voc-job", name);
const jobIdOf = (card, name) => rowOf(card, name).dataset.key.replace(/^job:/, "");
const inRow = (card, name, selector) => rowOf(card, name).querySelector(selector);
function chip(card, name) {
  const node = card.all('[data-field-control="chips"] [data-value]').find((item) => item.textContent.trim() === name);
  if (!node) throw new Error(`no room chip ${name}`);
  return node;
}

test("moving a job sends one move and the queue shows the integration's new order", async () => {
  const card = await at("Rocky cleans while two jobs wait");
  assert.deepEqual(titles(card, "waiting"), ["Dining Room", "Library"]);
  const library = jobIdOf(card, "Library");
  const node = rowOf(card, "Library");
  await card.click(inRow(card, "Library", `[data-action="move-job"][data-args*='"up"']`));
  await card.settle(32);
  assert.deepEqual(card.services("move_job").map((call) => call.data), [{ job_id: library, direction: "up" }]);
  assert.deepEqual(titles(card, "waiting"), ["Library", "Dining Room"]);
  assert.equal(rowOf(card, "Library"), node, "the moved row is the same node");
  card.unmount();
});

test("the first row cannot move up and says why", async () => {
  const card = await at("Rocky cleans while two jobs wait");
  const up = inRow(card, "Dining Room", `[data-action="move-job"][data-args*='"up"']`);
  assert.equal(up.disabled, true);
  assert.ok(up.getAttribute("title"));
  card.unmount();
});

test("the queue control follows the queue mode", async () => {
  const card = await at("The library job is next");
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.services("pause_queue").length, 1);
  assert.equal(card.text(".voc-queue-control"), "Resume queue");
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.services("resume_queue").length, 1);
  assert.equal(card.text(".voc-queue-control"), "Pause queue");
  card.unmount();
});

test("a row opens its detail page with the execution explanation, and Back returns", async () => {
  const card = await mountCard(BUSY);
  await card.click(inRow(card, "Conservatory", ".voc-job-main"));
  await card.settle(32);
  assert.equal(card.text("#voc-overlay-title"), "Conservatory");
  assert.ok(card.queries("get_job_execution").length >= 1);
  assert.match(card.text('[data-key="execution"]'), /Rocky/);
  assert.equal(card.root.querySelector(".voc-tabs"), null, "a page replaces the tabs");
  await card.click('[data-action="back"]');
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("a job waiting for its room says so, and the room can be released from there", async () => {
  const card = await mountCard(BUSY);
  await card.click(inRow(card, "Conservatory", ".voc-job-main"));
  await card.settle(32);
  assert.match(card.text('[data-key="readiness"]'), /Conservatory/);
  assert.ok(card.root.querySelector('[data-key="readiness"] [data-action="open-release"]'));
  card.unmount();
});

test("a new job is built in the editor and added with the chosen rooms", async () => {
  const card = await at("The queue runs again");
  await card.click(".voc-primary-action");
  assert.equal(card.text("#voc-overlay-title"), "New job");
  await card.click('[data-key="field:mode"] [data-value="mop"]');
  const dining = chip(card, "Dining Room").dataset.value;
  await card.click(chip(card, "Dining Room"));
  await card.settle(32);
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const [call] = card.services("create_job");
  assert.deepEqual([call.data.areas, call.data.mode], [[dining], "mop"]);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.match(card.text(".voc-notice"), /added/i);
  assert.deepEqual(titles(card, "waiting"), ["Library", "Dining Room", "Dining Room"]);
  card.unmount();
});

test("a job for all rooms leaves the choice of rooms to the integration", async () => {
  const card = await at("A mop job for the dining room waits");
  await card.click(".voc-primary-action");
  await card.click(chip(card, "All rooms"));
  assert.equal(chip(card, "All rooms").getAttribute("aria-selected"), "true");
  assert.ok(chip(card, "Studio").classList.contains("is-muted"));
  await card.settle(32);
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.equal(card.services("create_job")[0].data.all_rooms, true);
  card.unmount();
});

test("saving an empty draft stays in the editor and names what is missing", async () => {
  const card = await mountCard(BUSY);
  await card.click(".voc-primary-action");
  await card.click('[data-action="save-draft"]');
  assert.ok(card.root.querySelector('[data-key="field:roomIds"] .voc-field-error'));
  assert.equal(card.services("create_job").length, 0);
  card.unmount();
});

test("leaving a changed editor asks; Escape asks the same", async () => {
  const card = await mountCard(BUSY);
  await card.click(".voc-primary-action");
  await card.click(chip(card, "Dining Room"));
  await card.press("#voc-overlay-title", "Escape");
  assert.equal(card.text("#voc-overlay-title"), "Discard changes?");
  await card.click('[data-action="confirm-command"]');
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("a refusal keeps the editor open with the reason; saving again sends only the changed field", async () => {
  const card = await at("A job for every room waits");
  const library = jobIdOf(card, "Library");
  await card.click(inRow(card, "Library", '[data-action="edit-job"]'));
  await card.click('[data-key="field:passes"] [data-action="step-field"][data-args*=\'"step":1\']');
  await card.settle(32);
  card.backend.failNext({ service: "update_job" }, haError.serviceValidation("job_not_editable"));
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor");
  assert.match(card.text(".voc-notice--error"), /./);
  assert.deepEqual(card.queries("validate").map((message) => message.parameters), [{ command: "update_job", data: { job_id: library, passes: 2 } }], "the integration checks the change first");
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.deepEqual(card.services("update_job").at(-1).data, { job_id: library, passes: 2 });
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("cancelling the running job asks where the robot goes and sends only after confirming", async () => {
  const card = await at("The queue ends after the started job");
  const studio = jobIdOf(card, "Studio");
  await card.click(inRow(card, "Studio", '[data-action="cancel-job"]'));
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
  assert.deepEqual(card.services("cancel_job").map((call) => call.data), [{ job_id: studio, after_cancel: "stay" }]);
  card.unmount();
});

test("ending the queue lets the running job finish by default and then shows the end", async () => {
  const card = await at("The studio template made a job");
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
  const card = await mountCard({ recording: "queue_end", from: "The queue waits for work" });
  await card.click(".voc-queue-end");
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:confirm");
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.deepEqual(card.services("end_queue").map((call) => call.data), [{}]);
  assert.equal(card.text(".voc-queue-control"), "Start queue");
  card.unmount();
});

test("a new job the integration can start now is started from the editor in one step", async () => {
  const card = await at("Rocky is back at its dock");
  await card.click(".voc-primary-action");
  assert.equal(card.root.querySelector('[data-action="start-draft"]'), null, "without rooms nothing can start");
  await card.click(chip(card, "Studio"));
  await card.settle(32);
  await card.click('[data-action="start-draft"]');
  await card.settle(32);
  const [call] = card.services("create_job");
  assert.deepEqual([call.data.areas.length, call.data.start], [1, true]);
  assert.match(card.text(".voc-notice"), /Start requested/);
  card.unmount();
});

test("the editor shows the settings the mode uses and offers what the robots can do", async () => {
  const card = await mountCard(BUSY);
  await card.click(".voc-primary-action");
  const settings = () => card.all('[data-key="group:settings"] .voc-field').map((node) => node.dataset.key);
  await card.click(chip(card, "Dining Room"));
  await card.settle(32);
  assert.deepEqual(settings(), ["field:vacuumPower", "field:passes"]);
  await card.click('[data-key="field:mode"] [data-value="mop"]');
  await card.settle(32);
  assert.deepEqual(settings(), ["field:mopIntensity", "field:mopRoute", "field:passes"]);
  assert.ok(card.queries("preview_job").length > 0, "the integration is asked what it offers");
  assert.equal(card.text('[data-key="field:mopIntensity"] [aria-checked="true"]'), "Medium");
  card.unmount();
});

test("a job is saved as a template from its detail page under the name it shows", async () => {
  const card = await at("The library job runs twice");
  const library = jobIdOf(card, "Library");
  await card.click(inRow(card, "Library", ".voc-job-main"));
  await card.settle(32);
  await card.click('[data-action="open-save-template"]');
  assert.equal(card.root.querySelector('[data-field="overlay:name"]').value, "Library");
  await card.type('[data-field="overlay:name"]', "Library twice");
  await card.click('[data-action="save-job-template"]');
  await card.settle(32);
  assert.deepEqual(card.commands("save_job_as_template").map((message) => message.parameters), [{ job_id: library, name: "Library twice", automatic: false }]);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-detail", "back on the detail page");
  card.unmount();
});

test("deleting happens on the detail page, after a confirmation, and leaves the page", async () => {
  const card = await at("The library job is a template");
  // A job for every room names the rooms the integration resolved it to.
  const EVERY_ROOM = "Dining Room, Studio, Library, Conservatory";
  const everywhere = rowOf(card, EVERY_ROOM);
  assert.equal(everywhere.querySelector('[data-action="delete-job"]'), null, "rows keep delete one step away");
  await card.click(everywhere.querySelector(".voc-job-main"));
  await card.settle(32);
  await card.click('[data-action="delete-job"]');
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.equal(card.services("delete_job").length, 1);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.equal(card.all(".voc-job").find((node) => title(node) === EVERY_ROOM), undefined);
  card.unmount();
});

test("starting directly asks which robot, or lets the integration choose", async () => {
  const card = await mountCard({ recording: "robot_choice", from: "Either robot can start the dining room" });
  const dining = jobIdOf(card, "Dining Room");
  await card.click(inRow(card, "Dining Room", '[data-action="start-job"]'));
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:start-job");
  const dusty = card.all('.voc-overlay [data-action="start-job"]').find((node) => /Dusty/.test(node.textContent));
  await card.click(dusty);
  await card.settle(32);
  assert.deepEqual(card.services("start_job").map((call) => call.data.job_id), [dining]);
  card.unmount();
});

test("a quick start creates a job from its template", async () => {
  const card = await at("The job for every room is gone");
  const quick = card.all('[data-key="quick"] [data-action="create-from-template"]').find((node) => /Mop the studio/.test(node.textContent));
  await card.click(quick);
  await card.settle(32);
  assert.equal(card.commands("create_job_from_template").length, 1);
  card.unmount();
});

test("a read-only user sees the queue with every command locked and explained", async () => {
  const card = await mountCard({ ...BUSY, admin: false });
  const edit = inRow(card, "Conservatory", '[data-action="edit-job"]');
  assert.equal(edit.getAttribute("aria-disabled"), "true");
  assert.ok(edit.getAttribute("title"));
  await card.click(edit);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("the busy afternoon is everyday use: one job cleaning, three waiting, nothing to recover", async () => {
  const card = await mountCard(BUSY);
  assert.deepEqual(titles(card, "active"), ["Studio"]);
  assert.equal(titles(card, "waiting").length, 3);
  assert.equal(card.root.querySelector('[data-key^="recovery"], [data-key="grace"], .voc-warning'), null);
  card.unmount();
});

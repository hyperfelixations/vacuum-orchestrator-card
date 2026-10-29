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
// A row's further action, from its menu (UI-32).
const fromMenu = (card, name, selector) => card.menuItem(rowOf(card, name), selector);
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
  await card.click(await fromMenu(card, "Library", `[data-action="move-job"][data-args*='"up"']`));
  await card.settle(32);
  assert.deepEqual(card.services("move_job").map((call) => call.data), [{ job_id: library, direction: "up" }]);
  assert.deepEqual(titles(card, "waiting"), ["Library", "Dining Room"]);
  assert.equal(rowOf(card, "Library"), node, "the moved row is the same node");
  card.unmount();
});

test("the first row cannot move up and says why", async () => {
  const card = await at("Rocky cleans while two jobs wait");
  const up = await fromMenu(card, "Dining Room", `[data-action="move-job"][data-args*='"up"']`);
  assert.equal(up.getAttribute("aria-disabled"), "true");
  assert.ok(up.getAttribute("title"));
  await card.click(up);
  assert.equal(card.text(".voc-notice--info .voc-notice-text"), up.getAttribute("title"), "tapped, it says why");
  assert.deepEqual(card.commands("move_job"), []);
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

test("a row opens its detail page with the waiting reason on three axes, and Back returns", async () => {
  const card = await mountCard(BUSY);
  await card.click(inRow(card, "Conservatory", ".voc-job-main"));
  await card.settle(32);
  assert.equal(card.text("#voc-overlay-title"), "Conservatory");
  assert.ok(card.queries("get_job_execution").length >= 1);
  assert.equal(card.text('[data-key="axis:robots"] li'), "Rocky does not reach this room");
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
  assert.ok(chip(card, "Studio").classList.contains("is-included"), "a room all rooms takes in shows as included");
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
  assert.equal(card.text("#voc-dialog-title"), "Discard changes?");
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor", "the editor stays below the question");
  await card.click('[data-action="confirm-command"]');
  assert.equal(card.root.querySelector(".voc-overlay, .voc-dialog"), null);
  card.unmount();
});

test("a refusal keeps the editor open with the reason; saving again sends only the changed field", async () => {
  const card = await at("A job for every room waits");
  const library = jobIdOf(card, "Library");
  await card.click(await fromMenu(card, "Library", '[data-action="edit-job"]'));
  await card.click('[data-key="field:passes"] [data-action="step-field"][data-args*=\'"step":1\']');
  await card.settle(32);
  card.backend.failNext({ service: "update_job" }, haError.serviceValidation("job_not_editable"));
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor");
  assert.match(card.text(".voc-notice--error"), /./);
  assert.deepEqual(card.commands("hold_job").map((message) => message.parameters), [{ job_id: library, purpose: "edit" }], "the editor holds the job first (JOB-19)");
  const hold = card.queries("validate")[0]?.parameters.data.hold_id;
  assert.ok(hold);
  assert.deepEqual(card.queries("validate").map((message) => message.parameters), [{ command: "update_job", data: { job_id: library, hold_id: hold, passes: 2 } }], "the integration checks the change first");
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  assert.deepEqual(card.services("update_job").at(-1).data, { job_id: library, hold_id: hold, passes: 2 });
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

// UI-16: the editor waits for its save with every control locked; Back and Escape wait too.
test("an editor waits for its save, locked, and leaves with the answer", async () => {
  const card = await at("A job for every room waits");
  await card.click(await fromMenu(card, "Library", '[data-action="edit-job"]'));
  await card.click('[data-key="field:passes"] [data-action="step-field"][data-args*=\'"step":1\']');
  await card.settle(32);
  const release = card.backend.hold();
  await card.click('[data-action="save-draft"]');
  await card.settle(32);
  const page = card.root.querySelector('[data-key="overlay:job-editor"]');
  assert.equal(page.getAttribute("aria-busy"), "true");
  assert.equal(page.querySelector("fieldset.voc-layer").disabled, true);
  await card.press('[data-key="overlay:job-editor"] [data-action="back"]', "Escape");
  await card.click('[data-key="overlay:job-editor"] [data-action="back"]');
  assert.equal(card.root.querySelector(".voc-overlay")?.dataset.key, "overlay:job-editor", "the page waits for its answer");
  release();
  await card.settle(32);
  assert.equal(card.services("update_job").length, 1);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

test("cancelling the running job asks where the robot goes and sends only after confirming", async () => {
  const card = await at("The queue ends after the started job");
  const studio = jobIdOf(card, "Studio");
  await card.click(inRow(card, "Studio", '[data-action="cancel-job"]'));
  assert.equal(card.services("cancel_job").length, 0);
  assert.equal(card.root.querySelector(".voc-dialog").getAttribute("role"), "dialog");
  const checked = () => card.root.querySelector('.voc-radios [aria-checked="true"]').dataset.value;
  assert.equal(checked(), "return_to_dock");
  await card.press('.voc-radios [aria-checked="true"]', "ArrowDown");
  assert.equal(checked(), "stay", "arrow keys move the choice");
  const actions = card.all(".voc-dialog-actions > button").map((node) => node.dataset.action);
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
  assert.equal(card.root.querySelector(".voc-dialog").dataset.key, "overlay:queue-end");
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
  assert.equal(card.root.querySelector(".voc-dialog").dataset.key, "overlay:confirm");
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
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-detail", "back on the detail page");
  card.unmount();
});

// A job for every room names the rooms the integration resolved it to.
const EVERY_ROOM = "Dining Room, Studio, Library, Conservatory";

async function openDeletion(card, name) {
  await card.click(rowOf(card, name).querySelector(".voc-job-main"));
  await card.settle(32);
  await card.click('[data-action="delete-job"]');
  await card.settle(32);
}

// JOB-22, QUE-11: the dialog holds the waiting job; keeping the job gives the hold back, which
// restarts its start delay, and deleting sends the hold along.
test("deleting a waiting job is confirmed under a hold; keeping it gives the hold back", async () => {
  const kept = await at("The library job is a template");
  const everywhere = jobIdOf(kept, EVERY_ROOM);
  assert.equal(rowOf(kept, EVERY_ROOM).querySelector('[data-action="delete-job"]'), null, "rows keep delete one step away");
  await openDeletion(kept, EVERY_ROOM);
  assert.deepEqual(kept.commands("hold_job").map((message) => message.parameters), [{ job_id: everywhere, purpose: "confirm" }]);
  await kept.click('.voc-dialog [data-action="back"]');
  await kept.settle(32);
  assert.deepEqual(kept.commands("release_job_hold").map((message) => Object.keys(message.parameters)), [["hold_id"]]);
  assert.equal(kept.root.querySelector(".voc-dialog"), null);
  assert.equal(kept.root.querySelector(".voc-overlay").dataset.key, "overlay:job-detail", "keeping the job stays on its page");
  kept.unmount();

  const card = await at("The job for every room stays");
  await openDeletion(card, EVERY_ROOM);
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  const [hold] = card.commands("hold_job");
  assert.deepEqual(card.services("delete_job").map((call) => Object.keys(call.data).sort()), [["hold_id", "job_id"]]);
  assert.equal(card.services("delete_job")[0].data.job_id, hold.parameters.job_id);
  assert.equal(card.root.querySelector(".voc-overlay, .voc-dialog"), null, "deleting leaves the page");
  assert.equal(card.all(".voc-job").find((node) => title(node) === EVERY_ROOM), undefined);
  card.unmount();
});

// UI-16: the confirmation stays until the answer, locked; Escape waits too.
test("a confirmation waits for its answer, locked, and leaves with it", async () => {
  const card = await at("The job for every room stays");
  await openDeletion(card, EVERY_ROOM);
  const release = card.backend.hold();
  await card.click('[data-action="confirm-command"]');
  const dialog = card.root.querySelector('[data-key="overlay:confirm"]');
  assert.equal(dialog.getAttribute("aria-busy"), "true");
  assert.ok([...dialog.querySelectorAll("button")].every((button) => button.matches(":disabled")), "every answer waits");
  await card.press('[data-key="overlay:confirm"] [data-action="back"]', "Escape");
  assert.ok(card.root.querySelector('[data-key="overlay:confirm"]'), "Escape waits for the answer");
  release();
  await card.settle(32);
  assert.equal(card.services("delete_job").length, 1);
  assert.equal(card.root.querySelector(".voc-overlay, .voc-dialog"), null);
  card.unmount();
});

// UI-17: a lost answer leaves the dialog with a warning; nothing is sent again.
test("a confirmation without an answer says the result is unknown and stays", async () => {
  const card = await at("The job for every room stays");
  await openDeletion(card, EVERY_ROOM);
  card.backend.hold();
  await card.click('[data-action="confirm-command"]');
  card.backend.disconnect();
  await card.settle(32);
  const dialog = card.root.querySelector('[data-key="overlay:confirm"]');
  assert.equal(dialog.hasAttribute("aria-busy"), false);
  assert.equal(card.text('.voc-dialog [data-key="invalid"].voc-notice--warning'), "No answer arrived – the result is unknown. The view is being refreshed.");
  assert.equal(card.services("delete_job").length, 1, "nothing is sent again");
  card.unmount();
});

test("a deletion confirmed after its hold lapsed asks again under a new hold", async () => {
  const card = await mountCard({ recording: "job_hold", from: "The job waits for two rooms" });
  await openDeletion(card, "Dining Room, Studio");
  card.backend.play();
  await card.settle(32);
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-dialog")?.dataset.key, "overlay:confirm", "the dialog asks again");
  assert.match(card.text('.voc-dialog [data-key="invalid"]'), /protection of this job has ended/);
  assert.equal(card.commands("hold_job").length, 2, "under a new hold");
  await card.click('[data-action="confirm-command"]');
  await card.settle(32);
  assert.equal(card.services("delete_job").length, 2);
  assert.equal(card.root.querySelector(".voc-overlay, .voc-dialog"), null);
  card.unmount();
});

test("starting directly asks which robot, or lets the integration choose", async () => {
  const card = await mountCard({ recording: "robot_choice", from: "Either robot can start the dining room" });
  const dining = jobIdOf(card, "Dining Room");
  await card.click(inRow(card, "Dining Room", '[data-action="start-job"]'));
  assert.equal(card.root.querySelector(".voc-dialog").dataset.key, "overlay:start-job");
  assert.deepEqual(card.all(".voc-dialog-actions > button").map((node) => node.dataset.action), ["back"], "the choice can be left from its footer");
  const choices = card.all('.voc-dialog [data-action="start-job"]');
  assert.deepEqual(choices.map((node) => [node.querySelector(".voc-choice-label").textContent.trim(), node.querySelector(".voc-choice-note").textContent.trim()]), [["Choose automatically", "Vacuum Orchestrator picks a suitable robot."], ["Rocky", "Can take it now"], ["Dusty", "Can take it now"]], "each choice is one row with its reason");
  const dusty = choices.find((node) => /Dusty/.test(node.textContent));
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

// UI-22: read only is said once in the subtitle instead of on every greyed-out control. The
// integration says who may command (ACT-07).
test("a read-only user sees the queue without commands and is told why once", async () => {
  const card = await mountCard(Object.freeze({ recording: "read_only_user", from: "The card opens for a read-only user" }));
  assert.deepEqual(titles(card, "waiting"), ["Studio", "Library"]);
  assert.equal(inRow(card, "Library", ".voc-menu-button"), null, "a row with nothing to manage has no menu");
  assert.equal(card.root.querySelector('[data-action="create-job"], [data-action="start-job"], [aria-disabled="true"]'), null);
  assert.match(card.text(".voc-subtitle"), /Read only for your account/);
  card.unmount();
});

// UI-14: the card serves every household member, administrator or not.
test("a user who is no administrator commands like one", async () => {
  const card = await mountCard({ ...BUSY, admin: false });
  assert.ok(inRow(card, "Dining Room", ".voc-menu-button"));
  assert.ok(card.root.querySelector('[data-action="create-job"]'));
  assert.doesNotMatch(card.text(".voc-subtitle") ?? "", /Read only/);
  card.unmount();
});

test("the busy afternoon is everyday use: one job cleaning, three waiting, nothing to recover", async () => {
  const card = await mountCard(BUSY);
  assert.deepEqual(titles(card, "active"), ["Studio"]);
  assert.equal(titles(card, "waiting").length, 3);
  assert.equal(card.root.querySelector('[data-key^="recovery"], [data-key="grace"], .voc-warning'), null);
  card.unmount();
});

// UI-32, WAI-ARIA APG "Menu Button": the row's menu holds every further action of the job, the
// destructive one last; Escape or a click beside it closes it, and an item runs its action. Focus
// follows in the browser (test/browser/accessibility).
test("a row's menu holds the job's further actions, closes with Escape or a click beside it and runs its item", async () => {
  const card = await at("A job for every room waits");
  const button = () => inRow(card, "Library", ".voc-menu-button");
  await card.click(button());
  assert.deepEqual([button().getAttribute("aria-expanded"), button().getAttribute("aria-controls")], ["true", card.root.querySelector('[role="menu"]').id]);
  assert.deepEqual(card.all('[role="menu"] [role="menuitem"]').map((node) => node.textContent.trim()), ["Move up", "Move down", "Edit", "Save as template", "Delete"]);
  await card.press('[role="menu"] [role="menuitem"]', "Escape");
  assert.equal(card.root.querySelector('[role="menu"]'), null);
  await card.click(button());
  await card.click(".voc-group-title");
  assert.equal(card.root.querySelector('[role="menu"]'), null, "a click beside the menu closes it");
  await card.click(button());
  await card.click(card.named(".voc-job", "Library").querySelector('[role="menuitem"][data-action="edit-job"]'));
  assert.equal(card.text("#voc-overlay-title"), "Edit job");
  card.unmount();
});

// REL-04, REL-06, REL-07, REL-08: the row's release lists both locked rooms; each gets its own kind,
// the studio four hours by quick choice, and one command releases both.
test("a job's release frees each of its locked rooms in its own way with one command", async () => {
  const card = await mountCard({ recording: "start_delay", from: "The job waits for its two rooms" });
  await card.click(inRow(card, "Dining Room, Studio", '[data-action="open-release"]'));
  const rows = card.all(".voc-release-row");
  assert.deepEqual(rows.map((row) => row.querySelector(".voc-release-room").textContent.trim()), ["Dining Room", "Studio"]);
  const [dining, studio] = rows.map((row) => row.dataset.key.replace(/^release:/, ""));
  await card.click('[data-key="field:release:0:kind"] [data-value="once"]');
  await card.click('[data-key="field:release:1:kind"] [data-value="timed"]');
  await card.click('[data-key="field:release:1:quick"] [data-value="240"]');
  assert.equal(card.root.querySelector('[data-field="release:1:hours"]').value, "4");
  await card.click('[data-action="release-room"]');
  await card.settle(32);
  assert.deepEqual(card.commands("release_rooms").map((message) => message.parameters), [{ grants: [{ room: dining, kind: "once" }, { room: studio, kind: "timed", duration_seconds: 14400 }] }]);
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  card.unmount();
});

// JOB-19, QUE-11: leaving the editor of a waiting job gives its hold back. The integration says
// the held job cannot be deleted; the editor holding it still may, with its hold.
test("leaving a waiting job's editor gives its hold back", async () => {
  const card = await mountCard({ recording: "edit_hold", from: "A dining room job waits" });
  await card.click(await fromMenu(card, "Dining Room", '[data-action="edit-job"]'));
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-editor");
  const [held] = card.commands("hold_job");
  assert.equal(held.parameters.purpose, "edit");
  const remove = card.root.querySelector('.voc-overlay-actions [data-action="delete-job"]');
  assert.deepEqual([remove.disabled, remove.getAttribute("aria-disabled")], [false, null], "its own hold does not keep it from deleting");
  await card.click('[data-action="back"]');
  await card.settle(32);
  assert.equal(card.commands("release_job_hold").length, 1);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  card.unmount();
});

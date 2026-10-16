// Every control's action becomes UI navigation or exactly one integration command with the
// integration's parameters. Destructive steps ask first; a form asks the integration to check its
// input first and keeps the errors at its fields; a refusal becomes the card's notice.
// Boundary: the router with a recording session stub and real UI state.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../helpers/voi-records.js");

// An overlay as it shows, without the id it has while open.
const shown = ({ id: _id, ...overlay }) => overlay;
// An answer the test gives when it chooses.
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

// The integration's verdict as the session hands it on: dotted paths and codes.
const rejects = (...errors) => ({ valid: false, errors: errors.map(([path, code]) => ({ path, code })) });
const ACCEPTS = Object.freeze({ valid: true, errors: [] });

async function setup({ config = {}, answer = () => ({ ok: true, data: null }), verdict = () => ACCEPTS, model: extra = {}, slots = {}, isDialog = (kind) => ["confirm", "cancel-job", "queue-end", "start-job"].includes(kind) } = {}) {
  const { createActionRouter } = await import("../../../src/controllers/runtime/action-router.js");
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const { normalizeRoom } = await import("../../../src/domain/rooms.js");
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  const { normalizeTemplate } = await import("../../../src/domain/templates.js");
  const { normalizeQueuePage } = await import("../../../src/domain/queue.js");
  const commands = [];
  const checked = [];
  const session = {
    validate: async (operation, parameters) => {
      checked.push({ operation, parameters: JSON.parse(JSON.stringify(parameters)) });
      const result = verdict(operation, parameters);
      return result.ok === false ? result : { ok: true, data: result };
    },
    command: async (operation, parameters, options) => {
      commands.push({ operation, parameters: JSON.parse(JSON.stringify(parameters)), target: options.target, invalidates: options.invalidates });
      return answer(operation);
    },
    probe: () => commands.push({ operation: "probe" }),
  };
  const ui = createUIState();
  const navigated = [];
  const model = {
    slots: {
      queue: { data: normalizeQueuePage(W.wireQueuePage([W.wireJob({ job_id: "job-1", name: "Library" })], { mode: "running", queue_grace_seconds: 900, total: 1 })) },
      rooms: { data: { items: [normalizeRoom(W.wireRoom({ room_id: "room-library", name: "Library" }))] } },
      robots: { data: { items: [normalizeRobot(W.wireRobot({ robot_id: "robot-rocky", configuration: { roles: { battery: "reg-rocky-battery", status: "reg-rocky-status" } } })), normalizeRobot(W.wireRobot({ robot_id: "robot-dusty", name: "Dusty" }))] } },
      templates: { data: { items: [normalizeTemplate(W.wireTemplate({ template_id: "template-1" }))] } },
      openJobs: { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-run", state: "running" }))] } },
      ...slots,
    },
    robotsLive: { "robot-rocky": { roles: { battery: { entityId: "sensor.rocky_battery" } } } },
    ...extra,
  };
  const router = createActionRouter({ ui, getSession: () => session, getModel: () => model, getConfig: () => config, platform: { navigate: (path) => navigated.push(path) }, isDialog });
  return { router, ui, commands, checked, navigated };
}

test("all rooms in the editor excludes single rooms, and a single room ends all rooms", async () => {
  const { router, ui } = await setup();
  router.handle("create-job");
  const rooms = () => [ui.overlay.draft.allRooms, [...ui.overlay.draft.roomIds]];
  router.handle("toggle-value", { field: "roomIds", value: "room-library" });
  router.handle("toggle-value", { field: "roomIds", value: "all" });
  assert.deepEqual(rooms(), [true, []]);
  router.handle("toggle-value", { field: "roomIds", value: "room-library" });
  assert.deepEqual(rooms(), [false, ["room-library"]]);
  router.handle("toggle-value", { field: "roomIds", value: "all" });
  router.handle("toggle-value", { field: "roomIds", value: "all" });
  assert.deepEqual(rooms(), [false, []]);
});

test("queue control sends the command its mode asks for", async () => {
  const { router, commands } = await setup();
  await router.handle("queue-control");
  assert.deepEqual(commands.map((command) => [command.operation, command.target]), [["pause_queue", "queue"]]);
});

test("a row command sends the job and its target", async () => {
  const { router, commands } = await setup();
  await router.handle("move-job", { jobId: "job-1", direction: "up" });
  await router.handle("retry-job", { jobId: "job-9" });
  assert.deepEqual(commands.map((command) => [command.operation, command.parameters, command.target]), [
    ["move_job", { job_id: "job-1", direction: "up" }, "job:job-1"],
    ["retry_job", { job_id: "job-9" }, "job:job-9"],
  ]);
});

test("with several robots a direct start asks which robot; the choice sends it along", async () => {
  const { router, ui, commands } = await setup();
  router.handle("start-job", { jobId: "job-1" });
  assert.equal(ui.overlay.kind, "start-job");
  assert.equal(commands.length, 0);
  await router.handle("start-job", { jobId: "job-1", robotId: "robot-dusty" });
  assert.deepEqual(commands[0].parameters, { job_id: "job-1", robot_id: "robot-dusty" });
  assert.equal(ui.overlay, null, "the robot choice closes after the start");
  await router.handle("start-job", { jobId: "job-1", choose: false });
  assert.deepEqual(commands[1].parameters, { job_id: "job-1" }, "letting the integration choose sends no robot");
});

test("cancelling asks first, and only the confirmation sends", async () => {
  const { router, ui, commands } = await setup();
  router.handle("cancel-job", { jobId: "job-1" });
  assert.equal(ui.overlay.kind, "confirm");
  assert.deepEqual([ui.overlay.titleKey, ui.overlay.icon], ["confirm.cancelJob.title", "mdi:stop-circle-outline"]);
  assert.equal(commands.length, 0);
  await router.handle("confirm-command");
  assert.deepEqual(commands.map((command) => command.operation), ["cancel_job"]);
  assert.equal(ui.overlay, null);
});

test("cancelling a started job asks where its robot goes; returning home is the default", async () => {
  const { router, ui, commands } = await setup({ slots: { openJobs: { data: { jobs: [] } } } });
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  const running = { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-run", state: "running" }))] } };
  const started = await setup({ slots: { openJobs: running } });
  started.router.handle("cancel-job", { jobId: "job-run" });
  assert.deepEqual(shown(started.ui.overlay), { kind: "cancel-job", jobId: "job-run", afterCancel: "return_to_dock" });
  started.router.handle("set-field", { field: "overlay:afterCancel", value: "stay" });
  await started.router.handle("confirm-cancel");
  assert.deepEqual(started.commands[0], { operation: "cancel_job", parameters: { job_id: "job-run", after_cancel: "stay" }, target: "job:job-run", invalidates: ["queue", "openJobs", "jobLog", "job", "execution", "trace"] });
  assert.equal(started.ui.overlay, null);
  await started.router.handle("confirm-cancel");
  assert.equal(started.commands.length, 1, "outside its page nothing is sent");
  router.handle("cancel-job", { jobId: "job-1" });
  assert.equal(ui.overlay.kind, "confirm", "a waiting job is only withdrawn");
  assert.equal(commands.length, 0);
  const staying = normalizeRobot(W.wireRobot({ capabilities: { ...W.wireRobot().capabilities, supports: { stop: true, return_to_dock: false, pause: false } } }));
  const plain = await setup({ slots: { openJobs: running, robots: { data: { items: [staying] } } } });
  plain.router.handle("cancel-job", { jobId: "job-run" });
  assert.equal(plain.ui.overlay.kind, "confirm", "without a robot that can return there is nothing to choose");
});

test("ending the queue asks how started jobs end, and only confirms without any", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const idle = await setup({ slots: { openJobs: { data: { jobs: [] } } } });
  idle.router.handle("end-queue");
  assert.deepEqual([idle.ui.overlay.kind, idle.ui.overlay.command.operation, idle.ui.overlay.tone], ["confirm", "end_queue", "primary"]);
  await idle.router.handle("confirm-command");
  assert.deepEqual([idle.commands[0].operation, idle.commands[0].parameters, idle.commands[0].target], ["end_queue", {}, "queue"]);
  const running = await setup({ slots: { openJobs: { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-run", state: "dispatching" }))] } } } });
  running.router.handle("end-queue");
  assert.deepEqual(shown(running.ui.overlay), { kind: "queue-end", choice: "finish" });
  running.router.handle("set-field", { field: "overlay:choice", value: "cancel_later" });
  await running.router.handle("confirm-end-queue");
  assert.equal(running.commands.length, 0, "an unknown choice sends nothing");
  running.router.handle("set-field", { field: "overlay:choice", value: "cancel_return" });
  await running.router.handle("confirm-end-queue");
  assert.deepEqual(running.commands[0].parameters, { running_jobs: "cancel", after_cancel: "return_to_dock" });
  const quick = await setup({ config: { confirm_destructive: false }, slots: { openJobs: { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-run", state: "running" }))] } } } });
  await quick.router.handle("end-queue");
  assert.deepEqual([quick.commands[0].operation, quick.commands[0].parameters, quick.ui.overlay], ["end_queue", {}, null], "without confirmations the integration's default applies");
});

test("the setup opens as a page, and a setup step can switch the view", async () => {
  const { router, ui } = await setup();
  router.handle("open-setup");
  assert.deepEqual(shown(ui.overlay), { kind: "setup-guide" });
  router.handle("show-view", { view: "rooms" });
  assert.deepEqual([ui.snapshot.view, ui.overlay], ["rooms", null]);
});

test("a robot is sent home through its own command", async () => {
  const { router, ui, commands } = await setup();
  await router.handle("return-robot", { robotId: "robot-rocky" });
  assert.deepEqual(commands[0], { operation: "return_robot", parameters: { robot_id: "robot-rocky" }, target: "robot:robot-rocky", invalidates: ["robots"] });
  assert.equal(ui.snapshot.notice.messageKey, "notice.robotReturning");
});

test("confirm_destructive: false sends destructive commands at once", async () => {
  const { router, ui, commands } = await setup({ config: { confirm_destructive: false } });
  await router.handle("delete-job", { jobId: "job-1" });
  assert.equal(ui.overlay, null);
  assert.deepEqual(commands.map((command) => command.operation), ["delete_job"]);
});

const HELD = (operation) => (operation === "hold_job" ? { ok: true, data: { hold_id: "hold-1" } } : { ok: true, data: null });

test("deleting from the editor opened on the detail page leaves both pages", async () => {
  const { router, ui, commands } = await setup({ answer: HELD });
  router.handle("open-job", { jobId: "job-1" });
  router.handle("edit-job", { jobId: "job-1" });
  await router.handle("delete-job", { jobId: "job-1" });
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => overlay.kind), ["job-detail", "job-editor", "confirm"]);
  await router.handle("confirm-command");
  assert.deepEqual(ui.snapshot.overlays, []);
  assert.deepEqual(commands.at(-1).parameters, { job_id: "job-1", hold_id: "hold-1" });
});

// JOB-22, QUE-11: the dialog holds a waiting job; leaving it releases the hold, which restarts
// the start delay, and deleting sends the hold along.
test("a waiting job is held while its deletion is confirmed", async () => {
  const { router, ui, commands } = await setup({ answer: HELD });
  router.handle("open-job", { jobId: "job-1" });
  await router.handle("delete-job", { jobId: "job-1" });
  assert.deepEqual(commands.map((command) => [command.operation, command.parameters, command.target]), [["hold_job", { job_id: "job-1", purpose: "confirm" }, "job:job-1"]]);
  assert.equal(ui.overlay.holdId, "hold-1");
  router.handle("back");
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => overlay.kind), ["job-detail"]);
  assert.deepEqual(commands.at(-1), { operation: "release_job_hold", parameters: { hold_id: "hold-1" }, target: "hold:hold-1", invalidates: ["queue", "openJobs", "jobLog", "job", "execution", "trace"] });
  await router.handle("delete-job", { jobId: "job-1" });
  await router.handle("confirm-command");
  assert.deepEqual(commands.slice(-2).map((command) => [command.operation, command.parameters]), [["hold_job", { job_id: "job-1", purpose: "confirm" }], ["delete_job", { job_id: "job-1", hold_id: "hold-1" }]]);
  assert.equal(ui.overlay, null);
});

test("a finished job is deleted without a hold, and a hold that comes after its dialog is given back", async () => {
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const done = { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-done", state: "succeeded" }))] } };
  const history = await setup({ answer: HELD, slots: { jobLog: done } });
  await history.router.handle("delete-job", { jobId: "job-done" });
  await history.router.handle("confirm-command");
  assert.deepEqual(history.commands.map((command) => [command.operation, command.parameters]), [["delete_job", { job_id: "job-done" }]]);
  const late = deferred();
  const slow = await setup({ answer: (operation) => (operation === "hold_job" ? late.promise : { ok: true, data: null }) });
  const holding = slow.router.handle("delete-job", { jobId: "job-1" });
  slow.router.handle("back");
  assert.equal(slow.ui.overlay, null, "the dialog can be left before the hold arrives");
  late.resolve({ ok: true, data: { hold_id: "hold-late" } });
  await holding;
  assert.deepEqual(slow.commands.map((command) => [command.operation, command.parameters]), [["hold_job", { job_id: "job-1", purpose: "confirm" }], ["release_job_hold", { hold_id: "hold-late" }]]);
});

test("a deletion whose hold lapsed asks again under a new hold, beside the integration's reason", async () => {
  const expired = { ok: false, code: "hold_expired", detail: null, channel: "service" };
  let holds = 0;
  let deletions = 0;
  const answer = (operation) => {
    if (operation === "hold_job") return { ok: true, data: { hold_id: `hold-${++holds}` } };
    return ++deletions === 1 ? expired : { ok: true, data: null };
  };
  const { router, ui, commands } = await setup({ answer });
  router.handle("open-job", { jobId: "job-1" });
  await router.handle("delete-job", { jobId: "job-1" });
  await router.handle("confirm-command");
  assert.deepEqual([ui.overlay.kind, ui.overlay.failure, ui.overlay.holdId, ui.snapshot.notice], ["confirm", expired, "hold-2", null]);
  await router.handle("confirm-command");
  assert.deepEqual(commands.map((command) => [command.operation, command.parameters.hold_id]), [["hold_job", undefined], ["delete_job", "hold-1"], ["hold_job", undefined], ["delete_job", "hold-2"]]);
  assert.equal(ui.overlay, null);
});

// UI-16: a command belongs to the page or dialog it was sent from; it waits for the answer with
// every control locked and, on success, leaves only while it is still on top.
test("a confirmation waits for its answer, locked, and keeps a refusal itself", async () => {
  const refusal = { ok: false, code: "job_not_deletable", detail: null, channel: "service" };
  const answers = [deferred(), deferred()];
  const { router, ui, commands } = await setup({ config: {}, answer: () => answers[commands.length - 1].promise, slots: { jobLog: { data: { jobs: [] } } } });
  router.handle("open-job", { jobId: "job-run" });
  router.handle("delete-job", { jobId: "job-run" });
  const sending = router.handle("confirm-command");
  assert.deepEqual([ui.overlay.kind, ui.overlay.busy], ["confirm", true]);
  router.handle("back");
  router.input("overlay:choice", "x");
  router.handle("confirm-command");
  assert.deepEqual([ui.overlay.kind, ui.overlay.choice, commands.length], ["confirm", undefined, 1], "nothing reacts but the answer");
  router.handle("dismiss-notice");
  answers[0].resolve(refusal);
  await sending;
  assert.deepEqual([ui.overlay.kind, ui.overlay.busy, ui.overlay.failure, ui.snapshot.notice, ui.consumeFocus()], ["confirm", false, refusal, null, "#voc-dialog-title"]);
  const again = router.handle("confirm-command");
  assert.equal(ui.overlay.failure, null, "a new attempt starts without the old refusal");
  answers[1].resolve({ ok: true, data: null });
  await again;
  assert.equal(ui.overlay, null);
});

test("a late answer leaves only the page that sent it, and only while it is on top", async () => {
  const answer = deferred();
  const { router, ui } = await setup({ answer: () => answer.promise });
  router.handle("edit-job", { jobId: "job-1" });
  router.handle("set-field", { field: "passes", value: 3 });
  const saving = router.handle("save-draft");
  await new Promise((resolve) => setImmediate(resolve));
  const editor = ui.overlay;
  assert.equal(editor.busy, true);
  ui.openOverlay({ kind: "confirm" });
  answer.resolve({ ok: true, data: null });
  await saving;
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => [overlay.kind, overlay.busy ?? false]), [["job-editor", false], ["confirm", false]], "the page on top stays");
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobUpdated");
});

// UI-17: without an answer the command may have taken effect: the card says so, the session
// reloads, nothing is sent again and the page with its draft stays.
test("a command without an answer is reported as unknown and the page stays", async () => {
  const lost = { ok: false, code: "timeout", detail: "15000 ms", channel: "service" };
  const page = await setup({ answer: () => lost });
  page.router.handle("edit-job", { jobId: "job-1" });
  page.router.handle("set-field", { field: "passes", value: 3 });
  await page.router.handle("save-draft");
  assert.deepEqual([page.ui.overlay.kind, page.ui.overlay.busy, page.ui.overlay.draft.passes, page.commands.length], ["job-editor", false, 3, 1]);
  assert.deepEqual({ ...page.ui.snapshot.notice }, { kind: "warning", messageKey: "notice.outcomeUnknown" });
  assert.equal(page.ui.consumeFocus(), "#voc-overlay-title");
  const dialog = await setup({ answer: (operation) => (operation === "hold_job" ? HELD(operation) : { ...lost, code: "connection_lost" }) });
  dialog.router.handle("open-job", { jobId: "job-1" });
  await dialog.router.handle("delete-job", { jobId: "job-1" });
  await dialog.router.handle("confirm-command");
  assert.deepEqual([dialog.ui.overlay.kind, dialog.ui.overlay.failure.code, dialog.ui.snapshot.notice], ["confirm", "connection_lost", null], "a dialog says it itself");
  const row = await setup({ answer: () => lost });
  await row.router.handle("move-job", { jobId: "job-1", direction: "up" });
  assert.equal(row.ui.snapshot.notice.kind, "warning");
});

test("leaving a changed editor asks before the draft is dropped", async () => {
  const { router, ui } = await setup();
  router.handle("create-job");
  router.handle("back");
  assert.equal(ui.overlay, null, "an untouched draft leaves at once");
  router.handle("create-job");
  router.handle("toggle-value", { field: "roomIds", value: "room-library" });
  router.handle("back");
  assert.equal(ui.overlay.kind, "confirm");
  assert.equal(ui.overlay.titleKey, "confirm.discard.title");
  router.handle("back");
  assert.equal(ui.overlay.kind, "job-editor", "declining keeps the editor and its draft");
  assert.deepEqual(ui.overlay.draft.roomIds, ["room-library"]);
  router.handle("back");
  await router.handle("confirm-command");
  assert.equal(ui.overlay, null);
});

test("a new job is created with the full intent; an edited one sends only the changes", async () => {
  const { router, ui, commands } = await setup();
  router.handle("create-job", { roomIds: ["room-library"] });
  await router.handle("save-draft");
  assert.deepEqual(commands[0], { operation: "create_job", parameters: { areas: ["room-library"], mode: "vacuum", vacuum_power: "standard", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort" }, target: "create", invalidates: ["queue", "openJobs", "jobLog", "job", "execution", "trace"] });
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobCreated");
  router.handle("edit-job", { jobId: "job-1" });
  router.handle("set-field", { field: "passes", value: 3 });
  await router.handle("save-draft");
  assert.deepEqual(commands[1].parameters, { job_id: "job-1", passes: 3 });
  router.handle("edit-job", { jobId: "job-1" });
  await router.handle("save-draft");
  assert.equal(commands.length, 2, "an unchanged edit sends nothing");
  assert.equal(ui.overlay, null);
});

test("starting a new job at once creates and starts it in one command", async () => {
  const { router, ui, commands } = await setup();
  router.handle("create-job", { roomIds: ["room-library"] });
  router.handle("set-field", { field: "vacuumPower", value: "maximum" });
  await router.handle("start-draft");
  assert.deepEqual(commands[0].parameters, { areas: ["room-library"], mode: "vacuum", vacuum_power: "maximum", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort", start: true });
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobStarted");
  assert.equal(ui.overlay, null);
});

test("a new draft starts from the integration's defaults and is saved as wished, whatever the preview offers", async () => {
  const { normalizePreview } = await import("../../../src/domain/preview.js");
  const settings = { vacuum_power: { requested: "standard", options: [{ value: "low", supported_by_all: true }, { value: "high", supported_by_all: true }] } };
  const { router, ui, commands } = await setup({ slots: { preview: { data: normalizePreview(W.wirePreview({ settings })) } } });
  router.handle("create-job", { roomIds: ["room-library"] });
  assert.equal(ui.overlay.draft.vacuumPower, "standard");
  await router.handle("save-draft");
  assert.equal(commands[0].parameters.vacuum_power, "standard", "the integration resolves the wish per robot when it starts");
});

test("a job is saved as a template under a name the user may change", async () => {
  const verdict = (_operation, parameters) => (parameters.name ? ACCEPTS : rejects(["name", "empty_name"]));
  const { router, ui, commands, checked } = await setup({ verdict });
  router.handle("open-save-template", { jobId: "missing" });
  assert.equal(ui.overlay, null);
  router.handle("open-save-template", { jobId: "job-1" });
  assert.deepEqual([ui.overlay.kind, ui.overlay.name, ui.overlay.automatic], ["save-template", "Library", false]);
  router.handle("set-field", { field: "overlay:name", value: "  " });
  await router.handle("save-job-template");
  assert.deepEqual([commands.length, { ...ui.overlay.errors }], [0, { "overlay:name": "empty_name" }]);
  router.handle("set-field", { field: "overlay:name", value: " Weekly library " });
  assert.equal(ui.overlay.errors, null, "changing the field takes its error back");
  router.handle("set-field", { field: "overlay:automatic", value: true });
  await router.handle("save-job-template");
  assert.deepEqual(commands[0], { operation: "save_job_as_template", parameters: { job_id: "job-1", name: "Weekly library", automatic: true }, target: "job:job-1", invalidates: ["templates"] });
  assert.deepEqual(checked.at(-1), { operation: "save_job_as_template", parameters: commands[0].parameters }, "the check sees exactly what is sent");
  assert.deepEqual([ui.overlay, ui.snapshot.notice.messageKey], [null, "notice.templateSavedFromJob"]);
  await router.handle("save-job-template");
  assert.equal(commands.length, 1, "outside its page the save does nothing");
});

test("the job defaults open with the integration's values and are saved as a whole", async () => {
  const verdict = (_operation, parameters) => (parameters.passes > 10 ? rejects(["passes", "out_of_range"]) : ACCEPTS);
  const { router, ui, commands } = await setup({ verdict });
  router.handle("open-job-defaults");
  assert.deepEqual(shown(ui.overlay), { kind: "job-defaults", mode: "vacuum", vacuumPower: "standard", mopIntensity: "medium", mopRoute: "standard", passes: 1, settingsPolicy: "best_effort" });
  router.handle("set-field", { field: "overlay:passes", value: 11 });
  await router.handle("save-job-defaults");
  assert.deepEqual([commands.length, { ...ui.overlay.errors }], [0, { "overlay:passes": "out_of_range" }]);
  router.handle("set-field", { field: "overlay:passes", value: 2 });
  router.handle("set-field", { field: "overlay:mopRoute", value: "deep_plus" });
  await router.handle("save-job-defaults");
  assert.deepEqual(commands[0], { operation: "configure_job_defaults", parameters: { mode: "vacuum", passes: 2, settings_policy: "best_effort", vacuum_power: "standard", mop_intensity: "medium", mop_route: "deep_plus" }, target: "queue", invalidates: ["queue"] });
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobDefaultsSaved");
  await router.handle("save-job-defaults");
  assert.equal(commands.length, 1);
});

test("a draft the integration rejects stays open with each error at its field", async () => {
  const verdict = (_operation, parameters) => (parameters.areas?.length || parameters.all_rooms ? ACCEPTS : rejects(["areas", "required_field"], ["passes", "out_of_range"], ["", "job_held"], ["colour", "unknown_field"]));
  const { router, ui, commands, checked } = await setup({ verdict });
  router.handle("create-job");
  await router.handle("save-draft");
  assert.deepEqual([ui.overlay.kind, { ...ui.overlay.errors }, ui.overlay.formError], ["job-editor", { roomIds: "required_field", passes: "out_of_range" }, "job_held"]);
  assert.deepEqual([commands.length, checked.map((entry) => entry.operation)], [0, ["create_job"]]);
  router.handle("toggle-value", { field: "roomIds", value: "room-library" });
  assert.deepEqual({ ...ui.overlay.errors }, { passes: "out_of_range" }, "a changed field takes back only its own error");
  await router.handle("save-draft");
  assert.deepEqual([commands.length, checked.at(-1).parameters], [1, commands[0].parameters]);
  assert.equal(ui.overlay, null);
});

test("without a verdict nothing is sent; a page left meanwhile keeps nothing of the check", async () => {
  const failure = { ok: false, code: "connection_lost", group: "connection", detail: null, channel: "ws" };
  const lost = await setup({ verdict: () => failure });
  lost.router.handle("create-job", { roomIds: ["room-library"] });
  await lost.router.handle("save-draft");
  assert.deepEqual([lost.commands.length, lost.ui.overlay.kind, { ...lost.ui.snapshot.notice }], [0, "job-editor", { kind: "error", operation: "create_job", failure }]);
  let leave = null;
  const verdict = () => {
    leave();
    return rejects(["passes", "out_of_range"]);
  };
  const left = await setup({ verdict });
  leave = () => left.ui.closeOverlay();
  left.router.handle("create-job", { roomIds: ["room-library"] });
  await left.router.handle("save-draft");
  assert.deepEqual([left.commands.length, left.ui.overlay], [0, null]);
});

test("a refusal keeps the page open and becomes the notice", async () => {
  const failure = { ok: false, code: "job_not_editable", group: "job", detail: null, channel: "service" };
  const { router, ui } = await setup({ answer: () => failure });
  router.handle("edit-job", { jobId: "job-1" });
  router.handle("set-field", { field: "passes", value: 3 });
  await router.handle("save-draft");
  assert.equal(ui.overlay.kind, "job-editor");
  assert.deepEqual({ ...ui.snapshot.notice }, { kind: "error", operation: "update_job", failure });
});

test("templates are created, edited, used and removed through their commands", async () => {
  const { router, ui, commands } = await setup({ config: { confirm_destructive: false } });
  router.handle("create-template");
  assert.equal(ui.overlay.draft.meta.kind, "template");
  router.handle("back");
  router.handle("edit-template", { templateId: "template-1" });
  router.handle("set-field", { field: "automatic", value: true });
  await router.handle("save-draft");
  await router.handle("create-from-template", { templateId: "template-1" });
  await router.handle("reset-template-demand", { templateId: "template-1" });
  router.handle("edit-template", { templateId: "template-1" });
  await router.handle("remove-template", { templateId: "template-1" });
  assert.deepEqual(commands.map((command) => [command.operation, command.target]), [
    ["save_template", "template:template-1"],
    ["create_job_from_template", "template:template-1"],
    ["reset_template_demand", "template:template-1"],
    ["remove_template", "template:template-1"],
  ]);
  assert.equal(commands[0].parameters.automatic, true);
  assert.equal(ui.overlay, null, "removing from the editor leaves it");
});

test("a release sends its kind and, for a timed one, the duration in seconds", async () => {
  const verdict = (_operation, parameters) => (parameters.grants[0].duration_seconds === 0 ? rejects(["grants.0.duration_seconds", "release_duration_mismatch"]) : ACCEPTS);
  const { router, ui, commands, checked } = await setup({ verdict });
  router.handle("open-release", { roomId: "room-library" });
  assert.equal(ui.overlay.releaseKind, "queue_run");
  router.handle("set-overlay", { releaseKind: "timed", hours: 1, minutes: 30 });
  await router.handle("release-room", { roomId: "room-library" });
  assert.deepEqual(commands[0], { operation: "release_rooms", parameters: { grants: [{ room: "room-library", kind: "timed", duration_seconds: 5400 }] }, target: "room:room-library", invalidates: commands[0].invalidates });
  router.handle("open-release", { roomId: "room-library" });
  router.handle("set-overlay", { releaseKind: "timed", hours: 0, minutes: 0 });
  await router.handle("release-room", { roomId: "room-library" });
  assert.deepEqual([commands.length, { ...ui.overlay.errors }], [1, { "overlay:duration": "release_duration_mismatch" }]);
  router.input("overlay:minutes", 30);
  assert.equal(ui.overlay.errors, null, "hours and minutes form the duration");
  router.handle("back");
  const checks = checked.length;
  await router.handle("release-room", { roomId: "room-library" });
  assert.deepEqual([commands.at(-1).parameters, checked.length], [{ grants: [{ room: "room-library", kind: "queue_run" }] }, checks], "from a room card the release asks nothing");
});

test("room settings send the patch wrapped as configuration", async () => {
  const verdict = (_operation, parameters) => (parameters.configuration.name === "Library corner" ? ACCEPTS : rejects(["configuration.name", "empty_name"], ["configuration.bindings", "duplicate_room_binding"]));
  const { router, ui, commands } = await setup({ verdict });
  router.handle("edit-room", { roomId: "room-library" });
  router.input("name", " ");
  await router.handle("save-room");
  assert.deepEqual([commands.length, { ...ui.overlay.errors }, ui.overlay.formError], [0, { name: "empty_name" }, "duplicate_room_binding"]);
  router.input("name", "Library corner");
  await router.handle("save-room");
  assert.deepEqual(commands[0].parameters, { room_id: "room-library", configuration: { name: "Library corner", follow_area_name: false } });
});

test("a robot profile opens with resolved role entities and saves the complete definition", async () => {
  const { router, ui, commands } = await setup();
  router.handle("edit-robot", { robotId: "robot-rocky" });
  assert.equal(ui.overlay.draft.roles.battery.entity, "sensor.rocky_battery");
  router.handle("toggle-value", { field: "roles.status.entity", value: "sensor.rocky_status" });
  router.handle("toggle-section", { key: "roles" });
  assert.deepEqual(ui.overlay.open, ["roles"]);
  router.input("overlay:newOptionKey", "Ground");
  router.input("overlay:newOptionValue", "map_0");
  router.handle("add-option", { group: "map_options" });
  assert.deepEqual(ui.overlay.draft.optionMaps.map_options, { Ground: "map_0" });
  await router.handle("save-robot");
  assert.equal(commands[0].operation, "configure_robot");
  assert.equal(commands[0].parameters.configuration.roles.battery, "sensor.rocky_battery");
  assert.equal(commands[0].parameters.configuration.roles.status, "sensor.rocky_status");
  assert.deepEqual(commands[0].parameters.configuration.map_options, { Ground: "map_0" });
});

test("a robot profile keeps the integration's errors at its fields until they change", async () => {
  const verdict = (_operation, parameters) => (parameters.configuration.preference > 100 ? rejects(["configuration.preference", "invalid_robot_preference"], ["configuration.requirements.0.entity_id", "invalid_entity_id"]) : ACCEPTS);
  const { router, ui, commands } = await setup({ verdict });
  router.handle("edit-robot", { robotId: "robot-rocky" });
  router.input("preference", 101);
  await router.handle("save-robot");
  assert.deepEqual([commands.length, { ...ui.overlay.errors }], [0, { preference: "invalid_robot_preference", "requirements.0": "invalid_entity_id" }]);
  router.input("requirements.0.acceptedStates", "on");
  assert.deepEqual({ ...ui.overlay.errors }, { preference: "invalid_robot_preference" });
  router.input("preference", 100);
  assert.equal(ui.overlay.errors, null);
  await router.handle("save-robot");
  assert.equal(commands[0].operation, "configure_robot");
});

test("an entity picker search is overlay state and a pick clears it", async () => {
  const { router, ui } = await setup();
  router.handle("edit-robot", { robotId: "robot-rocky" });
  router.input("query:roles.error.entity", "rock");
  assert.equal(ui.overlay.queries["roles.error.entity"], "rock");
  router.handle("toggle-value", { field: "roles.error.entity", value: "sensor.rocky_error" });
  assert.equal(ui.overlay.queries["roles.error.entity"], "");
  router.handle("toggle-value", { field: "roles.error.entity", value: "sensor.rocky_error" });
  assert.equal(ui.overlay.draft.roles.error.entity, null, "picking it again clears it");
});

test("the queue quiet period is edited in minutes and sent in seconds", async () => {
  const verdict = (_operation, parameters) => (parameters.grace_seconds > 86400 ? rejects(["grace_seconds", "out_of_range"]) : ACCEPTS);
  const { router, ui, commands } = await setup({ verdict });
  router.handle("open-queue-settings");
  assert.equal(ui.overlay.minutes, 15);
  router.handle("step-field", { field: "overlay:minutes", step: 1, min: 0, max: 1440 });
  await router.handle("save-queue-settings");
  assert.deepEqual(commands[0].parameters, { grace_seconds: 960 });
  router.handle("open-queue-settings");
  router.input("overlay:minutes", 2000);
  await router.handle("save-queue-settings");
  assert.deepEqual([commands.length, { ...ui.overlay.errors }], [1, { "overlay:minutes": "out_of_range" }]);
});

test("recovery sends the stop confirmation the user gave", async () => {
  const { router, commands } = await setup();
  router.handle("open-recovery", { robotId: "legacy:unscoped" });
  router.input("overlay:confirmStopped", true);
  await router.handle("resolve-recovery");
  assert.deepEqual(commands[0], { operation: "resolve_recovery", parameters: { robot_id: "legacy:unscoped", confirm_stopped: true }, target: "robot:legacy:unscoped", invalidates: "all" });
});

test("navigation, paging and reload reach their owners; an unknown action does nothing", async () => {
  const { router, ui, navigated, commands } = await setup();
  router.handle("navigate", { path: "/config/integrations" });
  assert.deepEqual(navigated, ["/config/integrations"]);
  router.handle("page", { scope: "queue", direction: "next" });
  assert.equal(ui.snapshot.pages.queue, 25, "one page of the integration's size further");
  router.handle("reload");
  assert.equal(commands[0].operation, "probe");
  assert.equal(router.handle("no-such-action"), undefined);
  assert.equal(router.has("queue-control"), true);
});

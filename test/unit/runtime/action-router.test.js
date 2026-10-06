// Every control's action becomes UI navigation or exactly one integration command with the
// integration's parameters. Destructive steps ask first; a refusal becomes the card's notice.
// Boundary: the router with a recording session stub and real UI state.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

async function setup({ config = {}, answer = () => ({ ok: true, data: null }), model: extra = {}, slots = {} } = {}) {
  const { createActionRouter } = await import("../../../src/controllers/runtime/action-router.js");
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const { normalizeJob } = await import("../../../src/domain/job.js");
  const { normalizeRoom } = await import("../../../src/domain/rooms.js");
  const { normalizeRobot } = await import("../../../src/domain/robots.js");
  const { normalizeTemplate } = await import("../../../src/domain/templates.js");
  const { normalizeQueuePage } = await import("../../../src/domain/queue.js");
  const commands = [];
  const session = {
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
      queue: { data: normalizeQueuePage(W.wireQueuePage([W.wireJob({ job_id: "job-1", name: "Kitchen" })], { mode: "running", queue_grace_seconds: 900, total: 1 })) },
      rooms: { data: { items: [normalizeRoom(W.wireRoom({ room_id: "room-kitchen", name: "Kitchen" }))] } },
      robots: { data: { items: [normalizeRobot(W.wireRobot()), normalizeRobot(W.wireRobot({ robot_id: "robot-dusty", name: "Dusty" }))] } },
      templates: { data: { items: [normalizeTemplate(W.wireTemplate())] } },
      openJobs: { data: { jobs: [normalizeJob(W.wireJob({ job_id: "job-run", state: "running" }))] } },
      ...slots,
    },
    robotsLive: { "robot-rocky": { roles: { battery: { entityId: "sensor.rocky_battery" } } } },
    ...extra,
  };
  const router = createActionRouter({ ui, getSession: () => session, getModel: () => model, getConfig: () => config, platform: { navigate: (path) => navigated.push(path) } });
  return { router, ui, commands, navigated };
}

test("all rooms in the editor excludes single rooms, and a single room ends all rooms", async () => {
  const { router, ui } = await setup();
  router.handle("create-job");
  const rooms = () => [ui.overlay.draft.allRooms, [...ui.overlay.draft.roomIds]];
  router.handle("toggle-value", { field: "roomIds", value: "room-kitchen" });
  router.handle("toggle-value", { field: "roomIds", value: "all" });
  assert.deepEqual(rooms(), [true, []]);
  router.handle("toggle-value", { field: "roomIds", value: "room-kitchen" });
  assert.deepEqual(rooms(), [false, ["room-kitchen"]]);
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
  assert.deepEqual({ ...started.ui.overlay }, { kind: "cancel-job", jobId: "job-run", afterCancel: "return_to_dock" });
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
  assert.deepEqual({ ...running.ui.overlay }, { kind: "queue-end", choice: "finish" });
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
  assert.deepEqual({ ...ui.overlay }, { kind: "setup-guide" });
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

test("deleting from the editor opened on the detail page leaves both pages", async () => {
  const { router, ui } = await setup();
  router.handle("open-job", { jobId: "job-1" });
  router.handle("edit-job", { jobId: "job-1" });
  router.handle("delete-job", { jobId: "job-1" });
  assert.deepEqual(ui.snapshot.overlays.map((overlay) => overlay.kind), ["job-detail", "job-editor", "confirm"]);
  await router.handle("confirm-command");
  assert.deepEqual(ui.snapshot.overlays, []);
});

test("leaving a changed editor asks before the draft is dropped", async () => {
  const { router, ui } = await setup();
  router.handle("create-job");
  router.handle("back");
  assert.equal(ui.overlay, null, "an untouched draft leaves at once");
  router.handle("create-job");
  router.handle("toggle-value", { field: "roomIds", value: "room-kitchen" });
  router.handle("back");
  assert.equal(ui.overlay.kind, "confirm");
  assert.equal(ui.overlay.titleKey, "confirm.discard.title");
  router.handle("back");
  assert.equal(ui.overlay.kind, "job-editor", "declining keeps the editor and its draft");
  assert.deepEqual(ui.overlay.draft.roomIds, ["room-kitchen"]);
  router.handle("back");
  await router.handle("confirm-command");
  assert.equal(ui.overlay, null);
});

test("a new job is created with the full intent; an edited one sends only the changes", async () => {
  const { router, ui, commands } = await setup();
  router.handle("create-job", { roomIds: ["room-kitchen"] });
  await router.handle("save-draft");
  assert.deepEqual(commands[0], { operation: "create_job", parameters: { areas: ["room-kitchen"], mode: "vacuum", vacuum_power: "standard", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort" }, target: "create", invalidates: ["queue", "openJobs", "jobLog", "job", "execution", "trace"] });
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
  router.handle("create-job", { roomIds: ["room-kitchen"] });
  router.handle("set-field", { field: "vacuumPower", value: "maximum" });
  await router.handle("start-draft");
  assert.deepEqual(commands[0].parameters, { areas: ["room-kitchen"], mode: "vacuum", vacuum_power: "maximum", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort", start: true });
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobStarted");
  assert.equal(ui.overlay, null);
});

test("a new draft starts from the integration's defaults and is saved with the rung the preview preselects", async () => {
  const { normalizePreview } = await import("../../../src/domain/preview.js");
  const settings = { vacuum_power: { initial: "high", options: [{ value: "low", supported_by_all: true }, { value: "high", supported_by_all: true }] } };
  const { router, ui, commands } = await setup({ slots: { preview: { data: normalizePreview(W.wirePreview({ settings })) } } });
  router.handle("create-job", { roomIds: ["room-kitchen"] });
  assert.equal(ui.overlay.draft.vacuumPower, "standard");
  await router.handle("save-draft");
  assert.equal(commands[0].parameters.vacuum_power, "high", "the integration's default is not offered for these rooms");
});

test("a job is saved as a template under a name the user may change", async () => {
  const { router, ui, commands } = await setup();
  router.handle("open-save-template", { jobId: "missing" });
  assert.equal(ui.overlay, null);
  router.handle("open-save-template", { jobId: "job-1" });
  assert.deepEqual([ui.overlay.kind, ui.overlay.name, ui.overlay.automatic], ["save-template", "Kitchen", false]);
  router.handle("set-field", { field: "overlay:name", value: "  " });
  await router.handle("save-job-template");
  assert.deepEqual([commands.length, ui.overlay.submitted], [0, true]);
  router.handle("set-field", { field: "overlay:name", value: " Weekly kitchen " });
  router.handle("set-field", { field: "overlay:automatic", value: true });
  await router.handle("save-job-template");
  assert.deepEqual(commands[0], { operation: "save_job_as_template", parameters: { job_id: "job-1", name: "Weekly kitchen", automatic: true }, target: "job:job-1", invalidates: ["templates"] });
  assert.deepEqual([ui.overlay, ui.snapshot.notice.messageKey], [null, "notice.templateSavedFromJob"]);
  await router.handle("save-job-template");
  assert.equal(commands.length, 1, "outside its page the save does nothing");
});

test("the job defaults open with the integration's values and are saved as a whole", async () => {
  const { router, ui, commands } = await setup();
  router.handle("open-job-defaults");
  assert.deepEqual({ ...ui.overlay }, { kind: "job-defaults", mode: "vacuum", vacuumPower: "standard", mopIntensity: "medium", mopRoute: "standard", passes: 1, settingsPolicy: "best_effort" });
  router.handle("set-field", { field: "overlay:passes", value: 11 });
  await router.handle("save-job-defaults");
  assert.deepEqual([commands.length, ui.overlay.submitted], [0, true]);
  router.handle("set-field", { field: "overlay:passes", value: 2 });
  router.handle("set-field", { field: "overlay:mopRoute", value: "deep_plus" });
  await router.handle("save-job-defaults");
  assert.deepEqual(commands[0], { operation: "configure_job_defaults", parameters: { mode: "vacuum", passes: 2, settings_policy: "best_effort", vacuum_power: "standard", mop_intensity: "medium", mop_route: "deep_plus" }, target: "queue", invalidates: ["queue"] });
  assert.equal(ui.snapshot.notice.messageKey, "notice.jobDefaultsSaved");
  await router.handle("save-job-defaults");
  assert.equal(commands.length, 1);
});

test("an invalid draft stays open and marks itself submitted", async () => {
  const { router, ui, commands } = await setup();
  router.handle("create-job");
  await router.handle("save-draft");
  assert.equal(ui.overlay.submitted, true);
  assert.equal(commands.length, 0);
});

test("a refusal keeps the page open and becomes the notice", async () => {
  const failure = { ok: false, code: "job_not_editable", group: "job", detail: null, channel: "service" };
  const { router, ui } = await setup({ answer: () => failure });
  router.handle("edit-job", { jobId: "job-1" });
  router.handle("set-field", { field: "passes", value: 2 });
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
  const { router, ui, commands } = await setup();
  router.handle("open-release", { roomId: "room-kitchen" });
  assert.equal(ui.overlay.releaseKind, "queue_run");
  router.handle("set-overlay", { releaseKind: "timed", hours: 1, minutes: 30 });
  await router.handle("release-room", { roomId: "room-kitchen" });
  assert.deepEqual(commands[0].parameters, { room_id: "room-kitchen", kind: "timed", duration_seconds: 5400 });
  router.handle("open-release", { roomId: "room-kitchen" });
  router.handle("set-overlay", { releaseKind: "timed", hours: 0, minutes: 0 });
  await router.handle("release-room", { roomId: "room-kitchen" });
  assert.equal(ui.overlay.submitted, true);
  assert.equal(commands.length, 1);
});

test("room settings send the patch wrapped as configuration", async () => {
  const { router, commands } = await setup();
  router.handle("edit-room", { roomId: "room-kitchen" });
  router.input("name", "Kitchen corner");
  await router.handle("save-room");
  assert.deepEqual(commands[0].parameters, { room_id: "room-kitchen", configuration: { name: "Kitchen corner", follow_area_name: false } });
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
  const { router, ui, commands } = await setup();
  router.handle("open-queue-settings");
  assert.equal(ui.overlay.minutes, 15);
  router.handle("step-field", { field: "overlay:minutes", step: 1, min: 0, max: 1440 });
  await router.handle("save-queue-settings");
  assert.deepEqual(commands[0].parameters, { grace_seconds: 960 });
  router.handle("open-queue-settings");
  router.input("overlay:minutes", 2000);
  await router.handle("save-queue-settings");
  assert.equal(ui.overlay.submitted, true);
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
  assert.equal(ui.snapshot.pages.queue, 50);
  router.handle("reload");
  assert.equal(commands[0].operation, "probe");
  assert.equal(router.handle("no-such-action"), undefined);
  assert.equal(router.has("queue-control"), true);
});

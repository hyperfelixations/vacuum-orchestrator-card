// Every control's action becomes UI navigation or exactly one integration command with the
// integration's parameters. Destructive steps ask first; a refusal becomes the card's notice.
// Boundary: the router with a recording session stub and real UI state.

const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../../fixtures/voi/wire.js");

async function setup({ config = {}, answer = () => ({ ok: true, data: null }), model: extra = {} } = {}) {
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
  assert.deepEqual(commands[0], { operation: "create_job", parameters: { areas: ["room-kitchen"], mode: "vacuum", passes: 1, required_on: [], required_off: [], settings_policy: "best_effort" }, target: "create", invalidates: ["queue", "openJobs", "jobLog", "job", "execution", "trace"] });
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

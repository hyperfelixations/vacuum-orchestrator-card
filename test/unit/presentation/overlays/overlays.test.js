// The pages that replace the tabs: job and template editor, job detail with the execution
// explanation, the small dialogs, room release and settings, robot discovery and profile.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");

const LOADERS = {
  "job-editor": () => import("../../../../src/presentation/overlays/job-editor.js"),
  "job-detail": () => import("../../../../src/presentation/overlays/job-detail.js"),
  dialogs: () => import("../../../../src/presentation/overlays/dialogs.js"),
  rooms: () => import("../../../../src/presentation/overlays/rooms.js"),
  robots: () => import("../../../../src/presentation/overlays/robots.js"),
};
const overlays = (name) => LOADERS[name]();
const draftModule = () => import("../../../../src/domain/job-draft.js");
const fieldsOf = (vm, group) => Object.fromEntries(vm.groups.find((entry) => entry.key === group).fields.map((field) => [field.key, field]));

test("a new job editor offers rooms by name with a mark for unreachable rooms", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft } = await draftModule();
  const built = await modelFor("typical", { needsEntityCatalog: true });
  const vm = buildJobEditor({ ...built, overlay: { kind: "job-editor", draft: createDraft() } });
  assert.equal(vm.title, built.texts.t("editor.newJob"));
  assert.equal(vm.save.label, built.texts.t("action.addToQueue"));
  assert.equal(vm.remove, null);
  const rooms = fieldsOf(vm, "basics").roomIds.options;
  assert.deepEqual(rooms.map((room) => room.label), ["Bathroom", "Bedroom", "Hall", "Kitchen", "Living room"]);
  assert.equal(rooms.find((room) => room.value === "room-bedroom").badge, "mdi:robot-vacuum-alert");
  assert.equal(rooms.find((room) => room.value === "room-bathroom").badge, "mdi:lock-outline");
  assert.equal(rooms.find((room) => room.value === "room-kitchen").badge, null);
});

test("level choices follow the mode, and errors show only after a save attempt", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, applyDraftChange } = await draftModule();
  const built = await modelFor("typical");
  const draft = createDraft();
  const vacuum = buildJobEditor({ ...built, overlay: { draft } });
  assert.equal(fieldsOf(vacuum, "settings").vacuumPower.options.some((option) => option.value === "off"), false);
  const mop = buildJobEditor({ ...built, overlay: { draft: applyDraftChange(draft, "mode", "mop") } });
  assert.equal(fieldsOf(mop, "settings").vacuumPower.options.some((option) => option.value === "off"), true);
  assert.equal(fieldsOf(vacuum, "basics").roomIds.error, null);
  const submitted = buildJobEditor({ ...built, overlay: { draft, submitted: true } });
  assert.equal(submitted.invalid, true);
  assert.equal(fieldsOf(submitted, "basics").roomIds.error, built.texts.t("error.code.job_requires_area", { detail: "" }));
});

test("editing a job or a template offers removing it from the editor", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft } = await draftModule();
  const { findJob } = await import("../../../../src/presentation/common/lookups.js");
  const built = await modelFor("typical", { requests: { templates: { name: "templates", params: {} } } });
  const job = buildJobEditor({ ...built, overlay: { draft: createDraft({ target: findJob(built.model, "job-kitchen") }) } });
  assert.deepEqual([job.remove.action, job.remove.decision.state], ["delete-job", "enabled"]);
  assert.equal(job.save.label, built.texts.t("action.save"));
  const template = built.model.slots.templates.data.items[0];
  const editor = buildJobEditor({ ...built, overlay: { draft: createDraft({ kind: "template", target: template }) } });
  assert.equal(editor.groups[0].key, "template");
  assert.deepEqual([editor.remove.action, editor.remove.args], ["remove-template", { templateId: "template-daily" }]);
});

test("the detail page shows readiness, unreleased rooms to release and the execution explanation", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const built = await modelFor("typical", { requests: { job: { name: "job", params: { jobId: "job-bathroom" } }, execution: { name: "execution", params: { jobId: "job-bathroom" } }, trace: { name: "trace", params: { jobId: "job-bathroom" } } } });
  const vm = buildJobDetail({ ...built, overlay: { jobId: "job-bathroom" }, config: {} });
  assert.equal(vm.title, "Bathroom");
  assert.equal(vm.position, 2);
  assert.equal(vm.readiness.state, "blocked");
  assert.deepEqual(vm.releaseable.map((room) => [room.roomId, room.decision.state]), [["room-bathroom", "enabled"]]);
  assert.deepEqual(vm.execution.map((group) => [group.key, group.eligible]), [["mop", false]]);
  assert.deepEqual(vm.execution[0].robots.map((robot) => robot.reason), [built.texts.t("error.code.robot_busy", { detail: "" }), built.texts.t("error.code.unsupported_operation", { detail: "" })]);
  assert.deepEqual([vm.actions.delete.state, vm.actions.retry.state], ["enabled", "hidden"]);
});

test("a job the integration no longer has is a missing page", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const built = await modelFor("typical");
  const vm = buildJobDetail({ ...built, overlay: { jobId: "job-gone" }, config: {} });
  assert.equal(vm.jobId, undefined);
  assert.equal(vm.title, built.texts.t("detail.title"));
});

test("the small dialogs word their command and validate their input", async () => {
  const dialogs = await overlays("dialogs");
  const built = await modelFor("attention", { requests: { execution: { name: "execution", params: { jobId: "job-kitchen" } } } });
  const confirm = dialogs.buildConfirm({ ...built, overlay: { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", jobId: "job-kitchen", command: { options: { target: "job:job-kitchen" } } } });
  assert.match(confirm.text, /Kitchen and hall/);
  assert.equal(confirm.tone, "danger");
  assert.equal(confirm.confirmIcon, "mdi:check", "without an icon of its own the confirmation shows a check");
  assert.equal(dialogs.buildConfirm({ ...built, overlay: { titleKey: "confirm.cancelJob.title", textKey: "confirm.cancelJob.text", confirmKey: "confirm.cancelJob.confirm", icon: "mdi:stop-circle-outline", jobId: "job-kitchen", command: {} } }).confirmIcon, "mdi:stop-circle-outline");
  const start = dialogs.buildStartJob({ ...built, overlay: { jobId: "job-kitchen" } });
  assert.match(start.lead, /Kitchen and hall/);
  assert.ok(start.robots.length >= 2);
  const recovery = dialogs.buildRecovery({ ...built, overlay: { robotId: "robot-rocky", confirmStopped: false } });
  assert.equal(recovery.open, true);
  assert.equal(recovery.reason, built.texts.t("failure.physical_run_ownership_uncertain"));
  assert.equal(dialogs.buildRecovery({ ...built, overlay: { robotId: "robot-dusty" } }).open, false);
  const settings = dialogs.buildQueueSettings({ ...built, overlay: { minutes: 2000, submitted: true } });
  assert.equal(settings.field.error, built.texts.t("error.code.queue_grace_out_of_range", { detail: "" }));
  assert.equal(dialogs.buildQueueSettings({ ...built, overlay: { minutes: 15 } }).field.error, null);
});

test("a release offers the four kinds; a timed one asks for its duration", async () => {
  const { buildRelease } = await overlays("rooms");
  const built = await modelFor("typical");
  const queueRun = buildRelease({ ...built, overlay: { roomId: "room-bathroom" } });
  assert.deepEqual(queueRun.fields[0].options.map((option) => option.value), ["permanent", "once", "timed", "queue_run"]);
  assert.equal(queueRun.fields.length, 1);
  assert.equal(queueRun.revoke.state, "hidden");
  const timed = buildRelease({ ...built, overlay: { roomId: "room-kitchen", releaseKind: "timed", hours: 0, minutes: 0, submitted: true } });
  assert.equal(timed.fields.length, 3);
  assert.equal(timed.durationValid, false);
  assert.ok(timed.fields[2].error);
  assert.equal(timed.revoke.state, "enabled");
  assert.equal(buildRelease({ ...built, overlay: { roomId: "room-gone" } }).missing, true);
});

test("room settings show detected robot targets and the occupancy fields only for occupied time", async () => {
  const { buildRoomEditor, buildRoomCreate } = await overlays("rooms");
  const { createRoomDraft, updateRoomDraft } = await import("../../../../src/domain/room-draft.js");
  const built = await modelFor("typical", { needsEntityCatalog: true });
  const room = built.model.slots.rooms.data.items.find((entry) => entry.roomId === "room-kitchen");
  const draft = createRoomDraft(room);
  const vm = buildRoomEditor({ ...built, overlay: { draft } });
  assert.deepEqual(vm.detected.map((item) => item.key), ["robot-rocky", "robot-dusty"]);
  assert.equal(fieldsOf(vm, "due").occupancyEntityId, undefined);
  const occupied = buildRoomEditor({ ...built, overlay: { draft: updateRoomDraft(draft, "basis", "occupied"), submitted: true } });
  assert.ok(fieldsOf(occupied, "due").occupancyEntityId.error);
  const create = buildRoomCreate({ ...built, overlay: { name: "" } });
  assert.deepEqual(create.fields[1].options.map((option) => option.value), [null], "every area already has its room");
});

test("robot discovery marks configured vacuums; the profile explains each role", async () => {
  const { buildRobotAdd, buildRobotEditor } = await overlays("robots");
  const { createRobotDraft, updateRobotDraft } = await import("../../../../src/domain/robot-draft.js");
  const built = await modelFor("typical", { needsEntityCatalog: true });
  const add = buildRobotAdd(built);
  assert.deepEqual(add.candidates.map((candidate) => [candidate.entityId, candidate.configured]), [["vacuum.rocky", true], ["vacuum.dusty", true]]);
  const dusty = built.model.slots.robots.data.items.find((robot) => robot.robotId === "robot-dusty");
  let draft = createRobotDraft(dusty);
  const vm = buildRobotEditor({ ...built, overlay: { draft, open: [] } });
  const roles = Object.fromEntries(vm.sections.roles.rows.map((row) => [row.key, row]));
  assert.equal(roles.status.mode.hint, built.texts.t("robotEditor.roleAmbiguous"));
  assert.equal(roles.status.mode.attention, true);
  assert.equal(roles.error.mode.hint, built.texts.t("robotEditor.roleNotFound"));
  draft = updateRobotDraft(draft, "roles.error.mode", "entity");
  const picking = buildRobotEditor({ ...built, overlay: { draft, open: [], submitted: true } });
  const error = picking.sections.roles.rows.find((row) => row.key === "error");
  assert.equal(error.entity.single, true);
  assert.ok(error.entity.error);
  assert.equal(picking.sections.roles.open, true, "a section with an error opens");
  assert.equal(vm.remove.state, "enabled");
  const rocky = built.model.slots.robots.data.items.find((robot) => robot.robotId === "robot-rocky");
  assert.equal(buildRobotEditor({ ...built, overlay: { draft: createRobotDraft(rocky), open: [] } }).remove.reason, "robot_busy");
});

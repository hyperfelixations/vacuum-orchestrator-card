// The pages that replace the tabs: job and template editor, job detail with the execution
// explanation, the small dialogs, room release and settings, robot discovery and profile.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");
const W = require("../../../fixtures/voi/wire.js");

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
  assert.deepEqual(rooms.map((room) => room.label), ["All rooms", "Bathroom", "Bedroom", "Hall", "Kitchen", "Living room"]);
  assert.equal(rooms.find((room) => room.value === "room-bedroom").badge, "mdi:robot-vacuum-alert");
  assert.equal(rooms.find((room) => room.value === "room-bathroom").badge, "mdi:lock-outline");
  assert.equal(rooms.find((room) => room.value === "room-kitchen").badge, null);
});

test("the editor shows only the settings the mode uses, and errors only after a save attempt", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, applyDraftChange } = await draftModule();
  const built = await modelFor("typical");
  const draft = createDraft();
  const vacuum = buildJobEditor({ ...built, overlay: { draft } });
  assert.deepEqual(Object.keys(fieldsOf(vacuum, "settings")), ["vacuumPower", "passes"]);
  assert.deepEqual(fieldsOf(vacuum, "settings").vacuumPower.options.map((option) => [option.value, option.badge]), ["low", "standard", "high", "maximum", "maximum_plus"].map((value) => [value, null]), "without a preview every rung is offered");
  const mop = buildJobEditor({ ...built, overlay: { draft: applyDraftChange(draft, "mode", "mop") } });
  assert.deepEqual(Object.keys(fieldsOf(mop, "settings")), ["mopIntensity", "mopRoute", "passes"]);
  assert.deepEqual(Object.keys(fieldsOf(mop, "basics")), ["name", "roomIds", "mode"]);
  assert.deepEqual(Object.keys(fieldsOf(mop, "more")), ["settingsPolicy", "note", "requiredOn", "requiredOff"]);
  assert.equal(fieldsOf(vacuum, "basics").roomIds.error, null);
  const submitted = buildJobEditor({ ...built, overlay: { draft, submitted: true } });
  assert.equal(submitted.invalid, true);
  assert.equal(fieldsOf(submitted, "basics").roomIds.error, built.texts.t("validation.job_requires_area"));
});

test("the preview limits the rungs, marks those not every robot offers and allows starting at once", async () => {
  const { buildJobEditor, settingChoices, shownSettings, previewable } = await overlays("job-editor");
  const { createDraft, applyDraftChange, draftToPreview } = await draftModule();
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const draft = applyDraftChange(createDraft({ jobDefaults: { mode: "vacuum", vacuumPower: "maximum_plus", passes: 1, settingsPolicy: "best_effort" } }), "roomIds", ["room-kitchen"]);
  const setup = (fake) => {
    fake.state.jobDefaults = W.wireJobDefaults({ vacuum_power: "maximum_plus", configured: true });
  };
  const built = await modelFor("typical", { setup, requests: { preview: { name: "preview", params: draftToPreview(draft) } } });
  const vm = buildJobEditor({ ...built, overlay: { draft } });
  const power = fieldsOf(vm, "settings").vacuumPower;
  assert.deepEqual(power.options.map((option) => option.value), ["low", "standard", "high", "maximum"]);
  assert.equal(power.value, "maximum", "a new draft shows the rung the integration preselects");
  assert.deepEqual([power.options[0].badge, power.options[0].title], ["mdi:information-outline", built.texts.t("editor.notEveryRobot")]);
  assert.deepEqual(shownSettings(draft, built.model.slots.preview.data), { vacuumPower: "maximum" });
  assert.equal(vm.startNow.label, built.texts.t("action.startNow"));
  const job = normalizeJob(W.wireJob({ vacuum_power: "maximum_plus" }));
  const kept = settingChoices(createDraft({ target: job }), built.model.slots.preview.data)[0];
  assert.equal(kept.value, "maximum_plus", "an existing job keeps its rung, marked");
  assert.deepEqual(kept.options.at(-1), { value: "maximum_plus", note: "notOffered" });
  assert.equal(previewable(createDraft()), true, "a missing room does not hold the preview back");
  assert.equal(previewable(applyDraftChange(createDraft(), "passes", 11)), false);
  const blocked = applyDraftChange(draft, "roomIds", ["room-bathroom"]);
  const waiting = await modelFor("typical", { requests: { preview: { name: "preview", params: draftToPreview(blocked) } } });
  assert.equal(buildJobEditor({ ...waiting, overlay: { draft: blocked } }).startNow, null);
  assert.equal(buildJobEditor({ ...built, overlay: { draft: createDraft({ target: job }) } }).startNow, null, "an existing job is started from the queue");
});

test("the room choice starts with all rooms; chosen, it mutes the single rooms and says what it means", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, applyDraftChange } = await draftModule();
  const built = await modelFor("typical");
  const roomsField = (draft) => fieldsOf(buildJobEditor({ ...built, overlay: { draft } }), "basics").roomIds;
  const plain = roomsField(createDraft());
  assert.deepEqual([plain.options[0].value, plain.options[0].icon, plain.options[0].label], ["all", "mdi:select-all", built.texts.t("field.allRooms")]);
  assert.equal(plain.options.some((option) => option.muted), false);
  const all = roomsField(applyDraftChange(createDraft(), "allRooms", true));
  assert.deepEqual(all.value, ["all"]);
  assert.ok(all.options.slice(1).length > 0 && all.options.slice(1).every((option) => option.muted));
  assert.equal(all.hint, built.texts.t("editor.allRoomsJob"));
  assert.equal(roomsField(applyDraftChange(createDraft({ kind: "template" }), "allRooms", true)).hint, built.texts.t("editor.allRoomsTemplate"));
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
  assert.deepEqual(vm.execution[0].robots.map((robot) => robot.reason), [built.texts.backend("robot_busy"), built.texts.backend("unsupported_operation")]);
  assert.deepEqual([vm.actions.delete.state, vm.actions.retry.state], ["enabled", "hidden"]);
  assert.equal(vm.execution[0].robots[0].settings, "Mop route: Standard instead of Deep");
  assert.equal(vm.saveAsTemplate.state, "enabled");
  const facts = Object.fromEntries(vm.facts.map((fact) => [fact.label, fact.value]));
  assert.equal(facts[built.texts.t("detail.occasion")], built.texts.t("origin.template"), "without the templates read the origin stands alone");
});

test("the occasion names the origin with its template and the job's own reason; settings notes name each deviation", async () => {
  const { occasionText, settingsNote } = await overlays("job-detail");
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const built = await modelFor("typical", { requests: { templates: { name: "templates", params: {} } } });
  const template = built.model.slots.templates.data.items[0];
  const fromTemplate = normalizeJob(W.wireJob({ origin: { kind: "automatic", template_id: template.templateId }, reason: "Guests tonight" }));
  assert.equal(occasionText(built.texts, fromTemplate, built.model), `Created when due “${template.name}” · Guests tonight`);
  assert.equal(occasionText(built.texts, normalizeJob(W.wireJob({ origin: { kind: "template", template_id: "template-gone" } })), built.model), "From a template", "a removed template is not named");
  assert.equal(occasionText(built.texts, normalizeJob(W.wireJob({ origin: null })), built.model), null);
  const note = settingsNote(built.texts, [{ field: "vacuumPower", requested: "maximum_plus", applied: "maximum" }, { field: "mopIntensity", requested: "high", applied: null }, { field: "mopRoute", requested: "deep", applied: "deep" }]);
  assert.equal(note, `${built.texts.t("detail.settingFallback", { setting: "Suction", applied: "Max", requested: "Max+" })}, ${built.texts.t("detail.settingMissing", { setting: "Water" })}`);
  assert.equal(settingsNote(built.texts, []), null);
});

test("a job is saved as a template under a required name; the defaults page offers every rung", async () => {
  const { buildSaveTemplate, buildJobDefaults } = await import("../../../../src/presentation/overlays/job-defaults.js");
  const built = await modelFor("typical");
  const save = buildSaveTemplate({ ...built, overlay: { jobId: "job-kitchen", name: "Kitchen and hall", automatic: false } });
  assert.deepEqual([save.job, save.fields.map((entry) => entry.key), save.fields[0].error, save.save.state], ["Kitchen and hall", ["overlay:name", "overlay:automatic"], null, "enabled"]);
  assert.equal(buildSaveTemplate({ ...built, overlay: { jobId: "job-kitchen", name: " ", submitted: true } }).fields[0].error, built.texts.t("validation.template_name_required"));
  assert.equal(buildSaveTemplate({ ...built, overlay: { jobId: "job-gone" } }).job, null);
  const defaults = buildJobDefaults({ ...built, overlay: { mode: "mop", vacuumPower: "standard", mopIntensity: "medium", mopRoute: "deep", passes: 1, settingsPolicy: "strict" } });
  const fields = Object.fromEntries(defaults.fields.map((entry) => [entry.key, entry]));
  assert.deepEqual(Object.keys(fields), ["overlay:mode", "overlay:vacuumPower", "overlay:mopIntensity", "overlay:mopRoute", "overlay:passes", "overlay:settingsPolicy"]);
  assert.deepEqual(fields["overlay:vacuumPower"].options.map((option) => option.label), ["Quiet", "Standard", "High", "Max", "Max+"]);
  assert.equal(fields["overlay:mopRoute"].value, "deep");
  assert.deepEqual([defaults.invalid, defaults.save.state, defaults.pending], [false, "enabled", false]);
});

test("a job waiting between phases explains why and offers the release the integration names", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const built = await modelFor("typical", { requests: { job: { name: "job", params: { jobId: "job-kitchen" } } }, setup: (fake) => {
    fake.setJob("job-kitchen", { state: "dispatching", active_attempt_id: null });
    fake.setReadiness("job-kitchen", { state: "blocked", reason_codes: ["room_not_released"], blocked_room_ids: ["room-kitchen"] });
  } });
  const vm = buildJobDetail({ ...built, overlay: { jobId: "job-kitchen" }, config: {} });
  assert.equal(vm.state, "dispatching");
  assert.equal(vm.readiness.state, "blocked");
  assert.deepEqual(vm.releaseable.map((room) => room.roomId), ["room-kitchen"]);
  const running = await modelFor("typical", { requests: { job: { name: "job", params: { jobId: "job-running" } } } });
  assert.equal(buildJobDetail({ ...running, overlay: { jobId: "job-running" }, config: {} }).readiness, null, "a running attempt is not re-evaluated");
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
  assert.equal(settings.field.error, built.texts.t("validation.queue_grace_out_of_range"));
  assert.equal(dialogs.buildQueueSettings({ ...built, overlay: { minutes: 15 } }).field.error, null);
});

test("cancelling a started job and ending the queue offer their choices as radios", async () => {
  const dialogs = await overlays("dialogs");
  const built = await modelFor("typical");
  const cancel = dialogs.buildCancelJob({ ...built, overlay: { jobId: "job-running", afterCancel: "return_to_dock" } });
  assert.deepEqual([cancel.field.control, cancel.field.key, cancel.field.value], ["radios", "overlay:afterCancel", "return_to_dock"]);
  assert.deepEqual(cancel.field.options.map((option) => option.value), ["return_to_dock", "stay"]);
  assert.ok(cancel.field.options.every((option) => option.label && option.description));
  assert.deepEqual([cancel.confirmLabel, cancel.pending], [built.texts.t("confirm.cancelJob.confirm"), false]);
  assert.match(cancel.lead, /Living room/);
  const end = dialogs.buildQueueEnd({ ...built, overlay: { choice: "finish" } });
  assert.deepEqual(end.field.options.map((option) => option.value), ["finish", "cancel_return", "cancel_stay"]);
  assert.deepEqual(dialogs.queueEndChoices({ slots: {} }), ["finish", "cancel_stay"]);
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

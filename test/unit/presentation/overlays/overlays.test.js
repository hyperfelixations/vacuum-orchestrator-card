// The pages that replace the tabs: job and template editor, job detail with the execution
// explanation, the small dialogs, room release and settings, robot discovery and profile. Every
// page reads the integration's recordings at named marks.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");
const W = require("../../../helpers/voi-records.js");

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

const BUSY = "A busy afternoon";
const TEMPLATES = { templates: { name: "templates", params: {} } };
const busy = (requests = {}, options = {}) => modelFor("showcase", { from: BUSY, requests, ...options });
const roomId = (model, name) => model.slots.rooms.data.items.find((room) => room.name === name).roomId;
const robotId = (model, name) => model.slots.robots.data.items.find((robot) => robot.name === name).robotId;
// The open job of a room: queued jobs from the queue page, running ones from the open jobs.
const jobIn = (model, name) => {
  const id = roomId(model, name);
  return [...model.slots.queue.data.jobs, ...model.slots.openJobs.data.jobs].find((job) => job.roomIds.includes(id));
};
const jobRequests = (jobId) => ({
  job: { name: "job", params: { jobId } },
  execution: { name: "execution", params: { jobId } },
  trace: { name: "trace", params: { jobId } },
});
// An error code in the integration's own words, as its translations say it.
const said = (built, code) => {
  const text = built.texts.backend(code, { code, detail: "" });
  assert.ok(text && text !== code, `the integration words ${code}`);
  return text;
};
// A new draft from the integration's job defaults, as the editor starts one.
const newDraft = async (model, changes = {}) => {
  const { createDraft, applyDraftChange } = await draftModule();
  let draft = createDraft({ jobDefaults: model.slots.queue.data.jobDefaults });
  for (const [key, value] of Object.entries(changes)) draft = applyDraftChange(draft, key, value);
  return draft;
};

test("a new job editor offers rooms by name with a mark for unreachable and unreleased rooms", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const built = await modelFor("room_controls", { from: "The library is released for 75 minutes", needsEntityCatalog: true });
  const vm = buildJobEditor({ ...built, overlay: { kind: "job-editor", draft: await newDraft(built.model) } });
  assert.equal(vm.title, built.texts.t("editor.newJob"));
  assert.equal(vm.save.label, built.texts.t("action.addToQueue"));
  assert.equal(vm.remove, null);
  const rooms = fieldsOf(vm, "basics").roomIds.options;
  assert.deepEqual(rooms.map((room) => [room.label, room.badge]), [
    ["All rooms", undefined],
    ["Conservatory", "mdi:robot-vacuum-alert"],
    ["Dining Room", "mdi:lock-outline"],
    ["Library", null],
    ["Studio", "mdi:lock-outline"],
  ]);
});

test("the editor shows only the settings the mode uses, and the integration's errors at their fields", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { applyDraftChange } = await draftModule();
  const built = await busy();
  const draft = await newDraft(built.model);
  const vacuum = buildJobEditor({ ...built, overlay: { draft } });
  assert.deepEqual(Object.keys(fieldsOf(vacuum, "settings")), ["vacuumPower", "passes"]);
  assert.deepEqual(fieldsOf(vacuum, "settings").vacuumPower.options.map((option) => [option.value, option.badge]), ["low", "standard", "high", "maximum", "maximum_plus"].map((value) => [value, null]), "without a preview every rung is offered");
  const mop = buildJobEditor({ ...built, overlay: { draft: applyDraftChange(draft, "mode", "mop") } });
  assert.deepEqual(Object.keys(fieldsOf(mop, "settings")), ["mopIntensity", "mopRoute", "passes"]);
  assert.deepEqual(Object.keys(fieldsOf(mop, "basics")), ["name", "roomIds", "mode"]);
  assert.deepEqual(Object.keys(fieldsOf(mop, "more")), ["settingsPolicy", "note", "requiredOn", "requiredOff"]);
  assert.deepEqual([fieldsOf(vacuum, "basics").roomIds.error, vacuum.invalid], [null, null]);
  const rejected = buildJobEditor({ ...built, overlay: { draft, errors: { roomIds: "unknown_room", note: "empty_note" } } });
  assert.equal(rejected.invalid, built.texts.t("editor.fixErrors"));
  assert.equal(fieldsOf(rejected, "basics").roomIds.error, said(built, "unknown_room"));
  assert.deepEqual([fieldsOf(rejected, "more").note.error, rejected.groups.find((group) => group.key === "more").open], [said(built, "empty_note"), true], "the group with an error opens");
  const held = buildJobEditor({ ...built, overlay: { draft, errors: null, formError: "job_held" } });
  assert.equal(held.invalid, said(built, "job_held"), "an error of the input as a whole stands above the form");
});

test("the preview limits the rungs, marks those not every robot offers and allows starting at once", async () => {
  const { buildJobEditor, settingChoices } = await overlays("job-editor");
  const { createDraft, draftToPreview } = await draftModule();
  const previewOf = (draft) => ({ preview: { name: "preview", params: draftToPreview(draft) } });

  const either = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const dining = await newDraft(either.model, { roomIds: [roomId(either.model, "Dining Room")] });
  const shared = await modelFor("robot_choice", { from: "Either robot can start the dining room", requests: previewOf(dining) });
  const power = fieldsOf(buildJobEditor({ ...shared, overlay: { draft: dining } }), "settings").vacuumPower;
  assert.equal(power.value, "standard");
  assert.ok(power.options.every((option) => option.badge === "mdi:information-outline" && option.title === shared.texts.t("editor.notEveryRobot")), "Dusty sets no suction");

  const docked = await modelFor("queue_controls", { from: "Rocky is back at its dock" });
  const studio = await newDraft(docked.model, { roomIds: [roomId(docked.model, "Studio")] });
  const ready = await modelFor("queue_controls", { from: "Rocky is back at its dock", requests: previewOf(studio) });
  const vm = buildJobEditor({ ...ready, overlay: { draft: studio } });
  assert.ok(fieldsOf(vm, "settings").vacuumPower.options.every((option) => option.badge === null), "Rocky alone offers every rung");
  assert.equal(vm.startNow.label, ready.texts.t("action.startNow"));

  const plain = await busy();
  const diningRoom = await newDraft(plain.model, { roomIds: [roomId(plain.model, "Dining Room")] });
  const built = await busy(previewOf(diningRoom));
  assert.equal(buildJobEditor({ ...built, overlay: { draft: diningRoom } }).startNow, null, "Rocky is busy");
  const library = jobIn(built.model, "Library");
  assert.deepEqual(settingChoices(createDraft({ target: library }), built.model.slots.preview.data)[0].value, library.vacuumPower, "an existing job keeps its wish");
  assert.equal(buildJobEditor({ ...ready, overlay: { draft: createDraft({ target: library }) } }).startNow, null, "an existing job is started from the queue");
});

test("the room choice starts with all rooms; chosen, it mutes the single rooms and says what it means", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, applyDraftChange } = await draftModule();
  const built = await busy();
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
  const built = await busy(TEMPLATES);
  const library = jobIn(built.model, "Library");
  const job = buildJobEditor({ ...built, overlay: { draft: createDraft({ target: library }) } });
  assert.deepEqual([job.remove.action, job.remove.decision.state], ["delete-job", "enabled"]);
  assert.equal(job.save.label, built.texts.t("action.save"));
  const template = built.model.slots.templates.data.items[0];
  const editor = buildJobEditor({ ...built, overlay: { draft: createDraft({ kind: "template", target: template }) } });
  assert.equal(editor.groups[0].key, "template");
  assert.deepEqual([editor.remove.action, editor.remove.args], ["remove-template", { templateId: template.templateId }]);
});

// UI-06: the detail page names every reason of the three axes.
test("the detail page shows the waiting reason on three axes, unreleased rooms to release and the execution explanation", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const conservatory = jobIn((await busy()).model, "Conservatory");
  const built = await busy(jobRequests(conservatory.jobId));
  const vm = buildJobDetail({ ...built, overlay: { jobId: conservatory.jobId }, config: {} });
  assert.equal(vm.title, "Conservatory");
  assert.equal(vm.position, 1);
  assert.deepEqual(vm.waiting.job.items.map((item) => item.text), ["Waiting for release", "Conservatory Door: off – required: on"], "the room in the title is not repeated; the door names its state and the one required");
  assert.deepEqual([vm.waiting.job.ready, vm.waiting.robots.ready, vm.waiting.queue.ready], [false, false, true]);
  assert.deepEqual(vm.waiting.robots.items.map((item) => [item.never, item.text]), [[true, "Rocky does not reach this room"]], "the sentence names the robot");
  assert.deepEqual(vm.waiting.queue.items, []);
  assert.deepEqual(vm.releaseable.map((room) => [room.roomId, room.decision.state]), [[roomId(built.model, "Conservatory"), "enabled"]]);
  assert.equal(vm.execution, null, "one phase without deviating settings: the robot axis says it all");
  assert.deepEqual([vm.actions.delete.state, vm.actions.retry.state], ["enabled", "hidden"]);
  assert.equal(vm.saveAsTemplate.state, "enabled");
  const facts = Object.fromEntries(vm.facts.map((fact) => [fact.label, fact.value]));
  assert.deepEqual([facts.Origin, facts[built.texts.t("detail.occasion")]], ["Added by hand", "Guests are coming"], "how the job came and its occasion stand apart");
  assert.equal(facts[built.texts.t("detail.updated")], null, "a job never changed since it was created names one moment");
});

// Before a start, the phases explain what the robot axis does not: here that Dusty, an area vacuum
// without suction levels, would not set the suction.
test("the phases explain a robot that would apply a setting differently; the queue axis says what the queue does", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const plain = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const dining = jobIn(plain.model, "Dining Room");
  const built = await modelFor("robot_choice", { from: "Either robot can start the dining room", requests: jobRequests(dining.jobId) });
  const vm = buildJobDetail({ ...built, overlay: { jobId: dining.jobId }, config: {} });
  assert.deepEqual(vm.waiting.robots.items.map((item) => item.text), ["Rocky can take it now", "Dusty can take it now"]);
  assert.deepEqual(vm.waiting.queue.items.map((item) => item.text), ["The queue is not running", "Start delay ends in 5 seconds"]);
  assert.deepEqual(vm.execution.map((group) => [group.key, group.robots.map((robot) => [robot.name, robot.reason, robot.settings])]), [["vacuum", [["Rocky", "Can take it now", null], ["Dusty", "Can take it now", "Suction: not adjustable"]]]]);
});

test("the origin names its template while it exists; settings notes name each deviation", async () => {
  const { originText, settingsNote } = await overlays("job-detail");
  const { normalizeJob } = await import("../../../../src/domain/job.js");
  const built = await busy(TEMPLATES);
  const template = built.model.slots.templates.data.items[0];
  const fromTemplate = normalizeJob(W.wireJob({ origin: { kind: "automatic", template_id: template.templateId }, reason: "Guests tonight" }));
  assert.equal(originText(built.texts, fromTemplate, built.model), `Created when due “${template.name}”`, "the occasion is not part of the origin");
  assert.equal(originText(built.texts, normalizeJob(W.wireJob({ origin: { kind: "template", template_id: "template-gone" } })), built.model), "From a template", "a removed template is not named");
  assert.equal(originText(built.texts, normalizeJob(W.wireJob({ origin: null })), built.model), null);
  const note = settingsNote(built.texts, [{ field: "vacuumPower", requested: "maximum_plus", applied: "maximum" }, { field: "mopIntensity", requested: "high", applied: null }, { field: "mopRoute", requested: "deep", applied: "deep" }]);
  assert.equal(note, `${built.texts.t("detail.settingFallback", { setting: "Suction", applied: "Max", requested: "Max+" })}, ${built.texts.t("detail.settingMissing", { setting: "Water" })}`);
  assert.equal(settingsNote(built.texts, []), null);
});

test("a job is saved as a template under a name; the defaults page offers every rung", async () => {
  const { buildSaveTemplate, buildJobDefaults } = await import("../../../../src/presentation/overlays/job-defaults.js");
  const built = await busy();
  const library = jobIn(built.model, "Library");
  const save = buildSaveTemplate({ ...built, overlay: { jobId: library.jobId, name: "Library twice", automatic: false } });
  assert.deepEqual([save.job, save.fields.map((entry) => entry.key), save.fields[0].error, save.save.state], ["Library, thoroughly", ["overlay:name", "overlay:automatic"], null, "enabled"]);
  const unnamed = buildSaveTemplate({ ...built, overlay: { jobId: library.jobId, name: " ", errors: { "overlay:name": "empty_name" } } });
  assert.deepEqual([unnamed.fields[0].error, unnamed.invalid], [said(built, "empty_name"), built.texts.t("editor.fixErrors")]);
  assert.equal(buildSaveTemplate({ ...built, overlay: { jobId: "job-gone" } }).job, null);
  const defaults = buildJobDefaults({ ...built, overlay: { mode: "mop", vacuumPower: "standard", mopIntensity: "medium", mopRoute: "deep", passes: 1, settingsPolicy: "strict" } });
  const fields = Object.fromEntries(defaults.fields.map((entry) => [entry.key, entry]));
  assert.deepEqual(Object.keys(fields), ["overlay:mode", "overlay:vacuumPower", "overlay:mopIntensity", "overlay:mopRoute", "overlay:passes", "overlay:settingsPolicy"]);
  assert.deepEqual(fields["overlay:vacuumPower"].options.map((option) => option.label), ["Quiet", "Standard", "High", "Max", "Max+"]);
  assert.equal(fields["overlay:mopRoute"].value, "deep");
  assert.deepEqual([defaults.invalid, defaults.save.state, defaults.pending], [null, "enabled", false]);
  const tooMany = buildJobDefaults({ ...built, overlay: { mode: "vacuum", passes: 4, errors: { "overlay:passes": "out_of_range" } } });
  assert.equal(tooMany.fields.find((entry) => entry.key === "overlay:passes").error, said(built, "out_of_range"));
});

test("a running job shows its progress and no waiting reason; a job the integration no longer has is a missing page", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const studio = jobIn((await busy()).model, "Studio");
  const running = await busy(jobRequests(studio.jobId));
  const page = buildJobDetail({ ...running, overlay: { jobId: studio.jobId }, config: {} });
  assert.equal(page.waiting, null);
  assert.equal(page.execution, null, "a started job is not explained as if it were to start");
  assert.match(page.progress.line, /^Rocky · started on Mar 14, 2026, \d{1,2}:\d{2} (AM|PM)$/, "the detail page says the start absolute");
  const vm = buildJobDetail({ ...running, overlay: { jobId: "job-gone" }, config: {} });
  assert.equal(vm.jobId, undefined);
  assert.equal(vm.title, running.texts.t("detail.title"));
});

test("the small dialogs word their command and show the integration's verdict on their input", async () => {
  const dialogs = await overlays("dialogs");
  const choice = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const dining = jobIn(choice.model, "Dining Room");
  const built = await modelFor("robot_choice", { from: "Either robot can start the dining room", requests: jobRequests(dining.jobId) });
  const confirm = dialogs.buildConfirm({ ...built, overlay: { titleKey: "confirm.deleteJob.title", textKey: "confirm.deleteJob.text", confirmKey: "confirm.deleteJob.confirm", jobId: dining.jobId, command: { options: { target: `job:${dining.jobId}` } } } });
  assert.match(confirm.text, /Dining Room/);
  assert.equal(confirm.tone, "danger");
  assert.equal(confirm.confirmIcon, "mdi:check", "without an icon of its own the confirmation shows a check");
  assert.equal(dialogs.buildConfirm({ ...built, overlay: { titleKey: "confirm.cancelJob.title", textKey: "confirm.cancelJob.text", confirmKey: "confirm.cancelJob.confirm", icon: "mdi:stop-circle-outline", jobId: dining.jobId, command: {} } }).confirmIcon, "mdi:stop-circle-outline");
  const start = dialogs.buildStartJob({ ...built, overlay: { jobId: dining.jobId } });
  assert.match(start.lead, /Dining Room/);
  assert.deepEqual(start.robots.map((robot) => robot.name).sort(), ["Dusty", "Rocky"]);
  const recovery = await modelFor("recovery", { from: "The job needs clarification" });
  const rocky = robotId(recovery.model, "Rocky");
  const stuck = dialogs.buildRecovery({ ...recovery, overlay: { robotId: rocky, confirmStopped: false } });
  assert.equal(stuck.open, true);
  assert.equal(stuck.reason, recovery.texts.t("failure.robot_connection_lost"));
  assert.equal(dialogs.buildRecovery({ ...built, overlay: { robotId: robotId(built.model, "Rocky") } }).open, false);
  const settings = dialogs.buildQueueSettings({ ...built, overlay: { minutes: 2000, errors: { "overlay:minutes": "out_of_range" } } });
  assert.deepEqual([settings.field.error, settings.field.max], [said(built, "out_of_range"), 1440]);
  assert.deepEqual([dialogs.buildQueueSettings({ ...built, overlay: { minutes: 15 } }).field.error, dialogs.buildQueueSettings({ ...built, overlay: { minutes: 15 } }).invalid], [null, null]);
});

test("cancelling a started job and ending the queue offer their choices as radios", async () => {
  const dialogs = await overlays("dialogs");
  const built = await busy();
  const studio = jobIn(built.model, "Studio");
  const cancel = dialogs.buildCancelJob({ ...built, overlay: { jobId: studio.jobId, afterCancel: "return_to_dock" } });
  assert.deepEqual([cancel.field.control, cancel.field.key, cancel.field.value], ["radios", "overlay:afterCancel", "return_to_dock"]);
  assert.deepEqual(cancel.field.options.map((option) => option.value), ["return_to_dock", "stay"]);
  assert.ok(cancel.field.options.every((option) => option.label && option.description));
  assert.deepEqual([cancel.confirmLabel, cancel.pending], [built.texts.t("confirm.cancelJob.confirm"), false]);
  assert.match(cancel.lead, /Studio/);
  const end = dialogs.buildQueueEnd({ ...built, overlay: { choice: "finish" } });
  assert.deepEqual(end.field.options.map((option) => option.value), ["finish", "cancel_return", "cancel_stay"]);
  assert.deepEqual([cancel.title, end.title], ["Cancel job?", "End queue?"], "a confirmation asks, like every other one");
  assert.deepEqual(dialogs.queueEndChoices({ slots: {} }), ["finish", "cancel_stay"]);
});

test("a release offers the four kinds; a timed one asks for its duration", async () => {
  const { buildRelease } = await overlays("rooms");
  const built = await busy();
  const locked = buildRelease({ ...built, overlay: { roomId: roomId(built.model, "Conservatory") } });
  assert.deepEqual(locked.fields[0].options.map((option) => option.value), ["permanent", "once", "timed", "queue_run"]);
  assert.equal(locked.fields.length, 1);
  assert.equal(locked.revoke.state, "hidden");
  const timed = buildRelease({ ...built, overlay: { roomId: roomId(built.model, "Studio"), releaseKind: "timed", hours: 0, minutes: 0, errors: { "overlay:duration": "release_duration_mismatch" } } });
  assert.equal(timed.fields.length, 3);
  assert.deepEqual([timed.fields[1].error, timed.fields[2].error], [null, said(built, "release_duration_mismatch")], "the duration's error sits below hours and minutes");
  assert.equal(timed.revoke.state, "enabled");
  assert.equal(buildRelease({ ...built, overlay: { roomId: "room-gone" } }).missing, true);
});

test("room settings show detected robot targets and the occupancy fields only for occupied time", async () => {
  const { buildRoomEditor, buildRoomCreate } = await overlays("rooms");
  const { createRoomDraft, updateRoomDraft } = await import("../../../../src/domain/room-draft.js");
  const built = await busy({}, { needsEntityCatalog: true });
  const room = built.model.slots.rooms.data.items.find((entry) => entry.name === "Dining Room");
  const draft = createRoomDraft(room);
  const vm = buildRoomEditor({ ...built, overlay: { draft } });
  assert.deepEqual(vm.detected.map((item) => item.key), [robotId(built.model, "Rocky")]);
  assert.equal(fieldsOf(vm, "due").occupancyEntityId, undefined);
  const occupied = buildRoomEditor({ ...built, overlay: { draft: updateRoomDraft(draft, "basis", "occupied"), errors: { occupancyEntityId: "required_field", unoccupiedState: "invalid_value" } } });
  assert.deepEqual([fieldsOf(occupied, "due").occupancyEntityId.error, fieldsOf(occupied, "due").occupiedState.error, fieldsOf(occupied, "due").unoccupiedState.error], [said(built, "required_field"), null, said(built, "invalid_value")]);
  const create = buildRoomCreate({ ...built, overlay: { name: "" } });
  assert.deepEqual(create.fields[1].options.map((option) => option.value), [null], "every area already has its room");
  const unnamed = buildRoomCreate({ ...built, overlay: { name: " ", errors: { "overlay:name": "empty_name" } } });
  assert.deepEqual([unnamed.fields[0].error, unnamed.invalid], [said(built, "empty_name"), built.texts.t("editor.fixErrors")]);
});

test("robot discovery marks configured vacuums; the profile explains each role", async () => {
  const { buildRobotAdd, buildRobotEditor } = await overlays("robots");
  const { createRobotDraft, updateRobotDraft } = await import("../../../../src/domain/robot-draft.js");
  const built = await modelFor("robot_choice", { from: "Either robot can start the dining room", needsEntityCatalog: true });
  const add = buildRobotAdd(built);
  assert.deepEqual(add.candidates.map((candidate) => [candidate.entityId, candidate.configured]), [["vacuum.rocky", true], ["vacuum.dusty", true]]);
  const dusty = built.model.slots.robots.data.items.find((robot) => robot.name === "Dusty");
  let draft = createRobotDraft(dusty);
  const vm = buildRobotEditor({ ...built, overlay: { draft, open: [] } });
  const roles = Object.fromEntries(vm.sections.roles.rows.map((row) => [row.key, row]));
  assert.equal(roles.error.mode.hint, built.texts.t("robotEditor.roleNotFound"));
  draft = updateRobotDraft(draft, "roles.error.mode", "entity");
  const picking = buildRobotEditor({ ...built, overlay: { draft, open: [], errors: { "roles.error": "required_field", physicalRobotId: "invalid_value" } } });
  const error = picking.sections.roles.rows.find((row) => row.key === "error");
  assert.equal(error.entity.single, true);
  assert.equal(error.entity.error, said(built, "required_field"));
  assert.deepEqual([picking.sections.roles.open, picking.sections.identity.open, picking.sections.timeouts.open], [true, true, false], "a section with an error opens");
  assert.equal(picking.sections.identity.fields.find((entry) => entry.key === "physicalRobotId").error, said(built, "invalid_value"));
  assert.equal(vm.remove.state, "enabled");
  const cleaning = await busy({}, { needsEntityCatalog: true });
  const rocky = cleaning.model.slots.robots.data.items.find((robot) => robot.name === "Rocky");
  assert.equal(buildRobotEditor({ ...cleaning, overlay: { draft: createRobotDraft(rocky), open: [] } }).remove.reason, "robot_busy");
});

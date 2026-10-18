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
  assert.deepEqual([vm.saveAsTemplate.action, vm.saveAsTemplate.decision.state], ["open-save-draft-template", "enabled"], "a new job too may become a template");
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
  assert.deepEqual(Object.keys(fieldsOf(mop, "basics")), ["roomIds", "mode"]);
  assert.deepEqual(Object.keys(fieldsOf(mop, "more")), ["name", "reason", "note", "settingsPolicy", "requiredOn", "requiredOff"], "what is rarely set waits behind more options");
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
  assert.ok(power.options.every((option) => option.badge === null), "the same mark on every level tells nothing");
  assert.equal(power.warning, shared.texts.t("editor.notEveryRobot"), "the chosen level says it in words: Dusty sets no suction");

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
  assert.equal(plain.options.some((option) => option.included), false);
  const all = roomsField(applyDraftChange(createDraft(), "allRooms", true));
  assert.deepEqual(all.value, ["all"]);
  // V6: with "All rooms" the rooms are part of the job, shown as included rather than greyed out.
  assert.ok(all.options.slice(1).length > 0 && all.options.slice(1).every((option) => option.included && option.title === built.texts.t("editor.includedInAllRooms")));
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
  // What a template cleans comes before how it is used, so it shows without scrolling.
  assert.deepEqual(editor.groups.map((group) => [group.key, group.fields.map((field) => field.key)]).slice(0, 2), [["template", ["templateName"]], ["basics", ["roomIds", "mode"]]]);
  assert.deepEqual(editor.groups.find((group) => group.key === "use").fields.map((field) => field.key), ["enabled", "automatic"]);
  assert.deepEqual(editor.groups.map((group) => group.key), ["template", "basics", "settings", "use", "more"]);
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
  // V6: the mode carries the same icon as in the queue row, and the water amount another one.
  const { MODE_ICONS, SETTING_ICONS } = await import("../../../../src/presentation/views/job-row.js");
  assert.equal(vm.modeIcon, MODE_ICONS.mop);
  assert.notEqual(SETTING_ICONS.mopIntensity, MODE_ICONS.mop);
  assert.deepEqual(vm.waiting.job.items.map((item) => item.text), ["Waiting for release", "Conservatory Door: off – required: on"], "the room in the title is not repeated; the door names its state and the one required");
  assert.deepEqual([vm.waiting.job.ready, vm.waiting.robots.ready, vm.waiting.queue.ready], [false, false, true]);
  assert.deepEqual(vm.waiting.robots.items.map((item) => [item.never, item.text]), [[true, "Rocky does not reach this room"]], "the sentence names the robot");
  assert.deepEqual(vm.waiting.queue.items, []);
  assert.deepEqual(vm.releaseable.map((room) => [room.roomId, room.decision.state]), [[roomId(built.model, "Conservatory"), "enabled"]]);
  assert.equal(vm.execution, null, "one phase without deviating settings: the robot axis says it all");
  assert.deepEqual([vm.actions.delete.state, vm.actions.retry.state], ["enabled", "hidden"]);
  assert.equal(vm.saveAsTemplate.state, "enabled");
  assert.equal(vm.result, null, "a waiting job has no result yet");
  assert.deepEqual(vm.saveTrace, { action: "save-trace", args: { jobId: conservatory.jobId } }, "its log can be saved");
  const facts = Object.fromEntries(vm.facts.map((fact) => [fact.label, fact.value]));
  assert.deepEqual([facts.Origin, facts[built.texts.t("detail.occasion")]], ["Added by hand", "Guests are coming"], "how the job came and its occasion stand apart");
  assert.equal(facts[built.texts.t("detail.updated")], null, "a job never changed since it was created names one moment");
  // UI-04: the job's ID is diagnostic data; the detail page names the job instead, and a retry
  // names the job it repeats.
  assert.ok(vm.facts.every((fact) => fact.value !== conservatory.jobId));
  const library = jobIn(built.model, "Library");
  const retried = (retriesJobId) => {
    const slots = { ...built.model.slots, job: { ...built.model.slots.job, data: { ...built.model.slots.job.data, retriesJobId } } };
    const detail = buildJobDetail({ ...built, model: { ...built.model, slots }, overlay: { jobId: conservatory.jobId }, config: {} });
    return Object.fromEntries(detail.facts.map((fact) => [fact.label, fact.value]))[built.texts.t("detail.retryOf")];
  };
  assert.deepEqual([retried(library.jobId), retried("00000000-0000-4000-8000-0000000000ff")], ["Library, thoroughly", null]);
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
  assert.deepEqual(vm.execution.map((group) => [group.key, group.robots.map((robot) => [robot.name, robot.reason, robot.settings])]), [["vacuum", [["Rocky", "Can take it now", null], ["Dusty", "Can take it now", "Vacuum power: not adjustable"]]]]);
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
  assert.equal(note, `${built.texts.t("detail.settingFallback", { setting: "Vacuum power", applied: "Max", requested: "Max+" })}, ${built.texts.t("detail.settingMissing", { setting: "Water amount" })}`);
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
  const drafted = buildSaveTemplate({ ...built, overlay: { editorId: 1, name: "Library" } });
  assert.deepEqual([drafted.job, drafted.lead, drafted.save.operation ?? drafted.save.state], [null, built.texts.t("saveTemplate.leadDraft"), "enabled"], "a draft is saved as the editor shows it");
  const defaults = buildJobDefaults({ ...built, overlay: { mode: "mop", vacuumPower: "standard", mopIntensity: "medium", mopRoute: "deep", passes: 1, settingsPolicy: "strict" } });
  // In boxes like the editor: what every job takes, what vacuuming and mopping take, then the
  // rarely set rule, open while it is strict.
  assert.deepEqual(defaults.groups.map((group) => [group.key, group.title, group.fields.map((entry) => entry.key), group.collapsible === true, group.open === true]), [
    ["job", "Every job", ["overlay:mode", "overlay:passes"], false, false],
    ["vacuum", "When vacuuming", ["overlay:vacuumPower"], false, false],
    ["mop", "When mopping", ["overlay:mopIntensity", "overlay:mopRoute"], false, false],
    ["more", "More options", ["overlay:settingsPolicy"], true, true],
  ]);
  const fields = Object.fromEntries(defaults.groups.flatMap((group) => group.fields).map((entry) => [entry.key, entry]));
  assert.equal(fields["overlay:passes"].hint, built.texts.t("field.passesHint"), "the same hint as in the editor");
  assert.deepEqual(fields["overlay:vacuumPower"].options.map((option) => option.label), ["Quiet", "Standard", "High", "Max", "Max+"]);
  assert.equal(fields["overlay:mopRoute"].value, "deep");
  assert.deepEqual([defaults.invalid, defaults.save.state, defaults.pending], [null, "enabled", false]);
  const tooMany = buildJobDefaults({ ...built, overlay: { mode: "vacuum", passes: 4, errors: { "overlay:passes": "out_of_range" } } });
  assert.equal(tooMany.groups[0].fields.find((entry) => entry.key === "overlay:passes").error, said(built, "out_of_range"));
  assert.equal(tooMany.groups.at(-1).open, false, "the rule stays folded while it is the usual one");
  assert.equal(buildJobDefaults({ ...built, overlay: { mode: "vacuum", passes: 1, settingsPolicy: "best_effort", moreOpen: true } }).groups.at(-1).open, true);
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
  const settings = dialogs.buildQueueSettings({ ...built, overlay: { delay: 5, minutes: 2000, errors: { "overlay:minutes": "out_of_range" } } });
  // The grace period comes first, a quick choice before the exact minutes.
  const [quick, grace, delay] = settings.fields;
  assert.deepEqual([quick.key, quick.control, quick.value, quick.options.map((option) => [option.value, option.label])], ["overlay:graceQuick", "segmented", null, [[5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 h"]]]);
  assert.deepEqual([delay.key, delay.value, delay.max, grace.key, grace.error, grace.max], ["overlay:delay", 5, 600, "overlay:minutes", said(built, "out_of_range"), 1440]);
  const fine = dialogs.buildQueueSettings({ ...built, overlay: { delay: 5, minutes: 15 } });
  assert.deepEqual([fine.fields.map((entry) => entry.error ?? null), fine.invalid, fine.fields[0].value], [[null, null, null], null, 15]);
  assert.equal(dialogs.buildQueueSettings({ ...built, overlay: { delay: 5, minutes: "30" } }).fields[0].value, 30, "typed minutes select their quick choice");
});

// V4f, JOB-25, EXE-14, EXE-15: a finished job says how it ended and how sure the integration is,
// its notes in words and when it was corrected, and offers to correct it.
const CORRECTED = "The library job is corrected";
const finishedLibrary = async () => {
  const listed = await modelFor("recovery", { from: CORRECTED, requests: { jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } } } });
  const [library] = listed.model.slots.jobLog.data.jobs;
  return { library, built: await modelFor("recovery", { from: CORRECTED, requests: { ...jobRequests(library.jobId), jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } } } }) };
};

test("a finished job's detail states its result in words and offers a correction", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const { library, built } = await finishedLibrary();
  const vm = buildJobDetail({ ...built, overlay: { jobId: library.jobId }, config: {} });
  const t = built.texts.t;
  assert.deepEqual(vm.result.lines.map((line) => line.text), [t("result.completed.derived"), t("completion.note.reported_by_user")]);
  assert.ok(vm.result.corrected, "when it was corrected");
  assert.deepEqual([vm.result.correct.state, vm.outcome], ["enabled", null], "the result block says how it ended");
});

test("correcting a result offers both outcomes as radios", async () => {
  const dialogs = await overlays("dialogs");
  const { library, built } = await finishedLibrary();
  const vm = dialogs.buildCorrectJob({ ...built, overlay: { jobId: library.jobId, outcome: "failed" } });
  assert.deepEqual([vm.field.control, vm.field.key, vm.field.value], ["radios", "overlay:outcome", "failed"]);
  assert.deepEqual(vm.field.options.map((option) => option.value), ["completed", "failed"]);
  assert.ok(vm.field.options.every((option) => option.label && option.description));
  assert.match(vm.lead, /Library/);
  assert.deepEqual([vm.title, vm.confirmLabel, vm.pending], [built.texts.t("correctJob.title"), built.texts.t("correctJob.confirm"), false]);
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

// REL-04, REL-06, REL-08: one row per room with its own kind; a timed one offers quick choices and
// hours beside minutes; more rooms can be added and, while several are listed, removed again.
test("a release lists each room with its own kind; a timed one asks for its duration", async () => {
  const { buildRelease } = await overlays("rooms");
  const built = await busy();
  const [conservatory, studio] = [roomId(built.model, "Conservatory"), roomId(built.model, "Studio")];
  const one = buildRelease({ ...built, overlay: { rooms: [{ roomId: conservatory, kind: "queue_run", hours: 2, minutes: 0 }] } });
  assert.equal(one.title, "Release Conservatory");
  assert.equal(one.rows.length, 1);
  assert.deepEqual(one.rows[0].kind.options.map((option) => option.value), ["permanent", "once", "timed", "queue_run"]);
  assert.deepEqual([one.rows[0].duration, one.rows[0].removable], [null, false], "one room, no duration for a run-long release");
  assert.equal(one.revoke.state, "hidden");
  assert.deepEqual(one.addable.map((room) => room.name), ["Dining Room", "Studio", "Library"], "every other room can join");
  const two = buildRelease({ ...built, overlay: { rooms: [{ roomId: conservatory, kind: "once", hours: 2, minutes: 0 }, { roomId: studio, kind: "timed", hours: 0, minutes: 0 }], errors: { "release:1:duration": "release_duration_mismatch", "release:0:room": "room_unavailable" } } });
  assert.equal(two.title, "Release rooms");
  assert.deepEqual(two.rows.map((row) => [row.name, row.kind.value, row.removable]), [["Conservatory", "once", true], ["Studio", "timed", true]]);
  assert.deepEqual([two.rows[0].kind.key, two.rows[0].kind.label], ["release:0:kind", "Release Conservatory"], "each row has its own kind, named by its room");
  const duration = two.rows[1].duration;
  assert.deepEqual(duration.quick.options.map((option) => [option.value, option.label]), [[30, "30 min"], [60, "1 h"], [120, "2 h"], [240, "4 h"]]);
  assert.equal(duration.quick.value, null, "no quick choice matches no time");
  assert.deepEqual([duration.hours.key, duration.minutes.key], ["release:1:hours", "release:1:minutes"]);
  assert.deepEqual([duration.hours.error, duration.minutes.error], [null, said(built, "release_duration_mismatch")], "the duration's error sits below hours and minutes");
  assert.equal(two.rows[0].error, said(built, "room_unavailable"), "a room the integration refuses names its row");
  assert.equal(two.rows[1].current, "For a set time", "the release it replaces");
  assert.equal(two.revoke, null, "locking is for one room");
  assert.deepEqual(two.addable.map((room) => room.name), ["Dining Room", "Library"]);
  const quick = buildRelease({ ...built, overlay: { rooms: [{ roomId: studio, kind: "timed", hours: 4, minutes: 0 }] } });
  assert.equal(quick.rows[0].duration.quick.value, 240);
  assert.equal(buildRelease({ ...built, overlay: { rooms: [{ roomId: "room-gone", kind: "queue_run" }] } }).missing, true);
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
  // ROOM-08: an own binding picks the robot's map and its segments by name; without a reported
  // map the targets stay text.
  const rocky = robotId(built.model, "Rocky");
  const bound = buildRoomEditor({ ...built, overlay: { draft: updateRoomDraft(draft, "bindings", [{ robotId: rocky, mapId: "1", targetIds: "16" }]) } });
  const [binding] = bound.bindings;
  assert.deepEqual(binding.mapId.options.map((option) => [option.value, option.label]), [["", built.texts.t("room.bindingCurrentMap")], ["0", "Main Floor"], ["1", "Lower Floor"]]);
  assert.deepEqual([binding.targets.control, binding.targets.value, binding.targets.options.map((option) => [option.value, option.label])], ["chips", ["16"], [["16", "Conservatory"]]]);
  const current = buildRoomEditor({ ...built, overlay: { draft: updateRoomDraft(draft, "bindings", [{ robotId: rocky, mapId: "", targetIds: "" }]) } }).bindings[0];
  assert.deepEqual(current.targets.options.map((option) => option.label), ["Dining Room", "Studio", "Library"], "the current map's segments");
  const unknown = buildRoomEditor({ ...built, overlay: { draft: updateRoomDraft(draft, "bindings", [{ robotId: "robot-gone", mapId: "", targetIds: "kitchen" }]) } }).bindings[0];
  assert.deepEqual([unknown.mapId.control, unknown.targets.control, unknown.targets.value], ["text", "text", "kitchen"]);
  const create = buildRoomCreate({ ...built, overlay: { name: "" } });
  assert.deepEqual(create.fields[1].options.map((option) => option.value), [null], "every area already has its room");
  const unnamed = buildRoomCreate({ ...built, overlay: { name: " ", errors: { "overlay:name": "empty_name" } } });
  assert.deepEqual([unnamed.fields[0].error, unnamed.invalid], [said(built, "empty_name"), built.texts.t("editor.fixErrors")]);
});

// UI-10: the enlarged map names its robot and map; a map that went away is said so.
test("the enlarged map shows the chosen picture with its robot's name", async () => {
  const { buildRobotMap } = await overlays("robots");
  const built = await busy();
  const rocky = built.model.slots.robots.data.items.find((robot) => robot.name === "Rocky");
  const [map] = built.model.robotsLive[rocky.robotId].maps;
  const vm = buildRobotMap({ ...built, overlay: { robotId: rocky.robotId, entityId: map.entityId, rotation: "auto" } });
  // V6: a map by the name the integration gives it, not its image entity's name with the robot's.
  assert.deepEqual([vm.key, vm.title, vm.rotation, vm.missing], ["robot-map", "Rocky · Main Floor", "auto", false]);
  assert.ok(vm.picture.startsWith("/api/image_proxy/"));
  assert.equal(buildRobotMap({ ...built, overlay: { robotId: rocky.robotId, entityId: "image.gone", rotation: "auto" } }).missing, true);
});

// A robot's own name, or Home Assistant's when left empty.
test("renaming a robot offers Home Assistant's name as the one left empty", async () => {
  const { buildRenameRobot } = await overlays("robots");
  const built = await modelFor("setup", { from: "The assistant opens" });
  const [rocky] = built.model.slots.robots.data.items;
  const vm = buildRenameRobot({ ...built, overlay: { robotId: rocky.robotId, name: "" } });
  assert.deepEqual([vm.key, vm.title, vm.field.key, vm.field.placeholder, vm.field.hint, vm.save.state], ["rename-robot", built.texts.t("renameRobot.title", { robot: "Rocky" }), "overlay:name", rocky.haName, built.texts.t("renameRobot.hint"), "enabled"]);
});

test("robot discovery marks configured vacuums; the profile explains each role", async () => {
  const { buildRobotAdd, buildRobotEditor } = await overlays("robots");
  const { createRobotDraft, updateRobotDraft } = await import("../../../../src/domain/robot-draft.js");
  const built = await modelFor("robot_choice", { from: "Either robot can start the dining room", needsEntityCatalog: true });
  const add = buildRobotAdd({ ...built, ui: {} });
  // V6: the entities found for a vacuum are counted and listed only on request.
  const [first] = add.candidates;
  assert.deepEqual([first.rolesOpen, first.rolesLabel], [false, built.texts.t("robotAdd.roles", { count: first.roles.length })]);
  assert.ok(first.roles.length > 1);
  assert.equal(buildRobotAdd({ ...built, ui: { expanded: [first.rolesKey] } }).candidates[0].rolesOpen, true);
  assert.deepEqual(add.candidates.map((candidate) => [candidate.entityId, candidate.configured]), [["vacuum.rocky", true], ["vacuum.dusty", true]]);
  // UI-04: a vacuum is shown by its name and integration, never by its entity ID.
  assert.ok(add.candidates.every((candidate) => candidate.detail && !candidate.detail.includes(candidate.entityId)));
  const dusty = built.model.slots.robots.data.items.find((robot) => robot.name === "Dusty");
  let draft = createRobotDraft(dusty);
  const vm = buildRobotEditor({ ...built, overlay: { draft, open: [] } });
  assert.doesNotMatch(vm.lead, /vacuum\./, "the profile names its vacuum, not its entity ID (UI-04)");
  const rockyRobot = built.model.slots.robots.data.items.find((robot) => robot.name === "Rocky");
  const rockyRoles = Object.fromEntries(buildRobotEditor({ ...built, overlay: { draft: createRobotDraft(rockyRobot), open: [] } }).sections.roles.rows.map((row) => [row.key, row]));
  assert.equal(rockyRoles.battery.mode.hint, built.texts.t("robotEditor.roleDiscovered", { entity: "Rocky Battery" }), "a found entity by its Home Assistant name");
  const roles = Object.fromEntries(vm.sections.roles.rows.map((row) => [row.key, row]));
  assert.equal(roles.error.mode.hint, built.texts.t("robotEditor.roleNotFound"));
  draft = updateRobotDraft(draft, "roles.error.mode", "entity");
  const picking = buildRobotEditor({ ...built, overlay: { draft, open: [], errors: { "roles.error": "required_field", physicalRobotId: "invalid_value" } } });
  const error = picking.sections.roles.rows.find((row) => row.key === "error");
  assert.equal(error.entity.single, true);
  assert.equal(error.entity.error, said(built, "required_field"));
  assert.deepEqual([picking.sections.roles.open, picking.sections.identity.open, picking.sections.timeouts.open], [true, true, false], "a section with an error opens");
  assert.equal(picking.sections.identity.fields.find((entry) => entry.key === "physicalRobotId").error, said(built, "invalid_value"));
  assert.deepEqual([vm.remove.state, vm.rename.state], ["enabled", "enabled"]);
  // UI-18: the areas are offered only once the robot is limited to some; none chosen is said.
  assert.deepEqual([vm.areaScope.value, vm.areaScope.options.map((option) => option.value), vm.areas], ["follow", ["follow", "only"], null]);
  const limited = buildRobotEditor({ ...built, overlay: { draft: updateRobotDraft(createRobotDraft(dusty), "areaScope", "only"), open: [] } });
  assert.deepEqual([limited.areas.key, limited.areas.warning], ["targetAreas", built.texts.t("robotEditor.noAreaChosen")]);
  const cleaning = await busy({}, { needsEntityCatalog: true });
  const rocky = cleaning.model.slots.robots.data.items.find((robot) => robot.name === "Rocky");
  assert.equal(buildRobotEditor({ ...cleaning, overlay: { draft: createRobotDraft(rocky), open: [] } }).remove.reason, "robot_busy");
});

// A change within the same displayed minute reads as no change.
test("a job changed within the minute it was created names one moment", async () => {
  const { buildJobDetail } = await overlays("job-detail");
  const built = await busy();
  const studio = jobIn(built.model, "Studio");
  const full = await busy(jobRequests(studio.jobId));
  const vm = buildJobDetail({ ...full, overlay: { jobId: studio.jobId }, config: { time_format: "absolute" } });
  const facts = Object.fromEntries(vm.facts.map((fact) => [fact.label, fact.value]));
  assert.equal(facts[full.texts.t("detail.updated")], null);
});

// JOB-20, JOB-21: an editor whose hold lapsed keeps its draft, says so and offers to hold the job again;
// once the job no longer waits it offers to add the draft as a new job.
test("an editor without its hold says why and what can still be done", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft } = await draftModule();
  const built = await busy();
  const library = jobIn(built.model, "Library");
  const draft = createDraft({ kind: "job", target: library });
  assert.equal(buildJobEditor({ ...built, overlay: { draft, holdId: "hold-1" } }).hold, null);
  const lapsed = buildJobEditor({ ...built, overlay: { draft, holdId: null, holdLost: true } });
  assert.deepEqual([lapsed.hold.text, lapsed.hold.action, lapsed.hold.label], ["Your edit protection has lapsed. The job may start or be changed elsewhere.", "hold-again", "Protect again"]);
  assert.equal(lapsed.save.decision.state, "enabled", "without a hold the integration decides whether the change is still possible");
  const gone = buildJobEditor({ ...built, overlay: { draft, holdId: null, holdLost: true, holdFailure: { ok: false, code: "job_not_waiting", group: "job", detail: null, channel: "command" } } });
  assert.match(gone.hold.text, /new job/);
  assert.deepEqual([gone.hold.action, gone.hold.label], ["save-as-new-job", "Add as new job"]);
  const taken = buildJobEditor({ ...built, overlay: { draft, holdId: null, holdLost: true, holdFailure: { ok: false, code: "job_held", group: "job", detail: "edit", channel: "command" } } });
  assert.deepEqual([taken.hold.action, taken.hold.label], ["hold-again", "Protect again"], "a job held elsewhere still waits: protecting it again is the way on");
});

// JOB-23, R16: title, occasion and note are optional inputs; the title's placeholder is the name
// the job will carry, after its rooms. A template has no occasion: saving one drops it.
test("the editor offers an optional occasion and previews the title the job will carry", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, applyDraftChange, toggleRoom } = await draftModule();
  const built = await busy();
  const [dining, studio] = [roomId(built.model, "Dining Room"), roomId(built.model, "Studio")];
  const editor = (draft) => buildJobEditor({ ...built, overlay: { draft } });
  const more = (draft) => fieldsOf(editor(draft), "more");
  const empty = more(createDraft());
  assert.deepEqual(Object.keys(empty).slice(0, 2), ["name", "reason"]);
  assert.equal(empty.reason.optionalLabel, "optional");
  assert.equal(empty.name.placeholder, "Named after its rooms");
  assert.equal(editor(createDraft()).groups.find((group) => group.key === "more").open, false, "rarely set, so folded away");
  const two = more(toggleRoom(toggleRoom(createDraft(), studio), dining));
  assert.equal(two.name.placeholder, "Studio, Dining Room", "the rooms in the order chosen");
  assert.equal(more(toggleRoom(createDraft(), "all")).name.placeholder, "Named after its rooms", "the integration decides which rooms all rooms takes");
  const occasion = applyDraftChange(createDraft(), "reason", "Guests are coming");
  assert.deepEqual([more(occasion).reason.value, editor(occasion).groups.find((group) => group.key === "more").open], ["Guests are coming", true], "a set text keeps its group open");
  assert.equal(editor(applyDraftChange(createDraft(), "name", "Before the party")).groups.find((group) => group.key === "more").open, true);
  const template = fieldsOf(buildJobEditor({ ...built, overlay: { draft: createDraft({ kind: "template" }) } }), "more");
  assert.deepEqual(Object.keys(template).includes("reason") || Object.keys(template).includes("name"), false, "a template has its own name and no occasion");
});

// The editor says in words what a room choice means before the job waits for it: rooms no robot
// reaches yet and rooms not released. For all rooms the integration's preview names the rooms no
// robot reaches; which of them are released does not matter to such a job yet.
test("the room choice names rooms no robot reaches and rooms not released", async () => {
  const { buildJobEditor } = await overlays("job-editor");
  const { createDraft, toggleRoom, draftToPreview } = await draftModule();
  const plain = await busy();
  const [conservatory, dining] = [roomId(plain.model, "Conservatory"), roomId(plain.model, "Dining Room")];
  const rooms = (built, draft) => {
    const field = fieldsOf(buildJobEditor({ ...built, overlay: { draft } }), "basics").roomIds;
    return [field.hint, field.warning];
  };
  assert.deepEqual(rooms(plain, toggleRoom(createDraft(), dining)), [null, null], "a released room Rocky reaches needs no word");
  assert.deepEqual(rooms(plain, toggleRoom(createDraft(), conservatory)), [null, "No robot reaches Conservatory yet. The job waits until one does. Not released yet: Conservatory."]);
  const all = toggleRoom(createDraft(), "all");
  const previewed = await busy({ preview: { name: "preview", params: draftToPreview(all) } });
  assert.deepEqual(rooms(previewed, all), ["Every active room; the job keeps the rooms active now.", "No robot reaches Conservatory yet. The job waits until one does."], "what the choice means apart from what follows from it");
  const template = toggleRoom(createDraft({ kind: "template" }), "all");
  const forTemplate = await busy({ preview: { name: "preview", params: draftToPreview(template) } });
  assert.equal(rooms(forTemplate, template)[1], "No robot reaches Conservatory yet. Its jobs wait until one does.", "a template is no job; the jobs it makes wait");
});

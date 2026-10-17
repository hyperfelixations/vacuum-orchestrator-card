// The view models of the eight views, read from the integration's recordings at named marks.
// Every value shown is the integration's or Home Assistant's; the views only order, group and
// word it.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");

const LOADERS = {
  queue: () => import("../../../../src/presentation/views/queue.js"),
  rooms: () => import("../../../../src/presentation/views/rooms.js"),
  robots: () => import("../../../../src/presentation/views/robots.js"),
  templates: () => import("../../../../src/presentation/views/templates.js"),
  history: () => import("../../../../src/presentation/views/history.js"),
  diagnostics: () => import("../../../../src/presentation/views/diagnostics.js"),
  setup: () => import("../../../../src/presentation/views/setup.js"),
  settings: () => import("../../../../src/presentation/views/settings.js"),
};
const view = (name) => LOADERS[name]();

const BUSY = "A busy afternoon";
const TEMPLATES = { templates: { name: "templates", params: {} } };
const busy = (requests = {}, options = {}) => modelFor("showcase", { from: BUSY, requests, ...options });
// A recorded model with one slot's items changed, for a branch no recording reaches.
const withItems = (built, slot, change) => {
  const data = built.model.slots[slot].data;
  return { ...built, model: { ...built.model, slots: { ...built.model.slots, [slot]: { ...built.model.slots[slot], data: { ...data, items: data.items.map(change) } } } } };
};

test("the queue groups recovery, work in progress, attention and waiting jobs", async () => {
  const { buildQueueView } = await view("queue");
  const built = await busy(TEMPLATES);
  const queue = buildQueueView({ ...built, options: {} });
  assert.deepEqual(queue.active.map((row) => row.title), ["Studio"]);
  assert.deepEqual(queue.waiting.map((row) => [row.title, row.position]), [["Conservatory", "1"], ["Library, thoroughly", "2"], ["Dining Room", "3"]]);
  assert.equal(queue.waitingTotal, 3);
  assert.deepEqual(queue.templates.map((template) => template.name), ["Weekly clean", "Mop the dining room"]);
  const disabled = buildQueueView({ ...withItems(built, "templates", (template, index) => (index === 0 ? { ...template, enabled: false } : template)), options: {} });
  assert.deepEqual(disabled.templates.map((template) => template.name), ["Mop the dining room"], "a disabled template is no quick start");
  const recovery = await modelFor("recovery", { from: "The job needs clarification" });
  const stuck = buildQueueView({ ...recovery, options: {} });
  assert.deepEqual(stuck.recovery.map((item) => [item.robot, item.reason, item.decision.state]), [["Rocky", recovery.texts.t("failure.robot_connection_lost"), "enabled"]]);
  assert.deepEqual(stuck.attention.map((row) => row.title), ["Library"]);
  assert.equal(stuck.attentionNeeded, false, "the recovery itself explains the attention");
  const hidden = buildQueueView({ ...built, options: { show_active: false, show_templates: false } });
  assert.deepEqual([hidden.active.length, hidden.templates.length], [0, 0]);
  assert.equal("grace" in queue, false, "the wait time is a setting, not part of the queue");
});

test("a row repeats a job's rooms only when its own name does not already name them", async () => {
  const { buildJobRow } = await import("../../../../src/presentation/views/job-row.js");
  const { roomIndex } = await import("../../../../src/presentation/common/lookups.js");
  const built = await busy();
  const shared = { model: built.model, texts: built.texts, context: built.context, index: roomIndex(built.model) };
  const library = built.model.slots.queue.data.jobs.find((job) => job.name === "Library, thoroughly");
  const row = (name) => buildJobRow({ ...library, name }, shared);
  assert.deepEqual([row("Library, thoroughly").showRooms, row("LIBRARY").showRooms, row(null).showRooms], [false, false, false]);
  assert.deepEqual([row("Before guests").showRooms, row("Studio").showRooms], [true, true]);
  assert.equal(row("Before guests").rooms, "Library");
});

test("a row names only the settings that differ from the defaults; the detail names all", async () => {
  const { buildJobRow, settingChips } = await import("../../../../src/presentation/views/job-row.js");
  const { roomIndex } = await import("../../../../src/presentation/common/lookups.js");
  const built = await busy();
  const shared = { model: built.model, texts: built.texts, context: built.context, index: roomIndex(built.model) };
  const [conservatory, library] = built.model.slots.queue.data.jobs;
  assert.deepEqual(buildJobRow(library, shared).settings.map((chip) => [chip.label, chip.text]), [[built.texts.t("field.passes"), "2×"]]);
  assert.deepEqual(buildJobRow(conservatory, shared).settings, [], "a mop job with the default rungs names none");
  assert.deepEqual(settingChips(library, built.texts).map((chip) => chip.key), ["passes", "vacuumPower"]);
});

// UI-06, UI-25: a row says the integration's main reason, never "ready" beside a reason, and
// offers the one action that reason calls for.
test("a waiting row states the integration's main reason and the action it calls for", async () => {
  const { buildQueueView } = await view("queue");
  const built = await busy();
  const [conservatory, library] = buildQueueView({ ...built, options: {} }).waiting;
  assert.deepEqual([conservatory.status.code, conservatory.status.tone, conservatory.status.text], ["room_not_released", "blocked", "Waiting for release"], "the title already names the room");
  assert.deepEqual([conservatory.main.key, conservatory.main.roomIds.length], ["release", 1]);
  assert.deepEqual([library.status.code, library.status.tone, library.status.text], ["robot_busy", "waiting", "Job ready · Rocky is busy"], "the job is ready, the robot is not");
  assert.equal(library.main, null, "a busy robot calls for nothing");
  assert.deepEqual([conservatory.actions.moveUp.state, conservatory.actions.moveUp.reason, conservatory.actions.moveUp.source], ["disabled", "job_at_top", "integration"]);
});

// QUE-08, QUE-09: the start delay counts down while it is the only obstacle, beside Delete; without
// a connection no countdown runs.
test("a new job counts down to its start, deletable; offline it shows no countdown", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("start_delay", { from: "The job starts in four seconds" });
  const [row] = buildQueueView({ ...built, options: {} }).waiting;
  assert.deepEqual([row.status.code, row.status.tone, row.status.text, row.main.key], ["start_delayed", "delay", "Starts in 4 seconds", "delete"]);
  const [offline] = buildQueueView({ ...built, context: { ...built.context, connected: false }, options: {} }).waiting;
  assert.deepEqual([offline.status.text, offline.status.until], ["Connection lost – start time unknown", null]);
});

test("a job ready but for the queue offers to start now", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("robot_choice", { from: "Either robot can start the dining room" });
  const [row] = buildQueueView({ ...built, options: {} }).waiting;
  assert.deepEqual([row.status.code, row.status.tone, row.status.text, row.main.key], ["queue_idle", "ready", "Ready · starts once the queue runs", "start"]);
});

test("a job another card edits says so and cannot be edited here", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("job_hold", { from: "Another card edits the job" });
  const [row] = buildQueueView({ ...built, options: {} }).waiting;
  assert.deepEqual([row.status.code, row.status.tone, row.status.text], ["being_edited", "edit", "Being edited"]);
  assert.deepEqual([row.actions.edit.state, row.actions.edit.reason], ["disabled", "job_held"]);
});

// JOB-09: a running job names its robot and start and, where the robot reports it, its progress;
// the state pill stays away while the group says it.
test("a running job shows robot, start and progress, without a pill its group already states", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("start_delay", { from: "Rocky is halfway through" });
  const [row] = buildQueueView({ ...built, options: {} }).active;
  assert.match(row.progress.line, /^Rocky · started \d+ minutes ago$/);
  assert.deepEqual(row.progress.bars.map((bar) => [bar.key, bar.value, bar.text]), [["total", 50, "50 %"]]);
  assert.equal(row.progress.labelled, false, "one phase, one bar");
  assert.equal(row.showState, false);
  assert.equal(row.main.key, "cancel");
  const absolute = buildQueueView({ ...built, options: {}, timeFormat: "absolute" }).active[0];
  assert.match(absolute.progress.line, /^Rocky · started at \d{1,2}:\d{2}\u00a0(AM|PM)$/, "a clock time does not wrap inside");
});

test("a job waiting for a fault to be fixed says until when; the device attention says what and what waits", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("device_fault", { from: "The job waits for the fix" });
  const queue = buildQueueView({ ...built, options: {} });
  assert.match(queue.active[0].progress.fault.text, /^Waiting for the fault to be fixed · fails at \d{1,2}:\d{2}\u00a0(AM|PM)$/);
  assert.deepEqual(queue.devices.map((item) => [item.title, item.what, item.effect]), [["Rocky needs attention", "The robot reports an error", "Every job waits until then"]], "a fault without Home Assistant's wording is never a raw code");
  const station = buildQueueView({ ...(await modelFor("attention", { from: "The station needs attention" })), options: {} });
  assert.deepEqual(station.devices.map((item) => [item.what, item.effect]), [["Dirty water tank full", "Jobs that mop wait until then"]]);
  assert.equal(station.attentionNeeded, false, "the device says what is wrong");
  assert.deepEqual(station.waiting.map((row) => row.status.text), ["Job ready · Rocky cannot mop right now"]);
});

// UI-25: while the run ends no waiting job starts in it, whichever robot becomes free or room the run
// frees; a reason of the job itself that someone must resolve still comes first.
test("a queue that is ending says the waiting jobs do not start in this run", async () => {
  const { buildQueueView } = await view("queue");
  const built = await modelFor("queue_controls", { from: "The queue ends after the started job" });
  const waiting = buildQueueView({ ...built, options: {} }).waiting;
  assert.deepEqual(waiting.map((row) => [row.title, row.status.tone, row.status.text]), [
    ["Library", "muted", "Does not start in this queue run"],
    ["Dining Room", "muted", "Does not start in this queue run"],
    ["Dining Room", "muted", "Does not start in this queue run"],
    ["Studio", "muted", "Does not start in this queue run"],
  ]);
});

test("an empty queue says so and offers templates", async () => {
  const { buildQueueView } = await view("queue");
  const quiet = await modelFor("showcase", { from: "A quiet afternoon", requests: TEMPLATES });
  const queue = buildQueueView({ ...quiet, options: {} });
  assert.equal(queue.empty, true);
  assert.equal(queue.templates.length, 2);
});

test("rooms show due verdicts, release, reaching robots and conditions as reported", async () => {
  const { buildRoomsView } = await view("rooms");
  const { model, texts, context } = await busy();
  const rooms = buildRoomsView({ model, texts, context, options: {} });
  const byName = Object.fromEntries(rooms.rooms.map((room) => [room.name, room]));
  assert.equal(byName["Dining Room"].release.tone, "ready");
  const [vacuum] = byName["Dining Room"].due;
  assert.equal(vacuum.state, "fresh");
  assert.ok(vacuum.share > 0 && vacuum.share < 0.1, "an hour of two days has passed");
  assert.equal(byName.Studio.due[0].state, "due");
  assert.equal(byName.Studio.due[0].status, texts.t("rooms.due.never"));
  assert.equal(byName.Studio.due[0].share, 1);
  assert.deepEqual(byName["Dining Room"].robots, ["Rocky"]);
  assert.equal(byName.Conservatory.release.label, texts.t("rooms.locked"));
  assert.equal(byName.Conservatory.unreachable, true, "the conservatory lies on the other map");
  assert.deepEqual(byName.Conservatory.conditions.map((item) => [item.name, item.state, item.allowed]), [["Conservatory Door", "off", "on"]]);
  assert.equal(byName.Conservatory.due[0].state, "disabled");
});

test("room sorting and excluded rooms follow the view options", async () => {
  const { buildRoomsView } = await view("rooms");
  const built = await busy();
  const byName = buildRoomsView({ ...built, options: { sort: "name" } }).rooms.map((room) => room.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
  const byDue = buildRoomsView({ ...built, options: { sort: "due" } }).rooms;
  assert.equal(byDue[0].due.filter((line) => line.state === "due").length >= byDue.at(-1).due.filter((line) => line.state === "due").length, true);
});

test("robots show Home Assistant's live state beside the integration's profile facts", async () => {
  const { buildRobotsView } = await view("robots");
  const built = await busy();
  const robots = buildRobotsView({ ...built, options: {}, ui: {} });
  const [rocky] = robots.robots;
  assert.equal(rocky.batteryText, "100 %");
  assert.equal(rocky.active, true);
  assert.equal(rocky.actions.configure.reason, "robot_busy");
  assert.deepEqual(rocky.facts.map((fact) => fact.key), ["room", "status", "map"]);
  assert.equal(rocky.facts[0].value, "Studio", "the room the robot reports cleaning");
  assert.ok(rocky.map.picture.startsWith("/api/image_proxy/image.rocky_main_floor"));
  assert.deepEqual(rocky.rooms, ["Dining Room", "Studio", "Library"]);
  assert.equal(robots.newCandidates, 0);
  assert.equal(rocky.actions.returnToDock.state, "hidden", "Rocky cleans for a job");
  const stopped = await modelFor("queue_controls", { from: "Rocky stopped in the studio" });
  assert.equal(buildRobotsView({ ...stopped, options: {}, ui: {} }).robots[0].actions.returnToDock.state, "enabled");
  const bare = buildRobotsView({ ...built, options: { show_map: false, show_capabilities: false }, ui: {} });
  assert.equal(bare.robots[0].map, null);
  assert.deepEqual(bare.robots[0].levels, []);
});

test("templates show their intent, switches and the rooms whose due period already produced a job", async () => {
  const { buildTemplatesView } = await view("templates");
  const built = await busy(TEMPLATES);
  const [weekly, dining] = buildTemplatesView(built).templates;
  assert.deepEqual([weekly.name, weekly.rooms, weekly.badges], ["Weekly clean", built.texts.t("field.allRooms"), []]);
  assert.deepEqual([dining.rooms, dining.modeLabel], ["Dining Room", built.texts.t("mode.mop")]);
  const automatic = await modelFor("template_controls", { from: "The daily template made a job", requests: TEMPLATES });
  const [daily] = buildTemplatesView(automatic).templates;
  assert.deepEqual(daily.badges.map((badge) => badge.key), ["automatic"]);
  assert.equal(daily.suppressed, automatic.texts.t("templates.suppressed", { rooms: "Dining Room" }));
  assert.equal(daily.actions.resetDemand.state, "enabled");
  const off = buildTemplatesView(withItems(built, "templates", (template) => ({ ...template, enabled: false }))).templates[0];
  assert.equal(off.tone, "muted", "a disabled template is shown muted");
});

test("history pages through all jobs or through cleaning runs", async () => {
  const { buildHistoryView, historySegments, activeSegment } = await view("history");
  assert.deepEqual(historySegments("runs"), ["runs"]);
  assert.equal(activeSegment("both", { choices: { "history:segment": "runs" } }), "runs");
  assert.equal(activeSegment("jobs", { choices: { "history:segment": "runs" } }), "jobs");
  const jobs = await busy({ jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } } });
  const log = buildHistoryView({ ...jobs, options: {}, ui: {} });
  assert.equal(log.segment, "jobs");
  assert.deepEqual(log.jobs.map((row) => row.state), ["queued", "queued", "queued", "running", "failed", "cancelled", "completed"], "newest first");
  const failed = log.jobs.find((row) => row.state === "failed");
  assert.deepEqual([failed.actions.retry.state, failed.outcome], ["enabled", jobs.texts.t("failure.start_not_observed")]);
  const runs = await busy({ runs: { name: "runs", params: { offset: 0, limit: 25 } } });
  const runList = buildHistoryView({ ...runs, options: { source: "runs" }, ui: {} });
  assert.deepEqual(runList.segments, [], "a single source needs no switch");
  const [run] = runList.runs;
  assert.deepEqual([run.title, run.source, run.failure], ["Dining Room", runs.texts.t("run.source.voi"), null]);
  assert.match(run.when, /26 min/);
});

test("diagnostics show versions, runtime, setup and the trace; the tab turns on for a problem", async () => {
  const { buildDiagnosticsView, diagnosticsNeeded } = await view("diagnostics");
  const built = await busy({ diagnostics: { name: "diagnostics", params: {} }, trace: { name: "trace", params: {} } });
  const diagnostics = buildDiagnosticsView({ ...built, options: {} });
  const facts = Object.fromEntries(diagnostics.facts.map((fact) => [fact.label, fact.value]));
  assert.equal(facts[built.texts.t("diagnostics.integrationVersion")], built.model.integrationVersion);
  assert.equal(facts[built.texts.t("diagnostics.apiVersion")], "4");
  assert.ok(facts[built.texts.t("diagnostics.setup")]);
  assert.equal(diagnostics.connection.tone, "ready");
  assert.ok(diagnostics.trace.length > 0);
  assert.ok(diagnostics.download);
  assert.equal(buildDiagnosticsView({ ...built, options: { show_trace: false } }).trace, null);
  assert.equal(diagnosticsNeeded(built.model), false);
  assert.equal(diagnosticsNeeded({ diagnostics: { warnings: [{}] } }), true);
  assert.equal(diagnosticsNeeded({ subscription: "failed" }), true);
});

test("setup shows the integration's four steps with their facts; the open step is the user's choice", async () => {
  const { buildSetupView, setupNeeded } = await view("setup");
  const assistant = await modelFor("setup", { from: "The assistant opens" });
  assert.equal(setupNeeded(assistant.model), true);
  const setup = buildSetupView(assistant);
  assert.deepEqual([setup.pending, setup.finish.state], [true, "enabled"]);
  assert.deepEqual(setup.steps.map((step) => [step.key, step.current]), [["robots", true], ["rooms", false], ["defaults", false], ["queue", false]]);
  const step = (vm, key) => vm.steps.find((entry) => entry.key === key);
  assert.deepEqual([step(setup, "robots").summary, step(setup, "robots").candidates], [assistant.texts.t("setup.step.robots.done", { robots: "Rocky" }), []]);
  assert.deepEqual(step(setup, "rooms").uncovered.map((room) => room.name), ["Conservatory"]);
  assert.deepEqual([step(setup, "defaults").builtIn, step(setup, "defaults").link.action], [true, "open-job-defaults"]);
  assert.match(step(setup, "queue").summary, /15 min/);
  assert.match(step(setup, "queue").summary, /5 s/, "the start delay in seconds");
  const picked = buildSetupView({ ...assistant, ui: { choices: { "setup:step": "queue" } } });
  assert.deepEqual(picked.steps.filter((entry) => entry.current).map((entry) => entry.key), ["queue"], "a step the user opens is shown instead");
  assert.equal(buildSetupView({ ...assistant, ui: { choices: { "setup:step": "garden" } } }).steps.find((entry) => entry.current).key, "robots");
  const empty = await modelFor("no_robot");
  assert.equal(step(buildSetupView(empty), "robots").note, empty.texts.t("setup.step.robots.none"));
  const done = await busy();
  assert.equal(setupNeeded(done.model), false);
  assert.deepEqual([buildSetupView(done).pending, buildSetupView(done).finish], [false, null]);
});

// The integration-wide settings, where the integration lives in Home Assistant, and which card
// version is running.
test("settings show the queue run's wait time, the job defaults and who may change them", async () => {
  const { buildSettingsView } = await view("settings");
  const { CARD_VERSION } = await import("../../../../src/core/card-metadata.js");
  const { affordanceContext } = await import("../../../../src/domain/affordances.js");
  const built = await busy();
  const settings = buildSettingsView(built);
  assert.equal(settings.loading, false);
  assert.deepEqual([settings.grace.value, settings.grace.decision.state], ["15 min", "enabled"]);
  assert.deepEqual(settings.integration.facts.map((fact) => fact.label), [built.texts.t("settings.version"), built.texts.t("settings.apiVersion")]);
  assert.ok(settings.integration.facts.every((fact) => fact.value), "version and API version are known");
  assert.equal(settings.integration.open.path, "/_my_redirect/integration?domain=vacuum_orchestrator");
  assert.deepEqual(settings.integration.setup, { action: "open-setup" });
  assert.deepEqual(settings.card.facts, [{ label: built.texts.t("settings.version"), value: CARD_VERSION }]);
  assert.deepEqual(settings.defaults.facts.map((fact) => fact.value), ["Vacuum", "Standard", "Medium", "Standard", "1", "Best effort"]);
  assert.deepEqual([settings.defaults.builtIn, settings.defaults.decision.state], [built.texts.t("settings.defaultsBuiltIn"), "enabled"]);
  const configured = buildSettingsView(await modelFor("settings_controls", { from: "Mopping is the default" }));
  assert.deepEqual([configured.defaults.facts[0].value, configured.defaults.facts[3].value, configured.defaults.builtIn, configured.grace.value], ["Mop", "Deep+", null, "30 min"]);
  const queue = built.model.slots.queue;
  const immediate = buildSettingsView({ ...built, model: { ...built.model, slots: { ...built.model.slots, queue: { ...queue, data: { ...queue.data, graceSeconds: 0 } } } } });
  assert.equal(immediate.grace.value, built.texts.t("settings.graceOff"));
  const locked = buildSettingsView(await busy({}, { admin: false }));
  assert.deepEqual([locked.grace.decision.state, locked.grace.decision.reason, locked.integration.open], ["disabled", "read_only", null]);
  const missing = buildSettingsView({ ...built, context: affordanceContext({ operations: [] }) });
  assert.equal(missing.grace.decision.reason, "operation_missing");
  const loading = buildSettingsView({ ...built, model: { ...built.model, slots: { ...built.model.slots, queue: { status: "loading" } } } });
  assert.deepEqual([loading.loading, loading.grace], [true, null]);
});

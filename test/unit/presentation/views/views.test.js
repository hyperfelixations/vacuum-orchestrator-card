// The view models of the eight views, read from a real model of a named household. Every value
// shown is the integration's or Home Assistant's; the views only order, group and word it.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");
const W = require("../../../fixtures/voi/wire.js");

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

test("the queue groups recovery, work in progress, attention and waiting jobs", async () => {
  const { buildQueueView } = await view("queue");
  const typical = await modelFor("typical", { requests: { templates: { name: "templates", params: {} } } });
  const queue = buildQueueView({ ...typical, options: {} });
  assert.deepEqual(queue.active.map((row) => row.jobId), ["job-running"]);
  assert.deepEqual(queue.waiting.map((row) => [row.jobId, row.position]), [["job-kitchen", "1"], ["job-bathroom", "2"], ["job-bedroom", "3"]]);
  assert.equal(queue.waitingTotal, 3);
  assert.deepEqual(queue.templates.map((template) => template.templateId), ["template-daily", "template-weekly"], "a disabled template is no quick start");
  const attention = await modelFor("attention");
  const stuck = buildQueueView({ ...attention, options: {} });
  assert.deepEqual(stuck.recovery.map((item) => [item.robot, item.decision.state]), [["Rocky", "enabled"]]);
  assert.deepEqual(stuck.attention.map((row) => row.jobId), ["job-stuck"]);
  assert.equal(stuck.attentionNeeded, false, "the recovery itself explains the attention");
  const hidden = buildQueueView({ ...typical, options: { show_active: false, show_templates: false } });
  assert.deepEqual([hidden.active.length, hidden.templates.length], [0, 0]);
  assert.equal("grace" in queue, false, "the wait time is a setting, not part of the queue");
});

test("a row repeats a job's rooms only when its own name does not already name them", async () => {
  const { buildJobRow } = await import("../../../../src/presentation/views/job-row.js");
  const { roomIndex } = await import("../../../../src/presentation/common/lookups.js");
  const typical = await modelFor("typical");
  const shared = { model: typical.model, texts: typical.texts, context: typical.context, index: roomIndex(typical.model) };
  const kitchen = typical.model.slots.queue.data.jobs.find((job) => job.jobId === "job-kitchen");
  const row = (name) => buildJobRow({ ...kitchen, name }, shared);
  assert.deepEqual([row("Kitchen and hall").showRooms, row("KITCHEN + HALL").showRooms, row(null).showRooms], [false, false, false]);
  assert.deepEqual([row("Before guests").showRooms, row("Kitchen").showRooms], [true, true]);
  assert.equal(row("Before guests").rooms, "Kitchen, Hall");
});

test("a row names only the settings that differ from the defaults; the detail names all", async () => {
  const { buildJobRow, settingChips } = await import("../../../../src/presentation/views/job-row.js");
  const { roomIndex } = await import("../../../../src/presentation/common/lookups.js");
  const typical = await modelFor("typical");
  const shared = { model: typical.model, texts: typical.texts, context: typical.context, index: roomIndex(typical.model) };
  const job = (jobId) => typical.model.slots.queue.data.jobs.find((entry) => entry.jobId === jobId);
  assert.deepEqual(buildJobRow(job("job-kitchen"), shared).settings.map((chip) => [chip.label, chip.text]), [[typical.texts.t("field.passes"), "2×"]]);
  assert.deepEqual(buildJobRow(job("job-bathroom"), shared).settings.map((chip) => [chip.label ?? null, chip.text]), [["Water", "High"], ["Mop route", "Deep"], [null, "Strict"]]);
  assert.deepEqual(settingChips(job("job-kitchen"), typical.texts).map((chip) => chip.key), ["passes", "vacuumPower", "mopIntensity", "mopRoute"]);
});

test("a waiting row explains its readiness in the integration's order", async () => {
  const { buildQueueView } = await view("queue");
  const typical = await modelFor("typical");
  const rows = buildQueueView({ ...typical, options: {} }).waiting;
  const bathroom = rows.find((row) => row.jobId === "job-bathroom");
  assert.equal(bathroom.readiness.state, "blocked");
  assert.equal(bathroom.readiness.summary, typical.texts.t("readiness.notReleased", { rooms: "Bathroom" }));
  assert.equal(bathroom.readiness.more, 1);
  const bedroom = rows.find((row) => row.jobId === "job-bedroom");
  assert.equal(bedroom.readiness.summary, typical.texts.t("readiness.requirement.unknown", { entity: "Bedroom window" }));
  assert.deepEqual([rows[0].actions.moveUp.state, rows[0].actions.moveUp.reason], ["disabled", "at_boundary"]);
  assert.deepEqual(bathroom.settings.map((setting) => setting.key), ["mopIntensity", "mopRoute", "settingsPolicy"]);
});

test("an empty queue says so and offers templates", async () => {
  const { buildQueueView } = await view("queue");
  const empty = await modelFor("empty", { requests: { templates: { name: "templates", params: {} } } });
  const queue = buildQueueView({ ...empty, options: {} });
  assert.equal(queue.empty, true);
  assert.equal(queue.templates.length, 2);
});

test("rooms show due verdicts, release, reaching robots and conditions as reported", async () => {
  const { buildRoomsView } = await view("rooms");
  const { model, texts, context } = await modelFor("typical");
  const rooms = buildRoomsView({ model, texts, context, options: {} });
  const byId = Object.fromEntries(rooms.rooms.map((room) => [room.roomId, room]));
  assert.equal(byId["room-kitchen"].release.tone, "ready");
  assert.equal(byId["room-kitchen"].due[0].state, "due");
  assert.equal(byId["room-kitchen"].due[0].share, 1);
  assert.deepEqual(byId["room-kitchen"].robots, ["Rocky", "Dusty"]);
  assert.equal(byId["room-living"].release.label, texts.t("rooms.reserved"));
  assert.equal(byId["room-bedroom"].unreachable, true);
  assert.deepEqual(byId["room-bathroom"].conditions.map((item) => [item.name, item.state, item.allowed]), [["Bathroom door", "off", "on"]]);
  assert.equal(byId["room-bedroom"].due[0].status, texts.t("rooms.due.never"));
});

test("room sorting and excluded rooms follow the view options", async () => {
  const { buildRoomsView } = await view("rooms");
  const built = await modelFor("typical");
  const byName = buildRoomsView({ ...built, options: { sort: "name" } }).rooms.map((room) => room.name);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
  const byDue = buildRoomsView({ ...built, options: { sort: "due" } }).rooms;
  assert.equal(byDue[0].due.filter((line) => line.state === "due").length >= byDue.at(-1).due.filter((line) => line.state === "due").length, true);
});

test("robots show Home Assistant's live state beside the integration's profile facts", async () => {
  const { buildRobotsView } = await view("robots");
  const { model, texts, context } = await modelFor("typical", { requests: { candidates: { name: "candidates", params: {} } } });
  const robots = buildRobotsView({ model, texts, context, options: {}, ui: {} });
  const rocky = robots.robots.find((robot) => robot.robotId === "robot-rocky");
  assert.equal(rocky.batteryText, "76 %");
  assert.equal(rocky.active, true);
  assert.equal(rocky.actions.configure.reason, "robot_busy");
  assert.deepEqual(rocky.facts.map((fact) => fact.key), ["room", "status", "map", "minimum"]);
  assert.ok(rocky.map.picture.endsWith("map.svg"));
  assert.deepEqual(rocky.rooms, ["Kitchen", "Hall", "Living room", "Bathroom"]);
  assert.equal(robots.newCandidates, 0);
  assert.deepEqual(robots.robots.map((robot) => robot.actions.returnToDock.state), ["hidden", "hidden"], "Rocky holds a lease and Dusty is docked");
  const stopped = await modelFor("ending");
  const dusty = buildRobotsView({ ...stopped, options: {}, ui: {} }).robots.find((robot) => robot.robotId === "robot-dusty");
  assert.equal(dusty.actions.returnToDock.state, "enabled");
  const bare = buildRobotsView({ model, texts, context, options: { show_map: false, show_capabilities: false }, ui: {} });
  assert.equal(bare.robots[0].map, null);
  assert.deepEqual(bare.robots[0].levels, []);
});

test("templates show their intent, switches and the rooms whose due period already produced a job", async () => {
  const { buildTemplatesView } = await view("templates");
  const { model, texts, context } = await modelFor("typical", { requests: { templates: { name: "templates", params: {} } } });
  const templates = buildTemplatesView({ model, texts, context }).templates;
  const weekly = templates.find((template) => template.templateId === "template-weekly");
  assert.deepEqual(weekly.badges.map((badge) => badge.key), ["automatic"]);
  assert.equal(weekly.suppressed, texts.t("templates.suppressed", { rooms: "Bathroom" }));
  assert.equal(weekly.actions.resetDemand.state, "enabled");
  const guests = templates.find((template) => template.templateId === "template-guests");
  assert.deepEqual([guests.tone, guests.actions.instantiate.reason], ["muted", "template_disabled"]);
  const W = require("../../../fixtures/voi/wire.js");
  const everywhere = await modelFor("typical", { requests: { templates: { name: "templates", params: {} } }, setup: (fake) => fake.state.templates.push(W.wireTemplate({ template_id: "template-all", intent: { areas: "all", mode: "vacuum" } })) });
  const all = buildTemplatesView(everywhere).templates.find((template) => template.templateId === "template-all");
  assert.equal(all.rooms, everywhere.texts.t("field.allRooms"));
});

test("history pages through all jobs or through cleaning runs", async () => {
  const { buildHistoryView, historySegments, activeSegment } = await view("history");
  assert.deepEqual(historySegments("runs"), ["runs"]);
  assert.equal(activeSegment("both", { choices: { "history:segment": "runs" } }), "runs");
  assert.equal(activeSegment("jobs", { choices: { "history:segment": "runs" } }), "jobs");
  const jobs = await modelFor("typical", { requests: { jobLog: { name: "jobLog", params: { offset: 0, limit: 25 } } } });
  const log = buildHistoryView({ ...jobs, options: {}, ui: {} });
  assert.equal(log.segment, "jobs");
  assert.equal(log.jobs.length, 7);
  assert.equal(log.jobs.find((row) => row.jobId === "job-failed").actions.retry.state, "enabled");
  const runs = await modelFor("typical", { requests: { runs: { name: "runs", params: { offset: 0, limit: 25 } } } });
  const runList = buildHistoryView({ ...runs, options: { source: "runs" }, ui: {} });
  assert.deepEqual(runList.segments, [], "a single source needs no switch");
  assert.equal(runList.runs[1].title, runs.texts.t("run.unknownRooms"));
  assert.equal(runList.runs[1].source, runs.texts.t("run.source.external"));
  assert.match(runList.runs[0].when, /26/);
  assert.equal(runList.runs[2].failure, runs.texts.t("failure.start_timeout"));
});

test("diagnostics show versions, runtime, setup and the trace; the tab turns on for a problem", async () => {
  const { buildDiagnosticsView, diagnosticsNeeded } = await view("diagnostics");
  const built = await modelFor("typical", { requests: { diagnostics: { name: "diagnostics", params: {} }, trace: { name: "trace", params: {} } } });
  const diagnostics = buildDiagnosticsView({ ...built, options: {} });
  const facts = Object.fromEntries(diagnostics.facts.map((fact) => [fact.label, fact.value]));
  assert.equal(facts[built.texts.t("diagnostics.integrationVersion")], "0.1.0");
  assert.equal(facts[built.texts.t("diagnostics.apiVersion")], "3");
  assert.equal(diagnostics.connection.tone, "ready");
  assert.equal(diagnostics.setup.length, 4);
  assert.ok(diagnostics.trace.length > 0);
  assert.ok(diagnostics.download);
  assert.equal(buildDiagnosticsView({ ...built, options: { show_trace: false } }).trace, null);
  assert.equal(diagnosticsNeeded(built.model), false);
  assert.equal(diagnosticsNeeded({ diagnostics: { warnings: [{}] } }), true);
  assert.equal(diagnosticsNeeded({ subscription: "failed" }), true);
});

test("setup starts at the robots with discovery's candidates and moves on with the facts", async () => {
  const { buildSetupView, setupNeeded } = await view("setup");
  const fresh = await modelFor("fresh");
  assert.equal(setupNeeded(fresh.model), true);
  const steps = buildSetupView(fresh).steps;
  assert.deepEqual(steps.map((step) => [step.key, step.done, step.current]), [["robots", false, true], ["rooms", false, false], ["release", false, false], ["firstJob", false, false]]);
  assert.deepEqual(steps[0].candidates.map((candidate) => candidate.entityId), ["vacuum.rocky", "vacuum.dusty"]);
  const typical = await modelFor("typical");
  assert.equal(setupNeeded(typical.model), false);
  const done = buildSetupView(typical);
  assert.equal(done.allDone, true);
  assert.equal(done.steps.some((step) => step.current), false);
  assert.deepEqual(done.steps.find((step) => step.key === "rooms").uncovered.map((room) => room.roomId), ["room-bedroom"]);
});

// The one integration-wide setting, where the integration lives in Home Assistant, and which card
// version is running.
test("settings show the queue run's wait time and who may change it", async () => {
  const { buildSettingsView } = await view("settings");
  const { CARD_VERSION } = await import("../../../../src/core/card-metadata.js");
  const { affordanceContext } = await import("../../../../src/domain/affordances.js");
  const typical = await modelFor("typical");
  const settings = buildSettingsView(typical);
  assert.equal(settings.loading, false);
  assert.deepEqual([settings.grace.value, settings.grace.decision.state], ["15 min", "enabled"]);
  assert.deepEqual(settings.integration.facts.map((fact) => fact.label), [typical.texts.t("settings.version"), typical.texts.t("settings.apiVersion")]);
  assert.ok(settings.integration.facts.every((fact) => fact.value), "version and API version are known");
  assert.equal(settings.integration.open.path, "/_my_redirect/integration?domain=vacuum_orchestrator");
  assert.deepEqual(settings.card.facts, [{ label: typical.texts.t("settings.version"), value: CARD_VERSION }]);
  assert.deepEqual(settings.defaults.facts.map((fact) => fact.value), ["Vacuum", "Standard", "Medium", "Standard", "1", "Best effort"]);
  assert.deepEqual([settings.defaults.builtIn, settings.defaults.decision.state], [typical.texts.t("settings.defaultsBuiltIn"), "enabled"]);
  const configured = await modelFor("typical", { setup: (fake) => {
    fake.state.jobDefaults = W.wireJobDefaults({ mode: "mop", configured: true });
  } });
  assert.deepEqual([buildSettingsView(configured).defaults.facts[0].value, buildSettingsView(configured).defaults.builtIn], ["Mop", null]);
  const queue = typical.model.slots.queue;
  const immediate = buildSettingsView({ ...typical, model: { ...typical.model, slots: { ...typical.model.slots, queue: { ...queue, data: { ...queue.data, graceSeconds: 0 } } } } });
  assert.equal(immediate.grace.value, typical.texts.t("settings.graceOff"));
  const reader = await modelFor("typical", { admin: false });
  const locked = buildSettingsView(reader);
  assert.deepEqual([locked.grace.decision.state, locked.grace.decision.reason, locked.integration.open], ["disabled", "read_only", null]);
  const missing = buildSettingsView({ ...typical, context: affordanceContext({ operations: [] }) });
  assert.equal(missing.grace.decision.reason, "operation_missing");
  const loading = buildSettingsView({ ...typical, model: { ...typical.model, slots: { ...typical.model.slots, queue: { status: "loading" } } } });
  assert.deepEqual([loading.loading, loading.grace], [true, null]);
});

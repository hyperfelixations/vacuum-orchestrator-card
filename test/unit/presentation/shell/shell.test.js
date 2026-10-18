// The card shell as data: one overall status shared by tone, pill, subtitle and panel; the main
// panel; the tab set with automatic views and the start view; notices; onboarding per phase.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");

// Card states at marks of the integration's recordings.
const BUSY = ["showcase", { from: "A busy afternoon" }];
const QUIET = ["showcase", { from: "A quiet afternoon" }];
const WAITING_FOR_WORK = ["queue_end", { from: "The queue waits for work" }];
const ENDING = ["queue_controls", { from: "The queue ends after the started job" }];
const STATION = ["attention", { from: "The station needs attention" }];
const RECOVERY = ["recovery", { from: "The job needs clarification" }];
const ASSISTANT = ["setup", { from: "The assistant opens" }];
const NOT_INSTALLED = ["not_installed", {}];
const NOT_SET_UP = ["setup", { from: "Vacuum Orchestrator is installed but not set up" }];
const UNLOADED = ["unloaded", { from: "The integration is not loaded" }];
const at = ([name, options], extra = {}) => modelFor(name, { ...options, ...extra });

async function shell(state = BUSY, options = {}) {
  const built = await at(state, options);
  const { VIEWS, VIEW_TYPES, optionSchemaForView } = await import("../../../../src/views/registry.js");
  const { normalizeConfig } = await import("../../../../src/config/normalize-config.js");
  const config = (raw = {}) => normalizeConfig(raw, { viewTypes: VIEW_TYPES, optionSchemaForView });
  return { ...built, VIEWS, config };
}

const statusOf = async (model) => (await import("../../../../src/presentation/shell/status.js")).cardStatus(model);

test("status precedence: phase, attention, work in progress, queue mode, unfinished setup", async () => {
  assert.equal(await statusOf((await at(BUSY)).model), "cleaning");
  assert.equal(await statusOf((await at(STATION)).model), "attention", "attention outranks the pending assistant");
  assert.equal(await statusOf((await at(WAITING_FOR_WORK)).model), "running");
  assert.equal(await statusOf((await at(QUIET)).model), "idle");
  // V6: jobs waiting on a queue that was not started are not "Ready"; the pill says the queue does not run.
  const held = await at(["robot_choice", { from: "Either robot can start the dining room" }]);
  assert.equal(await statusOf(held.model), "waiting");
  assert.deepEqual([held.texts.t("status.waiting"), held.texts.t("status.idle")], ["Not running", "Ready"]);
  const { toneFor } = await import("../../../../src/presentation/shell/status.js");
  assert.match(toneFor("waiting").style, /--tone-color:var\(--secondary-text-color\);.*--voc-accent:var\(--primary-color, #03a9f4\);/);
  assert.equal(await statusOf((await at(ASSISTANT)).model), "setup");
  assert.equal(await statusOf((await at(NOT_INSTALLED)).model), "notInstalled");
  assert.equal(await statusOf((await at(UNLOADED)).model), "loadFailed");
  assert.equal(await statusOf({ phase: "ready", slots: {} }), "connecting");
});

test("the integration's counts mark attention and work before the open jobs are read", async () => {
  const { cardStatus } = await import("../../../../src/presentation/shell/status.js");
  const { automaticSubtitle } = await import("../../../../src/presentation/shell/header.js");
  const { textService } = await import("../../../../src/i18n/text-service.js");
  const texts = textService("en");
  const queue = (fields) => ({ phase: "ready", slots: { queue: { data: { mode: "idle", needsAttention: false, recoveryTargets: [], total: 0, activeCount: 0, attentionCount: 0, ...fields } } } });
  assert.equal(cardStatus(queue({ attentionCount: 2 })), "attention");
  assert.equal(automaticSubtitle(queue({ attentionCount: 2 }), "attention", texts), texts.t("subtitle.attention"), "attention items are not jobs");
  assert.equal(cardStatus(queue({ activeCount: 1 })), "cleaning");
  assert.equal(cardStatus({ ...queue({}), live: { mode: "idle", attentionCount: 1, activeCount: 0 } }), "attention", "a live event is newer than the queue read");
});

test("each status has a tone in the RCC token derivation", async () => {
  const { toneFor } = await import("../../../../src/presentation/shell/status.js");
  const tone = toneFor("paused");
  assert.equal(tone.key, "paused");
  assert.match(tone.style, /--tone-soft:color-mix\(in srgb, var\(--warning-color, #ffa600\) 20%, transparent\)/);
  assert.match(tone.style, /--tone-border:color-mix\(in srgb, var\(--tone-ink\) 38%, transparent\)/);
  assert.equal(toneFor("nonsense").key, "nonsense");
});

// UI-20: controls take the card's tone, but never the error colour; an error tone gives them the
// primary colour while pill, badge and accent line keep the tone.
test("controls take an accent from the tone that is never the error colour", async () => {
  const { toneFor } = await import("../../../../src/presentation/shell/status.js");
  const accent = (status) => toneFor(status).style.match(/--voc-accent:([^;]+);/)?.[1];
  assert.equal(accent("paused"), "var(--warning-color, #ffa600)");
  assert.equal(accent("idle"), "var(--success-color, #43a047)");
  // V6: a grey tone would grey out the controls too; they take the primary colour.
  for (const status of ["connecting", "notInstalled", "offline"]) assert.equal(accent(status), "var(--primary-color, #03a9f4)", status);
  for (const status of ["attention", "loadFailed", "checkFailed"]) {
    assert.match(toneFor(status).style, /--tone-color:var\(--error-color, #db4437\);/, status);
    assert.equal(accent(status), "var(--primary-color, #03a9f4)", status);
  }
  assert.match(toneFor("idle").style, /--voc-accent-soft:color-mix\(in srgb, var\(--success-color, #43a047\) 20%, transparent\);/);
  assert.match(toneFor("idle").style, /--voc-accent-border:color-mix\(in srgb, var\(--voc-accent-ink\) 38%, transparent\);/);
});

test("the automatic subtitle names what the card is doing", async () => {
  const { automaticSubtitle } = await import("../../../../src/presentation/shell/header.js");
  const busy = await at(BUSY);
  // UI-03: the pill says "Cleaning"; the subtitle names the job and its robot instead.
  assert.equal(automaticSubtitle(busy.model, "cleaning", busy.texts), busy.texts.t("subtitle.activeJob", { job: "Studio", detail: "Rocky" }));
  const recovery = await at(RECOVERY);
  assert.equal(automaticSubtitle(recovery.model, "attention", recovery.texts), recovery.texts.t("subtitle.recoveryOne", { robot: "Rocky" }));
  const station = await at(STATION);
  // V6: a fault is named with its robot rather than as "something".
  assert.equal(automaticSubtitle(station.model, "attention", station.texts), "Rocky · Dirty water tank full", "a station fault is no job");
  const waiting = await at(WAITING_FOR_WORK);
  assert.match(automaticSubtitle(waiting.model, "running", waiting.texts), /14/, "the run ends 14 minutes from now");
  const assistant = await at(ASSISTANT);
  // V6: the pill and the tab say "Setup"; the subtitle names what to do there instead.
  assert.equal(automaticSubtitle(assistant.model, "setup", assistant.texts), "4 optional steps to check");
  assert.equal(automaticSubtitle(assistant.model, "setup", assistant.texts, { panelShown: true }), "4 optional steps to check");
});

// V6 (UI-03): beside the panel, which counts the waiting jobs and says how the queue runs, the
// subtitle names what the panel does not: the next job, or that the run waits for new work.
test("beside the panel the subtitle names the next job instead of the count", async () => {
  const { automaticSubtitle } = await import("../../../../src/presentation/shell/header.js");
  const countdown = await at(["start_delay", { from: "The job starts in four seconds" }]);
  assert.equal(automaticSubtitle(countdown.model, "running", countdown.texts, { panelShown: true }), "Next: Dining Room, Studio");
  assert.equal(automaticSubtitle(countdown.model, "running", countdown.texts), countdown.texts.t("subtitle.waitingRunning", { count: 1 }), "without the panel it counts");
  const choice = await at(["robot_choice", { from: "Either robot can start the dining room" }]);
  assert.equal(automaticSubtitle(choice.model, "idle", choice.texts, { panelShown: true }), "Next: Dining Room");
  const waiting = await at(WAITING_FOR_WORK);
  assert.equal(automaticSubtitle(waiting.model, "running", waiting.texts, { panelShown: true }), "Waiting for new work");
  const { buildPanel } = await import("../../../../src/presentation/shell/panel.js");
  const { config } = await shell();
  assert.equal(buildPanel({ model: waiting.model, config: config(), texts: waiting.texts, context: waiting.context }).runLine, "Queue running · ends in 14 minutes");
  const german = await at(WAITING_FOR_WORK, { language: "de" });
  assert.equal(automaticSubtitle(german.model, "running", german.texts, { panelShown: true }), "Wartet auf neue Aufträge");
});

test("the header honours title, subtitle, icon and the show switches", async () => {
  const { model, texts, config } = await shell();
  const { buildHeader } = await import("../../../../src/presentation/shell/header.js");
  const full = buildHeader({ model, config: config({ title: "Upstairs", icon: "mdi:broom" }), texts, status: "idle" });
  assert.deepEqual([full.title, full.icon, full.parts, full.pill], ["Upstairs", "mdi:broom", null, texts.t("status.idle")]);
  const reduced = buildHeader({ model, config: config({ subtitle: "", show: { pill: false, icon: false } }), texts, status: "idle" });
  assert.deepEqual([reduced.hasSubtitle, reduced.parts], [false, "title"]);
});

test("the panel shows the waiting count, the run line, up to three robots and the queue control", async () => {
  const { model, texts, context, config } = await shell();
  const { buildPanel } = await import("../../../../src/presentation/shell/panel.js");
  const panel = buildPanel({ model, config: config(), texts, context });
  assert.deepEqual([panel.value, panel.mode, panel.runLine], ["3", "running", texts.t("panel.running")]);
  assert.equal(panel.robots.length, 1);
  const both = await at(["robot_choice", { from: "Either robot can start the dining room" }]);
  assert.equal(buildPanel({ model: both.model, config: config(), texts: both.texts, context: both.context }).robots.length, 2);
  assert.deepEqual([panel.control.command, panel.control.label, panel.control.decision.state], ["pause_queue", texts.t("panel.control.pause"), "enabled"]);
  assert.deepEqual([panel.end.action, panel.end.label, panel.end.decision.state], ["end-queue", texts.t("panel.control.end"), "enabled"]);
  const hidden = buildPanel({ model, config: config({ show: { queue_controls: false } }), texts, context });
  assert.deepEqual([hidden.control, hidden.end], [null, null]);
  assert.equal(panel.control.primary, true, "pausing a running queue is the panel's step");
  // UI-19: with nothing waiting or started, adding a job is the next step; the queue control stays
  // quiet.
  const empty = await at(["queue_end", { from: "The card opens" }]);
  const idle = buildPanel({ model: empty.model, config: config(), texts: empty.texts, context: empty.context });
  assert.deepEqual([idle.control.command, idle.control.primary], ["run_queue", false]);
  const waits = await at(["queue_end", { from: "The queue waits for work" }]);
  const standby = buildPanel({ model: waits.model, config: config(), texts: waits.texts, context: waits.context });
  assert.deepEqual([standby.control.command, standby.control.primary], ["pause_queue", false], "a queue waiting for work needs a job, not a pause");
  const ending = await at(ENDING);
  const ended = buildPanel({ model: ending.model, config: config(), texts: ending.texts, context: ending.context });
  assert.deepEqual([ended.runLine, ended.control.command, ended.end], [ending.texts.t("panel.ending"), "resume_queue", null], "an ending queue offers resuming, which takes the end back");
  const quiet = await at(QUIET);
  assert.equal(buildPanel({ model: quiet.model, config: config(), texts: quiet.texts, context: quiet.context }).end, null);
  assert.equal(buildPanel({ model, config: config({ show: { panel: false } }), texts, context }).visible, false);
  const waiting = await at(WAITING_FOR_WORK);
  assert.match(buildPanel({ model: waiting.model, config: config(), texts: waiting.texts, context: waiting.context }).runLine, /14/);
});

test("by default the five everyday views show; settings for administrators, diagnostics and setup only when needed", async () => {
  const { model, texts, VIEWS, config } = await shell();
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const tabs = buildTabs({ definitions: VIEWS, model, config: config(), ui: {}, texts });
  assert.deepEqual(tabs.tabs.map((tab) => tab.key), ["queue", "rooms", "robots", "templates", "history", "settings"]);
  const reader = await shell(BUSY, { admin: false });
  const readerTabs = buildTabs({ definitions: VIEWS, model: reader.model, config: config(), ui: {}, texts });
  assert.deepEqual(readerTabs.tabs.map((tab) => tab.key), ["queue", "rooms", "robots", "templates", "history"], "who may change nothing sees no settings");
  const forced = buildTabs({ definitions: VIEWS, model: reader.model, config: config({ views: ["queue", { type: "settings", enabled: true }] }), ui: {}, texts });
  assert.deepEqual(forced.tabs.map((tab) => tab.key), ["queue", "settings"]);
  assert.equal(tabs.active, "queue");
  assert.equal(tabs.visible, true);
  const assistant = await shell(ASSISTANT);
  const setupTabs = buildTabs({ definitions: VIEWS, model: assistant.model, config: config(), ui: {}, texts });
  assert.equal(setupTabs.tabs[0].key, "setup");
  assert.equal(setupTabs.active, "setup", "an unfinished setup is where the card starts");
  // SET-10: "Later" closes the assistant until the next load; SET-06: running work comes first.
  const later = buildTabs({ definitions: VIEWS, model: assistant.model, config: config(), ui: { setupDeferred: true }, texts });
  assert.deepEqual([later.tabs.some((tab) => tab.key === "setup"), later.active], [false, "queue"]);
  const running = { ...assistant.model, slots: { ...assistant.model.slots, openJobs: { data: { jobs: [{ jobId: "job-run", state: "running", roomIds: [] }] } } } };
  const busyTabs = buildTabs({ definitions: VIEWS, model: running, config: config(), ui: {}, texts });
  assert.deepEqual([busyTabs.tabs.some((tab) => tab.key === "setup"), busyTabs.active], [true, "queue"], "offered, but the running work is shown first");
  // UI-22: who may change nothing cannot finish the setup and is not offered it.
  const reading = await shell(ASSISTANT, { admin: false });
  const readingTabs = buildTabs({ definitions: VIEWS, model: reading.model, config: config(), ui: {}, texts });
  assert.deepEqual([readingTabs.tabs.some((tab) => tab.key === "setup"), readingTabs.active], [false, "queue"]);
});

test("a written list decides order and switches; the start view is a wish", async () => {
  const { model, texts, VIEWS, config } = await shell();
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const tabs = buildTabs({ definitions: VIEWS, model, config: config({ views: ["rooms", "diagnostics", { type: "queue", enabled: false }], start_view: "diagnostics" }), ui: {}, texts });
  assert.deepEqual(tabs.tabs.map((tab) => tab.key), ["rooms", "diagnostics"]);
  assert.equal(tabs.active, "diagnostics");
  const chosen = buildTabs({ definitions: VIEWS, model, config: config({ start_view: "rooms" }), ui: { view: "robots" }, texts });
  assert.equal(chosen.active, "robots", "the user's choice beats the start view");
  const single = buildTabs({ definitions: VIEWS, model, config: config({ views: ["queue"] }), ui: {}, texts });
  assert.equal(single.visible, false, "one view needs no tab strip");
  assert.equal(buildTabs({ definitions: VIEWS, model, config: config({ views: ["queue"], show: { tabs: true } }), ui: {}, texts }).visible, true);
});

test("a view the integration does not offer is listed as unavailable unless hidden", async () => {
  const { model, texts, VIEWS, config } = await shell();
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const without = { ...model, operations: model.operations.filter((operation) => operation !== "get_history") };
  const listed = buildTabs({ definitions: VIEWS, model: without, config: config(), ui: {}, texts });
  assert.equal(listed.tabs.find((tab) => tab.key === "history").available, false);
  const hidden = buildTabs({ definitions: VIEWS, model: without, config: config({ show: { unavailable_views: false } }), ui: {}, texts });
  assert.equal(hidden.tabs.some((tab) => tab.key === "history"), false);
});

test("one warning is a sentence, several a count; a hint is appended to the subtitle", async () => {
  const { texts, config } = await shell();
  const notices = await import("../../../../src/presentation/shell/notices.js");
  const { createDiagnostic } = await import("../../../../src/core/diagnostics.js");
  const one = notices.buildNotices({ configDiagnostics: config({ page_size: 1 })._configDiagnostics, diagnostics: [createDiagnostic("hint.reconnecting")] });
  const block = notices.buildWarningBlock({ config: config(), notices: one, texts });
  assert.equal(block.visible, true);
  // V6: a number out of range names the range it must lie in.
  assert.equal(block.text, "1 is not a valid value for page_size (5–100). Using 25.");
  const several = notices.buildNotices({ diagnostics: [createDiagnostic("backend.query_failed", { params: { scope: "rooms", code: "x" } }), createDiagnostic("backend.query_failed", { params: { scope: "robots", code: "x" } })] });
  assert.equal(notices.warningText(several.warnings, texts), texts.t("warning.several", { count: 2 }));
  assert.equal(notices.buildWarningBlock({ config: config({ show: { warnings: false } }), notices: one, texts }).visible, false);
  const header = notices.withHint({ subtitle: "Nothing waiting", hasSubtitle: true }, notices.hintText(one.hints, texts));
  assert.equal(header.subtitle, `Nothing waiting · ${texts.t("hint.reconnecting")}`);
});

test("onboarding explains each unusable phase and offers Home Assistant's own pages", async () => {
  const { buildOnboarding } = await import("../../../../src/presentation/shell/onboarding.js");
  const { HACS_INTEGRATION_URL, INTEGRATION_URL, SET_UP_PATH, INTEGRATION_PAGE_PATH } = await import("../../../../src/presentation/common/links.js");
  assert.equal(HACS_INTEGRATION_URL, "https://my.home-assistant.io/redirect/hacs_repository/?owner=hyperfelixations&repository=vacuum-orchestrator&category=integration");
  const missing = await at(NOT_INSTALLED);
  const notInstalled = buildOnboarding({ model: missing.model, texts: missing.texts });
  assert.equal(notInstalled.steps.length, 3);
  assert.match(notInstalled.steps[0], /HACS/);
  assert.deepEqual(notInstalled.actions.map((action) => [action.kind, action.href, action.primary]), [["link", HACS_INTEGRATION_URL, true], ["link", INTEGRATION_URL, false]], "one next step stands out");
  assert.equal(notInstalled.note, null);
  const missingAsUser = await at(NOT_INSTALLED, { admin: false });
  const notInstalledAsUser = buildOnboarding({ model: missingAsUser.model, texts: missingAsUser.texts });
  assert.deepEqual(notInstalledAsUser.actions.map((action) => action.href), [INTEGRATION_URL]);
  assert.equal(notInstalledAsUser.note, missingAsUser.texts.t("onboarding.adminInstall"));
  const unset = await at(NOT_SET_UP);
  assert.deepEqual(buildOnboarding({ model: unset.model, texts: unset.texts }).actions.map((action) => action.path), [SET_UP_PATH]);
  const nonAdmin = await at(NOT_SET_UP, { admin: false });
  const asUser = buildOnboarding({ model: nonAdmin.model, texts: nonAdmin.texts });
  assert.deepEqual(asUser.actions, []);
  assert.equal(asUser.note, nonAdmin.texts.t("onboarding.adminRequired"));
  const unloaded = await at(UNLOADED);
  const notLoaded = buildOnboarding({ model: unloaded.model, texts: unloaded.texts });
  assert.deepEqual(notLoaded.actions.map((action) => action.path), [INTEGRATION_PAGE_PATH]);
  // V6: an entry that does not run may be disabled; the pill already says it is not loaded.
  assert.deepEqual([notLoaded.title, notLoaded.note], ["Vacuum Orchestrator is not running", null]);
  const failing = { ...unloaded.model, phaseFailure: { ok: false, code: "unknown", detail: "Boom", channel: "ws" } };
  assert.equal(buildOnboarding({ model: failing, texts: unloaded.texts }).note, unloaded.texts.t("error.code.unknown", { detail: "Boom" }));
  // V6: while the card cannot show the integration, the onboarding says why; the subtitle does not
  // say it a second time.
  const { automaticSubtitle, buildHeader } = await import("../../../../src/presentation/shell/header.js");
  assert.equal(automaticSubtitle(unloaded.model, "loadFailed", unloaded.texts), "");
  assert.equal(buildHeader({ model: missing.model, config: {}, texts: missing.texts, status: "notInstalled" }).hasSubtitle, false);
  // A newer integration than this card speaks; the recordings are all of the supported version.
  const newer = { phase: "api_incompatible", phaseFailure: { ok: false, code: "api_incompatible", detail: "5" }, supportedApiVersions: [4], permissions: { isAdmin: true } };
  assert.equal(buildOnboarding({ model: newer, texts: unloaded.texts }).text, unloaded.texts.t("onboarding.api_incompatible.text", { version: "5", supported: "4" }));
  assert.equal(buildOnboarding({ model: (await at(BUSY)).model, texts: unloaded.texts }), null);
});

test("a failed check names its failure and is not shown as a lost connection", async () => {
  const { buildOnboarding } = await import("../../../../src/presentation/shell/onboarding.js");
  const { cardStatus, toneFor } = await import("../../../../src/presentation/shell/status.js");
  const { textService } = await import("../../../../src/i18n/text-service.js");
  const texts = textService("en");
  const model = { phase: "check_failed", phaseFailure: { ok: false, code: "unknown", detail: "Boom", channel: "ws" }, permissions: { isAdmin: true } };
  const onboarding = buildOnboarding({ model, texts });
  // V6: the card says when it tries again and offers to try at once.
  const { RETRY_MS } = await import("../../../../src/backend/session.js");
  assert.deepEqual([onboarding.title, onboarding.text, onboarding.note, onboarding.busy], [texts.t("onboarding.check_failed.title"), texts.t("onboarding.check_failed.text", { seconds: RETRY_MS / 1000 }), texts.t("error.code.unknown", { detail: "Boom" }), false]);
  assert.equal(onboarding.text, "Home Assistant answered with an error. The card tries again every 30 seconds.");
  assert.deepEqual(onboarding.actions.map((action) => [action.kind, action.label]), [["reload", texts.t("action.retryLoad")]]);
  assert.equal(onboarding.icon, "mdi:help-network-outline");
  assert.equal(cardStatus(model), "checkFailed");
  assert.equal(toneFor("checkFailed").style, toneFor("loadFailed").style.replace(/loadFailed/g, "checkFailed"));
  assert.equal(buildOnboarding({ model: { ...model, phase: "offline" }, texts }).note, null);
});

test("the card view model puts onboarding, a page or the active view into the body, a dialog above it", async () => {
  const { model, texts, context, VIEWS, config } = await shell();
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const cfg = config();
  const tabs = buildTabs({ definitions: VIEWS, model, config: cfg, ui: {}, texts });
  const view = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: { key: "queue" } });
  assert.equal(view.body.kind, "view");
  assert.equal(view.primary.action, "create-job");
  assert.deepEqual(view.primaryReserve.map((entry) => entry.label), ["Add job", "Add room", "Add robot", "New template"], "the tab row reserves the action of every shown view");
  const page = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: {}, page: { key: "job-editor", content: {} } });
  assert.equal(page.body.kind, "overlay");
  assert.deepEqual([page.primary, page.primaryReserve], [null, []], "a page has its own actions");
  assert.deepEqual([page.panel.visible, page.tabs.visible, page.dialog], [false, false, null]);
  const dialog = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: { key: "queue" }, dialog: { key: "confirm", content: {} }, scheme: "dark" });
  assert.deepEqual([dialog.body.kind, dialog.panel.visible, dialog.tabs.visible, dialog.primary.action], ["view", true, true, "create-job"], "the view stays below a dialog");
  assert.deepEqual(dialog.dialog, { kind: "overlay", key: "confirm", content: {}, layer: { busy: false, failure: null } });
  assert.equal(dialog.scheme, "dark");
  const onPage = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: {}, page: { key: "job-editor", content: {} }, dialog: { key: "confirm", content: {} } });
  assert.deepEqual([onPage.body.key, onPage.dialog.key, onPage.panel.visible], ["job-editor", "confirm", false]);
  // UI-19: an empty queue offers "Add job" in its body, so the tab row does not repeat it; the
  // reserve stays, so the row keeps its width.
  const empty = await shell(["queue_end", { from: "The card opens" }]);
  const emptyTabs = buildTabs({ definitions: VIEWS, model: empty.model, config: cfg, ui: {}, texts: empty.texts });
  const emptyView = buildCardViewModel({ model: empty.model, config: cfg, texts: empty.texts, ui: {}, tabs: emptyTabs, definitions: VIEWS, context: empty.context, viewContent: { key: "queue" } });
  assert.equal(emptyView.primary, null, "the empty queue holds the action itself");
  assert.ok(emptyView.primaryReserve.length > 0);
  const notice = buildCardViewModel({ model, config: cfg, texts, ui: { notice: { kind: "error", operation: "run_queue", failure: { code: "unauthorized" } } }, tabs, definitions: VIEWS, context, viewContent: {} });
  assert.equal(notice.notice.text, texts.t("error.code.unauthorized"));
  // UI-16, UI-17: a page or dialog waiting for its command, and a dialog's failure as it shows.
  const waiting = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: {}, page: { key: "job-editor", content: {}, layer: { busy: true, failure: null } } });
  assert.deepEqual(waiting.body.layer, { busy: true, failure: null });
  const layer = (failure) => buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: {}, dialog: { key: "confirm", content: {}, layer: { busy: false, failure } } }).dialog.layer.failure;
  assert.deepEqual(layer({ ok: false, code: "unauthorized" }), { kind: "error", text: texts.t("error.code.unauthorized") });
  assert.deepEqual(layer({ ok: false, code: "timeout" }), { kind: "warning", text: "No answer arrived – the result is unknown. The view is being refreshed." });
  const unknown = buildCardViewModel({ model, config: cfg, texts, ui: { notice: { kind: "warning", messageKey: "notice.outcomeUnknown" } }, tabs, definitions: VIEWS, context, viewContent: {} });
  assert.deepEqual([unknown.notice.kind, unknown.notice.text], ["warning", layer({ ok: false, code: "connection_lost" }).text]);
});

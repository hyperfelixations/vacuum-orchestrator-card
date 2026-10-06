// The card shell as data: one overall status shared by tone, pill, subtitle and panel; the main
// panel; the tab set with automatic views and the start view; notices; onboarding per phase.

const test = require("node:test");
const assert = require("node:assert/strict");
const { modelFor } = require("../../../helpers/model.js");

async function shell(scenario = "typical", options = {}) {
  const built = await modelFor(scenario, options);
  const { VIEWS, VIEW_TYPES, optionSchemaForView } = await import("../../../../src/views/registry.js");
  const { normalizeConfig } = await import("../../../../src/config/normalize-config.js");
  const config = (raw = {}) => normalizeConfig(raw, { viewTypes: VIEW_TYPES, optionSchemaForView });
  return { ...built, VIEWS, config };
}

const statusOf = async (model) => (await import("../../../../src/presentation/shell/status.js")).cardStatus(model);

test("status precedence: phase, attention, work in progress, queue mode, unfinished setup", async () => {
  assert.equal(await statusOf((await modelFor("typical")).model), "cleaning");
  assert.equal(await statusOf((await modelFor("attention")).model), "attention");
  assert.equal(await statusOf((await modelFor("windingDown")).model), "running");
  assert.equal(await statusOf((await modelFor("empty")).model), "idle");
  assert.equal(await statusOf((await modelFor("fresh")).model), "setup");
  assert.equal(await statusOf((await modelFor("typical", { fake: { installed: false, setUp: false } })).model), "notInstalled");
  assert.equal(await statusOf({ phase: "ready", slots: {} }), "connecting");
});

test("the integration's counts mark attention and work before the open jobs are read", async () => {
  const { cardStatus } = await import("../../../../src/presentation/shell/status.js");
  const { automaticSubtitle } = await import("../../../../src/presentation/shell/header.js");
  const { textService } = await import("../../../../src/i18n/text-service.js");
  const texts = textService("en");
  const queue = (fields) => ({ phase: "ready", slots: { queue: { data: { mode: "idle", needsAttention: false, recoveryTargets: [], total: 0, activeCount: 0, attentionCount: 0, ...fields } } } });
  assert.equal(cardStatus(queue({ attentionCount: 2 })), "attention");
  assert.equal(automaticSubtitle(queue({ attentionCount: 2 }), "attention", texts), texts.t("subtitle.attentionJobs", { count: 2 }));
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

test("the automatic subtitle names what the card is doing", async () => {
  const { automaticSubtitle } = await import("../../../../src/presentation/shell/header.js");
  const typical = await modelFor("typical");
  assert.equal(automaticSubtitle(typical.model, "cleaning", typical.texts), typical.texts.t("subtitle.activeJob", { job: "Living room", state: typical.texts.t("job.state.running") }));
  const attention = await modelFor("attention");
  assert.equal(automaticSubtitle(attention.model, "attention", attention.texts), attention.texts.t("subtitle.recoveryOne", { robot: "Rocky" }));
  const winding = await modelFor("windingDown");
  assert.match(automaticSubtitle(winding.model, "running", winding.texts), /12/);
  const fresh = await modelFor("fresh");
  assert.equal(automaticSubtitle(fresh.model, "setup", fresh.texts), fresh.texts.t("subtitle.setupIncomplete"));
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
  assert.equal(panel.robots.length, 2);
  assert.deepEqual([panel.control.command, panel.control.label, panel.control.decision.state], ["pause_queue", texts.t("panel.control.pause"), "enabled"]);
  assert.deepEqual([panel.end.action, panel.end.label, panel.end.decision.state], ["end-queue", texts.t("panel.control.end"), "enabled"]);
  const hidden = buildPanel({ model, config: config({ show: { queue_controls: false } }), texts, context });
  assert.deepEqual([hidden.control, hidden.end], [null, null]);
  const ending = await modelFor("ending");
  const ended = buildPanel({ model: ending.model, config: config(), texts: ending.texts, context: ending.context });
  assert.deepEqual([ended.runLine, ended.control.command, ended.end], [ending.texts.t("panel.ending"), "resume_queue", null], "an ending queue offers resuming, which takes the end back");
  const empty = await modelFor("empty");
  assert.equal(buildPanel({ model: empty.model, config: config(), texts: empty.texts, context: empty.context }).end, null);
  assert.equal(buildPanel({ model, config: config({ show: { panel: false } }), texts, context }).visible, false);
  const winding = await modelFor("windingDown");
  assert.match(buildPanel({ model: winding.model, config: config(), texts: winding.texts, context: winding.context }).runLine, /12/);
});

test("by default the five everyday views show; settings for administrators, diagnostics and setup only when needed", async () => {
  const { model, texts, VIEWS, config } = await shell();
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const tabs = buildTabs({ definitions: VIEWS, model, config: config(), ui: {}, texts });
  assert.deepEqual(tabs.tabs.map((tab) => tab.key), ["queue", "rooms", "robots", "templates", "history", "settings"]);
  const reader = await shell("typical", { admin: false });
  const readerTabs = buildTabs({ definitions: VIEWS, model: reader.model, config: config(), ui: {}, texts });
  assert.deepEqual(readerTabs.tabs.map((tab) => tab.key), ["queue", "rooms", "robots", "templates", "history"], "who may change nothing sees no settings");
  const forced = buildTabs({ definitions: VIEWS, model: reader.model, config: config({ views: ["queue", { type: "settings", enabled: true }] }), ui: {}, texts });
  assert.deepEqual(forced.tabs.map((tab) => tab.key), ["queue", "settings"]);
  assert.equal(tabs.active, "queue");
  assert.equal(tabs.visible, true);
  const fresh = await shell("fresh");
  const setupTabs = buildTabs({ definitions: VIEWS, model: fresh.model, config: config(), ui: {}, texts });
  assert.equal(setupTabs.tabs[0].key, "setup");
  assert.equal(setupTabs.active, "setup", "an unfinished setup is where the card starts");
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
  assert.match(block.text, /page_size/);
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
  const missing = await modelFor("typical", { fake: { installed: false, setUp: false } });
  const notInstalled = buildOnboarding({ model: missing.model, texts: missing.texts });
  assert.equal(notInstalled.steps.length, 3);
  assert.match(notInstalled.steps[0], /HACS/);
  assert.deepEqual(notInstalled.actions.map((action) => [action.kind, action.href]), [["link", HACS_INTEGRATION_URL], ["link", INTEGRATION_URL]]);
  assert.equal(notInstalled.note, null);
  const missingAsUser = await modelFor("typical", { fake: { installed: false, setUp: false }, admin: false });
  const notInstalledAsUser = buildOnboarding({ model: missingAsUser.model, texts: missingAsUser.texts });
  assert.deepEqual(notInstalledAsUser.actions.map((action) => action.href), [INTEGRATION_URL]);
  assert.equal(notInstalledAsUser.note, missingAsUser.texts.t("onboarding.adminInstall"));
  const unset = await modelFor("typical", { fake: { setUp: false } });
  assert.deepEqual(buildOnboarding({ model: unset.model, texts: unset.texts }).actions.map((action) => action.path), [SET_UP_PATH]);
  const nonAdmin = await modelFor("typical", { fake: { setUp: false }, admin: false });
  const asUser = buildOnboarding({ model: nonAdmin.model, texts: nonAdmin.texts });
  assert.deepEqual(asUser.actions, []);
  assert.equal(asUser.note, nonAdmin.texts.t("onboarding.adminRequired"));
  const failed = await modelFor("typical", { fake: { runtimeLoaded: false } });
  assert.deepEqual(buildOnboarding({ model: failed.model, texts: failed.texts }).actions.map((action) => action.path), [INTEGRATION_PAGE_PATH]);
  const newer = await modelFor("typical", { fake: { apiVersion: 4 } });
  assert.equal(buildOnboarding({ model: newer.model, texts: newer.texts }).text, newer.texts.t("onboarding.api_incompatible.text", { version: "4", supported: "3" }));
  assert.equal(buildOnboarding({ model: (await modelFor("typical")).model, texts: failed.texts }), null);
});

test("a failed check names its failure and is not shown as a lost connection", async () => {
  const { buildOnboarding } = await import("../../../../src/presentation/shell/onboarding.js");
  const { cardStatus, toneFor } = await import("../../../../src/presentation/shell/status.js");
  const { textService } = await import("../../../../src/i18n/text-service.js");
  const texts = textService("en");
  const model = { phase: "check_failed", phaseFailure: { ok: false, code: "unknown", detail: "Boom", channel: "ws" }, permissions: { isAdmin: true } };
  const onboarding = buildOnboarding({ model, texts });
  assert.deepEqual([onboarding.title, onboarding.text, onboarding.note, onboarding.actions, onboarding.busy], [texts.t("onboarding.check_failed.title"), texts.t("onboarding.check_failed.text"), texts.t("error.code.unknown", { detail: "Boom" }), [], false]);
  assert.equal(onboarding.icon, "mdi:help-network-outline");
  assert.equal(cardStatus(model), "checkFailed");
  assert.equal(toneFor("checkFailed").style, toneFor("loadFailed").style.replace(/loadFailed/g, "checkFailed"));
  assert.equal(buildOnboarding({ model: { ...model, phase: "offline" }, texts }).note, null);
});

test("the card view model puts onboarding, an overlay or the active view into the body", async () => {
  const { model, texts, context, VIEWS, config } = await shell();
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const cfg = config();
  const tabs = buildTabs({ definitions: VIEWS, model, config: cfg, ui: {}, texts });
  const view = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: { key: "queue" } });
  assert.equal(view.body.kind, "view");
  assert.equal(view.primary.action, "create-job");
  const overlay = buildCardViewModel({ model, config: cfg, texts, ui: {}, tabs, definitions: VIEWS, context, viewContent: {}, overlay: { key: "job-editor", content: {} } });
  assert.equal(overlay.body.kind, "overlay");
  assert.equal(overlay.primary, null, "a page has its own actions");
  const notice = buildCardViewModel({ model, config: cfg, texts, ui: { notice: { kind: "error", operation: "run_queue", failure: { code: "unauthorized" } } }, tabs, definitions: VIEWS, context, viewContent: {} });
  assert.equal(notice.notice.text, texts.t("error.code.unauthorized"));
});

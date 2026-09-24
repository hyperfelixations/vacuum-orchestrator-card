"use strict";
// The shell view model: header, tone, tab strip and body slot. Section content is not built
// here; the shell only reserves its place.

const test = require("node:test");
const assert = require("node:assert/strict");

const texts = { t: (key, vars = {}) => key === "card.title" ? "Cleaning" : key === "subtitle.queued" ? `${vars.count} queued` : key, formatNumber: (value) => String(value) };
const config = { title: { text: null, overflow: "wrap" }, subtitle: { text: null, overflow: "clip" }, show: { icon: true, title: true, subtitle: true, pill: true, stats: true, tabs: "auto", warnings: true, queue_controls: true }, accent_line: "top", density: "auto", _configDiagnostics: [] };

test("shell view model exposes a complete unavailable shell", async () => {
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const model = { connection: { state: "backend_missing" }, permissions: {}, queue: {}, active: {}, attention: {}, robots: {}, diagnostics: { warnings: [], hints: [] } };
  const view = buildCardViewModel({ model, config, texts, sectionDefinitions: [] });
  assert.equal(view.empty, true);
  assert.equal(view.body.kind, "empty");
  assert.equal(view.header.hasTitle, true);
  assert.equal(view.tabs.tabs.length, 0);
});

// A dropped connection keeps the last snapshot on screen; only a backend the card can never
// reach replaces the body.
test("a disconnected backend keeps the section body", async () => {
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const definitions = [{ key: "queue", requires: ["queueRead"], defaultEnabled: () => true }];
  const model = { connection: { state: "disconnected" }, permissions: {}, capabilities: { queueRead: true }, queue: {}, active: {}, attention: {}, robots: {}, diagnostics: { warnings: [], hints: [] } };
  const view = buildCardViewModel({ model, config, texts, sectionDefinitions: definitions, sectionContent: { rows: [] } });
  assert.equal(view.empty, false);
  assert.equal(view.body.kind, "section");
});

test("tabs auto-hide when they offer no choice and list sections the backend cannot serve yet", async () => {
  const { buildTabs } = await import("../../../../src/presentation/shell/tabs.js");
  const definitions = [
    { key: "queue", requires: ["queueRead"], defaultEnabled: () => true },
    { key: "rooms", requires: ["areasRead"], defaultEnabled: () => true },
  ];
  const model = { capabilities: { queueRead: true, areasRead: false } };
  const both = buildTabs({ sectionDefinitions: definitions, model, config: { show: { tabs: "auto", unavailable_sections: true } }, texts });
  assert.equal(both.visible, true);
  assert.equal(both.tabs.find((tab) => tab.key === "rooms").degraded, true);
  assert.equal(both.active, "queue");
  const hidden = buildTabs({ sectionDefinitions: definitions, model, config: { show: { tabs: "auto", unavailable_sections: false } }, texts });
  assert.deepEqual(hidden.tabs.map((tab) => tab.key), ["queue"]);
  assert.equal(hidden.visible, false);
});

test("shell subtitle precedence uses active job before queue summary", async () => {
  const { buildHeader } = await import("../../../../src/presentation/shell/header.js");
  const model = { connection: { state: "connected" }, active: { jobs: [{ name: "Kitchen", mode: "mop" }] }, queue: { total: 3 }, attention: {} };
  assert.match(buildHeader({ model, config, texts }).subtitle, /activeJob|Kitchen/);
});

test("tone resolves attention, running and unavailable states", async () => {
  const { resolveTone } = await import("../../../../src/presentation/shell/tone.js");
  assert.equal(resolveTone({ connection: { state: "backend_missing" } }).key, "unsupported");
  assert.equal(resolveTone({ connection: { state: "connected" }, active: { jobs: [{}] }, queue: {} }).key, "running");
  assert.equal(resolveTone({ connection: { state: "connected" }, active: {}, queue: {}, attention: { available: true, jobs: [{}] } }).key, "attention");
});

// Every part the card can be asked to leave out, and the markup that remains when it does.
test("the shell renders only the parts the configuration asks for", async () => {
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const { renderCardBody } = await import("../../../../src/render/composition/card-shell.js");
  const definitions = [{ key: "queue", requires: ["queueRead"], defaultEnabled: () => true }];
  const model = {
    connection: { state: "connected" },
    permissions: { canCommand: true },
    capabilities: { queueRead: true, jobCreate: true, queueRun: true },
    queue: { mode: "idle", pending: [] },
    active: { jobs: [] },
    attention: { jobs: [] },
    robots: {},
    commands: { pending: [] },
    diagnostics: { warnings: [], hints: [] },
  };
  const context = { texts, htmlToNodes: () => [] };
  const render = (overrides) =>
    renderCardBody(
      context,
      buildCardViewModel({ model, config: { ...config, ...overrides, show: { ...config.show, ...(overrides.show || {}) } }, texts, sectionDefinitions: definitions, sectionContent: {} }),
      []
    );

  const complete = render({});
  for (const part of ["voc-icon-badge", "voc-title", "voc-subtitle", "voc-status-pill", "voc-stats", "voc-primary-action", "voc-queue-controls", "voc-top-line"]) {
    assert.match(complete, new RegExp(part), `${part} is drawn by default`);
  }

  const bare = render({ show: { icon: false, title: false, subtitle: false, pill: false, stats: false, queue_controls: false }, accent_line: "bottom" });
  for (const part of ["voc-icon-badge", "voc-title", "voc-stats", "voc-queue-controls"]) {
    assert.doesNotMatch(bare, new RegExp(part), `${part} is left out on request`);
  }
  assert.match(bare, /data-accent-line="bottom"/);
  assert.match(bare, /voc-primary-action/, "the primary action is not part of the header");

  // A header with nothing in it is not an empty header, it is no header at all.
  assert.doesNotMatch(bare, /class="voc-header"/);
});

test("the shell marks the overflow the header was configured for", async () => {
  const { buildCardViewModel } = await import("../../../../src/presentation/shell/card-view-model.js");
  const { renderCardBody } = await import("../../../../src/render/composition/card-shell.js");
  const model = { connection: { state: "backend_missing" }, permissions: {}, queue: {}, active: {}, attention: {}, robots: {}, diagnostics: { warnings: [], hints: [] } };
  const render = (title, subtitle) =>
    renderCardBody(
      { texts, htmlToNodes: () => [] },
      buildCardViewModel({ model, config: { ...config, title, subtitle }, texts, sectionDefinitions: [] }),
      []
    );
  const clipped = render({ text: "Cleaning", overflow: "clip" }, { text: "Ground floor", overflow: "wrap" });
  assert.match(clipped, /data-title="clip"/);
  assert.match(clipped, /data-subtitle="wrap"/);

  const wrapped = render({ text: "Cleaning", overflow: "wrap" }, { text: "Ground floor", overflow: "clip" });
  assert.doesNotMatch(wrapped, /data-title=/);
  assert.doesNotMatch(wrapped, /data-subtitle=/);
});

// The card-wide controls answer to the same policy as a row control.
test("the card controls close down for a read-only user and for a missing capability", async () => {
  const { buildCardControls } = await import("../../../../src/presentation/shell/controls.js");
  const base = { connection: { state: "connected" }, queue: { mode: "running" }, commands: { pending: [] } };

  const usable = buildCardControls({ model: { ...base, permissions: { canCommand: true }, capabilities: { jobCreate: true, queuePause: true } }, config: {}, texts });
  assert.equal(usable.queue.action, "pause-queue");
  assert.equal(usable.queue.ariaDisabled, false);
  assert.equal(usable.primary.visible, true);

  const readOnly = buildCardControls({ model: { ...base, permissions: { canCommand: false }, capabilities: { jobCreate: true, queuePause: true } }, config: {}, texts });
  assert.equal(readOnly.queue.ariaDisabled, true);
  assert.equal(readOnly.primary.ariaDisabled, true);

  const noCapability = buildCardControls({ model: { ...base, permissions: { canCommand: true }, capabilities: {} }, config: {}, texts });
  assert.equal(noCapability.queue.ariaDisabled, true);
  assert.equal(noCapability.primary.ariaDisabled, true);

  const pending = buildCardControls({ model: { ...base, permissions: { canCommand: true }, capabilities: { jobCreate: true, queuePause: true }, commands: { pending: ["queue", "create"] } }, config: {}, texts });
  assert.equal(pending.queue.disabled, true, "a command already on its way cannot be sent twice");
  assert.equal(pending.primary.disabled, true);

  const hidden = buildCardControls({ model: { ...base, permissions: { canCommand: true }, capabilities: { jobCreate: true } }, config: { show: { queue_controls: false } }, texts });
  assert.equal(hidden.queue.visible, false);
  assert.equal(hidden.primary.visible, true);

  const overlay = buildCardControls({ model: { ...base, permissions: { canCommand: true }, capabilities: { jobCreate: true } }, config: {}, texts, overlay: { key: "editor" } });
  assert.equal(overlay.primary.visible, false, "an overlay is its own page");
  assert.equal(overlay.queue.visible, false);

  const modes = ["idle", "paused"].map((mode) => buildCardControls({ model: { ...base, queue: { mode }, permissions: { canCommand: true }, capabilities: { queueRun: true, queueResume: true } }, config: {}, texts }).queue.action);
  assert.deepEqual(modes, ["run-queue", "resume-queue"]);
});

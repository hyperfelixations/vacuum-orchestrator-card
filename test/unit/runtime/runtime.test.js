"use strict";
// The runtime owners: UI route, render controller and console reporter.
// Boundary: controller behaviour with a stub platform, never a real browser.

const test = require("node:test");
const assert = require("node:assert/strict");

test("ui state owns route, overlay, draft and focus transitions", async () => {
  const { createUIState } = await import("../../../src/controllers/runtime/ui-state.js");
  const ui = createUIState({ section: "queue" });
  let published = 0;
  ui.subscribe(() => { published += 1; });
  ui.openOverlay({ kind: "editor", draft: { name: "Kitchen" } });
  assert.equal(ui.draft.name, "Kitchen");
  ui.setDraft({ name: "Kitchen", passes: 2 });
  assert.equal(ui.overlay.kind, "editor");
  assert.equal(ui.draft.passes, 2);
  // A focus request is data for the next render, not a reason for one.
  const before = published;
  ui.requestFocus("input");
  assert.equal(published, before);
  assert.equal(ui.consumeFocus(), "input");
  assert.equal(ui.consumeFocus(), null);
  ui.closeOverlay();
  assert.equal(ui.overlay, null);
  assert.equal(ui.draft, null);
});

test("render controller commits only after a successful render", async () => {
  const { createRenderController, RENDER_PATH } = await import("../../../src/controllers/render/render-controller.js");
  let fail = true;
  const controller = createRenderController({ computeStructureSignature: () => "shell", computeViewModel: () => ({ empty: true, tone: "idle", header: { hasIcon: false, hasTitle: true, hasSubtitle: false, hasPill: true }, warning: { visible: false }, hasStats: false, hasTabs: false, body: { kind: "empty" }, accentLine: false }), isDragging: () => false, renderAll: () => { if (fail) throw new Error("boom"); }, updateEmpty() {}, updateContent() {} });
  assert.throws(() => controller.render({ dataSignature: "a", structuralConfigSignature: "b" }), /boom/);
  fail = false;
  assert.equal(controller.render({ dataSignature: "a", structuralConfigSignature: "b" }), RENDER_PATH.FULL);
  assert.equal(controller.render({ dataSignature: "a", structuralConfigSignature: "b" }), RENDER_PATH.SKIP);
});

test("diagnostic reporter writes one line per changed set", async () => {
  const { createDiagnosticsReporter } = await import("../../../src/controllers/runtime/diagnostics-reporter.js");
  const logs = [];
  const reporter = createDiagnosticsReporter({ platform: { log: (...args) => logs.push(args) }, describe: (entry) => entry.key });
  reporter.reportWarnings([{ key: "one" }]);
  reporter.reportWarnings([{ key: "one" }]);
  reporter.reportWarnings([{ key: "two" }]);
  assert.equal(logs.length, 2);
});

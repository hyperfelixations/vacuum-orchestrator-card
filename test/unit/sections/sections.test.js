"use strict";
// The section registry, the seven card-owned controls and the escaping of section markup.
// Boundary: section modules in isolation; their wiring is a component test.

const test = require("node:test");
const assert = require("node:assert/strict");

async function textContext(language = "en") {
  const i18n = await import("../../../src/i18n/translate.js");
  const formatters = await import("../../../src/i18n/formatters.js");
  return {
    language,
    t: (key, vars) => i18n.translate(language, key, vars),
    formatNumber: (value, options) => options === undefined ? formatters.formatNumber(language, value) : formatters.formatNumber(language, value, options),
    formatDateTime: (value) => formatters.formatDateTime(language, value),
    formatRelative: (nowMs, thenMs) => formatters.formatRelative(language, nowMs, thenMs),
    formatDuration: (value) => formatters.formatDuration(language, value),
  };
}

function context(texts) {
  return { texts, icons: {} };
}

function model() {
  const keys = ["queueRead", "jobRead", "jobsHistory", "jobCreate", "jobUpdate", "jobDelete", "jobMove", "jobStart", "jobCancel", "jobRetry", "queueRun", "queuePause", "queueResume"];
  return {
    capabilities: { available: true, keys, values: Object.fromEntries(keys.map((key) => [key, true])) },
    permissions: { isAdmin: true, canCommand: true, readOnly: false },
    queue: { available: true, mode: "idle", revision: 1, total: 1, offset: 0, limit: 25, pending: [{ api_version: 2, job_id: "job-x", revision: 1, state: "queued", name: "<unsafe>", areas: ["kitchen"], mode: "vacuum", passes: 1, settings_policy: "best_effort", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z" }] },
    active: { jobs: [] },
    areas: { available: false, items: [], registry: [] },
    commands: { pending: {} },
  };
}

test("section registry has one implementation per normative section and no drift", async () => {
  const { SECTION_DEFINITIONS, SECTION_RENDERERS, optionSchemaForSection } = await import("../../../src/sections/index.js");
  assert.deepEqual(SECTION_DEFINITIONS.map((definition) => definition.key), ["queue", "rooms", "robots", "history", "diagnostics"]);
  assert.deepEqual(SECTION_RENDERERS.map((renderer) => renderer.key), ["queue", "rooms", "robots", "history", "diagnostics"]);
  assert.equal(new Set(SECTION_RENDERERS.map((renderer) => renderer.key)).size, SECTION_RENDERERS.length);
  for (const renderer of SECTION_RENDERERS) {
    assert.equal(typeof renderer.build, "function");
    assert.equal(typeof renderer.render, "function");
    assert.equal(typeof renderer.patch, "function");
  }
  assert.deepEqual(Object.keys(optionSchemaForSection("queue")), []);
  assert.equal(optionSchemaForSection("robots").show_map.default, true);
  assert.equal(optionSchemaForSection("unknown"), null);
});

test("all seven card-owned controls expose render, patch and focus ports with ARIA state", async () => {
  const { CONTROL_REGISTRY } = await import("../../../src/sections/controls/index.js");
  const texts = await textContext();
  const controlFields = {
    segmented: { path: "mode", label: "Mode", options: [{ value: "vacuum", label: "Vacuum" }, { value: "mop", label: "Mop" }], value: "vacuum" },
    "chip-select": { path: "areas", label: "Rooms", options: [{ value: "kitchen", label: "Kitchen" }], value: ["kitchen"] },
    stepper: { path: "passes", label: "Passes", min: 1, max: 10, value: 2 },
    "text-field": { path: "name", label: "Name", value: "Kitchen" },
    "entity-combobox": { path: "requiredOn", label: "Required on", options: [{ value: "input_boolean.allowed", label: "Allowed" }], value: [] },
    switch: { path: "release", label: "Release", checked: true },
    "form-field": { path: "note", label: "Note", value: "", controlMarkup: '<input aria-label="Note">' },
  };
  for (const [kind, control] of Object.entries(CONTROL_REGISTRY)) {
    assert.equal(typeof control.render, "function", kind);
    assert.equal(typeof control.patch, "function", kind);
    assert.equal(typeof control.focus, "function", kind);
    const markup = control.render(context(texts), controlFields[kind]);
    assert.match(markup, /data-control|voc-form-field/);
    assert.match(markup, /aria-/);
  }
});

test("queue and overlays escape variable text and keep action reasons localized", async () => {
  const { queueSection } = await import("../../../src/sections/queue.js");
  const { jobEditorOverlay } = await import("../../../src/sections/overlays/job-editor.js");
  const { confirmOverlay } = await import("../../../src/sections/overlays/confirm.js");
  const { createDraft } = await import("../../../src/domain/job-draft.js");
  const texts = await textContext();
  const renderContext = context(texts);
  const queueView = queueSection.build(model(), texts, { timeFormat: "absolute" });
  const queueMarkup = queueSection.render(renderContext, queueView);
  assert.doesNotMatch(queueMarkup, /<img/);
  assert.match(queueMarkup, /&lt;unsafe&gt;/);

  const editor = jobEditorOverlay.build(model(), texts, {}, { draft: createDraft(null) });
  const editorMarkup = jobEditorOverlay.render(renderContext, editor);
  assert.match(editorMarkup, /data-editor-group="areas"/);
  assert.match(editorMarkup, /data-editor-group="requirements"/);
  assert.doesNotMatch(editorMarkup, /form\.unsaved|action\.disabled\./);

  const confirm = confirmOverlay.build(model(), texts, { textKey: "confirm.deleteJob.text", jobName: "<Kitchen>" }, {});
  const confirmMarkup = confirmOverlay.render(renderContext, confirm);
  assert.match(confirmMarkup, /role="alertdialog"/);
  assert.match(confirmMarkup, /&lt;Kitchen&gt;/);
  assert.doesNotMatch(confirmMarkup, /undefined/);
});

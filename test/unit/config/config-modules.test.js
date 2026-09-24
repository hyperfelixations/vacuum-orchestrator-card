"use strict";
// The YAML contract: what is accepted, what is refused, and what degrades to a fallback.
// Boundary: normalization only; how a value is rendered is a presentation concern.

const test = require("node:test");
const assert = require("node:assert/strict");

let config;
test.before(async () => { config = await import("../../../src/config/normalize-config.js"); });

const collaborators = { sectionTypes: ["queue", "diagnostics"], optionSchemaForSection: () => ({ compact: { default: false, validate: (value) => typeof value === "boolean" } }), isSupportedLanguage: (value) => ["en", "de"].includes(value) };

test("empty configuration is the complete null configuration", () => {
  const normalized = config.normalizeConfig({}, collaborators);
  assert.equal(normalized.page_size, 25);
  assert.equal(normalized.language, "auto");
  assert.equal(normalized.sections, null);
  assert.deepEqual(normalized._configDiagnostics, []);
});

test("unknown typo rejects while framework keys and foreign keys are handled separately", async () => {
  assert.throws(() => config.normalizeConfig({ pag_size: 20 }, collaborators), (error) => error.code === "config.unknown_key");
  const normalized = config.normalizeConfig({ card_mod: {}, external_option: true }, collaborators);
  assert.equal(normalized._configDiagnostics.length, 1);
  assert.equal(normalized._configDiagnostics[0].code, "config.foreign_key");
});

test("normalization copies accepted values and records fallback diagnostics", () => {
  const normalized = config.normalizeConfig({ language: "de", page_size: 20, show: { tabs: false }, sections: ["queue", { type: "diagnostics", enabled: false, options: { compact: true } }], time_format: "absolute" }, collaborators);
  assert.equal(normalized.language, "de");
  assert.equal(normalized.show.tabs, false);
  assert.equal(normalized.sections[1].options.compact, true);
  assert.equal(normalized.time_format, "absolute");
  const fallback = config.normalizeConfig({ page_size: 101, density: "dense" }, collaborators);
  assert.equal(fallback.page_size, 25);
  assert.equal(fallback.density, "auto");
  assert.equal(fallback._configDiagnostics.length, 2);
});

test("duplicate sections are a closed configuration error", () => {
  assert.throws(() => config.normalizeConfig({ sections: ["queue", "queue"] }, collaborators), (error) => error.code === "config.duplicate_section");
});

test("config helpers expose strict action and list contracts", async () => {
  const actions = await import("../../../src/config/actions.js");
  const primitives = await import("../../../src/config/primitives.js");
  const diagnostics = [];
  assert.deepEqual(actions.normalizeAction({ action: "navigate", path: "/x" }, "tap_action", diagnostics, { action: "none" }), { action: "navigate", path: "/x" });
  assert.deepEqual(actions.normalizeAction({ action: "javascript" }, "tap_action", diagnostics, { action: "none" }), { action: "none" });
  assert.deepEqual(primitives.readStringList([" a ", "a", "b"], "items", diagnostics), ["a", "b"]);
});

// Every shape a section entry can take, and the one diagnostic each wrong shape produces.
test("section entries degrade one by one instead of failing the whole card", () => {
  const codes = (normalized) => normalized._configDiagnostics.map((entry) => entry.path);

  const notAList = config.normalizeConfig({ sections: "queue" }, collaborators);
  assert.equal(notAList.sections, null, "an unusable list falls back to the automatic set");
  assert.deepEqual(codes(notAList), ["sections"]);

  const unknownType = config.normalizeConfig({ sections: ["queue", "kitchen"] }, collaborators);
  assert.deepEqual(unknownType.sections.map((entry) => entry.type), ["queue"]);
  assert.deepEqual(codes(unknownType), ["sections[1]"]);

  const unknownObjectType = config.normalizeConfig({ sections: [{ type: "kitchen" }] }, collaborators);
  assert.deepEqual(codes(unknownObjectType), ["sections[0].type"]);

  // `enabled` is a tri-state: true, false, or "auto" — the section's own default.
  const badEnabled = config.normalizeConfig({ sections: [{ type: "queue", enabled: "yes" }] }, collaborators);
  assert.equal(badEnabled.sections[0].enabled, "auto");
  assert.deepEqual(codes(badEnabled), ["sections[0].enabled"]);

  const badOptions = config.normalizeConfig({ sections: [{ type: "queue", options: [] }] }, collaborators);
  assert.deepEqual(badOptions.sections[0].options, {});
  assert.deepEqual(codes(badOptions), ["sections[0].options"]);

  const badOptionValue = config.normalizeConfig({ sections: [{ type: "queue", options: { compact: "yes" } }] }, collaborators);
  assert.deepEqual(badOptionValue.sections[0].options, {});
  assert.deepEqual(codes(badOptionValue), ["sections[0].options.compact"]);

  // An unknown key inside a section is a typo in the card's own contract, so it is refused.
  assert.throws(() => config.normalizeConfig({ sections: [{ type: "queue", optons: {} }] }, collaborators), (error) => error.code === "config.unknown_key");
  assert.throws(() => config.normalizeConfig({ sections: [{ type: "queue", options: { compct: true } }] }, collaborators), (error) => error.code === "config.unknown_key");
});

// Normalization knows the section catalogue, not which sections the backend will offer, so a
// section that is merely not enabled here is still a valid written value.
test("a start section outside the catalogue falls back to the automatic choice", () => {
  const unknown = config.normalizeConfig({ start_section: "kitchen" }, collaborators);
  assert.equal(unknown.start_section, null);
  assert.equal(unknown._configDiagnostics[0].path, "start_section");

  const notEnabledHere = config.normalizeConfig({ sections: ["queue"], start_section: "diagnostics" }, collaborators);
  assert.equal(notEnabledHere.start_section, "diagnostics");
  assert.deepEqual(notEnabledHere._configDiagnostics, []);

  const chosen = config.normalizeConfig({ sections: ["queue", "diagnostics"], start_section: "diagnostics" }, collaborators);
  assert.equal(chosen.start_section, "diagnostics");
  assert.deepEqual(chosen._configDiagnostics, []);
});

// Header fields accept four written forms; anything else keeps the automatic text.
test("the header fields accept their written forms and refuse the rest", () => {
  assert.deepEqual(config.normalizeConfig({ title: "Cleaning" }, collaborators).title, { text: "Cleaning", overflow: "wrap" });
  assert.deepEqual(config.normalizeConfig({ title: "" }, collaborators).title, { text: "", overflow: "wrap" });
  assert.deepEqual(config.normalizeConfig({ title: { text: "Cleaning", overflow: "clip" } }, collaborators).title, { text: "Cleaning", overflow: "clip" });
  assert.deepEqual(config.normalizeConfig({ subtitle: { text: "Ground floor" } }, collaborators).subtitle, { text: "Ground floor", overflow: "clip" });

  const wrongOverflow = config.normalizeConfig({ title: { text: "Cleaning", overflow: "scroll" } }, collaborators);
  assert.equal(wrongOverflow.title.overflow, "wrap");
  assert.equal(wrongOverflow._configDiagnostics[0].path, "title.overflow");

  const wrongType = config.normalizeConfig({ title: 5 }, collaborators);
  assert.equal(wrongType.title.text, null);
  assert.equal(wrongType._configDiagnostics[0].path, "title");
});

test("numbers, enumerations and switches keep their default when the value is unusable", () => {
  const normalized = config.normalizeConfig(
    { page_size: 4, time_format: "someday", density: 7, confirm_destructive: "yes", language: "fr", accent_line: "left", show: { stats: "maybe", tabs: "auto" } },
    collaborators
  );
  assert.equal(normalized.page_size, 25);
  assert.equal(normalized.time_format, "auto");
  assert.equal(normalized.density, "auto");
  assert.equal(normalized.confirm_destructive, true);
  assert.equal(normalized.language, "auto");
  assert.equal(normalized.accent_line, "top");
  assert.equal(normalized.show.stats, true);
  assert.equal(normalized.show.tabs, "auto", "auto is a value of its own, not a refusal");
  assert.deepEqual(
    normalized._configDiagnostics.map((entry) => entry.path).sort(),
    ["accent_line", "confirm_destructive", "density", "language", "page_size", "show.stats", "time_format"]
  );
  assert.equal(config.normalizeConfig({ page_size: "30" }, collaborators).page_size, 30, "a written number is a number");

  // A `show` block of the wrong shape is a value error, not a refusal: the card still draws.
  const wrongShow = config.normalizeConfig({ show: [] }, collaborators);
  assert.equal(wrongShow.show.stats, true);
  assert.equal(wrongShow._configDiagnostics[0].path, "show");
});

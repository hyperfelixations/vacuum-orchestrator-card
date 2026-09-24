"use strict";
// The readers every configuration value passes through: what they accept, what they replace,
// and the diagnostic each replacement leaves behind.
// Boundary: one value at a time; how the whole configuration is assembled is its own test.

const test = require("node:test");
const assert = require("node:assert/strict");

let primitives;
let diagnosticsModule;
test.before(async () => {
  primitives = await import("../../../src/config/primitives.js");
  diagnosticsModule = await import("../../../src/core/diagnostics.js");
});

const collect = () => [];

test("a written text is trimmed and anything else falls back with a diagnostic", () => {
  const diagnostics = collect();
  assert.equal(primitives.readText("  Cleaning  ", "title", diagnostics), "Cleaning");
  assert.equal(primitives.readText(undefined, "title", diagnostics), null);
  assert.equal(primitives.readText(null, "title", diagnostics), null);
  assert.equal(diagnostics.length, 0, "an unwritten value is not a mistake");

  assert.equal(primitives.readText("   ", "title", diagnostics), null);
  assert.equal(primitives.readText(7, "title", diagnostics), null);
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].code, "value.invalid");
  assert.equal(diagnostics[0].path, "title");
});

// A label may be empty on purpose — that is how a header part is switched off in YAML.
test("a label keeps an empty string where a text would be refused", () => {
  const diagnostics = collect();
  assert.equal(primitives.readLabel("", "title.text", diagnostics), "");
  assert.equal(primitives.readLabel("  Cleaning ", "title.text", diagnostics), "Cleaning");
  assert.equal(primitives.readLabel(undefined, "title.text", diagnostics), null);
  assert.equal(diagnostics.length, 0);

  assert.equal(primitives.readLabel([], "title.text", diagnostics), null);
  assert.equal(diagnostics.length, 1);
});

test("a string list drops what it cannot use and keeps the order of the rest", () => {
  const diagnostics = collect();
  assert.deepEqual(primitives.readStringList(undefined, "sections", diagnostics), []);
  assert.deepEqual(primitives.readStringList(["queue", "queue", " rooms "], "sections", diagnostics), ["queue", "rooms"]);
  assert.equal(diagnostics.length, 0, "a duplicate is not worth a warning");

  assert.deepEqual(primitives.readStringList("queue", "sections", diagnostics), []);
  assert.equal(diagnostics.at(-1).path, "sections");

  assert.deepEqual(primitives.readStringList(["queue", 7], "sections", diagnostics), ["queue"]);
  assert.equal(diagnostics.at(-1).path, "sections[1]");

  // With `allowEmpty: false` a blank entry is a mistake rather than a value.
  const strict = collect();
  assert.deepEqual(primitives.readStringList(["queue", "  "], "sections", strict, { allowEmpty: false }), ["queue"]);
  assert.equal(strict.at(-1).path, "sections[1]");
});

test("an object reader accepts only a plain object", () => {
  const diagnostics = collect();
  assert.deepEqual(primitives.readObject({ stats: true }, "show", diagnostics), { stats: true });
  assert.equal(primitives.readObject(undefined, "show", diagnostics), null);
  assert.equal(diagnostics.length, 0);

  assert.equal(primitives.readObject([], "show", diagnostics), null);
  assert.equal(primitives.readObject("stats", "show", diagnostics), null);
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].fallback, diagnosticsModule.FALLBACK.DEFAULTS);
});

// This reader has no fallback to offer: its caller cannot continue with a wrong value.
test("a number read at a path refuses instead of replacing", () => {
  assert.equal(primitives.readNumberAtPath("30", "page_size"), 30);
  assert.equal(primitives.readNumberAtPath(30, "page_size"), 30);
  assert.throws(() => primitives.readNumberAtPath("thirty", "page_size"), (error) => error.name === "ConfigValueError" && error.path === "page_size");
  assert.throws(() => primitives.readNumberAtPath(null, "page_size"), (error) => error.name === "ConfigValueError");
});

test("booleans, enumerations and numbers state their fallback in the diagnostic", () => {
  const diagnostics = collect();
  assert.equal(primitives.readBoolean(undefined, "show.stats", diagnostics, true), true);
  assert.equal(primitives.readBoolean(false, "show.stats", diagnostics, true), false);
  assert.equal(primitives.readBoolean("yes", "show.stats", diagnostics, true), true);
  assert.equal(diagnostics.at(-1).path, "show.stats");

  assert.equal(primitives.readEnum("de", "language", diagnostics, ["auto", "en", "de"], "auto"), "de");
  assert.equal(primitives.readEnum("fr", "language", diagnostics, ["auto", "en", "de"], "auto"), "auto");
  assert.equal(diagnostics.at(-1).path, "language");

  const bounds = { min: 5, max: 100, integer: true, fallback: 25 };
  assert.equal(primitives.readNumber(30, "page_size", diagnostics, bounds), 30);
  assert.equal(primitives.readNumber("30", "page_size", diagnostics, bounds), 30);
  assert.equal(primitives.readNumber(4, "page_size", diagnostics, bounds), 25);
  assert.equal(primitives.readNumber(101, "page_size", diagnostics, bounds), 25);
  assert.equal(primitives.readNumber(7.5, "page_size", diagnostics, bounds), 25);
  assert.equal(primitives.readNumber(undefined, "page_size", diagnostics, bounds), 25);
  assert.equal(diagnostics.filter((entry) => entry.path === "page_size").length, 3);
});

test("an unknown key is refused with the nearest option when there is one", () => {
  assert.doesNotThrow(() => primitives.assertKnownKeys({ stats: true }, ["stats", "tabs"], "show"));
  assert.throws(
    () => primitives.assertKnownKeys({ stat: true }, ["stats", "tabs"], "show"),
    (error) => error.code === "config.unknown_key" && error.params.key === "show.stat" && error.params.suggestion === "show.stats"
  );
  assert.throws(
    () => primitives.assertKnownKeys({ nothing_like_it: true }, ["stats", "tabs"], "show"),
    (error) => error.code === "config.unknown_key" && error.params.suggestion === null
  );
  // A Set of allowed keys is as good as a list.
  assert.doesNotThrow(() => primitives.assertKnownKeys({ tabs: true }, new Set(["stats", "tabs"]), "show"));
});

test("the two shape checks agree on what a written value is", () => {
  assert.equal(primitives.isPlainObject({}), true);
  assert.equal(primitives.isPlainObject([]), false);
  assert.equal(primitives.isPlainObject(null), false);
  assert.equal(primitives.isUnwritten(undefined), true);
  assert.equal(primitives.isUnwritten(null), true);
  assert.equal(primitives.isUnwritten(""), false);
  assert.equal(primitives.isUnwritten(false), false);
});

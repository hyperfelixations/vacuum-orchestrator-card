"use strict";
// The dependency-free base: text, numbers, time, ids and the frozen diagnostic catalog.
// Boundary: pure functions with injected clocks and randomness, never a browser global.

const test = require("node:test");
const assert = require("node:assert/strict");

test("core text primitives escape, truncate and join deterministically", async () => {
  const text = await import("../../../src/core/text.js");
  assert.equal(text.escapeHtml(`& < > \" '`), "&amp; &lt; &gt; &quot; &#39;");
  assert.equal(text.truncateText("abcdef", 4), "abc…");
  assert.equal(text.joinList(["a", "", "b"], " · "), "a · b");
});

test("core numbers, time and ids use injected or explicit values", async () => {
  const numbers = await import("../../../src/core/numbers.js");
  const time = await import("../../../src/core/time.js");
  const ids = await import("../../../src/core/ids.js");
  assert.equal(numbers.parseConfigNumber("2.5"), 2.5);
  assert.equal(numbers.parseConfigNumber(true), null);
  assert.equal(numbers.clamp(12, 0, 10), 10);
  assert.equal(time.parseInstant("2026-09-17T00:00:00Z"), Date.parse("2026-09-17T00:00:00Z"));
  assert.equal(time.parseInstant(1758000000000), 1758000000000);
  assert.deepEqual(time.relativeParts(100000, 40000), { unit: "minute", value: -1 });
  assert.deepEqual(time.durationParts(90 * 60000), { hours: 1, minutes: 30 });
  const factory = ids.createIdFactory("voc");
  assert.equal(factory.nextCommandId(), "voc-1");
  assert.equal(factory.nextCommandId(), "voc-2");
});

// The card's own parser rather than Date.parse: the same string has to mean the same instant
// in every browser engine the card ships to.
test("timestamp parsing rejects impossible calendar dates", async () => {
  const { parseInstant } = await import("../../../src/core/time.js");
  assert.equal(parseInstant("2024-02-29T12:00:00Z"), Date.parse("2024-02-29T12:00:00Z"));
  assert.equal(parseInstant("2023-02-29T12:00:00Z"), null);
  assert.equal(parseInstant("2024-04-31T12:00:00Z"), null);
  assert.equal(parseInstant("not a date"), null);
});

test("diagnostics reject codes outside the frozen catalog", async () => {
  const diagnostics = await import("../../../src/core/diagnostics.js");
  assert.equal(diagnostics.DIAGNOSTIC_SEVERITY["hint.partial_page"], "hint");
  assert.throws(() => diagnostics.createDiagnostic("not-a-code"), /unknown code/);
  assert.equal(diagnostics.formatConfigValue({ a: 1 }), "{…}");
});

// The card parses timestamps itself because Date.parse is engine-dependent; an offset, a
// fractional second and every out-of-range field have to behave the same everywhere.
test("the timestamp parser reads offsets and refuses impossible fields", async () => {
  const { parseInstant, elapsed } = await import("../../../src/core/time.js");
  const noon = Date.parse("2026-09-17T12:00:00Z");
  assert.equal(parseInstant("2026-09-17T14:00:00+02:00"), noon);
  assert.equal(parseInstant("2026-09-17T10:00:00-0200"), noon);
  assert.equal(parseInstant("2026-09-17T12:00:00.250Z"), noon + 250);
  assert.equal(parseInstant("2026-09-17T12:00:00.2Z"), noon + 200);
  assert.equal(parseInstant("2026-09-17T12:00:00+24:00"), null, "an offset beyond a day is not a zone");
  assert.equal(parseInstant("2026-09-17T12:00:00+02:60"), null);
  assert.equal(parseInstant("2026-09-17T24:00:00Z"), null);
  assert.equal(parseInstant("2026-09-17T12:60:00Z"), null);
  assert.equal(parseInstant("2026-13-01T12:00:00Z"), null);
  assert.equal(parseInstant("2026-09-00T12:00:00Z"), null);
  assert.equal(parseInstant(null), null);
  assert.equal(parseInstant(Number.NaN), null);

  assert.equal(elapsed(noon + 5000, noon), 5000);
  assert.equal(elapsed(noon, noon + 5000), 0, "time never runs backwards for the reader");
  assert.equal(elapsed(Number.NaN, noon), null);
});

test("time helpers cover date-only values and every relative unit boundary", async () => {
  const { parseInstant, elapsed, relativeParts, durationParts } = await import("../../../src/core/time.js");

  assert.equal(parseInstant("1970-01-01"), 0);
  assert.equal(parseInstant("2024-03-01"), Date.parse("2024-03-01T00:00:00Z"));
  assert.equal(parseInstant("1900-02-29"), null);
  assert.equal(parseInstant("2000-02-29"), Date.parse("2000-02-29T00:00:00Z"));
  assert.equal(parseInstant(""), null);
  assert.equal(elapsed(0, Number.POSITIVE_INFINITY), null);

  assert.deepEqual(relativeParts(0, 30_000), { unit: "second", value: 30 });
  assert.deepEqual(relativeParts(0, 30 * 60_000), { unit: "minute", value: 30 });
  assert.deepEqual(relativeParts(0, 2 * 60 * 60_000), { unit: "hour", value: 2 });
  assert.deepEqual(relativeParts(0, 48 * 60 * 60_000), { unit: "day", value: 2 });
  assert.deepEqual(relativeParts(Number.NaN, 0), { unit: "second", value: 0 });
  assert.equal(durationParts(Number.NaN), null);
});

// Two diagnostics that say the same thing must collapse into one warning, so the key has to
// see the value and the value has to be printed the same way every time.
test("a diagnostic prints its value compactly and keys equal diagnostics alike", async () => {
  const { createDiagnostic, diagnosticKey, formatConfigValue, fallbackValue, fallbackOption } = await import("../../../src/core/diagnostics.js");

  assert.equal(formatConfigValue(null), null);
  assert.equal(formatConfigValue(undefined), null);
  assert.equal(formatConfigValue("   "), null);
  assert.equal(formatConfigValue(" two   words "), '"two words"');
  assert.equal(formatConfigValue("x".repeat(40)), `"${"x".repeat(31)}…"`);
  assert.equal(formatConfigValue(7), "7");
  assert.equal(formatConfigValue(false), "false");
  assert.equal(formatConfigValue([]), "[]");
  assert.equal(formatConfigValue([1]), "[…]");
  assert.equal(formatConfigValue({}), "{}");
  assert.equal(formatConfigValue({ a: 1 }), "{…}");
  assert.equal(formatConfigValue(() => {}), "() => {}");

  const one = createDiagnostic("value.invalid", { path: "page_size", value: 4, fallback: fallbackValue(25) });
  const same = createDiagnostic("value.invalid", { path: "page_size", value: 4, fallback: fallbackValue(25) });
  const other = createDiagnostic("value.invalid", { path: "page_size", value: 5, fallback: fallbackValue(25) });
  assert.equal(diagnosticKey(one), diagnosticKey(same));
  assert.notEqual(diagnosticKey(one), diagnosticKey(other));
  assert.equal(one.severity, "warning");
  assert.equal(createDiagnostic("hint.reconnecting").severity, "hint");
  assert.deepEqual(fallbackOption("time_format", "auto"), { key: "time_format", value: "auto" });
});

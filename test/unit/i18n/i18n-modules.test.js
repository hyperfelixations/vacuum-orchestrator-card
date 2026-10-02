// Key parity between the two languages and the Intl formatters built on top of them.
// Boundary: wording and formatting; which key a surface picks is tested with that surface.

const test = require("node:test");
const assert = require("node:assert/strict");

test("English and German have exactly the same translation keys", async () => {
  const { TRANSLATIONS } = await import("../../../src/i18n/registry.js");
  assert.deepEqual(Object.keys(TRANSLATIONS.en).sort(), Object.keys(TRANSLATIONS.de).sort());
  assert.ok(Object.keys(TRANSLATIONS.en).length >= 200);
});

// Duration wording must come from the language files. A hard-coded language pair inside the
// formatter would make a new language impossible to add without touching it.
test("no language wording lives in the formatter module", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "..", "src", "i18n", "formatters.js"), "utf8");
  assert.equal(/=== ?"de"|=== ?"en"/.test(source), false);
});

test("language resolution follows explicit config and Home Assistant locale", async () => {
  const translate = await import("../../../src/i18n/translate.js");
  assert.equal(translate.resolveLanguage("de", { language: "en" }), "de");
  assert.equal(translate.resolveLanguage("auto", { locale: { language: "de-DE" } }), "de");
  assert.equal(translate.resolveLanguage("auto", { language: "fr" }), "en");
  assert.equal(translate.translate("de", "card.title"), "Reinigung");
});

test("Intl formatters support plurals, dates, relative values and durations", async () => {
  const formatters = await import("../../../src/i18n/formatters.js");
  const { translate } = await import("../../../src/i18n/translate.js");
  assert.equal(formatters.selectPlural("en", 1, { one: "one", other: "many" }), "one");
  assert.equal(formatters.selectPlural("en", 2, { one: "one", other: "many" }), "many");
  assert.equal(formatters.formatNumber("de", 12.5, 1), "12,5");
  assert.match(formatters.formatDateTime("en", Date.parse("2026-09-17T12:00:00Z")), /2026/);
  const t = (key, vars) => translate("en", key, vars);
  assert.equal(formatters.formatDuration("en", 90 * 60000, t), "1 h 30 min");
  assert.equal(formatters.formatDuration("en", 45 * 60000, t), "45 min");
  assert.equal(formatters.formatDuration("en", null, t), "");
});

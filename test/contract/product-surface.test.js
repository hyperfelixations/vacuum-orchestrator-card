"use strict";
// The product surface: every vocabulary the card exposes to users and to YAML, held to the
// manifest and to the public README.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../manifests/product-surface.js");

test("the source offers exactly the manifest's languages, sections and vocabularies", async () => {
  const { TRANSLATIONS } = await import("../../src/i18n/registry.js");
  const { SECTION_DEFINITIONS } = await import("../../src/sections/index.js");
  const schema = await import("../../src/domain/job-schema.js");
  const { CAPABILITY_KEYS } = await import("../../src/backend/capabilities.js");
  assert.deepEqual(Object.keys(TRANSLATIONS), manifest.languages);
  assert.deepEqual(SECTION_DEFINITIONS.map((definition) => definition.key), manifest.sections);
  assert.deepEqual([...schema.CLEANING_MODES], manifest.modes);
  assert.deepEqual([...schema.JOB_STATES], manifest.states);
  assert.deepEqual([...CAPABILITY_KEYS], manifest.capabilities);
});

test("the configuration keys are exactly the manifest's", async () => {
  const { TOP_LEVEL_KEYS } = await import("../../src/config/top-level-keys.js");
  const { SHOW_KEYS } = await import("../../src/config/show.js");
  assert.deepEqual([...TOP_LEVEL_KEYS], manifest.topLevelKeys);
  assert.deepEqual([...SHOW_KEYS], manifest.showKeys);
});

// Every option the card reads has to be documented for the people who write the YAML.
test("the public README documents every configuration key and section", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8");
  for (const key of [...manifest.topLevelKeys, ...manifest.showKeys, ...manifest.sections]) {
    assert.ok(readme.includes(`\`${key}\``), `README does not mention \`${key}\``);
  }
});

test("every section has a translated label in every language", async () => {
  const { TRANSLATIONS } = await import("../../src/i18n/registry.js");
  for (const [language, table] of Object.entries(TRANSLATIONS)) {
    for (const section of manifest.sections) {
      assert.equal(typeof table[`section.${section}`], "string", `${language}: section.${section}`);
      assert.equal(typeof table[`section.short.${section}`], "string", `${language}: section.short.${section}`);
    }
  }
});

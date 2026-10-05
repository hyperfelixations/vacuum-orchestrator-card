// The product surface: every vocabulary the card exposes to users and to YAML, held to the
// manifest and to the public README.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../manifests/product-surface.js");

test("the source offers exactly the manifest's languages, views, options and vocabularies", async () => {
  const { TRANSLATIONS } = await import("../../src/i18n/registry.js");
  const { VIEWS } = await import("../../src/views/registry.js");
  const schema = await import("../../src/domain/job-schema.js");
  assert.deepEqual(Object.keys(TRANSLATIONS), manifest.languages);
  assert.deepEqual(VIEWS.map((view) => view.key), manifest.views);
  assert.deepEqual(Object.fromEntries(VIEWS.map((view) => [view.key, Object.keys(view.optionsSchema)])), manifest.viewOptions);
  assert.deepEqual([...schema.CLEANING_MODES], manifest.modes);
  assert.deepEqual([...schema.JOB_STATES], manifest.states);
});

test("the card uses every action, command and query of the integration", async () => {
  const { ACTIONS, CONFIGURATION_COMMANDS, CONFIGURATION_QUERIES } = await import("../../src/backend/protocol.js");
  assert.deepEqual([...ACTIONS], manifest.actions);
  assert.deepEqual([...CONFIGURATION_COMMANDS], manifest.commands);
  assert.deepEqual([...CONFIGURATION_QUERIES], manifest.queries);
  const sources = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js") && !full.includes(`${path.sep}backend${path.sep}`)) sources.push(fs.readFileSync(full, "utf8"));
    }
  };
  walk(path.join(__dirname, "..", "..", "src"));
  const all = sources.join("\n");
  const unused = [...manifest.actions, ...manifest.commands].filter((name) => !all.includes(`"${name}"`));
  assert.deepEqual(unused, [], "every command is sent by some control");
});

test("the configuration keys are exactly the manifest's", async () => {
  const { TOP_LEVEL_KEYS } = await import("../../src/config/top-level-keys.js");
  const { SHOW_KEYS } = await import("../../src/config/show.js");
  assert.deepEqual([...TOP_LEVEL_KEYS], manifest.topLevelKeys);
  assert.deepEqual([...SHOW_KEYS], manifest.showKeys);
});

// Every option the card reads has to be documented for the people who write the YAML.
test("the public README documents every configuration key, view and view option", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8");
  const options = Object.values(manifest.viewOptions).flat();
  for (const key of [...manifest.topLevelKeys, ...manifest.showKeys, ...manifest.views, ...options]) {
    assert.ok(readme.includes(`\`${key}\``), `README does not mention \`${key}\``);
  }
});

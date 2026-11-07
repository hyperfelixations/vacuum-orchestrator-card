// The product surface: every vocabulary the card exposes to users and to YAML, held to the
// manifest and to the public README.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseAst } = require("rollup/parseAst");
const manifest = require("../manifests/product-surface.js");
const { visitTree } = require("../architecture/source-architecture.js");
const { wireQueuePage } = require("../helpers/voi-records.js");

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

test("the protocol names exactly the manifest's actions, commands and queries", async () => {
  const { ACTIONS, CARD_COMMANDS, CONFIGURATION_COMMANDS, CONFIGURATION_QUERIES } = await import("../../src/backend/protocol.js");
  assert.deepEqual([...ACTIONS], manifest.actions);
  assert.deepEqual([...CONFIGURATION_COMMANDS], manifest.commands);
  assert.deepEqual([...CARD_COMMANDS], manifest.cardCommands);
  assert.deepEqual([...CONFIGURATION_QUERIES], manifest.queries);
});

// The operations a control's handler sends: the first argument of `run`, `submit` and a session's
// `command`, and the `operation` a confirmation or the battery question carries; the queue's run,
// pause and resume button sends the one the integration offers (`QUEUE_CONTROLS`).
function sentOperations() {
  const sent = new Set();
  const literal = (node) => (node?.type === "Literal" && typeof node.value === "string" ? node.value : null);
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        visitTree(parseAst(fs.readFileSync(full, "utf8")), (node) => {
          const callee = node.type === "CallExpression" ? node.callee : null;
          const name = callee?.type === "Identifier" ? callee.name : callee?.type === "MemberExpression" && !callee.computed ? callee.property.name : null;
          if (["run", "submit", "command"].includes(name) && literal(node.arguments[0])) sent.add(literal(node.arguments[0]));
          if (node.type === "Property" && !node.computed && node.key.type === "Identifier" && node.key.name === "operation" && literal(node.value)) sent.add(literal(node.value));
        });
      }
    }
  };
  walk(path.join(__dirname, "..", "..", "src", "controllers", "runtime"));
  return sent;
}

test("a control's handler sends every action and command of the protocol, and nothing else", async () => {
  const { ACTIONS, CARD_COMMANDS, CONFIGURATION_COMMANDS } = await import("../../src/backend/protocol.js");
  const { QUEUE_CONTROLS } = await import("../../src/domain/affordances.js");
  const sent = sentOperations();
  for (const control of QUEUE_CONTROLS) sent.add(control.operation);
  assert.deepEqual([...sent].sort(), [...ACTIONS, ...CONFIGURATION_COMMANDS, ...CARD_COMMANDS].sort());
});

// Each scope loader runs against a transport that records what it asks and answers nothing; the
// field check asks `validate` before every form's command (internal dev doc §6).
test("the scope loaders and the field check ask every query of the protocol", async () => {
  const { CONFIGURATION_QUERIES } = await import("../../src/backend/protocol.js");
  const { SCOPE_LOADERS } = await import("../../src/backend/scopes.js");
  const { createSession } = await import("../../src/backend/session.js");
  const asked = new Set();
  const transport = { ws: async (message) => {
    if (message.query) asked.add(message.query);
    return { ok: false, code: "unknown", detail: null, channel: "ws" };
  } };
  const parameters = { trace: { jobId: "job" }, execution: { jobId: "job" }, job: { jobId: "job" }, errorTexts: { language: "en" } };
  for (const [name, load] of Object.entries(SCOPE_LOADERS)) await load(transport, parameters[name] ?? {});
  // A session the integration found ready checks a form's input.
  const ready = {
    ...transport,
    ws: async (message) => (message.type === "vacuum_orchestrator/queue/get" ? { ok: true, data: wireQueuePage([]) } : transport.ws(message)),
    subscribe: async () => ({ ok: true, data: () => {} }),
    onConnection: () => () => {},
  };
  const hass = { config: { components: ["vacuum_orchestrator"] }, services: {} };
  const session = createSession({ transport: ready, platform: { now: () => 0, monotonicNow: () => 0 }, getHass: () => hass });
  await session.probe();
  assert.equal(session.getSnapshot().phase, "ready");
  await session.validate("create_job", {});
  session.dispose();
  assert.deepEqual([...asked].sort(), [...CONFIGURATION_QUERIES].sort());
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

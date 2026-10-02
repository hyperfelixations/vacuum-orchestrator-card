// The configuration contract (RCC-aligned): defaults, the `views`/`start_view` list, the `show`
// block, header lines, and the split between a refusal (typo of a card key) and a warning with
// its fallback (any other unusable value).

const test = require("node:test");
const assert = require("node:assert/strict");

const VIEW_TYPES = ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics"];
const SCHEMAS = { rooms: { sort: { default: "configured", validate: (value) => ["configured", "name", "due"].includes(value) } }, history: { source: { default: "both", validate: (value) => ["jobs", "runs", "both"].includes(value) } } };

async function normalize(config) {
  const { normalizeConfig } = await import("../../../src/config/normalize-config.js");
  return normalizeConfig(config, { viewTypes: VIEW_TYPES, optionSchemaForView: (type) => SCHEMAS[type] || {} });
}
const codes = (result) => result._configDiagnostics.map((item) => [item.code, item.path]);

test("an empty configuration is the default card", async () => {
  const config = await normalize({ type: "custom:vacuum-orchestrator-card" });
  assert.equal(config.views, null);
  assert.equal(config.start_view, null);
  assert.deepEqual({ ...config.title }, { text: null, overflow: "wrap" });
  assert.deepEqual({ ...config.subtitle }, { text: null, overflow: "clip" });
  assert.deepEqual([config.icon, config.accent_line, config.language, config.page_size, config.time_format, config.confirm_destructive], [null, "top", "auto", 25, "auto", true]);
  assert.equal(config.show.tabs, "auto");
  assert.equal(config.show.panel, true);
  assert.deepEqual(config._configDiagnostics, []);
});

test("the configuration must be an object", async () => {
  await assert.rejects(normalize([]), { name: "ConfigError", code: "config.not_object" });
  await assert.rejects(normalize("queue"), { code: "config.not_object" });
  assert.equal((await normalize(null)).views, null);
});

test("a typo of a card key refuses with the key it meant; a foreign key is a warning", async () => {
  await assert.rejects(normalize({ start_veiw: "rooms" }), (error) => error.code === "config.unknown_key" && error.params.suggestion === "start_view" && /Did you mean start_view\?/.test(error.message));
  const foreign = await normalize({ my_theme_hint: 1, card_mod: { style: "" }, grid_options: {} });
  assert.deepEqual(codes(foreign), [["config.foreign_key", "my_theme_hint"]]);
});

test("a written views list is authoritative in its order; a repeat and an unknown type are ignored", async () => {
  const config = await normalize({ views: ["rooms", { type: "queue", enabled: "auto" }, "rooms", "garden", { type: "history", enabled: false, options: { source: "runs" } }] });
  assert.deepEqual(config.views.map((view) => [view.type, view.enabled]), [["rooms", true], ["queue", "auto"], ["history", false]]);
  assert.deepEqual(config.views[2].options, { source: "runs" });
  assert.deepEqual(codes(config), [["value.invalid", "views[2]"], ["value.invalid", "views[3]"]]);
});

test("view entries degrade one by one", async () => {
  const config = await normalize({ views: [{ type: "rooms", enabled: "sometimes", options: { sort: "size" } }, 7, { type: "history", options: "all" }] });
  assert.deepEqual(config.views.map((view) => [view.type, view.enabled, view.options]), [["rooms", "auto", {}], ["history", true, {}]]);
  assert.deepEqual(codes(config).map(([, path]) => path), ["views[0].enabled", "views[0].options.sort", "views[1]", "views[2].options"]);
  assert.equal((await normalize({ views: "queue" })).views, null);
});

test("an unknown key inside a view entry or its options refuses", async () => {
  await assert.rejects(normalize({ views: [{ type: "rooms", enabeld: true }] }), (error) => error.params.suggestion === "views[0].enabled");
  await assert.rejects(normalize({ views: [{ type: "rooms", options: { srot: "name" } }] }), (error) => error.params.key === "views[0].options.srot");
});

test("the start view is a wish among the known types", async () => {
  assert.equal((await normalize({ start_view: " rooms " })).start_view, "rooms");
  const unknown = await normalize({ start_view: "garden" });
  assert.equal(unknown.start_view, null);
  assert.equal(unknown._configDiagnostics[0].fallback.phrase, "firstView");
});

test("the show block takes switches and a tri-state tab strip", async () => {
  const config = await normalize({ show: { panel: false, tabs: "false", pill: "no", warnings: null } });
  assert.equal(config.show.panel, false);
  assert.equal(config.show.tabs, false);
  assert.equal(config.show.pill, true);
  assert.equal(config.show.warnings, true);
  assert.deepEqual(codes(config), [["value.invalid", "show.pill"]]);
  assert.equal((await normalize({ show: { tabs: "sometimes" } })).show.tabs, "auto");
  await assert.rejects(normalize({ show: { panle: false } }), (error) => error.params.suggestion === "show.panel");
});

test("a header line is text, an overflow word, or a block of both", async () => {
  assert.deepEqual({ ...(await normalize({ title: "Downstairs" })).title }, { text: "Downstairs", overflow: "wrap" });
  assert.deepEqual({ ...(await normalize({ subtitle: "wrap" })).subtitle }, { text: null, overflow: "wrap" });
  assert.deepEqual({ ...(await normalize({ subtitle: "" })).subtitle }, { text: "", overflow: "clip" });
  assert.deepEqual({ ...(await normalize({ title: { text: "Upstairs", overflow: "clip" } })).title }, { text: "Upstairs", overflow: "clip" });
  const bad = await normalize({ title: { text: 3, overflow: "scroll" } });
  assert.deepEqual({ ...bad.title }, { text: null, overflow: "wrap" });
  assert.deepEqual(codes(bad).map(([, path]) => path), ["title.text", "title.overflow"]);
});

test("numbers, enumerations and switches keep their default when unusable", async () => {
  const config = await normalize({ page_size: 500, time_format: "sometimes", confirm_destructive: "yes", accent_line: "left", language: "fr", icon: " " });
  assert.deepEqual([config.page_size, config.time_format, config.confirm_destructive, config.accent_line, config.language, config.icon], [25, "auto", true, "top", "auto", null]);
  assert.equal(config._configDiagnostics.length, 6);
  assert.equal((await normalize({ page_size: "50", language: "DE" })).page_size, 50);
  assert.equal((await normalize({ language: "DE" })).language, "de");
});

test("diagnostics follow the order the keys are written in", async () => {
  const config = await normalize({ time_format: 1, views: 3, page_size: "x" });
  assert.deepEqual(codes(config).map(([, path]) => path), ["time_format", "views", "page_size"]);
});

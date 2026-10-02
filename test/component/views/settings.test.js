// The settings view driven through the built card: the queue run's wait time is changed in
// minutes, sent in seconds and shown again from the integration's answer; the queue itself no
// longer carries the setting; a user who may not change it sees it locked and explained.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

test("the wait time is changed in minutes, sent in seconds, and the page returns to settings", async () => {
  const card = await mountCard({ env });
  assert.equal(card.root.querySelector('[data-key="grace"]'), null, "the queue view carries no setting");
  await card.click('[role=tab][data-view="settings"]');
  assert.equal(card.text('[data-key="setting:grace"] .voc-setting-value'), "15 min");
  await card.click('[data-key="setting:grace"] [data-action="open-queue-settings"]');
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:queue-settings");
  await card.type('[data-field="overlay:minutes"]', "30");
  await card.click('[data-action="save-queue-settings"]');
  await card.settle(32);
  assert.deepEqual(card.commands("configure_queue").map((message) => message.parameters), [{ grace_seconds: 1800 }]);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.ok(card.root.querySelector('[data-key="view:settings"]'), "back on the settings view");
  assert.equal(card.text('[data-key="setting:grace"] .voc-setting-value'), "30 min");
  card.unmount();
});

test("the integration block names the version and opens the integration in Home Assistant", async () => {
  const card = await mountCard({ env, config: { start_view: "settings" } });
  const integration = card.text('[data-key="integration"]');
  assert.match(integration, /Version/);
  assert.match(integration, /API version/);
  const open = card.root.querySelector('[data-key="integration"] [data-action="navigate"]');
  assert.equal(JSON.parse(open.dataset.args).path, "/_my_redirect/integration?domain=vacuum_orchestrator");
  card.unmount();
});

test("a user who may not change settings sees them only when enabled, locked and explained", async () => {
  const automatic = await mountCard({ env, admin: false });
  assert.equal(automatic.root.querySelector('[role=tab][data-view="settings"]'), null);
  automatic.unmount();
  const card = await mountCard({ env, admin: false, config: { views: ["queue", { type: "settings", enabled: true }], start_view: "settings" } });
  const change = card.root.querySelector('[data-key="setting:grace"] [data-action="open-queue-settings"]');
  assert.equal(change.getAttribute("aria-disabled"), "true");
  assert.match(change.getAttribute("title"), /administrator/i);
  assert.equal(change.getAttribute("aria-describedby"), "voc-setting-grace");
  await card.click(change);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.equal(card.root.querySelector('[data-key="integration"] [data-action="navigate"]'), null);
  card.unmount();
});

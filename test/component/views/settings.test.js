// The settings view driven through the built card: the queue run's wait time is changed in
// minutes, sent in seconds and shown again from the integration's answer; the queue view does not
// carry the setting; integration and card name their versions; a user who may not change the
// setting sees it locked and explained.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../../helpers/mount-card.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };
const settings = (from, options = {}) => mountCard({ recording: "settings_controls", from, ...options });

test("the wait time is changed in minutes, sent in seconds, and the dialog returns to settings", async () => {
  const card = await settings("The card opens");
  assert.equal(card.root.querySelector('[data-key="grace"]'), null, "the queue view carries no setting");
  await card.click('[role=tab][data-view="settings"]');
  assert.equal(card.text('[data-key="queue"] [data-key="fact:grace"]'), "15 min");
  await card.click('[data-key="queue"] [data-action="open-queue-settings"]');
  assert.equal(card.root.querySelector(".voc-dialog").dataset.key, "overlay:queue-settings");
  await card.type('[data-field="overlay:minutes"]', "30");
  await card.click('[data-action="save-queue-settings"]');
  await card.settle(32);
  assert.deepEqual(card.commands("configure_queue").map((message) => message.parameters), [{ grace_seconds: 1800 }]);
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  assert.ok(card.root.querySelector('[data-key="view:settings"]'), "back on the settings view");
  assert.equal(card.text('[data-key="queue"] [data-key="fact:grace"]'), "30 min");
  card.unmount();
});

// Only what changed travels: a new start delay alone.
test("the start delay is changed in seconds and shown again from the integration's answer", async () => {
  const card = await settings("Mopping is the default", { config: { start_view: "settings" } });
  assert.equal(card.text('[data-key="queue"] [data-key="fact:startDelay"]'), "5 s");
  await card.click('[data-key="queue"] [data-action="open-queue-settings"]');
  await card.type('[data-field="overlay:delay"]', "30");
  await card.click('[data-action="save-queue-settings"]');
  await card.settle(32);
  assert.deepEqual(card.commands("configure_queue").map((message) => message.parameters), [{ start_delay_seconds: 30 }]);
  assert.equal(card.text('[data-key="queue"] [data-key="fact:startDelay"]'), "30 s");
  card.unmount();
});

test("the job defaults are changed on their own page and shown again from the integration's answer", async () => {
  const card = await settings("The queue waits 30 minutes", { config: { start_view: "settings" } });
  assert.equal(card.text('[data-key="built-in"]'), "Built-in defaults");
  await card.click('[data-action="open-job-defaults"]');
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:job-defaults");
  await card.click('[data-key="field:overlay:mode"] [data-value="mop"]');
  await card.click('[data-key="field:overlay:mopRoute"] [data-value="deep_plus"]');
  await card.click('[data-action="save-job-defaults"]');
  await card.settle(32);
  assert.deepEqual(card.commands("configure_job_defaults").map((message) => message.parameters), [{ mode: "mop", passes: 1, settings_policy: "best_effort", vacuum_power: "standard", mop_intensity: "medium", mop_route: "deep_plus" }]);
  assert.equal(card.root.querySelector(".voc-overlay"), null);
  assert.equal(card.root.querySelector('[data-key="built-in"]'), null);
  assert.match(card.text('[data-key="defaults"]'), /Deep\+/);
  card.unmount();
});

test("the setup opens from the settings with the integration's steps, and any step opens on request", async () => {
  const card = await mountCard({ ...BUSY, config: { start_view: "settings" } });
  await card.click('[data-action="open-setup"]');
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:setup-guide");
  assert.deepEqual(card.all(".voc-overlay-actions > button").map((node) => node.dataset.action), ["back"], "the guide's footer leads back like every page");
  assert.deepEqual(card.all(".voc-setup-step").map((node) => node.dataset.key), ["step:robots", "step:rooms", "step:defaults", "step:queue"]);
  assert.equal(card.root.querySelector('[data-current="true"]').dataset.key, "step:robots");
  assert.match(card.text('[data-key="step:rooms"]'), /3 of 4 rooms reachable/);
  assert.match(card.text('[data-key="step:defaults"]'), /Built-in defaults/);
  await card.click('[data-key="step:queue"] [data-action="choose"]');
  assert.equal(card.root.querySelector('[data-current="true"]').dataset.key, "step:queue");
  await card.click('[data-key="step:queue"] [data-action="open-queue-settings"]');
  assert.equal(card.root.querySelector(".voc-dialog").dataset.key, "overlay:queue-settings");
  assert.equal(card.root.querySelector(".voc-overlay").dataset.key, "overlay:setup-guide", "the guide stays below the dialog");
  card.unmount();
});

// LAY-08: "About" holds the integration's and the running card's versions and opens the integration
// in Home Assistant.
test("about names integration, API and card versions and opens the integration in Home Assistant", async () => {
  const { CARD_VERSION } = await import("../../../src/core/card-metadata.js");
  const card = await mountCard({ ...BUSY, config: { start_view: "settings" } });
  assert.equal(card.text('[data-key="about"] .voc-block-title'), "About");
  const facts = [...card.root.querySelectorAll('[data-key="about"] .voc-facts dt')].map((node) => node.textContent);
  assert.deepEqual(facts, ["Integration", "API version", "Card"]);
  assert.equal(card.text('[data-key="about"] [data-key="fact:card"]'), CARD_VERSION);
  const open = card.root.querySelector('[data-key="about"] [data-action="navigate"]');
  assert.equal(JSON.parse(open.dataset.args).path, "/_my_redirect/integration?domain=vacuum_orchestrator");
  card.unmount();
});

// UI-22: who may change nothing sees the settings without controls and one note why.
test("a user who may not change settings sees them only when enabled, without controls, and is told why once", async () => {
  const automatic = await mountCard({ ...BUSY, admin: false });
  assert.equal(automatic.root.querySelector('[role=tab][data-view="settings"]'), null);
  automatic.unmount();
  const card = await mountCard({ ...BUSY, admin: false, config: { views: ["queue", { type: "settings", enabled: true }], start_view: "settings" } });
  assert.equal(card.root.querySelector('[data-key="queue"] [data-action="open-queue-settings"]'), null);
  assert.equal(card.root.querySelector('[data-action="open-job-defaults"]'), null);
  assert.match(card.text(".voc-subtitle"), /Read only/);
  assert.equal(card.root.querySelector('[data-key="about"] [data-action="navigate"]'), null);
  card.unmount();
});

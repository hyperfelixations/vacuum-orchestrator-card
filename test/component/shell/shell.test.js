// The card shell through the built card: language, header options, the warning block and
// subtitle hints, the show switches, the tab strip and its keyboard, unavailable views and the
// command notice.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");
const { haError } = require("../../fixtures/voi/wire.js");
const { EXCEPTIONS } = require("../../fixtures/voi/exceptions.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

test("the card speaks the configured language", async () => {
  const card = await mountCard({ env, config: { language: "de" } });
  assert.equal(card.text(".voc-title"), "Reinigung");
  assert.equal(card.text(".voc-status-pill"), "Reinigt");
  assert.deepEqual(card.all('[role="tab"]').map((tab) => tab.getAttribute("title")), ["Warteschlange", "Räume", "Roboter", "Vorlagen", "Verlauf", "Einstellungen"]);
  card.unmount();
});

test("header options set title, subtitle, icon and the accent line position", async () => {
  const card = await mountCard({ env, config: { title: "Upstairs", subtitle: { text: "Cleaning crew", overflow: "wrap" }, icon: "mdi:broom", accent_line: "bottom" } });
  const root = card.root.querySelector(".voc-root");
  assert.equal(card.text(".voc-title"), "Upstairs");
  assert.equal(card.text(".voc-subtitle"), "Cleaning crew");
  assert.equal(card.root.querySelector(".voc-icon-badge ha-icon").getAttribute("icon"), "mdi:broom");
  assert.equal(root.dataset.accentLine, "bottom");
  assert.equal(root.dataset.subtitle, "wrap");
  card.unmount();
});

test("an unusable option is a warning with its fallback; show.warnings hides the block", async () => {
  const card = await mountCard({ env, config: { page_size: 1 } });
  assert.match(card.text(".voc-warning-text"), /page_size/);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", page_size: 1, show: { warnings: false } });
  await card.settle();
  assert.equal(card.root.querySelector(".voc-warning"), null);
  card.unmount();
});

test("a lost connection is a hint behind the subtitle, not a warning", async () => {
  const card = await mountCard({ env });
  card.fake.disconnect();
  await card.updateHass({});
  assert.match(card.text(".voc-subtitle"), / · .*reconnect/i);
  assert.equal(card.root.querySelector(".voc-warning"), null);
  card.fake.reconnect();
  await card.settle(24);
  assert.doesNotMatch(card.text(".voc-subtitle"), /reconnect/i);
  card.unmount();
});

test("show switches remove the panel, the tab strip and the queue control", async () => {
  const card = await mountCard({ env, config: { show: { panel: false, tabs: false } } });
  assert.equal(card.root.querySelector(".voc-panel"), null);
  assert.equal(card.root.querySelector(".voc-tabs"), null);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", show: { queue_controls: false } });
  await card.settle();
  assert.ok(card.root.querySelector(".voc-panel"));
  assert.equal(card.root.querySelector(".voc-queue-control"), null);
  card.unmount();
});

test("arrow keys move through the tabs and switch the view with focus on the tab", async () => {
  const card = await mountCard({ env });
  await card.press('[role="tab"][data-view="queue"]', "ArrowRight");
  const selected = card.root.querySelector('[role="tab"][aria-selected="true"]');
  assert.equal(selected.dataset.view, "rooms");
  assert.equal(card.root.activeElement, selected);
  assert.equal(card.root.querySelector("#voc-panel").getAttribute("aria-labelledby"), "voc-tab-rooms");
  card.unmount();
});

test("the body is a region that scrolls; as a tab panel it is a tab stop", async () => {
  const card = await mountCard({ env });
  const body = () => card.root.querySelector("#voc-panel");
  assert.deepEqual([body().hasAttribute("data-scroll"), body().getAttribute("role"), body().getAttribute("tabindex")], [true, "tabpanel", "0"]);
  await card.click('[data-key="job:job-kitchen"] .voc-job-main');
  assert.deepEqual([body().hasAttribute("data-scroll"), body().hasAttribute("role"), body().hasAttribute("tabindex")], [true, false, false]);
  card.unmount();
});

test("a view the integration does not offer is listed and explained", async () => {
  const card = await mountCard({ env });
  const services = { ...card.hass.services.vacuum_orchestrator };
  delete services.get_history;
  card.card.hass = { ...card.card.hass, services: { ...card.card.hass.services, vacuum_orchestrator: services } };
  await card.settle(24);
  const tab = card.root.querySelector('[role="tab"][data-view="history"]');
  assert.equal(tab.dataset.unavailable, "true");
  await card.click(tab);
  assert.match(card.text(".voc-unavailable"), /History/);
  card.unmount();
});

test("a command's notice is announced and can be dismissed", async () => {
  const card = await mountCard({ env });
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.services("pause_queue").length, 1);
  card.fake.failNext("resume_queue", { code: "home_assistant_error", message: "Unauthorized" });
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-notice").getAttribute("role"), "alert");
  assert.equal(card.text(".voc-live-region"), card.text(".voc-notice-text"));
  await card.click(".voc-notice-close");
  assert.equal(card.root.querySelector(".voc-notice"), null);
  card.unmount();
});

test("a command the integration refuses shows the integration's own text in the card's language", async () => {
  const card = await mountCard({ env, config: { language: "de" } });
  card.fake.failNext("pause_queue", haError.serviceValidation("critical_storage_state_uncertain"));
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.text(".voc-notice-text"), EXCEPTIONS.de.critical_storage_state_uncertain);
  card.unmount();
});

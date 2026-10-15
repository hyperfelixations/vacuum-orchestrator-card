// The card shell through the built card: language, header options, the warning block and
// subtitle hints, the show switches, the tab strip and its keyboard, the primary action without
// tabs, unavailable views, the command notice and the card dialog above a live view.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard } = require("../../helpers/mount-card.js");
const { exceptionText, haError } = require("../../helpers/voi-records.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };
// Rocky cleans the studio with the queue running; the user may pause it next.
const RUNNING = { recording: "queue_controls", from: "The library job is next" };

test("the card speaks the configured language", async () => {
  const card = await mountCard({ ...BUSY, config: { language: "de" } });
  assert.equal(card.text(".voc-title"), "Reinigung");
  assert.equal(card.text(".voc-status-pill"), "Reinigt");
  assert.deepEqual(card.all('[role="tab"]').map((tab) => tab.getAttribute("title")), ["Warteschlange", "Räume", "Roboter", "Vorlagen", "Verlauf", "Einstellungen"]);
  card.unmount();
});

test("header options set title, subtitle, icon and the accent line position", async () => {
  const card = await mountCard({ ...BUSY, config: { title: "Upstairs", subtitle: { text: "Cleaning crew", overflow: "wrap" }, icon: "mdi:broom", accent_line: "bottom" } });
  const root = card.root.querySelector(".voc-root");
  assert.equal(card.text(".voc-title"), "Upstairs");
  assert.equal(card.text(".voc-subtitle"), "Cleaning crew");
  assert.equal(card.root.querySelector(".voc-icon-badge ha-icon").getAttribute("icon"), "mdi:broom");
  assert.equal(root.dataset.accentLine, "bottom");
  assert.equal(root.dataset.subtitle, "wrap");
  card.unmount();
});

test("an unusable option is a warning with its fallback; show.warnings hides the block", async () => {
  const card = await mountCard({ ...BUSY, config: { page_size: 1 } });
  assert.match(card.text(".voc-warning-text"), /page_size/);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", page_size: 1, show: { warnings: false } });
  await card.settle();
  assert.equal(card.root.querySelector(".voc-warning"), null);
  card.unmount();
});

test("a lost connection is a hint behind the subtitle, not a warning", async () => {
  const card = await mountCard(BUSY);
  card.backend.disconnect();
  await card.updateHass({});
  assert.match(card.text(".voc-subtitle"), / · .*reconnect/i);
  assert.equal(card.root.querySelector(".voc-warning"), null);
  card.backend.reconnect();
  await card.settle(24);
  assert.doesNotMatch(card.text(".voc-subtitle"), /reconnect/i);
  card.unmount();
});

// LAY-05, A11Y-02: a card dialog lies over the view, which stays on screen, follows Home Assistant
// and is inert; the dialog keeps what the user typed.
test("a dialog covers the view, which stays live and inert below it; Escape closes it", async () => {
  const card = await mountCard({ recording: "room_controls", from: "The dining room is released" });
  await card.click('[role="tab"][data-view="rooms"]');
  await card.settle(24);
  await card.click(card.named(".voc-room", "Library").querySelector('[data-action="open-release"]'));
  const dialog = card.root.querySelector(".voc-dialog");
  assert.equal(dialog.dataset.key, "overlay:release");
  assert.deepEqual([dialog.getAttribute("role"), dialog.getAttribute("aria-labelledby"), dialog.getAttribute("aria-modal")], ["dialog", "voc-dialog-title", null]);
  assert.equal(card.root.querySelector(".voc-root").dataset.dialog, "release");
  assert.ok(card.root.querySelector('[data-key="view:rooms"]'), "the view stays below");
  for (const part of [".voc-header", ".voc-panel", ".voc-tab-row", ".voc-body"]) assert.ok(card.root.querySelector(part).hasAttribute("inert"), `${part} is inert`);
  assert.equal(card.root.querySelector(".voc-live-region").hasAttribute("inert"), false, "answers are still announced");
  await card.click('[data-key="field:overlay:releaseKind"] [data-value="timed"]');
  await card.type('[data-field="overlay:hours"]', "1");
  assert.equal(card.text(".voc-panel-robot"), "Rocky · Docked · 100 %");
  const states = card.hass.states;
  await card.updateHass({ states: { ...states, "sensor.rocky_battery": { ...states["sensor.rocky_battery"], state: "80" } } });
  assert.equal(card.text(".voc-panel-robot"), "Rocky · Docked · 80 %", "the card below follows Home Assistant");
  assert.equal(card.root.querySelector(".voc-dialog"), dialog, "the dialog stays in place");
  assert.equal(card.root.querySelector('[data-field="overlay:hours"]').value, "1", "and keeps what was typed");
  await card.press('[data-field="overlay:hours"]', "Escape");
  assert.equal(card.root.querySelector(".voc-dialog"), null);
  assert.equal(card.root.querySelector(".voc-body").hasAttribute("inert"), false);
  assert.equal(card.root.querySelector(".voc-root").dataset.dialog, undefined);
  assert.deepEqual(card.commands("release_rooms"), []);
  card.unmount();
});

test("show switches remove the panel, the tab strip and the queue control", async () => {
  const card = await mountCard({ ...BUSY, config: { show: { panel: false, tabs: false } } });
  assert.equal(card.root.querySelector(".voc-panel"), null);
  assert.equal(card.root.querySelector(".voc-tabs"), null);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", show: { queue_controls: false } });
  await card.settle();
  assert.ok(card.root.querySelector(".voc-panel"));
  assert.equal(card.root.querySelector(".voc-queue-control"), null);
  card.unmount();
});

test("without tabs the view's primary action stands in the header; without a header it keeps a row of its own", async () => {
  const card = await mountCard({ ...BUSY, config: { views: ["queue"] } });
  assert.ok(card.root.querySelector(".voc-header > .voc-header-action > .voc-primary-action"));
  assert.equal(card.root.querySelector(".voc-tab-row"), null);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", views: ["queue"], show: { icon: false, title: false, subtitle: false, pill: false } });
  await card.settle();
  assert.equal(card.root.querySelector(".voc-header"), null);
  assert.ok(card.root.querySelector(".voc-tab-row > .voc-primary-action"));
  card.unmount();
});

test("arrow keys move through the tabs and switch the view with focus on the tab", async () => {
  const card = await mountCard(BUSY);
  await card.press('[role="tab"][data-view="queue"]', "ArrowRight");
  const selected = card.root.querySelector('[role="tab"][aria-selected="true"]');
  assert.equal(selected.dataset.view, "rooms");
  assert.equal(card.root.activeElement, selected);
  assert.equal(card.root.querySelector("#voc-panel").getAttribute("aria-labelledby"), "voc-tab-rooms");
  card.unmount();
});

test("the body is a region that scrolls; as a tab panel it is a tab stop", async () => {
  const card = await mountCard(BUSY);
  const body = () => card.root.querySelector("#voc-panel");
  assert.deepEqual([body().hasAttribute("data-scroll"), body().getAttribute("role"), body().getAttribute("tabindex")], [true, "tabpanel", "0"]);
  await card.click('[data-key="waiting"] .voc-job .voc-job-main');
  assert.deepEqual([body().hasAttribute("data-scroll"), body().hasAttribute("role"), body().hasAttribute("tabindex")], [true, false, false]);
  card.unmount();
});

test("a view the integration does not offer is listed and explained", async () => {
  const card = await mountCard(BUSY);
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
  const card = await mountCard(RUNNING);
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.services("pause_queue").length, 1);
  card.backend.failNext({ service: "resume_queue" }, haError.homeAssistant("Unauthorized"));
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.root.querySelector(".voc-notice").getAttribute("role"), "alert");
  assert.equal(card.text(".voc-live-region"), card.text(".voc-notice-text"));
  await card.click(".voc-notice-close");
  assert.equal(card.root.querySelector(".voc-notice"), null);
  card.unmount();
});

test("a command the integration refuses shows the integration's own text in the card's language", async () => {
  const card = await mountCard({ ...RUNNING, config: { language: "de" } });
  card.backend.failNext({ service: "pause_queue" }, haError.serviceValidation("critical_storage_state_uncertain"));
  await card.click(".voc-queue-control");
  await card.settle(32);
  assert.equal(card.text(".voc-notice-text"), exceptionText("critical_storage_state_uncertain", "de"));
  card.unmount();
});

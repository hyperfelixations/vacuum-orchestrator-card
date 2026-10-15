// The custom element in Home Assistant's lifecycle: setConfig before hass, new hass objects,
// refusals that leave the card untouched, onboarding until the integration works, remounts,
// cards sharing one session, render failures, the config form and the grid contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { mountCard, settle } = require("../../helpers/mount-card.js");

const BUSY = { recording: "showcase", from: "A busy afternoon" };
const subscriptions = (card) => card.backend.calls.filter((message) => message.type === "vacuum_orchestrator/subscribe").length;

test("configured before it gets hass, the card connects and shows the queue", async () => {
  const card = await mountCard(BUSY);
  assert.equal(card.text(".voc-status-pill"), "Cleaning");
  assert.deepEqual(card.all(".voc-job .voc-job-title").map((title) => title.textContent.trim()), ["Studio", "Conservatory", "Library, thoroughly", "Dining Room"]);
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "view");
  card.unmount();
});

test("a new hass object on every state change keeps the session and its one subscription", async () => {
  const card = await mountCard(BUSY);
  const session = card.card._hold.session;
  await card.updateHass({ states: { ...card.hass.states } });
  await card.updateHass({ states: { ...card.hass.states } });
  assert.equal(card.card._hold.session, session);
  assert.equal(subscriptions(card), 1);
  card.unmount();
});

test("a state change reaches the card without a backend event", async () => {
  const card = await mountCard(BUSY);
  const states = { ...card.hass.states, "sensor.rocky_battery": { ...card.hass.states["sensor.rocky_battery"], state: "42" } };
  await card.updateHass({ states });
  assert.match(card.text(".voc-panel"), /42 %/);
  card.unmount();
});

test("a missing integration shows how to get it", async () => {
  const card = await mountCard({ recording: "not_installed" });
  assert.equal(card.root.querySelector(".voc-onboarding").dataset.phase, "not_installed");
  assert.deepEqual([...card.root.querySelectorAll(".voc-onboarding a")].map((link) => link.getAttribute("href")), ["https://my.home-assistant.io/redirect/hacs_repository/?owner=hyperfelixations&repository=vacuum-orchestrator&category=integration", "https://github.com/hyperfelixations/vacuum-orchestrator#installation"]);
  card.unmount();
});

test("an installed but unconfigured integration offers Home Assistant's setup dialog, and the card follows once it is added", async () => {
  const card = await mountCard({ recording: "setup", from: "Vacuum Orchestrator is installed but not set up" });
  const action = card.root.querySelector('.voc-onboarding [data-action="navigate"]');
  assert.deepEqual(JSON.parse(action.dataset.args), { path: "/_my_redirect/config_flow_start?domain=vacuum_orchestrator" });
  await card.until("The user adds Vacuum Orchestrator");
  assert.equal(card.root.querySelector(".voc-onboarding"), null);
  assert.equal(card.root.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "setup", "the assistant opens until setup is finished");
  card.unmount();
});

test("removing and re-adding the card renders one card and keeps the subscription", async () => {
  const card = await mountCard(BUSY);
  const parent = card.card.parentNode;
  card.card.remove();
  parent.appendChild(card.card);
  await settle(16);
  assert.equal(card.root.querySelectorAll(".voc-root").length, 1);
  assert.equal(subscriptions(card), 1);
  card.unmount();
});

test("two cards on one connection share a session and keep their own tabs", async () => {
  const first = await mountCard(BUSY);
  const second = first.env.createCard({ type: "custom:vacuum-orchestrator-card", start_view: "rooms" }, first.hass);
  await settle(24);
  assert.equal(second._hold.session, first.card._hold.session);
  assert.equal(subscriptions(first), 1);
  assert.equal(second.shadowRoot.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "rooms");
  assert.equal(first.root.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "queue");
  first.unmount();
});

test("a configuration typo is refused and leaves the card as it was", async () => {
  const card = await mountCard({ ...BUSY, config: { title: "Downstairs" } });
  assert.throws(() => card.card.setConfig({ titel: "x" }), /Did you mean title\?/);
  await settle();
  assert.equal(card.text(".voc-title"), "Downstairs");
  card.unmount();
});

test("a German configuration error message follows the card's language", async () => {
  const card = await mountCard(BUSY);
  assert.throws(() => card.card.setConfig({ language: "de", strat_view: "rooms" }), (error) => error.message === "Ungültige Konfiguration: strat_view ist keine Option dieser Karte. Meintest du start_view?");
  card.unmount();
});

test("a render that fails leaves one localized line and the next good render recovers", async () => {
  const card = await mountCard(BUSY);
  const rows = card.all(".voc-job").length;
  const original = card.card._computeViewModel;
  card.card._computeViewModel = () => {
    throw new Error("boom");
  };
  const errors = [];
  const log = card.env.window.console.error;
  card.env.window.console.error = (...args) => errors.push(args);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", title: "Again" });
  await settle();
  card.env.window.console.error = log;
  assert.equal(card.root.querySelectorAll(".voc-render-failed").length, 1);
  assert.equal(errors.length, 1);
  card.card._computeViewModel = original;
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card" });
  await settle();
  assert.equal(card.root.querySelector(".voc-render-failed"), null);
  assert.equal(card.all(".voc-job").length, rows);
  card.unmount();
});

test("the card offers no form editor and starts from an empty stub; the grid and size hints are present", async () => {
  const card = await mountCard(BUSY);
  const Card = card.env.window.customElements.get("vacuum-orchestrator-card");
  // Objects from the card's realm are compared by value.
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual([typeof Card.getConfigForm, typeof Card.getConfigElement], ["undefined", "undefined"]);
  assert.deepEqual(plain(card.card.getGridOptions()), { columns: "full", rows: 10, min_columns: 12, min_rows: 7 });
  card.card.getGridOptions().rows = 3;
  assert.equal(card.card.getGridOptions().rows, 10, "every call hands out its own copy");
  assert.ok(card.card.getCardSize() >= 4);
  assert.deepEqual(plain(Card.getStubConfig()), {});
  card.unmount();
});

test("in a sections grid with fixed rows and in a panel the card takes the dashboard's height; elsewhere its standard height", async () => {
  const card = await mountCard(BUSY);
  const surface = () => card.root.querySelector("ha-card");
  const height = () => surface().style.getPropertyValue("--voc-frame-height");
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().dataset.frame, height()], [false, "lock", "632px"], "ten rows without a dashboard height");
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", grid_options: { rows: 8 } });
  await settle();
  assert.equal(height(), "504px", "the card's rows set its standard height");
  card.card.layout = "grid";
  await settle();
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().dataset.frame, height()], [true, "fill", ""]);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", grid_options: { rows: "auto" } });
  await settle();
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().hasAttribute("data-frame"), surface().style.getPropertyValue("--voc-frame-min")], [false, false, "440px"], "rows: auto grows with the content above the floor");
  card.card.layout = "panel";
  await settle();
  assert.equal(surface().dataset.frame, "fill");
  card.unmount();
});

test("with rows: auto an open page keeps the card's height until the last one closes", async () => {
  const card = await mountCard({ ...BUSY, config: { grid_options: { rows: "auto" } } });
  const surface = () => card.root.querySelector("ha-card");
  await card.click('[data-key="waiting"] .voc-job .voc-job-main');
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "overlay");
  assert.deepEqual([surface().dataset.frame, surface().style.getPropertyValue("--voc-frame-height")], ["lock", "440px"], "jsdom measures 0, so the floor holds");
  await card.click('[data-action="back"]');
  assert.deepEqual([surface().hasAttribute("data-frame"), surface().style.getPropertyValue("--voc-frame-height")], [false, ""]);
  card.unmount();
});

test("an unloaded integration is onboarding again", async () => {
  const card = await mountCard({ recording: "unloaded", from: "The card opens" });
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "view");
  await card.until("Home Assistant unloads the integration");
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "onboarding");
  card.unmount();
});

test("a reloaded integration is followed through the subscription and keeps the card's one subscription", async () => {
  const card = await mountCard({ recording: "reload", from: "A studio job waits" });
  await card.until("Home Assistant reloads the integration");
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "view");
  assert.deepEqual(card.all(".voc-job .voc-job-title").map((title) => title.textContent.trim()), ["Studio"]);
  assert.equal(subscriptions(card), 1);
  card.unmount();
});

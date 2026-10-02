// The custom element in Home Assistant's lifecycle: setConfig before hass, new hass objects,
// refusals that leave the card untouched, onboarding until the integration works, remounts,
// cards sharing one session, render failures, the config form and the grid contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment, settle } = require("../../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

test("configured before it gets hass, the card connects and shows the queue", async () => {
  const card = await mountCard({ env });
  assert.equal(card.text(".voc-status-pill"), "Cleaning");
  assert.deepEqual(card.all(".voc-job").map((row) => row.dataset.key), ["job:job-running", "job:job-kitchen", "job:job-bathroom", "job:job-bedroom"]);
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "view");
  card.unmount();
});

test("a new hass object on every state change keeps the session and its one subscription", async () => {
  const card = await mountCard({ env });
  const session = card.card._hold.session;
  await card.updateHass({ states: { ...card.hass.states } });
  await card.updateHass({ states: { ...card.hass.states } });
  assert.equal(card.card._hold.session, session);
  assert.equal(card.fake.subscriberCount(), 1);
  card.unmount();
});

test("a state change reaches the card without a backend event", async () => {
  const card = await mountCard({ env });
  const states = { ...card.hass.states, "sensor.rocky_battery": { ...card.hass.states["sensor.rocky_battery"], state: "42" } };
  await card.updateHass({ states });
  assert.match(card.text(".voc-panel"), /42 %/);
  card.unmount();
});

test("a missing integration shows how to get it, and the card follows once it is set up", async () => {
  const card = await mountCard({ env, fake: { installed: false, setUp: false } });
  assert.equal(card.root.querySelector(".voc-onboarding").dataset.phase, "not_installed");
  assert.match(card.root.querySelector(".voc-onboarding a").getAttribute("href"), /github.com\/hyperfelixations\/vacuum-orchestrator/);
  card.fake.state.installed = true;
  card.fake.state.setUp = true;
  await card.updateHass({});
  await settle(24);
  assert.equal(card.root.querySelector(".voc-onboarding"), null);
  assert.equal(card.all(".voc-job").length, 4);
  card.unmount();
});

test("an installed but unconfigured integration offers Home Assistant's setup dialog", async () => {
  const card = await mountCard({ env, fake: { setUp: false } });
  const action = card.root.querySelector('.voc-onboarding [data-action="navigate"]');
  assert.deepEqual(JSON.parse(action.dataset.args), { path: "/_my_redirect/config_flow_start?domain=vacuum_orchestrator" });
  card.unmount();
});

test("removing and re-adding the card renders one card and keeps the subscription", async () => {
  const card = await mountCard({ env });
  const parent = card.card.parentNode;
  card.card.remove();
  parent.appendChild(card.card);
  await settle(16);
  assert.equal(card.root.querySelectorAll(".voc-root").length, 1);
  assert.equal(card.fake.subscriberCount(), 1);
  card.unmount();
});

test("two cards on one connection share a session and keep their own tabs", async () => {
  const first = await mountCard({ env });
  const second = env.createCard({ type: "custom:vacuum-orchestrator-card", start_view: "rooms" }, first.hass);
  await settle(24);
  assert.equal(second._hold.session, first.card._hold.session);
  assert.equal(first.fake.subscriberCount(), 1);
  assert.equal(second.shadowRoot.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "rooms");
  assert.equal(first.root.querySelector('[role="tab"][aria-selected="true"]').dataset.view, "queue");
  env.cleanup(second);
  first.unmount();
});

test("a configuration typo is refused and leaves the card as it was", async () => {
  const card = await mountCard({ env, config: { title: "Downstairs" } });
  assert.throws(() => card.card.setConfig({ titel: "x" }), /Did you mean title\?/);
  await settle();
  assert.equal(card.text(".voc-title"), "Downstairs");
  card.unmount();
});

test("a German configuration error message follows the card's language", async () => {
  const card = await mountCard({ env });
  assert.throws(() => card.card.setConfig({ language: "de", strat_view: "rooms" }), (error) => error.message === "Ungültige Konfiguration: strat_view ist keine Option dieser Karte. Meintest du start_view?");
  card.unmount();
});

test("a render that fails leaves one localized line and the next good render recovers", async () => {
  const card = await mountCard({ env });
  const original = card.card._computeViewModel;
  card.card._computeViewModel = () => {
    throw new Error("boom");
  };
  const errors = [];
  const log = env.window.console.error;
  env.window.console.error = (...args) => errors.push(args);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", title: "Again" });
  await settle();
  env.window.console.error = log;
  assert.equal(card.root.querySelectorAll(".voc-render-failed").length, 1);
  assert.equal(errors.length, 1);
  card.card._computeViewModel = original;
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card" });
  await settle();
  assert.equal(card.root.querySelector(".voc-render-failed"), null);
  assert.equal(card.all(".voc-job").length, 4);
  card.unmount();
});

test("the visual editor gets a form with the view types; the grid and size hints are present", async () => {
  const card = await mountCard({ env });
  const Card = env.window.customElements.get("vacuum-orchestrator-card");
  // Objects from the card's realm are compared by value.
  const form = Card.getConfigForm();
  const plain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(form.schema.map((entry) => entry.name)), ["title", "subtitle", "start_view", "language"]);
  assert.deepEqual(plain(form.schema[2].selector.select.options), ["setup", "queue", "rooms", "robots", "templates", "history", "diagnostics", "settings"]);
  assert.throws(() => form.assertConfig({ show: { panle: false } }));
  assert.deepEqual(plain(card.card.getGridOptions()), { columns: 12, min_columns: 6, max_columns: 12 });
  assert.ok(card.card.getCardSize() >= 4);
  assert.deepEqual(plain(Card.getStubConfig()), {});
  card.unmount();
});

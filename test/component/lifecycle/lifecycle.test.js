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
  assert.deepEqual([...card.root.querySelectorAll(".voc-onboarding a")].map((link) => link.getAttribute("href")), ["https://my.home-assistant.io/redirect/hacs_repository/?owner=hyperfelixations&repository=vacuum-orchestrator&category=integration", "https://github.com/hyperfelixations/vacuum-orchestrator#installation"]);
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

test("against the integration's own recordings the card reports an API version it cannot read", async () => {
  const card = await mountCard({ recording: "showcase", from: "A busy afternoon" });
  assert.equal(card.root.querySelector(".voc-onboarding").dataset.phase, "api_incompatible");
  assert.ok(card.backend.calls.some((message) => message.type === "vacuum_orchestrator/queue/get" && message.limit === 1));
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

test("the card offers no form editor and starts from an empty stub; the grid and size hints are present", async () => {
  const card = await mountCard({ env });
  const Card = env.window.customElements.get("vacuum-orchestrator-card");
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

test("in a sections grid with fixed rows and in a panel the card takes the dashboard's height", async () => {
  const card = await mountCard({ env });
  const surface = () => card.root.querySelector("ha-card");
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().hasAttribute("data-frame")], [false, false]);
  card.card.layout = "grid";
  await settle();
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().dataset.frame], [true, "fill"]);
  card.card.setConfig({ type: "custom:vacuum-orchestrator-card", grid_options: { rows: "auto" } });
  await settle();
  assert.deepEqual([card.card.hasAttribute("data-voc-frame"), surface().hasAttribute("data-frame")], [false, false]);
  card.card.layout = "panel";
  await settle();
  assert.equal(surface().dataset.frame, "fill");
  card.unmount();
});

test("with its own height an open overlay keeps the card's height until the last one closes", async () => {
  const card = await mountCard({ env });
  const surface = () => card.root.querySelector("ha-card");
  await card.click(`.voc-job[data-key="job:job-kitchen"] .voc-job-main`);
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "overlay");
  assert.deepEqual([surface().dataset.frame, surface().style.getPropertyValue("--voc-frame-height")], ["lock", "440px"], "jsdom measures 0, so the floor holds");
  await card.click('[data-action="back"]');
  assert.deepEqual([surface().hasAttribute("data-frame"), surface().style.getPropertyValue("--voc-frame-height")], [false, ""]);
  card.unmount();
});

test("a reloaded integration is followed through the subscription, with no read while it waits", async () => {
  const card = await mountCard({ env });
  card.fake.unloadRuntime();
  await settle(16);
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "onboarding");
  card.fake.loadRuntime();
  await settle(24);
  assert.equal(card.root.querySelector(".voc-root").dataset.state, "view");
  assert.equal(card.all(".voc-job").length, 4);
  assert.equal(card.fake.subscriberCount(), 1);
  card.unmount();
});

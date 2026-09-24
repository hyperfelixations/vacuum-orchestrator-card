"use strict";
// The custom element's Home Assistant lifecycle: setConfig before hass, refusals that leave
// the card untouched, reconnects, and the grid contract.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestEnvironment } = require("../../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../../helpers/mount-card.js");

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

test("the null configuration is complete and the card exposes the HA grid contract", async () => {
  const mounted = await mountCard({ env });
  assert.deepEqual({ ...mounted.card.getGridOptions() }, { columns: 12, min_columns: 6, max_columns: 12 });
  assert.deepEqual(mounted.card.config, {});
  assert.ok(mounted.card.getCardSize() >= 4);
  mounted.unmount();
});

// Home Assistant calls setConfig before it sets hass. A backend bound to the missing hass of
// the first call never connected, and the card reported "not installed" forever.
test("the card connects when Home Assistant sets the configuration first", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  assert.equal(mounted.text(".voc-status-pill"), "Idle");
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

test("a later hass object is picked up without recreating the backend", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  const next = { ...mounted.hass, states: { ...mounted.hass.states } };
  mounted.card.hass = next;
  await mounted.settle();
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

test("the card reports a missing integration and recovers once it loads", async () => {
  const mounted = await mountCard({ env, attachBackend: false });
  assert.equal(mounted.text(".voc-status-pill"), "Not installed");
  assert.match(mounted.text(".voc-no-section"), /not installed/);
  mounted.card.hass = mounted.fake.attachTo(mounted.hass);
  await mounted.settle();
  assert.equal(mounted.text(".voc-status-pill"), "Idle");
  mounted.unmount();
});

test("setConfig is atomic when normalization rejects a typo, and the refusal is localized", async () => {
  const mounted = await mountCard({ env, config: { language: "de" } });
  assert.throws(() => mounted.card.setConfig({ languge: "de", language: "de" }), /Ungültige Konfiguration: languge ist keine Option dieser Karte\. Meintest du language\?/);
  assert.equal(mounted.card.config.language, "de");
  mounted.unmount();
});

test("disconnect and reconnect leave one rendered card", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  mounted.card.remove();
  env.document.body.appendChild(mounted.card);
  await mounted.settle();
  assert.equal(mounted.root.querySelectorAll(".voc-root").length, 1);
  assert.deepEqual(mounted.rows(), ["job-a", "job-b"]);
  mounted.unmount();
});

test("the card size grows with the rows the queue will draw", async () => {
  const empty = await mountCard({ env });
  const filled = await mountCard({ env, seed: { jobs: JOBS } });
  assert.ok(filled.card.getCardSize() > empty.card.getCardSize());
  assert.ok(filled.card.getCardSize() <= 14, "the estimate stays bounded");
  empty.unmount();
  filled.unmount();
});

// A page is a backend query, not a slice of an already loaded list.
test("paging asks the backend for the next and the previous page", async () => {
  const jobs = Array.from({ length: 12 }, (_, index) => ({ job_id: `job-${index}`, areas: ["kitchen"], mode: "vacuum" }));
  const mounted = await mountCard({ env, config: { page_size: 5 }, seed: { jobs } });
  assert.equal(mounted.rows().length, 5);

  await mounted.click('[data-action="load-more"]');
  assert.deepEqual(mounted.rows(), ["job-5", "job-6", "job-7", "job-8", "job-9"]);
  assert.equal(mounted.text(".voc-page-status"), "2 / 3");

  await mounted.click('[data-action="load-previous"]');
  assert.deepEqual(mounted.rows(), ["job-0", "job-1", "job-2", "job-3", "job-4"]);
  mounted.unmount();
});

test("typing in a field reaches the draft, and typing in the entity picker only filters it", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click(".voc-primary-action");
  const name = mounted.root.querySelector('[data-field-path="name"] input');
  name.value = "Evening round";
  name.dispatchEvent(new mounted.env.window.Event("change", { bubbles: true, composed: true }));
  await mounted.settle();
  assert.equal(mounted.card._ui.draft.name, "Evening round");

  const picker = mounted.root.querySelector('[data-field-path="requiredOn"] input');
  picker.value = "door";
  picker.dispatchEvent(new mounted.env.window.Event("input", { bubbles: true, composed: true }));
  await mounted.settle();
  assert.deepEqual([...(mounted.card._ui.draft.requiredOn || [])], [], "filtering is not a choice");
  mounted.unmount();
});

// Leaving a started draft must not discard it silently.
test("leaving a changed editor asks before the draft is dropped", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  await mounted.click(".voc-primary-action");
  await mounted.click('.voc-job-editor [data-control][data-field-path="areas"] [data-voc-value="bathroom"]');
  await mounted.click(".voc-job-editor .voc-back-button");
  assert.ok(mounted.root.querySelector(".voc-confirm-overlay"), "the card asks first");
  await mounted.click('.voc-confirm-actions [data-action="dismiss"]');
  assert.ok(mounted.root.querySelector(".voc-job-editor"), "dismissing keeps the draft");
  mounted.unmount();
});

// A card that cannot be drawn says so in its own frame instead of going blank or stale.
test("a render that fails leaves one localized line in the card", async () => {
  const mounted = await mountCard({ env, seed: { jobs: JOBS } });
  mounted.card.hass = {
    language: "en",
    locale: { language: "en" },
    config: { components: ["vacuum_orchestrator"] },
    user: { is_admin: true },
    get states() {
      throw new Error("simulated integration failure");
    },
  };
  await mounted.settle();
  assert.equal(mounted.text(".voc-render-failed"), "The card could not be rendered. Check the browser console.");
  assert.equal(mounted.root.querySelectorAll(".voc-job-row").length, 0);
  mounted.unmount();
});

// Home Assistant reads this form to draw the card's visual editor.
test("the configuration form offers every visual option and refuses an invalid one", async () => {
  const mounted = await mountCard({ env });
  const form = mounted.env.window.customElements.get("vacuum-orchestrator-card").getConfigForm();
  // The form comes from the card's realm, so the list is copied before it is compared.
  const names = [...form.schema].map((entry) => entry.name);
  assert.deepEqual(names, ["title", "subtitle", "language", "start_section", "page_size", "time_format", "density", "confirm_destructive"]);
  assert.equal(form.computeLabel({ name: "page_size" }).length > 0, true);
  assert.equal(form.computeLabel({ name: "not_an_option" }), "not_an_option");
  form.assertConfig({ page_size: 30 });
  assert.throws(() => form.assertConfig({ pag_size: 30 }), (error) => error.code === "config.unknown_key");
  mounted.unmount();
});

"use strict";
// Characterization of the rendered card in its reference states and of the shipped stylesheet.
// Times are absolute and UTC so a recording means the same thing on every machine.

process.env.TZ = "UTC";

const test = require("node:test");
const { createTestEnvironment } = require("../helpers/load-card.jsdom.js");
const { mountCard, JOBS } = require("../helpers/mount-card.js");
const { expectBaseline, serializeCard } = require("../helpers/characterization.js");

const BASE_CONFIG = Object.freeze({ time_format: "absolute" });

const CASES = Object.freeze([
  { name: "queue-today", options: { seed: { jobs: JOBS } } },
  { name: "queue-empty", options: {} },
  { name: "queue-read-only", options: { seed: { jobs: JOBS }, hass: { isAdmin: false } } },
  { name: "queue-german", options: { seed: { jobs: JOBS }, config: { language: "de" } } },
  { name: "backend-missing", options: { attachBackend: false } },
  { name: "rooms-degraded", options: { seed: { jobs: JOBS } }, tab: "rooms" },
  { name: "rooms-target", options: { profile: "target" }, tab: "rooms" },
  { name: "robots-target", options: { profile: "target" }, tab: "robots" },
  { name: "editor-create", options: { seed: { jobs: JOBS } }, click: ".voc-primary-action" },
  { name: "detail", options: { seed: { jobs: JOBS } }, click: '.voc-job-row[data-job-id="job-a"] .voc-job-name' },
  { name: "confirm-delete", options: { seed: { jobs: JOBS } }, click: '.voc-job-row[data-job-id="job-a"] .voc-job-action-delete' },
]);

let env;
test.before(() => {
  env = createTestEnvironment();
});
test.after(() => env.cleanupAll());

for (const entry of CASES) {
  test(`the card in state ${entry.name} matches its recording`, async () => {
    const mounted = await mountCard({ env, ...entry.options, config: { ...BASE_CONFIG, ...(entry.options.config || {}) } });
    if (entry.tab) await mounted.click(`[role=tab][data-section="${entry.tab}"]`);
    if (entry.click) await mounted.click(entry.click);
    expectBaseline(`dom/${entry.name}.html`, serializeCard(mounted.card));
    mounted.unmount();
  });
}

test("the shipped stylesheet matches its recording", async () => {
  const mounted = await mountCard({ env, config: BASE_CONFIG });
  const style = mounted.root.querySelector("style");
  expectBaseline("styles/full.css", `${style.textContent.trim()}\n`);
  mounted.unmount();
});

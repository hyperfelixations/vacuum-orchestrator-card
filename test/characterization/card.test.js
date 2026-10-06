// Characterization of the rendered card in its reference states and of the shipped stylesheet.
// Times are absolute and UTC so a recording means the same thing on every machine.

process.env.TZ = "UTC";

const test = require("node:test");
const { createTestEnvironment } = require("../helpers/load-card.jsdom.js");
const { mountCard, FIXED_NOW } = require("../helpers/mount-card.js");
const { expectBaseline, serializeCard } = require("../helpers/characterization.js");

const BASE_CONFIG = Object.freeze({ time_format: "absolute" });

const CASES = Object.freeze([
  { name: "queue-typical", options: {} },
  { name: "queue-empty", options: { scenario: "empty" } },
  { name: "queue-attention", options: { scenario: "attention" } },
  { name: "queue-winding-down", options: { scenario: "windingDown" } },
  { name: "queue-read-only", options: { admin: false } },
  { name: "queue-german", options: { config: { language: "de" } } },
  { name: "onboarding-not-installed", options: { fake: { installed: false, setUp: false } } },
  { name: "onboarding-not-set-up", options: { fake: { setUp: false } } },
  { name: "onboarding-load-failed", options: { fake: { runtimeLoaded: false } } },
  { name: "setup-fresh", options: { scenario: "fresh" } },
  { name: "rooms", options: {}, steps: ['[role="tab"][data-view="rooms"]'] },
  { name: "robots", options: {}, steps: ['[role="tab"][data-view="robots"]'] },
  { name: "templates", options: {}, steps: ['[role="tab"][data-view="templates"]'] },
  { name: "history-jobs", options: {}, steps: ['[role="tab"][data-view="history"]'] },
  { name: "history-runs", options: {}, steps: ['[role="tab"][data-view="history"]', '[data-key="segment:runs"]'] },
  { name: "diagnostics", options: { config: { views: ["queue", "diagnostics"], start_view: "diagnostics" } } },
  { name: "settings", options: { config: { start_view: "settings" } } },
  { name: "editor-create", options: {}, steps: [".voc-primary-action"] },
  { name: "detail", options: {}, steps: ['[data-key="job:job-bathroom"] .voc-job-main'] },
  { name: "confirm-cancel", options: {}, steps: ['[data-key="job:job-running"] [data-action="cancel-job"]'] },
  { name: "queue-end", options: {}, steps: [".voc-queue-end"] },
  { name: "queue-ending", options: { scenario: "ending" } },
  { name: "robots-ending", options: { scenario: "ending" }, steps: ['[role="tab"][data-view="robots"]'] },
  { name: "job-defaults", options: { config: { start_view: "settings" } }, steps: ['[data-action="open-job-defaults"]'] },
  { name: "save-template", options: {}, steps: ['[data-key="job:job-bathroom"] .voc-job-main', '[data-action="open-save-template"]'] },
  { name: "release-dialog", options: {}, steps: ['[role="tab"][data-view="rooms"]', '[data-key="room:room-bathroom"] [data-action="open-release"]'] },
  { name: "room-editor", options: {}, steps: ['[role="tab"][data-view="rooms"]', '[data-key="room:room-kitchen"] [data-action="edit-room"]'] },
  { name: "robot-editor", options: {}, steps: ['[role="tab"][data-view="robots"]', '[data-key="robot:robot-dusty"] [data-action="edit-robot"]', '[data-action="toggle-section"][data-args*="roles"]'] },
]);

let env;
test.before(() => {
  env = createTestEnvironment({ now: FIXED_NOW });
});
test.after(() => env.cleanupAll());

for (const entry of CASES) {
  test(`the card in state ${entry.name} matches its recording`, async () => {
    const card = await mountCard({ env, ...entry.options, config: { ...BASE_CONFIG, ...(entry.options.config || {}) } });
    for (const selector of entry.steps || []) {
      await card.click(selector);
      await card.settle(24);
    }
    expectBaseline(`dom/${entry.name}.html`, serializeCard(card.card));
    card.unmount();
  });
}

test("the shipped stylesheet matches its recording", async () => {
  const card = await mountCard({ env, config: BASE_CONFIG });
  expectBaseline("styles/full.css", `${card.root.querySelector("style").textContent.trim()}\n`);
  card.unmount();
});

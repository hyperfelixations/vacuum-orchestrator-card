// Characterization of the rendered card in its reference states and of the shipped stylesheet.
// Every state is a mark of the integration's recordings; times are absolute and UTC so a
// recording means the same thing on every machine.

process.env.TZ = "UTC";

const test = require("node:test");
const { mountCard } = require("../helpers/mount-card.js");
const { expectBaseline, serializeCard } = require("../helpers/characterization.js");
const { haError } = require("../helpers/voi-records.js");

const BASE_CONFIG = Object.freeze({ time_format: "absolute" });

const BUSY = { recording: "showcase", from: "A busy afternoon" };
const ENDING = { recording: "queue_controls", from: "The queue ends after the started job" };
const tab = (view) => `[role="tab"][data-view="${view}"]`;
// A step on the list item shown under `name`.
const on = (selector, name, inner) => (card) => card.named(selector, name).querySelector(inner);

const CASES = Object.freeze([
  { name: "queue-typical", place: BUSY },
  { name: "queue-empty", place: { recording: "queue_end", from: "The card opens" } },
  { name: "queue-attention", place: { recording: "attention", from: "The station needs attention" } },
  { name: "queue-recovery", place: { recording: "recovery", from: "The job needs clarification" } },
  { name: "queue-winding-down", place: { recording: "queue_end", from: "The queue waits for work" } },
  { name: "queue-read-only", place: { ...BUSY, admin: false } },
  { name: "queue-german", place: BUSY, config: { language: "de" } },
  { name: "onboarding-not-installed", place: { recording: "not_installed" } },
  { name: "onboarding-not-set-up", place: { recording: "setup", from: "Vacuum Orchestrator is installed but not set up" } },
  { name: "onboarding-load-failed", place: { recording: "unloaded", from: "The integration is not loaded" } },
  { name: "onboarding-check-failed", place: { recording: "not_installed", failNext: [[{ type: "manifest/get" }, haError.homeAssistant("Unknown error")]] } },
  { name: "setup-no-robot", place: { recording: "no_robot" } },
  { name: "setup-assistant", place: { recording: "setup", from: "The assistant opens" } },
  { name: "setup-guide", place: BUSY, config: { start_view: "settings" }, steps: ['[data-action="open-setup"]'] },
  { name: "rooms", place: BUSY, steps: [tab("rooms")] },
  { name: "robots", place: BUSY, steps: [tab("robots")] },
  { name: "templates", place: BUSY, steps: [tab("templates")] },
  { name: "history-jobs", place: BUSY, steps: [tab("history")] },
  { name: "history-runs", place: BUSY, steps: [tab("history"), '[data-key="segment:runs"]'] },
  { name: "diagnostics", place: BUSY, config: { views: ["queue", "diagnostics"], start_view: "diagnostics" } },
  { name: "settings", place: BUSY, config: { start_view: "settings" } },
  { name: "editor-create", place: BUSY, steps: [".voc-primary-action"] },
  { name: "detail", place: BUSY, steps: [on(".voc-job", "Conservatory", ".voc-job-main")] },
  { name: "confirm-cancel", place: BUSY, steps: [on(".voc-job", "Studio", '[data-action="cancel-job"]')] },
  { name: "queue-end", place: BUSY, steps: [".voc-queue-end"] },
  { name: "queue-ending", place: ENDING },
  { name: "robots-ending", place: ENDING, steps: [tab("robots")] },
  { name: "job-defaults", place: BUSY, config: { start_view: "settings" }, steps: ['[data-action="open-job-defaults"]'] },
  { name: "save-template", place: BUSY, steps: [on(".voc-job", "Conservatory", ".voc-job-main"), '[data-action="open-save-template"]'] },
  { name: "release-dialog", place: BUSY, steps: [tab("rooms"), on(".voc-room", "Conservatory", '[data-action="open-release"]')] },
  { name: "room-editor", place: BUSY, steps: [tab("rooms"), on(".voc-room", "Dining Room", '[data-action="edit-room"]')] },
  { name: "robot-editor", place: { recording: "robot_choice", from: "The card opens" }, steps: [tab("robots"), on(".voc-robot", "Dusty", '[data-action="edit-robot"]'), '[data-action="toggle-section"][data-args*="roles"]'] },
]);

for (const entry of CASES) {
  test(`the card in state ${entry.name} matches its recording`, async () => {
    const card = await mountCard({ ...entry.place, config: { ...BASE_CONFIG, ...(entry.config || {}) } });
    for (const step of entry.steps || []) {
      await card.click(typeof step === "function" ? step(card) : step);
      await card.settle(24);
    }
    expectBaseline(`dom/${entry.name}.html`, serializeCard(card.card));
    card.unmount();
  });
}

test("the shipped stylesheet matches its recording", async () => {
  const card = await mountCard({ ...BUSY, config: BASE_CONFIG });
  expectBaseline("styles/full.css", `${card.root.querySelector("style").textContent.trim()}\n`);
  card.unmount();
});

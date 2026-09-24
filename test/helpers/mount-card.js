"use strict";
// Mounts the built card against the fake integration in Home Assistant's call order and gives
// a test the few interactions it needs. Shared by every component test that drives the card
// as a whole.

const { createTestEnvironment, settle } = require("./load-card.jsdom.js");
const { createFakeOrchestrator, VirtualClock } = require("./fake-orchestrator.js");
const { createHass } = require("../fixtures/hass.js");

const AREAS = { kitchen: { name: "Kitchen" }, hall: { name: "Hall" }, bathroom: { name: "Bathroom" } };

async function mountCard({ env = createTestEnvironment(), profile = "today", seed = null, config = {}, hass: hassOptions = {}, attachBackend = true } = {}) {
  const clock = new VirtualClock(Date.parse("2026-09-17T00:10:00Z"));
  const fake = createFakeOrchestrator({ profile, clock, seed });
  const base = createHass({ areas: AREAS, ...hassOptions });
  const hass = attachBackend ? fake.attachTo(base) : base;
  const card = env.createCard(config, hass);
  // `connect()` hands back the negotiation already in flight, so this waits for the first full
  // load instead of guessing how many ticks it takes.
  await card._backend?.connect();
  await settle();
  const root = card.shadowRoot;

  async function click(selector) {
    const node = typeof selector === "string" ? root.querySelector(selector) : selector;
    if (!node) throw new Error(`nothing matches ${selector}`);
    node.dispatchEvent(new env.window.MouseEvent("click", { bubbles: true, composed: true }));
    await settle();
  }

  // Keyboard operation goes through the same listener Home Assistant would trigger, so the
  // control runtimes are exercised rather than simulated.
  async function press(selector, key, init = {}) {
    const node = typeof selector === "string" ? root.querySelector(selector) : selector;
    if (!node) throw new Error(`nothing matches ${selector}`);
    node.focus?.();
    node.dispatchEvent(new env.window.KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init }));
    await settle();
  }

  async function type(selector, value) {
    const node = typeof selector === "string" ? root.querySelector(selector) : selector;
    if (!node) throw new Error(`nothing matches ${selector}`);
    node.focus?.();
    node.value = value;
    // A browser reports both, and the card listens to each for a different control kind.
    node.dispatchEvent(new env.window.Event("input", { bubbles: true, composed: true }));
    node.dispatchEvent(new env.window.Event("change", { bubbles: true, composed: true }));
    await settle();
  }

  return {
    env,
    card,
    root,
    press,
    type,
    fake,
    hass,
    click,
    settle,
    rows: () => [...root.querySelectorAll(".voc-queue-section .voc-pending-queue .voc-job-row")].map((row) => row.dataset.jobId),
    serviceCalls: (service) => fake.calls.services.filter((call) => call.service === service),
    text: (selector) => root.querySelector(selector)?.textContent?.trim() ?? null,
    unmount: () => env.cleanup(card),
  };
}

const JOBS = Object.freeze([
  { job_id: "job-a", name: "Kitchen after dinner", areas: ["kitchen"], mode: "vacuum_then_mop", passes: 2, source: "user" },
  { job_id: "job-b", areas: ["hall", "kitchen"], mode: "mop", source: "automation" },
  { job_id: "job-c", areas: ["hall"], mode: "vacuum", state: "completed" },
]);

module.exports = { mountCard, JOBS, AREAS, settle };

"use strict";
// Mounts the built card in jsdom, in Home Assistant's call order, and gives a test the
// interactions it needs. With `recording` the card runs against a recording of the integration
// (see TESTING.md "Recordings"), opened at the mark `from`, on the recording's clock; otherwise
// against the fake integration for a named household on FIXED_NOW.

const { createTestEnvironment, settle } = require("./load-card.jsdom.js");
const { createFakeOrchestrator, VirtualClock } = require("./fake-orchestrator.js");
const { createRecordedBackend } = require("./recorded-backend.js");
const { loadRecording } = require("./recordings.js");
const { FIXED_NOW, SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

// The card follows a recording: every recorded change hands it a new hass, as Home Assistant does.
function recorded({ recording, from, language, admin }) {
  const clock = { time: 0, now: () => clock.time, advance: (ms) => (clock.time += ms) };
  const backend = createRecordedBackend(loadRecording(recording), { from, language, admin, clock });
  clock.time = backend.nowMs;
  return { backend, clock };
}

// `fake`: options for the fake integration (installed, setUp, runtimeLoaded, apiVersion).
async function mountCard({ env = null, recording = null, from, scenario = "typical", config = {}, language = "en", admin = true, fake: fakeOptions = {}, attach = true } = {}) {
  const replay = recording ? recorded({ recording, from, language, admin }) : null;
  const ownEnv = !env;
  env ??= createTestEnvironment({ now: replay ? () => replay.clock.now() : FIXED_NOW });
  let fake = null;
  let hass;
  if (replay) {
    hass = replay.backend.hass;
  } else {
    const household = SCENARIOS[scenario]();
    fake = createFakeOrchestrator({ seed: household.seed, clock: new VirtualClock(FIXED_NOW), admin, ...fakeOptions });
    const base = hassFor(household, { language, admin });
    hass = attach ? fake.attachTo(base) : base;
  }
  const card = env.createCard({ type: "custom:vacuum-orchestrator-card", ...config }, hass);
  replay?.backend.onChange((next) => (card.hass = next));
  await settle(24);
  const root = card.shadowRoot;

  const find = (selector) => {
    const node = typeof selector === "string" ? root.querySelector(selector) : selector;
    if (!node) throw new Error(`nothing matches ${selector}`);
    return node;
  };

  async function click(selector) {
    find(selector).dispatchEvent(new env.window.MouseEvent("click", { bubbles: true, composed: true }));
    await settle(16);
  }

  // Keyboard operation goes through the card's own keydown listener.
  async function press(selector, key, init = {}) {
    const node = find(selector);
    node.focus?.();
    node.dispatchEvent(new env.window.KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...init }));
    await settle(16);
  }

  async function type(selector, value) {
    const node = find(selector);
    node.focus?.();
    node.value = value;
    // A browser reports both; the card listens to each for a different control kind.
    node.dispatchEvent(new env.window.Event("input", { bubbles: true, composed: true }));
    node.dispatchEvent(new env.window.Event("change", { bubbles: true, composed: true }));
    await settle(16);
  }

  // A new hass object, as Home Assistant hands one over on every state change.
  async function updateHass(patch = {}) {
    const next = { ...card.hass, ...patch };
    card.hass = attach && fake ? fake.attachTo(next) : next;
    await settle(16);
    return card.hass;
  }

  // Plays the recording through a change in the home and lets the card follow.
  async function until(change) {
    replay.backend.until(change);
    await settle(16);
  }

  const calls = () => (replay ? replay.backend.calls : fake.calls.ws);
  const serviceCalls = () => (replay ? replay.backend.calls.filter((message) => message.type === "call_service").map((message) => ({ service: message.service, data: message.service_data })) : fake.calls.services);

  return {
    env,
    card,
    root,
    fake,
    backend: replay?.backend ?? null,
    until,
    hass,
    click,
    press,
    type,
    updateHass,
    settle: (rounds = 16) => settle(rounds),
    text: (selector) => root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    all: (selector) => [...root.querySelectorAll(selector)],
    services: (name) => serviceCalls().filter((call) => call.service === name),
    commands: (name) => calls().filter((message) => message.type === "vacuum_orchestrator/configuration/command" && message.command === name),
    queries: (name) => calls().filter((message) => message.type === "vacuum_orchestrator/configuration/get" && message.query === name),
    unmount() {
      env.cleanup(card);
      // An environment of its own goes with the card, timers included.
      if (ownEnv) env.window.close();
    },
  };
}

module.exports = { mountCard, settle, FIXED_NOW };

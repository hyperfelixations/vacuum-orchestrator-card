"use strict";
// Mounts the built card in jsdom, in Home Assistant's call order, against a recording of the
// integration (see internal dev doc §10): opened at the mark `from` (else the recording's first),
// on the recording's clock, in an environment of its own. Gives a test the interactions it needs.

const { after } = require("node:test");
const { createTestEnvironment, settle } = require("./load-card.jsdom.js");
const { createRecordedBackend } = require("./recorded-backend.js");
const { loadRecording } = require("./recordings.js");

// Environments still open when a test ends: one that failed before `unmount` left its card's
// timers running, which would keep the test process from ending and reporting the failure.
const open = new Set();
after(() => {
  for (const env of open) close(env);
});

function close(env) {
  open.delete(env);
  env.cleanupAll();
  env.window.close();
}

// Where a job, room, robot or template shows its name.
const NAMES = ".voc-job-title, .voc-room-name, .voc-robot-name, .voc-template-name";

// `admin`: overrides the recorded user's flag. `failNext`: [match, error] pairs Home Assistant
// refuses before the card opens (see the player's `failNext`).
async function mountCard({ recording, from, config = {}, language = "en", admin, failNext = [] } = {}) {
  if (!recording) throw new Error("mountCard needs a recording of the integration");
  const played = loadRecording(recording);
  const clock = { time: 0, now: () => clock.time, advance: (ms) => (clock.time += ms) };
  const backend = createRecordedBackend(played, { from: from ?? played.steps.find((step) => step.mark !== undefined)?.mark, language, admin, clock });
  clock.time = backend.nowMs;
  for (const [match, error] of failNext) backend.failNext(match, error);
  const env = createTestEnvironment({ now: () => clock.now() });
  open.add(env);
  const card = env.createCard({ type: "custom:vacuum-orchestrator-card", ...config }, backend.hass);
  backend.onChange((next) => (card.hass = next));
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
    card.hass = { ...card.hass, ...patch };
    await settle(16);
    return card.hass;
  }

  // Plays the recording through a change in the home and lets the card follow.
  async function until(change) {
    backend.until(change);
    await settle(24);
  }

  // The list item matching `selector` that is shown under `name`.
  function named(selector, name) {
    const items = [...root.querySelectorAll(selector)];
    const node = items.find((item) => item.querySelector(NAMES)?.textContent.trim() === name);
    if (!node) throw new Error(`no ${selector} named ${name} among ${items.map((item) => item.querySelector(NAMES)?.textContent.trim())}`);
    return node;
  }

  const sent = (type) => backend.calls.filter((message) => message.type === type);

  return {
    env,
    card,
    root,
    backend,
    // The card's clock, moved by `advance(ms)`.
    clock,
    until,
    get hass() {
      return card.hass;
    },
    click,
    press,
    type,
    updateHass,
    settle: (rounds = 16) => settle(rounds),
    text: (selector) => root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    all: (selector) => [...root.querySelectorAll(selector)],
    named,
    services: (name) => sent("call_service").filter((message) => message.service === name).map((message) => ({ service: message.service, data: message.service_data })),
    commands: (name) => sent("vacuum_orchestrator/configuration/command").filter((message) => message.command === name),
    queries: (name) => sent("vacuum_orchestrator/configuration/get").filter((message) => message.query === name),
    // A request the recording does not hold fails the test, even where the card caught it.
    unmount() {
      close(env);
      if (backend.failures.length) throw backend.failures[0];
    },
  };
}

module.exports = { mountCard, settle };

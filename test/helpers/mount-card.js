"use strict";
// Mounts the built card in jsdom against the fake integration for a named household, in Home
// Assistant's call order, and gives a test the interactions it needs. The card's clock and the
// fake's clock both read FIXED_NOW, so relative times are stable.

const { createTestEnvironment, settle } = require("./load-card.jsdom.js");
const { createFakeOrchestrator, VirtualClock } = require("./fake-orchestrator.js");
const { FIXED_NOW, SCENARIOS, hassFor } = require("../fixtures/scenarios.js");

// `fake`: options for the fake integration (installed, setUp, runtimeLoaded, apiVersion).
async function mountCard({ env = createTestEnvironment({ now: FIXED_NOW }), scenario = "typical", config = {}, language = "en", admin = true, fake: fakeOptions = {}, attach = true } = {}) {
  const household = SCENARIOS[scenario]();
  const clock = new VirtualClock(FIXED_NOW);
  const fake = createFakeOrchestrator({ seed: household.seed, clock, admin, ...fakeOptions });
  const base = hassFor(household, { language, admin });
  const hass = attach ? fake.attachTo(base) : base;
  const card = env.createCard({ type: "custom:vacuum-orchestrator-card", ...config }, hass);
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
    card.hass = attach ? fake.attachTo(next) : next;
    await settle(16);
    return card.hass;
  }

  return {
    env,
    card,
    root,
    fake,
    hass,
    click,
    press,
    type,
    updateHass,
    settle: (rounds = 16) => settle(rounds),
    text: (selector) => root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    all: (selector) => [...root.querySelectorAll(selector)],
    services: (name) => fake.calls.services.filter((call) => call.service === name),
    commands: (name) => fake.calls.ws.filter((message) => message.type === "vacuum_orchestrator/configuration/command" && message.command === name),
    queries: (name) => fake.calls.ws.filter((message) => message.type === "vacuum_orchestrator/configuration/get" && message.query === name),
    unmount: () => env.cleanup(card),
  };
}

module.exports = { mountCard, settle, FIXED_NOW };

"use strict";
// Loads the built bundle into a fresh jsdom realm, the way Home Assistant loads a dashboard
// resource, and creates cards in Home Assistant's own call order.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const CARD_TAG = "vacuum-orchestrator-card";
const CARD_SOURCE_PATH = path.join(__dirname, "..", "..", "dist", "vacuum-orchestrator-card.js");
const CARD_SOURCE = fs.existsSync(CARD_SOURCE_PATH) ? fs.readFileSync(CARD_SOURCE_PATH, "utf8") : null;

function createTestEnvironment() {
  if (!CARD_SOURCE) throw new Error(`Missing build artifact ${CARD_SOURCE_PATH}. Run npm run build first.`);
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.document.fonts = { ready: Promise.resolve() };
  vm.runInContext(CARD_SOURCE, dom.getInternalVMContext(), { filename: CARD_SOURCE_PATH });
  const live = new Set();
  // Home Assistant calls setConfig before it hands over hass; the harness does the same, so a
  // card that only works the other way round fails here.
  function createCard(config, hass) {
    const card = window.document.createElement(CARD_TAG);
    window.document.body.appendChild(card);
    live.add(card);
    if (config !== undefined) card.setConfig(config);
    if (hass !== undefined) card.hass = hass;
    return card;
  }
  function cleanup(card) { card?.remove?.(); live.delete(card); }
  return { window, document: window.document, createCard, cleanup, cleanupAll: () => [...live].forEach(cleanup), liveCardCount: () => live.size };
}

// Lets pending promise chains and zero-delay timers run before the test looks at the card.
async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

module.exports = { createTestEnvironment, settle, CARD_TAG, CARD_SOURCE_PATH };

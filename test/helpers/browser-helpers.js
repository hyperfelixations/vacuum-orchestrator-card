"use strict";
// Mounts the real card in a real browser on the production-faithful harness: the fake
// integration and a named household are loaded as page scripts, so a browser test exercises
// the whole shipped bundle against the integration's contract.

const { expect } = require("@playwright/test");
const { FIXED_NOW } = require("../fixtures/scenarios.js");

const MOUNT_WIDTH = 640;

// The card reads the clock through its platform adapter, so the page keeps a fixed one: the
// households are dated against it and a golden must not change with the day it is recorded. A
// recording sets `window.__vocNow` to its own time and moves it as it plays.
async function gotoHarness(page) {
  await page.addInitScript((fixed) => {
    const RealDate = Date;
    const now = () => window.__vocNow ?? fixed;
    function FixedDate(...args) {
      return args.length ? new RealDate(...args) : new RealDate(now());
    }
    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = now;
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
  }, FIXED_NOW);
  await page.goto("/test/fixtures/harness.html");
}

// options: recording, from, scenario, config, configs, count, width, language, admin, installed, setUp,
// runtimeLoaded, apiVersion, failNext, layout, rows (see test/fixtures/harness-mount.js). Resolves
// once every card has left the connecting phase and laid itself out.
async function mountCard(page, options = {}) {
  const width = options.width ?? MOUNT_WIDTH;
  await gotoHarness(page);
  await page.evaluate((mountOptions) => window.vocHarness.mount(mountOptions), { ...options, width });
  await expect
    .poll(() => page.evaluate(() => window.vocHarness.cards.every((card) => {
      const root = card.shadowRoot.querySelector(".voc-root");
      return root && root.querySelector('[data-phase="probing"]') === null && root.querySelector(".voc-loading") === null;
    })), { message: "the card never finished connecting" })
    .toBe(true);
  await waitForStableLayout(page, width);
  return page.locator("vacuum-orchestrator-card").first();
}

// Waits for the layout by observing it, never a duration: the requested width is reached, the
// font has settled, and every box keeps its size across two consecutive frames.
async function waitForStableLayout(page, widthPx = null) {
  await expect
    .poll(
      async () =>
        page.evaluate(async (widthPx) => {
          const cards = window.vocHarness?.cards || [];
          if (!cards.length || !cards.every((card) => card.shadowRoot)) return false;
          if (widthPx !== null && cards.some((card) => Math.round(card.getBoundingClientRect().width) !== widthPx)) return false;
          await document.fonts.ready;
          const read = () => cards.map((card) => Array.from(card.shadowRoot.querySelectorAll("*"), (node) => {
            const rect = node.getBoundingClientRect();
            return `${rect.width},${rect.height}`;
          }).join("|")).join("#");
          const before = read();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return read() === before;
        }, widthPx),
      { message: `the card never settled into a stable layout${widthPx === null ? "" : ` at ${widthPx}px`}` }
    )
    .toBe(true);
}

// The card sizes itself to its container, so the width belongs on the card, not the viewport.
async function setCardWidth(page, widthPx) {
  await page.evaluate((widthPx) => {
    for (const card of window.vocHarness.cards) card.style.width = `${widthPx}px`;
  }, widthPx);
  await waitForStableLayout(page, widthPx);
}

// Clicks through the card and waits until the result has settled.
async function act(page, locator) {
  await locator.click();
  await waitForStableLayout(page);
}

function serviceCalls(page, service) {
  return page.evaluate((name) => {
    const { backend, fake } = window.vocHarness;
    if (backend) return backend.calls.filter((message) => message.type === "call_service" && message.service === name).map((message) => message.service_data);
    return fake.calls.services.filter((call) => call.service === name).map((call) => call.data);
  }, service);
}

function commands(page, command) {
  return page.evaluate((name) => (window.vocHarness.backend?.calls ?? window.vocHarness.fake.calls.ws).filter((message) => message.command === name).map((message) => message.parameters), command);
}

module.exports = { mountCard, gotoHarness, waitForStableLayout, setCardWidth, act, serviceCalls, commands, FIXED_NOW, MOUNT_WIDTH };

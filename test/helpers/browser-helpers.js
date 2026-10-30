"use strict";
// Mounts the real card in a real browser on the production-faithful harness against a recording
// of the integration, so a browser test exercises the whole shipped bundle against what the real
// integration answered.

const path = require("node:path");
const { expect } = require("@playwright/test");

// The picture Home Assistant's image proxy serves for a robot's map entity.
const MAP_PICTURE = path.join(__dirname, "..", "fixtures", "map.svg");

const MOUNT_WIDTH = 640;

// Where the integration's everyday home is shown: Rocky cleans the studio, three jobs wait.
const BUSY = Object.freeze({ recording: "showcase", from: "A busy afternoon" });

// Where a job, room, robot or template shows its name.
const NAMES = ".voc-job-title, .voc-room-name, .voc-robot-name, .voc-template-name";
const exactly = (text) => new RegExp(`^${text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}$`);

// The list item matching `selector` shown under `name`, or `inner` inside it.
function named(card, selector, name, inner = null) {
  const item = card.locator(selector).filter({ has: card.page().locator(NAMES, { hasText: exactly(name) }) });
  return inner ? item.locator(inner) : item;
}

// The steps that open an element's menu and choose `item` in it (UI-32): its menu button, then
// the item; each a locator to click, as `act` takes them.
function fromMenu(card, selector, name, item) {
  return [named(card, selector, name, ".voc-menu-button"), named(card, selector, name, `[role="menu"] ${item}`)];
}

// The card reads the clocks through its platform adapter, so the page reads the recording's
// time: the recording sets `window.__vocNow` and moves it as it plays, and a golden does not
// change with the day it is recorded.
async function gotoHarness(page) {
  await page.addInitScript(() => {
    const RealDate = Date;
    const now = () => window.__vocNow ?? RealDate.now();
    function FixedDate(...args) {
      return args.length ? new RealDate(...args) : new RealDate(now());
    }
    FixedDate.prototype = RealDate.prototype;
    FixedDate.now = now;
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    window.Date = FixedDate;
    performance.now = now;
  });
  await page.route("**/api/image_proxy/**", (route) => route.fulfill({ path: MAP_PICTURE, contentType: "image/svg+xml" }));
  await page.goto("/test/fixtures/harness.html");
}

// options: recording, from, config, configs, count, width, language, admin, failNext, themes,
// layout, rows (see test/fixtures/harness-mount.js). Resolves
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
  return page.evaluate((name) => window.vocHarness.backend.calls.filter((message) => message.type === "call_service" && message.service === name).map((message) => message.service_data), service);
}

function commands(page, command) {
  return page.evaluate((name) => window.vocHarness.backend.calls.filter((message) => message.command === name).map((message) => message.parameters), command);
}

module.exports = { BUSY, named, fromMenu, mountCard, gotoHarness, waitForStableLayout, setCardWidth, act, serviceCalls, commands, MOUNT_WIDTH };

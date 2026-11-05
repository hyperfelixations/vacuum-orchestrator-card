// What a render costs (UI-31): Home Assistant hands the card a new hass on every state change of
// the whole instance, so a change the card does not show must not render it; and a render that
// changes nothing must not make the browser lay out the page, with any pointer and on every view.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, waitForStableLayout } = require("../../helpers/browser-helpers.js");

// Counts model builds while Home Assistant reports `changes` states of an entity no view shows.
async function buildsForUnrelatedStates(page, changes) {
  return page.evaluate(async (count) => {
    const card = window.vocHarness.cards[0];
    let builds = 0;
    const build = card._computeModel.bind(card);
    card._computeModel = () => {
      builds += 1;
      return build();
    };
    for (let index = 0; index < count; index += 1) {
      const hass = window.vocHarness.hass;
      const states = { ...hass.states, "sensor.outdoor_temperature": { entity_id: "sensor.outdoor_temperature", state: String(index), attributes: {} } };
      window.vocHarness.hass = { ...hass, states };
      card.hass = window.vocHarness.hass;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    card._computeModel = build;
    return builds;
  }, changes);
}

// How often the browser lays out the page while the card renders `renders` times unchanged.
async function layoutsWhileRendering(page, renders) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const layouts = async () => (await cdp.send("Performance.getMetrics")).metrics.find((metric) => metric.name === "LayoutCount").value;
  const before = await layouts();
  await page.evaluate((count) => {
    const card = window.vocHarness.cards[0];
    for (let index = 0; index < count; index += 1) {
      card._renderer.invalidate();
      card._renderSafely();
    }
  }, renders);
  return (await layouts()) - before;
}

test("a state the card does not show renders nothing", async ({ page }) => {
  await mountCard(page, { ...BUSY, width: 380 });
  expect(await buildsForUnrelatedStates(page, 20)).toBe(0);
});

test("a state the card shows renders it again", async ({ page }) => {
  await mountCard(page, { ...BUSY, width: 380 });
  const builds = await page.evaluate(async () => {
    const card = window.vocHarness.cards[0];
    let count = 0;
    const build = card._computeModel.bind(card);
    card._computeModel = () => {
      count += 1;
      return build();
    };
    const hass = window.vocHarness.hass;
    const vacuum = Object.keys(hass.states).find((entityId) => entityId.startsWith("vacuum."));
    const states = { ...hass.states, [vacuum]: { ...hass.states[vacuum], state: "returning" } };
    card.hass = { ...hass, states };
    await new Promise((resolve) => setTimeout(resolve, 0));
    card._computeModel = build;
    return count;
  });
  expect(builds).toBeGreaterThan(0);
});

// The runtime controllers keep their attributes across a render, so an unchanged render leaves
// nothing to lay out, whatever the pointer and width.
for (const touch of [false, true]) {
  test.describe(touch ? "with touch" : "with a mouse", () => {
    test.use({ hasTouch: touch });

    for (const width of [380, 640, 1000]) {
      test(`an unchanged render at ${width} px lays out nothing`, async ({ page }) => {
        await mountCard(page, { ...BUSY, width });
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(touch);
        expect(await layoutsWhileRendering(page, 10)).toBe(0);
      });
    }

    for (const view of ["rooms", "robots", "history", "settings"]) {
      test(`an unchanged render of ${view} lays out nothing`, async ({ page }) => {
        const card = await mountCard(page, { ...BUSY, width: 380 });
        await card.locator(`[role="tab"][data-view="${view}"]`).click();
        await waitForStableLayout(page, 380);
        // The first render after the switch may place a map whose picture just loaded.
        await layoutsWhileRendering(page, 1);
        expect(await layoutsWhileRendering(page, 10)).toBe(0);
      });
    }
  });
}

// UI-35: a chosen tab is painted in the next frame around the view still shown, which takes no
// tap meanwhile; the chosen view follows once that frame is painted.
test("a chosen tab is painted at once and its view right after", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, width: 380 });
  await page.evaluate(() => {
    // What the browser paints in the frame after the tap, read just before it paints.
    const root = window.vocHarness.cards[0].shadowRoot;
    root.addEventListener("click", () => requestAnimationFrame(() => {
      const body = root.querySelector("#voc-panel");
      window.__vocFirstFrame = { tab: root.querySelector('[role="tab"][aria-selected="true"]').dataset.view, body: body.dataset.body, stale: body.hasAttribute("data-stale"), taps: getComputedStyle(body).pointerEvents };
    }), { once: true });
  });
  await card.locator('[role="tab"][data-view="rooms"]').click();
  await page.evaluate(() => window.vocHarness.cards[0].updateComplete);
  expect(await page.evaluate(() => window.__vocFirstFrame)).toEqual({ tab: "rooms", body: "view:queue", stale: true, taps: "none" });
  await expect(card.locator("#voc-panel")).toHaveAttribute("data-body", "view:rooms");
  await expect(card.locator("#voc-panel")).not.toHaveAttribute("data-stale");
  await expect(card.locator('[role="tab"][data-view="rooms"]')).toBeFocused();
});

// UI-31: a render whose markup equals what is shown parses and changes nothing.
test("a render with nothing new changes no node", async ({ page }) => {
  await mountCard(page, { ...BUSY, width: 380 });
  const mutations = await page.evaluate(async () => {
    const card = window.vocHarness.cards[0];
    const seen = [];
    const observer = new MutationObserver((records) => seen.push(...records));
    observer.observe(card.shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true });
    card._renderer.invalidate();
    card._renderSafely();
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    observer.disconnect();
    return seen.length;
  });
  expect(mutations).toBe(0);
});

// UI-35: read ahead while the card was idle, the history's first painted view holds its rows.
test("the history read ahead shows its rows in its first view", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, width: 380 });
  expect(await page.evaluate(() => window.__vocIdle.flush())).toBe(1);
  await waitForStableLayout(page, 380);
  await page.evaluate(() => {
    const root = window.vocHarness.cards[0].shadowRoot;
    const observer = new MutationObserver(() => {
      const body = root.querySelector('#voc-panel[data-body="view:history"]:not([data-stale])');
      if (!body) return;
      window.__vocHistory = { rows: body.querySelectorAll(".voc-job").length, loading: Boolean(body.querySelector(".voc-loading")) };
      observer.disconnect();
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true });
  });
  await card.locator('[role="tab"][data-view="history"]').click();
  await page.evaluate(() => window.vocHarness.cards[0].updateComplete);
  expect(await page.evaluate(() => window.__vocHistory)).toEqual({ rows: 3, loading: false });
});

// A list page another view corrects leaves the view on screen where it stands.
test("a page change of another view keeps the view's scroll position", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, width: 380, layout: "grid", rows: 7 });
  await card.locator('[role="tab"][data-view="rooms"]').click();
  await waitForStableLayout(page, 380);
  const scrolled = await page.evaluate(async () => {
    const card = window.vocHarness.cards[0];
    const body = card.shadowRoot.querySelector("#voc-panel");
    body.scrollTop = body.scrollHeight;
    const position = body.scrollTop;
    // The history's runs, a list the rooms view does not show.
    card._ui.setPage("runs", 25);
    await card.updateComplete;
    return [position, body.scrollTop];
  });
  expect(scrolled[0]).toBeGreaterThan(0);
  expect(scrolled[1]).toBe(scrolled[0]);
});

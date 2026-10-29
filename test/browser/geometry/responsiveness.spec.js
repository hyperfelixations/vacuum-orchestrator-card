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

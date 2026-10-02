// Geometry in the Home Assistant-like harness: the host font and elements, the size container,
// no horizontal overflow in any view at any width, cards side by side, and the card shadow the
// card shares with the Room Climate Card in both colour schemes.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

const VIEWS = ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"];

test("Roboto, Home Assistant's elements and the size container are active", async ({ page }) => {
  const card = await mountCard(page);
  const host = await card.evaluate(async (element) => {
    await document.fonts.ready;
    const haCard = element.shadowRoot.querySelector("ha-card");
    return {
      font: getComputedStyle(element).fontFamily,
      fontReady: document.fonts.check('400 14px "Roboto"'),
      haCard: Boolean(customElements.get("ha-card")),
      haIcon: Boolean(customElements.get("ha-icon")),
      display: getComputedStyle(haCard).display,
      container: getComputedStyle(haCard).containerName,
    };
  });
  expect(host).toEqual({ font: expect.stringContaining("Roboto"), fontReady: true, haCard: true, haIcon: true, display: "block", container: "voc-card" });
});

test("no view overflows horizontally at narrow, medium and wide widths", async ({ page }) => {
  const card = await mountCard(page, { config: { views: VIEWS } });
  for (const view of VIEWS) {
    await card.locator(`[role=tab][data-view="${view}"]`).click();
    for (const width of [320, 380, 640, 900]) {
      await setCardWidth(page, width);
      const geometry = await card.evaluate((element) => {
        const root = element.shadowRoot.querySelector(".voc-root");
        return { client: root.clientWidth, scroll: root.scrollWidth };
      });
      expect(geometry.scroll, `${view} at ${width}px`).toBeLessThanOrEqual(geometry.client + 1);
    }
  }
});

test("two cards side by side keep their own width and share one subscription", async ({ page }) => {
  await mountCard(page, { width: 420, configs: [{ views: ["queue", "rooms"] }, { views: ["robots", "history"], start_view: "history" }] });
  const widths = await page.evaluate(() => window.vocHarness.cards.map((card) => Math.round(card.getBoundingClientRect().width)));
  expect(widths).toEqual([420, 420]);
  expect(await page.evaluate(() => window.vocHarness.fake.subscriberCount())).toBe(1);
});

// RCC's card shadow is a dark, neutral 18 % black in both schemes; a shadow derived from the text
// colour turns into a light glow on dark themes.
for (const colorScheme of ["light", "dark"]) {
  test(`the card shadow matches the Room Climate Card in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const card = await mountCard(page);
    const shadow = await card.evaluate((element) => getComputedStyle(element.shadowRoot.querySelector("ha-card")).boxShadow);
    expect(shadow).toBe("rgba(0, 0, 0, 0.18) 0px 8px 26px 0px");
  });
}

// A link styled as a button (the installation guide) is exactly as tall as a real button.
test("a link button and a real button share one height", async ({ page }) => {
  const card = await mountCard(page, { installed: false, setUp: false });
  const link = await card.locator("a.voc-button").boundingBox();
  await page.evaluate(() => window.vocHarness.mount({ width: 640 }));
  const button = await page.locator("vacuum-orchestrator-card").first().locator(".voc-primary-action").boundingBox();
  expect(Math.round(link.height)).toBe(Math.round(button.height));
});

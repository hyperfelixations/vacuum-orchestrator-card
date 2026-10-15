// Geometry in the Home Assistant-like harness: the host font and elements, the size container,
// no horizontal overflow in any view at any width, cards side by side, and the card shadow the
// card shares with the Room Climate Card in both colour schemes.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named, setCardWidth } = require("../../helpers/browser-helpers.js");

const VIEWS = ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"];

// Without a frame the card's own rules leave `ha-card` as its shadow root lays it out.
test("Roboto, Home Assistant's elements and the size container are active", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, rows: "auto" });
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
  const card = await mountCard(page, { ...BUSY, config: { views: VIEWS } });
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

// UI-11: an icon is as large as its `--mdc-icon-size`, and in a row that centres its items the
// icon's middle is the middle of the text beside it, within half a pixel.
test("icons have their set size and stand centred on the text beside them in every view", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, config: { views: VIEWS } });
  let measured = 0;
  for (const view of VIEWS) {
    await card.locator(`[role=tab][data-view="${view}"]`).click();
    const icons = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll("ha-icon")].filter((icon) => icon.getClientRects().length).map((icon) => {
      const box = icon.getBoundingClientRect();
      const size = parseFloat(getComputedStyle(icon).getPropertyValue("--mdc-icon-size")) || 24;
      const row = getComputedStyle(icon.parentElement);
      const centred = row.display.endsWith("flex") && row.flexDirection === "row" && row.alignItems === "center";
      const text = [icon.previousElementSibling, icon.nextElementSibling].find((node) => node && node.tagName === "SPAN" && node.textContent.trim() && node.getClientRects().length);
      const line = text?.getBoundingClientRect();
      return { name: `${icon.parentElement.className} ${icon.getAttribute("icon")}`, size, width: box.width, height: box.height, offset: centred && line ? box.top + box.height / 2 - (line.top + line.height / 2) : 0 };
    }));
    for (const icon of icons) {
      expect(Math.abs(icon.width - icon.size), `${view}: width of ${icon.name}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(icon.height - icon.size), `${view}: height of ${icon.name}`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(icon.offset), `${view}: ${icon.name} centred on its text`).toBeLessThanOrEqual(0.5);
    }
    measured += icons.length;
  }
  expect(measured).toBeGreaterThan(40);
});

test("two cards side by side keep their own width and share one subscription", async ({ page }) => {
  await mountCard(page, { ...BUSY, width: 420, configs: [{ views: ["queue", "rooms"] }, { views: ["robots", "history"], start_view: "history" }] });
  const widths = await page.evaluate(() => window.vocHarness.cards.map((card) => Math.round(card.getBoundingClientRect().width)));
  expect(widths).toEqual([420, 420]);
  expect(await page.evaluate(() => window.vocHarness.backend.calls.filter((message) => message.type === "vacuum_orchestrator/subscribe").length)).toBe(1);
});

// RCC's card shadow is a dark, neutral 18 % black in both schemes; a shadow derived from the text
// colour turns into a light glow on dark themes.
for (const colorScheme of ["light", "dark"]) {
  test(`the card shadow matches the Room Climate Card in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const card = await mountCard(page, BUSY);
    const shadow = await card.evaluate((element) => getComputedStyle(element.shadowRoot.querySelector("ha-card")).boxShadow);
    expect(shadow).toBe("rgba(0, 0, 0, 0.18) 0px 8px 26px 0px");
  });
}

// A link styled as a button (the onboarding links) is exactly as tall as a real button.
test("a link button and a real button share one height", async ({ page }) => {
  const card = await mountCard(page, { recording: "not_installed" });
  const link = await card.locator("a.voc-button").first().boundingBox();
  await page.evaluate((place) => window.vocHarness.mount({ ...place, width: 640 }), BUSY);
  const button = await page.locator("vacuum-orchestrator-card").first().locator(".voc-primary-action").boundingBox();
  expect(Math.round(link.height)).toBe(Math.round(button.height));
});

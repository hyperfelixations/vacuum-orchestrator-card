// The shipped card inherits the host font and theme and retains its responsive container.
// Measurements use the same Home Assistant-like harness as the visual goldens.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

test("Roboto, HA elements and the size container are active", async ({ page }) => {
  const card = await mountCard(page);
  const host = await card.evaluate(async (element) => {
    await document.fonts.ready;
    const haCard = element.shadowRoot.querySelector("ha-card");
    return {
      font: getComputedStyle(element).fontFamily,
      fontReady: document.fonts.check('400 14px "Roboto"'),
      haCardRegistered: Boolean(customElements.get("ha-card")),
      iconRegistered: Boolean(customElements.get("ha-icon")),
      display: getComputedStyle(haCard).display,
      container: getComputedStyle(haCard).containerName,
    };
  });
  expect(host.font).toContain("Roboto");
  expect(host.fontReady).toBe(true);
  expect(host.haCardRegistered).toBe(true);
  expect(host.iconRegistered).toBe(true);
  expect(host.display).toBe("block");
  expect(host.container).toBe("voc-card");
});

test("queue has no horizontal overflow at narrow, medium and wide widths", async ({ page }) => {
  const card = await mountCard(page);
  for (const width of [320, 380, 640, 900]) {
    await setCardWidth(page, width);
    const geometry = await card.evaluate((element) => {
      const root = element.shadowRoot.querySelector(".voc-root");
      return { client: root.clientWidth, scroll: root.scrollWidth, actual: Math.round(element.getBoundingClientRect().width) };
    });
    expect(geometry.actual).toBe(width);
    expect(geometry.scroll, `${width}px: ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(geometry.client + 1);
  }
});

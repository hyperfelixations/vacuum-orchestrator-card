// Geometry inside the frame: header, panel and tabs keep their place while the body scrolls, the
// first and last content can be reached, content lines up with the header, page actions stand at
// one place, a region shown again stands where the user left it, and a card dialog stands compact
// on the unchanged card, scrolling only its own content when the card is too short.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, act, mountCard, named } = require("../../helpers/browser-helpers.js");

// Boxes in card coordinates and the scroll state of a region.
const boxes = (card, selectors) => card.evaluate((element, selectors) => Object.fromEntries(selectors.map((selector) => {
  const rect = element.shadowRoot.querySelector(selector).getBoundingClientRect();
  return [selector, { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }];
})), selectors);

const scrollTop = (card, selector) => card.evaluate((element, selector) => element.shadowRoot.querySelector(selector).scrollTop, selector);

async function scrollTo(card, selector, share) {
  await card.evaluate((element, [selector, share]) => {
    const region = element.shadowRoot.querySelector(selector);
    region.scrollTop = share * (region.scrollHeight - region.clientHeight);
  }, [selector, share]);
  await expect(card.locator(selector)).toHaveAttribute(share === 0 ? "data-overflow-bottom" : "data-overflow-top", "");
}

test("header, panel and tabs keep their place while the body scrolls to its first and last content", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid", width: 380 });
  const fixed = [".voc-header", ".voc-panel", ".voc-tab-row"];
  const before = await boxes(card, fixed);
  await scrollTo(card, ".voc-body", 1);
  expect(await boxes(card, fixed)).toEqual(before);
  const end = await card.evaluate((element) => {
    const body = element.shadowRoot.querySelector(".voc-body");
    const last = body.lastElementChild.getBoundingClientRect();
    return { last: last.bottom, body: body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom) };
  });
  expect(end.last, "the last content is fully reachable").toBeLessThanOrEqual(end.body + 0.5);
  await scrollTo(card, ".voc-body", 0);
  const start = await boxes(card, [".voc-tab-row", ".voc-body > *"]);
  expect(start[".voc-body > *"].top, "the first content starts below the tabs").toBeGreaterThan(start[".voc-tab-row"].bottom);
});

test("content lines up with the header and the scrollbar sits at the card's edge", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid", width: 640 });
  const at = await boxes(card, ["ha-card", ".voc-header", ".voc-body", ".voc-body > *"]);
  expect(at[".voc-body > *"].left).toBeCloseTo(at[".voc-header"].left, 0);
  expect(at[".voc-body > *"].right).toBeCloseTo(at[".voc-header"].right, 0);
  expect(at[".voc-body"].right, "the region reaches the card's edge").toBeGreaterThanOrEqual(at["ha-card"].right - 1.5);
  expect(at[".voc-body"].bottom).toBeGreaterThanOrEqual(at["ha-card"].bottom - 1.5);
});

test("a page's actions stand at one place, short or long, and a hairline does not move them", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid" });
  await act(page, card.locator('[role=tab][data-view="settings"]'));
  await act(page, card.locator('[data-action="open-job-defaults"]'));
  await expect(card.locator(".voc-overlay-scroll")).not.toHaveAttribute("data-overflow-bottom", "");
  const actions = ".voc-overlay-actions .voc-button:last-child";
  const short = (await boxes(card, [actions]))[actions];
  await act(page, card.locator(".voc-back"));
  await act(page, card.locator('[role=tab][data-view="queue"]'));
  await act(page, card.locator(".voc-primary-action"));
  await expect(card.locator(".voc-overlay-scroll")).toHaveAttribute("data-overflow-bottom", "");
  const long = (await boxes(card, [actions]))[actions];
  expect(long.bottom).toBeCloseTo(short.bottom, 0);
  const lined = await card.locator(".voc-overlay-actions").evaluate((node) => getComputedStyle(node).borderTopWidth);
  expect(lined).toBe("1px");
  await scrollTo(card, ".voc-overlay-scroll", 1);
  await expect(card.locator(".voc-overlay-scroll")).not.toHaveAttribute("data-overflow-bottom", "");
  const plain = (await boxes(card, [actions]))[actions];
  expect(plain).toEqual(long);
  expect(await card.locator(".voc-overlay-actions").evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px");
});

test("a page closed returns the view where it was; another tab starts at the top", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid", rows: 7 });
  // Scrolled down, with the row to open in full view, so the click itself scrolls nothing.
  await scrollTo(card, ".voc-body", 1);
  const row = named(card, ".voc-job", "Conservatory", ".voc-job-main");
  await row.evaluate((node) => node.scrollIntoView({ block: "nearest" }));
  const left = await scrollTop(card, ".voc-body");
  expect(left).toBeGreaterThan(0);
  await act(page, row);
  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "overlay");
  await act(page, card.locator(".voc-back"));
  expect(await scrollTop(card, ".voc-body")).toBe(left);
  await act(page, card.locator('[role=tab][data-view="rooms"]'));
  expect(await scrollTop(card, ".voc-body")).toBe(0);
});

// LAY-05, LAY-06, LAY-14: centred, at most 440 px wide, the actions right below the content, the
// card's height unchanged; the view below keeps its scroll position through the dialog and through
// an update from Home Assistant.
test("a card dialog stands compact and centred on the unchanged card, and the view below keeps its place", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid", rows: 7, width: 900 });
  const height = (await boxes(card, ["ha-card"]))["ha-card"];
  await scrollTo(card, ".voc-body", 1);
  const left = await scrollTop(card, ".voc-body");
  expect(left).toBeGreaterThan(0);
  // The queue control sits in the panel above the body, so opening scrolls nothing.
  await act(page, card.locator(".voc-queue-end"));
  await expect(card.locator(".voc-root")).toHaveAttribute("data-dialog", "queue-end");
  const at = await boxes(card, ["ha-card", ".voc-dialog", ".voc-dialog-scroll", ".voc-dialog-actions"]);
  expect(at["ha-card"]).toEqual(height);
  expect(at[".voc-dialog"].right - at[".voc-dialog"].left, "at most 440 px wide").toBeLessThanOrEqual(440);
  expect(Math.abs(at[".voc-dialog"].left - at["ha-card"].left - (at["ha-card"].right - at[".voc-dialog"].right)), "centred across").toBeLessThanOrEqual(1);
  expect(Math.abs(at[".voc-dialog"].top - at["ha-card"].top - (at["ha-card"].bottom - at[".voc-dialog"].bottom)), "centred down").toBeLessThanOrEqual(1);
  expect(at[".voc-dialog-actions"].top - at[".voc-dialog-scroll"].bottom, "the actions right below the content").toBeLessThanOrEqual(24);
  await expect(card.locator(".voc-dialog-scroll")).not.toHaveAttribute("data-overflow-bottom", "");
  await page.evaluate(() => {
    const { hass, cards } = window.vocHarness;
    const battery = hass.states["sensor.rocky_battery"];
    const next = { ...hass, states: { ...hass.states, "sensor.rocky_battery": { ...battery, state: "80" } } };
    for (const each of cards) each.hass = next;
  });
  await expect(card.locator(".voc-panel-robot").first()).toContainText("80 %");
  expect(await scrollTop(card, ".voc-body"), "the view below keeps its place through an update").toBe(left);
  await page.keyboard.press("Escape");
  await expect(card.locator(".voc-dialog")).toHaveCount(0);
  expect(await scrollTop(card, ".voc-body"), "and after the dialog").toBe(left);
});

test("in a card too short for a dialog only its content scrolls; heading and actions stay in view", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, layout: "grid", rows: 4, width: 380 });
  const height = (await boxes(card, ["ha-card"]))["ha-card"];
  await act(page, card.locator(".voc-queue-end"));
  await expect(card.locator(".voc-dialog-scroll")).toHaveAttribute("data-overflow-bottom", "");
  const at = await boxes(card, ["ha-card", ".voc-dialog-title", ".voc-dialog-actions"]);
  expect(at["ha-card"]).toEqual(height);
  expect(at[".voc-dialog-title"].top).toBeGreaterThanOrEqual(at["ha-card"].top);
  expect(at[".voc-dialog-actions"].bottom).toBeLessThanOrEqual(at["ha-card"].bottom);
  await scrollTo(card, ".voc-dialog-scroll", 1);
  await expect(card.locator(".voc-dialog-scroll")).not.toHaveAttribute("data-overflow-bottom", "");
  expect((await boxes(card, [".voc-dialog-actions"]))[".voc-dialog-actions"].bottom).toBeLessThanOrEqual(at["ha-card"].bottom);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("targets keep their size inside the frame", async ({ page }) => {
    const sizes = async (layout) => {
      const card = await mountCard(page, { ...BUSY, layout, width: 380 });
      return card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }));
    };
    const free = await sizes(undefined);
    expect(await sizes("grid")).toEqual(free);
  });
});

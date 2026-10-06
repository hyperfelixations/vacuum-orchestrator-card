// Geometry inside the frame: header, panel and tabs keep their place while the body scrolls, the
// first and last content can be reached, content lines up with the header, overlay actions stand
// at one place, and a region shown again stands where the user left it.

const { test, expect } = require("../../helpers/playwright.js");
const { act, mountCard } = require("../../helpers/browser-helpers.js");

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
  const card = await mountCard(page, { layout: "grid", width: 380 });
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
  const card = await mountCard(page, { layout: "grid", width: 640 });
  const at = await boxes(card, ["ha-card", ".voc-header", ".voc-body", ".voc-body > *"]);
  expect(at[".voc-body > *"].left).toBeCloseTo(at[".voc-header"].left, 0);
  expect(at[".voc-body > *"].right).toBeCloseTo(at[".voc-header"].right, 0);
  expect(at[".voc-body"].right, "the region reaches the card's edge").toBeGreaterThanOrEqual(at["ha-card"].right - 1.5);
  expect(at[".voc-body"].bottom).toBeGreaterThanOrEqual(at["ha-card"].bottom - 1.5);
});

test("an overlay's actions stand at one place, short or long, and a hairline does not move them", async ({ page }) => {
  const card = await mountCard(page, { layout: "grid" });
  await act(page, card.locator('[data-key="job:job-running"] [data-action="cancel-job"]'));
  const actions = ".voc-overlay-actions .voc-button:last-child";
  const short = (await boxes(card, [actions]))[actions];
  await act(page, card.locator(".voc-back"));
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
  const card = await mountCard(page, { layout: "grid", rows: 7 });
  await scrollTo(card, ".voc-body", 1);
  const left = await scrollTop(card, ".voc-body");
  expect(left).toBeGreaterThan(0);
  await act(page, card.locator('[data-key="job:job-bedroom"] .voc-job-main'));
  await expect(card.locator(".voc-root")).toHaveAttribute("data-state", "overlay");
  await act(page, card.locator(".voc-back"));
  expect(await scrollTop(card, ".voc-body")).toBe(left);
  await act(page, card.locator('[role=tab][data-view="rooms"]'));
  expect(await scrollTop(card, ".voc-body")).toBe(0);
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("targets keep their size inside the frame", async ({ page }) => {
    const sizes = async (layout) => {
      const card = await mountCard(page, { layout, width: 380 });
      return card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }));
    };
    const free = await sizes(undefined);
    expect(await sizes("grid")).toEqual(free);
  });
});

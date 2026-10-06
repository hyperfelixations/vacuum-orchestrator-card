// Target sizes, spacing and positions of row and card actions: inline with room between them on
// wider cards, equal tiles across the row on narrow cards, a single action beside the title, the
// run action always in the trailing slot, room actions on one line across a card row, and 44 px
// targets 8 px apart under a coarse pointer.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard, setCardWidth } = require("../../helpers/browser-helpers.js");

// Boxes of the row, its main button and its action buttons in card coordinates.
async function rowGeometry(card, jobId) {
  return card.evaluate((element, key) => {
    const row = element.shadowRoot.querySelector(`[data-key="job:${key}"]`);
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return { row: box(row), main: box(row.querySelector(".voc-job-main")), actions: [...row.querySelectorAll(".voc-job-actions .voc-button")].map(box) };
  }, jobId);
}

const gaps = (boxes) => boxes.slice(1).map((box, index) => box.left - boxes[index].right);

test.describe("with a mouse", () => {
  test("wide rows keep their actions inline, 36 px each and set apart", async ({ page }) => {
    const card = await mountCard(page, { width: 900 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
    const { main, actions } = await rowGeometry(card, "job-kitchen");
    expect(actions).toHaveLength(4);
    for (const action of actions) {
      expect(action.width).toBeGreaterThanOrEqual(36);
      expect(action.height).toBeGreaterThanOrEqual(36);
      expect(action.top).toBeLessThan(main.bottom);
    }
    const between = gaps(actions);
    expect(Math.min(...between)).toBeGreaterThanOrEqual(4);
    expect(between.at(-1), "the run action is set apart").toBeGreaterThan(between[0]);
  });

  // Start and stop share one place: the trailing action of a waiting row lines up with the
  // cancel button of the running row, on wide and on narrow cards.
  for (const width of [900, 380]) {
    test(`start and cancel share the trailing slot at ${width} px`, async ({ page }) => {
      const card = await mountCard(page, { width });
      const start = card.locator('[data-key="job:job-kitchen"] .voc-job-actions .voc-button').last();
      await expect(start).toHaveAttribute("data-action", "start-job");
      const cancel = card.locator('[data-key="job:job-running"] .voc-job-actions .voc-button').last();
      await expect(cancel).toHaveAttribute("data-action", "cancel-job");
      const [a, b] = [await start.boundingBox(), await cancel.boundingBox()];
      expect(Math.abs((a.x + a.width) - (b.x + b.width))).toBeLessThanOrEqual(1);
    });
  }

  test("narrow rows spread several actions over the row and keep a single one beside the title", async ({ page }) => {
    const card = await mountCard(page, { width: 380 });
    const waiting = await rowGeometry(card, "job-kitchen");
    expect(waiting.actions).toHaveLength(4);
    const span = waiting.actions.at(-1).right - waiting.actions[0].left;
    expect(span / waiting.row.width).toBeGreaterThan(0.9);
    for (const action of waiting.actions) {
      expect(action.height).toBeGreaterThanOrEqual(40);
      expect(action.top).toBeGreaterThanOrEqual(waiting.main.bottom - 1);
    }
    expect(Math.min(...gaps(waiting.actions))).toBeGreaterThanOrEqual(8);
    const widths = waiting.actions.map((action) => action.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const running = await rowGeometry(card, "job-running");
    expect(running.actions).toHaveLength(1);
    expect(running.actions[0].top).toBeLessThan(running.main.bottom);
    expect(running.actions[0].width).toBeGreaterThanOrEqual(40);
  });

  // Release and lock toggle in one place: cards side by side put their action rows on one line.
  test("room cards side by side keep their actions on one line", async ({ page }) => {
    const card = await mountCard(page, { width: 680, config: { start_view: "rooms" } });
    const bottoms = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-room")].map((room) => ({
      top: room.getBoundingClientRect().top,
      toggle: room.querySelector(".voc-room-toggle").getBoundingClientRect().bottom,
    })));
    const rows = Map.groupBy(bottoms, (room) => Math.round(room.top));
    expect([...rows.values()].some((row) => row.length > 1)).toBe(true);
    for (const row of rows.values()) {
      expect(Math.max(...row.map((room) => room.toggle)) - Math.min(...row.map((room) => room.toggle))).toBeLessThanOrEqual(1);
    }
  });

  // The bar belongs to the narrow tier: it switches exactly where the primary action drops its
  // label. A single view has no tab strip, so only the tier can hide that label.
  test("the bar switches with the narrow tier", async ({ page }) => {
    const card = await mountCard(page, { width: 600, config: { views: ["queue"] } });
    const seen = new Set();
    for (const width of [600, 563, 562, 561, 560, 559, 520]) {
      await setCardWidth(page, width);
      const { main, actions } = await rowGeometry(card, "job-kitchen");
      const bar = actions[0].top >= main.bottom - 1;
      const narrowTier = await card.locator(".voc-primary-action .voc-button-label").evaluate((node) => node.getBoundingClientRect().width <= 1);
      expect(bar, `at ${width}px`).toBe(narrowTier);
      seen.add(bar);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

test.describe("with touch", () => {
  test.use({ hasTouch: true });

  test("every action and control is at least 44 px", async ({ page }) => {
    const card = await mountCard(page, { width: 380 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the engine emulates a coarse pointer").toBe(true);
    for (const jobId of ["job-kitchen", "job-running"]) {
      const { actions } = await rowGeometry(card, jobId);
      for (const action of actions) {
        expect(action.width, jobId).toBeGreaterThanOrEqual(44);
        expect(action.height, jobId).toBeGreaterThanOrEqual(44);
      }
      if (actions.length > 1) expect(Math.min(...gaps(actions)), jobId).toBeGreaterThanOrEqual(8);
    }
    const shell = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-tab, .voc-primary-action, .voc-queue-control, .voc-queue-end")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { name: node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent.trim(), width: rect.width, height: rect.height };
    }));
    expect(shell.length).toBeGreaterThan(6);
    for (const control of shell) {
      expect(control.width, control.name).toBeGreaterThanOrEqual(44);
      expect(control.height, control.name).toBeGreaterThanOrEqual(40);
    }
  });
});

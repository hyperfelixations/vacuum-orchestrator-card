// Target sizes, spacing and positions of row and card actions: inline with room between them on
// wider cards, equal tiles across the row on narrow cards, a single action beside the title, the
// run action always in the trailing slot, room cards that keep their own height and end with their
// actions, panel controls that keep their labels beside or below the run state, and 44 px
// targets 8 px apart under a coarse pointer.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named, setCardWidth } = require("../../helpers/browser-helpers.js");

// Dusty vacuums the dining room while a studio job waits that Rocky could start: a waiting row
// with every row action and a running row.
const TWO_ROBOTS = Object.freeze({ recording: "robot_choice", from: "Rocky could start the studio while Dusty cleans" });
const WAITING = "Studio";
const RUNNING = "Dining Room";

// Rocky cleans the studio with the queue running: the panel offers pause and end.
const QUEUE_RUNNING = Object.freeze({ recording: "queue_controls", from: "The library job is next" });

// Boxes of the row shown under `name`, its main button and its action buttons in card
// coordinates.
async function rowGeometry(card, name) {
  return card.evaluate((element, title) => {
    const row = [...element.shadowRoot.querySelectorAll(".voc-job")].find((node) => node.querySelector(".voc-job-title")?.textContent.trim() === title);
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    return { row: box(row), main: box(row.querySelector(".voc-job-main")), actions: [...row.querySelectorAll(".voc-job-actions .voc-button")].map(box) };
  }, name);
}

const gaps = (boxes) => boxes.slice(1).map((box, index) => box.left - boxes[index].right);

test.describe("with a mouse", () => {
  test("wide rows keep their actions inline, 36 px each and set apart", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 900 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
    const { main, actions } = await rowGeometry(card, WAITING);
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
      const card = await mountCard(page, { ...TWO_ROBOTS, width });
      const start = named(card, ".voc-job", WAITING, ".voc-job-actions .voc-button").last();
      await expect(start).toHaveAttribute("data-action", "start-job");
      const cancel = named(card, ".voc-job", RUNNING, ".voc-job-actions .voc-button").last();
      await expect(cancel).toHaveAttribute("data-action", "cancel-job");
      const [a, b] = [await start.boundingBox(), await cancel.boundingBox()];
      expect(Math.abs((a.x + a.width) - (b.x + b.width))).toBeLessThanOrEqual(1);
    });
  }

  test("narrow rows spread several actions over the row and keep a single one beside the title", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 380 });
    const waiting = await rowGeometry(card, WAITING);
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
    const running = await rowGeometry(card, RUNNING);
    expect(running.actions).toHaveLength(1);
    expect(running.actions[0].top).toBeLessThan(running.main.bottom);
    expect(running.actions[0].width).toBeGreaterThanOrEqual(40);
  });

  // LAY-15: a card side by side with a taller one is not stretched; it ends with its actions.
  test("room cards keep their own height and end with their actions", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, width: 680, config: { start_view: "rooms" } });
    const rooms = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-room")].map((room) => {
      const box = room.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(room).paddingBottom);
      return { top: box.top, height: box.height, end: box.bottom - padding - room.querySelector(".voc-room-actions").getBoundingClientRect().bottom };
    }));
    const rows = [...Map.groupBy(rooms, (room) => Math.round(room.top)).values()];
    expect(rows.some((row) => row.length > 1 && new Set(row.map((room) => Math.round(room.height))).size > 1), "a row with cards of different heights").toBe(true);
    for (const room of rooms) expect(Math.abs(room.end), "the actions end the card").toBeLessThanOrEqual(1);
  });

  // The bar belongs to the narrow tier: it appears exactly where the card's inner width (inside its
  // border, the width the container queries see) falls below 560 px.
  test("the bar switches with the narrow tier", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 600, config: { views: ["queue"] } });
    const seen = new Set();
    for (const width of [600, 563, 562, 561, 560, 559, 520]) {
      await setCardWidth(page, width);
      const { main, actions } = await rowGeometry(card, WAITING);
      const bar = actions[0].top >= main.bottom - 1;
      expect(bar, `at ${width}px`).toBe(await card.locator("ha-card").evaluate((node) => node.clientWidth < 560));
      seen.add(bar);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

// LAY-10, LAY-21, UI-24: on every tier the queue controls keep their labels and stay inside the
// panel, and neither they nor the figure cover the run state.
for (const language of ["en", "de"]) {
  test(`the panel's queue controls keep their labels and leave the run state free (${language})`, async ({ page }) => {
    const card = await mountCard(page, { ...QUEUE_RUNNING, width: 900, config: { language } });
    for (const width of [900, 640, 420, 380, 320]) {
      await setCardWidth(page, width);
      const at = await card.evaluate((element) => {
        const box = (node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        };
        const root = element.shadowRoot;
        return {
          panel: box(root.querySelector(".voc-panel")),
          figure: box(root.querySelector(".voc-panel-headline")),
          status: [...root.querySelectorAll(".voc-panel-status > *")].map(box),
          controls: [...root.querySelectorAll(".voc-panel-control .voc-button")].map((node) => ({ ...box(node), label: node.querySelector(".voc-button-label").getBoundingClientRect().width })),
        };
      });
      const apart = (a, b) => a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5;
      expect(at.controls.length, `at ${width}px`).toBe(2);
      expect(at.status.length).toBeGreaterThan(0);
      for (const control of at.controls) {
        expect(control.label, `a labelled control at ${width}px`).toBeGreaterThan(20);
        expect(control.left, `inside the panel at ${width}px`).toBeGreaterThanOrEqual(at.panel.left);
        expect(control.right, `inside the panel at ${width}px`).toBeLessThanOrEqual(at.panel.right);
        expect(apart(control, at.figure), `beside the figure at ${width}px`).toBe(true);
        for (const line of at.status) expect(apart(control, line), `clear of the run state at ${width}px`).toBe(true);
      }
      for (const line of at.status) expect(apart(at.figure, line), `figure and run state at ${width}px`).toBe(true);
    }
  });
}

test.describe("with touch", () => {
  test.use({ hasTouch: true });

  test("every action and control is at least 44 px", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 380 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the engine emulates a coarse pointer").toBe(true);
    for (const name of [WAITING, RUNNING]) {
      const { actions } = await rowGeometry(card, name);
      for (const action of actions) {
        expect(action.width, name).toBeGreaterThanOrEqual(44);
        expect(action.height, name).toBeGreaterThanOrEqual(44);
      }
      if (actions.length > 1) expect(Math.min(...gaps(actions)), name).toBeGreaterThanOrEqual(8);
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

// Target sizes, spacing and positions of row and card actions: the managing icons inline with room
// between them and the main action set apart on wider cards, the main action and the row's menu
// beside the title on narrow cards (LAY-09), room cards that keep their own height and end with
// their actions, waiting rows alike in height, panel controls that keep their labels beside or
// below the run state, and 44 px targets 8 px apart under a coarse pointer.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named, setCardWidth } = require("../../helpers/browser-helpers.js");

// Dusty vacuums the dining room while a studio job waits that Rocky could start: a waiting row
// with every row action and a running row.
const TWO_ROBOTS = Object.freeze({ recording: "robot_choice", from: "Rocky could start the studio while Dusty cleans" });
const WAITING = "Studio";
const RUNNING = "Dining Room";

// Rocky cleans the studio with the queue running: the panel offers pause and end.
const QUEUE_RUNNING = Object.freeze({ recording: "queue_controls", from: "The library job is next" });

// Boxes of the row shown under `name`, its main button and its visible action buttons in card
// coordinates, with their actions.
async function rowGeometry(card, name) {
  return card.evaluate((element, title) => {
    const row = [...element.shadowRoot.querySelectorAll(".voc-job")].find((node) => node.querySelector(".voc-job-title")?.textContent.trim() === title);
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const visible = [...row.querySelectorAll(".voc-job-actions .voc-button")].filter((node) => node.getBoundingClientRect().width > 0);
    return { row: box(row), main: box(row.querySelector(".voc-job-main")), actions: visible.map(box), names: visible.map((node) => node.dataset.action) };
  }, name);
}

const gaps = (boxes) => boxes.slice(1).map((box, index) => box.left - boxes[index].right);

test.describe("with a mouse", () => {
  test("wide rows keep their actions inline, 36 px each and set apart", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 900 });
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
    const { main, actions, names } = await rowGeometry(card, WAITING);
    expect(names).toEqual(["start-job", "move-job", "move-job", "edit-job"]);
    for (const action of actions) {
      expect(action.width).toBeGreaterThanOrEqual(36);
      expect(action.height).toBeGreaterThanOrEqual(36);
      expect(action.top).toBeLessThan(main.bottom);
    }
    const between = gaps(actions);
    expect(Math.min(...between)).toBeGreaterThanOrEqual(4);
    expect(between[0], "the main action is set apart").toBeGreaterThan(between.at(-1));
  });

  // On a wide card the managing icons end every waiting row, so they line up from row to row
  // whether or not a row has a main action.
  test("the managing icons line up from row to row on a wide card", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, width: 900 });
    const released = await rowGeometry(card, "Conservatory");
    const plain = await rowGeometry(card, "Library, thoroughly");
    expect(released.names).toEqual(["open-release", "move-job", "move-job", "edit-job"]);
    expect(plain.names).toEqual(["move-job", "move-job", "edit-job"]);
    for (const offset of [1, 2, 3]) expect(Math.abs(released.actions.at(-offset).left - plain.actions.at(-offset).left)).toBeLessThanOrEqual(1);
  });

  // Beside a main action the texts below the title wrap rather than lose their end, such as the
  // time a job started.
  test("on the narrowest card the progress and status lines wrap instead of being cut", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, width: 320 });
    for (const [title, selector] of [["Studio", ".voc-job-progress-line"], ["Conservatory", ".voc-job-status"]]) {
      const line = named(card, ".voc-job", title, selector);
      await expect(line).toBeVisible();
      const cut = await line.evaluate((node) => [...node.querySelectorAll("*"), node].some((part) => part.scrollWidth > part.clientWidth + 1));
      expect(cut, title).toBe(false);
    }
  });

  // LAY-09: on a narrow card a row keeps its main action and its menu beside the title.
  test("narrow rows keep their main action and the menu beside the title", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 380 });
    const waiting = await rowGeometry(card, WAITING);
    expect(waiting.names).toEqual(["start-job", "toggle-menu"]);
    for (const action of waiting.actions) {
      expect(action.height).toBeGreaterThanOrEqual(36);
      expect(action.top).toBeLessThan(waiting.main.bottom);
    }
    expect(Math.min(...gaps(waiting.actions))).toBeGreaterThanOrEqual(4);
    const running = await rowGeometry(card, RUNNING);
    expect(running.names).toEqual(["cancel-job"]);
    expect(running.actions[0].top).toBeLessThan(running.main.bottom);
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

  // The menu belongs to the narrow tier: it replaces the managing icons exactly where the card's
  // inner width (inside its border, the width the container queries see) falls below 560 px.
  test("the menu replaces the icons with the narrow tier", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 600, config: { views: ["queue"] } });
    const seen = new Set();
    for (const width of [600, 563, 562, 561, 560, 559, 520]) {
      await setCardWidth(page, width);
      const { names } = await rowGeometry(card, WAITING);
      const narrow = await card.locator("ha-card").evaluate((node) => node.clientWidth < 560);
      expect(names, `at ${width}px`).toEqual(narrow ? ["start-job", "toggle-menu"] : ["start-job", "move-job", "move-job", "edit-job"]);
      seen.add(narrow);
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
});

// LAY-21: waiting rows with title, details and readiness are alike in height, with or without a
// chip among the details.
for (const width of [900, 380]) {
  test(`waiting rows of the same kind are equally tall at ${width} px`, async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, width });
    const rows = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll('.voc-job[data-state="queued"]')].map((row) => ({
      title: row.querySelector(".voc-job-title").textContent.trim(),
      chips: row.querySelectorAll(".voc-job-meta .voc-chip").length,
      height: row.getBoundingClientRect().height,
    })));
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.some((row) => row.chips > 0) && rows.some((row) => row.chips === 0), "rows with and without a chip").toBe(true);
    const heights = rows.map((row) => row.height);
    expect(Math.max(...heights) - Math.min(...heights), JSON.stringify(rows)).toBeLessThanOrEqual(1);
  });
}

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

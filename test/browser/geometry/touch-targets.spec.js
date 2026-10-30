// Target sizes, spacing and positions of row and card actions: a row's main action and menu
// beside a title that fits, centred on the row, else below a title across the row, the form
// switching exactly where the title stops fitting (UI-32, LAY-09), room cards of a row equally
// tall and ending with their actions (LAY-15), waiting rows alike in height, panel controls that
// keep their labels beside or below the run state, and 44 px targets 8 px apart under a coarse
// pointer.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named, setCardWidth } = require("../../helpers/browser-helpers.js");

// Dusty vacuums the dining room while a studio job waits that Rocky could start: a waiting row
// with every row action and a running row.
const TWO_ROBOTS = Object.freeze({ recording: "robot_choice", from: "Rocky could start the studio while Dusty cleans" });
const WAITING = "Studio";
const RUNNING = "Dining Room";

// Seven open jobs, one named too long for a line beside its actions: titles that fit and one that
// wraps.
const LONG_TITLE = Object.freeze({ recording: "showcase", from: "Seven jobs are open" });

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
    return { row: box(row), main: box(row.querySelector(".voc-job-main")), title: box(row.querySelector(".voc-job-title")), actions: visible.map(box), names: visible.map((node) => node.dataset.action), form: row.getAttribute("data-title") };
  }, name);
}

const gaps = (boxes) => boxes.slice(1).map((box, index) => box.left - boxes[index].right);

test.describe("with a mouse", () => {
  // UI-32: beside a title that fits, the main action and the menu stand centred on the row.
  for (const width of [700, 380]) {
    test(`rows keep their main action and menu beside a title that fits, centred, 36 px each, at ${width} px`, async ({ page }) => {
      const card = await mountCard(page, { ...TWO_ROBOTS, width });
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);
      const { row, title, actions, names, form } = await rowGeometry(card, WAITING);
      expect(names).toEqual(["start-job", "toggle-menu"]);
      expect(form).toBe("fits");
      for (const action of actions) {
        expect(action.width).toBeGreaterThanOrEqual(36);
        expect(action.height).toBeGreaterThanOrEqual(36);
        expect(action.left, "beside the title").toBeGreaterThanOrEqual(title.right);
        expect(Math.abs((action.top + action.bottom) / 2 - (row.top + row.bottom) / 2), "centred on the row").toBeLessThanOrEqual(1);
      }
      expect(Math.min(...gaps(actions))).toBeGreaterThanOrEqual(4);
      const running = await rowGeometry(card, RUNNING);
      expect(running.names).toEqual(["cancel-job", "toggle-menu"]);
    });
  }

  // UI-32: a row takes its compact form exactly while its title line ends clear of the actions'
  // column; else the title runs across the row above details and actions. Across widths both forms
  // occur, and each holds after a second measure.
  test("a row changes form exactly where its title stops fitting beside its actions", async ({ page }) => {
    const card = await mountCard(page, { ...LONG_TITLE, width: 900, config: { language: "de" } });
    const forms = new Set();
    for (let width = 900; width >= 300; width -= 20) {
      await setCardWidth(page, width);
      const rows = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll(".voc-job")].filter((row) => row.querySelector(".voc-job-actions")).map((row) => {
        const line = row.querySelector(".voc-job-title-line");
        const title = line.querySelector(".voc-job-title");
        const range = document.createRange();
        range.selectNodeContents(title);
        const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        const end = (line.lastElementChild === title ? range : line.lastElementChild).getBoundingClientRect().right;
        const actions = row.querySelector(".voc-job-actions").getBoundingClientRect();
        const titleBox = title.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        return { name: title.textContent, form: row.getAttribute("data-title"), fits: lines === 1 && end <= actions.left - Number.parseFloat(getComputedStyle(row).columnGap) + 0.5, beside: actions.left >= end, centred: Math.abs((actions.top + actions.bottom) / 2 - (rowBox.top + rowBox.bottom) / 2) <= 1, below: actions.top >= titleBox.bottom - 1 };
      }));
      for (const row of rows) {
        forms.add(row.form);
        expect(row.form, `${row.name} at ${width}px`).toBe(row.fits ? "fits" : "wraps");
        if (row.form === "fits") expect([row.beside, row.centred], `${row.name} at ${width}px`).toEqual([true, true]);
        else expect(row.below, `${row.name} at ${width}px`).toBe(true);
      }
    }
    expect([...forms].sort()).toEqual(["fits", "wraps"]);
  });

  // An open row menu lies above the rows below it: each entry is what a tap on it reaches.
  test("an open row menu lies above the actions of the rows below it", async ({ page }) => {
    const card = await mountCard(page, { recording: "long_history", from: "Rocky has cleaned six times", width: 380, config: { start_view: "history" } });
    await card.locator('[data-key="jobs"] .voc-job .voc-menu-button').first().click();
    await expect(card.locator('[role="menu"] [role="menuitem"]')).toHaveCount(3);
    const covered = await card.evaluate((element) => [...element.shadowRoot.querySelectorAll('[role="menu"] [role="menuitem"]')].filter((item) => {
      const box = item.getBoundingClientRect();
      return element.shadowRoot.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('[role="menuitem"]') !== item;
    }).map((item) => item.textContent.trim()));
    expect(covered).toEqual([]);
  });

  // The menu ends every row, so menus line up from row to row whatever main action a row has.
  test("the menus line up from row to row on a medium card", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, width: 700 });
    const released = await rowGeometry(card, "Conservatory");
    const plain = await rowGeometry(card, "Library, thoroughly");
    expect(released.names.at(-1)).toBe("toggle-menu");
    expect(plain.names.at(-1)).toBe("toggle-menu");
    expect(Math.abs(released.actions.at(-1).left - plain.actions.at(-1).left)).toBeLessThanOrEqual(1);
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

  // LAY-15: the cards of a row are equally tall, and each ends with its actions.
  for (const [view, item, actions] of [["rooms", ".voc-room", ".voc-room-actions"], ["templates", ".voc-template", ".voc-template-foot"]]) {
    test(`${view} cards of a row are equally tall and end with their actions`, async ({ page }) => {
      const card = await mountCard(page, { ...BUSY, width: 680, config: { start_view: view } });
      const cards = await card.evaluate((element, [item, actions]) => [...element.shadowRoot.querySelectorAll(item)].map((node) => {
        const box = node.getBoundingClientRect();
        const padding = Number.parseFloat(getComputedStyle(node).paddingBottom);
        return { top: box.top, height: box.height, end: box.bottom - padding - node.querySelector(actions).getBoundingClientRect().bottom };
      }), [item, actions]);
      const rows = [...Map.groupBy(cards, (node) => Math.round(node.top)).values()];
      expect(rows.some((row) => row.length > 1), "a row of several cards").toBe(true);
      for (const row of rows) expect(new Set(row.map((node) => Math.round(node.height))).size, "equally tall").toBe(1);
      for (const node of cards) expect(Math.abs(node.end), "the actions end the card").toBeLessThanOrEqual(1);
    });
  }

  // The row keeps its form across widths: no tier swaps its controls.
  test("a row offers the same controls at every width", async ({ page }) => {
    const card = await mountCard(page, { ...TWO_ROBOTS, width: 600, config: { views: ["queue"] } });
    for (const width of [600, 561, 560, 559, 520]) {
      await setCardWidth(page, width);
      const { names } = await rowGeometry(card, WAITING);
      expect(names, `at ${width}px`).toEqual(["start-job", "toggle-menu"]);
    }
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

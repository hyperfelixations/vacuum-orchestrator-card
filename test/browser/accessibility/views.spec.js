// Accessibility of the views and pages in a real engine: no interactive element inside another,
// pages as named regions, fields with label, error and description, focus that moves into a page
// or card dialog and back to the control that opened it, a dialog that keeps focus while the
// card below it is inert, a confirmation that waits for its answer in place, an off switch at 3:1
// against the card, and controls that never take the error colour.

const { test, expect } = require("../../helpers/playwright.js");
const { BUSY, mountCard, named } = require("../../helpers/browser-helpers.js");

const INTERACTIVE = "button, a[href], input, textarea, select, [role=button], [role=tab], [role=option], [role=radio], [role=switch]";

// Colours of the elements under `selector` (`part` "color", "border" or "background"), each laid
// over the backgrounds below it up to the page, and the backdrop they stand on, as sRGB triples.
function painted(card, selector, part) {
  return card.evaluate((element, [query, which]) => {
    const pixel = (layers) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      for (const layer of layers) {
        context.fillStyle = layer;
        context.fillRect(0, 0, 1, 1);
      }
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const backdrop = (node) => {
      const layers = [];
      for (let at = node; at; at = at.parentElement || at.getRootNode().host) layers.unshift(getComputedStyle(at).backgroundColor);
      return ["#fff", getComputedStyle(document.body).backgroundColor, ...layers];
    };
    return [...element.shadowRoot.querySelectorAll(query)].map((node) => {
      const style = getComputedStyle(node);
      const border = Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none" ? style.borderTopColor : "transparent";
      const own = { color: style.color, border, background: style.backgroundColor }[which];
      const below = backdrop(node.parentElement);
      return { own: pixel([...below, own]), backdrop: pixel(below) };
    });
  }, [selector, part]);
}

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
// Red leads clearly over green and blue: the error colour or a mix of it.
const reddish = ([r, g, b]) => r - Math.max(g, b) > 60;

test("no interactive element sits inside another in any view", async ({ page }) => {
  const card = await mountCard(page, { ...BUSY, config: { views: ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"] } });
  for (const view of ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"]) {
    await card.locator(`[role=tab][data-view="${view}"]`).click();
    await expect(card.locator(`[data-key="view:${view}"]`)).toBeVisible();
    const nested = await card.evaluate((element, selector) => {
      const nodes = [...element.shadowRoot.querySelectorAll(selector)];
      return nodes.filter((node) => nodes.some((other) => other !== node && other.contains(node))).map((node) => node.className || node.tagName);
    }, INTERACTIVE);
    expect(nested, view).toEqual([]);
  }
});

test("the editor is a named region whose fields carry label, error and description", async ({ page }) => {
  const card = await mountCard(page, BUSY);
  await card.locator(".voc-primary-action").click();
  const editor = card.locator('[data-key="overlay:job-editor"]');
  await expect(editor).toHaveAttribute("role", "region");
  await expect(editor).toHaveAccessibleName("New job");
  await expect(card.locator("#voc-overlay-title")).toBeFocused();
  await card.locator('[data-action="save-draft"]').click();
  const rooms = editor.locator('[data-key="field:roomIds"] [role=listbox]');
  await expect(rooms).toHaveAttribute("aria-multiselectable", "true");
  await expect(rooms).toHaveAttribute("aria-invalid", "true");
  await expect(rooms).toHaveAccessibleDescription(/room/i);
  await expect(editor.locator('[data-key="field:roomIds"] .voc-field-error')).toHaveAttribute("role", "alert");
});

// A11Y-02: the dashboard stays usable, so the dialog is not aria-modal; the card below is inert.
test("a card dialog takes focus over an inert card; Escape leaves it and focus returns to the opener", async ({ page }) => {
  const card = await mountCard(page, BUSY);
  const cancel = named(card, ".voc-job", "Studio", '[data-action="cancel-job"]');
  await cancel.focus();
  await page.keyboard.press("Enter");
  const dialog = card.locator('[data-key="overlay:cancel-job"]');
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).not.toHaveAttribute("aria-modal", /.*/);
  await expect(dialog).toHaveAccessibleName("Cancel job?");
  await expect(card.locator("#voc-dialog-title")).toBeFocused();
  for (const part of [".voc-header", ".voc-panel", ".voc-tab-row", ".voc-body"]) await expect(card.locator(part)).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();
  expect(await page.evaluate(() => window.vocHarness.backend.calls.filter((message) => message.type === "call_service").length)).toBe(0);
});

// Deleting a waiting job holds it while the dialog is open, and leaving gives the hold back.
test("a confirmation puts focus on its safe answer", async ({ page }) => {
  const card = await mountCard(page, { recording: "queue_controls", from: "The library job is a template" });
  await named(card, ".voc-job", "Dining Room, Studio, Library, Conservatory", ".voc-job-main").click();
  const remove = card.locator('[data-key="overlay:job-detail"] [data-action="delete-job"]');
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(card.locator('[data-key="overlay:confirm"]')).toHaveAccessibleName("Delete job?");
  await expect(card.locator('.voc-dialog [data-action="back"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card.locator('[data-key="overlay:confirm"]')).toHaveCount(0);
  await expect(remove).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.vocHarness.backend.calls.filter((message) => message.command === "release_job_hold").length)).toBe(1);
});

// UI-16: a confirmation waiting for its answer keeps its layout, and every control in it waits.
test("a confirmation waiting for its answer keeps its place and locks every control", async ({ page }) => {
  const card = await mountCard(page, { recording: "queue_controls", from: "The job for every room stays" });
  await named(card, ".voc-job", "Dining Room, Studio, Library, Conservatory", ".voc-job-main").click();
  await card.locator('[data-key="overlay:job-detail"] [data-action="delete-job"]').click();
  const dialog = card.locator('[data-key="overlay:confirm"]');
  const confirm = dialog.locator('[data-action="confirm-command"]');
  await expect(confirm).toBeEnabled();
  const boxes = () => dialog.evaluate((node) => [node, ...node.querySelectorAll("h2, .voc-dialog-scroll, .voc-dialog-actions, button")].map((part) => {
    const box = part.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height].map(Math.round);
  }));
  const before = await boxes();
  await page.evaluate(() => {
    window.vocRelease = window.vocHarness.backend.hold();
  });
  await confirm.click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  for (const button of await dialog.locator("button").all()) await expect(button).toBeDisabled();
  expect(await boxes()).toEqual(before);
  await page.evaluate(() => window.vocRelease());
  await expect(dialog).toHaveCount(0);
});

test("Tab stays inside a dialog", async ({ page }) => {
  const card = await mountCard(page, BUSY);
  await named(card, ".voc-job", "Studio", '[data-action="cancel-job"]').click();
  const dialog = card.locator('[data-key="overlay:cancel-job"]');
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((node) => node.contains(node.getRootNode().activeElement));
    expect(inside, `after ${step + 1} Tab presses`).toBe(true);
  }
});

test("the choice after a cancel is a named radio group operated with arrow keys", async ({ page }) => {
  const card = await mountCard(page, BUSY);
  await named(card, ".voc-job", "Studio", '[data-action="cancel-job"]').click();
  const group = card.locator('[data-key="overlay:cancel-job"] [role=radiogroup]');
  await expect(group).toHaveAccessibleName("Then");
  const home = group.locator('[data-value="return_to_dock"]');
  await expect(home).toHaveAttribute("aria-checked", "true");
  await expect(group.locator('[tabindex="0"]')).toHaveCount(1);
  await home.focus();
  await page.keyboard.press("ArrowDown");
  const stay = card.locator('[data-key="overlay:cancel-job"] [data-value="stay"]');
  await expect(stay).toHaveAttribute("aria-checked", "true");
  await expect(stay).toBeFocused();
  await expect(stay).toHaveAccessibleName(/Robot stays where it is/);
});

test("role choices in the robot profile are named radio groups", async ({ page }) => {
  const card = await mountCard(page, { recording: "robot_choice", from: "The card opens" });
  await card.locator('[role=tab][data-view="robots"]').click();
  await named(card, ".voc-robot", "Rocky", '[data-action="edit-robot"]').click();
  await card.locator('[data-action="toggle-section"][data-args*="roles"]').click();
  const battery = card.locator('[data-key="role:battery"] [role=radiogroup]');
  await expect(battery).toHaveAccessibleName("Battery");
  await expect(battery).toHaveAccessibleDescription("Found: Rocky Battery");
});

// In a sections grid cell the content scrolls inside the card.
// A11Y-05 (WCAG 1.4.11): an off switch shows its place with an outline and a thumb of at least 3:1
// against the card, light and dark.
for (const scheme of ["light", "dark"]) {
  test(`an off switch stands out at least 3:1 against the card (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const card = await mountCard(page, BUSY);
    await named(card, ".voc-job", "Conservatory", ".voc-job-main").click();
    await card.locator('[data-action="open-save-template"]').click();
    await expect(card.locator(".voc-dialog .voc-switch input")).not.toBeChecked();
    for (const [selector, part] of [[".voc-dialog .voc-switch-track", "border"], [".voc-dialog .voc-switch-thumb", "background"]]) {
      const [{ own, backdrop }] = await painted(card, selector, part);
      expect(contrast(own, backdrop), `${selector} ${part}`).toBeGreaterThanOrEqual(3);
    }
  });
}

// UI-20: the error colour marks errors and destructive actions; the active tab, the queue control
// and the recovery action keep their own accent while the card is in its attention tone.
test("controls never take the error colour of an attention tone", async ({ page }) => {
  const card = await mountCard(page, { recording: "recovery", from: "The job needs clarification" });
  await expect(card.locator(".voc-root")).toHaveAttribute("data-tone", "attention");
  const [pill] = await painted(card, ".voc-status-pill", "color");
  expect(reddish(pill.own), "the pill speaks the attention tone").toBe(true);
  for (const selector of ['[role=tab][aria-selected="true"]', ".voc-queue-control", '[data-action="open-recovery"]']) {
    await expect(card.locator(selector)).toHaveCount(1);
    for (const part of ["color", "border", "background"]) {
      const [{ own }] = await painted(card, selector, part);
      expect(reddish(own), `${selector} ${part}`).toBe(false);
    }
  }
});

test.describe("in a sections grid cell", () => {
  // The focused control's distance to each edge of its region that is faded; an edge without a
  // fade (the region's first or last content shown) reads as clear.
  const focusInView = (card) => card.evaluate((element) => {
    const focused = element.shadowRoot.activeElement;
    const scroller = focused.closest("[data-scroll]");
    const region = scroller.getBoundingClientRect();
    const box = focused.getBoundingClientRect();
    return {
      top: scroller.hasAttribute("data-overflow-top") ? box.top - region.top : Infinity,
      bottom: scroller.hasAttribute("data-overflow-bottom") ? region.bottom - box.bottom : Infinity,
    };
  });

  test("the tab panel is a tab stop and a control reached by Tab stands clear of the faded edges", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, layout: "grid", rows: 7 });
    await card.locator(".voc-primary-action").focus();
    await page.keyboard.press("Tab");
    await expect(card.locator(".voc-body")).toBeFocused();
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press("Tab");
      const { top, bottom } = await focusInView(card);
      expect(top, `after ${step + 1} Tab presses`).toBeGreaterThanOrEqual(16);
      expect(bottom, `after ${step + 1} Tab presses`).toBeGreaterThanOrEqual(16);
    }
    expect(await card.locator(".voc-body").evaluate((body) => body.scrollTop), "focus moved the content").toBeGreaterThan(0);
  });

  test("Tab stays inside a dialog, and Escape returns the view where it was", async ({ page }) => {
    const card = await mountCard(page, { ...BUSY, layout: "grid", rows: 7 });
    const cancel = named(card, ".voc-job", "Studio", '[data-action="cancel-job"]');
    await card.locator(".voc-body").evaluate((body) => { body.scrollTop = 40; });
    await cancel.focus();
    const scrolled = await card.locator(".voc-body").evaluate((body) => body.scrollTop);
    await page.keyboard.press("Enter");
    const dialog = card.locator('[data-key="overlay:cancel-job"]');
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((node) => node.contains(node.getRootNode().activeElement)), `after ${step + 1} Tab presses`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(cancel).toBeFocused();
    expect(await card.locator(".voc-body").evaluate((body) => body.scrollTop)).toBe(scrolled);
  });
});

// Accessibility of the views and pages in a real engine: no interactive element inside another,
// pages as named regions or modal dialogs, fields with label, error and description, focus that
// moves into a page and back to the control that opened it, and a dialog that keeps focus.

const { test, expect } = require("../../helpers/playwright.js");
const { mountCard } = require("../../helpers/browser-helpers.js");

const INTERACTIVE = "button, a[href], input, textarea, select, [role=button], [role=tab], [role=option], [role=radio], [role=switch]";

test("no interactive element sits inside another in any view", async ({ page }) => {
  const card = await mountCard(page, { config: { views: ["queue", "rooms", "robots", "templates", "history", "diagnostics", "setup", "settings"] } });
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
  const card = await mountCard(page);
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

test("a confirmation is a modal dialog; Escape leaves it and focus returns to the opener", async ({ page }) => {
  const card = await mountCard(page);
  const cancel = card.locator('[data-key="job:job-running"] [data-action="cancel-job"]');
  await cancel.focus();
  await page.keyboard.press("Enter");
  const dialog = card.locator('[data-key="overlay:cancel-job"]');
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();
  expect(await page.evaluate(() => window.vocHarness.fake.calls.services.length)).toBe(0);
});

test("Tab stays inside a dialog", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator('[data-key="job:job-running"] [data-action="cancel-job"]').click();
  const dialog = card.locator('[data-key="overlay:cancel-job"]');
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((node) => node.contains(node.getRootNode().activeElement));
    expect(inside, `after ${step + 1} Tab presses`).toBe(true);
  }
});

test("the choice after a cancel is a named radio group operated with arrow keys", async ({ page }) => {
  const card = await mountCard(page);
  await card.locator('[data-key="job:job-running"] [data-action="cancel-job"]').click();
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
  const card = await mountCard(page);
  await card.locator('[role=tab][data-view="robots"]').click();
  await card.locator('[data-key="robot:robot-dusty"] [data-action="edit-robot"]').click();
  await card.locator('[data-action="toggle-section"][data-args*="roles"]').click();
  const battery = card.locator('[data-key="role:battery"] [role=radiogroup]');
  await expect(battery).toHaveAccessibleName("Battery");
  await expect(card.locator('[data-key="role:status"] [role=radiogroup]')).toHaveAccessibleDescription(/Several entities fit/);
});

// In a sections grid cell the content scrolls inside the card.
test.describe("in a sections grid cell", () => {
  // The focused control's box against the part of its region that is not faded.
  const focusInView = (card) => card.evaluate((element) => {
    const focused = element.shadowRoot.activeElement;
    const region = focused.closest("[data-scroll]").getBoundingClientRect();
    const box = focused.getBoundingClientRect();
    return { top: box.top - region.top, bottom: region.bottom - box.bottom };
  });

  test("the tab panel is a tab stop and a control reached by Tab stands clear of the faded edges", async ({ page }) => {
    const card = await mountCard(page, { layout: "grid", rows: 7 });
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
    const card = await mountCard(page, { layout: "grid", rows: 7 });
    const cancel = card.locator('[data-key="job:job-running"] [data-action="cancel-job"]');
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
